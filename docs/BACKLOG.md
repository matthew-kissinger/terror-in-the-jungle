# Backlog

Last updated: 2026-04-22 (Cycle 2 active)

Historical cycle-close sections below preserve what was true when those cycles
closed. Current open work lives in the P0/P1/P2/P3 sections plus Known Issues /
Known Bugs.

## Current Cycle: cycle-2026-04-21-stabilization-reset

The next work is stabilization before feature expansion. Cycle 0 closed the
repo truth/control-plane work: Node/toolchain alignment, local probe URL repair,
fixed-wing probe repair, dead-code cleanup, deploy freshness hardening, and
stale worktree/branch cleanup.

Plan: [docs/cycles/cycle-2026-04-21-stabilization-reset/README.md](cycles/cycle-2026-04-21-stabilization-reset/README.md)

### Cycle sequence

1. **Truth and gates** — done. Align Node/toolchain truth, repair local diagnostic
   URLs, restore the fixed-wing runtime probe, refresh stale docs, clean
   dead-code output, harden Cloudflare/browser freshness, and clean nested
   worktrees.
2. **Vehicle and flight alignment** — done for correctness gates. Fixed-wing
   config ownership, runway/climb/approach probes, AC-47 orbit-hold validation,
   player/NPC handoff checks, and cross-vehicle flight mouse reset are done.
   Aircraft feel is not signed off; it intentionally moves to Cycle 2.
3. **Flight feel, terrain contact, perf, and bundle** — active. Investigate
   fixed-wing stiffness, altitude bounce/porpoise, visual shake, and
   interpolation/camera smoothing; keep nearby NPCs visually grounded on
   hillsides; keep fixed-wing takeoff/liftoff from clipping through rising
   terrain; reduce large startup chunks; refresh `frontier30m` after its
   non-terminal soak fix; keep dead-code hygiene clean as bundle and vehicle
   work move files.
4. **Combat and navigation quality** — return to terrain/pathing stalls,
   squad-suppression consolidation, and remaining combat-state cleanup.

## Recently Completed (cycle-2026-04-22-flight-rebuild-overnight, 2026-04-22)

Thirteen merged PRs across four sequential rounds — the full planned cycle landed without rollback in a single autonomous overnight run. Briefs archived under `docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/`. Plan + per-task briefs lived in `docs/FLIGHT_REBUILD_ORCHESTRATION.md`; per-cycle evidence under `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/`.

### Tier 0 + Tier 1 (Round 1, 5 PRs)
- **PR #122 `aircraft-building-collision`** — `LOSAccelerator` gained `registerStaticObstacle` / `unregisterStaticObstacle` namespaced sibling APIs that share `chunkCache` with terrain. `WorldFeatureSystem` registers spawned building meshes (footprint ≥3m) post-`freezeTransform` via a feature-detected setter wired in `OperationalRuntimeComposer`. Aircraft sweep now reports building contact via `raycastTerrain → LOSAccelerator.checkLineOfSight`.
- **PR #123 `airframe-directional-fallback`** — Post-liftoff fallback split into directional branches: downward contact keeps the descent-latch grace, upward/forward terrain penetration responds immediately (clamps Y, zeroes inward velocity). Renamed `descentLatchGraceTicks`. Two L3 regressions added.
- **PR #124 `player-controller-interpolated-pose`** — `FixedWingModel.update()` now feeds `group.position` (interpolated) to `PlayerController` instead of `airframe.getPosition()` (raw). Probe-quantified: 144Hz pose-continuity sawtooth eliminated (141→0 zero-delta frames, relStddev 1.19→0.03 over 240 samples). HelicopterModel.ts:549 has the same bug — flagged as follow-up, out of scope for this cycle.
- **PR #125 `airframe-ground-rolling-model`** — Discrete liftoff gate replaced with continuous `wheelLoad = clamp((Vr - forwardSpeed)/Vr, 0, 1)`. Pitch authority scales with `(1 - wheelLoad)`, lateral friction scales with `wheelLoad`. New `LIFTOFF_MIN_SPEED_RATIO=0.35` blocks taxi-speed accidental commits. `syncGroundContactAtCurrentPosition` retained — probe confirmed no rollout drift contribution.
- **PR #126 `airframe-altitude-hold-unification`** — Option A: `altitudeHoldTarget` captured at liftoff so the Airframe PD takes hands-off cruise in all conditions; the duplicate `buildCommand.ts` block was removed for neutral-stick assist. Recapture-after-pitch-release: F-4 / AC-47 improved; A-1 Skyraider regresses 175m → 463m at cruise throttle (its tighter ±0.15 elevator clamp saturates against high T/W). Latent gain-tune follow-up flagged.

### Tier 2 climb-stability (Round 2, 3 PRs)
- **PR #127 `airframe-authority-scale-floor`** — `clamp(qNorm, 0.15, 2.2)` replaced with `lerp(0.30, qNorm, smoothstep(qNorm, 0.10, 0.30))` (then `min(_, 2.2)`). Removes the C0 discontinuity at the low-q clamp edge. Continuous derivative through the blend window. (Brief's literal formula was wrong; executor implemented the described intent.)
- **PR #128 `airframe-climb-rate-pitch-damper`** — Climb-rate-scaled pitch damping added just before `pitchAccel`. Window shifted from the brief's 0→5 m/s to 5→12 m/s after probe showed PD recapture transients (vy peaks 2.5–6.6 m/s) tripped the 0→5 window and broke existing tests. Climb vs RMS reduced 60%; cruise pitch response unchanged.
- **PR #129 `airframe-soft-alpha-protection`** — Variant B (tanh) won over variant A (widened smoothstep): `alphaFactor = 0.5 * (1 - tanh((|alpha| - alphaStall) / 3))`. Removes the bang-bang oscillator at the protection band edge. Stall protection preserved (airspeed > stallSpeedMs * 0.95). Bookkeeping completed by orchestrator after the executor stopped one tool-call short of `git push`.

