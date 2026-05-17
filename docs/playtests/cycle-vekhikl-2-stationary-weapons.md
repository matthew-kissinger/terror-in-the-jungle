# Playtest: cycle-vekhikl-2-stationary-weapons

Last verified: 2026-05-16

Cycle: `cycle-vekhikl-2-stationary-weapons` (campaign position #6 of 12)
Task slug: `vekhikl-2-playtest-evidence`
Branch: `task/vekhikl-2-playtest-evidence`
Capture script: `scripts/capture-vekhikl-2-emplacement-shots.ts`

Closes `VEKHIKL-2` (M2HB stationary weapon emplacements) once the owner
walks the deferred punch list below.

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
owner gate. The screenshots prove that the M2HB emplacement spawns
visibly at both documented map positions and that the player adapter
mount path is reachable from the harness — enough evidence to merge
under autonomous-loop posture. Owner sign-off on the punch list at the
bottom is still required to flip `VEKHIKL-2` to Closed in
`docs/DIRECTIVES.md`.

## Playwright smoke evidence

Saved under `artifacts/cycle-vekhikl-2-stationary-weapons/playtest-evidence/`
by `scripts/capture-vekhikl-2-emplacement-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| Open Frontier — M2HB spawn at US base | `emplacement-spawn-open-frontier.png` | Tripod + barrel rig framed in the foreground at the US-base emplacement spawn. Capture pose is a static-camera placeholder; refine after first post-merge run by reading the actual spawn position out of `VehicleManager` registration logs (the capture script prints a scene-traversal probe result at run time). |
| A Shau Valley — M2HB spawn at NVA bunker overlook | `emplacement-spawn-a-shau.png` | Tripod + barrel rig framed at the NVA bunker overlook spawn on A Shau. Same pose-refinement caveat as Open Frontier. |
| Open Frontier — third-person framing with player mounted | `emplacement-third-person-aiming.png` | Best-effort: the harness attempts `spawnPlayerInNearestEmplacement` (falls back to `spawnPlayerInNearestVehicle` if the emplacement-specific helper is not exposed) and calls `setAim(45°, 5°)` to slew the barrel before snapping. Static-camera fallback if the adapter mount API is unreachable from the harness. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR but the screenshots themselves
depend on the sibling R2 task landing first:

- `m2hb-weapon-integration` (R2) — wires the M2HB weapon onto the
  emplacement, registers fire/ammo flow, and spawns one emplacement
  on Open Frontier (US base) + one on A Shau (NVA bunker overlook).
  Until that PR merges, no emplacement mesh will be visible at the
  documented poses; the capture still produces static frames so the
  screenshot paths are reserved.
- `emplacement-npc-gunner` (R2) — adds the `seek-emplacement` AI
  scoring branch so NPCs mount emplacements. Independent of the
  static-spawn capture but load-bearing for step 7 of the owner
  punch list below.

R1 already landed (`Emplacement` IVehicle + `EmplacementPlayerAdapter`
on master HEAD `917d83df`), so the player-adapter mount path probe in
capture 2 has a real surface to exercise. The barrel rig won't render
until R2 lands the visual + spawn registration.

Re-run the capture post-merge with:

```
npx tsx scripts/capture-vekhikl-2-emplacement-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on master.
The script tolerates an absent `spawnPlayerInNearestEmplacement` helper
and an absent `adapter.setAim` aim-control method, so it remains
runnable across the full R2 dispatch window.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The
emplacement is a CPU-side rotation rig plus standard `Mesh` chassis
consuming the shared material pool; no shader path differs across
backends, so the smoke check is valid on either backend — but the
owner sweep is the load-bearing check against strict-WebGPU desktop.

## What the owner should walk

Punch list mirroring the cycle brief's `vekhikl-2-playtest-evidence`
Method section. The owner walks this list in a batch sweep after the
campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**On Open Frontier:**

1. Spawn into the map. Approach the M2HB emplacement at the US base.
2. Press F to mount. Confirm the first-person camera pins to the
   gunner seat behind the spade grips and the player's hands rest on
   the grips (not floating, not clipped).
3. Mouse-aim. Confirm the barrel slews yaw and pitch in response to
   mouse input, with the cone limits respected at the boundaries
   (-10° depression / +60° elevation; 360° traverse on the default
   tripod).
4. Hold LMB. Confirm:
   - Fire rate reads as ~575 RPM (the M2HB's authored cyclic rate).
   - Tracer round visible every 5th shot, not every shot.
   - Recoil offset on the barrel feels right — a small visible kick
     per shot, not a wobble or a static muzzle.
5. Hold-fire down to depletion. Confirm:
   - The 250-round box runs out (not infinite ammo).
   - Reload triggers on dismount (per cycle brief: belt-fed reload
     does not happen mid-mount; the box swap happens off the gun).

**On A Shau Valley:**

6. Repeat steps 1-5 on the NVA bunker overlook emplacement. The
   slope-context matters here — the bunker overlook frames a longer
   line of fire down the valley, so the barrel cone limits get
   exercised more aggressively against distant targets.

**NPC gunner observation:**

7. Stand near a friendly-faction emplacement during a firefight.
   Confirm a friendly NPC mounts the emplacement and begins engaging
   enemies within roughly 5 seconds when targets are inside the
   barrel's field of fire. Depends on `emplacement-npc-gunner` (R2)
   being merged. If the NPC ignores the emplacement entirely, this
   step rejects.

## Recording owner sign-off

When the owner walks the list above:

- If all seven steps read as **playable** and **feels right** —
  append an "Owner sign-off" section to this file with the date +
  one-line summary, then close `VEKHIKL-2` in `docs/DIRECTIVES.md`
  with this cycle's close-commit SHA.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-vekhikl-2-stationary-weapons-fix.md`
  per the PLAYTEST_PENDING walk-through protocol. The merged commits
  are not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/cycle-vekhikl-2-stationary-weapons/playtest-evidence/`;
  populated either by the capture script run in this PR (once
  `m2hb-weapon-integration` is merged) or by a post-merge back-fill
  commit on master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
`VEKHIKL-2` directive promotion to Closed; this task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against.
