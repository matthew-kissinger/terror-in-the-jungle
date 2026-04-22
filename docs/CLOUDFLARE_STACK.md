# Cloudflare Stack

Last updated: 2026-04-21

Production today: `https://terror-in-the-jungle.pages.dev/`

This document is the deployment/storage target for the game. `docs/DEPLOY_WORKFLOW.md` remains the command-level deploy runbook; this file explains the Cloudflare architecture we should move toward before adding more terrain/model payloads.

## Current Check

Checked locally on 2026-04-21:

- `npx wrangler --version` -> `4.84.1`
- `npm view wrangler version` -> `4.84.1`
- `npx wrangler whoami` -> not logged in
- `npx wrangler pages project list` -> blocked without `CLOUDFLARE_API_TOKEN`
- `npx wrangler r2 bucket list` -> blocked without `CLOUDFLARE_API_TOKEN`
- GitHub repo secrets present: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

Live deploy validation found that `/data/vietnam/a-shau-rivers.json` returns the SPA HTML shell from Cloudflare Pages. Root cause: `public/data/vietnam/` is gitignored, so GitHub Actions builds and deploys without local-only A Shau runtime data.

Do not fix this by committing large terrain payloads into git. The current A Shau DEM is under Pages' 25 MiB per-file Wrangler limit, but it is already close enough to make the approach brittle, and future terrain/model data will outgrow it.

## Docs Checked

- Cloudflare Pages Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pages Direct Upload CI: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Pages to Workers migration: https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/
- R2 bucket creation/public access: https://developers.cloudflare.com/r2/buckets/create-buckets/
- R2 uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 custom-domain caching: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- R2 Wrangler commands: https://developers.cloudflare.com/r2/reference/wrangler-commands/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare cache behavior and cacheable file limits: https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- Three.js GLTFLoader compression hooks: https://threejs.org/docs/pages/GLTFLoader.html
- meshoptimizer/gltfpack: https://github.com/zeux/meshoptimizer
- Khronos `KHR_texture_basisu`: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md

## Target Architecture

### App Shell

Keep the Vite app shell on Cloudflare Pages for now:

- HTML, JS, CSS, fonts, service worker, and small UI assets stay in `dist/`.
- Generated Vite assets stay content-hashed under `/build-assets/`.
- Stable public files keep revalidation headers until they are moved behind content-addressed URLs.
- Pages remains manual Direct Upload through GitHub Actions until we add preview environments.

Revisit Workers Static Assets only when we need Cloudflare runtime APIs in the same deployment unit. Current docs make Workers Static Assets plus the Cloudflare Vite plugin the stronger full-stack path, especially once we add Durable Objects, R2 bindings, request logging, or authenticated APIs. Migrating the app shell now would add workflow churn without fixing the terrain payload problem by itself.

### Large Game Assets

Move large runtime payloads to Cloudflare R2:

- terrain DEMs (`*.f32`)
- derived terrain/nav layers once they exceed small seed-keyed baked files
- GLBs and texture-heavy model packs after the model manifest pipeline exists
- generated map/asset manifests

Use content-addressed object keys:

```text
terrain/a-shau/a-shau-z14-9x9.<sha256>.f32
terrain/a-shau/a-shau-rivers.<sha256>.json
models/vehicles/aircraft/a1-skyraider.<sha256>.glb
manifests/assets.<git-sha>.json
manifests/current.json
```

Cache policy:

- hashed payloads: `public, max-age=31536000, immutable`
- `manifests/current.json`: short TTL or `max-age=0, must-revalidate`
- no service-worker Cache Storage for R2 payloads until an explicit offline/cache-budget design exists

Expose R2 through a custom domain, not as a hidden deployment detail. Cloudflare's R2 cache docs require a public bucket with a custom domain for Cloudflare Cache integration. If the game stays on `pages.dev` temporarily, configure CORS on the R2 bucket for the Pages origin and local dev origins.

### Client Resolution

