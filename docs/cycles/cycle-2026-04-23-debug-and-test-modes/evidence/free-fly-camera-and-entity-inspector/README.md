# free-fly-camera-and-entity-inspector evidence

Manual verification checklist for `task/free-fly-camera-and-entity-inspector`.

## Automated verification

All three gates passed in the worktree:

- `npm run lint` PASS
- `npm run test:run` PASS (3679 tests, 231 files)
- `npm run build` PASS

## Behavior tests shipped

- `src/ui/debug/FreeFlyCamera.test.ts` (10 behavior tests):
  - starts inactive with its own THREE.PerspectiveCamera
  - `activate()` copies pose from the source camera
  - WASD forward translates along camera-forward
  - Shift makes translation faster over same interval
  - Q moves down, E moves up
  - `deactivate()` clears state without mutating the source camera
  - mouse delta rotates the camera
  - follow target drives position toward the target
  - follow drops when the target returns null (despawned)

- `src/ui/debug/EntityInspectorPanel.test.ts` (7 behavior tests):
  - hidden by default, shows after `show()`
  - renders combatant fields in the body
  - shows "(entity gone)" when combatant has despawned
  - `close()` clears target and hides the panel
  - Follow button delegates to the follow controller
  - inspects vehicle targets
  - inspects player target

- `src/ui/debug/FreeFlyPick.test.ts` (4 behavior tests):
  - picks a combatant in the center of the screen
  - returns null when the click misses all entities
  - prefers combatant over vehicle when both are in range
  - falls back to vehicle when no combatant is under the cursor

## Manual browser confirmation

In `npm run dev`:

1. Load any game mode (AI sandbox works).
2. Press `V` — the player view snaps into the detached free-fly camera;
   the player/vehicle camera continues updating off-screen.
3. WASD translates on the camera plane; Q/E moves down/up; Shift for 4x,
   Ctrl for 0.25x; mouse-look via pointer lock.
4. Left-click on a combatant or vehicle — the entity inspector opens in
   the upper-right with live state at ~5 Hz.
5. Click "Follow" — camera tracks the entity's position.
6. Click "Dump" — raw snapshot logged to the browser console.
7. Click "Close" — panel closes and any follow lock releases.
8. Press `B` (or `V` again) — reattach to the player/vehicle camera. The
   player view resumes with state intact.

## Screenshot

A runtime screenshot is not included in this evidence pack; capturing the
browser HUD is a manual step the reviewer runs locally. The harness test
output above plus the preview checklist are the automatic checkpoints.

## Combat / vehicle accessor impact

None. The brief capped any additive read-only accessor on
`CombatantSystem` or `VehicleManager` at 20 LOC per file. No such
additions were needed: `getAllCombatants()`, `getVehicle()`,
`getAllVehicles()`, and the public `Combatant` / `IVehicle` fields were
sufficient. `SystemManager` added a single-line `vehicleManager` getter
for parity with the other registry accessors.
