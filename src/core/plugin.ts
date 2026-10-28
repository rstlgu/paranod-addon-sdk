import type {
  PluginConfig,
  ConfigSchema,
  TransformConfig,
  AsyncTransformConfig,
  StartOptions,
  ManifestOptions,
  PluginManifest,
  TransformInput,
  TransformResult,
} from './types';
import { ManifestGenerator } from './manifest';
import { JobQueue, type WebhookSecretProvider } from '../jobs/progress';
import { InstallationRegistry } from '../registry/installation';
import type { Server } from '../server/express';
import crypto from 'node:crypto';
import { validateTransformResult } from '../utils/builders';

const MAX_RESULT_ENTITIES = 1000;
const MAX_RESULT_EDGES = 2000;

/**
 * Classe principale per creare plugin PARANOD
 */
export class ParanodPlugin {
  private config: PluginConfig;
  private manifestGenerator: ManifestGenerator;
  private transforms = new Map<string, TransformConfig>();
  private asyncTransforms = new Map<string, AsyncTransformConfig>();
  private configSchema?: ConfigSchema;
  private jobQueue?: JobQueue;
  private server?: Server;
  private webhookSecret?: string;
  private multiTenant = false;
  private secretProvider?: WebhookSecretProvider;
  private registry?: InstallationRegistry;

  constructor(config: PluginConfig) {
    this.config = config;
    this.manifestGenerator = new ManifestGenerator(config);
  }

  /**
   * Definisci schema di configurazione
   */
  configure(schema: ConfigSchema): void {
    this.configSchema = schema;
    this.manifestGenerator.setConfigSchema(schema);
  }

  /**
   * Registra una transform sincrona
   */
  transform(config: TransformConfig): void {
    if (this.transforms.has(config.id) || this.asyncTransforms.has(config.id)) {
      throw new Error(`Transform ${config.id} already registered`);
    }

    this.transforms.set(config.id, config);
    this.manifestGenerator.addTransform(config, false);
  }

  /**
   * Registra una transform asincrona
   */
  asyncTransform(config: AsyncTransformConfig): void {
    if (this.transforms.has(config.id) || this.asyncTransforms.has(config.id)) {
      throw new Error(`Transform ${config.id} already registered`);
    }

    this.asyncTransforms.set(config.id, config);
    this.manifestGenerator.addTransform(config, true);

    // Inizializza job queue se non esiste
    if (!this.jobQueue) {
      if (this.multiTenant && this.secretProvider) {
        this.jobQueue = new JobQueue(this.secretProvider);
      } else if (this.webhookSecret) {
        this.jobQueue = new JobQueue(this.webhookSecret);
      }
    }
  }

  /**
   * Imposta webhook secret (single-tenant mode)
   */
  setWebhookSecret(secret: string): void {
    if (this.multiTenant) {
      throw new Error('Cannot set single webhook secret in multi-tenant mode');
    }

    this.webhookSecret = secret;

    if (this.asyncTransforms.size > 0 && !this.jobQueue) {
      this.jobQueue = new JobQueue(secret);
    }
  }

  /**
   * Abilita multi-tenancy con secret provider
   */
  enableMultiTenant(secretProvider: WebhookSecretProvider): void {
    this.multiTenant = true;
    this.secretProvider = secretProvider;

    // Inizializza registry se il provider è un InstallationRegistry
    if (secretProvider instanceof InstallationRegistry) {
      this.registry = secretProvider;
    } else {
      // Crea registry separato per installazioni
      this.registry = new InstallationRegistry(this.config.id, this.config.version);
    }

    if (this.asyncTransforms.size > 0 && !this.jobQueue) {
      this.jobQueue = new JobQueue(secretProvider);
    }
  }

  /**
   * Abilita multi-tenancy con gestione automatica in-memory
   * Utile per development/testing
   */
  enableMultiTenantInMemory(): InstallationRegistry {
    const registry = new InstallationRegistry(this.config.id, this.config.version);
    this.enableMultiTenant(registry);
    return registry;
  }

  /**
   * Ottieni registry (solo multi-tenant)
   */
  getRegistry(): InstallationRegistry | undefined {
    return this.registry;
  }

  /**
   * Genera manifest JSON
   */
  generateManifest(options: ManifestOptions): PluginManifest {
    return this.manifestGenerator.generate(options);
  }

  /**
   * Esegui una transform (usato internamente)
   */
  async executeTransform(
    transformId: string,
    input: TransformInput
  ): Promise<TransformResult> {
    const transform = this.transforms.get(transformId);

    if (!transform) {
      throw new Error(`Transform ${transformId} not found`);
    }

    const result = await transform.handler(input, input.config || {});
    return this.prepareTransformResult(result, input.entity.id);
  }

