# Task A5: Test triage — UI

**Phase:** A (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no (this task; UI *changes* would playtest, but test triage doesn't)
**Estimated risk:** low
**Files touched:** `src/ui/**/*.test.ts`

## Goal

Reduce implementation-mirror tests in `src/ui/` by 30-50% without losing behavior coverage. Preserve coverage of: HUD state machine transitions, prompt show/hide lifecycle, scoreboard update flow, vehicle UI context switching.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md` — `IHUDSystem` is fenced.

## Scope

All `*.test.ts` files under `src/ui/`. Glob: `src/ui/**/*.test.ts`.

## Steps

1. Classify each `it()`: behavior / implementation-mirror / redundant / broken.
2. DOM-structure snapshot tests are nearly always implementation-mirrors — delete or rewrite as "component renders the expected text / label given state X" behavior.
3. Preserve behavior tests for:
   - HUD phase transitions (menu → loading → playing → paused → ended) fire the right callbacks.
   - Interaction prompt shows and hides cleanly without stale state.
   - Kill feed entries appear in the right order and format.
   - Weapon switch display updates on `setActiveWeaponSlot`.
4. Note: many UI tests run under JSDom which lacks canvas/WebGL. Tests that would require real rendering are L4 playtest territory, not automated. Delete tests trying to assert visual behavior via JSDom.
5. Verify: `npm run lint`, `npm run test:run`, `npm run build`.

## Non-goals

- Don't modify UI implementations.
- Don't change `IHUDSystem` (fenced).
- Don't add a new test framework or rendering backend.

## Exit criteria

- Test count dropped by 30-50% (or report lean).
- Full suite green.
- PR titled `test: prune UI test drift (A5)`.
- PR body lists before/after counts.