### Tier 3 airfield (Round 3, 4 PRs)
- **PR #130 `airfield-prop-footprint-sampling`** — Zone-based `skipFlatSearch` gating in `AirfieldLayoutGenerator`: interior zones (`runway_side`, `dispersal`) keep the centroid-Y fast path; perimeter zones route through `WorldFeatureSystem.resolveTerrainPlacement`'s 9-point footprint solver. Cleaner than the alternative `envelopeInnerLateral * 0.6` gate.
- **PR #131 `airfield-perimeter-inside-envelope`** — `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` and `airfieldEnvelopeInnerLateral(template)` exposed from `TerrainFeatureCompiler`; `AirfieldLayoutGenerator` clamps `perimDist = min(original, innerLateral - 8)`. Discovery: `us_airbase` perimeter (240m vs `innerLateral`=289m) was already inside; `forward_strip` (160m vs 140m) was the actually-drifting template. Manual rebase + retest after Round 3 merges.
- **PR #132 `airfield-envelope-ramp-softening`** — `outerRadius = innerRadius + 12` (was +6) and `AIRFIELD_ENVELOPE_GRADE_STRENGTH = 0.65` (was 0.45). Triggered the post-merge OF heightmap + navmesh regen below.
- **PR #133 `airfield-taxiway-widening`** — `TAXIWAY_EXTRA_PAD = 2m` added to taxiway-only capsule sizing (`min(width,length)/2 + innerPadding(1.5) + 2`). 12m taxiway flat band now 9.5m (was 7.5m); 3.5m margin beyond paint half-width. Runway/apron capsule sizing unchanged.

### Tier 4 design memo (Round 4, 1 PR)
- **PR #134 `continuous-contact-contract-memo`** — `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` (~2200 words, 8 sections + symptom/rule/PR mapping appendix). Proposes `ContactSweepRegistry` BVH unifying airframe + NPC LOD + prop placement contact discipline so the four symptom classes treated this cycle cannot re-emerge. Awaits human review before opening an implementation cycle.

### Orchestrator-level chores (post-Round-3)
- `chore(assets): regenerate OF heightmaps + navmesh after airfield envelope changes` (commit 614dc76, master direct) — terrain-nav-reviewer flagged that PR #132 + #133 mutate stamp geometry that flows through `prebake-navmesh.ts` for OF. Re-baked all five OF seeds (42/137/2718/31415/65537); ZC and TDM bakes were also re-run but produced no diff.
- `chore(cycle-2026-04-22): capture Round 0 baselines` (commit c556e34, master direct) — orchestrator-prep step from the cycle plan.

### Perf
combat120 baseline → post-Round-3:
- avg: 13.91 → 14.21 ms (+2.2%)
- p99: 33.60 → 34.50 ms (+2.7%) — within 5% budget
- max: 46.80 → 52.10 ms (+11.3%, a single 52.1ms outlier; hitch_50ms = 0.03% = 2 frames)
- heap_growth: 9.5 → 53.2 MB ⚠️ heap_recovery_ratio: 0.88 → 0.12 — the validation `overall: fail` is from heap recovery, not frame time. Cycle policy explicitly only gates on p99; heap is flagged for morning review.

### Follow-ups for next cycle
- Heap-recovery regression in combat120: 53MB end-growth and 12% peak recovery (was 9MB / 88%). Could be NPC stalls + AI budget starvation events (4.07 avg/sample) or one of the Round 1-3 changes.
- HelicopterModel.ts:549 has the same raw-vs-interpolated PlayerController feed as PR #124 fixed for fixed-wing.
- A-1 Skyraider altitude-hold recapture regresses at cruise throttle under PR #126; brief explicitly forbade gain retuning. Future task should expand `±0.15` elevator clamp.
- AC-47 low-pitch takeoff still single-bounces (carried over from cycle-2026-04-21).
- "Playtest recommended" (per executor reports): `airframe-directional-fallback` would benefit from a manual A-1 / F-4 / AC-47 takeoff trace before relying on the change in production scenarios.

