# npc-imposter-distance-priority: extend close-model distance + on-screen-aware selection + velocity-keyed billboard cadence

**Slug:** `npc-imposter-distance-priority`
**Cycle:** `cycle-2026-05-08-perception-and-stuck`
**Round:** 1
**Priority:** P0 — at 64 m NPCs become static billboards. From altitude this dominates the "world is frozen over there" effect even when AI is fine.
**Playtest required:** YES
**Estimated risk:** medium — selection priority change affects what the player sees; cap of 8 close models stays unchanged so GPU cost is flat.
**Budget:** ≤350 LOC including tests.

## Files touched

- Modify: `src/systems/combat/PixelForgeNpcRuntime.ts` — read distance from a config object instead of the hardcoded 64 m.
- Modify: `src/systems/combat/CombatantRenderer.ts` — replace closest-N close-model selection with a priority score (on-screen + player-squad + 1/distance + recently-visible).
- Add or extend: the impostor frame-swap call site (grep this file for the time-based cadence — `walkFrame`, `impostor`, frame swap — and switch to velocity-keyed cadence).
- Modify: `src/ui/debug/tuning/tuneCombat.ts` — add a "PixelForge" subfolder or new keys for the new tunables.
- Add or extend tests: `src/systems/combat/PixelForgeNpcRuntime.test.ts`, `src/systems/combat/CombatantRenderer.test.ts` (or create `*.closeModelPriority.test.ts` if file is large).

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md`
- `src/systems/combat/PixelForgeNpcRuntime.ts` lines 1-170 (distance + cap constants, weapon table for context).
- `src/systems/combat/CombatantRenderer.ts` lines 800-950 (close-model selection block — confirm exact lines before edit; the brief assumes ~815-895).
- `src/ui/debug/tuning/tuneCombat.ts` (full file — small; mirror its pattern).
- The existing impostor frame-swap module — grep for `walkFrame|impostorFrame|frameIndex|advanceFrame` inside `src/systems/combat/` and `src/rendering/`.

## Diagnosis

`PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS = 64` at `PixelForgeNpcRuntime.ts:46` switches NPCs to static billboards beyond 64 m. The cap is 8 close models (`:49`). `CombatantRenderer.ts` selects the 8 closest by raw distance, ignoring whether they're on-screen — so when the camera turns, slots can be wasted on NPCs behind the camera.

User feedback: imposter distance should be much farther so flyovers see distant NPCs as 3D actors, and groups stuck under the impostor static-frame should appear to move when they have non-zero velocity.

## Fix

### B1 — Bump close-model distance, config-driven

Add a runtime-mutable config at the top of `PixelForgeNpcRuntime.ts`:

```ts
export const PixelForgeNpcDistanceConfig = {
  closeModelDistanceMeters: 120,
  onScreenWeight: 10,
  squadWeight: 4,
  distanceWeight: 1,
  recentlyVisibleWeight: 0.5,
  recentlyVisibleMs: 800,
  idleVelocitySq: 0.04, // (0.2 m/s)^2
  framesPerMeter: 1 / 0.6, // ~1 cycle per 0.6 m of travel
};
```

Keep the existing constant exports (`PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS`, `PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_SQ`) but compute them from the config — or replace consumers with reads from the config (preferred). If callers only read at startup, change them to read on each invocation. Squared distance helper should also be live (`closeModelDistanceMeters * closeModelDistanceMeters`).

Cap (`PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP = 8`) stays unchanged — GPU memory unchanged.

### B2 — Priority score replacing closest-N selection

In `CombatantRenderer.ts`, locate the close-model selection block (around lines 815-895). Today it sorts candidates by `distanceToSquared` and takes the 8 closest. Replace with a priority score:

```
score = onScreenWeight * (isOnScreen ? 1 : 0)
      + squadWeight * (combatant.squadId === playerSquadId ? 1 : 0)
      + distanceWeight * (1 / Math.max(d, 4))
      + recentlyVisibleWeight * (recentlyVisible ? 1 : 0)
