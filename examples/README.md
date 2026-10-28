# SDK Examples

These directories demonstrate transform handlers and builder APIs.

- `simple-sync-example`: synchronous entities and edges.
- `async-subdomain-scanner`: progress and async results.
- `email-parser`: a minimal parser.
- `dns-toolkit`: multiple DNS transforms.
- `ip-lookup-complete`: broader builder coverage.
- `multi-tenant-plugin`: minimal secure server wiring.

Except for `multi-tenant-plugin`, these are local handler snippets and are not
production deployment templates. The complete deployable reference is
[the secure installation example](https://github.com/rstlgu/paranod-addon-sdk/tree/main/examples/multi-tenant-plugin).

Production addons need persistent installation storage, an installation token,
HTTPS, and a shared replay store when running multiple replicas. See the root
[README](../README.md).
