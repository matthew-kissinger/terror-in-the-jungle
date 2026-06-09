# prune-prod-mockups

The 10 UI bake-off mockup directories under `public/mockups/` still ship in
every prod deploy as dead public routes — the Field Journal direction (03) won
2026-06-03 and is fully wired, so the mockups are reference material, not
product. Remove them from the prod build/deploy. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 5 — deletion
task.)

## Files touched

- `public/mockups/` (removed from prod build output — see Scope for how)
- `vite.config.ts` / build config (exclusion mechanism)
- `package.json` (knip.ignore mockup entries removed)

## Scope

1. Stop `public/mockups/01..10` shipping in `dist/`: either move the directory
   out of `public/` (e.g. to `mockups/` at repo root, kept as reference) or
   exclude it in the build — pick the simplest mechanism that keeps the files
   in git as reference but out of the deploy, and document the choice.
2. Remove the now-unneeded mockup entries from `package.json` knip.ignore.
3. Verify no runtime/dev code references `/mockups/` routes (grep); the
   `/mockups/` dev viewing route may remain only if it costs zero prod bytes.

## Non-goals

- Deleting the mockups from git history or the repo (they stay as reference).
- Any Field Journal UI changes.

## Acceptance

- [ ] `npm run build` output contains no `mockups/` files; report dist/ size
      before/after (baseline at phase open: 110.2 MB).
- [ ] `npm run knip:ci` still passes with the ignore entries removed.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
