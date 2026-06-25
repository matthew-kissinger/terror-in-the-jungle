# Asset Manifest Core

Small helpers for validating and resolving browser-game asset manifests.

## Provenance

Generalized from TIJ asset-manifest and deployment validation work. This
package does not include Cloudflare, TIJ asset IDs, or service-worker policy.

## API

- `validateAssetManifest(manifest, options)`
- `resolveAssetUrl(manifest, id, options)`
- `normalizeAssetEntries(manifest)`

## Non-Goals

- No network fetches.
- No deployment provider assumptions.
- No generated asset output.

