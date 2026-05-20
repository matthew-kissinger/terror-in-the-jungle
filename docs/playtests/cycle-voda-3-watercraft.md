# Playtest: cycle-voda-3-watercraft

Cycle: `cycle-voda-3-watercraft` (campaign position #10 of 13)
Task slug: `voda-3-playtest-evidence`
Branch: `task/voda-3-playtest-evidence`
Capture script: `scripts/capture-voda-3-watercraft-shots.ts`

Closes `VODA-3` (Sampan + PBR watercraft, both drivable + mountable;
PBR with twin M2HB) once the owner walks the deferred punch list below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 13-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots reserve scene paths at the A Shau river
(the sole river-bearing scenario) so the Sampan + PBR mount, drive,
fire, dock, and wave-heave behaviors can be inspected against the
captured frames — enough evidence to merge under autonomous-loop
posture. Owner sign-off on the punch list at the bottom is still
required to flip `VODA-3` to Closed in `docs/DIRECTIVES.md`.

## Playwright smoke evidence

Saved under
`artifacts/playtests/cycle-voda-3/`
by `scripts/capture-voda-3-watercraft-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| A Shau — Sampan at riverbank spawn | `sampan-spawn.png` | Third-person framing on the documented Sampan riverbank spawn so the hull is in-frame against the bank. UI chrome hidden via the per-capture style injection. |
| A Shau — player mounted Sampan (pilot 3rd-person) | `sampan-mounted-third-person.png` | Best-effort: harness calls `vehicleManager.spawnPlayerInNearestWatercraft()` / `spawnPlayerInNearestVehicle()` to mount the Sampan; falls back to a static third-person framing at the documented spawn pose if no surface accepted. |
| A Shau — Sampan driving upstream | `sampan-driving-forward.png` | Best-effort: harness commands forward throttle on the active watercraft adapter for ~3 s (covers ~20-25 m at default Sampan cruise) before the third-person follow snap. Falls back to a static framing if the adapter throttle surface is absent. |
| A Shau — Sampan mid-yaw under rudder | `sampan-rudder-yaw.png` | Best-effort: harness commands full rudder (+1) for ~1.5 s so the hull is visibly yawed off its driving heading, then snaps off-axis. Falls back to a static off-axis framing if the rudder surface is absent. |
| A Shau — Sampan grounded at bank | `sampan-grounded-at-bank.png` | Best-effort: harness drives the Sampan into the bank by commanding +throttle into the shore for ~4 s; on grounding, `WatercraftPhysics.isGrounded()` flips true (logged) and the snap shows the hull pinned to the bank. Falls back to a static framing of the spawn pose if grounding could not be triggered. |
| A Shau — player exited at bank | `sampan-player-exited-at-bank.png` | Best-effort: harness invokes the exit surface (`adapter.handleInput({ exit: true })` or `vehicleManager.exitActiveVehicle()`) and snaps with the player visible standing on the bank beside the hull. Falls back to a static framing if no exit surface accepted. |
| A Shau — PBR at US river outpost spawn | `pbr-spawn.png` | Third-person framing on the documented PBR spawn so the chassis + twin M2HB mounts are in-frame. Depends on R2 `pbr-integration` PR landing for the mesh to be present. |
| A Shau — player mounted PBR (pilot) | `pbr-pilot-view.png` | Best-effort: harness mounts the PBR pilot seat via the watercraft mount path and snaps first-person from the documented pilot eye-pose. Falls back to a static framing if the mount surface is absent. |
| A Shau — player swapped to PBR gunner (gunner POV) | `pbr-gunner-view.png` | Best-effort: harness invokes the gunner-swap surface (`swapToGunner` / `swapSeat('gunner_forward')` / cycle #6 emplacement-mount path) and snaps from the documented gunner eye-pose along the M2HB barrel axis. Falls back to a static framing if no swap surface accepted. |
| A Shau — PBR M2HB firing at riverbank target | `pbr-m2hb-firing.png` | Best-effort: harness triggers fire on the active emplacement adapter (`adapter.requestFire()` / `adapter.handleInput({ fire: true })`) and snaps mid-burst so the muzzle flash + tracer + impact are in-frame. Depends on cycle #6 emplacement-fire wiring being reachable from the PBR gunner mount. Falls back to a static framing if the fire surface is absent. |
| A Shau — PBR under bridge approach | `pbr-under-bridge.png` | Best-effort: harness checks `WatercraftPhysics.isUnderBridge()` (stub returns false in R1 per `cycle-voda-3-watercraft.md` §"watercraft-physics-core" step 8 TODO) and snaps the static approach framing on the documented bridge-search corridor. If A Shau has no in-range bridge, the log records the gap; the screenshot path is reserved so the owner sweep has a place to back-fill post-bridge-wiring. |
| A Shau — Sampan wave heave at idle | `sampan-wave-heave-idle.png` | Best-effort: harness lets the Sampan sit idle in mid-river for 5 s so the hull-sample-driven wave heave (`WatercraftPhysics` step §6, per-sample y-variance drives pitch/roll/heave) accumulates a visible y-oscillation, then snaps. Falls back to a static framing if the hull is grounded or no water sample was reachable. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR and runs against any state of the
R2 dispatch window. The screenshots themselves depend on the cycle's
R1 + R2 siblings being merged for the captured behaviors to render:

- **R1 landed on this cycle's worktree base** (`21cecadf`):
  `watercraft-physics-core` (`87040f40`),
  `watercraft-physics-tests` (`9435bfd4`), and the stub→real swap at
  `21cecadf`. So `WatercraftPhysics` is reachable for any integration
  code to consume; the hull buoyancy + rudder + throttle + grounding +
  wave-heave behaviors are all already exercised in the unit tests.
- **R2 `sampan-integration`** — authors `Sampan.ts` + spawns it on
  the A Shau riverbank, and authors `WatercraftPlayerAdapter.ts` for
  W/S throttle, A/D rudder, F enter/exit. Until this PR merges, all
  `sampan-*` captures fall back to static framings and the log line
  records the dev command as unavailable. Sampan mesh visibility in
  the spawn frame depends on this PR.
- **R2 `pbr-integration`** — authors `PBR.ts`, registers it on the US
  river outpost on A Shau, and wires the twin M2HB mounts via the
  cycle #6 emplacement pattern. Until this PR merges, all `pbr-*`
  captures fall back to static framings.
- **Cannon-fire-style wiring on PBR gunner mount** — the `requestFire`
  / `handleInput({ fire: true })` paths must connect through the
  cycle #6 `EmplacementPlayerAdapter` fire latch to the M2HB tracer
  + impact pools for `pbr-m2hb-firing.png` to render a tracer in the
  frame. If this wire is absent at capture time, the snap shows the
  static framing and the log records the gap.
- **Bridge clearance probe** — `WatercraftPhysics.isUnderBridge()`
  is a stub in R1 (always returns `false` per the docblock TODO).
  The `pbr-under-bridge.png` capture is documentary — if A Shau has
  no in-range bridge structure or the navigation / structure query
  hasn't been wired, the snap reserves the path and the log records
  the gap; back-fill on master post-bridge-wiring.

If you are reading this doc before the R2 sibling PRs merge, the
screenshot paths above are placeholders. Re-run the capture script
post-merge with:

```
npx tsx scripts/capture-voda-3-watercraft-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on
master. The capture script tolerates:

- An absent `spawnPlayerInNearestWatercraft` /
  `spawnPlayerInNearestVehicle` helper (falls back to a static
  framing at the documented spawn pose).
- An absent throttle / rudder / exit surface on the active
  watercraft adapter (falls back to a static framing).
- An absent gunner-seat-swap surface on the PBR (falls back to a
  static first-person framing at the documented gunner pose).
- An absent emplacement-fire wiring on the PBR gunner mount (falls
  back to a static framing at the documented fire pose).
- An absent bridge structure (the `isUnderBridge` probe is stubbed
  `false` in R1; reserves the screenshot path regardless).
- An absent Sampan or PBR mesh in the scene (the static framing
  renders a frame at the documented spawn pose regardless).

Each capture reserves its screenshot path and the run log records
which surface was reachable so the owner sweep has concrete evidence
of what's wired at capture time.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The Sampan +
PBR hulls are standard scene-graph meshes on top of the cycle #7 water
shader (`installWaterMaterialPatches`-patched `MeshStandardMaterial`);
the M2HB tracer + impact effects reuse the existing CPU pools — no
shader path differs across backends, so the smoke check is valid on
either backend, but the owner sweep is the load-bearing check against
strict-WebGPU desktop.

### Pose-refinement caveat

The capture poses are placeholder coordinates against the A Shau river
geometry. Refine post-merge by reading the actual Sampan + PBR spawn
positions out of the R2 integration PRs (`Sampan.ts` / `PBR.ts`) and
the hydrology channel start/end positions out of the running
`WaterSystem`. The capture script logs the water-probe result + the
`WatercraftPhysics.isGrounded()` + `isUnderBridge()` state at each
pose so the owner sweep can confirm the camera is framed against the
intended hull state. The bridge-approach pose in particular is
documentary until a real bridge structure exists in A Shau's
worldfeature pack.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's `voda-3-playtest-evidence` Method section.

**On A Shau Valley:**

1. **Mount Sampan, navigate river up + down, exit at bank.**
   Locate the Sampan on the A Shau riverbank. Press F to mount.
   Confirm camera switches to third-person follow framing on the
   hull. Hold W to drive upstream; confirm:
   - Throttle response feels appropriate to a small unarmed river
     boat (modest acceleration, low top speed, hull settles into the
     surface plane via wave heave).
   - Rudder authority (A/D) feels positive but slewed — the hull
     turns under rudder, not snap-yaws.
   - River current visibly resists upstream travel and assists
     downstream travel.
   Drive downstream to a bank, beach the bow, confirm
   `WatercraftPhysics.isGrounded()` engages (visible as the hull
   stopping at the bank). Press F to exit; confirm the player is
   ejected onto the bank beside the hull (not under terrain, not
   inside the hull).

2. **Mount PBR, drive upstream against current, fire M2HB at
   riverbank target, swap seats.**
   Locate the PBR at the US river outpost on A Shau. Press F to
   mount the pilot seat. Drive upstream against the current; confirm
   the PBR has visibly more engine power than the Sampan (twin
   water-jet drive in the brief). While moving, swap to the
   `gunner_forward` seat (the exact key/dev-command lands with the
   `pbr-integration` PR; expect the cycle #6 emplacement-mount
   re-mount path). Confirm camera switches to first-person along the
   M2HB barrel axis. Mouse-aim — barrel slews within the cone
   limits. Click LMB to fire at a static riverbank target. Confirm:
   - Visible muzzle effect at the barrel tip.
   - Tracer every Nth round (cycle #6 emplacement default cadence
     applies).
   - Impact at the riverbank produces tracer-pool impact effects.
   Swap back to the pilot seat; confirm seat-swap is clean (no
   stuck-camera, no double-mount).

3. **Pass under a bridge.** If A Shau has a bridge in-range
   (worldfeature pack as of capture time may or may not include
   one), drive the PBR toward it. Confirm:
   - If a bridge exists and is reachable, the hull-top clearance
     test (per `WatercraftPhysics.isUnderBridge()` R2 wiring) either
     allows passage (clearance OK) or rejects passage (mast / radar
     would collide).
   - If A Shau has no bridge in range: flag this for a follow-up
     cycle (add a bridge structure OR wait for the `voda-3` follow-up
     `cycle-voda-3-watercraft-fix.md` to wire the structure query).

4. **Observe wave heave + rocking at idle.** Mount the Sampan, let
   go of throttle + rudder, leave the hull idle in mid-river for
   ~5-10 s. Confirm:
   - The hull visibly rocks (per-hull-sample y-variance drives
     pitch + roll + heave per `WatercraftPhysics` §6).
   - The hull settles to a buoyant equilibrium without diverging
     (no runaway oscillation, no sinking through the water plane,
     no popping above the surface).
   - Compare against the captured `sampan-wave-heave-idle.png` for
     a baseline static frame.

5. **Record feel.** Subjective notes on:
   - Throttle response (Sampan vs PBR; should differ — Sampan low
     power, PBR twin water-jet).
   - Rudder authority (Sampan vs PBR; PBR has more inertia, expect
     slower yaw response).
   - Current resistance (does upstream feel like a meaningful
     struggle? does downstream feel like a meaningful assist?).
   - Wave behavior (does the hull *feel* like it's floating on water,
     or does it slide along a glass plane?).
   - Beach docking transition (clean? jarring? does the hull "stick"
     unnaturally to the bank?).
   - Seat-swap on PBR (snappy? laggy? does the camera transition
     feel right?).
   - M2HB fire from the PBR (responsive? does the twin-mount feel
     like a heavier weapon than the fixed emplacement from cycle #6?).

## Capture-script outputs section

Each numbered owner-walk step above has at least one corresponding
screenshot under
`artifacts/playtests/cycle-voda-3/`. The capture-script run log
prints `resolvedBackend`, the water-probe sample at each pose, the
`WatercraftPhysics.isGrounded()` + `isUnderBridge()` state where
reachable, and per-surface availability flags so the owner sweep can
confirm which features were wired at capture time. Re-run the script
with:

```
npx tsx scripts/capture-voda-3-watercraft-shots.ts
```

after the R2 sibling PRs (`sampan-integration`, `pbr-integration`)
merge and back-fill the screenshots on master.

| Step | Screenshot file(s) | Sibling-PR dependency |
|---|---|---|
| 1 (Sampan mount + drive + ground + exit) | `sampan-spawn.png`, `sampan-mounted-third-person.png`, `sampan-driving-forward.png`, `sampan-rudder-yaw.png`, `sampan-grounded-at-bank.png`, `sampan-player-exited-at-bank.png` | `sampan-integration` |
| 2 (PBR mount + drive + fire + swap) | `pbr-spawn.png`, `pbr-pilot-view.png`, `pbr-gunner-view.png`, `pbr-m2hb-firing.png` | `pbr-integration` + cycle #6 emplacement-fire wiring through the PBR gunner mount |
| 3 (bridge clearance) | `pbr-under-bridge.png` | Bridge structure in A Shau worldfeature pack + R2 bridge-clearance wiring (R1 stubs `isUnderBridge` to `false`) |
| 4 (wave heave at idle) | `sampan-wave-heave-idle.png` | `sampan-integration` |
| 5 (feel notes) | (no static still — feel notes are owner-recorded) | All sibling PRs |

## Defects observed during R2 dispatch

Record here any physics damping / flow / mount / fire defects observed
in sibling R2 PRs (e.g., `watercraft-physics-damping-fix` if dispatched
in the same window, M2HB mount conflicts, current-force divergence,
etc.). Empty as of capture time:

- _(none recorded at task-author time; populate during sibling-PR
  review + on the owner walk-through.)_

## Owner sign-off

_(Empty as of 2026-05-17 — PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **Mount Sampan + drive upstream + downstream** (step 1).
- [ ] **Beach Sampan at a bank, confirm grounded state, exit cleanly**
      (step 1, exit half).
- [ ] **Mount PBR pilot, drive upstream against current** (step 2,
      drive half).
- [ ] **Swap to PBR gunner, fire M2HB at riverbank target** (step 2,
      fire half).
- [ ] **Swap back to PBR pilot, confirm clean transition** (step 2,
      swap-back half).
- [ ] **Pass under (or be rejected by) a bridge — OR flag as
      follow-up if no bridge exists in A Shau** (step 3).
- [ ] **Observe wave heave at idle on Sampan, confirm buoyant
      equilibrium without divergence** (step 4).
- [ ] **Record feel notes** for throttle / rudder / current / wave /
      beach / swap / fire (step 5).
- [ ] **No new carry-overs** opened against this cycle (any feel
      issues become a follow-up cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close `VODA-3` in
  `docs/DIRECTIVES.md` with this cycle's close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-voda-3-watercraft-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are not
  reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/playtests/cycle-voda-3/`;
  populated either by the capture script run in this PR (once the
  R2 sibling PRs are merged) or by a post-merge back-fill commit on
  master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
`VODA-3` directive promotion to Closed; this task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against.
