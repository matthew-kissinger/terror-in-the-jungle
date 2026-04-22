# Cloudflare Stack

Last updated: 2026-04-22

Production today: `https://terror-in-the-jungle.pages.dev/`

This document is the deployment/storage target for the game. `docs/DEPLOY_WORKFLOW.md` remains the command-level deploy runbook; this file explains the Cloudflare architecture we should move toward before adding more terrain/model payloads or live user interaction.

## Current Check

Checked locally on 2026-04-22:

- `npx wrangler --version` -> `4.84.1`
- `npm view wrangler version` -> `4.84.1`
- `npm view cloudflare version` -> `5.2.0`
- `npm view @cloudflare/vite-plugin version` -> `1.33.1`
- `npm view @cloudflare/workers-types version` -> `4.20260422.1`
- `npm view @cloudflare/realtimekit version` -> `1.4.0`
- `npm view @cloudflare/realtimekit-ui version` -> `1.1.2`
- `wrangler login` succeeded through OAuth for account `56adffd40534f7fe110fc661a40bbf53`.
- Pages project exists: `terror-in-the-jungle`, domain `terror-in-the-jungle.pages.dev`, Direct Upload/no Git provider.
- Latest listed Pages deployment is source `0807209`; docs-only `fb96660` was pushed after that deployment and is not the live Pages source.
- R2 buckets created: `titj-game-assets-prod` and `titj-game-assets-preview`.
- CORS applied to both buckets from `cloudflare/r2-cors-public-read.json`.
- Temporary public `r2.dev` endpoints enabled:
  - prod: `https://pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev`
  - preview: `https://pub-830e0b99a66d4db897a7567505841c71.r2.dev`
- No custom R2 domains are attached yet.
- Project-local `wrangler` and `@cloudflare/workers-types` are installed in devDependencies.
- GitHub repo secrets are present: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

Live deploy validation on 2026-04-21 found that `/data/vietnam/a-shau-rivers.json` returns the SPA HTML shell from Cloudflare Pages. Root cause: `public/data/vietnam/` is gitignored, so GitHub Actions builds and deploys without local-only A Shau runtime data.

Do not fix this by committing large terrain payloads into git. Cloudflare Pages has a 25 MiB per-file asset limit, and R2 is the correct home for large terrain/model payloads.

First R2 production asset upload validated on 2026-04-22:

- `terrain.ashau.dem`
  - R2 key: `terrain/a-shau/a-shau-z14-9x9.6333377c64acbcd74719a078534dc9ca229b242db5562e860e79ae963dd7fc5a.f32`
  - size: `21233664`
  - content type: `application/octet-stream`
  - cache: `public, max-age=31536000, immutable`
- `terrain.ashau.rivers`
  - R2 key: `terrain/a-shau/a-shau-rivers.c8a5aea6b34f1ca667a17cbd371d785fae8b310cf7c670df55371a12ef108ab5.json`
  - size: `25718`
  - content type: `application/json`
  - cache: `public, max-age=31536000, immutable`

`npm run cloudflare:assets:upload` uploads these assets with `--remote` when the local source files exist, writes `dist/asset-manifest.json`, uploads `manifests/assets.<git-sha>.json` and `manifests/current.json`, then validates HEAD responses for size, content type, cache-control, and CORS. Fresh GitHub Actions checkouts do not contain the gitignored source files, so the script falls back to pinned R2 metadata for these already-uploaded objects and still validates the live URLs before Pages deploy. The deploy workflow currently sets `TITJ_SKIP_R2_UPLOAD=1` because the GitHub Cloudflare token can deploy Pages but cannot write R2 objects; local OAuth runs still perform real R2 writes.

## Docs Checked

Primary Cloudflare docs checked on 2026-04-22:

