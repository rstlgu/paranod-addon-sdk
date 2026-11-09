# Changelog

## 0.5.1 — 2026-11-09

- Keep the SDK under MIT while the independently maintained application adopts AGPLv3.
- Update the runnable addon walkthrough to the new Paranod 2.3.0 source and documentation.
- No protocol or runtime API changes.

## 0.5.0 — 2026-11-09

- Support HTTP localhost/LAN platform registration without weakening callback TLS checks.
- Add signed, workspace-scoped polling for asynchronous transforms, with retained results and encrypted file storage.
- Advertise polling endpoints while preserving the callback wire protocol for older platforms.
- Document local installation, result retention, retries and restart behavior.
- Publish a compiled package with checksums through a CI-gated GitHub release.
- Add a runnable polling addon with persistent storage and explicitly synthetic results.

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
