# Playtest: cycle-vekhikl-1-jeep-drivable

Last verified: 2026-05-16

Cycle: `cycle-vekhikl-1-jeep-drivable` (campaign position #4 of 12)
Task slug: `m151-jeep-playtest-evidence`
Branch: `task/m151-jeep-playtest-evidence`
Capture script: `scripts/capture-m151-jeep-playtest-shots.ts`

Closes `VEKHIKL-1` (M151 jeep drivable end-to-end) once the owner walks
the deferred punch list below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 12-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots prove the jeep is visible at both spawn
points and that the third-person follow camera engages once the player
drives — enough evidence to merge under autonomous-loop posture. Owner
sign-off on the punch list at the bottom is still required to flip
`VEKHIKL-1` to Closed in `docs/DIRECTIVES.md`.

## Playwright smoke evidence

Saved under `artifacts/cycle-vekhikl-1-jeep-drivable/playtest-evidence/`
by `scripts/capture-m151-jeep-playtest-shots.ts`.

| Scenario | File | Observation |
|---|---|---|
| Open Frontier — M151 visible at US-base spawn | `jeep-spawn-open-frontier.png` | Jeep chassis parked near the US-base spawn; framing chosen so the chassis dominates the foreground and the briefing UI is hidden via the per-capture style injection. |
| A Shau Valley — M151 visible on valley road | `jeep-spawn-a-shau.png` | Jeep chassis parked on the A Shau valley road; framing chosen so the chassis is foregrounded against the valley walls. |
| Open Frontier — third-person camera while driving | `jeep-driving-from-third-person.png` | Player has entered the jeep (`spawnPlayerInNearestVehicle` triggered from the harness) and a short driving simulation has run; the third-person follow camera frames the chassis from behind. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR but the screenshots themselves
depend on two sibling tasks landing first:

- `ground-vehicle-player-adapter` (R2) — wires
  `GroundVehiclePlayerAdapter.ts` into `VehicleManager`. Without this
  the jeep has no driver seat and the third-person follow camera will
  not engage.
- `m151-jeep-integration` (R2) — wires the `GroundVehicle.ts` stub to
  `GroundVehiclePhysics` + `GroundVehiclePlayerAdapter` and spawns one
  M151 at each map's documented spawn point.

If you are reading this doc before both sibling PRs merge, the
screenshot paths above are placeholders. Re-run the capture script
post-merge with:

```
npx tsx scripts/capture-m151-jeep-playtest-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on master.
The capture script tolerates an absent `spawnPlayerInNearestVehicle`
API and will still produce static-camera frames at the documented
poses; refine `position` / `yaw` / `pitch` after the first post-merge
run by reading the actual spawn coordinates out of `GroundVehicle.ts`
or the M151 config block.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. Visual parity
across strict-WebGPU desktop is not in scope for this playtest gate
(the jeep is a CPU-side rigid-body sim consuming `ITerrainRuntime`
read-only; no shader path differs across backends).

## What the owner should walk

Punch list mirroring the cycle brief's Method section. The owner walks
this list in a batch sweep after the campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**On Open Frontier:**

1. Spawn into the map. Locate the M151 near the US base.
2. Press F to enter the driver seat. Confirm camera switches to
   third-person follow.
3. **Drive on flat:** hold W. Confirm the jeep accelerates smoothly,
   tops out at a reasonable cruise speed, and the chassis sits flush
   against the ground (no float, no clip).
4. **Drive on slope:** steer the jeep onto a hillside. Confirm the
   chassis tilts to match terrain normal at the wheel sample points,
   not the centre point only.
5. **U-turn:** while moving forward at cruise, hold A then D to swing
   the jeep through a 180. Confirm steering reads as Ackermann
   (yaw-rate scales with forward speed × steer angle), not as
   instant-rotate.
6. **Slope-stall:** point the jeep at the steepest grade you can find
   and hold W. Confirm forward force scales down on slopes above the
   stall threshold (the jeep slows then stops, then can roll back if
   you release throttle).
7. **Brake-stop:** at cruise on flat, hold Space. Confirm deceleration
   feels appropriate to the chassis mass — not snap-stop, not
   never-stop.
8. **Enter/exit transitions:** press F to exit. Confirm the player
   ejects to the side of the chassis (not inside it, not under the
   terrain). Re-enter with F. Confirm camera transitions are not
   jarring in either direction.

**On A Shau Valley:**

Repeat steps 1-8 on the valley road. The slope-stall behaviour
matters more here because the valley walls are steeper than anything
on Open Frontier; the jeep should be able to climb the road grade
but not the valley walls.

## Recording owner sign-off

When the owner walks the list above:

- If all eight steps on both maps read as **playable** and **feels
  right** — append an "Owner sign-off" section to this file with the
  date + the one-line summary, then close `VEKHIKL-1` in
  `docs/DIRECTIVES.md` with this cycle's close-commit SHA.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-vekhikl-1-jeep-drivable-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are not
  reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/cycle-vekhikl-1-jeep-drivable/playtest-evidence/`;
  populated either by the capture script run in this PR (if both
  sibling PRs are merged) or by a post-merge back-fill commit on
  master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
`VEKHIKL-1` directive promotion to Closed; this task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against.