- Cloudflare Pages Direct Upload: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pages Direct Upload CI: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- Pages serving and caching: https://developers.cloudflare.com/pages/configuration/serving-pages/
- Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Workers Static Assets headers: https://developers.cloudflare.com/workers/static-assets/headers/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Pages to Workers migration: https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/
- Wrangler install/update: https://developers.cloudflare.com/workers/wrangler/install-and-update/
- Wrangler API and platform proxy: https://developers.cloudflare.com/workers/wrangler/api/
- Wrangler Pages commands: https://developers.cloudflare.com/workers/wrangler/commands/pages/
- Cloudflare TypeScript SDK: https://developers.cloudflare.com/api/node/
- Cloudflare SDK overview: https://developers.cloudflare.com/fundamentals/api/reference/sdks/
- R2 how it works: https://developers.cloudflare.com/r2/how-r2-works/
- R2 bucket creation/public access: https://developers.cloudflare.com/r2/buckets/create-buckets/
- R2 uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 custom-domain caching: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/
- R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- R2 Wrangler commands: https://developers.cloudflare.com/r2/reference/wrangler-commands/
- R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Durable Objects overview: https://developers.cloudflare.com/durable-objects/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Durable Object lifecycle: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- D1 overview: https://developers.cloudflare.com/d1/
- Workers KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Cloudflare Queues overview: https://developers.cloudflare.com/queues/
- Workers Analytics Engine: https://developers.cloudflare.com/analytics/analytics-engine/
- Cloudflare Pipelines: https://developers.cloudflare.com/pipelines/
- Workers Logs and Logpush: https://developers.cloudflare.com/workers/observability/logs/
- Cloudflare Realtime overview: https://developers.cloudflare.com/realtime/
- Realtime DataChannels: https://developers.cloudflare.com/realtime/sfu/datachannels/
- Realtime TURN service: https://developers.cloudflare.com/realtime/turn/
- Realtime TURN credentials: https://developers.cloudflare.com/realtime/turn/generate-credentials/
- Cloudflare Flagship: https://developers.cloudflare.com/flagship/
- Browser Run rename and CDP notes: https://developers.cloudflare.com/changelog/post/2026-04-15-br-rename/

Game asset docs checked previously and still relevant:

- Three.js GLTFLoader compression hooks: https://threejs.org/docs/pages/GLTFLoader.html
- meshoptimizer/gltfpack: https://github.com/zeux/meshoptimizer
- Khronos `KHR_texture_basisu`: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md

## Decision Summary

| Need | Use | Why | Do not use |
| --- | --- | --- | --- |
| Current static app shell | Cloudflare Pages Direct Upload | Existing deployment works and serves the Vite SPA globally. | Do not migrate the shell before the asset pipeline is fixed. |
| Future edge-backed app shell | Workers Static Assets + Cloudflare Vite plugin | Best fit once the game needs Workers bindings, runtime APIs, request logging, or edge endpoints in the same deployment unit. | Do not use Pages Functions as a long-term place for Durable Object classes. |
| Large immutable game files | R2 behind a custom domain | Designed for large object storage, no egress fees, and custom-domain cache integration. | Do not keep DEMs/large GLBs in git or Pages. |
| Runtime asset selection | Generated asset manifest | Lets app code resolve logical IDs to content-addressed URLs, sizes, hashes, and content types. | Do not hardcode production `/data/vietnam/...` paths. |
| Authoritative multiplayer/session state | Durable Objects with hibernating WebSockets | Strong per-room coordination, many WebSockets per object, and low idle cost. | Do not put live state in R2 or KV. |
| WebRTC media/broadcast/data fanout | Cloudflare Realtime SFU/TURN | Useful for voice, spectator, data fanout, NAT traversal, and WebRTC experiments. | Do not make Realtime DataChannels the authoritative simulation path without a prototype. |
| Profiles/saves/entitlements | D1 | SQL semantics, Worker access, backups/time-travel, good for account and campaign records. | Do not model high-frequency position updates in D1. |
| Feature flags/tuning | Flagship first, KV fallback | Flagship is built for flags and rollout rules; KV is still useful for low-churn edge-readable config. | Do not rely on KV for strongly consistent writes. |
| Telemetry ingestion | Queues -> Pipelines/Analytics Engine/Logpush -> R2 | Buffers gameplay telemetry away from request path and produces queryable logs/data. | Do not block a frame or live request on analytics writes. |
| Synthetic QA | Local Playwright first; Browser Run later | Local Playwright is cheaper and already integrated. Browser Run can become remote cross-region smoke if needed. | Do not depend on Browser Run for the local dev loop. |

