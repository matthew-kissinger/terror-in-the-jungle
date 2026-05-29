<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# script-inventory-archival

Closes the owner-reported script drift ("stale scripts we can compress and
compose and align or archive"). The repo carries ~202 scripts including ~27
capture/one-off scripts referenced by nothing. Inventory, archive the dead
ones, keep CI + acceptance scripts intact.

## Files touched

- `scripts/**` (move unreferenced scripts to `scripts/archive/`)
- `package.json` (only if a script entry points at a moved/dead file)
- a short script inventory note under `docs/dev/` (if no index exists, add one)

## Scope

1. Build the reference graph: which `scripts/*` are referenced by
   `package.json`, CI, docs, or other scripts.
2. Move unreferenced scripts to `scripts/archive/` (do NOT hard-delete); keep a
   one-line inventory of what moved and why.
3. Verify every `package.json` script still resolves and runs.

## Non-goals

- Do NOT touch referenced scripts: anything in `package.json` (`cycle-validate`,
  `check-fence`, `lint-docs`, `perf-capture`, `prod-smoke`, `prebake-navmesh`,
  capture scripts) or any open task brief's acceptance (e.g.
  `capture-of-water-airfield-shots.ts`).
- No behavior changes to kept scripts.
- Do not touch `docs/**` prose (that is `doc-consolidation-and-refs`).

## Acceptance

- [ ] Every `scripts/*` is either referenced or under `scripts/archive/`.
- [ ] `npm run validate` (lint+test+build+smoke) passes; proves no CI script broke.
- [ ] PR vs master links this brief; names the gap (script drift); lists moved files.

## Round 2 / Dependencies

- No code deps. Must not collide with `doc-consolidation-and-refs` (docs vs
  scripts split).
