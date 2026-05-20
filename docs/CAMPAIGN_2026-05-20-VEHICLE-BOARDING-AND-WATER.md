# Campaign: 2026-05-20 Vehicle Boarding + Water (parallel cycles)

Last verified: 2026-05-20 (queued; pre-dispatch)

Campaign manifest. Trigger: owner 2026-05-20 walk of live build
(SHA `8b5e826` at `terror-in-the-jungle.pages.dev`) plus a deep
codebase audit. Three issues captured:

1. **Press F does nothing on any drivable vehicle**. The "Press F to
   board <vehicle>" HUD prompt shipped by cycle 2026-05-19's
   `cycle-vehicle-wayfinding-and-prompts` is decorative — there is no
   F-key handler wired to the per-category player adapters
   (`GroundVehiclePlayerAdapter`, `TankPlayerAdapter`,
   `WatercraftPlayerAdapter`, `EmplacementPlayerAdapter`) and none of
   those adapters are ever constructed by production code. The
   `VehicleSessionController.enterVehicle(...)` path only fires for
   `helicopter` + `fixed_wing` today. NPC boarding paths (tank gunners,
   M2HB NPCs) are unaffected and continue to work.
2. **Open Frontier has no rendered river surface**. The procedural-river
   network is baked + queryable on OF, the Sampan + PBR scenario
   spawns are pointed at the river segment, but `waterEnabled` has
   never been set on `OpenFrontierConfig` — so the boats spawn over
   dry-looking terrain. A Shau got its river render in cycle 2026-05-19
   PR #277 but the OF analog never landed.
3. **OF motor pool clutter + duplicate M48**. The
   `motor_pool_heavy` prefab parks M35 + M151 + M113 + M48 in a
   4 m-deep strip with all roughly the same yaw, while a SECOND M48
   (the real Tank IVehicle) spawns at `(-995, 0, -760)` near the
   West FOB. The motor pool reads as a rigid parking lineup and the
   FOB tank has no visible context.

## Status

**Queued, pre-dispatch.** Three cycles. **All three run in parallel**
because they touch disjoint subsystems:

- Cycle #1 → `src/systems/player/**`, `src/systems/vehicle/**`,
  `src/integration/vehicle/**`, `src/core/{Startup,Operational}RuntimeComposer.ts`
  (boarding wire).
- Cycle #2 → `src/config/OpenFrontierConfig.ts`,
  `src/core/OperationalRuntimeComposer.ts` (snap resolver only),
  `src/systems/environment/water/WaterSurfaceSampler.ts` (helper if
  needed) (OF river render + boat snap).
- Cycle #3 → `src/systems/world/WorldFeaturePrefabs.ts`,
  `src/config/vehicles/m48-config.ts`,
  `src/systems/vehicle/M48TankSpawn.ts` (motor pool reflow + tank
  dedup).

There is no DAG between them. The orchestrator dispatches all three R1
rounds concurrently (across three worktrees), then their R2 rounds.

## Orchestrator contract (read this if you're the orchestrator)

This manifest is the source of truth for which cycles run. Like the
2026-05-19 campaign, this campaign dispatches all three cycles in
parallel under a shared concurrency cap.

1. At `/orchestrate` invocation, read the "Queued cycles" table below.
   All cycles in `pending` status are launched in parallel.
2. Mirror the campaign's parallel state into the "Current cycle"
   section of [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md):
   list all three cycles with their R1 task lists side-by-side.
3. Dispatch each cycle's R1 in its own worktree
   (`isolation: worktree`). Concurrency cap **10** for this campaign:
   - cycle #1 R1 = 5 tasks (largest)
   - cycle #2 R1 = 3 tasks
   - cycle #3 R1 = 2 tasks
   - 5 + 3 + 2 = 10 parallel executors.
4. Reviewer assignments (per-cycle):
   - Cycle #1: no mandatory reviewer.
   - Cycle #2: `terrain-nav-reviewer` mandatory on the
     `of-water-config-flip` PR (WaterSystem render path is adjacent
     to terrain).
   - Cycle #3: no mandatory reviewer.
5. Each cycle closes independently per its own brief's acceptance
   criteria. The campaign closes when all three cycles close AND the
   final master tip has been deployed to production.
6. On hard-stop in any cycle: mark that cycle's row `BLOCKED` with a
   one-line cause; the other cycles continue unless they share a
   blocker. Set `Auto-advance: yes` → `PAUSED` only if ≥ 2 cycles
   hard-stop simultaneously (campaign-level halt).
7. The "Current cycle" section gets reset to the empty stub only
   after **all three** cycles close.
8. **Deploy step (campaign-close gate).** After all three cycles close
   on master, the orchestrator triggers
   `gh workflow run deploy.yml --ref master`, polls until the new
   production deployment lands, and records the deployed SHA in the
   campaign close memo. This is the explicit fulfillment of the
   "make sure water is proper in production" owner ask.

