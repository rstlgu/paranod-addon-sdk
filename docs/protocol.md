# Addon protocol

The SDK connects an independently deployed addon to a self-hosted Paranod
installation. Run the addon with `multiTenant: true` and a persistent
`InstallationRegistry`, including when only one workspace will use it.

## Installation

The administrator configures an independent random installation token and storage
encryption key, each at least 32 characters long. Keep both outside source control.
Set `PUBLIC_URL` to the addon's HTTPS origin and place the storage file on a
persistent volume. The platform origin must also use HTTPS in production.

In Paranod, install the personalized URL:

```text
https://addon.example/manifest.json?installToken=YOUR_INSTALLATION_TOKEN
```

Treat the entire URL as a credential. The platform retrieves the manifest, then
calls `POST /register` with the installation token as a bearer token and a body
containing `workspaceId`, `platformUrl`, and optional workspace name and platform
version. The registry returns a dedicated `webhookSecret`. Re-registration also
requires a request signed with the existing workspace secret before rotating it.

## Transform requests

Requests carry `transformId`, an `input.entity`, and an optional `callbackUrl` for
asynchronous operations. Paranod signs the exact serialized body using the
installation's secret. The signed payload is:

```text
timestamp.nonce.workspaceId.rawJsonBody
```

The wire headers retain their established names for compatibility:

- `X-Relazio-Workspace-Id`: the registered workspace identifier;
- `X-Relazio-Timestamp`: Unix time in milliseconds;
- `X-Relazio-Nonce`: 32 hexadecimal characters, unique for each request;
- `X-Relazio-Signature`: `sha256=` followed by the HMAC-SHA256 hexadecimal digest.

The SDK verifies the signature, timestamp and nonce before invoking a handler.
It inserts the authenticated workspace identifier into the handler input.
`POST /unregister` uses the same signed request mechanism and must name that
workspace in its body. For multiple replicas, supply a shared atomic
`RequestReplayStore`; the default replay cache belongs to one process.

## Results and callbacks

A synchronous handler returns entities and edges. The HTTP response wraps them
in `{ async: false, result }`. An asynchronous handler receives a job context for
progress updates and returns its final result; the SDK delivers the signed events.

Callbacks must use the registered platform origin and the path
`/api/webhooks/transforms/<platformJobId>`, without query parameters or fragments.
Every event contains a unique `eventId`, the platform job identifier, a timestamp,
and its status. The signature in `X-Plugin-Signature` covers the exact JSON body.
Retries reuse the same event identifier, allowing the platform to deduplicate
delivery. Keep callback URLs unchanged and let the SDK perform delivery.

The [response format](response-format.md) describes entities and relationships;
the [secure example](../examples/multi-tenant-plugin/index.ts) shows server wiring.
Configure external provider credentials on the addon server. The OSS platform
does not provide platform credits or subscriptions through the addon manifest.
