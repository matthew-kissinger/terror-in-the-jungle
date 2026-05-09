# Task: worldbuilder-wiring

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1, Round 2)

## Goal

Wire the six WorldBuilder god-mode flags into their consumer engine
systems. Closes the six `worldbuilder-wiring` carry-overs spawned by
Phase 0 in `docs/CARRY_OVERS.md`.

## Why

Phase 0 ships the WorldBuilder console and publishes flags on
`window.__worldBuilder`. The flags exist and persist but aren't yet
honored by the engine. This task wires the consumers — minimally,
guardedly, behind `import.meta.env.DEV`.

## Required reading first

- `src/dev/worldBuilder/WorldBuilderConsole.ts` — see `WorldBuilderState`, `isWorldBuilderFlagActive()`
- `docs/dev/worldbuilder.md` — engine wiring status table + recommended consumer pattern
- `docs/TESTING.md` — behavior tests, not implementation-mirror
- `docs/INTERFACE_FENCE.md` — these wires must NOT modify `src/types/SystemInterfaces.ts`
- `docs/CARRY_OVERS.md` — the 6 carry-overs this task closes

## Files touched

### Source — six small targeted edits, each behind `import.meta.env.DEV` guard

| Flag | File | Surface to add |
|---|---|---|
| `invulnerable` | `src/systems/player/PlayerHealthSystem.ts` | `takeDamage()` early-return when active |
| `infiniteAmmo` | `src/systems/weapons/AmmoSupplySystem.ts` (or wherever ammo decrement happens — check via grep) | skip decrement when active |
| `noClip` | `src/systems/player/PlayerMovement.ts` | skip terrain-collision + gravity branch when active |
| `postProcessEnabled` | `src/systems/effects/PostProcessingManager.ts` (find by grep) | skip post-process pass when false |
| `forceTimeOfDay` | `src/systems/environment/atmosphere/AtmosphereSystem.ts` (find by grep) | when value !== -1, override simulation time to `value * dayLength` |
| `ambientAudioEnabled` | `src/systems/audio/AudioManager.ts` | scale ambient gain to 0 when false |

### Tests

For each consumer, add a behavior test that:
- Mocks `window.__worldBuilder` with the flag set
- Calls the consumer's existing public method (e.g. `takeDamage(50)`, `consume(1)`)
- Asserts the no-op behavior

Test files: prefer extending each system's existing `*.test.ts` rather than
creating new ones. If a system has no test file (e.g. `Airframe.ts`), still
do not extend the brief — this task is wiring, not coverage.

### NOT touched

- `src/types/SystemInterfaces.ts` — fenced. If wiring forces a fence change, **stop and report**. Use the `isWorldBuilderFlagActive` helper directly; do not extend any fenced interface.
- `src/dev/worldBuilder/WorldBuilderConsole.ts` — already complete in Phase 0.
- `src/core/GameEngine.ts` — already wires the panel.

## Steps

1. `npm ci --prefer-offline`.
2. Read the required reading.
3. **Locate each consumer surface** by grep. Confirm the file/method before editing. Examples:
   - `grep -rn "takeDamage" src/systems/player/PlayerHealthSystem.ts` — confirm method shape
   - `grep -rn "decrement\|consume\|setReserve" src/systems/weapons/AmmoSupplySystem.ts` — find ammo decrement
   - `grep -rn "renderPostProcessing\|postProcessing\|PostProcessingManager" src/systems/effects/` — find post-process pass
   - `grep -rn "setSimulationTime\|simSeconds" src/systems/environment/atmosphere/` — find time-of-day setter
   - `grep -rn "ambientGain\|setAmbientVolume" src/systems/audio/` — find ambient audio gain
