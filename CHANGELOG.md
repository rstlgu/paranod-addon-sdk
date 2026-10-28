# Changelog

## 0.4.0 — 2026-10-28

Initial release in `rstlgu/paranod-addon-sdk`, based on the 0.3 SDK API.

- Removed obsolete platform pricing fields from transform types and manifests.
- Preserved signed workspace requests, replay protection, encrypted installation
  storage, and asynchronous webhook delivery.
- Retained the package import name and wire protocol used by Paranod.
- Documented installation from the repository and package archive, with Node.js 22.
- Updated vulnerable dependency versions and adapted request records to Zod 4.
- Updated repository links and self-contained addon examples.

When migrating from 0.3, remove `premium` and `credits` from transform definitions.
