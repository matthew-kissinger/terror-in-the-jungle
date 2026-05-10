# Task: cloudflare-headers-file

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-stabilization-fixes` (Phase 2.5)

## Goal

Add `public/_headers` (Cloudflare Pages convention) emitting
`Strict-Transport-Security`, `Content-Security-Policy`, and
`Permissions-Policy` on every Pages response. Closes 3 of the security
findings from the 2026-05-09 audit.

## Why

The live deploy already serves COOP, COEP, X-Content-Type-Options nosniff,
X-Frame-Options DENY, and Referrer-Policy. The 3 missing headers are
common modern security baselines. Adding them via `public/_headers` is
zero runtime cost (Cloudflare attaches them at the edge) and keeps source
of truth in the repo.

CSP must be permissive (no blocks) on first ship — tighten later once RUM
data lands and we know what blocks would break.

## Required reading first

- `index.html` (top-of-doc `<link>` + `<script>` references — these define what the CSP must allow)
- `artifacts/live-audit-2026-05-09/CLOUDFLARE_ACCOUNT_AUDIT.md` "Pages config files" section
- `artifacts/live-audit-2026-05-09/FINDINGS.md` "Security" section
- Cloudflare Pages `_headers` docs: https://developers.cloudflare.com/pages/configuration/headers/

## Files touched

### Created

- `public/_headers` — header rules (≤30 LOC).

### Modified

- (None expected — `_headers` is a build-time copy through Vite's static asset pipeline.)

## Steps

1. `npm ci --prefer-offline`.
2. Read `index.html` to inventory:
   - Same-origin script sources (`/build-assets/*.js`)
   - WASM (`'wasm-unsafe-eval'` for recast-navigation)
   - Web Analytics beacon (`static.cloudflareinsights.com` if Web Analytics gets enabled in parallel; allowing it preemptively is fine)
   - R2 hosts (`https://pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev`)
   - Image data sources (`data:`, `blob:`)
   - Font sources (same-origin)
3. Create `public/_headers`:
   ```
   /*
     Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
     Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev; font-src 'self' data:; connect-src 'self' https://pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
     Permissions-Policy: geolocation=(), microphone=(), camera=(), gamepad=(self), fullscreen=(self)
   ```
4. Build the project: `npm run build`. Verify `dist/_headers` exists and matches the source.
5. **Local smoke**: `npx wrangler pages dev dist/` (if available) OR push to a preview deploy and verify headers via `curl -sI`.
6. Run `npm run lint`, `npm run test:run`, `npm run build` — all green (no source changes; build sanity only).

## Verification

- Local: `cat dist/_headers` matches `public/_headers` byte-for-byte
- After Pages preview deploy: `curl -sI https://<preview-url>/` returns the 3 new headers
- Game still loads, no console errors from CSP blocks (verify in browser DevTools)
- Smoke test: WebGL canvas renders, R2 terrain DEM fetch succeeds, audio plays

## Non-goals

- Do NOT tighten CSP to `nonce`-based or `strict-dynamic` in this PR — that requires HTML-injection support in the build, separate effort.
- Do NOT add `Content-Security-Policy-Report-Only` and a report endpoint — separate observability cycle.
- Do NOT modify `index.html` to add `<meta http-equiv="Content-Security-Policy">` — `_headers` is the right place.

## Branch + PR

- Branch: `task/cloudflare-headers-file`
- Commit: `chore(security): add public/_headers for HSTS + CSP + Permissions-Policy (cloudflare-headers-file)`
- PR description: link to FINDINGS.md, name the user-observable gap (3 missing security headers).

## Reviewer: none required (zero source change)

## Playtest required: no (browser smoke during verification covers it)

## Estimated diff size

~30 LOC (new file only). Within budget.
