import type { JobContext, WebhookPayload } from '../core/types';
import { HMACUtils } from '../security/hmac';
import crypto from 'node:crypto';

/**
 * Implementazione del contesto job per transform asincrone
 */
export class JobProgressTracker implements JobContext {
  jobId: string;
  private callbackUrl: string;
  private hmac: HMACUtils;
  private currentProgress = 0;

  constructor(jobId: string, callbackUrl: string, webhookSecret: string) {
    this.jobId = jobId;
    this.callbackUrl = callbackUrl;
    this.hmac = new HMACUtils(webhookSecret);
  }

  /**
   * Aggiorna il progresso del job
   */
  async updateProgress(progress: number, message?: string): Promise<void> {
    this.currentProgress = Math.min(100, Math.max(0, progress));

    await this.sendWebhook({
      eventId: crypto.randomUUID(),
      jobId: this.jobId,
      status: 'processing',
      progress: this.currentProgress,
      progressMessage: message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Marca il job come completato
   */
  async complete(result: any): Promise<void> {
    await this.sendWebhook({
      eventId: crypto.randomUUID(),
      jobId: this.jobId,
      status: 'completed',
      progress: 100,
      result,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Marca il job come fallito
   */
  async fail(error: string): Promise<void> {
    await this.sendWebhook({
      eventId: crypto.randomUUID(),
      jobId: this.jobId,
      status: 'failed',
      error,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Cancella il job
   */
  async cancel(): Promise<void> {
    // TODO: Implementare logica di cancellazione
    console.log(`Job ${this.jobId} cancellation requested`);
  }

  /**
   * Invia webhook alla piattaforma
   */
  private async sendWebhook(payload: WebhookPayload): Promise<void> {
    // Bind the signed event to the platform job, not the SDK's internal job ID.
    const platformJobId = new URL(this.callbackUrl).pathname.split('/').pop();
    const body = JSON.stringify({ ...payload, jobId: platformJobId });
    const signature = this.hmac.generateHeader(body);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(this.callbackUrl, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'Content-Type': 'application/json',
            'X-Plugin-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) return;
        lastError = new Error(
          `Webhook failed: ${response.status} ${response.statusText}`
        );
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Webhook request failed');
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    throw lastError || new Error('Webhook delivery failed');
  }
}

/**
 * Provider per webhook secrets multi-tenant
 */
export interface WebhookSecretProvider {
  getSecret(workspaceId: string): Promise<string | null>;
}

/**
 * Provider in-memory (per sviluppo/testing)
 */
export class InMemorySecretProvider implements WebhookSecretProvider {
  private secrets = new Map<string, string>();

  setSecret(workspaceId: string, secret: string): void {
    this.secrets.set(workspaceId, secret);
  }

  async getSecret(workspaceId: string): Promise<string | null> {
    return this.secrets.get(workspaceId) || null;
  }
}

/**
 * Job queue per gestire transform asincrone (multi-tenant)
 */
export class JobQueue {
  private activeJobs = new Map<string, JobProgressTracker>();
  private webhookSecret?: string; // Single-tenant (legacy)
  private secretProvider?: WebhookSecretProvider; // Multi-tenant

  constructor(webhookSecretOrProvider?: string | WebhookSecretProvider) {
    if (typeof webhookSecretOrProvider === 'string') {
      // Single-tenant mode (legacy)
      this.webhookSecret = webhookSecretOrProvider;
    } else if (webhookSecretOrProvider) {
      // Multi-tenant mode
      this.secretProvider = webhookSecretOrProvider;
    }
  }

  /**
   * Crea un nuovo job (single-tenant)
   */
  createJob(jobId: string, callbackUrl: string): JobProgressTracker {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured for single-tenant mode');
    }
    const job = new JobProgressTracker(jobId, callbackUrl, this.webhookSecret);
    this.activeJobs.set(jobId, job);
    return job;
  }

  /**
   * Crea un nuovo job (multi-tenant)
   */
  async createJobForWorkspace(
    jobId: string,
    callbackUrl: string,
    workspaceId: string
  ): Promise<JobProgressTracker> {
    if (!this.secretProvider) {
      throw new Error('Secret provider not configured for multi-tenant mode');
    }

    const secret = await this.secretProvider.getSecret(workspaceId);
    if (!secret) {
      throw new Error(`Webhook secret not found for workspace: ${workspaceId}`);
    }

    const job = new JobProgressTracker(jobId, callbackUrl, secret);
    this.activeJobs.set(jobId, job);
    return job;
  }

  /**
   * Ottieni un job esistente
   */
  getJob(jobId: string): JobProgressTracker | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * Rimuovi un job completato
   */
  removeJob(jobId: string): void {
    this.activeJobs.delete(jobId);
  }

  /**
   * Conta job attivi
   */
  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Verifica se è multi-tenant
   */
  isMultiTenant(): boolean {
    return !!this.secretProvider;
  }
}
