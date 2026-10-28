import {
  EncryptedFileStorage,
  InstallationRegistry,
  ParanodPlugin,
  ResultBuilder,
  createEntity
} from '../../src';

const pluginId = 'multi-tenant-plugin';
const pluginVersion = '1.0.0';
const installationToken = process.env.ADDON_INSTALL_TOKEN;
const storageKey = process.env.ADDON_STORAGE_ENCRYPTION_KEY;

if (!installationToken || installationToken.length < 32) {
  throw new Error('ADDON_INSTALL_TOKEN must be at least 32 characters');
}
if (!storageKey || storageKey.length < 32) {
  throw new Error(
    'ADDON_STORAGE_ENCRYPTION_KEY must be at least 32 characters'
  );
}

const plugin = new ParanodPlugin({
  id: pluginId,
  name: 'Multi-Tenant Plugin',
  version: pluginVersion,
  author: 'PARANOD Team',
  description: 'Minimal secure multi-tenant addon example',
  category: 'network'
});

plugin.transform({
  id: 'lookup-ip',
  name: 'Lookup IP',
  description: 'Returns a sample location for an IP address',
  inputType: 'ip',
  outputTypes: ['location'],
  async handler(input) {
    const location = createEntity('location', 'Mountain View, US', {
      metadata: {
        source: 'multi-tenant-example',
        workspaceId: input.workspaceId
      }
    });
    return new ResultBuilder(input)
      .addEntity(location, 'located in', {
        relationship: 'geolocation'
      })
      .build();
  }
});

plugin.enableMultiTenant(
  new InstallationRegistry(
    pluginId,
    pluginVersion,
    new EncryptedFileStorage(
      process.env.ADDON_STORAGE_PATH || './data/installations.enc',
      storageKey
    )
  )
);

void plugin.start({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL,
  multiTenant: true,
  installationToken
});
