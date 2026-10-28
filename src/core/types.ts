/**
 * Tipi core per PARANOD Plugin SDK
 */

// Kept in sync with the platform's entity types
// (Paranod: src/features/osint/entity-types.ts). Addon transforms may emit any of
// these; unknown strings are coerced to 'custom' by the platform.
export type EntityType =
  | 'email'
  | 'domain'
  | 'ip'
  | 'person'
  | 'username'
  | 'phone'
  | 'organization'
  | 'hash'
  | 'credential'
  | 'user_id'
  | 'device_id'
  | 'mac_address'
  | 'asn'
  | 'hostname'
  | 'subdomain'
  | 'ssl_certificate'
  | 'whois_record'
  | 'social'
  | 'instagram_user'
  | 'instagram_post'
  | 'telegram_user'
  | 'telegram_channel'
  | 'telegram_group'
  | 'telegram_bot'
  | 'facebook_user'
  | 'facebook_group'
  | 'twitter_user'
  | 'twitter_post'
  | 'linkedin_profile'
  | 'github_user'
  | 'github_repo'
  | 'gitlab_user'
  | 'youtube_channel'
  | 'youtube_video'
  | 'tiktok_user'
  | 'tiktok_video'
  | 'reddit_user'
  | 'reddit_post'
  | 'discord_user'
  | 'discord_server'
  | 'whatsapp_number'
  | 'signal_number'
  | 'slack_workspace'
  | 'slack_channel'
  | 'document'
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'txt'
  | 'csv'
  | 'json'
  | 'note'
  | 'media_url'
  | 'location'
  | 'maps'
  | 'address'
  | 'url'
  | 'dns_record'
  | 'http_request'
  | 'http_response'
  | 'wallet'
  | 'wallet_eth'
  | 'wallet_btc'
  | 'wallet_ltc'
  | 'wallet_tron'
  | 'wallet_solana'
  | 'transaction'
  | 'exchange'
  | 'bank_account'
  | 'iban'
  | 'credit_card'
  | 'paypal_account'
  | 'stripe_customer'
  | 'ai_insight'
  | 'breach'
  | 'leak'
  | 'custom';

export type PluginCategory =
  | 'network'
  | 'identity'
  | 'media'
  | 'location'
  | 'blockchain'
  | 'ai'
  | 'osint'
  | 'social'
  | 'documents'
  | 'financial' // legacy alias
  | 'security' // legacy alias
  | 'other';

export type JobStatus =
  | 'pending'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

/**
 * Entità OSINT (formato esterno - con ID obbligatorio)
 */
export interface OSINTEntity {
  id: string;          // OBBLIGATORIO - ID univoco generato
  type: EntityType;    // OBBLIGATORIO - Tipo entità
  value: string;       // OBBLIGATORIO - Valore breve dell'entità
  label?: string;      // OPZIONALE - Testo visualizzato (default: value)
  metadata?: Record<string, any>; // OPZIONALE - Metadata addizionali
}

/**
 * Arco/connessione tra entità (formato esterno)
 */
export interface OSINTEdge {
  id: string;           // OBBLIGATORIO - ID univoco edge
  sourceId: string;     // OBBLIGATORIO - ID entità sorgente
  targetId: string;     // OBBLIGATORIO - ID entità target
  label: string;        // OBBLIGATORIO - Label visibile
  relationship?: string; // OPZIONALE - Tipo relazione (default: label)
  metadata?: Record<string, any>; // OPZIONALE - Metadata addizionali
}

/**
 * Input per una transform
 */
export interface TransformInput {
  entity: OSINTEntity; // Ora include già l'ID obbligatorio
  config?: Record<string, any>;
  workspaceId?: string;
}

/**
 * Risultato di una transform
 */
export interface TransformResult {
  success?: boolean;
  entities: OSINTEntity[];
  edges: OSINTEdge[];
  metadata?: Record<string, any>;
  message?: string;
}

/**
 * Configurazione del plugin
 */