  /**
   * Esegui una transform asincrona (usato internamente)
   */
  async executeAsyncTransform(
    transformId: string,
    input: TransformInput,
    callbackUrl: string,
    workspaceId?: string
  ): Promise<{ jobId: string; estimatedTime?: number }> {
    const transform = this.asyncTransforms.get(transformId);

    if (!transform) {
      throw new Error(`Async transform ${transformId} not found`);
    }

    if (!this.jobQueue) {
      throw new Error('Job queue not configured for async transforms');
    }

    // Genera job ID
    const jobId = `${this.config.id}-${transformId}-${crypto.randomUUID()}`;

    // Crea job con supporto multi-tenant
    let job;
    if (this.multiTenant && workspaceId) {
      job = await this.jobQueue.createJobForWorkspace(
        jobId,
        callbackUrl,
        workspaceId
      );
    } else {
      job = this.jobQueue.createJob(jobId, callbackUrl);
    }

    // Esegui transform in background
    setImmediate(async () => {
      try {
        const result = await transform.handler(input, input.config || {}, job);
        await job.complete(this.prepareTransformResult(result, input.entity.id));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        try {
          await job.fail(errorMessage);
        } catch (deliveryError) {
          console.error('Failed to deliver terminal job webhook:', deliveryError);
        }
      } finally {
        this.jobQueue?.removeJob(jobId);
      }
    });

    return { jobId };
  }

  /**
   * Avvia il server plugin
   */
  async start(options: StartOptions): Promise<void> {
    if (options.multiTenant && !options.installationToken) {
      throw new Error(
        'installationToken is required when multiTenant mode is enabled'
      );
    }

    // Se multiTenant option è specificata, abilita multi-tenancy automaticamente
    if (options.multiTenant && !this.multiTenant) {
      if (!options.allowInMemoryStorage) {
        throw new Error(
          'Multi-tenant mode requires persistent installation storage. ' +
          'Call enableMultiTenant() with an InstallationRegistry, or set ' +
          'allowInMemoryStorage only for development/testing.'
        );
      }
      this.enableMultiTenantInMemory();
      console.warn('Multi-tenant mode is using volatile in-memory storage');
    }

    // Import dinamico per evitare dipendenze circolari
    const { ExpressServer } = await import('../server/express');

    this.server = new ExpressServer(this, options);
    await this.server.start();

    console.log(`✅ Plugin "${this.config.name}" running on port ${options.port}`);
    console.log(`   - Mode: ${this.multiTenant ? 'Multi-tenant' : 'Single-tenant'}`);
    console.log(`   - Transforms: ${this.transforms.size + this.asyncTransforms.size}`);
    console.log(`   - Sync: ${this.transforms.size}`);
    console.log(`   - Async: ${this.asyncTransforms.size}`);
  }

  /**
   * Ferma il server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
    }
  }

  /**
   * Ottieni configurazione plugin
   */
  getConfig(): PluginConfig {
    return this.config;
  }

  /**
   * Ottieni lista transforms
   */
  getTransforms(): string[] {
    return Array.from(this.transforms.keys());
  }

  /**
   * Ottieni lista async transforms
   */
  getAsyncTransforms(): string[] {
    return Array.from(this.asyncTransforms.keys());
  }

  /**
   * Ottieni tutte le transforms
   */
  getAllTransforms(): Array<TransformConfig | AsyncTransformConfig> {
    return [
      ...Array.from(this.transforms.values()),
      ...Array.from(this.asyncTransforms.values()),
    ];
  }

  /**
   * Verifica se una transform esiste
   */
  hasTransform(transformId: string): boolean {
    return this.transforms.has(transformId) || this.asyncTransforms.has(transformId);
  }

  /**
   * Verifica se una transform è asincrona
   */
  isAsyncTransform(transformId: string): boolean {
    return this.asyncTransforms.has(transformId);
  }

  /**
   * Ottieni job queue (per monitoring)
   */
  getJobQueue(): JobQueue | undefined {
    return this.jobQueue;
  }

  private prepareTransformResult(
    result: TransformResult,
    inputEntityId: string
  ): TransformResult {
    if (
      result.entities.length > MAX_RESULT_ENTITIES ||
      result.edges.length > MAX_RESULT_EDGES
    ) {
      throw new Error('Transform result exceeds platform limits');
    }
    const validation = validateTransformResult(result, inputEntityId);
    if (!validation.valid) {
      throw new Error(
        `Invalid transform result: ${validation.errors.join('; ')}`
      );
    }
    return { ...result, success: result.success ?? true };
  }

  /**
   * Verifica se è in modalità multi-tenant
   */
  isMultiTenant(): boolean {
    return this.multiTenant;
  }

  /**
   * Ottieni secret provider (solo multi-tenant)
   */
  getSecretProvider(): WebhookSecretProvider | undefined {
    return this.secretProvider;
  }
}

// Export alias per backwards compatibility
export { ParanodPlugin as OSINTPlugin, ParanodPlugin as RelazioPlugin };