Add a generated asset manifest and a single resolver:

```text
logical id -> URL + size + sha256 + contentType + cache policy
```

Runtime should resolve A Shau's DEM from the manifest rather than hardcoding `/data/vietnam/big-map/a-shau-z14-9x9.f32`. Local dev can fall back to same-origin `/data/...`; production should fail startup if a manifest entry is missing or returns HTML.

### User Interaction

Do not use R2 for live interaction state. Use Cloudflare products by data shape:

- Durable Objects with hibernating WebSockets for multiplayer/session rooms, live squads, co-op, or spectator channels.
- D1 for durable relational data such as profiles, campaign saves, entitlements, and structured audit records.
- KV for low-churn feature flags, config, and fast edge-readable lookup tables.
- Queues plus Analytics Engine/Logpush for telemetry ingestion that must not block gameplay.

This keeps static payload delivery, live coordination, and analytics separate instead of putting everything behind one Worker.

## Setup Commands

These require local auth (`wrangler login`) or environment variables:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<token>'
$env:CLOUDFLARE_ACCOUNT_ID = '<account-id>'
npx wrangler whoami
npx wrangler pages project list
npx wrangler r2 bucket list
```

Recommended bucket:

```powershell
npx wrangler r2 bucket create titj-game-assets-prod
npx wrangler r2 bucket domain add titj-game-assets-prod --domain assets.<your-domain>
```

Example upload shape:

```powershell
npx wrangler r2 object put titj-game-assets-prod/terrain/a-shau/a-shau-z14-9x9.<sha256>.f32 `
  --file public/data/vietnam/big-map/a-shau-z14-9x9.f32 `
  --content-type application/octet-stream `
  --cache-control "public, max-age=31536000, immutable"
```

Wrangler supports `--content-type` and `--cache-control` on `r2 object put`; keep these explicit so uploaded assets do not depend on guessed metadata.

## CI Shape

Target release order:

1. Build or verify generated terrain/model payloads.
2. Compute SHA-256 and write `dist/asset-manifest.json`.
3. Upload missing content-addressed objects to R2.
4. HEAD/GET every manifest URL and fail if a response is HTML, wrong-sized, wrong content-type, or missing CORS/cache headers.
5. Build the Pages shell with the manifest URL or embedded manifest.
6. Deploy Pages.
7. Run live header checks for Pages and R2 asset domains.
8. Run browser smoke on the deployed Pages URL.

This prevents the exact failure found on 2026-04-21: local `dist/` contained A Shau data, but the GitHub deploy did not.

## Validation Gates

Live checks after R2 is configured:

```powershell
curl.exe -I https://terror-in-the-jungle.pages.dev/
curl.exe -I https://terror-in-the-jungle.pages.dev/sw.js
curl.exe -I https://assets.<your-domain>/terrain/a-shau/a-shau-z14-9x9.<sha256>.f32
curl.exe -H "Range: bytes=0-1023" -I https://assets.<your-domain>/terrain/a-shau/a-shau-z14-9x9.<sha256>.f32
curl.exe -H "Origin: https://terror-in-the-jungle.pages.dev" -I https://assets.<your-domain>/terrain/a-shau/a-shau-z14-9x9.<sha256>.f32
```

Expected:

- Pages HTML and service worker revalidate.
- R2 hashed payloads are immutable.
- R2 payload content types are explicit.
- CORS is present for browser asset loads.
- Range requests are validated before designing partial DEM/model streaming.

## Open Decisions

- Custom domain for assets. A custom R2 domain is the production path; `r2.dev` is acceptable only as a temporary validation endpoint.
- Bucket names and environments (`titj-game-assets-prod`, optional `titj-game-assets-preview`).
- Whether to move from Pages to Workers Static Assets in the same cycle as Durable Objects, or keep a separate Worker for interaction first.
- Whether GLBs should move to R2 in the first asset-manifest pass or after terrain is stable.
- Whether DEMs should be chunked/streamed before more real-world maps are added.
