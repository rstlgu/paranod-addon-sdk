import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from 'express';
import http, { type Server as HttpServer } from 'node:http';
import https, { type Server as HttpsServer } from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import type { ParanodPlugin } from '../core/plugin';
import type {
  StartOptions,
  TransformRequest,
  TransformResponse
} from '../core/types';
import { verifyPlatformRequestSignature } from '../security/hmac';

// Keep wire header names stable across the PARANOD rename.
const WORKSPACE_HEADER = 'X-Relazio-Workspace-Id';
const TIMESTAMP_HEADER = 'X-Relazio-Timestamp';
const NONCE_HEADER = 'X-Relazio-Nonce';
const SIGNATURE_HEADER = 'X-Relazio-Signature';

type RawBodyRequest = Request & { rawBody?: string };

const RegistrationSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  workspaceName: z.string().max(200).optional(),
  platformUrl: z.string().url(),
  platformVersion: z.string().max(50).optional()
});

const UnregisterSchema = z.object({
  workspaceId: z.string().min(1).max(200)
});

const MetadataSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 100, {
    message: 'Too many metadata fields'
  });

const TransformRequestSchema = z
  .object({
    transformId: z.string().min(1).max(128),
    input: z
      .object({
        entity: z
          .object({
            id: z.string().min(1).max(256),
            type: z.string().min(1).max(100),
            value: z.string().min(1).max(10_000),
            label: z.string().max(10_000).optional(),
            metadata: MetadataSchema.optional()
          })
          .strict(),
        config: z.record(z.string(), z.unknown()).optional()
      })
      .strict(),
    callbackUrl: z.string().url().max(2048).optional()
  })
  .strict();

const MAX_RESULT_ENTITIES = 1000;
const MAX_RESULT_EDGES = 2000;

/**
 * Secure server-to-server HTTP adapter for PARANOD addons.
 */
export class ExpressServer {
  private app: Express;
  private server?: HttpServer | HttpsServer;
  private readonly nonceCache = new Map<string, number>();
  private readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
  private lastRateLimitPrune = 0;