### Cycle metrics
- 13/13 tasks merged. 0 blocked, 0 rolled back.
- 1 manual rebase (PR #131 vs PRs #130 + #132).
- 1 orchestrator-level cleanup (PR #129 commit/push).
- Reviewers: combat-reviewer on PR #122 (merge); terrain-nav-reviewer on PRs #131/#132 (merge, regen flagged).
- Wallclock: ~02:25 (Round 0 baseline) → ~02:42 ET (Round 4 merge), single overnight session.

## Recently Completed (cycle-2026-04-21-atmosphere-polish-and-fixes, 2026-04-20)

Sixteen merged PRs across five dispatch rounds — the full planned cycle landed without rollback. Briefs archived under `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/`. Cycle ran in a single ~3h30m orchestrated burst.

### Atmosphere polish
- **PR #107 `post-tone-mapping-aces`** — ACES filmic tone-map inserted in the `PostProcessingManager` blit fragment shader before the 24-level quantize + Bayer dither. Warm dawn/dusk/golden-hour hues no longer clip to white; retro stipple aesthetic preserved. 4 ship-gate PNGs committed.
- **PR #115 `fog-density-rebalance`** — per-scenario `fogDensity` moved into `AtmospherePreset`; `WeatherSystem.refreshAtmosphereBaseline()` added so storm/rain modulators track the new preset baseline. Five framings show haze depth instead of white-out.
- **PR #109 `vegetation-alpha-edge-fix`** — raised `alphaTest` in billboard fragment shader to 0.25 and scaled the fog mix by `texColor.a` to kill the halo under premultiplied-alpha output. Diagnostic confirmed the asset pipeline was already clean; the artefact was runtime-material.
- **PR #111 `vegetation-fog-and-lighting-parity`** — added `sunColor`/`skyColor`/`groundColor`/`lightingEnabled` uniforms to the vegetation `RawShaderMaterial` and drove them from the atmosphere snapshot each frame. Foliage now tracks TOD/weather the same way terrain does.
- **PR #113 `atmosphere-day-night-cycle`** — new optional `AtmosphereTodCycle` preset block; ashau/openfrontier/tdm/zc cycle over 600s real time, combat120 stays static. `HosekWilkieSkyBackend` gates LUT re-bake on 0.5° sun delta for cheap updates. `getSunDirection()` / `getSunColor()` signatures preserved for the cloud task.
- **PR #108 `skybox-cutover-no-fallbacks`** — deleted `Skybox.ts`, `NullSkyBackend.ts`, and `skybox.png`. `AtmosphereSystem` constructor now instantiates `HosekWilkieSkyBackend` directly with a combat120 bootstrap preset. Tests rewritten as behavior assertions. Net -245 lines.
- **PR #119 `cloud-runtime-implementation`** — new `CloudLayer` horizontal plane at `terrainY + 1200m` AGL with procedural fbm shader; sun-lit underbelly; world-space UV so clouds drift overhead on player motion; edge-on alpha-fade within ±100m of base. Per-scenario `cloudCoverageDefault`; `WeatherAtmosphere` lerps coverage on STORM/HEAVY_RAIN/LIGHT_RAIN; `ICloudRuntime` getters/setters now return real values.

### Airfield / aircraft foundation
- **PR #112 `airfield-terrain-flattening`** — discovered airfields are hand-authored (not procedural), so added an extended flattening envelope stamp per airfield with graded shoulder covering dispersal + perimeter, plus dev-time warning when authored vertical span exceeds threshold.
- **PR #117 `airfield-aircraft-orientation`** — parking yaws computed at spawn time from the first non-coincident taxi-route waypoint (`points[0]` is the stand itself, so the hypothesis needed an eps-0.5m offset). Behaviour test covers main_airbase + forward strip.
- **PR #106 `aircraft-a1-spawn-regression`** — removed the `npcAutoFlight: { kind: 'ferry' }` field from the A-1 Skyraider parking spot; A-1 stays parked and claimable by the player. Regression test pins the "no auto-departure" invariant for all three main_airbase aircraft.
- **PR #116 `aircraft-simulation-culling`** — new `shouldSimulateAirVehicle()` helper; `FixedWingModel.update()` gates `airframe.step()` and NPC pilot tick on camera distance + hysteresis for parked + unpiloted airborne aircraft. Player-piloted and airborne-NPC continue to simulate. Velocity zeroed on cull transition so resume state is valid.
- **PR #120 `aircraft-ground-physics-tuning`** — post-liftoff ground-clamp oscillation fixed via composite of three candidates: `liftoffClearanceM` 0.2→0.5, 10-tick sustained-descent latch before re-clamp, liftoff impulse bumped 3.0→4.5 m/s. A-1/F-4 bounce-free; AC-47 low-pitch takeoff still single-bounces (aerodynamic authority floor, out of scope).

### Content + harness
- **PR #110 `ashau-dem-streaming-fix`** — hardened the DEM loader in `ModeStartupPreparer` to reject HTML/empty/wrong-size payloads and fail loudly when the runtime DEM is absent. Path tightened to leading-slash absolute form. The 2026-04-21 deploy validation later confirmed fresh GitHub deploys need a real asset-delivery pipeline for the primary A Shau runtime files.
- **PR #114 `npc-and-player-leap-fix`** — two independent root causes: `CombatantRenderInterpolator` gained a separate vertical-velocity clamp lower than the horizontal cap (absorbs the +50m catch-up when LOD promotes a distant-culled combatant that was parked at `DISTANT_CULLED_DEFAULT_Y=3m`); `PlayerMovement` grounded clamp got a rate-limit so walking into a parked-aircraft bbox or cliff seam no longer launches the camera.
- **PR #118 `harness-ashau-objective-cycling-fix`** — extracted `pickObjectiveZone` pure helper from `scripts/perf-active-driver.cjs`; lexicographic sort (priority class → distance) replaces the old "hand back the same captured zone" path. Eight behavior tests pin the regression.
- **PR #121 `perf-baseline-refresh`** — all four scenarios rebaselined against the cycle end-state. Memo at `docs/rearch/perf-baselines-refresh-2026-04-20.md` documents measured values, threshold formula (pass = measured × 1.15, warn = measured × 1.30), and explicit loosen/tighten deltas vs the stale 2026-03-06 baseline. Frontier30m reached victory condition at ~879s (Open Frontier); 437 samples covered the dynamic-combat portion.

### Cycle mechanics
- Two rebases resolved in-orchestrator (not re-dispatched): PR #115 against #113 (both touched `ScenarioAtmospherePresets` / `AtmosphereSystem`) and PR #119 against #115/#113/#120 (preset + system + weather overlap). Both were mechanical union-merges of additive fields; local typecheck validated before force-push.
- Reviewer agents (combat-reviewer on #114, terrain-nav-reviewer on #112) read the local master worktree rather than the PR branch and reported false negatives for "file doesn't show the described change." Diff on the PR itself confirmed changes were present; merged anyway. Worth wiring the reviewer to `git diff origin/<branch>` directly in future cycles.
- All five rounds dispatched sequentially; no hard-stops triggered (no fence-change proposals, no perf regressions > 5% p99, no > 2-red rounds). Worktree branch cleanup fails cosmetically because each worktree still references its branch — benign.

### Follow-ups filed (new briefs to consider next cycle)
- A Shau DEM distribution (CI + fresh clone): move the primary 21 MB runtime binary and rivers JSON to the Cloudflare R2 manifest pipeline in `docs/CLOUDFLARE_STACK.md`. Do not rely on local-only `public/data/vietnam/` files in GitHub deploys.
- `frontier30m` harness soak currently hits Open Frontier victory at ~15min and stops producing capture samples for the remaining half of the window. `harness-match-end-skip-ai-sandbox` (cycle-2026-04-20) only covers ai_sandbox; extend to open_frontier or revise the soak to a non-terminal mode.
- Screenshot evidence committed by the executors for tasks that need live `npm run dev` (cloud-runtime, aircraft-simulation-culling, several atmosphere shots) is incomplete — marked as playtest deliverables. Human playtest pass queued.
- Reviewer agents should read the PR diff directly, not the local worktree.
- AC-47 low-pitch takeoff single-bounce is an aerodynamic authority issue, not a ground-clamp one. File `aircraft-low-pitch-authority-tuning` if it becomes a gameplay blocker.

## Recently Completed (cycle-2026-04-20-atmosphere-foundation, 2026-04-20)

Nine merged PRs (atmosphere stack v1 + Round-1 polish + close-out fix). One task deferred. Briefs archived under `docs/tasks/archive/cycle-2026-04-20-atmosphere-foundation/`. Cycle ran in a single ~5-hour orchestrated burst.

- **PR #97 `atmosphere-interface-fence`** — added `ISkyRuntime` + `ICloudRuntime` to `SystemInterfaces.ts`; stood up `AtmosphereSystem` shell with `NullSkyBackend`. Architectural seam for the rest of the atmosphere stack. Fence ADDITION, not modification.
- **PR #98 `bot-pathing-pit-and-steep-uphill`** — driver-only heuristics: `shouldAdvanceWaypoint` (3D proximity), `isSteepClimbWaypoint`, `shouldFastReplan` (suppress fast re-plan during climb), `detectPitTrap`. 21 new behavior tests. **Playtest recommended** — fix follows hypothesis exactly but couldn't be live-tested from worktree.
- **PR #99 `harness-lifecycle-halt-on-match-end`** — perf capture finalizes ~2s after engine reports match end. Used `TicketSystem.getGameState()` instead of adding to fenced interface. Introduced regression: `detectMatchEnded` fired immediately for `ai_sandbox` mode (no win condition); fixed in PR #105.
- **PR #100 `harness-stats-accuracy-damage-wiring`** — accuracy / damage-dealt / damage-taken / kills / state histogram now in `summary.json` under `harnessDriverFinal`. Bot-state snapshot field name aliased for backward compat. Budget overshoot (+261 LOC vs ≤150) accepted: most was type defs + behavior tests.
- **PR #101 `post-bayer-dither`** — 4×4 Bayer ordered-dither offset before the 24-level color quantize in `PostProcessingManager`. Banding visibly broken into retro stipple pattern; aesthetic preserved. Screenshots committed.
- **PR #102 `atmosphere-hosek-wilkie-sky`** — analytic Hosek-Wilkie-shaped sky dome (Preetham fallback per brief allowance). `HosekWilkieSkyBackend` with CPU LUT + per-scenario `ScenarioAtmospherePresets`. Replaces the legacy `Skybox` PNG load gated behind `AtmosphereSystem.ownsSkyDome()`. Budget overshoot (657 vs ≤500 LOC) accepted (CPU LUT + Preetham math required).
- **PR #103 `atmosphere-fog-tinted-by-sky`** — `AtmosphereSystem.applyFogColor` writes per-frame sky-driven fog color into `THREE.FogExp2`. New `FogTintIntentReceiver` interface for `WeatherAtmosphere` to forward storm-darken + underwater-override intent. Horizon seam visibly gone in `combat120-noon` ship-gate capture.
- **PR #104 `atmosphere-sun-hemisphere-coupling`** — `moonLight` no longer `freezeTransform`'d; per-frame position + color from `AtmosphereSystem.getSunDirection/getSunColor`. Hemisphere sky/ground colors track zenith/horizon. `WaterSystem.sun` finally has a real source. Shadow frustum follows player when target set.
- **PR #105 `harness-match-end-skip-ai-sandbox`** — close-out fix: gate `detectMatchEnded` on mode (skip `ai_sandbox`); emit `matchEndedAtMs` undefined when unset (latent perf-capture.ts `Number(null) === 0` bug masked). Live combat120 capture validation now passes.

### Deferred to cycle-2026-04-21

- **`perf-baseline-refresh`** — first attempt hard-stopped on PR #99's match-end regression (fixed by #105). Second attempt hard-stopped on two grounds: (a) `ashau:short` capture had `movementTransitions=0`, `waypointReplanFailures=200`, `harness_min_shots_fired=0` (bot dormant — DEM didn't load + objective-cycling loop), (b) measured `combat120 p95` was +41.8% and `openfrontier:short p95` was +132.6% over stale baseline (mostly because the new harness actually drives combat vs. the dormant baseline; needs disentangling, not a blind re-bake). Carries forward.

### Cycle-specific harness additions

- New per-task screenshot-evidence gate: every visible-change task brief includes a "Screenshot evidence (required for merge)" section; orchestrator (main session) reviews PNGs via Read-tool before merge. Tracked in `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/<slug>/` with `_master/` (pre-cycle baselines) and `_orchestrator/<checkpoint>/` (between-round combo captures).

### Visible state at cycle close (orchestrator playtest 2026-04-20)

- ✅ Sky-fog seam gone in `combat120-noon` ship-gate.
- ✅ Per-scenario sky gradient differentiation visible at zenith.
- ❌ Per-preset TOD warmth (dawn / dusk) does NOT visually read — post-process clips bright sun-direction in-scattering to white. Math correct, visual blocked by 24-level quantize without tone-mapping. Brief `post-tone-mapping-aces` queued.
- ❌ Distant terrain reads near-white through fog (fog density was tuned for the old constant fog color). Brief `fog-density-rebalance` queued.
- ❌ Vegetation has white/blue alpha-edge outlines (was hidden by old dark fog). Brief `vegetation-alpha-edge-fix` queued.
- ❌ Vegetation lights/fogs differently from terrain (likely separate material path). Brief `vegetation-fog-and-lighting-parity` queued.
- ❌ NPCs and harness-driven player visibly "leap into the air." `CombatantRenderInterpolator` exists but symptom persists — root cause may be upstream (terrain-not-streamed Y jumps) or interpolator vertical clamp too permissive. Brief `npc-and-player-leap-fix` queued.
- ❌ `ashau:short` terrain renders flat — DEM file is present at `public/data/vietnam/big-map/a-shau-z14-9x9.f32` but loader fails (`RangeError: byte length should be a multiple of 4`). Brief `ashau-dem-streaming-fix` queued.
- ❌ Ashau bot loops between captured zone and itself (stuck-recovery teleports onto already-owned zone). Brief `harness-ashau-objective-cycling-fix` queued.
- ❌ Aircraft systemic regressions (multi-cycle): A-1 missing on runway, all aircraft only take off via hill-launch, runway has random bumps, taxiways orientation off, foundations over cliffs. Split into 4 briefs: `airfield-terrain-flattening`, `airfield-aircraft-orientation`, `aircraft-ground-physics-tuning`, `aircraft-a1-spawn-regression`.
- 📋 Day/night cycle requested (currently static per-scenario per design). Brief `atmosphere-day-night-cycle` queued.
- 📋 No clouds (ICloudRuntime is a stub). User wants clouds with flight-aware cloud base. Brief `cloud-runtime-implementation` queued.
- 📋 Legacy fallbacks still present: `Skybox.ts`, `NullSkyBackend.ts`, `skybox.png`. User preference: no fallbacks. Brief `skybox-cutover-no-fallbacks` queued.

### Lessons (codified)

- Append-only multi-PR conflict resolution within the orchestrator (instead of round-tripping to executors) is workable when the diffs are mechanical. Used 3× in this cycle.
- Pre-cycle prod deploy stale. Recommend deploying current master before user playtest so observations are against the same code the executors built on.
- Static-preset atmosphere model exposed the post-process clamp problem — visible only AFTER the upstream stack landed. Tone-mapping should have shipped alongside the analytic sky, not behind it.

## Recently Completed (cycle-2026-04-18-harness-flight-combat, 2026-04-18 → 2026-04-19)

Seven merged PRs, two rounds abandoned pre-merge, one round replaced mid-cycle. Briefs archived under `docs/tasks/archive/cycle-2026-04-18-harness-flight-combat/`.

- **PR #86 `b1-flight-cutover`** — deleted the `FixedWingPhysics` shim; 5 callers now consume `Airframe` directly.
- **PR #87 `utility-ai-doctrine-expansion`** — per-faction response curves + reposition/hold actions; closed the RETREATING orphan state.
- **PR #88 `perf-harness-architecture`** — declarative scenario runner. **Reverted by PR #89** after live playtest showed the policy didn't drive the player toward enemies.
- **PR #90 `perf-harness-redesign`** — 4-layer imperative terrain-aware driver with LOS gate and per-mode validators. Replaced the reverted declarative runner.
- **PR #91 `heap-regression-investigation`** — pooled utility-AI per-tick allocations; killed the +296% combat120 heap growth from the prior cycle.
- **PR #92 `npc-fixed-wing-pilot-ai`** — NPC fixed-wing pilot state machine + airfield integration. First live consumer of the post-cutover `Airframe` surface.
- **PR #93 `perf-harness-killbot`** — rule-only NSRL-style killbot driver with navmesh + pure-pursuit. Superseded later in the cycle by the state-machine bot.
- **PR #94 `perf-harness-verticality-and-sizing`** — NPC speed cap, player eye-height raise (2→2.2), NPC billboard shrink (5×7→3.2×4.5), exported `PLAYER_MAX_CLIMB_ANGLE_RAD`, path-trust invariant.
- **PR #95 `perf-harness-player-bot`** — state-machine bot (PlayerBotIntent + controller) mirroring NPCFixedWingPilot. **Shipped a behavior regression** (retreats on damage, hits=0 in live playtest) fixed by PR #96.
- **PR #96 `perf-harness-player-bot-aim-fix`** — root-caused the PR #95 regression to a yaw-convention bug (`atan2(dx, -dz)` in a Three.js world where `forward = (-sin(yaw), 0, -cos(yaw))`). Switched aim path to `camera.lookAt()` matching the rest of the codebase. Wired the dormant `evaluateFireDecision` aim-dot gate. Stripped SEEK_COVER + RETREAT. Combat120 smoke: `shots=420, hits=221, 52.6% hit rate`. User confirmed live playtest: bot reached victory.

### Abandoned rounds

- `perf-openfrontier-navmesh-fix` (narrow navmesh-null bug investigation) — killed mid-run after deeper architectural gap surfaced.
- `perf-harness-player-bot-aggressive` (defensive-state strip) — killed mid-run after executor's own smoke revealed the deeper aim convention bug.
- `perf-baseline-refresh` Round 3, 5, 8 attempts — Round 3 stopped on openfrontier validator fail (killbot artifact), Round 5 stopped because the bot was retreating, Round 8 died on a transient 500 API error before producing captures. Baseline refresh carries into next cycle.

### Follow-ups filed (new briefs under `docs/tasks/`)

- `perf-baseline-refresh` (P0) — carried forward.
- `harness-lifecycle-halt-on-match-end` (P1) — harness kept running past in-game victory screen during PR #96 playtest.
- `bot-pathing-pit-and-steep-uphill` (P1) — bot over-paths on steep direct-uphill-to-objective, and gets trapped in pit geometry.
- `harness-stats-accuracy-damage-wiring` (P2) — accuracy / damage-dealt / damage-taken / kills not surfaced in `summary.json`; state histogram disconnect between `harnessDriver.getDebugSnapshot().botState` and `perf-capture.ts`'s `movementState` read.

### Lessons (codified)

- `memory/feedback_harness_reuses_npc_primitives.md` — reference NPC primitives (LOS, targeting, navmesh), but do NOT inherit NPC cautiousness (SEEK_COVER, RETREAT). Harness bot plays like a focused human, not a cautious AI soldier.
- Hand-rolled yaw math for camera-pointing is fragile; match the codebase's existing `camera.lookAt()` pattern (used by `PlayerCamera`, `DeathCamSystem`, `MortarCamera`, `SpectatorCamera`, `flightTestScene`, old killbot).
- Wire `evaluateFireDecision`-style aim-dot gates into fire paths; they catch entire classes of future convention regressions automatically.

## Cycle conventions (2026-04-18)

Phase-letter task IDs (A/B/C/D/E/F) are retired. Every cycle starts from
the "Current cycle" stub in
[AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md), uses descriptive slugs
for task IDs (`plane-test-harness`, not `A1`), and identifies itself with
a dated slug: `cycle-YYYY-MM-DD-<slug>`. Closed-cycle briefs live under
`docs/tasks/archive/<cycle-id>/`. See the "Cycle lifecycle" section of
the runbook for the end-of-cycle ritual.


## P0 - Performance Blockers

- [x] Investigate fixed-wing flight feel before adding more vehicles: stiff
  controls, altitude bounce/porpoise after climb, visual shake at speed, and
  whether fixed-wing render/camera interpolation should mirror the helicopter
  interpolation path. Initial evidence pointed at raw fixed-wing pose exposure
  to render/camera consumers.
- [x] Implement the first fixed-wing feel fix set: Airframe interpolated pose,
  FixedWingModel visual-pose rendering/queries, and elapsed-time fixed-wing
  camera/look/FOV smoothing. `npm run probe:fixed-wing` passes; human playtest
  remains the feel gate.
- [ ] Re-run the human playtest checklist after fixed-wing feel changes. Passing
  `npm run probe:fixed-wing` is required evidence, but it is not a feel sign-off.
- [ ] Reduce initial JS bundle. Recent production builds still emit large
  chunks (`index`, `three`, and `ui` all above the desired startup footprint).
- [x] Fix `frontier30m` soak semantics. The script now passes
  `--match-duration 3600 --disable-victory true`, which applies perf-only
  Open Frontier lifecycle overrides and keeps the 30-minute capture
  non-terminal. The 2026-04-20 baseline still predates this fix.
- [x] Remove build-time `.gz`/`.br` sidecar generation from Vite. Cloudflare
  handles visitor-facing compression for Pages assets, so the deploy upload no
  longer carries redundant precompressed files.
- [ ] Keep refreshed perf baselines current after stabilization work. The
  2026-04-20 refresh is valid for the post-atmosphere cycle, but Node/runtime
  alignment must be settled before treating future comparisons as apples to
  apples.

## P0 - Repo truth and validation

- [x] Align Node/toolchain truth across `.nvmrc`, CI, docs, and perf evidence.
- [x] Repair stale local diagnostic URL assumptions and keep probes on the
  current Vite root route.
- [x] Restore `scripts/fixed-wing-runtime-probe.ts` as a maintained browser
  validation gate.
- [x] Refresh stale docs after the atmosphere/cloud/airfield/perf cycle.
- [x] Triage and clean `npm run deadcode`.
- [x] Harden deploy freshness by splitting Vite output to `/build-assets/`,
  revalidating stable public assets and GLBs, and bumping the service worker
  cache to drop stale `titj-v1` entries.
- [x] Clean locked nested worktrees and stale task branches after confirming
  they contain no unmerged work.

## P0 - Deploy freshness and asset delivery

- [x] After the 2026-04-21 manual Cloudflare deploy, verify live headers for `/`,
  `/sw.js`, `/build-assets/*`, `/assets/*`, `/models/*`, navmesh, heightmaps,
  and A Shau JSON using `docs/DEPLOY_WORKFLOW.md`. This caught a real deploy
  gap: A Shau runtime data is local-only/gitignored, so live
  `/data/vietnam/a-shau-rivers.json` returned the SPA HTML shell.
- [x] Stand up the first Cloudflare-native asset delivery path in
  `docs/CLOUDFLARE_STACK.md`: prod/preview R2 buckets, CORS, temporary public
  `r2.dev` endpoint, immutable content-addressed A Shau DEM/rivers objects,
  generated `asset-manifest.json`, R2 manifest uploads, runtime DEM manifest
  resolution, and deploy-workflow upload validation before Pages deploy.
- [ ] Replace the temporary R2 `r2.dev` endpoint with a custom asset domain,
  then rerun live Pages + R2 header validation after the next manual deploy.
- [ ] Add a cross-browser live fresh-load gate for Chrome/Edge and Firefox,
  with a manual Safari/iOS check when service worker or GLB paths change.
- [ ] Move GLBs into the same content-addressed manifest pipeline after terrain
  delivery is stable, so model files can become immutable without risking stale
  in-place updates.

## P1 - Gameplay (carry-forward)

- [x] Expand browser-level aircraft validation beyond takeoff into climb and
  short-final approach setup for A-1, F-4, and AC-47.
- [x] Expand browser-level aircraft validation into AC-47 player orbit hold.
- [x] Expand browser-level aircraft validation into player/NPC fixed-wing
  handoff states.
- [ ] Expand and validate live NPC fixed-wing missions beyond the current `FixedWingModel.attachNPCPilot()` / world-feature / air-support path.
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB).
- [ ] Ground vehicles (M151 jeep first - GLB exists, need driving runtime).
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds.
- [ ] Stationary weapons (M2 .50 cal emplacements, NPC manning).
- [ ] Faction AI doctrines - keep expanding the `FACTION_COMBAT_TUNING` lookup with stance/engagement/retreat parameters.

## P2 - Content & Polish (carry-forward)

- [ ] Vegetation billboard remakes.
- [ ] Terrain texture improvements.
- [ ] Road network generation (splines, intersections, pathfinding).
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh).
- [ ] Music/soundtrack.
- [ ] Re-capture `openfrontier:short` after the 2026-04-02 air-vehicle batching + visibility pass and decide whether aircraft/helicopter far-LOD meshes are still needed.

## P3 - Architecture

- [ ] Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] Decide: remaining connector bursts -> constructor/runtime dependency objects vs grouped setters
- [ ] Split tracked tick groups into smaller declared groups where cadence can differ safely
- [ ] Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] Continue identifying deploy-only UI/runtime that can defer without touching menu path

