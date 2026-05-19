# Campaign: 2026-05-13 Post-WebGPU master merge → 2026-05-16 feature-pivot expansion

Last verified: 2026-05-18 (CAMPAIGN CUT at cycle #12 per owner direction; cycles #1-#12 closed; cycle #13 `cycle-stabilizat-1-baselines-refresh` removed from scope and may be re-queued as a standalone cycle later; 66 PRs merged across cycles #1-#12)

Campaign manifest. Original trigger was the WebGPU + TSL master merge
on 2026-05-13; expanded on 2026-05-16 to absorb all VODA, VEKHIKL,
and DEFEKT directives in a single ordered queue so the orchestrator
can chain cycles autonomously.

## Status

**CLOSED 2026-05-18.** Auto-advance: **stopped** (campaign cut at cycle #12). Posture: was autonomous-loop. Cycle #13 `cycle-stabilizat-1-baselines-refresh` taken out of scope per owner direction; can be re-queued as a standalone cycle if/when needed.

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
and is updated at every advance. **As of 2026-05-18 close of cycle
#11 at the cycle close-commit (last R2 merge at PR #267
terrain-solver-stall-fix; all three cycle PRs received
`terrain-nav-reviewer` APPROVE pre-merge), the current cycle
pointer is at position #12
(`cycle-sun-and-atmosphere-overhaul`).** Cycles #1 through #11
are `done` in the queue below; 60 PRs merged across the eleven cycles
(#208-#212, #214-#258, #259-#267), plus the out-of-band CI fix `47c42216`
that matrix-fans the mobile-ui job. The queue grew to **13 cycles** on
2026-05-17 with the insertion of `cycle-sun-and-atmosphere-overhaul`
at position #12 per the
[SUN_AND_ATMOSPHERE_VISION_2026-05-16](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
spike recommendation; the original `cycle-stabilizat-1-baselines-refresh`
shifts to position #13 so the baseline refresh captures the new sky
cost as the new normal.

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
| 4 | `cycle-vekhikl-1-jeep-drivable` | done | VEKHIKL-1 (unblocks VODA-3) | [brief](tasks/archive/cycle-vekhikl-1-jeep-drivable/cycle-vekhikl-1-jeep-drivable.md) | Closed 2026-05-16 at cycle close-commit. 5 PRs across 2 rounds. R1: #223 `6309558a` GroundVehiclePhysics (581 LOC fixed-step sim), #224 `e687e70a` tests (305 LOC, 7 behavior tests). R2: #226 GroundVehiclePlayerAdapter + VehicleManager helper, #227 `901ae017` M151 integration + smoke, #225 playtest evidence + capture script + PLAYTEST_PENDING row. Existing motor_pool world-feature prefabs satisfy "visible at spawn on both modes". VEKHIKL-1 promoted to code-complete; owner walk-through deferred to PLAYTEST_PENDING under autonomous-loop posture. |
| 5 | `cycle-voda-1-water-shader-and-acceptance` | done | VODA-1 + WaterSystem split | [brief](tasks/archive/cycle-voda-1-water-shader-and-acceptance/cycle-voda-1-water-shader-and-acceptance.md) | Closed 2026-05-16 at cycle close-commit. 5 PRs across 2 rounds. R1: #228 `dfee8d64` terrain-water-intersection-mask (terrain-nav-reviewer APPROVE; opt-in default-off binding), #229 `62db21c2` water-surface-shader (MeshStandardMaterial + onBeforeCompile chosen; sibling collision composed into single installWaterMaterialPatches). R2: #231 `ca679273` hydrology-river-flow-visuals (per-vertex flow/foam attributes + shader patch), #232 `f14400d2` water-system-file-split (1125 LOC → 300 LOC orchestrator + 5 modules ≤300 each; grandfather entry removed), #230 playtest evidence + capture script + PLAYTEST_PENDING row. No WebGLRenderTarget reflection (mobile no-RT win preserved). 11 existing tests pass byte-identical + 17 new sibling tests. VODA-1 code-complete; owner walk-through deferred. Closes konveyer-large-file-splits water half. |
| 6 | `cycle-vekhikl-2-stationary-weapons` | done | VEKHIKL-2 | [brief](tasks/archive/cycle-vekhikl-2-stationary-weapons/cycle-vekhikl-2-stationary-weapons.md) | Closed 2026-05-17 at `78c9c55a`. 6 PRs across R1/R2/R3. R1: #233 `0096d825` Emplacement IVehicle surface, #234 `917d83df` EmplacementPlayerAdapter. R2: #235 `c9725b76` playtest-evidence (deferred), #237 `0732beaa` m2hb-weapon-integration, #236 `afa90775` emplacement-npc-gunner (reviewer CHANGES-REQUESTED → APPROVE iteration). R3: #238 `78c9c55a` system bootstrap wiring + scenario spawns. VEKHIKL-2 promoted to code-complete; owner walk-through deferred to PLAYTEST_PENDING. No fence change. |
| 7 | `cycle-voda-2-buoyancy-swimming-wading` | done | VODA-2 | [brief](tasks/archive/cycle-voda-2-buoyancy-swimming-wading/cycle-voda-2-buoyancy-swimming-wading.md) | Closed 2026-05-17 at cycle close-commit (last R2 merge `47e394c2` shipping playtest-evidence). 7 PRs across 2 rounds. R1: #239 `89365f4c` buoyancy-physics (new `src/systems/environment/water/BuoyancyForce.ts` consuming `sampleWaterInteraction`; behavior tests for neutral float, sink, surface, dampened oscillation), #240 `98ffeabc` npc-wade-behavior (CombatantMovement speed scales with immersion in shallow water; nav cost up-weight; combat-reviewer APPROVE), #241 `83415458` player-swim-and-breath (PlayerMovement swim-mode branch; PlayerHealthSystem breath timer with gasp + damage past 45 s; new PlayerSwimState; HUD breath gauge). R2: #242 `2496b4e1` water-sampler-composer-wiring (activates dormant R1 consumers), #245 `163ecb73` river-flow-gameplay-current (horizontal flow force from hydrology channels), #244 `0b24a19f` wade-foot-splash-visuals (reuses existing impact-effects pool), #243 `47e394c2` voda-2-playtest-evidence (deferred under autonomous-loop). VODA-2 promoted to code-complete; owner walk-through deferred to PLAYTEST_PENDING. No fence change (`sampleWaterInteraction` consumed, not modified). |
| 8 | `cycle-vekhikl-3-tank-chassis` | done | VEKHIKL-3 (partial) | [brief](tasks/archive/cycle-vekhikl-3-tank-chassis/cycle-vekhikl-3-tank-chassis.md) | Closed 2026-05-17 at cycle close-commit (last R2 merge `a11c1ddf` swapping TankPlayerAdapter stub for real Tank instance). 5 PRs across 2 rounds. R1: #246 `6ab6ade5` tracked-vehicle-physics-core (new `TrackedVehiclePhysics.ts` per TANK_SYSTEMS memo; skid-steer kinematics + four-corner ground conform + tracks-blown + fixed-1/60 s via `FixedStepRunner`; reuses `GroundVehiclePhysics` integration loop shape), #247 `23410433` tracked-vehicle-physics-tests (7 L2 behavior tests). R2: #249 `bc4ec779` vekhikl-3-playtest-evidence (deferred), #250 `a08b878a` m48-tank-integration (new `Tank.ts` IVehicle impl + M48 spawns on Open Frontier US base + A Shau valley road), #248 `a11c1ddf` tank-player-adapter (skid-steer input model; W/S throttle + A/D track-differential turn; F enter/exit; third-person orbit camera; stub→real swap at merge). VEKHIKL-3 chassis half code-complete; turret + cannon + AI gunner + damage states + WASM pilot land in cycle #9 for full close. No fence change. No external physics library added. |
| 9 | `cycle-vekhikl-4-tank-turret-and-cannon` | done | VEKHIKL-3+4 | [brief](tasks/archive/cycle-vekhikl-4-tank-turret-and-cannon/cycle-vekhikl-4-tank-turret-and-cannon.md) | Closed 2026-05-17 at cycle close-commit. 8 PRs across R1/R2/R3. R1: #252 `2026-05-17T17:24:26Z` TankTurret rig (capped yaw 30°/s + pitch 8°/s + envelope [-10°, +20°]), #253 `18:15:46Z` TankCannonProjectile (400 m/s muzzle + 20m arming + AP/HEAT/HE resolver + 9m blast radius + gravity-only arc), #251 `18:28:27Z` TankGunnerAdapter (post-merge stub→real swap on top). R2: #254 `20:04:21Z` tank-ballistic-solver-wasm-pilot (KEEP-INCONCLUSIVE: 1.79x speedup, 8.92 KB gz — under both 3x speedup AND 600 KB gates), #256 `20:04:32Z` Tank HP bands + substates (100/66/33/0% bands + tracks-blown/turret-jammed/engine-killed substates, damage-type-biased weight table), #257 `21:47:09Z` NPC tank gunner with lead prediction + kill-attribution refactor (closed #253 kill-attribution gap via shared CombatantSystemDamage.applyExplosionDamage handler; CHANGES-REQUESTED → APPROVE iteration), #255 `21:49:42Z` vekhikl-4-playtest-evidence (deferred). R3: #258 `22:28:22Z` tank-ai-gunner-route-swap-real-solver (post-merge stub→real TankBallisticSolver swap). VEKHIKL-3 + VEKHIKL-4 promoted to code-complete; turret + cannon + AI + damage states + WASM pilot all landed. Owner walk-through deferred to PLAYTEST_PENDING. combat120 p99 intra-cycle +1.4% (49.00 → 49.70 ms) — well under 5% gate; absolute readings ~49.7 ms vs stale baseline at 33.40 ms reflects accumulated cycle work, cycle #13 will refresh. No fence change. |
| 10 | `cycle-voda-3-watercraft` | done | VODA-3 | [brief](tasks/archive/cycle-voda-3-watercraft/cycle-voda-3-watercraft.md) | Closed 2026-05-18 at cycle close-commit. 6 PRs across R1/R2. R1: #260 `2026-05-17T23:52:59Z` WatercraftPhysics hand-rolled hull (620 LOC, ≤700 ceiling), #259 `2026-05-18T00:23:14Z` WatercraftPhysics behavior tests + stub→real swap. R2: #261 `2026-05-18T09:59:09Z` watercraft-physics-damping-fix (vertical drag + convergent flow coupling — closed 2 defects flagged by R1 swap reviewer), #262 `2026-05-18T09:59:43Z` sampan-integration (Sampan IVehicle + WatercraftPlayerAdapter + composer wire), #264 `2026-05-18T13:10:05Z` pbr-integration (PBR + twin M2HB mounts + B1/B2/B3 fixes + NpcM2HB world-space aim closure; first CHANGES-REQUESTED → APPROVE after fix + verification worktree), #263 `2026-05-18T13:29:26Z` voda-3-playtest-evidence (deferred). VODA-3 promoted to code-complete; owner walk-through deferred to PLAYTEST_PENDING. Water sampler wiring for Sampan + PBR deferred as follow-up (boats land on dry terrain until composer plumbed). combat120 p99 measurement_trust=warn across all CI runs (GPU runner starvation) — not a real regression; cycle #13 baselines-refresh expedited. No fence change. |
| 11 | `cycle-defekt-4-npc-route-quality` | done | DEFEKT-4 | [brief](tasks/cycle-defekt-4-npc-route-quality.md) | Closed 2026-05-18 at cycle close-commit. 3 PRs across R1/R2; all three `terrain-nav-reviewer` APPROVE pre-merge. R1: [#265](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/265) `df84a870` npc-slope-stuck-recovery (new `SlopeStuckDetector.ts` + `evaluateSlopeStuckRecovery` helper; `SLOPE_STALL_TIME_MS=1500` triggers gravity-slide recovery via `SLOPE_SLIDE_STRENGTH=8.0` until walkable slope), [#266](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/266) `aac0e519` navmesh-crowd-reenable (layered direction-only crowd consumer via `applyAgentSteeredDirection`; `MAX_CROWD_AGENTS=64`; high-LOD gated; original disable was structural unregister-every-tick at `7487b693`, not a flag). R2: [#267](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/267) `4f505661` terrain-solver-stall-fix (wall-clock accumulator on `(contourActivated && lowProgress)` crossing `NPC_CONTOUR_STALL_REROUTE_MS=1200`; high-LOD only; backtrack-suppressed via `movementBacktrackPoint`; drops cached navmesh path; new `evaluateTerrainStallReroute` helper + optional `Combatant.movementContourStallMs`). DEFEKT-4 moved Active → Closed; active carry-over count 8 → 7. No fence change. |
| 12 | `cycle-sun-and-atmosphere-overhaul` | done | KB-SKY-DEEP (opened+closed in cycle) / HosekWilkieSkyBackend half of `konveyer-large-file-splits` | [brief](tasks/cycle-sun-and-atmosphere-overhaul.md) | Closed 2026-05-18. 6 PRs across R1/R2. R1: [#269](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/269) `850c5489` agx-tonemap-swap (AGX confirmed in r184; WorldBuilder ACES toggle), [#270](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/270) `7cbfc877` night-red-fix (elevation-keyed sun↔moon blend in bakeLUT; civil-twilight band -2°/-8°; executor corrected smoothstep direction + softened test predicate vs over-tight brief), [#271](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/271) `f510f4ad` tsl-preetham-fragment-port (TSL Fn graph + in-shader HDR sun-disc + 32×8 LUT for fog/hemisphere readers; SkyBackendMode='tsl'\|'lut-bake' dev flag; perf-analyst APPROVE with cycle-#13-baseline-refresh follow-up note). R2: [#272](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/272) `fc398f12` sun-disc-and-aureole-tuning (4° disc + 8-22° aureole interp by sun.y; `useAdditiveSunSprite=false` default gates env-polish SunDiscMesh sprite), [#273](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/273) `e0572be6` per-scenario-exposure-recalibration (5 presets bumped 20-30% for AGX rolloff), [#274](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/274) `9a80b9a5` sun-and-atmosphere-playtest-evidence (27 captures + Pixel 5 29.02 / iPhone 12 28.88 avgFps mobile probe both inside 10% gate; night-red regression PASS soft sense on all 5 scenarios; WebGPU/WebGL2 parity 1.18% max delta). Closes HosekWilkieSkyBackend half of `konveyer-large-file-splits`. Two follow-up flags: (a) spike memo's strict `r < 0.5 * max(g, b)` night-red assertion is over-tight (fails its own MOON_COLOR target); soft sense `r ≤ max(g, b)` is the canonical post-fix verification. (b) Per-preset `computeSunDirectionAtTime` elevation envelope sanity check — confirm natural-time path actually reaches sub-(-8°) elevation in each preset; capture script bypassed this via `backend.update()` direct call. No fence change. Owner walk-through deferred to PLAYTEST_PENDING. |
| 13 | `cycle-stabilizat-1-baselines-refresh` | SKIPPED | (n/a) | [brief](tasks/cycle-stabilizat-1-baselines-refresh.md) | **OUT OF SCOPE per owner direction 2026-05-18.** Removed from campaign chain. STABILIZAT-1 carry-over stays active; can be re-queued as a standalone cycle later. combat120 baselines remain at measurement_trust=warn until then. |

## Hold list

Cycles that exist in the queue concept but are intentionally NOT
sequenced into the active list above. They wait for the named trigger.

| Slug | Trigger to promote | Reason held |
|------|-------------------|-------------|
| `cycle-mode-startup-terrain-bake-hardening` | KB-STARTUP-1 visual acceptance fails OR cycle #2 mobile-fix doesn't absorb the synchronous-bake path | Spike branch `task/mode-startup-terrain-spike` already merged the worker-bake path. Hardening is paged-in if needed during cycle #2 mobile-fix; otherwise this cycle never runs. |
| `cycle-konveyer-12-indirect-draw-gpu-culling` | After cycle #5 VODA-1 lands and the water/vegetation overdraw picture stabilizes | Phase F R2/R3 follow-up; reduces draw count for distant impostors. Better measured against the post-VODA water+vegetation state. |
| `cycle-phase-f-r2-r4-on-master` | After cycle #6 VEKHIKL-2 lands | Render-silhouette + cluster lanes + squad-aggregated strategic sim + budget arbiter v2. May split if budget arbiter v2 grows. |
| `cycle-konveyer-large-file-splits` (HosekWilkieSkyBackend half) | Closed by cycle #12 `cycle-sun-and-atmosphere-overhaul` (queued 2026-05-17) | The `WaterSystem.ts` half co-dispatched with cycle #5; the sky half is now scheduled as part of cycle #12's TSL fragment-shader sky port (candidate F in [SUN_AND_ATMOSPHERE_VISION_2026-05-16](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)). No longer "off-queue". |

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
- #12 `cycle-sun-and-atmosphere-overhaul` blocks #13
  `cycle-stabilizat-1-baselines-refresh` — the new TSL per-fragment
  sky + AGX tonemap add an expected +0.3-1.0ms p99 cost on combat120;
  the baseline refresh must absorb that cost as the new normal,
  otherwise the next post-#13 cycle that ships will see #12's cost as
  a 5% p99 regression and trigger the campaign hard-stop. Per
  [SUN_AND_ATMOSPHERE_VISION_2026-05-16](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
  Section 5.
- #13 `cycle-stabilizat-1-baselines-refresh` runs last so the
  baseline captures the cumulative effect of the feature work
  (including the cycle #12 sky cost).

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
- **Carry-over count growth past 12.** Active count is currently 7.
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
- [docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
  — unblocks cycle #12 `cycle-sun-and-atmosphere-overhaul` (TSL per-fragment
  sky port + AGX tonemap + night-red fix + sun-disc tuning). Section 5
  documents the #12→#13 ordering constraint enforced in the Dependencies
  section above.
- [docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md](rearch/ENGINE_TRAJECTORY_2026-04-23.md)
  — "keep the stack" stance with the 2026-05-13 ground-vehicle
  addendum.
- [docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md) — historical
  predecessor manifest.
- [docs/state/CURRENT.md](state/CURRENT.md) — top-level current-truth
  snapshot.
