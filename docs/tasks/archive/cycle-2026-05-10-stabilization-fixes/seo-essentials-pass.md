# Task: seo-essentials-pass

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-stabilization-fixes` (Phase 2.5)

## Goal

Three small SEO + performance hygiene fixes in one PR (no behavior
changes):

1. Add `public/robots.txt` (kills the "56 errors found" Lighthouse fail
   caused by SPA-fallback HTML being parsed as robots.txt).
2. Add `<meta name="description">` to `index.html` (closes the
   "Document does not have a meta description" Lighthouse fail).
3. Drop the 2 unused preload hints from `index.html`
   (`reticle-cobra-gun.png` and `reticle-rocket.png`) which trigger
   browser console warnings on every cold load.

## Why

Three findings from the 2026-05-09 Lighthouse + console audit. All three
are independent, low-risk, and trivially small. Bundled to keep the diff
single-PR and the orchestrator dispatch cheap.

Expected Lighthouse SEO score lift: 82/83 → ≥90 (desktop/mobile).

## Required reading first

- `index.html` (line ~7 has the existing `<meta name="viewport">`; ~ line 14-15 has the unused preloads)
- `artifacts/live-audit-2026-05-09/FINDINGS.md` "SEO / discoverability" + "Performance hygiene"
- Lighthouse report: `artifacts/live-audit-2026-05-09/report.json` (desktop) and `mobile/report.json`

## Files touched

### Created

- `public/robots.txt` — sane default (≤10 LOC):
  ```
  User-agent: *
  Allow: /

  # No sitemap.xml today; revisit when a real sitemap exists.
  ```

### Modified

- `index.html` — two edits:
  1. Add `<meta name="description" content="Browser-based 3D Vietnam-era combat game. Real-terrain A Shau Valley, helicopters, fixed-wing, NPC squad combat. WebGL.">` (or similar, kept under 160 chars per SEO best practice).
  2. Remove the 2 `<link rel="preload" as="image" href="./assets/ui/icons/reticle-cobra-gun.png">` and `reticle-rocket.png` lines.

## Steps

1. `npm ci --prefer-offline`.
2. Create `public/robots.txt` with the snippet above.
3. Edit `index.html`:
   - Add `<meta name="description" ...>` after the existing `<meta name="viewport">` line.
   - Remove the two reticle `<link rel="preload">` lines.
4. `npm run build`. Verify `dist/robots.txt` exists and `dist/index.html` has the new meta + no reticle preload tags.
5. (Optional) Re-run Lighthouse against `dist/` via `npx wrangler pages dev dist/` to confirm SEO score improvement.
6. Run `npm run lint`, `npm run test:run`, `npm run build` — all green.

## Verification

- After Pages preview: `curl -s https://<preview-url>/robots.txt` returns the text body (not SPA fallback HTML)
- `grep '<meta name="description"' dist/index.html` returns the new tag
- `grep 'reticle-cobra-gun\|reticle-rocket' dist/index.html` returns nothing
- Browser cold-load console: 0 "preloaded but not used within a few seconds" warnings (down from 2)
- Lighthouse SEO score ≥90 on both desktop and mobile

## Non-goals

- Do NOT add `llms.txt` in this PR (separate, optional, lower-priority).
- Do NOT add a real `sitemap.xml` — out of scope; the SPA has effectively one URL.
- Do NOT move the reticle PNGs to runtime preload at game-mode-pick time — keep this PR scoped to "drop the preload hints"; runtime preload would be a separate Phase 3+ optimization.
- Do NOT modify the `meta-viewport` `user-scalable=no` (intentional for touch UX).

## Branch + PR

- Branch: `task/seo-essentials-pass`
- Commit: `chore(seo): add robots.txt + meta description, drop 2 unused preload hints (seo-essentials-pass)`
- PR description: link to FINDINGS.md + Lighthouse reports, name the 3 user-observable gaps closed.

## Reviewer: none required (no source / runtime behavior change)

## Playtest required: no

## Estimated diff size

~15 lines (robots.txt new + 2 line changes in index.html). Within budget.
