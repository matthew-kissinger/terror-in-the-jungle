<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# export-surface-remediation

Standalone code-quality hygiene pass (no existing DIRECTIVES.md row —
verified 2026-06-30, DEFEKT-2 is the doc/artifact drift gate and is
unrelated; do not cite it). `npm run deadcode` (knip) currently reports 90
unused exports, 181 unused exported types, 1 duplicate export, and 3
configuration hints across ~118 files. None are unused FILES or unused
DEPENDENCIES — this is export-visibility trimming (values/types exported
but only ever used within their own file), not a dead-module deletion.

## Files touched

- Round 1 (this brief): `src/systems/**` + `package.json` only (~72 files
  per the deadcode scan at brief-writing time — the exact list may have
  drifted slightly). No file is out of bounds within `src/systems/**` as
  long as the only change is removing an unnecessary `export` keyword,
  deleting a genuinely unused symbol, or the 3 config-hint fixes below.
- Round 2+ (separate follow-on brief, NOT this PR): `src/ui/**`,
  `src/core/**`, `src/config/**`, `src/ecs/**`, `src/dev/**`,
  `src/test-utils/**`, `scripts/**` — roughly 46 remaining files.

## Scope

1. For each flagged export under `src/systems/**`: if nothing outside its
   own file imports it, remove the `export` keyword (keep the symbol, just
   make it file-local) unless the symbol is genuinely dead code with zero
   internal use either — in that case delete it. Do NOT remove `export`
   from anything re-exported through a barrel file or imported only by a
   `*.test.ts` you haven't also checked.
2. Resolve the 1 duplicate export: `NPC_SPRITE_HEIGHT`/`NPC_CLOSE_MODEL_TARGET_HEIGHT`
   in `src/systems/combat/CombatantMeshFactory.ts` — knip flags this as
   exported twice from the same module (they're value-equal aliases; a
   sibling test file and `CombatantRenderer.ts` each import one of the two
   names). Consolidate to one export site and update those 2-3 consumer
   imports in the same PR.
3. Fix the 3 config hints in `package.json`: remove/move the unused
   top-level `index.html` entry per knip's "workspaces" suggestion,
   remove `gh` from `ignoreBinaries` (unused entry), remove the redundant
   `src/main.ts` entry pattern. Verify `npm run build` still succeeds
   after each.
4. Re-run `npm run deadcode` after your changes; the unused-exports and
   unused-exported-types counts for `src/systems/**` should both drop to 0
   (or you've identified and left a documented false-positive, e.g. a
   genuinely public API surface knip can't trace). The `src/ui/**` /
   `src/core/**` / etc. counts will stay nonzero — that's Round 2's job,
   not a defect in this PR.
5. Even Round 1 (~72 files) is likely to land near or past the
   ~400-net-line small-diffs guideline in `docs/AGENT_ORCHESTRATION.md`
   once every single-line `export` removal is counted across that many
   files. Default to splitting further by directory (e.g.
   `src/systems/vehicle/**`, 21 files, then `src/systems/combat/**`,
   20 files, as their own sub-rounds) rather than assuming Round 1 fits in
   one PR. This is export-keyword removal, not a "large retired-code
   deletion" — don't invoke that exception; just keep splitting until each
   PR is reviewably small.

## Non-goals

- Do not restructure, rename, or "clean up" surrounding code beyond the
  export-keyword/symbol change itself.
- Do not touch files knip did NOT flag, even if they look similar.
- Do not touch `src/ui/**`, `src/core/**`, `src/config/**`, `src/ecs/**`,
  `src/dev/**`, `src/test-utils/**`, or `scripts/**` in this PR — that's
  Round 2, a separate brief.
- Do not chase the 176-ref doc/artifact backlog tracked by DEFEKT-2
  (`scripts/doc-drift.ts --full`, see `docs/DIRECTIVES.md`) — that is a
  different tool (doc-drift, not knip) and a different, already-scoped
  directive. This brief has no directive ID; don't invent one in the PR.

## Acceptance

- [ ] `npm run deadcode` reports 0 unused exports and 0 unused exported
      types under `src/systems/**`, and 0 duplicate exports repo-wide (or
      documents an explicit false-positive exception with a one-line
      reason).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] `npm run lint:budget` stays green (pure deletions/keyword removal
      should only shrink files, never grow one past its ratchet snapshot).
- [ ] PR opened against `master` with link to this brief. PR description
      states this is standalone export-hygiene cleanup with no directive
      ID (do not claim DEFEKT-2 or any other directive).
- [ ] This diff touches `src/systems/combat/**` and `src/systems/terrain/**`
      — combat-reviewer and/or terrain-nav-reviewer will gate per the
      normal path-trigger rule in `docs/AGENT_ORCHESTRATION.md`; expect
      that gate even though the change is mechanical.

## Round 2 / Dependencies (optional)

- Blocks: a follow-on `export-surface-remediation-round2` brief (not yet
  written) covering `src/ui/**` + `src/core/**` + `src/config/**` +
  `src/ecs/**` + `src/dev/**` + `src/test-utils/**` + `scripts/**`
  (~46 files) plus the residual `src/systems/**` count if this round
  doesn't fully zero it out.
