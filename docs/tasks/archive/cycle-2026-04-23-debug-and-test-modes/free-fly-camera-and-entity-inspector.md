# free-fly-camera-and-entity-inspector: detached spectator cam + click-to-drill entity inspector

**Slug:** `free-fly-camera-and-entity-inspector`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P0 — core "cracked team" drill-in capability.
**Playtest required:** NO (behavior-testable via synthetic click + state-tree assertion; manual confirmation in dev server).
**Estimated risk:** medium — touches camera stack (shared with player/vehicle camera); raycast adds a new pick layer; entity-type discovery needs multiple system taps.
**Budget:** ≤500 LOC.
**Files touched:**

- Create: `src/ui/debug/FreeFlyCamera.ts` — camera mode toggle + WASD/QE/mouse control.
- Create: `src/ui/debug/EntityInspectorPanel.ts` — the drill-in panel.
- Create: `src/ui/debug/entityInspectors/` directory with per-entity-type inspector files:
  - `inspectCombatant.ts` (position, velocity, AI state, squad, orders, LOD tier, health, target, last-decision log)
  - `inspectVehicle.ts` (type, id, occupant, pose, velocity, physics state)
  - `inspectProp.ts` (type, position, world-feature id if any)
  - `inspectPlayer.ts` (position, velocity, current vehicle, inventory summary)
- Modify: `src/core/GameEngineInput.ts` — add `V` (toggle free-fly), `B` (reattach), mouse-click to pick entity while free-flying.
- Possibly modify: `src/core/GameRenderer.ts` — swap active camera when free-fly is on.
- Additive read-only accessors in `src/systems/combat/**` and `src/systems/vehicle/**` if needed (≤20 LOC each; combat-reviewer scope).

## Required reading first

- `src/core/GameRenderer.ts` — camera construction + active-camera accessor.
- `src/systems/player/PlayerController.ts` — the currently-active camera logic; note how it decides between first-person / vehicle / third-person camera.
- `src/systems/spatial/SpatialGridManager.ts` — may be useful for the raycast pick (fast lookup of entities within a ray).
- `src/systems/combat/CombatantSystem.ts` (or equivalent) — for reading combatant state.
- `src/systems/vehicle/VehicleManager.ts` — for reading vehicle state.
- `src/ui/loading/SettingsModal.ts` — modal pattern for the inspector panel.

## Fix

### 1. Free-fly camera mode

- Pressing `V` swaps the active `THREE.PerspectiveCamera` from player/vehicle-camera to a standalone free-fly camera.
- Free-fly controls: WASD for horizontal translation in camera plane, Q/E for down/up, mouse drag for pitch/yaw (or mouse-look with pointer lock). Shift = 4x speed, Ctrl = 0.25x speed.
- Pressing `B` reattaches to the prior camera (store the previous camera reference on toggle-on).
- The simulation continues running; free-fly does NOT pause time (that's the `time-control-overlay` task).
- Free-fly does NOT interact with physics — camera moves through geometry.

### 2. Entity pick raycast

- While free-fly is active, left-click performs a raycast from camera through the mouse position.
- The raycaster uses a dedicated debug layer (`scene.children` iteration, not the combat-filtered raycaster) so dev can pick anything.
- Priority order: combatant > vehicle > prop > terrain.
- On hit: open `EntityInspectorPanel` with the picked entity.

### 3. EntityInspectorPanel

- A fixed-position panel (upper-right, 320px wide, scrollable) mounted via `DebugHudRegistry` if present, else self-mount.
- Header shows entity type + id.
- Body is a tree of key-value pairs updated at 5Hz (reads the entity via its inspector function).
- Footer buttons: "Follow" (camera tracks entity), "Dump to console" (logs full state tree), "Close".
- Each entity type has its own inspector file (`inspectCombatant.ts`, etc.) exporting `inspect(id: string): Record<string, any>`.
- Panels render nested structures as collapsible trees. Primitives render inline.

### 4. Entity-state surface

Verify available accessors:
- **Combatant**: `combatantSystem.getCombatantState(id)` or equivalent — needs position, velocity, AI state name, squadId, orders, LOD tier, health, current target, last-decision info. If this composite accessor does not exist, add it as a ≤20 LOC additive method on `CombatantSystem` (combat-reviewer scope). If adding more than 20 LOC, STOP and render "—" for missing fields.
- **Vehicle**: `vehicleManager.getVehicle(id)` returns `IVehicle`; the interface exposes position/velocity; also read occupant from `vehicleManager.getVehicleByOccupant(playerId)` inversely.
- **Prop**: grep `WorldFeatureSystem` or equivalent — the building/structure registration from cycle-2026-04-22-flight-rebuild-overnight (PR #122). Read-only.
- **Player**: `playerController` exposes position + vehicle state.

### 5. "Follow" mode

- On "Follow" click, camera tracks the entity's position every frame until toggled off.
- Distance is configurable via a knob on the inspector (start: 15m behind + 5m above).

## Steps

1. Read "Required reading first."
2. Build `FreeFlyCamera` with V/B toggles and WASD/QE/mouse. Verify it swaps the active camera cleanly.
3. Implement the raycast pick. Start with picking any mesh; layer priority later.
4. Build `EntityInspectorPanel` skeleton with a stub inspector that just shows `{ position, velocity }`.
5. Fill in per-entity inspector files one at a time, verifying each end-to-end.
6. Implement Follow mode.
7. Behavior tests: simulate V keydown → assert camera swapped; simulate a click on a mock mesh → assert inspector opened with correct id.
8. `npm run lint`, `npm run test:run`, `npm run build`.
9. Manual smoke: `npm run dev`, play combat120, press V, fly around, click an NPC, verify inspector shows real data.
10. Screenshot committed to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/free-fly-camera-and-entity-inspector/`.

## Exit criteria

- V/B toggle works, camera swaps cleanly, player/vehicle camera state preserved across swap.
- Mouse-click while free-flying picks an entity and opens the inspector.
- Inspector renders state for at least Combatant + Vehicle + Player types.
- Follow mode works for combatants.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Evidence screenshot (inspector open on a combatant) committed.

## Non-goals

- No entity editing from the inspector (read-only). Tuning goes through `live-tuning-panel`.
- No AI decision replay or pathfind visualization from the inspector — that belongs to `world-overlay-debugger`.
- Free-fly does NOT disable any simulation. To pause, use `time-control-overlay`.
- Do not implement entity spawn/despawn from the inspector. Future cycle.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Camera swap breaks existing player/vehicle camera state on reattach → STOP, root-cause before pushing.
- Required combatant accessor requires >20 LOC of additive code in `src/systems/combat/**` → degrade inspector to show available fields only, file a finding, do NOT push the larger diff.
- Free-fly camera or pick raycast causes a noticeable p99 regression in combat120 → unexpected for dev-gated code; investigate.

## Pairs with

- `debug-hud-registry` (soft dep: inspector registers as a panel).
- `time-control-overlay` (complementary: pause + inspect frozen state).
- `world-overlay-debugger` (complementary: inspector shows entity state, world-overlay shows entity relations in 3D).
