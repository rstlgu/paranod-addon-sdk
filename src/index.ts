/**
 * PARANOD Plugin SDK
 * SDK ufficiale per creare plugin esterni per PARANOD
 */

// Core exports
export { ParanodPlugin, ParanodPlugin as RelazioPlugin, OSINTPlugin } from './core/plugin';
export { ManifestGenerator } from './core/manifest';

// Types
export type {
  EntityType,
  PluginCategory,
  JobStatus,
  OSINTEntity,
  OSINTEdge,
  TransformInput,
  TransformResult,
  PluginConfig,
  ConfigField,
  ConfigSchema,
  TransformConfig,
  AsyncTransformConfig,
  TransformHandler,
  AsyncTransformHandler,
  JobContext,
  RequestReplayStore,
  StartOptions,
  ManifestOptions,
  PluginManifest,
  WebhookPayload,
  TransformRequest,
  SyncTransformResponse,
  AsyncTransformResponse,
  TransformResponse,
} from './core/types';

// Security
export {
  HMACUtils,
  buildRequestCanonicalPayload,
  verifyPlatformRequestSignature,
  verifyWebhookSignature
} from './security/hmac';

// Jobs
export { JobProgressTracker, JobQueue, InMemorySecretProvider } from './jobs/progress';
export type { WebhookSecretProvider } from './jobs/progress';

// Registry & Multi-tenant
export {
  InstallationRegistry,
  MemoryStorage,
  EncryptedFileStorage
} from './registry/installation';
export type {
  Installation,
  RegistrationRequest,
  RegistrationResponse,
  InstallationStorage
} from './registry/installation';

// Server
export { ExpressServer } from './server/express';
export type { Server } from './server/express';

// Utils - Entity & Edge Builders
export {
  // Core builders (scalabili e dinamici)
  createEntity,
  createEdge,
  EntityBuilder,
  EdgeBuilder,
  // Validazione
  validateEntities,
  validateEdges,
  validateTransformResult,
} from './utils/builders';

// Utils - ID Generation
export {
  generateEntityId,
  generateEdgeId,
  generateRandomId,
  normalizeValue,
  isValidEntityId,
  isValidEdgeId,
} from './utils/id-generator';

// Utils - Result Builder
export {
  ResultBuilder,
  emptyResult,
  errorResult,
  singleEntityResult,
  multiEntityResult,
} from './utils/result-builder';