## Target Architecture

### App Shell

Keep the Vite app shell on Cloudflare Pages for now:

- HTML, JS, CSS, fonts, service worker, and small UI assets stay in `dist/`.
- Generated Vite assets stay content-hashed under `/build-assets/`.
- Stable public files keep revalidation headers until they are moved behind content-addressed URLs.
- Pages remains manual Direct Upload through GitHub Actions until preview environments are needed.

Move to Workers Static Assets plus the Cloudflare Vite plugin when one of these becomes true:

- The app shell needs an edge API in the same project.
- The client needs Workers bindings during dev/preview.
- We want `vite preview` to run inside the Workers runtime.
- Durable Objects, R2 bindings, Flagship, Queues, or request logging are part of the production request path.

The migration should be deliberate. Workers Static Assets is a better full-stack target, but it does not by itself fix the A Shau terrain deploy gap.

### Large Game Assets

Move large runtime payloads to Cloudflare R2:

- terrain DEMs (`*.f32`)
- rivers/roads/derived terrain layers
- derived nav layers once they exceed small seed-keyed baked files
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

Expose R2 through a custom domain. Cloudflare's R2 cache docs require a public bucket with a custom domain for Cloudflare Cache integration. The current `r2.dev` endpoint is enabled only so the manifest pipeline can be validated before a domain is chosen.

Wrangler can upload one R2 object at a time and supports metadata flags such as `--content-type` and `--cache-control`. Cloudflare's R2 upload docs call out a Wrangler upload limit of 315 MB; for larger or bulk uploads, prefer rclone or an S3-compatible SDK/tool.

### Client Resolution

Add a generated asset manifest and a single resolver:

```text
logical id -> url + size + sha256 + contentType + cache policy + required
```

Runtime should resolve A Shau's DEM from the manifest rather than hardcoding `/data/vietnam/big-map/a-shau-z14-9x9.f32`. Local dev can fall back to same-origin `/data/...`; production should fail startup if a required manifest entry is missing, returns HTML, has the wrong content type, or has the wrong size.

Recommended staged resolver behavior:

1. Load embedded build manifest or fetch `manifests/current.json`.
2. Validate schema, build git SHA, and required logical IDs.
3. Resolve all production large assets to R2 custom-domain URLs.
4. Allow local fallback only in dev and preview-local modes.
5. Fail loudly in production if the response is HTML, empty, wrong-sized, or wrong content type.

### User Interaction

Do not use R2 for live interaction state. Use Cloudflare products by data shape:

- Durable Objects with hibernating WebSockets for multiplayer/session rooms, live squads, co-op, spectator channels, and any single-writer room authority.
- Realtime SFU/TURN for voice, video, WebRTC spectator broadcast, and experimental data fanout where one-to-many transmission is the problem.
- D1 for durable relational data such as profiles, campaign saves, entitlements, leaderboard snapshots, and structured audit records.
- Flagship for live feature flags and percentage rollouts; KV only for low-churn config where eventual consistency is acceptable.
- Queues plus Analytics Engine, Pipelines, or Logpush for telemetry ingestion that must not block gameplay.

Durable Object WebSockets are the first multiplayer primitive to prototype. Cloudflare recommends the hibernation API for idle cost control. Their docs also call out batching logical messages into fewer WebSocket frames for high-frequency state; our prototype should start with input/event deltas and low-rate state snapshots, not 60 Hz full-world sync.

Realtime is complementary, not a replacement for an authoritative game server. Realtime DataChannels are useful for low-latency data fanout, but the current docs describe them as one-way per channel. Bidirectional traffic needs paired channels or another path. For combat authority, start with Durable Objects; evaluate Realtime later for voice, spectator, replay broadcast, or a WebRTC data-channel experiment.

### Telemetry And Operations

Minimum viable operations stack:

- Client reports boot, asset load, and runtime errors to a Worker endpoint.
- Worker validates payload shape and enqueues telemetry to Queues.
- Queue consumer batches into Analytics Engine for dashboard-style queries or into Pipelines/R2 for durable analysis.
- Workers Logs stays enabled for edge-side errors. Logpush to R2 is the paid-plan path for durable Worker trace logs.