export interface PluginConfig {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: PluginCategory;
  icon?: string;
  logoUrl?: string;
  homepage?: string;
  documentation?: string;
  license?: string;
}

/**
 * Schema di configurazione utente
 */
export interface ConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  default?: any;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string }>;
}

export interface ConfigSchema {
  [key: string]: ConfigField;
}

/**
 * Configurazione di una transform
 */
export interface TransformConfig {
  id: string;
  name: string;
  description: string;
  inputType: EntityType;
  outputTypes: EntityType[];
  handler: TransformHandler;
}

/**
 * Configurazione di una transform asincrona
 */
export interface AsyncTransformConfig {
  id: string;
  name: string;
  description: string;
  inputType: EntityType;
  outputTypes: EntityType[];
  handler: AsyncTransformHandler;
}

/**
 * Handler per transform sincrona
 */
export type TransformHandler = (
  input: TransformInput,
  config: Record<string, any>
) => Promise<TransformResult>;

/**
 * Handler per transform asincrona
 */
export type AsyncTransformHandler = (
  input: TransformInput,
  config: Record<string, any>,
  job: JobContext
) => Promise<TransformResult>;

/**
 * Contesto del job per transform asincrone
 */
export interface JobContext {
  jobId: string;
  updateProgress: (progress: number, message?: string) => Promise<void>;
  cancel: () => Promise<void>;
}

export interface RequestReplayStore {
  /**
   * Atomically records a key until expiresAt.
   * Returns false when the key was already present.
   */
  consume(key: string, expiresAt: number): Promise<boolean>;
}

/**
 * Opzioni per avviare il server
 */
export interface StartOptions {
  port: number;
  host?: string;
  /** Public HTTPS origin used in manifest endpoints and callback validation. */
  publicUrl?: string;
  https?: {
    key: string;
    cert: string;
  };
  multiTenant?: boolean;
  /** Development/testing only. Production should configure persistent storage. */
  allowInMemoryStorage?: boolean;
  /** Required in multi-tenant mode; protects manifest and registration. */
  installationToken?: string;
  /** Optional bearer token protecting the operational /stats endpoint. */
  adminToken?: string;
  maxBodyBytes?: number;
  requestMaxAgeMs?: number;
  /** Required for replay protection shared by multiple addon replicas. */
  requestReplayStore?: RequestReplayStore;
}

/**
 * Opzioni per generare il manifest
 */
export interface ManifestOptions {
  endpoint: string;
  tags?: string[];
  minimumPlatformVersion?: string;
}

/**
 * Manifest JSON completo
 */
export interface PluginManifest {
  manifestVersion: string;
  plugin: {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    authorUrl?: string;
    homepage?: string;
    documentation?: string;
    license?: string;
    icon?: string;
    logoUrl?: string;
    category: PluginCategory;
    capabilities: {
      inputTypes: EntityType[];
      outputTypes: EntityType[];
      estimatedTime: string;
      supportsAsync: boolean;
    };
    configuration?: {
      required: boolean;
      schema: ConfigSchema;
    };
    transforms: Array<{
      id: string;
      name: string;
      description: string;
      inputType: EntityType;
      outputTypes: EntityType[];
      endpoint: string;
      method: string;
      async: boolean;
    }>;
    metadata: {
      tags: string[];
      minimumPlatformVersion: string;
    };
  };
}

/**
 * Webhook payload dal plugin alla piattaforma
 */
export interface WebhookPayload {
  eventId: string;
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  progressMessage?: string;
  result?: TransformResult;
  error?: string;
  timestamp: string;
}

/**
 * Request body per transform
 */
export interface TransformRequest {
  transformId: string;
  input: TransformInput;
  callbackUrl: string;
}

/**
 * Response per transform sincrona
 */
export interface SyncTransformResponse {
  async: false;
  result: TransformResult;
}

/**
 * Response per transform asincrona
 */
export interface AsyncTransformResponse {
  async: true;
  jobId: string;
  estimatedTime?: number;
  message?: string;
}

export type TransformResponse = SyncTransformResponse | AsyncTransformResponse;
