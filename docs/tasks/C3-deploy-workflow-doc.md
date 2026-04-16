# Task C3: Deploy workflow audit + documentation

**Phase:** C (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** low (doc + config inspection, minimal code change)
**Files touched:** `docs/DEPLOY_WORKFLOW.md` (new), possibly `vite.config.ts` cache headers if easy wins surface, possibly `public/_headers` (Cloudflare Pages cache control), possibly a service worker file

## Problem

The project deploys to Cloudflare Pages (`terror-in-the-jungle.pages.dev`) gated on CI. Open questions:

1. Are users getting the latest page? Cloudflare's default caching + Vite's filename-hashing may not be composing cleanly.
2. What are the actual `Cache-Control` headers on `index.html` vs `assets/*.js` vs `*.wasm`?
3. Is there a service worker (`sw.js` was visible in build output)? If so, does it correctly invalidate old assets?
4. Does a user who visited yesterday get today's build without a hard refresh?
5. Is there a preview-deploy flow (Cloudflare Pages PR previews) that we're not using?
6. Local-to-prod parity: `npm run dev` uses Vite dev server; `npm run build` + `npm run smoke:prod` tests prod-like; but prod is Cloudflare Pages with its own asset delivery. A local preview step or a Cloudflare Pages preview deploy would catch issues the current flow misses.

## Goal

A single authoritative `docs/DEPLOY_WORKFLOW.md` that documents:

1. The actual build → CI → Cloudflare Pages path.
2. Cache-control strategy per asset class (HTML, JS, CSS, WASM, images).
3. WASM delivery mechanism (relevant if C2 is also in flight).
4. How a user gets the freshest page (hard refresh, service worker flow, `no-cache` on index).
5. Local/prod parity testing — the recommended local preview flow.
6. How to check a prod deploy's effective headers (`curl -I`).

Plus, if easy wins surface during the audit:

- Fix `Cache-Control` on `index.html` to `no-cache` or `max-age=0, must-revalidate` via `public/_headers` (Cloudflare Pages convention).
- Configure long-lived cache (`max-age=31536000, immutable`) for hashed asset files.

## Required reading first

- `package.json` scripts: `build`, `smoke:prod`, any `deploy:*` entries.
- `vite.config.ts` — base path, build output.
- `docs/DEVELOPMENT.md` — existing dev workflow notes.
- `.github/workflows/*.yml` — CI gates before Cloudflare auto-deploy.
- Cloudflare Pages `_headers` convention: https://developers.cloudflare.com/pages/configuration/headers/
- Existing `dist/` after `npm run build` for what gets uploaded.

## Suggested steps

1. Read the current deploy flow. Write it down in plain prose.
2. `curl -I https://terror-in-the-jungle.pages.dev/` and note headers. Also for a hashed asset (`/assets/index-*.js`).
3. Check if a service worker exists (`/sw.js`) and what it caches.
4. Test: deploy current master, visit with cleared cache, then visit with cached. Does a new deploy propagate?
5. Write `docs/DEPLOY_WORKFLOW.md` capturing what you found.
6. If an obvious header issue exists (e.g. `index.html` has a long max-age), fix via `public/_headers` file.
7. Add a local preview command reference to `docs/DEVELOPMENT.md` if missing (e.g. `npm run preview` after `npm run build`).

## Verification

- `docs/DEPLOY_WORKFLOW.md` exists and answers the five bullet points above.
- If headers were changed: `npm run build` succeeds, `_headers` file is in `public/` (copied to `dist/` on build).
- If changed: after next Cloudflare deploy, `curl -I` confirms the new headers.

## Non-goals

- Don't migrate away from Cloudflare Pages.
- Don't add a new deploy pipeline.
- Don't rewrite CI.
- Don't touch fenced interfaces.

## Exit criteria

- `docs/DEPLOY_WORKFLOW.md` written, covering the five bullet points.
- Any cache-header easy-wins applied via `public/_headers`.
- PR titled `docs(deploy): document Cloudflare Pages deploy + cache strategy (C3)`.
- PR body summarizes what was audited and what (if anything) was fixed.