Do not send raw per-frame traces from clients by default. Sample, aggregate, and gate verbose telemetry behind a flag.

## CLI And SDK Policy

Use Wrangler as the source of truth for Cloudflare project config once we add Workers or R2 automation:

```powershell
npm i -D wrangler@latest @cloudflare/workers-types@latest
npx wrangler --version
npx wrangler types
```

Current repo state still uses `npx wrangler` without a local devDependency. The first implementation pass for R2/Workers should add project-local Wrangler so CI, docs, and local runs pin to the same major version.

Use the official `cloudflare` TypeScript SDK for account/control-plane scripts when Wrangler is too limited, for example:

- list Pages deployments and project metadata
- manage R2 custom domains through the API
- validate Logpush/Pipelines setup
- automate Cloudflare resource discovery in a typed Node script

Inside Workers, prefer bindings over REST calls. Bindings are the native runtime capability path for R2, D1, KV, Queues, Durable Objects, Analytics Engine, Assets, AI, Vectorize, Flagship, and other Cloudflare services.

Use S3-compatible tooling for heavy R2 asset sync:

- Wrangler: simple single-object uploads and first validation.
- rclone or AWS SDK: bulk sync, multipart/resumable upload, and larger future datasets.
- Presigned URLs: user-generated upload flows only; do not use them for public immutable read paths.

## Setup Commands

These require local auth (`wrangler login`) or environment variables:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<token>'
$env:CLOUDFLARE_ACCOUNT_ID = '<account-id>'
npx wrangler whoami
npx wrangler pages project list
npx wrangler r2 bucket list
```

If a Pages Wrangler config already exists in the Cloudflare dashboard, download it before hand-authoring a local config:

```powershell
npx wrangler pages download config terror-in-the-jungle
```

Recommended buckets:

```powershell
npx wrangler r2 bucket create titj-game-assets-prod
npx wrangler r2 bucket create titj-game-assets-preview
```

Recommended custom domain shape:

```text
assets.<your-domain> -> titj-game-assets-prod
preview-assets.<your-domain> -> titj-game-assets-preview
```

Example upload shape:

```powershell
npx wrangler r2 object put titj-game-assets-prod/terrain/a-shau/a-shau-z14-9x9.<sha256>.f32 `
  --file public/data/vietnam/big-map/a-shau-z14-9x9.f32 `
  --content-type application/octet-stream `
  --cache-control "public, max-age=31536000, immutable"
```

Current CORS policy lives at `cloudflare/r2-cors-public-read.json` and uses the current R2 `rules` wrapper schema:

```json
{
  "rules": [
    {
      "id": "public-game-asset-read",
      "allowed": {
        "origins": ["*"],
        "methods": ["GET", "HEAD"],
        "headers": ["Range", "Content-Type", "If-None-Match"]
      },
      "exposeHeaders": ["Content-Length", "Content-Range", "ETag", "Cache-Control", "Content-Type"],
      "maxAgeSeconds": 86400
    }
  ]
}
```

Apply it after a bucket exists:

```powershell
npx wrangler r2 bucket cors set titj-game-assets-prod --file cloudflare/r2-cors-public-read.json
npx wrangler r2 bucket cors set titj-game-assets-preview --file cloudflare/r2-cors-public-read.json
```

Use `--remote` on Wrangler object commands. Without it, Wrangler may write to local R2 storage:

```powershell
npx wrangler r2 object put titj-game-assets-prod/<key> --file <file> --remote
```

Repo commands:

```powershell
npm run cloudflare:assets:manifest
npm run cloudflare:assets:upload
npm run cloudflare:assets:validate
```

## Credential Needs

To move past docs and implement the production stack locally, we need one of:

- `wrangler login` in this shell, or
- `CLOUDFLARE_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID` in this shell.

For the first R2 pass, the token needs account-level permission to inspect Pages and manage R2 buckets/objects. If we use a custom domain, we also need access to the Cloudflare zone that owns the domain.

Likely additional credentials later:

