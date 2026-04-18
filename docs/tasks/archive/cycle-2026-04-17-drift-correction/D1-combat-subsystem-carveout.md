# Task D1: Carve combat into first-class subsystem

**Phase:** D (serial, after Batch A+B+C merged)
**Depends on:** A2, B1, B3 (all merged)
**Blocks:** D2
**Playtest required:** yes
**Estimated risk:** medium (boundary change, no behavior change intended)
**Files touched:** `src/systems/combat/**`, new `docs/COMBAT.md`, possibly `src/types/SystemInterfaces.ts` (fence change — requires human sign-off)

## Goal

Combat becomes a coherent subsystem with a documented architecture, a clear public surface, and its own perf gate. No behavior change. The point is to **stop treating combat as "many scattered files under `src/systems/combat/`"** and start treating it as a named subsystem with internal boundaries.

## Why this matters

Combat is the hot loop and the chronic pain point — p99 frame time, NPC stall, AI response quality, faction behavior all live here. Currently these concerns are spread across ~15 files with no single owner document. Carving it out makes future work in combat:

1. Easier to reason about (one architecture doc).
2. Safer to change (clear internal boundaries).
3. Measurable (dedicated perf gate, not lost in general combat120 noise).

## Required reading first

- `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`.
- `docs/ARCHITECTURE.md` for the current system landscape.
- All files under `src/systems/combat/`.
- The merged A2, B1, B3 diffs (the combat loop you're carving is post-fix).

## Deliverables

1. **`docs/COMBAT.md`** (new) — architecture document for the combat subsystem. Covers:
   - Responsibilities (what combat does, what it doesn't).
   - Public surface (what other systems call into combat).
   - Internal layers (damage, targeting, AI state machine, cover, suppression, kill attribution).
   - Perf budget (target ms/frame at 120 NPCs, 240 NPCs).
   - Known issues and deferred work.
   - Testing guidance specific to combat (per `docs/TESTING.md`, what's L1/L2/L3 in combat).

2. **Combat-facing interface in `src/types/SystemInterfaces.ts`** (if needed) — consolidate what other systems actually call into combat. If the current callers already cross a clean boundary (e.g. just `CombatantSystem.update`), document that and don't add new interfaces. **Interface changes require fence-change approval** (see `docs/INTERFACE_FENCE.md`).

3. **Folder structure cleanup** (if warranted): if combat internals are tangled (circular imports, cross-layer reach-ins), refactor into cleaner sub-folders: `combat/ai/`, `combat/damage/`, `combat/targeting/`, `combat/suppression/`. **Do not** rename public exports. Internal moves only.

4. **A dedicated perf scenario** (optional but valuable): `npm run perf:capture:combat-only` or similar — a stripped-down capture that isolates combat cost from rendering and terrain. Add if the scenario doesn't already exist.

## Steps

1. Read the combat tree. Make notes on what talks to what.
2. Draft `docs/COMBAT.md` based on the current shape (not aspirational).
3. Identify real boundary problems (if any). If none, say so in the doc and stop.
4. If folder refactor is warranted, move files — but *all imports must update in the same PR*. No staged half-moves.
5. If a fence change is proposed, stop and surface to human before proceeding.
6. Run full verification: lint, test, build, probe, perf (combat120 and openfrontier:short). Playtest combat feel — enemies respond, squads fight.

## Verification

- `npm run lint`, `npm run test:run`, `npm run build` green.
- `npm run perf:capture:combat120` shows no regression vs pre-D1 master.
- `npm run perf:capture:openfrontier:short` same.
- **Playtest:** combat feels unchanged. No observable behavior drift.
- `docs/COMBAT.md` exists and is accurate.

## Non-goals

- **No behavior change.** D1 is a carve-out, not a feature pass.
- Do not start faction doctrine AI (D2).
- Do not rewrite the AI state machine.
- Do not touch vehicle or helicopter code.
- Do not introduce a new test framework or runtime.

## Exit criteria

- `docs/COMBAT.md` landed.
- Folder structure (if changed) is cleaner.
- Perf unchanged vs baseline.
- PR titled `refactor(combat): carve into first-class subsystem with docs (D1)`.
- If fence change was needed: title includes `[interface-change]` and human approved.
- Flagged **playtest-pending**.