  constructor(
    private readonly plugin: ParanodPlugin,
    private readonly options: StartOptions
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    const maxBodyBytes = this.options.maxBodyBytes ?? 1024 * 1024;
    this.app.disable('x-powered-by');
    this.app.use(
      express.json({
        limit: maxBodyBytes,
        verify: (req, _res, buffer) => {
          (req as RawBodyRequest).rawBody = buffer.toString('utf8');
        }
      })
    );
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      if (now - this.lastRateLimitPrune >= 60_000) {
        for (const [key, limit] of this.rateLimits) {
          if (limit.resetAt <= now) this.rateLimits.delete(key);
        }
        this.lastRateLimitPrune = now;
      }
      const key = req.ip || req.socket.remoteAddress || 'unknown';
      const current = this.rateLimits.get(key);
      if (!current || current.resetAt <= now) {
        this.rateLimits.set(key, { count: 1, resetAt: now + 60_000 });
        next();
        return;
      }
      current.count += 1;
      if (current.count > 120) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req: Request, res: Response) => {
      const config = this.plugin.getConfig();
      res.json({
        status: 'ok',
        plugin: config.id,
        version: config.version,
        transforms: {
          sync: this.plugin.getTransforms().length,
          async: this.plugin.getAsyncTransforms().length
        }
      });
    });

    if (this.options.multiTenant) {
      this.app.post('/register', async (req: Request, res: Response) => {
        if (!this.verifyInstallationToken(req)) {
          res.status(401).json({ error: 'Invalid installation token' });
          return;
        }

        const parsed = RegistrationSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid registration payload' });
          return;
        }
        const platformUrl = new URL(parsed.data.platformUrl);
        if (
          platformUrl.protocol !== 'https:' &&
          platformUrl.protocol !== 'http:'
        ) {
          res.status(400).json({ error: 'Invalid platform URL protocol' });
          return;
        }

        const registry = this.plugin.getRegistry();
        if (!registry) {
          res.status(501).json({ error: 'Multi-tenant registry unavailable' });
          return;
        }

        try {
          const existing = await registry.getInstallation(
            parsed.data.workspaceId
          );
          if (existing) {
            const workspaceId = await this.authenticatePlatformRequest(req, res);
            if (!workspaceId) return;
            if (workspaceId !== parsed.data.workspaceId) {
              res.status(403).json({ error: 'Workspace mismatch' });
              return;
            }
          }
          res.json(await registry.register(parsed.data));
        } catch (error) {
          console.error('Registration error:', error);
          res.status(500).json({ error: 'Registration failed' });
        }
      });

      this.app.post('/unregister', async (req: Request, res: Response) => {
        const parsed = UnregisterSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid unregister payload' });
          return;
        }

        const workspaceId = await this.authenticatePlatformRequest(req, res);
        if (!workspaceId) return;
        if (workspaceId !== parsed.data.workspaceId) {
          res.status(403).json({ error: 'Workspace mismatch' });
          return;
        }

        const registry = this.plugin.getRegistry();
        if (!registry) {
          res.status(501).json({ error: 'Multi-tenant registry unavailable' });
          return;
        }
        const success = await registry.unregister(workspaceId);
        res.json({ success });
      });

      this.app.get('/stats', async (req: Request, res: Response) => {
        if (!this.options.adminToken || !this.verifyBearer(req, this.options.adminToken)) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        const registry = this.plugin.getRegistry();
        if (!registry) {
          res.status(501).json({ error: 'Multi-tenant registry unavailable' });
          return;
        }
        res.json(await registry.getStats());
      });
    }

    this.app.get('/manifest.json', (req: Request, res: Response) => {
      if (this.options.multiTenant && !this.verifyManifestToken(req)) {
        res.status(401).json({ error: 'Invalid installation token' });
        return;
      }
      try {
        res.json(this.plugin.generateManifest({ endpoint: this.getBaseUrl() }));
      } catch (error) {
        console.error('Manifest generation error:', error);
        res.status(500).json({ error: 'Manifest generation failed' });
      }
    });

    for (const transform of this.plugin.getAllTransforms()) {
      this.app.post(`/${transform.id}`, async (req: Request, res: Response) => {
        try {
          await this.handleTransform(transform.id, req, res);
        } catch (error) {
          console.error(`Transform ${transform.id} error:`, error);
          res.status(500).json({ error: 'Transform execution failed' });
        }
      });
    }

    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found', path: req.path });
    });

    this.app.use(
      (
        error: Error & { status?: number; statusCode?: number; type?: string },
        _req: Request,
        res: Response,
        _next: NextFunction
      ) => {
        console.error('Request error:', error);
        const status =
          error.type === 'entity.too.large'
            ? 413
            : error.status || error.statusCode || 500;
        res.status(status).json({
          error: status === 413 ? 'Payload too large' : 'Internal server error'
        });
      }
    );
  }

  private async handleTransform(
    transformId: string,
    req: Request,
    res: Response
  ): Promise<void> {
    const parsed = TransformRequestSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.transformId !== transformId) {
      res.status(400).json({ error: 'Invalid transform payload' });
      return;
    }
    const body = parsed.data as TransformRequest;

    let workspaceId: string | undefined;
    if (this.plugin.isMultiTenant()) {
      workspaceId =
        (await this.authenticatePlatformRequest(req, res)) || undefined;
      if (!workspaceId) return;
      body.input.workspaceId = workspaceId;
    }

    const isAsync = this.plugin.isAsyncTransform(transformId);
    if (isAsync) {
      if (!body.callbackUrl || !workspaceId) {
        res.status(400).json({ error: 'Missing callbackUrl or workspaceId' });
        return;
      }
      if (!(await this.isAllowedCallbackUrl(body.callbackUrl, workspaceId))) {
        res.status(400).json({ error: 'Callback URL is not registered' });
        return;
      }

      const result = await this.plugin.executeAsyncTransform(
        transformId,
        body.input,
        body.callbackUrl,
        workspaceId
      );
      const response: TransformResponse = {
        async: true,
        jobId: result.jobId,
        estimatedTime: result.estimatedTime,
        message: 'Job queued for processing'
      };
      res.json(response);
      return;
    }

    const result = await this.plugin.executeTransform(transformId, body.input);
    if (
      result.entities.length > MAX_RESULT_ENTITIES ||
      result.edges.length > MAX_RESULT_EDGES
    ) {
      throw new Error('Transform result exceeds platform limits');
    }
    const response: TransformResponse = { async: false, result };
    res.json(response);
  }

  private async authenticatePlatformRequest(
    req: Request,
    res: Response
  ): Promise<string | null> {
    const workspaceId = req.get(WORKSPACE_HEADER);
    const timestamp = req.get(TIMESTAMP_HEADER);
    const nonce = req.get(NONCE_HEADER);
    const signatureHeader = req.get(SIGNATURE_HEADER);
    const rawBody = (req as RawBodyRequest).rawBody;

    if (!workspaceId || !timestamp || !nonce || !signatureHeader || rawBody === undefined) {
      res.status(401).json({ error: 'Missing signed request headers' });
      return null;
    }
    if (!/^\d{10,16}$/.test(timestamp) || !/^[a-f0-9]{32}$/i.test(nonce)) {
      res.status(401).json({ error: 'Invalid signed request metadata' });
      return null;
    }

    const maxAge = this.options.requestMaxAgeMs ?? 5 * 60_000;
    const requestTime = Number(timestamp);
    const now = Date.now();
    if (!Number.isSafeInteger(requestTime) || Math.abs(now - requestTime) > maxAge) {
      res.status(401).json({ error: 'Expired signed request' });
      return null;
    }

    const nonceKey = `${workspaceId}:${nonce}`;
    if (!this.options.requestReplayStore) {
      this.pruneNonceCache(now, maxAge);
    }
    if (!this.options.requestReplayStore && this.nonceCache.has(nonceKey)) {
      res.status(409).json({ error: 'Replayed signed request' });
      return null;
    }

    const registry = this.plugin.getRegistry();
    const secret = await registry?.getSecret(workspaceId);
    if (
      !secret ||
      !verifyPlatformRequestSignature({
        body: rawBody,
        workspaceId,
        timestamp,
        nonce,
        signatureHeader,
        secret
      })
    ) {
      res.status(401).json({ error: 'Invalid request signature' });
      return null;
    }

    if (this.options.requestReplayStore) {
      const consumed = await this.options.requestReplayStore.consume(
        nonceKey,
        now + maxAge
      );
      if (!consumed) {
        res.status(409).json({ error: 'Replayed signed request' });
        return null;
      }
    } else {
      this.nonceCache.set(nonceKey, now);
    }
    await registry?.updateLastUsed(workspaceId);
    return workspaceId;
  }

  private pruneNonceCache(now: number, maxAge: number): void {
    for (const [key, seenAt] of this.nonceCache) {
      if (now - seenAt > maxAge) this.nonceCache.delete(key);
    }
  }

  private async isAllowedCallbackUrl(
    callbackUrl: string,
    workspaceId: string
  ): Promise<boolean> {
    try {
      const installation =
        await this.plugin.getRegistry()?.getInstallation(workspaceId);
      if (!installation) return false;
      const callback = new URL(callbackUrl);
      const platform = new URL(installation.platformUrl);
      const prefix = platform.pathname.replace(/\/$/, '') + '/api/webhooks/transforms/';
      return (
        !callback.username &&
        !callback.password &&
        !callback.search && !callback.hash &&
        callback.origin === platform.origin &&
        callback.pathname.startsWith(prefix) &&
        /^[a-zA-Z0-9_-]+$/.test(callback.pathname.slice(prefix.length))
      );
    } catch {
      return false;
    }
  }

  private verifyManifestToken(req: Request): boolean {
    const token = String(req.query.installToken || req.query.token || '');
    return this.timingSafeTokenEqual(token, this.options.installationToken || '');
  }

  private verifyInstallationToken(req: Request): boolean {
    return this.verifyBearer(req, this.options.installationToken || '');
  }

  private verifyBearer(req: Request, expected: string): boolean {
    const header = req.get('Authorization') || '';
    return this.timingSafeTokenEqual(
      header.startsWith('Bearer ') ? header.slice(7) : '',
      expected
    );
  }

  private timingSafeTokenEqual(actual: string, expected: string): boolean {
    if (!actual || expected.length < 32) return false;
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private getBaseUrl(): string {
    if (this.options.publicUrl) {
      return this.options.publicUrl.replace(/\/+$/, '');
    }
    const protocol = this.options.https ? 'https' : 'http';
    const host =
      !this.options.host || this.options.host === '0.0.0.0'
        ? 'localhost'
        : this.options.host;
    return `${protocol}://${host}:${this.options.port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const listener = () => resolve();
      if (this.options.https) {
        this.server = https.createServer(
          {
            key: fs.readFileSync(this.options.https.key),
            cert: fs.readFileSync(this.options.https.cert)
          },
          this.app
        );
      } else {
        this.server = http.createServer(this.app);
      }
      this.server.once('error', reject);
      this.server.listen(
        this.options.port,
        this.options.host || '0.0.0.0',
        listener
      );
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  getApp(): Express {
    return this.app;
  }
}

export type Server = ExpressServer;