- R2 S3 access key pair if we choose rclone/AWS SDK for bulk asset sync.
- Realtime app ID/token and TURN key if we prototype WebRTC voice/spectator/data fanout.
- D1 database binding info if profiles/saves move to Cloudflare.
- Flagship app ID if we adopt Cloudflare-native feature flags.
- Logs/Logpush permissions if we store Worker trace logs in R2.

Do not put any of these in git. Use Cloudflare secrets, GitHub Actions secrets, `.dev.vars`, or process environment only.

### Token Permission Profiles

Use separate tokens when practical.

**Recommended now: `titj-local-pages-r2-setup`**

Purpose: local Wrangler inspection, Pages deploy validation, R2 bucket/object setup, and optional R2 custom asset domain setup.

Permissions:

- Account -> Cloudflare Pages -> Edit
- Account -> Workers R2 Storage -> Edit
- Zone -> Zone -> Read, scoped to the domain we will use for the asset hostname
- Zone -> DNS -> Edit, scoped to that same domain, only if Wrangler/API should create or adjust the asset-domain DNS record

Resources:

- Account resources: include only the Cloudflare account that owns the Pages project.
- Zone resources: include only the production domain's zone. If there is no custom domain yet, omit zone permissions and use `r2.dev` only for temporary validation.

Optional restrictions:

- Expiration: 30-90 days is reasonable while we are setting this up.
- Client IP filtering: only use it if the local IP is stable. Dynamic home IPs make this painful.

**Recommended later: R2 S3 access key**

Purpose: bulk upload/sync through rclone or an S3-compatible SDK.

Create this from R2 -> Manage API Tokens, not from the generic API token page. Scope it to `titj-game-assets-prod` and `titj-game-assets-preview` with Object Read and Write. Cloudflare only shows the secret access key once.

**Avoid unless necessary: token-creator token**

Cloudflare can create API tokens through the API, but that requires an initial token from the "Create additional tokens" template. That token can create other tokens and is too broad for routine repo work. Prefer either dashboard-created scoped tokens or `wrangler login`.

## CI Shape

Target release order:

1. Build or verify generated terrain/model payloads.
2. Compute SHA-256 and write `dist/asset-manifest.json`.
3. Upload missing content-addressed objects to R2.
4. HEAD/GET every manifest URL and fail if a response is HTML, wrong-sized, wrong content-type, missing CORS, or missing the intended cache header.
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
- Range request behavior is known before designing partial DEM/model streaming.

## Implementation Order

1. Add project-local Wrangler and Cloudflare config discovery docs/scripts.
2. Create/confirm R2 buckets. Done for prod/preview on 2026-04-22.
3. Add asset manifest generation for local A Shau runtime files. Done for primary DEM + rivers.
4. Add R2 upload and live manifest validation scripts. Done via `scripts/cloudflare-assets.ts`.
5. Update the A Shau loader to resolve through the manifest in production with dev-only local fallback. Done for `terrain.ashau.dem`.
6. Add CI upload/header validation before Pages deploy. Done in `.github/workflows/deploy.yml`; needs one live workflow run after merge.
7. Replace pinned metadata with a reproducible CI artifact/source handoff before the next terrain payload revision. The current pinned fallback is acceptable for already-uploaded immutable objects, not for new asset generation.
8. Move GLBs into the manifest pipeline once terrain is stable.
9. Prototype a small Worker control plane only after asset delivery is reliable.
10. Prototype Durable Object WebSocket room authority before any Realtime/WebRTC gameplay transport.
11. Add telemetry ingestion with Queues and Analytics Engine/Pipelines after core deploy correctness is solved.

## Open Decisions

- Custom domain for assets. A custom R2 domain is the production path; `r2.dev` is acceptable only as a temporary validation endpoint.
- Bucket names and environments (`titj-game-assets-prod`, optional `titj-game-assets-preview`).
- Whether the first Worker is a separate control-plane Worker or whether we migrate the shell to Workers Static Assets in the same cycle.
- Whether GLBs should move to R2 in the first asset-manifest pass or after terrain is stable.
- Whether DEMs should be chunked/streamed before more real-world maps are added.
- Whether Flagship replaces KV for all live tuning flags or only user-facing release flags.
- Whether Realtime is needed for voice/spectator/broadcast, or whether Durable Object WebSockets cover the first multiplayer prototype.
