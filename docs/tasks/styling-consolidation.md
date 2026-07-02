# Task: styling-consolidation

Cycle: 2026-07-02 greenlight-followthrough (manifest U1/U2)

## Goal

Mechanical consolidation of UI styling hygiene. Player-visible output must be
byte-identical wherever possible — this is hygiene, not redesign.

## Scope (delivered)

This is a deliberately **partial-but-safe** slice. Full Part 1 (migrating all 18
runtime `createElement('style')` / `injectStyles` sites to CSS Modules) was
descoped: it would balloon the diff well past the 400-line ceiling and carry real
byte-identical risk across a wide surface. Instead this PR delivers the four
lowest-risk, drift-preventing pieces:

1. **Part 2 — collapse the duplicated shared-primitive layer.** `TitleScreen` was
   the *only* consumer of the `fj-*` classes injected by `src/ui/design/styles.ts`
   (specifically `fj-paperclip` and `fj-stamp`). Migrated those two onto new
   `paperclip` / `stamp` primitives in `ScreenPrimitives.module.css` (byte-identical
   rules), then removed the now-unconsumed `fieldJournalPrimitives` block, the
   `fj-*` keyframes, and the dead `createTextureLayers()` export from
   `design/styles.ts`. The `--ds-*` CSS-variable injection is KEPT (brief guidance:
   verify no other consumers before removing — they have none in `src`, but removing
   a public token mirror is out of scope-risk for a hygiene pass).

2. **Part 3 — token-source parity guard.** New unit test parses
   `primitives.css` + `theme.css` and asserts the duplicated palette / z-index
   values match `tokens.ts`. Hand-synced parallel sources now fail CI on drift.

3. **Part 4 — freeze rule.** ESLint `no-restricted-syntax` ban on NEW
   `document.createElement('style')` under `src/ui/**`, with an explicit allowlist
   for the files that still legitimately inject at runtime (the descoped Part 1
   set + the sibling-task-owned excluded files). Documented inline.

## Non-goals / descoped

- Part 1 full migration of the 18 runtime style-injection sites to CSS Modules
  (documented in the freeze-rule allowlist; future cycle).
- Removing the `--ds-*` variable mirror or `ds-*` shared keyframes (no consumers,
  but out of scope-risk for a byte-identical pass).
- Any file owned by a sibling task: `HudControlHints.ts`, `VehicleActionBar.ts`,
  `SmokeMarkerPrompt.ts`, `GrenadeMeter.ts`, `AirSupportRadioMenu.ts`,
  `FixedWingHUD.ts`, anything under the orbital map directory (deleted in the
  same wave by task/orbital-map-prune, PR #477).

## Validation

- `npm run typecheck`
- `npm run lint` (new freeze rule green)
- `npm run test:run -- src/ui/design src/ui/screens`
