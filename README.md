# Paranod Addon SDK

TypeScript SDK for external addons for the [Paranod open-source OSINT framework](https://github.com/rstlgu/paranod).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Security Contract

SDK 0.4 implements the platform addon protocol:

- personalized manifest and registration tokens;
- HMAC-SHA256 signed transform and unregister requests;
- timestamp and nonce replay protection;
- isolated webhook secrets per workspace;
- callback origin validation;
- idempotent webhook event IDs;
- bounded request bodies and transform results;
- encrypted persistent storage for single-instance deployments.

Do not expose transform routes through an adapter that bypasses the SDK server.

## Install

Use Node.js 22 or newer. Build a package directly from this repository:

```bash
git clone https://github.com/rstlgu/paranod-addon-sdk.git
cd paranod-addon-sdk
npm ci
npm pack
```

Then install the generated `paranod-plugin-sdk-0.4.0.tgz` in your addon project:

```bash
npm install /absolute/path/to/paranod-plugin-sdk-0.4.0.tgz
```

The import name remains `@paranod/plugin-sdk`. This repository release does not
require a package published to npm. The `prepare` script also supports installation
from Git; pin a commit when using that approach.

## Minimal Addon

```typescript
import {
  EncryptedFileStorage,
  InstallationRegistry,
  ParanodPlugin,
  ResultBuilder,
  createEntity
} from '@paranod/plugin-sdk';

const pluginId = 'domain-lookup';
const pluginVersion = '1.0.0';

const plugin = new ParanodPlugin({
  id: pluginId,
  name: 'Domain Lookup',
  version: pluginVersion,
  author: 'Your Company',
  description: 'Resolves domains to IP addresses',
  category: 'network'
});

plugin.transform({
  id: 'resolve-domain',
  name: 'Resolve Domain',
  description: 'Returns the resolved IP address',
  inputType: 'domain',
  outputTypes: ['ip'],
  async handler(input) {
    const ip = createEntity('ip', '203.0.113.10');
    return new ResultBuilder(input)
      .addEntity(ip, 'resolves to', { relationship: 'resolves_to' })
      .build();
  }
});

const storage = new EncryptedFileStorage(
  process.env.ADDON_STORAGE_PATH || './data/installations.enc',
  process.env.ADDON_STORAGE_ENCRYPTION_KEY!
);
plugin.enableMultiTenant(
  new InstallationRegistry(pluginId, pluginVersion, storage)
);

await plugin.start({
  port: 3001,
  host: '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL,
  multiTenant: true,
  installationToken: process.env.ADDON_INSTALL_TOKEN,
  adminToken: process.env.ADDON_ADMIN_TOKEN
});
```

Both `ADDON_INSTALL_TOKEN` and `ADDON_STORAGE_ENCRYPTION_KEY` should be
independent random values of at least 32 characters. Production `PUBLIC_URL`
should be an HTTPS origin.

## Installation isolation and compatibility

`multiTenant: true` enables registration and signed requests for each connecting
Paranod workspace. Use it even when connecting a single self-hosted instance:
the registry separates its credentials from those of any other installation.
It does not require a hosted service, subscription, billing system or credit balance.
The SDK does not generate platform pricing fields in addon manifests.

The existing `X-Relazio-*` request headers and `RelazioPlugin` export alias are
retained for protocol and source compatibility with existing addons. New code
should use `ParanodPlugin`.

## Storage Modes

### Single Instance

`EncryptedFileStorage` uses AES-256-GCM, file permissions `0600`, and atomic
replacement. Keep its file on a persistent volume and back up the encryption
key separately.

### Multiple Replicas

Implement `InstallationStorage` using a shared transactional database. Also
provide `requestReplayStore` to `start()` using Redis or a database operation
that atomically inserts a nonce until its expiry:

```typescript
await plugin.start({
  port: 3001,
  multiTenant: true,
  installationToken: process.env.ADDON_INSTALL_TOKEN,
  requestReplayStore: {
    async consume(key, expiresAt) {
      // Return true only when this process wins an atomic insert.
      return redisSetNonceAtomically(key, expiresAt);
    }
  }
});
```

Without `requestReplayStore`, replay protection is local to one process.

### Development Only

Automatic memory storage must be explicitly enabled:

```typescript
await plugin.start({
  port: 3001,
  multiTenant: true,
  installationToken: 'development-token-at-least-32-chars',
  allowInMemoryStorage: true
});
```

Memory storage loses workspace secrets on every restart and must not be used
for production.

## Async Transforms

```typescript
plugin.asyncTransform({
  id: 'deep-scan',
  name: 'Deep Scan',
  description: 'Runs a longer analysis',
  inputType: 'domain',
  outputTypes: ['domain'],
  async handler(input, _config, job) {
    await job.updateProgress(25, 'Starting');
    const result = new ResultBuilder(input)
      .addEntity(createEntity('domain', `api.${input.entity.value}`))
      .build();
    await job.updateProgress(90, 'Finalizing');
    return result;
  }
});
```

The SDK signs webhook events, assigns a unique `eventId`, and retries delivery.
The platform deduplicates those events.

## HTTP Routes

| Route | Protection |
| --- | --- |
| `GET /health` | Public, minimal operational metadata |
| `GET /manifest.json` | Personalized install token |
| `POST /register` | Bearer install token |
| `POST /unregister` | Signed workspace request |
| `POST /<transformId>` | Signed workspace request |
| `GET /stats` | Admin bearer token, otherwise returns 404 |

## Publication Checks

```bash
npm run build
npm test -- --run
npm audit
npm pack --dry-run
```

Start with the [secure installation example](examples/multi-tenant-plugin) and
[protocol guide](docs/protocol.md). The remaining [examples](examples/README.md)
illustrate transform handlers.

## License

MIT
