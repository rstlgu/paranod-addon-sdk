/* Runnable from a built SDK checkout; no external provider calls. */
'use strict';
const path = require('node:path');
const {
  ParanodPlugin, EncryptedFileStorage, InstallationRegistry,
  EncryptedFilePollingJobStorage, ResultBuilder, createEntity,
} = require('../../dist');

function secret(name) {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

async function main() {
  const token = secret('ADDON_INSTALL_TOKEN');
  const key = secret('ADDON_STORAGE_ENCRYPTION_KEY');
  if (key === token) throw new Error('Generate independent installation and encryption secrets');
  if (!process.env.PUBLIC_URL) throw new Error('Set PUBLIC_URL to the reachable addon origin');
  const publicUrl = new URL(process.env.PUBLIC_URL);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password ||
      publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('PUBLIC_URL must be an HTTP(S) origin without credentials, path or query');
  }
  const port = Number(process.env.PORT || 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const dataDir = path.resolve(process.env.ADDON_DATA_DIR || './data');
  const id = 'demo-polling-addon';
  const version = '1.0.0';
  const plugin = new ParanodPlugin({
    id, version, name: 'Demo polling addon', author: 'Paranod contributors',
    description: 'Synthetic polling demonstration. Does not discover real domains.',
    category: 'network',
  });
  plugin.asyncTransform({
    id: 'create-demo-subdomain', name: 'Create demo subdomain',
    description: 'Creates a synthetic api subdomain; no DNS or OSINT lookup is performed.',
    inputType: 'domain', outputTypes: ['domain'],
    async handler(input, _config, job) {
      await job.updateProgress(25, 'Preparing synthetic example');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const domain = createEntity('domain', `api.${input.entity.value}`, {
        metadata: { demo: true, source: 'Synthetic SDK example; not verified evidence' },
      });
      await job.updateProgress(90, 'Storing demo result');
      return new ResultBuilder(input)
        .addEntity(domain, 'synthetic example', { relationship: 'demo' })
        .setMessage('Demo only: generated one synthetic domain without a network lookup.')
        .build();
    },
  });
  plugin.enableMultiTenant(new InstallationRegistry(id, version,
    new EncryptedFileStorage(path.join(dataDir, 'installations.enc'), key)));
  plugin.setPollingJobStorage(new EncryptedFilePollingJobStorage(path.join(dataDir, 'jobs.enc'), key));
  await plugin.start({
    port, host: process.env.HOST || '127.0.0.1', publicUrl: publicUrl.origin,
    multiTenant: true, installationToken: token,
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
