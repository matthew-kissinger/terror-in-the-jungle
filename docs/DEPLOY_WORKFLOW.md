# Deploy Workflow

Last updated: 2026-04-16

Production: https://terror-in-the-jungle.pages.dev/

This document captures how `master` becomes a live deploy, how caching is layered across Cloudflare Pages + the service worker + the browser, and how to verify prod headers when something looks stale.

## 1. Build to deploy path

All deploys go through GitHub Actions. There is no manual `wrangler deploy`.

```
push to master
  -> .github/workflows/ci.yml
       lint  ---\
       test  ----+-- (parallel)
       build ---/    uploads dist artifact
       smoke  ---\
       mobile-ui -+-- (needs: lint, test)
       perf   (advisory, never blocks)

     deploy (needs: lint, test, build, smoke, mobile-ui, perf)
       - downloads dist artifact from build job
       - cloudflare/wrangler-action@v3
       - command: pages deploy dist --project-name terror-in-the-jungle
```

Key facts:

- The deploy job runs `cloudflare/wrangler-action@v3`, **not** Cloudflare Pages' Git integration. Cloudflare sees only the pre-built `dist/` directory.
- Because we upload a built artifact, the Pages project has no build step configured on Cloudflare's side. The build is fully reproducible from `package-lock.json` + `npm ci` inside the GitHub runner.
- `perf` runs on every push, uploads artifacts, and is intentionally advisory — see `docs/DEVELOPMENT.md` for why (Xvfb/GPU noise on hosted runners).
- The deploy job is gated by `if: github.ref == 'refs/heads/master' && github.event_name == 'push'`. PRs do not auto-deploy. Preview deploys are not currently configured; see "Open items" below.

Secrets used: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (repo secrets).

## 2. Cache-control strategy

The authoritative source is `public/_headers` (Cloudflare Pages convention — copied verbatim to `dist/_headers` on build).

| Path pattern                        | Cache-Control                                | Why |
|-------------------------------------|----------------------------------------------|-----|
| `/` and `/index.html`               | `public, max-age=0, must-revalidate`         | HTML must revalidate so `<script src="/assets/index-<hash>.js">` points at the current build. |
| `/assets/*`                         | `public, max-age=31536000, immutable`        | Vite emits content-hashed filenames (e.g. `index-BCOHw9O9.js`). Safe to cache forever. |
| `/data/navmesh/*`                   | `public, max-age=31536000, immutable`        | Pre-baked navmesh binaries are keyed by `<mode>-<seed>.bin`; content changes imply filename changes. |
| `/data/heightmaps/*`                | `public, max-age=31536000, immutable`        | Heightmaps are also seed-keyed (`<mode>-<seed>.f32`). Safe to treat as immutable. |
| `/data/vietnam/*`                   | `public, max-age=86400`                      | A Shau Valley static JSON — rarely changes, but not content-hashed, so modest TTL. |

Beyond `_headers`, Cloudflare Pages applies its own default on anything unmatched:

- `Cache-Control: public, max-age=0, must-revalidate`

That default is why:

- `/favicon.ico`, `/manifest.json`, `/sw.js` — revalidate on every load. Correct behavior.
- `/models/**/*.glb` — **also** revalidate on every load. The 75 GLB models under `public/models/` are not content-hashed and have no explicit cache rule, so every page visit pays a 304 round-trip per model. Not ideal (models are multi-MB), but the tradeoff of long-caching non-hashed assets is worse (in-place updates wouldn't propagate). A future improvement is to either hash model filenames at build time or set a modest `max-age=3600` rule for `/models/*`.

### Known caveat: `/assets/ui/` is non-hashed

`public/assets/ui/icons/*.png` and `public/assets/ui/screens/*.webp` get copied into `dist/assets/`, so they match the `/assets/*` rule and are cached as `immutable`. They are **not** content-hashed. If an icon is ever updated in place under the same filename, older clients will not pick up the change until their year-long cache expires.

Mitigations if this bites:

- Rename the updated file (bump a suffix: `icon-foo.v2.png`) and update references.
- Or move `public/assets/ui/` to `public/ui/` so it no longer matches the immutable rule (requires updating every `src/ui/**/*.ts` reference plus `index.html` preloads).

### Fixed on 2026-04-16: duplicated Cache-Control on `/data/` paths

Before this audit, `_headers` had both `/data/navmesh/*` and a broad `/data/*` rule. Cloudflare Pages merges `Cache-Control` from **every** matching section, so responses under `/data/navmesh/*.bin` came back as:

```
Cache-Control: public, max-age=31536000, immutable, public, max-age=86400
```

Browsers interpreted the concatenated header conservatively (closer to `max-age=86400`), so navmesh binaries were revalidating every 24 h instead of being treated as immutable.

Fix: split `/data/*` into explicit non-overlapping subpath rules (`/data/navmesh/*`, `/data/heightmaps/*`, `/data/vietnam/*`) so exactly one rule matches any given URL. Verify after deploy with:

```bash
curl -I https://terror-in-the-jungle.pages.dev/data/navmesh/open_frontier-42.bin | grep -i cache-control
# should return a single Cache-Control value, not a comma-chained pair.
```

## 3. Service worker

`public/sw.js` is served from the site root at `/sw.js`. It registers on `window.load` from `index.html`:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
</script>
```

Strategy per URL:

| Request                        | Strategy                   |
|--------------------------------|----------------------------|
| `/assets/*`                    | cache-first (treated as immutable) |
| `/data/navmesh/*.bin`          | cache-first                |
| `/data/*` (other)              | cache-first                |
| HTML navigations (`mode: 'navigate'` or `*.html`) | stale-while-revalidate |
| everything else                | cache-first                |

Install: `skipWaiting()` so a new SW activates without waiting for open tabs to close. Activate: `clients.claim()` to control the current page immediately, plus delete any cache with a name other than the current `CACHE_NAME` (`titj-v1`).

**Cache bust:** increment `CACHE_NAME` in `public/sw.js` (e.g. `'titj-v2'`). Next SW activation drops the old cache entirely. Do this if you ship a regression that the SW has pinned on users' machines.

Note: the SW is itself served with `max-age=0, must-revalidate` (Cloudflare default for root-level `.js`), so the SW file update propagates on the next page load — no stale-SW lockout risk.

## 4. How a user gets the freshest page

The interaction of `_headers`, the SW, and the browser cache is:

1. Browser requests `/`. Response is `max-age=0, must-revalidate`; browser always revalidates.
2. Browser gets the latest `index.html`, which references a new set of hashed asset filenames (if the build changed).
3. For each `/assets/<hash>.js|.css`, the SW intercepts. New hashes are cache-misses in the SW; it fetches from network and caches. Old hashes linger in the cache but are never requested again; they get pruned on next SW version bump.
4. HTML navigation is stale-while-revalidate: the user sees the previously cached shell immediately while the SW fetches the fresh one in the background for the next load.

Net effect: **a user who visited yesterday gets today's build on their next visit** without a hard refresh. There is a one-visit lag on SW-updated HTML (the first load after a deploy shows the old HTML; the second shows the new one). Hashed assets are always correct because `index.html` pins them by name.

### When to force a hard refresh

Only needed if:

- You bumped `CACHE_NAME` in `sw.js` and want to confirm the old cache was dropped.
- Someone is reporting stale behavior after a deploy — ask them to `Ctrl+Shift+R` (or clear site data from DevTools Application tab) as a first triage step.

Under normal operation, users never need to hard-refresh.

## 5. Local/prod parity testing

Tiered options, in order of fidelity:

### Tier 0: `npm run dev`
Vite dev server, HMR, no production build. Fastest loop. Does **not** exercise `_headers`, service worker, or compression. Use for active coding; don't use to verify deploy correctness.

### Tier 1: `npm run build && npm run preview`
Vite's built-in preview server. Serves `dist/` over a local HTTP server. Closer to prod but still doesn't apply `_headers` (preview doesn't parse Cloudflare's format) and does not run the service worker registration against the correct origin semantics unless you open it on `http://localhost:<port>`.

Useful for: smoke-checking that the bundled app boots, assets resolve, and there are no MIME or 404 issues.

### Tier 2: `npm run smoke:prod`
`scripts/prod-smoke.ts` spawns a local `http.createServer` over `dist/`, launches headless Chromium, clicks through the title → mode-select → deploy flow, and fails on console errors, page errors, 4xx/5xx responses, or deploy-flow regressions. This is what the CI `smoke` job runs.

Does not verify `_headers` either — but it's the most-complete local smoke for "does the built app work end-to-end."

### Tier 3: prod-header spot-check
After a push to `master` and a successful deploy, confirm the live headers match expectations:

```bash
# index.html should be no-cache
curl -I https://terror-in-the-jungle.pages.dev/ | grep -i cache-control

# hashed asset should be immutable
curl -I https://terror-in-the-jungle.pages.dev/assets/index-<hash>.js | grep -i cache-control

# service worker should be no-cache
curl -I https://terror-in-the-jungle.pages.dev/sw.js | grep -i cache-control

# navmesh should be immutable (single value, not concatenated)
curl -I https://terror-in-the-jungle.pages.dev/data/navmesh/open_frontier-42.bin | grep -i cache-control
```

See section 6 for the full header spot-check command set.

### What's missing: Cloudflare Pages PR previews

Cloudflare Pages supports per-PR preview deploys via its Git integration, but because our deploy is wrangler-action-based, we don't get those. If preview deploys become important (e.g. for design review), options:

- Add a separate `preview` workflow that runs `wrangler pages deploy dist --project-name terror-in-the-jungle --branch pr-${{ github.event.number }}` on PR open/sync. Cloudflare Pages exposes branch deploys as `pr-<n>.terror-in-the-jungle.pages.dev`.
- Or switch to Cloudflare's Git integration (loses the "CI gates deploy" guarantee; Cloudflare builds independently).

Keeping the current flow until preview deploys are demanded.

## 6. Checking prod headers

One-shot audit command (paste into any shell):

```bash
BASE=https://terror-in-the-jungle.pages.dev

for URL in \
  "$BASE/" \
  "$BASE/sw.js" \
  "$BASE/favicon.ico" \
  "$BASE/manifest.json" \
  "$BASE/data/navmesh/open_frontier-42.bin" \
  "$BASE/data/heightmaps/open_frontier-42.f32" \
  "$BASE/data/vietnam/a-shau-rivers.json"
do
  echo "=== $URL"
  curl -I -s "$URL" | grep -iE '^(cache-control|content-type|content-encoding|etag)'
done

# hashed asset URLs change per build — scrape one from the live HTML first
ASSET=$(curl -s "$BASE/" | grep -oE 'assets/[^"]+\.js' | head -1)
echo "=== $BASE/$ASSET"
curl -I -s "$BASE/$ASSET" | grep -iE '^(cache-control|content-type|content-encoding|etag)'
```

Expected results today:

- `/` : `Cache-Control: public, max-age=0, must-revalidate`, `Content-Type: text/html; charset=utf-8`
- `/sw.js` : `Cache-Control: public, max-age=0, must-revalidate`, `Content-Type: application/javascript`
- `/favicon.ico` : `Cache-Control: public, max-age=0, must-revalidate` (default)
- `/manifest.json` : `Cache-Control: public, max-age=0, must-revalidate` (default)
- `/data/navmesh/*.bin` : `Cache-Control: public, max-age=31536000, immutable` (single value, post-fix)
- `/data/heightmaps/*.f32` : `Cache-Control: public, max-age=31536000, immutable`
- `/data/vietnam/*.json` : `Cache-Control: public, max-age=86400`
- `/assets/<hash>.js` : `Cache-Control: public, max-age=31536000, immutable`

If a header drifts from this table, the `_headers` file or the Cloudflare Pages default changed — check `public/_headers` in the current build first, then the Pages project config.

## Open items (not fixed in this audit)

- **GLB models have no cache rule.** Every visit revalidates all 75 models. Fix is either content-hashing GLB names or adding a `/models/*` rule with a short `max-age`. Neither is trivial and neither is a correctness bug, so left for a follow-up.
- **Non-hashed PNGs under `/assets/ui/`** inherit the immutable rule. If icon churn becomes a thing, move them to `/ui/` or add an explicit override.
- **No PR preview deploys.** Current gate is "master push only." Fine for a single-maintainer cadence; revisit if design collaboration needs a shared preview URL.
