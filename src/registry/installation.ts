import crypto from 'crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { WebhookSecretProvider } from '../jobs/progress';

/**
 * Workspace installation
 */
export interface Installation {
  workspaceId: string;
  workspaceName?: string;
  webhookSecret: string;
  platformUrl: string;
  platformVersion?: string;
  installedAt: Date;
  lastUsed?: Date;
}

/**
 * Request per registrare un'installazione
 */
export interface RegistrationRequest {
  workspaceId: string;
  workspaceName?: string;
  platformUrl: string;
  platformVersion?: string;
}

/**
 * Response della registrazione
 */
export interface RegistrationResponse {
  webhookSecret: string;
  pluginId: string;
  pluginVersion: string;
  message: string;
}

/**
 * Storage interface per le installazioni
 */
export interface InstallationStorage {
  get(workspaceId: string): Promise<Installation | null>;
  set(workspaceId: string, installation: Installation): Promise<void>;
  delete(workspaceId: string): Promise<boolean>;
  getAll(): Promise<Installation[]>;
}

/**
 * In-memory storage (default)
 * Per produzione usare Redis, Database, etc.
 */
export class MemoryStorage implements InstallationStorage {
  private storage = new Map<string, Installation>();

  async get(workspaceId: string): Promise<Installation | null> {
    return this.storage.get(workspaceId) || null;
  }

  async set(workspaceId: string, installation: Installation): Promise<void> {
    this.storage.set(workspaceId, installation);
  }

  async delete(workspaceId: string): Promise<boolean> {
    return this.storage.delete(workspaceId);
  }

  async getAll(): Promise<Installation[]> {
    return Array.from(this.storage.values());
  }
}

interface EncryptedStorageEnvelope {
  version: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * Encrypted, atomic file storage for single-instance self-hosted addons.
 * Multi-replica deployments should implement InstallationStorage using a
 * shared transactional database.
 */
export class EncryptedFileStorage implements InstallationStorage {
  private readonly key: Buffer;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    encryptionKey: string
  ) {
    if (!filePath) throw new Error('Installation storage path is required');
    if (encryptionKey.length < 32) {
      throw new Error(
        'Installation storage encryption key must be at least 32 characters'
      );
    }
    this.key = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  get(workspaceId: string): Promise<Installation | null> {
    return this.runExclusive(async () => {
      const installations = await this.readAll();
      return installations[workspaceId] || null;
    });
  }

  set(workspaceId: string, installation: Installation): Promise<void> {
    return this.runExclusive(async () => {
      const installations = await this.readAll();
      installations[workspaceId] = installation;
      await this.writeAll(installations);
    });
  }

  delete(workspaceId: string): Promise<boolean> {
    return this.runExclusive(async () => {
      const installations = await this.readAll();
      if (!installations[workspaceId]) return false;
      delete installations[workspaceId];
      await this.writeAll(installations);
      return true;
    });
  }

  getAll(): Promise<Installation[]> {
    return this.runExclusive(async () =>
      Object.values(await this.readAll())
    );
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  private async readAll(): Promise<Record<string, Installation>> {
    let serialized: string;
    try {
      serialized = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      throw error;
    }

    const envelope = JSON.parse(serialized) as EncryptedStorageEnvelope;
    if (
      envelope.version !== 1 ||
      !envelope.iv ||
      !envelope.tag ||
      !envelope.ciphertext
    ) {
      throw new Error('Invalid encrypted installation storage');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(plaintext) as Record<
      string,
      Omit<Installation, 'installedAt' | 'lastUsed'> & {
        installedAt: string;
        lastUsed?: string;
      }
    >;

    return Object.fromEntries(
      Object.entries(parsed).map(([workspaceId, installation]) => [
        workspaceId,
        {
          ...installation,
          installedAt: new Date(installation.installedAt),
          lastUsed: installation.lastUsed
            ? new Date(installation.lastUsed)
            : undefined
        }
      ])
    );
  }

  private async writeAll(
    installations: Record<string, Installation>
  ): Promise<void> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(installations), 'utf8'),
      cipher.final()
    ]);
    const envelope: EncryptedStorageEnvelope = {
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };

    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(envelope), {
      encoding: 'utf8',
      mode: 0o600
    });
    await fs.rename(temporaryPath, this.filePath);
    await fs.chmod(this.filePath, 0o600);
  }
}

