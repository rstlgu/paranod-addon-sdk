import type {
  PluginManifest,
  PluginConfig,
  ConfigSchema,
  TransformConfig,
  AsyncTransformConfig,
  ManifestOptions,
  EntityType,
} from '../core/types';

/**
 * Genera manifest JSON valido per la piattaforma PARANOD
 */
export class ManifestGenerator {
  private config: PluginConfig;
  private transforms: Array<{
    config: TransformConfig | AsyncTransformConfig;
    async: boolean;
  }> = [];
  private configSchema?: ConfigSchema;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  setConfigSchema(schema: ConfigSchema): void {
    this.configSchema = schema;
  }

  addTransform(
    transform: TransformConfig | AsyncTransformConfig,
    isAsync = false
  ): void {
    this.transforms.push({ config: transform, async: isAsync });
  }

  /**
   * Genera manifest completo
   */
  generate(options: ManifestOptions): PluginManifest {
    if (this.transforms.length === 0) {
      throw new Error('At least one transform is required');
    }

    // Allow HTTP for localhost/development, require HTTPS for production
    const url = new URL(options.endpoint);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0';

    if (!options.endpoint.startsWith('https://') && !isLocalhost) {
      throw new Error('Endpoint must use HTTPS (except for localhost development)');
    }

    // Raccogli tutti gli input/output types
    const inputTypes = new Set<EntityType>();
    const outputTypes = new Set<EntityType>();
    let hasAsync = false;

    for (const { config: transform, async: isAsync } of this.transforms) {
      inputTypes.add(transform.inputType);
      transform.outputTypes.forEach((type) => outputTypes.add(type));
      if (isAsync) hasAsync = true;
    }

    const manifest: PluginManifest = {
      manifestVersion: '1.0',
      plugin: {
        id: this.config.id,
        name: this.config.name,
        description: this.config.description,
        version: this.config.version,
        author: this.config.author,
        homepage: this.config.homepage,
        documentation: this.config.documentation,
        license: this.config.license || 'MIT',
        icon: this.config.icon,
        logoUrl: this.config.logoUrl,
        category: this.config.category,
        capabilities: {
          inputTypes: Array.from(inputTypes),
          outputTypes: Array.from(outputTypes),
          estimatedTime: hasAsync ? 'minutes' : 'seconds',
          supportsAsync: hasAsync,
        },
        transforms: this.transforms.map(({ config: transform, async }) => ({
          id: transform.id,
          name: transform.name,
          description: transform.description,
          inputType: transform.inputType,
          outputTypes: transform.outputTypes,
          endpoint: `${options.endpoint}/${transform.id}`,
          method: 'POST',
          async,
        })),
        metadata: {
          tags: options.tags || [],
          minimumPlatformVersion: options.minimumPlatformVersion || '2.0.0',
        },
      },
    };

    // Aggiungi configurazione se presente
    if (this.configSchema && Object.keys(this.configSchema).length > 0) {
      manifest.plugin.configuration = {
        required: Object.values(this.configSchema).some((field) => field.required),
        schema: this.configSchema,
      };
    }

    return manifest;
  }

  /**
   * Genera manifest come JSON string
   */
  generateJSON(options: ManifestOptions, indent = 2): string {
    const manifest = this.generate(options);
    return JSON.stringify(manifest, null, indent);
  }
}
