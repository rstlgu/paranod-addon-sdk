# Runnable polling addon

This single-process example implements a complete SDK 0.5 server: personalized manifest, registration, signed asynchronous transform requests, outbound polling and encrypted persistent storage. It needs Node.js 22 and no AI key or external data provider.

The result is **synthetic**: `example.org` becomes `api.example.org`, marked `demo: true`. No DNS query or OSINT discovery takes place. Replace the handler with a provider integration to build a real tool.

From the SDK repository root:

```sh
npm ci
export ADDON_INSTALL_TOKEN=$(openssl rand -hex 32)
export ADDON_STORAGE_ENCRYPTION_KEY=$(openssl rand -hex 32)
export PUBLIC_URL=https://addon.example.org
node examples/polling-addon/index.cjs
```

Use your own origin and place an HTTPS reverse proxy in front of port 4100. The server listens on `127.0.0.1` by default; set `HOST` and `PORT` explicitly for a different deployment. For trusted local development, HTTP is possible with the exact addon host allowlisted in Paranod. The app container must be able to reach that host.

Persist both secrets and the `data` directory (`ADDON_DATA_DIR` overrides its location). They must survive process restarts. These file stores are for one process; use shared installation, polling and replay stores for multiple replicas. Completed results survive restart, but interrupted handlers are not automatically resumed.

Install privately using `https://addon.example.org/manifest.json?token=YOUR_INSTALLATION_TOKEN`, then run **Create demo subdomain** from a domain node in Paranod. Do not publish the personalized URL or token. `/health` is a public health endpoint; transform and polling routes require workspace signatures.

See the [platform walkthrough](https://github.com/rstlgu/paranod/blob/v2.2.0/docs/ADDON-WALKTHROUGH.md) for installation, manual execution, agent compatibility and troubleshooting. The example is executable from the source checkout after `npm ci`; when adapting it into a standalone project, install the release package and replace `require('../../dist')` with `require('@paranod/plugin-sdk')`.
