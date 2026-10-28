# Quick Start

Use the repository [README](../README.md) for the complete secure server setup.
The essential sequence is:

1. Define a `ParanodPlugin`.
2. Register synchronous or asynchronous transforms.
3. Configure a persistent `InstallationRegistry`.
4. Start multi-tenant mode with an installation token and public URL.
5. Install the personalized manifest URL from PARANOD.

```typescript
import {
  EncryptedFileStorage,
  InstallationRegistry,
  ParanodPlugin,
  ResultBuilder,
  createEntity
} from '@paranod/plugin-sdk';

const plugin = new ParanodPlugin({
  id: 'domain-analyzer',
  name: 'Domain Analyzer',
  version: '1.0.0',
  author: 'Your Company',
  description: 'Analyzes domains',
  category: 'network'
});

plugin.transform({
  id: 'analyze-domain',
  name: 'Analyze Domain',
  description: 'Returns related infrastructure',
  inputType: 'domain',
  outputTypes: ['ip'],
  async handler(input) {
    return new ResultBuilder(input)
      .addEntity(createEntity('ip', '203.0.113.10'), 'resolves to')
      .build();
  }
});

plugin.enableMultiTenant(
  new InstallationRegistry(
    'domain-analyzer',
    '1.0.0',
    new EncryptedFileStorage(
      process.env.ADDON_STORAGE_PATH || './data/installations.enc',
      process.env.ADDON_STORAGE_ENCRYPTION_KEY!
    )
  )
);

await plugin.start({
  port: 3001,
  publicUrl: process.env.PUBLIC_URL,
  multiTenant: true,
  installationToken: process.env.ADDON_INSTALL_TOKEN
});
```

PARANOD calls transform routes with signed server-to-server headers. Unsigned
manual requests are rejected intentionally. Test handlers directly in unit
tests, and test the full protocol through a PARANOD development instance.

For multiple replicas, replace file storage with shared database storage and
provide an atomic `RequestReplayStore`.

See also:

- [Builders guide](./builders-guide.md)
- [Response format](./response-format.md)
- [Reference addon](https://github.com/rstlgu/paranod-addon-sdk/tree/main/examples/multi-tenant-plugin)
