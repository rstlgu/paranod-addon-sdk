# Addon protocol

The SDK connects an independently deployed addon to a self-hosted Paranod
installation. Run the addon with `multiTenant: true` and a persistent
`InstallationRegistry`, including when only one workspace will use it.

## Installation

The administrator configures an independent random installation token and storage
encryption key, each at least 32 characters long. Keep both outside source control.
Set `PUBLIC_URL` to the addon's HTTPS origin and place the storage file on a
persistent volume. The platform origin may use HTTP, including localhost or a private LAN. It is metadata for outbound-only execution; callbacks validate their own HTTPS requirement separately.

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

Requests carry `transformId` and an `input.entity`. Polling submissions add
`resultDelivery: "polling"` and omit `callbackUrl`. Legacy callback submissions
include `callbackUrl`; mixing a callback URL with polling is rejected. Paranod signs the exact serialized body using the
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

## Results and polling

A synchronous handler returns entities and edges in `{ async: false, result }`.
SDK 0.5 manifests add `pollingEndpoint` to asynchronous transforms, on the same
origin as the transform endpoint. Paranod 2.1 chooses polling automatically.
An asynchronous submission returns `{ async: true, jobId }`; the result is
persisted by the SDK rather than pushed to the platform.

Send a fresh signed `POST` to the declared polling endpoint with:

```json
{ "action": "status", "jobId": "the-returned-job-id", "transformId": "deep-scan" }
```

The status response contains `jobId`, `transformId`, `status` (`processing`,
`completed`, `failed` or `cancelled`), and optional bounded progress fields.
A completed response includes `result`; a failed/cancelled response may include
`error`. Status responses use `Cache-Control: no-store`. Authentication, nonce
replay protection and owner/transform checks run on every read. Unknown, expired
and other-workspace jobs all return 404. Reads never re-execute a handler.

Configure `EncryptedFilePollingJobStorage` on a persistent volume for a single
addon process, or supply shared `PollingJobStorage` for replicas. Results expire
one hour after completion. The built-in stores limit capacity to 256 records and
64 MiB; each result is limited to 4 MiB. Capacity exhaustion rejects a write and
does not silently evict existing jobs. The default memory store is for testing.
An interrupted handler is not restarted automatically after a process restart.

## Legacy callbacks

A request containing `callbackUrl` and no explicit polling mode continues to use
signed callbacks. Production callback URLs require HTTPS even if the registered
platform URL uses HTTP. Loopback HTTP callbacks remain a development-only option.

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