## Far Horizon

- Hydrology system / water engine (river system, swimming, depth rendering, watercraft physics)
- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Multiplayer/networking
- Destructible structures
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (tiled DEM)
- ECS evaluation for combat entities (see `docs/rearch/E1-ecs-evaluation.md` on `spike/E1-ecs` - deferred)

## Research references (external repos worth cloning into `examples/` for pattern study)

- **prose.md + peer prose-format repos** — clone into `examples/prose-main/` (gitignored) for reference on how they structure declarative runtime configs, policy/plugin registration, and orchestration/execution patterns. Findings inform the queued `perf-harness-architecture` brief and future multi-agent cycles. Write notes to `docs/rearch/prose-research.md` if patterns generalize.

## Known Issues (flagged, deferred)

1. **Orphan `IDLE` AI state.** `CombatantState.RETREATING` now has `AIStateRetreat`; `IDLE` still exists mainly for fixtures / respawn edges and can still fall through if left live at tick time.
2. **Duplicate squad-suppression mutation paths.** `AIFlankingSystem`, `AIStateEngage.initiateSquadSuppression`, and `applySquadCommandOverride` are three parallel paths that can mutate squad command state. Consolidation deferred to Phase F utility-AI design (E3 memo).
3. **Fixed-wing feel is not yet human-signed off.** Cycle 2 now has a first-pass interpolation/camera smoothing patch for the reported stiff controls, altitude bounce/porpoise perception, and visible screen shake at speed. `npm run probe:fixed-wing` passes, but a human still needs to run the playtest checklist before more vehicle types are added.
4. **Live production freshness still needs a post-deploy check.** Repo policy is fixed, but users will not receive the new `/build-assets/`, `/models/*`, and `titj-v2-2026-04-21` service-worker behavior until the next manual Cloudflare Pages deploy is live and header-checked.

