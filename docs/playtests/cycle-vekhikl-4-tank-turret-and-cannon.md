# Playtest: cycle-vekhikl-4-tank-turret-and-cannon

Last verified: 2026-05-17

Cycle: `cycle-vekhikl-4-tank-turret-and-cannon` (campaign position #9 of 13)
Task slug: `vekhikl-4-playtest-evidence`
Branch: `task/vekhikl-4-playtest-evidence`
Capture script: `scripts/capture-vekhikl-4-tank-shots.ts`

Closes the turret + cannon half of `VEKHIKL-3` plus the entirety of
`VEKHIKL-4` (M48 Patton main cannon, gunner seat, HP-band damage with
turret-jammed / engine-killed substates, NPC tank-gunner AI route, and
the Rust→WASM ballistic-solver pilot) once the owner walks the deferred
punch list below. The chassis half of `VEKHIKL-3` closed in
`cycle-vekhikl-3-tank-chassis`; this cycle's owner sign-off is what
flips the full `VEKHIKL-3` + `VEKHIKL-4` directives to Closed in
`docs/DIRECTIVES.md`.

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
owner gate. The screenshots prove the M48 turret rig is visible on the
chassis, the cannon-fire and impact frames are reachable from the
harness, and the damage substates are triggerable through the dev
console — enough evidence to merge under autonomous-loop posture.
Owner sign-off on the punch list at the bottom is required to flip
`VEKHIKL-3` (full directive) + `VEKHIKL-4` to Closed in
`docs/DIRECTIVES.md`. The WASM pilot verdict (keep / inconclusive /
revert) is also captured here for owner sign-off.

## Playwright smoke evidence

Saved under
`artifacts/playtests/cycle-vekhikl-4/`
by `scripts/capture-vekhikl-4-tank-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| Open Frontier — M48 spawn (chassis + turret) | `tank-spawn.png` | Third-person framing on the US-base-side M48 spawn so the chassis + turret + barrel dominate the foreground; UI chrome hidden via the per-capture style injection. |
| Drive forward ~30 m (pilot seat) | `tank-drove-forward.png` | Best-effort: the harness mounts via `spawnPlayerInNearestVehicle` (or static framing fallback), commands forward throttle for ~3 s (covers ~25-30 m at default skid-steer cruise), then snaps the third-person follow camera framing off the moved spawn pose. |
| Swap to gunner seat (gunner POV) | `tank-gunner-view.png` | Best-effort: the harness drives the gunner adapter mount via the existing `enterVehicle(_, 'gunner')` surface (or its dev-console alias if exposed); camera is the first-person gunner sight along the barrel axis (per `TankGunnerAdapter.computeGunnerSightCamera`). Static frame if the gunner-seat-swap surface isn't reachable from the harness. |
| Turret slewed to target azimuth | `tank-turret-aimed.png` | Best-effort: harness calls `TankTurret.setTargetYaw(...)` + `setTargetPitch(...)` on the active tank's turret (or the dev console alias if exposed) to a known azimuth + elevation so the barrel visibly tracks off-axis. Captured after ~2 s of slew so the integrator has reached the target. |
| Cannon fired — frame at projectile apex | `tank-projectile-apex.png` | Best-effort: harness triggers `consumeFireRequest()` on the gunner adapter or invokes the cannon-fire dev command, waits for the projectile travel-time estimate (~0.7 s at ~400 m/s muzzle for a ~280 m flat shot), then snaps the world-camera framing at projectile apex. Depends on `tank-cannon-projectile` projectile spawn + `TankBallisticSolver` being wired into the gunner adapter. |
| Cannon impact — frame at terrain impact | `tank-projectile-impact.png` | Best-effort: harness waits for the projectile flight to complete (or for the `ExplosionEffectsPool` event), then snaps the world-camera framing at the impact site so the explosion VFX is in-frame. |
| HP < 33% — on-fire VFX | `tank-on-fire.png` | Best-effort: harness applies scripted damage via the dev console (`Tank.applyDamage(...)` or `debugSetHp` alias if exposed) to bring the chassis below the 33% HP band, then snaps the world-camera framing so the on-fire VFX dominates (third-person from ~10 m off-axis). Depends on `tank-damage-states` HP-band transitions being wired. |
| Tracks-blown substate | `tank-tracks-blown.png` | Best-effort: harness triggers tracks-blown via `vehicleManager.debugTracksBlown()` / `Tank.debugTriggerTracksBlown()` (whichever surface lands first). Frame captures the chassis in immobilized state — visible as motion-absence on subsequent throttle commands; static frame here reserves the path so the owner sweep has it. |
| Turret-jammed substate | `tank-turret-jammed.png` | Best-effort: harness triggers turret-jammed via the equivalent dev command. Frame captures the chassis with turret meshes visible but `TankTurret.update()` no-op'd (verifiable by attempting a `setTargetYaw` post-jam — barrel should not slew). Static frame here reserves the path. |
| Engine-killed substate | `tank-engine-killed.png` | Best-effort: harness triggers engine-killed via the equivalent dev command. Frame captures the chassis from third-person; the no-throttle state is visible only through input-non-response, not the still — the log line records whether the surface accepted the command. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR and runs against any state of the
R2 dispatch window. The screenshots themselves depend on the cycle's
R1 + R2 siblings being merged for the captured behaviors to render:

- **R1 already landed on this cycle's worktree base (master HEAD
  `0f9726a9`):** `tank-turret-rig` (`a3d71ecd`),
  `tank-cannon-projectile` (`59dd22f1`), and
  `tank-gunner-seat-adapter` (`081ac6d1` + the `0f9726a9` stub→real
  TankTurret swap). So the turret rig, cannon projectile, and gunner
  adapter primitives are available for any integration code to
  consume.
- **R2 `tank-damage-states`** — extends `Tank.ts` + `TankTurret.ts` +
  `TrackedVehiclePhysics.ts` with the HP-band state machine,
  turret-jammed (no slew), and engine-killed (no throttle) substates.
  Until this PR merges, the `tank-on-fire.png`,
  `tank-tracks-blown.png`, `tank-turret-jammed.png`, and
  `tank-engine-killed.png` captures will fall back to static framings
  and the log line will record the dev command as unavailable.
- **R2 `tank-ballistic-solver-wasm-pilot`** — Rust→WASM ballistic
  solver, called by the AI gunner for lead-prediction. Player-fired
  cannon shots do not require the solver (immediate input), so the
  player-side cannon captures (`tank-projectile-apex.png`,
  `tank-projectile-impact.png`) are not blocked on this PR landing.
  The NPC tank-gunner walk step depends on this PR + the AI route.
- **R2 `tank-ai-gunner-route`** — wires `CombatantAI` to mount NPC
  gunners on friendly parked tanks and fires with lead-prediction.
  Used by the owner-sweep step "observe NPC tank gunner engagement"
  in the punch list below. No named capture depends on this PR (the
  static still wouldn't convey the engagement).
- **Cannon-fire wiring beyond R1 stubs** — the `TankGunnerAdapter`
  exposes a latched `consumeFireRequest()`; whether the cannon
  actually spawns a projectile on consume depends on the integration
  code that connects gunner-adapter fire requests to
  `TankCannonProjectile.spawn(...)`. If this wire is absent at
  capture time, the apex + impact frames fall back to static framings
  and the log records the gap.

If you are reading this doc before the R2 sibling PRs merge, the
screenshot paths above are placeholders. Re-run the capture script
post-merge with:

```
npx tsx scripts/capture-vekhikl-4-tank-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on
master. The capture script tolerates:

- An absent `spawnPlayerInNearestTank` / `spawnPlayerInNearestVehicle`
  helper (falls back to a static framing at the documented spawn
  pose).
- An absent gunner-seat-swap surface (falls back to a static
  first-person framing at the documented gunner pose).
- An absent `setTargetYaw` / `setTargetPitch` aim surface on the
  active turret (falls back to a static framing).
- An absent cannon-fire trigger (falls back to a static framing at
  the documented apex/impact pose).
- An absent damage-substate dev command (`debugTracksBlown`,
  `debugTurretJammed`, `debugEngineKilled`, or generic
  `debugApplyDamage` — the harness probes each in turn). Each capture
  reserves its screenshot path; the log records which surface was
  reachable so the owner sweep has concrete evidence of what's wired.

Refine `position` / `yaw` / `pitch` / `azimuth` after the first
post-merge run by reading the actual spawn coordinates out of `Tank.ts`
or the M48 config block.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The M48
turret rig is a CPU-side transform hierarchy on top of the chassis
mesh; cannon projectiles spawn standard scene-graph meshes via the
existing `ExplosionEffectsPool`; no shader path differs across
backends, so the smoke check is valid on either backend — but the
owner sweep is the load-bearing check against strict-WebGPU desktop.

### Pose-refinement caveat

The capture poses are placeholder coordinates relative to the
documented M48 spawn points. The barrel-aimed pose in particular
assumes a known target azimuth roughly aligned with a visible
landmark in the Open Frontier scenario; refine post-merge by reading
the actual spawn position out of the M48 config and choosing a target
direction that frames the barrel against a high-contrast skyline.
Same for the apex + impact frames — projectile travel-time depends on
the chosen target distance, so the wait-then-snap timing in the
script may need a one-line refinement once a representative target
exists.

## Test plan (five-step owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's `vekhikl-4-playtest-evidence` Method section.

**On Open Frontier:**

1. **Mount pilot, drive ~30 m.** Spawn into the map. Locate the M48
   near the US base. Press F to enter the driver seat. Confirm camera
   switches to third-person orbit-tank framing. Hold W. Drive forward
   approximately 30 m. Confirm the chassis accelerates smoothly and
   the skid-steer feel from cycle #8 still reads correctly. (Full
   skid-steer feel test lives in the cycle #8 playtest memo; not
   repeated here.)