/**
 * Registry per gestire installazioni multi-tenant
 */
export class InstallationRegistry implements WebhookSecretProvider {
  private storage: InstallationStorage;
  private pluginId: string;
  private pluginVersion: string;

  constructor(pluginId: string, pluginVersion: string, storage?: InstallationStorage) {
    this.pluginId = pluginId;
    this.pluginVersion = pluginVersion;
    this.storage = storage || new MemoryStorage();
  }

  /**
   * Implementazione WebhookSecretProvider
   * Richiesto dalla JobQueue per supporto multi-tenant
   */
  async getSecret(workspaceId: string): Promise<string | null> {
    const installation = await this.storage.get(workspaceId);
    return installation?.webhookSecret || null;
  }

  /**
   * Registra una nuova installazione
   */
  async register(req: RegistrationRequest): Promise<RegistrationResponse> {
    const { workspaceId, workspaceName, platformUrl, platformVersion } = req;
    if (!workspaceId || !/^[a-zA-Z0-9_-]{1,200}$/.test(workspaceId) || !platformUrl) {
      throw new Error('workspaceId and platformUrl are required');
    }
    const platform = new URL(platformUrl);
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(platform.hostname);
    if (platform.username || platform.password || platform.search || platform.hash ||
        (platform.protocol !== 'https:' && !(local && platform.protocol === 'http:'))) {
      throw new Error('platformUrl must be HTTPS (loopback HTTP is allowed in development only)');
    }
    const normalizedPlatformUrl = platform.toString().replace(/\/+$/, '');

    console.log(`[REGISTRY] Registration request from workspace: ${workspaceId}`);

    const existing = await this.storage.get(workspaceId);
    const webhookSecret = this.generateSecret();

    const installation: Installation = {
      workspaceId,
      workspaceName,
      webhookSecret,
      platformUrl: normalizedPlatformUrl,
      platformVersion,
      installedAt: existing?.installedAt || new Date(),
    };

    await this.storage.set(workspaceId, installation);

    console.log(`[REGISTRY] Registered workspace ${workspaceId}`);

    return {
      webhookSecret,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      message: existing
        ? 'Workspace registration rotated successfully'
        : 'Workspace registered successfully',
    };
  }

  /**
   * Ottieni webhook secret per un'organizzazione
   */
  async getWebhookSecret(workspaceId: string): Promise<string | null> {
    const installation = await this.storage.get(workspaceId);
    return installation?.webhookSecret || null;
  }

  async getInstallation(workspaceId: string): Promise<Installation | null> {
    return this.storage.get(workspaceId);
  }

  /**
   * Aggiorna timestamp ultimo uso
   */
  async updateLastUsed(workspaceId: string): Promise<void> {
    const installation = await this.storage.get(workspaceId);
    if (installation) {
      installation.lastUsed = new Date();
      await this.storage.set(workspaceId, installation);
    }
  }

  /**
   * Rimuovi un'installazione
   */
  async unregister(workspaceId: string): Promise<boolean> {
    const deleted = await this.storage.delete(workspaceId);
    if (deleted) {
      console.log(`[REGISTRY] Workspace ${workspaceId} unregistered`);
    }
    return deleted;
  }

  /**
   * Ottieni tutte le installazioni
   */
  async getAllInstallations(): Promise<Installation[]> {
    return this.storage.getAll();
  }

  /**
   * Ottieni statistiche
   */
  async getStats(): Promise<{
    totalInstallations: number;
    activeInstallations: number; // usati negli ultimi 30 giorni
  }> {
    const all = await this.storage.getAll();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const active = all.filter((inst) => {
      const lastUsed = inst.lastUsed?.getTime() || inst.installedAt.getTime();
      return lastUsed > thirtyDaysAgo;
    });

    return {
      totalInstallations: all.length,
      activeInstallations: active.length,
    };
  }

  /**
   * Genera secret sicuro
   */
  private generateSecret(): string {
    return `whs_${crypto.randomBytes(32).toString('hex')}`;
  }
}