4. **For each consumer, add the import + guard:**
   ```ts
   import { isWorldBuilderFlagActive } from '../../dev/worldBuilder/WorldBuilderConsole';

   takeDamage(amount: number, ...): boolean {
     if (import.meta.env.DEV && isWorldBuilderFlagActive('invulnerable')) {
       return false;
     }
     // existing flow…
   }
   ```
   - **Always behind `import.meta.env.DEV`.** Vite dead-code eliminates this in retail builds.
   - **Always early-return / no-op pattern.** Do not partial-apply.
   - **No new fenced interfaces.** The helper is a free function from a dev-only module.
5. **For `forceTimeOfDay`:** the value is `-1` for "follow live" or `0..1` for "force at this fraction of day cycle". Check current state shape in `WorldBuilderState`. Pseudocode:
   ```ts
   if (import.meta.env.DEV) {
     const wb = getWorldBuilderState();
     if (wb && wb.forceTimeOfDay >= 0) {
       const dayLen = currentPreset.todCycle?.dayLengthSeconds ?? 600;
       this.simulationTime = wb.forceTimeOfDay * dayLen;
       // skip natural advance
     }
   }
   // existing advance flow…
   ```
6. **For each consumer, add a test.** The mock pattern (from `WorldBuilderConsole.test.ts`):
   ```ts
   beforeEach(() => {
     (window as any).__worldBuilder = { invulnerable: true, /* defaults for others */ };
   });
   afterEach(() => { delete (window as any).__worldBuilder; });
   ```
7. Run `npm run lint`, `npm run typecheck`, `npm run test:run` — green.
8. Run `npm run perf:capture:combat120` — verify no regression (target ±2% p99).
9. **Run a 10-minute manual playtest:**
   - `npm run dev`, `?perf=1`, start a mode
   - `Shift+G` to open WorldBuilder
   - Toggle invulnerable → take damage from an NPC → confirm no health drop
   - Toggle infinite ammo → fire weapon → confirm no ammo decrement
   - Toggle no-clip → walk into terrain → confirm clipping
   - Toggle postProcess off → confirm visual flatness
   - Toggle ambient audio → confirm silence
   - Set forceTimeOfDay = 0.25 → confirm dawn lighting

## Verification

- `npm run lint` — clean
- `npm run lint:budget` — clean (each consumer file gains <10 LOC; no grandfather list change)
- `npm run typecheck` — clean
- `npm run test:run` — all green; new tests added for each wired flag
- `npm run perf:capture:combat120 && npm run perf:compare -- --scenario combat120` — p99 within ±2% of baseline
- Manual playtest — all 6 toggles produce the expected runtime effect (capture screenshot or short video and link in PR description)
- `docs/CARRY_OVERS.md` updated: 6 worldbuilder-wiring rows moved from Active to Closed

## Non-goals

- Do NOT extend `WorldBuilderState` with new flags. The 6 flags are the scope.
- Do NOT modify the `WorldBuilderConsole` UI — Phase 0 ships it.
- Do NOT modify `src/types/SystemInterfaces.ts`. If a wire seems to require it, stop and report — design alternative.
- Do NOT add invulnerable / infinite-ammo / no-clip behavior in retail builds. The DEV gate is non-negotiable.

## Branch + PR

- Branch: `task/worldbuilder-wiring`
- Commit: `feat(dev): wire WorldBuilder god-mode flags into engine consumers (worldbuilder-wiring)`
- PR description includes: 6 closed carry-over IDs, screenshot or short video evidence of each toggle's effect.

## Reviewer

- **combat-reviewer** must run pre-merge (touches `src/systems/player/`, `src/systems/weapons/`, `src/systems/combat/` adjacent paths). Per the Phase 0 reviewer-pre-merge rule.

## Playtest required: yes

10-min playtest checklist above must be exercised by a human (or a probe
that mirrors the manual sequence) before merge.

## Estimated diff size

~6 × ~15 LOC source edits = ~90 LOC source. ~6 × ~30 LOC test additions = ~180 LOC tests. Plus carry-over registry update. Net ~300 LOC. Within budget.