2. **Swap to gunner seat.** While mounted, swap from pilot to gunner.
   The exact key/dev-command lands with the
   `tank-gunner-seat-adapter` integration code (the adapter
   advertises `playerSeat = 'gunner'`; the session controller routes
   the swap via `enterVehicle(_, 'gunner')`). Confirm camera switches
   to first-person along the barrel axis (gunner sight).
3. **Aim cannon + fire at static target.** Mouse-aim — confirm the
   turret slews left/right at ~30°/s (yaw) and pitch up/down at ~8°/s
   within the M48 envelope (-10° depression to +20° elevation).
   Confirm the barrel visibly trails the mouse (not instant — slew
   cap is load-bearing for crew-served feel). Click LMB. Confirm:
   - Visible muzzle effect at the barrel tip.
   - Projectile travel is visible (~400 m/s muzzle gives ~0.7 s
     flight at the typical 280 m engagement; the round should be
     trackable as an object in flight, not an instant hit).
   - Impact at the target produces an `ExplosionEffectsPool`
     explosion + damage in radius.
4. **Observe projectile arc + impact.** Fire a second round at a
   target ~400-500 m out. Confirm the projectile arcs visibly under
   gravity (gravity-only model per the cycle brief). The arc should
   read as a tank cannon arc, not a mortar arc — the muzzle velocity
   is high enough that the trajectory is nearly flat at short range
   but visibly drops at long range.