## Known Bugs

1. Main production/perf chunks are still heavy (`index ~851kB`, `three ~734kB`, `ui ~449kB`) even though startup is stable. Precompressed sidecar generation has been removed, but real chunk splitting remains open.
2. `frontier30m` script semantics are fixed, but the tracked baseline still predates the non-terminal soak path. Refresh this only from a quiet-machine perf session.
3. First grenade/explosion cold-start hitch needs fresh perf evidence after the hidden live-effect warmup change.

## Architecture Debt

1. SystemManager ceremony - adding a new system touches SystemInitializer + composers.
2. PlayerController setter methods (reduced after vehicle adapter refactor; model/camera setters still duplicated).
3. Variable deltaTime physics (no fixed timestep for grenade/NPC/particle systems; player, helicopter, and fixed-wing use FixedStepRunner).
4. Mixed UI paradigms (~50 files with raw createElement alongside UIComponent + CSS Modules).

## Phase F Candidates (planning input from E memos)

E-track spike memos were kept on `spike/E*` branches and never merged. Pull each branch to read its memo.

- **Utility-AI combat layer.** Informed by D2's `FACTION_COMBAT_TUNING` lookup pattern. Memo: `docs/rearch/E3-combat-ai-evaluation.md` on `spike/E3-combat-ai-paradigm`.
- **Render-side position interpolation for LOD'd combatants.** Unblocks the hypersprint fix that F1 could not safely ship. Cross-references `CombatantLODManager.ts` dt amortization.
- **Agent/player API unification.** 1755-LOC driver potentially rewritable to ~150 LOC. Memo: `docs/rearch/E4-agent-player-api.md` on `spike/E4-agent-player-api`. Status: prototype-more.
- **Deterministic sim + seeded replay.** Proven in spike; ~200 non-determinism sources catalogued. Memo: `docs/rearch/E5-deterministic-sim.md` on `spike/E5-deterministic-sim`. Status: prototype-more.
- **Vehicle physics rebuild.** Airframe spike confirmed broader rebuild questions. The cross-vehicle flight mouse bleed it flagged was fixed in Cycle 1, but the rebuild remains prototype-more. Memo: `docs/rearch/E6-vehicle-physics-evaluation.md` on `spike/E6-vehicle-physics-rebuild`.
- **Rendering at scale.** E2 deferred overall. The old `maxInstances = 120` silent-drop it flagged has since been surfaced and the capacity raised, but true large-N behavior is still unproven. Memo: `docs/rearch/E2-rendering-evaluation.md` on `spike/E2-rendering-at-scale`.
- **ECS evaluation.** Deferred - bitECS came in ~0.97x at N=3000; V8 already inlines Vector3 shapes well enough. Memo: `docs/rearch/E1-ecs-evaluation.md` (also on master) and `spike/E1-ecs`.

