# Campaign: 2026-05-13 Post-WebGPU master merge → 2026-05-16 feature-pivot expansion

Last verified: 2026-05-16 (cycles #1-#3 closed at fd646aeb / 7931d179 / cycle #3 close-commit; current pointer = cycle #4 cycle-vekhikl-1-jeep-drivable)

Campaign manifest. Original trigger was the WebGPU + TSL master merge
on 2026-05-13; expanded on 2026-05-16 to absorb all VODA, VEKHIKL,
and DEFEKT directives in a single ordered queue so the orchestrator
can chain cycles autonomously.

## Status

**ACTIVE.** Auto-advance: **yes**. Posture: **autonomous-loop**.

The owner reset the campaign on 2026-05-16 with a single instruction:
queue every VODA, VEKHIKL, and DEFEKT directive plus the two
post-WebGPU investigation fix cycles, and chain them through an
**all-night autonomous loop** via `/goal`. The orchestrator dispatches
each cycle in queue order, runs its rounds, closes it, advances to
the next, and only halts on the hard-stops listed at the bottom of
this file.

**`posture: autonomous-loop` overrides** (per
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) §"Autonomous-loop
posture"): per-cycle playtest-required gates are deferred — the
orchestrator merges on CI green + reviewer APPROVE, captures
Playwright smoke screenshots in lieu of owner walk-through, and
appends to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) so the
owner can sweep the deferred items after the campaign completes.
Hard-stops below still halt the loop.