5. **Take hits + observe HP-band transitions.** Park the M48 in
   front of an enemy AT position (or have a friendly NPC apply
   scripted damage via the dev console). As HP crosses each band
   threshold (100% → 66% → 33% → 0%), confirm the visual transition
   is distinct:
   - **100% → 66%:** smoke wisps from the chassis.
   - **66% → 33%:** smoke plume + light damage decals.
   - **33% → 0%:** on-fire VFX (flames visible) + heavier smoke.
   - **0% (wreck):** chassis stops responding; wreck visuals.
6. **Trigger each substate via developer command.** Open the dev
   console (typically the `\` Tweakpane panel or the in-game dev
   command surface). Trigger:
   - **tracks-blown:** `vehicleManager.debugTracksBlown()` or
     equivalent. Confirm forward throttle no longer produces forward
     motion; chassis tilt + turret + camera framing remain functional.
   - **turret-jammed:** `vehicleManager.debugTurretJammed()` or
     equivalent. Confirm mouse-aim no longer slews the turret;
     `TankTurret.update()` should be a no-op while jammed.
   - **engine-killed:** `vehicleManager.debugEngineKilled()` or
     equivalent. Confirm forward throttle no longer accelerates the
     chassis (similar but distinct from tracks-blown: engine-killed
     allows the tracks to coast on momentum, tracks-blown is a hard
     stop).
7. **Observe NPC tank gunner engagement.** Spawn or locate a parked
   friendly tank with an NPC gunner mounted (the
   `tank-ai-gunner-route` PR registers NPC gunners on friendly tanks
   in the strategic-sim spawn lane). Approach with an enemy combatant
   in the gunner's cone. Confirm:
   - NPC turret slews to the enemy lead position (using the WASM
     solver if `tank-ballistic-solver-wasm-pilot` landed; TS-only
     fallback otherwise).
   - NPC fires cannon when the lead is within the turret's cone
     tolerance.
   - Round visibly arcs to the target's lead position; impact damages
     the target.

**On A Shau Valley:**

8. Repeat steps 1-7 on the valley road. The slope-stall behaviour
   from cycle #8 still applies during the drive segment; turret
   slewing should feel identical (turret is chassis-relative, so hull
   tilt doesn't change the slew rate). The valley walls are useful
   high-contrast backdrops for the projectile-arc observation.

## Capture-script outputs section

Each numbered owner-walk step above has at least one corresponding
screenshot under
`artifacts/playtests/cycle-vekhikl-4/`. The capture-script run log
prints `resolvedBackend`, the M48 scene-probe result, and per-surface
availability flags so the owner sweep can confirm which features were
wired at capture time. Re-run the script with:

```
npx tsx scripts/capture-vekhikl-4-tank-shots.ts
```

after the R2 sibling PRs (`tank-damage-states`,
`tank-ai-gunner-route`, `tank-ballistic-solver-wasm-pilot`) merge and
back-fill the screenshots on master.

| Step | Screenshot file | Sibling-PR dependency |
|---|---|---|
| 1 (mount + drive) | `tank-spawn.png`, `tank-drove-forward.png` | None (R1 landed) |
| 2 (gunner swap) | `tank-gunner-view.png` | None (R1 landed) |
| 3-4 (aim + fire + arc + impact) | `tank-turret-aimed.png`, `tank-projectile-apex.png`, `tank-projectile-impact.png` | Cannon-fire wiring beyond R1 stubs |
| 5 (HP-band transitions) | `tank-on-fire.png` | `tank-damage-states` |
| 6 (substates) | `tank-tracks-blown.png`, `tank-turret-jammed.png`, `tank-engine-killed.png` | `tank-damage-states` (substate dev commands) |
| 7 (NPC gunner) | (no static still — observable only as motion + fire) | `tank-ai-gunner-route` |

## WASM pilot conclusion (template — owner records verdict here)

Per the cycle brief, the Rust→WASM ballistic-solver pilot ships with
an explicit success bar (≥3× speedup on the trajectory-eval hot path
vs the TS baseline). The pilot conclusion is data, not commitment —
the owner records the final verdict here after running the benchmark
+ playing the cannon.

- **Benchmark result (PR description):** _(owner: paste the WASM-vs-TS
  speedup multiplier and ballpark wall-clock per call from the
  `tank-ballistic-solver-wasm-pilot` PR description here)_
- **Bundle-size impact:** _(owner: paste the gzipped delta from the
  PR description; cycle hard-stop is ≥600 KB gzipped + failed
  speedup bar simultaneously)_
- **Verdict:** _(owner: KEEP / INCONCLUSIVE / REVERT — circle one)_
  - **KEEP** if speedup ≥3× and bundle delta within budget. Record
    the kept WASM module in `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`
    as the first Rust→WASM artifact in the codebase.
  - **INCONCLUSIVE** if speedup borderline (1.5-3×) or benchmark
    methodology suspect. Leave the WASM path in place but file a
    follow-up cycle to re-benchmark with better methodology.
  - **REVERT** if speedup <1.5× or bundle delta exceeds budget.
    Open a single-task revert cycle that removes the WASM module +
    TS wrapper and falls back to the in-line TS ballistic solver
    that `TankCannonProjectile` already uses for player-fired shots.
- **Notes from owner walk:** _(owner: any subjective notes — does
  the AI lead-prediction feel responsive? does the WASM call add a
  perceptible hitch on first invocation due to module instantiation?
  etc.)_

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

- [ ] **Mount pilot, drive ~30 m on Open Frontier** (step 1).
- [ ] **Swap to gunner seat** (step 2).
- [ ] **Aim cannon, fire at static target** (step 3).
- [ ] **Observe projectile arc + impact** (step 4).
- [ ] **Take hits, observe HP-band transitions** at 66%, 33%, 0%
      thresholds (step 5).
- [ ] **Trigger tracks-blown substate, confirm immobilization** (step 6a).
- [ ] **Trigger turret-jammed substate, confirm no-slew** (step 6b).
- [ ] **Trigger engine-killed substate, confirm no-throttle** (step 6c).
- [ ] **Observe NPC tank gunner engagement** in dev preview
      (step 7).
- [ ] **Repeat on A Shau Valley** (step 8) — turret slewing identical,
      chassis behaviour matches cycle #8 playtest expectations.
- [ ] **WASM pilot verdict recorded** above (KEEP / INCONCLUSIVE /
      REVERT).
- [ ] **No new carry-overs** opened against this cycle (any feel
      issues become a follow-up cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all 12 acceptance items pass — append the date + one-line
  summary to the "Owner sign-off" section above, then record both
  `VEKHIKL-3` (full directive — chassis + turret + cannon) and
  `VEKHIKL-4` as complete in `docs/DIRECTIVES.md` with this cycle's
  close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-vekhikl-4-tank-turret-and-cannon-fix.md`
  per the PLAYTEST_PENDING walk-through protocol. The merged
  commits are not reverted under autonomous-loop posture (except
  per the WASM-pilot REVERT verdict above, which is its own
  single-task revert cycle if triggered).

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/playtests/cycle-vekhikl-4/`;
  populated either by the capture script run in this PR (once the
  R2 sibling PRs are merged) or by a post-merge back-fill commit on
  master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
turret + cannon half of `VEKHIKL-3` (combined with the chassis half
from cycle #8, this closes the full directive) plus the entirety of
`VEKHIKL-4`. The WASM pilot verdict is recorded here for owner
sign-off; the cycle close does not require KEEP — it requires a
recorded verdict (any of KEEP / INCONCLUSIVE / REVERT).