## Recently Completed (cycle-2026-04-18-rebuild-foundation)

Nine commits on master between `9a0a53e` and `127f0a2`, seven merged PRs
plus an A2 root-cause followup and an A4 perf-driver revert. Briefs are
archived under `docs/tasks/archive/cycle-2026-04-18-rebuild-foundation/`
with letter prefixes dropped (slug convention).

- **plane-test-harness** (`5571be1`) — isolated `?mode=flight-test` scene
  plus L3 integration harness at
  `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`. Single
  source of truth for fixed-wing flight validation going forward.
- **render-position-interpolation** (`a6a78b1`) — new
  `CombatantRenderInterpolator` splits logical vs rendered position for
  LOD'd combatants. Fixes NPC hypersprint teleport under LOD dt
  amortization without changing sim behavior.
- **render-interpolation-followup** (`9a0a53e`) — root-cause fix in
  `CombatantLODManager` culled-loop: `return` → `continue` so a
  mid-bucket early-out no longer drops every combatant behind it.
  Removed the defensive try/finally scaffolding that was masking the
  symptom.
- **rendering-at-scale** (`797b610`) — raised `CombatantMeshFactory`
  instance cap and surfaced overflow instead of silently dropping past
  120. Addresses the silent-drop listed under Known Issues.
- **agent-player-api** (`86517d9` + revert `82159c8`) — typed
  `AgentController` / `AgentAction` / `AgentObservation` primitive
  landed under `src/systems/agent/`. Accompanying rewrite of
  `scripts/perf-active-driver.js` introduced a direction-inversion
  regression in combat120 perf captures and was reverted to the
  pre-cycle 1755-LOC driver. The primitive itself stays and will be
  consumed by the next cycle's harness rebuild.