```

- `isOnScreen`: cheap frustum-AABB on the existing camera frustum. If `Frustum` is already accessed in this file, reuse it; otherwise pass it in from the caller.
- `recentlyVisible`: track per-combatant `lastVisibleAtMs` (transient state — keep on a `Map<string, number>` owned by the renderer, NOT on `Combatant`). Update on each on-screen pass. `recentlyVisible := now - lastVisibleAtMs <= recentlyVisibleMs`.

Keep the candidate set bound to `closeModelDistanceMeters` (within radius). Sort by descending score and take the top `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP`.

### B3 — Velocity-keyed billboard frame cadence

Find the impostor frame-swap module. The current cadence is time-based (frame N at time T). Replace with velocity-keyed:

```
if (velocity.lengthSq() < idleVelocitySq) {
  // Hold idle frame.
  combatant.impostorFrame = IMPOSTOR_IDLE_FRAME;
} else {
  // Cycle frames at framesPerMeter * distanceTraveledThisTick.
  combatant._impostorFrameAccumulator += velocity.length() * deltaTime * framesPerMeter;
  combatant.impostorFrame = (Math.floor(combatant._impostorFrameAccumulator) % NUM_FRAMES);
}
```

Implementation will need a small accumulator field. Prefer keeping it on a renderer-owned `Map` rather than adding a field to `Combatant` (avoids broadening the interface fence).

If the impostor module's frame indexing is owned by a separate atlas helper, edit that helper. If it's inline in `PixelForgeNpcRuntime.ts` or `CombatantRenderer.ts`, edit there.

### B4 — Tweakpane

Mirror `tuneCombat.ts` and add a "PixelForge" subfolder (or extend the existing Combat folder). Bind the four most useful knobs:

- `pixelForge.closeModelDistanceMeters` (number, min 64, max 200, step 4)
- `pixelForge.onScreenWeight` (number, min 0, max 50, step 1)
- `pixelForge.squadWeight` (number, min 0, max 50, step 1)
- `pixelForge.recentlyVisibleMs` (number, min 0, max 3000, step 100)

Less critical knobs (distance weight, frame cadence) can stay code-only.

## Steps

1. Read "Required reading first."
2. Add `PixelForgeNpcDistanceConfig`. Update existing constant exports to compute from config.
3. Implement B2 priority score. Add `recentlyVisibleMap` to renderer.
4. Locate impostor frame-swap module; implement B3 velocity-keyed cadence.
5. Wire `tuneCombat.ts` knobs.
6. Add behavior tests:
   - 12 NPCs in 110 m radius — assert 8 selected; on-screen always preferred over off-screen; player-squad members always selected when in radius.
   - Impostor cadence: stationary NPC holds same frame across 60 frames; NPC at 4 m/s cycles N frames over 1 s with N within ±1 of expected.
7. `npm run lint && npm run test:run && npm run build`. Green.
8. Commit. Branch `task/npc-imposter-distance-priority`.
9. Push branch. **DO NOT run `gh pr create`.** Orchestrator integrates separately.
10. Report.

## Verification (local)

- `npm run lint`
- `npm run test:run`
- `npm run build`

## Non-goals

- Do NOT change `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP`. GPU budget stays.
- Do NOT add new GLB assets, atlases, or impostor frames.
- Do NOT add a separate flag for "always render close model regardless of distance" — that defeats the cap.
- Do NOT couple to Issue A's `NpcLodConfig`. Use a renderer-local config so the two tasks can land independently.
- Do NOT widen any interface in `src/types/SystemInterfaces.ts`.

## Hard stops

- Fence change required → STOP. Report.
- The impostor frame-swap call site cannot be localized in <30 minutes of grepping → STOP. Report what you found and the exact files searched.
- Selection priority replacement causes visible flicker (close-model thrashing across frames) that you cannot resolve with `recentlyVisibleMs` debounce → STOP. Report.

## Report back

```
task_id: npc-imposter-distance-priority
branch: task/npc-imposter-distance-priority
pr_url: NONE_NO_PR_REQUESTED
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
playtest_required: yes
surprises: <one or two lines, or "none">
fence_change: no
```