The current cycle pointer lives in
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) "Current cycle"
and is updated at every advance. **As of 2026-05-16 close of cycle
#3 at `8d12ede5`, the current cycle pointer is at position #4
(`cycle-vekhikl-1-jeep-drivable`).** Cycles #1, #2 and #3 are
`done` in the queue below; 15 PRs merged across the three cycles
(#208-#212, #214-#222), plus the out-of-band CI fix `47c42216`
that matrix-fans the mobile-ui job.

## Orchestrator contract (read this if you're the orchestrator)

This manifest is the source of truth for which cycle runs next.

1. At every `/orchestrate` invocation, read this file's "Queued cycles"
   table top to bottom. The first cycle whose status is not `done`,
   `skipped`, or `BLOCKED` is the active cycle.
2. Mirror that cycle's slug into the "Current cycle" section of
   [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) (Skip-confirm,
   Concurrency cap, Round schedule, etc. — copy from the cycle's brief
   at `docs/tasks/<slug>.md`).
3. Dispatch the cycle's R1 per the standard protocol.
4. On cycle close: mark the row `done` in the table below with the
   cycle close-commit SHA in the Notes column. Then re-read the table
   and advance to the next not-done cycle. Do NOT prompt the human
   while auto-advance is `yes`.
5. On hard-stop: mark the row `BLOCKED` with a one-line cause in the
   Notes column. Set `Auto-advance: PAUSED` at the top of this file.
   Stop. Print the failure summary. The human resumes by flipping
   auto-advance back to `yes` after fixing the cause.

The cycle briefs at `docs/tasks/<slug>.md` are pre-authored. They are
the authoritative scope for each cycle; this manifest only carries
ordering + a one-paragraph TL;DR per slot.

## Queued cycles

Sequenced in dependency + impact order. Owner can reorder rows or
flip `skipped` on any row at any time; the orchestrator picks up the
new ordering at next advance.

| # | Slug | Status | Closes | Brief | Notes |
|---|------|--------|--------|-------|-------|
| 1 | `cycle-sky-visual-restore` | done | KB-SKY-BLAND | [brief](tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md) | Closed 2026-05-16 at `fd646aeb`. 3 R1 PRs: #208 `2118177f`, #210 `3455fa96`, #209 `9e1ce7c7`. Owner playtest deferred to PLAYTEST_PENDING.md. |
| 2 | `cycle-mobile-webgl2-fallback-fix` | done | KB-MOBILE-WEBGPU | [brief](tasks/archive/cycle-mobile-webgl2-fallback-fix/cycle-mobile-webgl2-fallback-fix.md) | Closed 2026-05-16 at `7931d179`. 9 PRs across R1/R2/R3: #213 `6e7a8879`, #211 `9e1ccab5`, #212 `0b3b749d`, #215 `99044966`, #214 `ca725369`, #216 `706ad344`, #217 `83fb9fb0`, #218 `ff87e635`, #219 `a81d8cda`. Plus out-of-band CI fix `47c42216` matrix-fan-out mobile-ui. Real-device walk-through deferred to PLAYTEST_PENDING.md (3rd active row); harness script `scripts/real-device-validation.ts` ready. |
| 3 | `cycle-konveyer-11-spatial-grid-compute` | done | DEFEKT-3 | [brief](tasks/archive/cycle-konveyer-11-spatial-grid-compute/cycle-konveyer-11-spatial-grid-compute.md) | Closed 2026-05-16 at cycle close-commit. 3 R1 PRs: #220 `9a02714a` CoverSpatialGrid 8m-cell grid, #221 `a5b5bcd6` AIStateEngage consumer with structural CoverGridQuery + Phase F sub-marker, #222 `8d12ede5` L3 integration test with 5ms p99 budget. R2 GPU-compute prototype skipped — R1 wins met bars (combat_budget_dominance 0%, zero >100ms hitches in 5939 frames vs documented 954ms baseline, p99 +3.0% under 5% hard-stop). |
| 4 | `cycle-vekhikl-1-jeep-drivable` | queued | VEKHIKL-1 (unblocks VODA-3) | [brief](tasks/cycle-vekhikl-1-jeep-drivable.md) | M151 end-to-end on `GroundVehiclePhysics`. ~5 tasks, 2 rounds. |
| 5 | `cycle-voda-1-water-shader-and-acceptance` | queued | VODA-1 + WaterSystem split | [brief](tasks/cycle-voda-1-water-shader-and-acceptance.md) | Water shader + intersections + flow visuals + owner acceptance. Co-dispatches the WaterSystem.ts split. ~6 tasks, 2 rounds. |
| 6 | `cycle-vekhikl-2-stationary-weapons` | queued | VEKHIKL-2 | [brief](tasks/cycle-vekhikl-2-stationary-weapons.md) | Fixed emplacements; reuses VEKHIKL-1 seat-occupant surface. ~4 tasks, 1-2 rounds. |
| 7 | `cycle-voda-2-buoyancy-swimming-wading` | queued | VODA-2 | [brief](tasks/cycle-voda-2-buoyancy-swimming-wading.md) | Wires `WaterSystem.sampleWaterInteraction` into physics + player state. ~5 tasks, 2 rounds. |
| 8 | `cycle-vekhikl-3-tank-chassis` | queued | VEKHIKL-3 (partial) | [brief](tasks/cycle-vekhikl-3-tank-chassis.md) | Skid-steer locomotion + ground-conform per `TANK_SYSTEMS_2026-05-13.md`. ~5 tasks, 2 rounds. |
| 9 | `cycle-vekhikl-4-tank-turret-and-cannon` | queued | VEKHIKL-3+4 | [brief](tasks/cycle-vekhikl-4-tank-turret-and-cannon.md) | Turret, cannon, ballistic solver. Named Rust→WASM pilot per `BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`. ~6 tasks, 2-3 rounds. |
| 10 | `cycle-voda-3-watercraft` | queued | VODA-3 | [brief](tasks/cycle-voda-3-watercraft.md) | Sampan + PBR boat. Depends on VODA-2 + VEKHIKL-1 surface. ~5 tasks, 2 rounds. |
| 11 | `cycle-defekt-4-npc-route-quality` | queued | DEFEKT-4 | [brief](tasks/cycle-defekt-4-npc-route-quality.md) | Slope-stuck, navmesh crowd re-enable, terrain solver fixes. `terrain-nav-reviewer`-gated. ~3 tasks. |
| 12 | `cycle-stabilizat-1-baselines-refresh` | queued | DEFEKT-1 / STABILIZAT-1 | [brief](tasks/cycle-stabilizat-1-baselines-refresh.md) | Refresh `perf-baselines.json` after feature work. ~2 tasks. |

## Hold list

Cycles that exist in the queue concept but are intentionally NOT
sequenced into the active list above. They wait for the named trigger.

| Slug | Trigger to promote | Reason held |
|------|-------------------|-------------|
| `cycle-mode-startup-terrain-bake-hardening` | KB-STARTUP-1 visual acceptance fails OR cycle #2 mobile-fix doesn't absorb the synchronous-bake path | Spike branch `task/mode-startup-terrain-spike` already merged the worker-bake path. Hardening is paged-in if needed during cycle #2 mobile-fix; otherwise this cycle never runs. |
| `cycle-konveyer-12-indirect-draw-gpu-culling` | After cycle #5 VODA-1 lands and the water/vegetation overdraw picture stabilizes | Phase F R2/R3 follow-up; reduces draw count for distant impostors. Better measured against the post-VODA water+vegetation state. |
| `cycle-phase-f-r2-r4-on-master` | After cycle #6 VEKHIKL-2 lands | Render-silhouette + cluster lanes + squad-aggregated strategic sim + budget arbiter v2. May split if budget arbiter v2 grows. |
| `cycle-konveyer-large-file-splits` (HosekWilkieSkyBackend half) | When a TSL fragment-shader sky port lands (not on this queue) | The `WaterSystem.ts` half co-dispatches with cycle #5; the sky half awaits a TSL sky-port cycle that isn't queued today. |

## Dependencies (DAG between queued cycles)

- #4 `cycle-vekhikl-1-jeep-drivable` unblocks #10 `cycle-voda-3-watercraft`
  (the seat/adapter pattern + `GroundVehiclePhysics` surface generalize
  to watercraft).
- #5 `cycle-voda-1-water-shader-and-acceptance` blocks #7
  `cycle-voda-2-buoyancy-swimming-wading` (the visual surface must be
  accepted before player-state consumers wire in).
- #7 `cycle-voda-2-buoyancy-swimming-wading` blocks #10
  `cycle-voda-3-watercraft` (watercraft uses the buoyancy +
  swim/wade contracts).
- #8 `cycle-vekhikl-3-tank-chassis` blocks #9
  `cycle-vekhikl-4-tank-turret-and-cannon` (turret + cannon mount
  onto the chassis surface).
- #12 `cycle-stabilizat-1-baselines-refresh` runs last so the
  baseline captures the cumulative effect of the feature work.

Cycles #1-3 (sky-visual-restore, mobile-webgl2-fallback-fix,
konveyer-11) and #11 (defekt-4) have no upstream dependencies in the
queue and could be reordered if owner prefers. The current order
leads with stabilization fixes (cycles #1-3) so the feature cycles
land on a healthy mobile + combat-AI baseline.

## Active vision direction (carried from the original manifest)

Two parallel first-class directions, confirmed by owner on 2026-05-12
and restated after master merge.

### A. Forward-leaning experimental WebGPU / browser-primitive tech

KONVEYER follow-ups now living on master:

- Compute spatial-grid (cover-query indexing; closes DEFEKT-3
  surface — **cycle #3 above**).
- Indirect drawing + `BatchedMesh` for impostor pipelines (hold-list:
  `cycle-konveyer-12-indirect-draw-gpu-culling`).
- TSL ComputeNode particles where the existing CPU pipelines (tracers,
  impacts, explosions) earn the migration.
- Storage textures (atlas-write, GPU-driven LUT refresh) where the
  current `DataTexture` upload path becomes a bottleneck.
- GPU timestamps for per-pass attribution once
  `WebGPURenderer.getRenderInfo()` exposes timing surfaces.

Plus "best-fit classic primitives where they earn their keep" —
AudioWorklet for vehicle engine sim, OPFS for prebake cache,
SharedArrayBuffer-flavoured worker buffers, etc. (see
`docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` for the
leverage-ranked inventory.)

Rust → WASM is **spike-only as a first pass**, not a default. The
named first pilot candidate is the tank-cannon ballistic solver from
`docs/rearch/TANK_SYSTEMS_2026-05-13.md` — landed at **cycle #9 above**.

### B. Driveable land vehicles

- **VEKHIKL-1** — M151 jeep drivable end to end (**cycle #4 above**).
- **VEKHIKL-2** — Stationary weapons (**cycle #6 above**).
- **VEKHIKL-3 / VEKHIKL-4** — tank chassis + turret + cannon
  (**cycles #8 and #9 above**).

Both directions are first-class. The current queue interleaves them
with the VODA water track so neither stalls.

## Hard stops

The orchestrator halts the campaign and surfaces to the owner when
any of these fire. The current cycle's row in the queue table gets
marked `BLOCKED` with a one-line cause; `Auto-advance: yes` flips to
`PAUSED`.

- **Fenced-interface change** (`src/types/SystemInterfaces.ts`). Needs
  an explicit `[interface-change]` PR title and reviewer approval.
- **Master force-push.** Never.
- **Perf regression > 5% p99 vs master baseline** once
  `cycle-stabilizat-1-baselines-refresh` (cycle #12) has refreshed the
  baseline. Until #12 lands, the prior baseline plus the
  WebGPU-migration steady-pose proof in
  `KONVEYER_REVIEW_PACKET_2026-05-12.md` is the bar.
- **Carry-over count growth past 12.** Active count is currently 9.
  Growth beyond the policy bound triggers a backlog-prune cycle ahead
  of the next feature slot.
- **WebGL fallback accepted as new evidence.** The fallback is
  production-load-bearing now (commit `4aec731e`), but strict-WebGPU
  evidence remains the acceptance bar for renderer-architecture
  claims. Cycles that change renderer behavior must capture strict
  evidence, not fallback evidence.
- **Worktree isolation failure.** Per the AGENT_ORCHESTRATION
  protocol.
- **Twice-rejected reviewer.** Per the standard cycle protocol.
- **>2 CI red / blocked tasks in a single round** of any cycle.
- **Carry-over count grew during a cycle** (cycle becomes INCOMPLETE;
  campaign halts so the owner can address the regression).

When a hard-stop fires:

1. Mark the failing cycle's row in the table above as `BLOCKED` with
   a one-line cause in the Notes column.
2. Set `Auto-advance: PAUSED` at the top of this file.
3. Leave the "Current cycle" pointer in
   [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) pointing at
   the failed cycle so the human resume picks up where you left off.
4. Print a clear summary per the end-of-run format in
   [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md).

## Resuming after pause

To re-enable the chain:

1. Owner addresses the hard-stop cause (rolls back a commit, refreshes
   a baseline, fixes a reviewer-flagged regression, etc.).
2. Flip `Auto-advance: PAUSED` back to `Auto-advance: yes` at the top
   of this file.
3. Update the BLOCKED row's status back to `queued` (or, if the cycle
   needs a rescope, edit its brief and re-dispatch).
4. Run `/orchestrate`. The orchestrator picks up at the first
   not-done row.

## Skipping a cycle

If a cycle is overtaken by events:

1. Set its row's status to `skipped` with a one-line cause in Notes.
2. The orchestrator advances past it on the next dispatch.

## Predecessor

This manifest supersedes
[docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md), which is flagged
historical at its first line. The 2026-05-09 manifest was the original
9-cycle stabilization-refactor plan; it was paused on 2026-05-11 when
the active run pivoted to KONVEYER-10 on the experimental branch and
remained paused through the KONVEYER campaign. The triggering event for
this new manifest was the master merge of
`exp/konveyer-webgpu-migration` via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
on 2026-05-13T02:06:03Z (merge commit `1df141ca`), followed by the
fallback fix `4aec731e`.

The 2026-05-09 manifest is not deleted; it is retained as historical
reference for the 9-cycle plan that the 2026-05-12 vision pivot
superseded. Items from that manifest that remain relevant
(`STABILIZAT-1` baselines refresh, the combatant-renderer / movement
split cycles) are rolled forward as named entries in the queue above
or in the hold list.

## Reference

- [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md) — orchestrator
  protocol + "Current cycle" pointer.
- [.claude/agents/orchestrator.md](../.claude/agents/orchestrator.md) —
  orchestrator playbook (campaign auto-advance section).
- [docs/CARRY_OVERS.md](CARRY_OVERS.md) — active carry-over registry.
- [docs/BACKLOG.md](BACKLOG.md) — Recently Completed cycle log.
- [docs/DIRECTIVES.md](DIRECTIVES.md) — VODA / VEKHIKL / DEFEKT
  directive sources.
- [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](rearch/POST_KONVEYER_MIGRATION_2026-05-13.md)
  — milestone memo capping the KONVEYER campaign.
- [docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md](rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md)
  — predecessor reviewer-ready synthesis (now historical post-merge).
- [docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  — unblocks cycle #4 `cycle-vekhikl-1-jeep-drivable`.
- [docs/rearch/TANK_SYSTEMS_2026-05-13.md](rearch/TANK_SYSTEMS_2026-05-13.md)
  — unblocks cycles #8 and #9.
- [docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
  — forward-looking primitive inventory; informs cycles #9, #11.
- [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
  — input to cycles #1 and #2.
- [docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md](rearch/ENGINE_TRAJECTORY_2026-04-23.md)
  — "keep the stack" stance with the 2026-05-13 ground-vehicle
  addendum.
- [docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md) — historical
  predecessor manifest.
- [docs/state/CURRENT.md](state/CURRENT.md) — top-level current-truth
  snapshot.
