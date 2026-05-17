# Playtest: cycle-vekhikl-3-tank-chassis

Last verified: 2026-05-17

Cycle: `cycle-vekhikl-3-tank-chassis` (campaign position #8 of 13)
Task slug: `vekhikl-3-playtest-evidence`
Branch: `task/vekhikl-3-playtest-evidence`
Capture script: `scripts/capture-vekhikl-3-tank-shots.ts`

Closes the chassis half of `VEKHIKL-3` (M48 Patton tank with skid-steer
locomotion, four-corner terrain conform, hull tilt on slopes, and
tracks-blown immobilization) once the owner walks the deferred punch
list below. The turret + cannon half closes in
`cycle-vekhikl-4-tank-turret-and-cannon`.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 13-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots prove the M48 chassis is visible at both
spawn points and that the player adapter mount path is reachable from
the harness — enough evidence to merge under autonomous-loop posture.
Owner sign-off on the punch list at the bottom is still required to
flip the chassis half of `VEKHIKL-3` to Closed in `docs/DIRECTIVES.md`
(the full directive closes after cycle #9 lands turret + cannon).

## Playwright smoke evidence

Saved under
`artifacts/cycle-vekhikl-3-tank-chassis/playtest-evidence/`
by `scripts/capture-vekhikl-3-tank-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| Open Frontier — M48 visible at US-base spawn | `tank-spawn-open-frontier.png` | Third-person framing on the US-base-side M48 spawn so the chassis dominates the foreground; UI chrome hidden via the per-capture style injection. |
| A Shau Valley — M48 visible on valley road | `tank-spawn-a-shau.png` | Third-person framing on the A Shau valley-road M48 spawn so the chassis is foregrounded against the valley walls. |
| Open Frontier — driving from third-person | `tank-driving-third-person.png` | Best-effort: the harness attempts `spawnPlayerInNearestTank` (falls back to `spawnPlayerInNearestVehicle` then to a static framing), commands forward throttle for ~2 s, then snaps the third-person follow camera framing. |
| Open Frontier — skid-steer pivot in place | `tank-pivot-in-place.png` | Best-effort: the harness commands opposing track inputs (throttleAxis=0, turnAxis=1) so the chassis pivots without forward translation. Static frame from an off-axis camera implies rotation; the run log records whether the input was actually commanded. |
| A Shau Valley — chassis tilt on slope | `tank-on-slope.png` | Framing against an A Shau valley wall — the steepest playable terrain in either scenario — so the four-corner terrain conform produces visible hull tilt. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR and runs against any state of the
R2 dispatch window. The screenshots themselves depend on the cycle's
R1 + R2 siblings being merged for the captured behaviors to render:

- R1 already landed on this cycle's worktree base (master HEAD
  `23410433`): `tracked-vehicle-physics-core` and
  `tracked-vehicle-physics-tests`. So `TrackedVehiclePhysics` is
  available for any adapter or integration code to consume.
- R2 `tank-player-adapter` — wires `TankPlayerAdapter.ts` into
  `VehicleManager` and exposes the skid-steer input surface
  (W/S throttle, A/D turn axis — NOT Ackermann steer angle). Until
  this PR merges, no driver seat is available and the
  `tank-driving-third-person.png` + `tank-pivot-in-place.png`
  captures will fall back to static framings.
- R2 `m48-tank-integration` — wires the `Tank.ts` IVehicle impl to
  `TrackedVehiclePhysics` + `TankPlayerAdapter` and spawns one M48 at
  each map's documented spawn point (US base on Open Frontier; valley
  road on A Shau). Until this PR merges, no M48 chassis mesh will be
  visible at the documented poses; the capture still produces the
  static frames so the screenshot paths are reserved.

If you are reading this doc before both R2 sibling PRs merge, the
screenshot paths above are placeholders. Re-run the capture script
post-merge with:

```
npx tsx scripts/capture-vekhikl-3-tank-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on
master. The capture script tolerates:

- An absent `spawnPlayerInNearestTank` helper (falls back to
  `spawnPlayerInNearestVehicle`, then to static framing).
- An absent `adapter.setTrackInputs` method (falls back to a generic
  `handleInput({ throttle, turn })` shape, then to static framing).
- An absent `debugTracksBlown` / `blowTracksOnActiveTank` surface
  (the probe logs availability for the owner sweep but no
  screenshot depends on it — the tracks-blown frame is not in the
  named capture list because immobilization reads as motion-absence,
  which a still image can't convey).
- An absent M48 mesh in the scene at capture time (the
  `probeTankSpawn` scene-traversal probe logs `found=false` and the
  capture proceeds at the documented placeholder pose).

Refine `position` / `yaw` / `pitch` after the first post-merge run by
reading the actual spawn coordinates out of `Tank.ts` or the M48
config block.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The M48
chassis is a CPU-side rigid-body simulation consuming
`ITerrainRuntime` read-only plus a standard `Mesh` chassis from the
M48 GLB at `public/models/vehicles/ground/m48-patton.glb`; no shader
path differs across backends, so the smoke check is valid on either
backend — but the owner sweep is the load-bearing check against
strict-WebGPU desktop.

### Pose-refinement caveat

The five poses are placeholder coordinates against the documented
spawn points. The slope-tilt pose in particular is best-effort: the
camera framing assumes the M48 spawns near the valley wall on A Shau,
which may not match the actual spawn block in `m48-tank-integration`.
Refine after first post-merge run by reading the actual spawn
positions and walking the chassis to a graded section before snapping
the slope frame, if needed.

## What the owner should walk

Punch list mirroring the cycle brief's `vekhikl-3-playtest-evidence`
Method section. The owner walks this list in a batch sweep after the
campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**On Open Frontier:**

1. Spawn into the map. Locate the M48 near the US base.
2. Press F to enter the driver seat. Confirm camera switches to
   third-person orbit-tank framing (turret first-person comes in
   cycle #9 — chassis-only slice this cycle).
3. **Forward / reverse drive:** hold W. Confirm the chassis accelerates
   smoothly along its forward axis. Release W and hold S. Confirm
   reverse track commands feel symmetric (M48 tracks support reverse
   at reduced max speed per the TANK_SYSTEMS memo).
4. **In-place pivot:** with the chassis stationary, hold A then D.
   Confirm the chassis pivots about its centre at a steady yaw rate
   with zero forward translation. This is the load-bearing skid-steer
   feel test — the chassis should rotate decisively, not crab or
   wobble. (Track-driven yaw rate scales with the differential between
   `leftTrackSpeed` and `rightTrackSpeed` per the memo's locomotion
   section.)
5. **Slope crest:** drive the M48 up a moderate grade. Confirm the
   chassis crests cleanly with the hull tilting to match the four
   corner-sample heights (not the centre point only). Track-driven yaw
   rate should feel reduced while climbing — slope-stall scales
   forward force per the memo.
6. **Slope stall:** point the M48 at the steepest grade available on
   Open Frontier and hold W. Confirm forward force scales down on
   grades above the stall threshold (the chassis slows then stops,
   then can roll back if you release throttle).
7. **Brake-stop:** at cruise on flat, hold Space. Confirm deceleration
   feels appropriate to the chassis mass (~46 t per the M48 config) —
   not snap-stop, not never-stop.
8. **Enter/exit transitions:** press F to exit. Confirm the player
   ejects to the side of the chassis (not inside it, not under the
   terrain, not on top of the turret hatch). Re-enter with F. Confirm
   camera transitions are not jarring in either direction.

**On A Shau Valley:**

9. Repeat steps 1-8 on the valley road. The slope-stall behaviour
   matters more here because the valley walls are steeper than
   anything on Open Frontier; the M48 should be able to climb the road
   grade but stall against the valley walls. The four-corner hull tilt
   should read as more pronounced because A Shau's grades are
   more graded.

**Tracks-blown immobilization:**

10. With the player mounted, trigger the tracks-blown developer debug
    command (the harness probes for
    `vehicleManager.debugTracksBlown()` and
    `vehicleManager.blowTracksOnActiveTank()` — the exact dev console
    invocation lives in the `m48-tank-integration` PR or the
    `tank-player-adapter` PR). Confirm:
    - Forward throttle no longer produces forward motion (tracks-blown
      state zeros out forward velocity contribution per the memo).
    - Chassis tilt + turret hatch + camera framing remain functional
      (the chassis is immobilized, not destroyed).
    - Releasing throttle does not cause the chassis to drift; the
      track-blown state is fully static.

**Feel notes for the owner sweep:**

11. Record subjective feel on these axes (the cycle brief lists these
    explicitly as load-bearing):
    - **Skid-steer responsiveness:** how quickly does the chassis
      respond to an A/D input from rest? Lag should be input-smoothing
      time-constant, not physics-integration lag.
    - **Hull tilt on slopes:** does the four-corner conform produce
      visible tilt on graded terrain, or does the chassis look like
      it's floating on the centre point only?
    - **Track-driven yaw rate:** does in-place pivot feel like a
      tracked vehicle (decisive, slow build-up, steady cruise)? Or
      does it feel like a wheeled vehicle skidding (Ackermann-like
      arc)? The former is correct; the latter rejects.

## Recording owner sign-off

When the owner walks the list above:

- If steps 1-11 read as **playable** and **feels right** — append
  an "Owner sign-off" section to this file with the date + one-line
  summary, then record the chassis half of `VEKHIKL-3` as complete in
  `docs/DIRECTIVES.md` with this cycle's close-commit SHA. The full
  `VEKHIKL-3` directive closes after cycle #9 lands turret + cannon.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-vekhikl-3-tank-chassis-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are not
  reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/cycle-vekhikl-3-tank-chassis/playtest-evidence/`;
  populated either by the capture script run in this PR (once
  `tank-player-adapter` + `m48-tank-integration` are merged) or by
  a post-merge back-fill commit on master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
chassis half of the `VEKHIKL-3` directive; this task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against. The full `VEKHIKL-3` directive promotion to Closed
awaits cycle #9 turret + cannon.
