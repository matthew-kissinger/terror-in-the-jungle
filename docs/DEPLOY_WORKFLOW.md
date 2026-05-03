# Deploy Workflow

Last updated: 2026-05-03

Production: https://terror-in-the-jungle.pages.dev/

This document captures how a commit becomes a live Cloudflare Pages deploy, how browser freshness is preserved for repeat players, and how to verify prod headers when users report stale assets or load failures.

Current stable-ground finding on 2026-05-02: production was healthy but stale.
`master` was at `f99181a0bf8a6b2a8684fc1ae3796022c16aad22`, while live
`/asset-manifest.json` reported
`5f585f7d4bf5ad2c0c85450235ac4c9950988d83`. Treat this as the canonical
failure mode for release drift: CI green does not imply Pages is current.

Docs checked on 2026-04-21:

- [Cloudflare Pages Direct Upload with Wrangler](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [Cloudflare Pages `_headers`](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare Pages serving and caching defaults](https://developers.cloudflare.com/pages/configuration/serving-pages/)
- [Cloudflare content compression](https://developers.cloudflare.com/speed/optimization/content/compression/)
- [Wrangler install/update](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [Cloudflare R2 uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [Cloudflare R2 custom-domain caching](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

## 1. Build To Deploy Path

Deploy is **manual**. `master` no longer auto-deploys. CI gates still run on every push, but the actual Cloudflare Pages upload only happens when you trigger it.

```text
push to master
  -> .github/workflows/ci.yml         (gates only, no deploy)
       lint  ---\
       test  ----+-- (parallel)
       build ---/
       smoke  ---\
       mobile-ui -+-- (needs: lint, test)
       perf   (advisory, never blocks)

manual trigger (you decide when)
  -> .github/workflows/deploy.yml     (workflow_dispatch)
       - checkout ref (default: master)
       - checkout ../game-field-kits with GAME_FIELD_KITS_DEPLOY_KEY
       - build consumed @game-field-kits packages
       - npm ci
       - npm run build
       - npm run cloudflare:assets:upload
       - cloudflare/wrangler-action@v3
       - command: pages deploy dist --project-name terror-in-the-jungle
```

### How to trigger a deploy

Any of:

- `npm run deploy:prod` - dispatches `deploy.yml` against master's tip, clears
  problematic GitHub token environment variables, and watches the run.
- `npx tsx scripts/github-workflow-run.ts deploy.yml --ref <branch-or-tag> --watch`
  - deploy a specific ref through the same wrapper.
- GitHub web UI: Actions tab -> "Deploy" workflow -> "Run workflow" button.

Typical flow: push to master, wait for CI green, then run `npm run deploy:prod` when you actually want the build live. This lets you batch multiple merges into one deploy. For docs-only release-state commits, CI may not start automatically because `ci.yml` is path-filtered; run `npm run ci:manual` before deploy.

The workflow wrappers use `scripts/github-workflow-run.ts`, which removes
`GITHUB_TOKEN` and `GH_TOKEN` from the child `gh` process. That avoids the
common agent failure where a limited PAT shadows local keyring auth and GitHub
returns `Resource not accessible by personal access token`.

The deploy job sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` so GitHub-hosted
JavaScript actions run under the upcoming Node 24 action runtime. If this
warning returns, treat it as release workflow maintenance and verify against
current Cloudflare/GitHub action guidance before changing action versions.

Key facts:

- The deploy workflow runs `cloudflare/wrangler-action@v3`, not Cloudflare Pages' Git integration. Cloudflare sees only the pre-built `dist/` directory.
- The deploy workflow must clone the private sibling repo
  `matthew-kissinger/game-field-kits` with `GAME_FIELD_KITS_DEPLOY_KEY`, then
  build the consumed `@game-field-kits/*` packages before TIJ runs `npm ci`.
  If that key, clone path, or sibling build fails, deploy is blocked before
  Pages upload.
- The Pages project has no build step configured on Cloudflare's side. The build is reproducible from `package-lock.json` plus `npm ci` inside the GitHub runner.
- The deploy workflow does a fresh checkout, `npm ci`, and `npm run build` every run. It does not rely on a CI artifact.
- `npm run build` writes a preview `dist/asset-manifest.json` from local or pinned R2 metadata so local retail previews can resolve required A Shau assets. After that, the deploy workflow runs `npm run cloudflare:assets:upload` with `TITJ_SKIP_R2_UPLOAD=1`, overwrites/refreshes `dist/asset-manifest.json`, and validates public size/content-type/cache/CORS before Pages upload.
- GitHub Actions fresh checkouts do not contain gitignored A Shau source files. For the current immutable objects, the asset script uses pinned R2 metadata in CI and validates the live object URLs. Local runs with source files present still hash and upload the real files.
- The GitHub `CLOUDFLARE_API_TOKEN` currently has enough permission for Pages Direct Upload but not R2 object writes. Update that secret to include Account -> Workers R2 Storage -> Edit before removing `TITJ_SKIP_R2_UPLOAD=1`.
- CI `perf` runs on every push, uploads artifacts, and is intentionally advisory. See `docs/DEVELOPMENT.md` for why.
- PRs do not auto-deploy. Preview deploys are not currently configured; see "Open Items" below.
- The build does not emit `.gz` or `.br` sidecar files. Cloudflare negotiates
  visitor-facing compression for supported content types, including JavaScript,
  CSS, JSON, fonts, and WASM, based on `Accept-Encoding` and zone compression
  rules. This keeps `dist/` and Pages uploads to the canonical assets only.
- Local evidence and deployed evidence are intentionally separate. `npm run
  evidence:atmosphere`, `npm run build`, and `npm run build:perf` prove the
  local preview bundle and local manifest path. They do not prove that the live
  Pages deployment is serving the same app shell, service worker,
  content-hashed build assets, Recast WASM asset, or R2 manifest/DEM URL.

Secrets used by the workflow: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

Wrangler status on 2026-04-22:

- `wrangler` is installed project-locally at `4.84.1`.
- `npm view wrangler version` also returned `4.84.1`.
- Cloudflare recommends project-local Wrangler; the workflow's `wrangler-action@v3` follows the supported Direct Upload path.

## 2. Freshness Contract

The production app must satisfy these rules:

1. A repeat visitor gets the newest HTML shell on the next visit after deploy.
2. Content-hashed build output can be cached for a year because the filename changes when content changes.
3. Non-hashed public assets, including GLBs, must revalidate and must not be pinned in Cache Storage.
4. The service worker must not serve a stale shell or stale GLB ahead of the network.
5. Cache rules must not overlap in ways that duplicate `Cache-Control` values.
6. `/asset-manifest.json` must report the final intended release git SHA after
   each manual deploy. If it reports an older SHA, production is stale even if
   the app appears to load.

This is the line between fast and stale:

- `build-assets/` is Vite output with content hashes. Cache it aggressively.
- `assets/`, `models/`, `manifest.json`, and `sw.js` are stable-path public assets. Revalidate them.
- `data/navmesh/` and `data/heightmaps/` are seed-keyed baked data. Cache them aggressively.
- `data/vietnam/` is a local development compatibility path today. Production
  resolves required A Shau DEM data through `asset-manifest.json`, which points
  at content-addressed Cloudflare R2 keys. If `asset-manifest.json` or the DEM
  URL returns HTML, any A Shau gameplay evidence is invalid; the runtime/probe
  should surface that as a required-asset failure, not a harmless fallback.

The repo now sets Vite `build.assetsDir = 'build-assets'` so generated bundle assets no longer share a URL namespace with mutable files copied from `public/assets/`.

### Navmesh Delivery By Mode

Cloudflare does not build navmesh data. GitHub Actions runs `npm run build`,
and the build's `prebuild` step runs `scripts/prebake-navmesh.ts` only when the
tracked seed assets are missing or `--force` is used. The seed-keyed assets for
Open Frontier, Zone Control, and TDM are committed under `public/data/navmesh/`
and `public/data/heightmaps/`, copied into `dist/`, and served by Pages with
immutable cache headers.

Current split:

- Open Frontier: five prebaked seeds in `MapSeedRegistry`.
- Zone Control: three prebaked seeds in `MapSeedRegistry`.
- Team Deathmatch: three prebaked seeds in `MapSeedRegistry`.
- AI Sandbox/combat120: procedural/small-map runtime path.
- A Shau Valley: no prebaked navmesh asset today. The DEM/rivers payloads are
  resolved through the Pages-hosted `asset-manifest.json` and immutable R2
  URLs, then `NavmeshSystem` builds static-tiled navigation at startup around
  scenario anchors. A Shau startup intentionally fails if terrain/nav evidence
  is missing instead of falling back to beeline-only movement.

Do not move navmesh binaries into the R2 manifest unless their size or variant
count becomes a Pages-upload problem. The current issue is not Cloudflare
delivery for prebaked modes; it is runtime route-follow quality and validation,
especially for A Shau.

### Local vs Live Evidence Gap

For A Shau and other asset-heavy modes, the dev gap is usually not TypeScript
logic; it is delivery shape:

- local dev may read gitignored compatibility files under `public/data/vietnam/`;
- local preview now reads generated `dist/asset-manifest.json` /
  `dist-perf/asset-manifest.json`;
- CI/deploy fresh checkouts rely on pinned R2 metadata unless the Cloudflare
  token can write R2;
- live production depends on Pages freshness, the service-worker update, the
  content-hashed build/WASM assets under `/build-assets/`, and the R2 URL in
  `/asset-manifest.json`.

Release evidence must bridge that gap. After deploy, rerun the header checks in
section 7 and open the live URL for at least one A Shau smoke plus one non-A
Shau mode smoke. If the live manifest, WASM, or service worker is stale, do not
reinterpret a local pass as deployed truth.

Docs-only release-state commits are still release commits. If a commit changes
what the repo claims about production, manually dispatch CI with
`npm run ci:manual`, then deploy and verify the live manifest before closing the
loop.

## 3. Cache-Control Strategy

The authoritative source is `public/_headers`, which Cloudflare Pages copies to `dist/_headers` during `npm run build`.

| Path pattern | Cache-Control | Why |
| --- | --- | --- |
| `/` and `/index.html` | `public, max-age=0, must-revalidate` | HTML must revalidate so it points at the current build's hashed files. |
| `/sw.js` | `public, max-age=0, must-revalidate` | A service-worker update must reach repeat visitors quickly. |
| `/build-assets/*` | `public, max-age=31536000, immutable` | Vite emits content-hashed filenames here, such as `index-<hash>.js`. |
| `/assets/*` | `public, max-age=0, must-revalidate` | Public assets copied from `public/assets/` are not guaranteed to be content-hashed. |
| `/models/*` | `public, max-age=0, must-revalidate` | GLBs are stable-path assets today; correctness beats avoiding 304 round-trips. |
| `/data/navmesh/*` | `public, max-age=31536000, immutable` | Pre-baked navmesh binaries are keyed by `<mode>-<seed>.bin`. |
| `/data/heightmaps/*` | `public, max-age=31536000, immutable` | Heightmaps are seed-keyed as `<mode>-<seed>.f32`. |
| `/data/vietnam/*` | `public, max-age=86400` | Local/development compatibility only until the R2 manifest pipeline owns terrain delivery. |
| `/asset-manifest.json` | `public, max-age=0, must-revalidate` | Small Pages-hosted manifest generated during deploy; must point at current R2 asset keys. |

Cloudflare Pages defaults unmatched static assets to revalidation with ETags. We still keep explicit rules for `sw.js` and `models/*` because stale service workers and stale GLBs are user-visible failures.

### Header Rule Gotcha

Cloudflare Pages applies every matching `_headers` rule. If the same header appears twice, values are joined with commas. Do not add a broad `Cache-Control` rule that overlaps a more specific one unless the more specific rule first detaches the old header.

This already bit `/data/navmesh/*` before 2026-04-16:

```text
Cache-Control: public, max-age=31536000, immutable, public, max-age=86400
```

Keep cache-control path groups non-overlapping.

## 4. Service Worker

`public/sw.js` is served from `/sw.js` and registered from `index.html` on `window.load`.

Current cache name:

```js
const CACHE_NAME = 'titj-v2-2026-04-21';
```

The `titj-v2-2026-04-21` bump is intentional. Activating this worker deletes the old `titj-v1` Cache Storage entries that could have pinned stale GLBs and stale HTML.

Strategy per URL:

| Request | Strategy |
| --- | --- |
| HTML navigation, `/`, `*.html` | network-first, cached only as offline fallback |
| `/build-assets/<content-hash>.*` | cache-first |
| `/data/navmesh/*.bin` | cache-first |
| `/data/heightmaps/*.f32` | cache-first |
| `/models/*` | network/browser HTTP cache only, no Cache Storage |
| `/assets/*` public assets | network/browser HTTP cache only, no Cache Storage |
| `/data/vietnam/*` | network/browser HTTP cache only, follows HTTP TTL; local dev fallback only |
| R2 manifest asset URLs | network/browser HTTP cache only; immutable payload cache handled by R2/Cloudflare HTTP headers |
| everything else | network/browser HTTP cache only |

Install uses `skipWaiting()`. Activate deletes old named caches, enables navigation preload where available, and calls `clients.claim()`.

Hard rule: do not add a broad service-worker cache-first fallback. Cache Storage is only for content-versioned resources.

## 5. Fresh Visit Flow

After a deploy:

1. Browser requests `/`.
2. Browser and service worker prefer the network for HTML.
3. Fresh HTML references the current `/build-assets/<hash>.js` and CSS files.
4. Hashed build assets are cache misses if new, then cached forever by HTTP and the service worker.
5. GLBs under `/models/` are fetched through HTTP revalidation instead of Cache Storage, so an updated model at the same path can propagate.
6. Old `titj-v1` Cache Storage is deleted once the v2 worker activates.

Expected result: users should not need a hard refresh for normal deploys. If a user visited before the v2 worker shipped and still reports stale behavior, first triage is DevTools -> Application -> Clear site data, then reload. That should become rare after the v2 worker has propagated.

## 6. Local And Prod Parity

### Tier 0: `npm run dev`

Vite dev server, HMR, no production build. Fastest loop. Does not exercise `_headers`, service worker update behavior, or compression.

### Tier 1: `npm run build && npm run preview`

Serves `dist/` through Vite preview. Closer to prod, but preview does not parse Cloudflare `_headers`.

Useful for checking that the bundled app boots and assets resolve with the same paths that prod will ship.

### Tier 2: `npm run smoke:prod`

`scripts/prod-smoke.ts` serves `dist/` through a local HTTP server, launches headless Chromium, clicks through title -> mode-select -> deploy, and fails on console errors, page errors, 4xx/5xx responses, or deploy-flow regressions.

This is the best local built-app gate, but it still does not validate Cloudflare response headers.

### Tier 3: Cloudflare header spot-check

After a deploy, run the commands in section 7 against `https://terror-in-the-jungle.pages.dev/`.

### Tier 4: Cross-browser fresh-load check

For deploys that touch GLBs, service worker policy, `public/assets`, or `index.html`, manually check:

- Chrome or Edge normal profile with prior site data.
- Firefox normal profile with prior site data.
- Safari if available, especially on iOS.
- A private/incognito window as a clean-client control.

The normal-profile check matters because it exercises the old-client update path.

## 7. Checking Prod Headers

One-shot audit command:

```bash
BASE=https://terror-in-the-jungle.pages.dev

for URL in \
  "$BASE/" \
  "$BASE/sw.js" \
  "$BASE/asset-manifest.json" \
  "$BASE/favicon.ico" \
  "$BASE/manifest.json" \
  "$BASE/models/vehicles/aircraft/a1-skyraider.glb" \
  "$BASE/assets/ui/icons/icon-fire.png" \
  "$BASE/data/navmesh/open_frontier-42.bin" \
  "$BASE/data/heightmaps/open_frontier-42.f32" \
  "$BASE/data/vietnam/a-shau-rivers.json"
do
  echo "=== $URL"
  curl -I -s "$URL" | grep -iE '^(cache-control|content-type|content-encoding|etag|cf-cache-status)'
done

# hashed build asset URLs change per build - scrape one from the live HTML first
ASSET=$(curl -s "$BASE/" | grep -oE 'build-assets/[^"]+\.js' | head -1)
echo "=== $BASE/$ASSET"
curl -I -s "$BASE/$ASSET" | grep -iE '^(cache-control|content-type|content-encoding|etag|cf-cache-status)'

R2_ASSET=$(curl -s "$BASE/asset-manifest.json" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.parse(s).assets['terrain.ashau.dem'].url))")
echo "=== $R2_ASSET"
curl -I -s -H "Origin: $BASE" "$R2_ASSET" | grep -iE '^(cache-control|content-type|content-length|access-control-allow-origin|access-control-expose-headers|accept-ranges|etag)'
```

Expected results:

- `/` : `Cache-Control: public, max-age=0, must-revalidate`
- `/sw.js` : `Cache-Control: public, max-age=0, must-revalidate`
- `/models/**/*.glb` : `Cache-Control: public, max-age=0, must-revalidate`
- `/assets/*` public files : `Cache-Control: public, max-age=0, must-revalidate`
- `/build-assets/<hash>.js` : `Cache-Control: public, max-age=31536000, immutable`
- `/data/navmesh/*.bin` : `Cache-Control: public, max-age=31536000, immutable`
- `/data/heightmaps/*.f32` : `Cache-Control: public, max-age=31536000, immutable`
- `/asset-manifest.json` : `Content-Type: application/json` and `Cache-Control: public, max-age=0, must-revalidate`
- R2 A Shau DEM URL from `asset-manifest.json` : `Content-Type: application/octet-stream`, exact `Content-Length`, `Access-Control-Allow-Origin: *` on Origin requests, and `Cache-Control: public, max-age=31536000, immutable`

Production caveat history: the 2026-04-21 deploy ran from a fresh checkout, and
`public/data/vietnam/` is gitignored. The live `/data/vietnam/a-shau-rivers.json`
check returned HTML, which proved A Shau runtime data was not deploy-reproducible
from GitHub. The 2026-04-22 R2 manifest pipeline fixed the delivery shape for
the primary DEM path, and the 2026-04-24 manual deploy verified the live Pages
freshness path: `/asset-manifest.json` served the release git SHA and R2 DEM
URL, stable shell assets revalidated, and hashed build/navmesh/WASM assets were
served immutable. This is a delivery/freshness proof; A Shau route-follow,
water/hydrology, and airfield quality still need gameplay validation.

If a header drifts from this table, inspect `public/_headers`, then `dist/_headers`, then the live Cloudflare Pages response.

## 8. Wrangler And API Keys

Local version check:

```bash
npx wrangler --version
npm view wrangler version
```

Manual direct upload, if needed:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=<account-id> npx wrangler pages deploy dist --project-name terror-in-the-jungle
```

Authentication is only needed for live Cloudflare operations: deploying, listing projects/deployments, or inspecting account-level configuration. Repo-local validation, header policy, and service-worker fixes do not require an API token.

## Open Items

- **Custom R2 domain.** Current validated asset URLs use `r2.dev`; attach a real custom domain before treating the R2 stack as final.
- **Expand content-hash model pipeline.** Primary A Shau DEM/rivers are in R2; future GLBs/large payloads should move through the same manifest after terrain is stable.
- **Cross-browser deploy gate.** Add a scripted browser matrix against the live Pages URL for Chrome/Edge and Firefox, with a manual Safari/iOS line item.
- **Cloudflare Pages PR previews.** Current flow deploys only when manually triggered. Add branch deploys if design or QA needs shareable preview URLs.