The cycle briefs at `docs/tasks/<slug>.md` are pre-authored. They are
the authoritative scope for each cycle; this manifest only carries
ordering + a one-paragraph TL;DR per slot.

## Queued cycles

Three independent cycles. No DAG. Dispatch order does not matter.

| # | Slug | Status | Opens / Closes | Brief | Notes |
|---|------|--------|----------------|-------|-------|
| 1 | `cycle-vekhikl-player-boarding-wire` | **pending** | VEKHIKL-UX-2 (opens+closes in-cycle) | [brief](tasks/cycle-vekhikl-player-boarding-wire.md) | Critical bug fix. Largest cycle (5 R1 tasks). Wires the missing F-key → ground/tank/watercraft/emplacement boarding glue. Mortar fire stays on F via fallback router. Pilot seat only — M48 gunner swap + PBR gunner swap deferred to follow-ups. |
| 2 | `cycle-of-river-surface-enable` | **pending** | VODA-OF-1 (opens+closes in-cycle) | [brief](tasks/cycle-of-river-surface-enable.md) | Enables `waterEnabled: true` on Open Frontier so the hydrology river ribbon renders. Adds water-surface spawn snap for OF Sampan + PBR. Keeps global sea-level plane enabled (OF terrain centers near y=0, unlike A Shau which sits at +580 m). |
| 3 | `cycle-motor-pool-reflow-and-tank-dedup` | **pending** | VEKHIKL-LAYOUT-1 (opens+closes in-cycle) | [brief](tasks/cycle-motor-pool-reflow-and-tank-dedup.md) | Reflows `motor_pool_heavy` prefab placements for ≥1.5 m clearance + ≥60° yaw spread. Removes the dressing M48 from the OF motor pool prefab and relocates the scenario-spawn real Tank IVehicle to the motor pool bay. A Shau motor pool must not regress (split prefab if needed). |

## Hold list

Cycles that exist in the campaign concept but are intentionally NOT
launched yet. They wait for the named trigger.

| Slug | Trigger to promote | Reason held |
|------|-------------------|-------------|
| `cycle-vekhikl-5-fleet-expansion` | Owner signs off on `cycle-vehicle-wayfinding-and-prompts` AND `cycle-vekhikl-player-boarding-wire` playtest evidence | Adds **M113 APC**, **M35 truck**, **T-54/55**, optional **ZU-23-2** + **LCM-8**. Needs the new boarding wire in cycle #1 to be owner-validated before adding more vehicles. |
| `cycle-vekhikl-seat-swaps` | Owner signs off on `cycle-vekhikl-player-boarding-wire` playtest evidence | Adds the pilot ↔ gunner seat swap on M48 (TankGunnerAdapter mount path) and on PBR (M2HB twin mounts via EmplacementPlayerAdapter wired through PBR child). Cycle #1 of this campaign explicitly scopes pilot seat only; the swap UX is a follow-up. |
| `cycle-sky-screen-space-quad` | OF + A Shau still show sky artifacts after the 2026-05-19 LUT bump (carried over from the 2026-05-19 campaign hold list) | Sky architecture rework. |
| `cycle-stabilizat-1-baselines-refresh` | Owner direction (carried over from the post-WebGPU campaign close 2026-05-18) | STABILIZAT-1 stays active until this runs. Combat120 baselines remain at `measurement_trust=warn`. |

## Dependencies (DAG between queued cycles)

**None.** The three queued cycles touch disjoint subsystems. The
campaign explicitly exists to run them in parallel.

Cross-cycle observations (informational only):
- Cycle #1 (boarding) and cycle #3 (motor pool reflow + tank dedup)
  both touch the OF M48. The boarding cycle does NOT change vehicle
  positions; it only wires the F-key glue. The reflow cycle changes
  positions. They are independent because the boarding cycle reads
  `M48_SCENARIO_SPAWNS.open_frontier` at runtime; whatever coord is
  in the file at orchestrator-merge time is what gets used. If both
  cycles land in the same dispatch window, the merge order
  determines which coord ends up on master; the proximity prompt
  will fire at whichever location is current. No data conflict.
- Cycle #2 (OF river) and cycle #1 (boarding) interact via the
  Sampan + PBR. Once #2 lands, the proximity prompt at the OF Sampan
  spawn becomes meaningfully reachable (player can walk up to the
  boat sitting on water rather than dirt). #1's playtest captures
  may show pre-water dirt-floating boats if #1 lands before #2; this
  is acceptable — both fix at campaign close.
- Cycle #3 may want to coordinate with #1's playtest evidence: the
  capture script `capture-vekhikl-player-boarding-shots.ts` may need
  to know the new OF M48 coord. Each capture script reads
  `M48_SCENARIO_SPAWNS` directly so the merge order is self-healing.