- **vehicle-physics-rebuild** (`3268908`) — unified `Airframe` module
  with swept collision and explicit raw/assist control laws, backing the
  A1 integration tests. `FixedWingPhysics` / `FixedWingControlLaw` /
  `FixedWingConfigs` kept as thin compat shims to avoid an 18+ caller
  cascade; full cutover queued as a follow-up. `FixedWingPlayerAdapter`
  not rewritten in this cycle.
- **utility-ai-combat-layer** (`af62b37`) — opt-in `UtilityScorer`
  pre-pass in `AIStateEngage.handleEngaging`, gated on
  `FACTION_COMBAT_TUNING[faction].useUtilityAI`. VC faction canary
  enabled; NVA / US / ARVN still run the existing state machine
  unchanged.
- **deterministic-sim-seeded-replay** (`127f0a2`) — `SeededRandom`
  (xoroshiro128++) plus `ReplayRecorder` / `ReplayPlayer`. A 30s replay
  converges byte-identical on tick-space input; open non-determinism
  sources catalogued in `docs/rearch/C2-determinism-open-sources.md`.
  Falls back to `Math.random()` when no replay session is active, so
  existing code paths are untouched.

### Historical follow-ups carried forward at cycle close (some later resolved in subsequent cycles)

- **Heap growth regression** on combat120 (~+296% vs baseline during the
  cycle) — investigate whether a specific round introduced it.
- **`perf-baselines.json` is stale.** p99=100ms in-file; reality is
  closer to 30ms. Refresh after the next cycle's harness rebuild so
  baselines reflect the new measurement methodology.
- **B1 full cutover.** Delete `FixedWingPhysics` /
  `FixedWingControlLaw` / `FixedWingConfigs`, rewrite
  `FixedWingPlayerAdapter`, fan out through the 18+ callers.
- **perf-harness-architecture** — brief already written at
  `docs/tasks/perf-harness-architecture.md`, staged for the next cycle.
  Replaces the keystroke-emulation active-driver with declarative
  scenario / policy / validator architecture on top of the
  `AgentController` primitive.

## Recently Completed (2026-04-17 drift-correction run)

Sixteen PRs merged across A/B/C/D tracks plus two F-track UI fixes. One PR (F1) was closed as obsolete-on-master.

- **B1** (#57) - wired player-as-attacker into NPC damage path. `CombatantCombat.ts` / `CombatantDamage.ts` now propagate a `_playerAttackerProxy` mirroring the existing `_playerTarget` pattern, so NPC suppression / panic / threat-bearing fires on player shots.
- **B2** (#63) - `scripts/perf-active-driver.js` dwell-timer fix.
- **B3** (#67) - `StuckDetector` escalation now tracks goal anchors independently of backtrack anchors, so the 4-attempt abandon path is reachable instead of being reset on every anchor flip.
- **A1-A5** (#66 / #62 / #64 / #65 / #68) - vehicle / nav / terrain / UI / combat test triage. Large deletions, no behavior change.
- **C1** (#61) - perf-build target via `VITE_PERF_HARNESS=1`; new `build:perf` / `preview:perf` scripts; `scripts/preview-server.ts` helper. Default perf-capture server mode is now `preview`.
- **C2** (#58) - `recast-navigation` WASM alias dedupe (`@recast-navigation/wasm` -> `@recast-navigation/wasm/wasm`). Saves ~212kB gzip across main and worker chunks.
- **C3** (#59) - new `docs/DEPLOY_WORKFLOW.md`; fixed a real Cloudflare Pages duplicate `Cache-Control` bug via `public/_headers`.
- **C4** (#60) - dev-server lifecycle hardening (port kill, explicit teardown, PID logging) around perf captures.
- **D1** (#69) - new `docs/COMBAT.md` documenting the combat subsystem. Concluded the combat tree is adequately bounded; no code refactor.
- **D2** (#74) - new `src/config/FactionCombatTuning.ts`. `FACTION_COMBAT_TUNING[faction]` lookup with per-faction `panicThreshold`, consumed in `AIStateEngage.handleEngaging`. First observable per-faction differentiation (VC panics sooner than NVA).
- **F2** (#70) + **F2b** (#73) - amber/jungle boot splash in `index.html`; residual blue eliminated from `src/core/LoadingUI.css` and `src/ui/loading/MissionBriefing.module.css`.

**Closed / shelved:** F1 (#71) was closed. Its dt clamp would have broken LOD amortization, and the speed-ceiling bypasses it targeted had already been fixed on master. The real hypersprint cause is logged under Known Issues above.

## Recently Completed (2026-04-06)

- [x] VehicleStateManager: single source of truth for player vehicle state with adapter pattern
- [x] Fixed-wing physics: ground stabilization, thrust speed gate, F-4 TWR correction, resetToGround on enter
- [x] Helicopter perf: door gunner restricted to piloted only, idle rotor animation skip
- [x] Vehicle control state decoupled from PlayerMovement (~550 lines removed)