## Hard-stops (campaign-level)

Per-cycle hard-stops live in each cycle's brief. The campaign-level
hard-stops below halt **all three cycles simultaneously**:

- ≥ 2 of the 3 cycles hit a hard-stop in the same dispatch round.
  Set `Auto-advance: yes` → `PAUSED`; surface to owner.
- Carry-over count grows across the campaign (sum of all three
  cycles' net carry-over deltas > 0). Each cycle is designed for net
  delta 0; if any cycle opens an additional active row, halt.
- A fence-change proposal lands in any executor report. Halt;
  surface to owner.
- Worktree isolation failure in any cycle. Halt that cycle; the
  other two continue.
- `combat120` p99 regresses > 5% from the 2026-05-19 campaign close
  baseline (STABILIZAT-1 caveat applies — baselines are warn-stamped;
  treat as soft gate, not hard, but document any regression in the
  campaign close memo).
- Deploy step fails (cloudflare deploy errors or production smoke
  test fails post-deploy). Halt and surface; owner walks the
  deployment manually.

## Campaign close criteria

The campaign closes when **all three** cycles close per their own
acceptance criteria AND the production deploy completes successfully.

At close:

1. Append a `## Recently Completed (campaign-2026-05-20-vehicle-boarding-and-water)`
   section to `docs/BACKLOG.md` with the PR list across all three
   cycles, plus the cycle close-commit SHAs and the deployed
   production SHA.
2. Move each closed cycle's brief from `docs/tasks/<slug>.md` to
   `docs/tasks/archive/campaign-2026-05-20-vehicle-boarding-and-water/<slug>.md`
   (single shared subfolder for the campaign).
3. Move this manifest from `docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md`
   to `docs/archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md`.
4. Update CLAUDE.md "Current focus" section.
5. Update `docs/CARRY_OVERS.md` with the three closed entries +
   history log.
6. Trigger production deploy: `gh workflow run deploy.yml --ref master`.
   Poll until success. Record deployed SHA. Verify
   `terror-in-the-jungle.pages.dev` returns 200 + the new water on OF
   renders (manual visit or a Playwright smoke).
7. Promote hold-list cycles only if owner explicitly approves
   post-campaign.

## Posture

**`auto-advance: yes`** (parallel dispatch, no human gating between
R1 and R2 within each cycle).

**`posture: autonomous-loop`** — per-cycle playtest gates are
deferred to PLAYTEST_PENDING; merge is gated on CI green +
reviewer APPROVE (per cycle's reviewer policy) + Playwright smoke
captures. Owner walk-through happens after the campaign closes and
after production has the new code.

## Notes for the orchestrator

- Three parallel dispatch streams. Track each cycle's round status
  independently in your scratch state.
- The boarding cycle (#1) is the largest and most user-observable.
  If you have to triage, finish #1 first; #2 and #3 are quality-of-life.
- Reviewer subagent assignment is per-cycle; only cycle #2 has a
  mandatory reviewer (`terrain-nav-reviewer` on the config flip).
- The deploy step at campaign close is a hard gate — the campaign
  is not closed until production is updated. This is the explicit
  fulfillment of the "make sure water is proper in production"
  owner ask.
- Hold-list cycles `cycle-vekhikl-5-fleet-expansion` and
  `cycle-vekhikl-seat-swaps` are owner-gated; do NOT auto-promote
  when the cycles in this campaign close.

## Background — context for the executor agents

Two earlier campaigns set up the surface area this campaign closes the
loop on:

1. **`campaign-2026-05-13-post-webgpu`** (closed 2026-05-18) shipped
   the WebGPU+TSL renderer, then 12 cycles of feature work including
   M151 jeep, M48 tank + turret + cannon, M2HB emplacement, Sampan,
   PBR, swim + wade, A Shau DEM. Each VEKHIKL/VODA cycle closed with
   the vehicle "code-complete" but with owner-walk-through deferred.
2. **`campaign-2026-05-19-visual-and-wayfinding`** (closed 2026-05-20)
   shipped three parallel cycles: sky LUT bump, A Shau DEM edge +
   route stamp + water enable, and vehicle wayfinding (HUD prompt +
   minimap + full map + compass markers). The wayfinding cycle
   advertised "Press F to board" but didn't wire the F-key handler —
   the gap this campaign closes.

The 2026-05-20 deep audit (codex commit history + grep of every
`PlayerAdapter` constructor site + every `VehicleSessionController.enterVehicle`
call) confirmed:
- The four ground/water/empl player adapters are fully tested in
  isolation but never `new`-ed in production.
- `VehicleSessionController.enterVehicle('ground' | 'tank' | 'watercraft' | 'emplacement', _, _)`
  is never called.
- The HUD prompt that shipped 2026-05-19 cycle #3 was missing the
  composer-side wiring needed to actually act on the F-key press.

This is the gap this campaign closes.
