# Carry-Overs Registry

Last verified: 2026-05-17 (post `cycle-voda-2-buoyancy-swimming-wading` close)

Single source of truth for "what's still hanging." Every cycle must close at
least one carry-over OR ship a user-observable feature; the carry-over count
strictly decreases or holds. If a cycle ends with a higher count than it
started, the cycle is `INCOMPLETE` per the rule in
[docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md).

## Rules

1. **Append-only when opening.** Every carry-over gets an entry the cycle it
   first appears.
2. **Move to "Closed" when closed.** Do not delete. The closed list is the
   shrinking-progress audit trail.
3. **No more than 12 active.** If active count hits 12, no new cycle can open
   without closing one first.
4. **Cycles-open count auto-increments at cycle close.** A carry-over open
   ≥3 cycles is a yellow flag; ≥5 is a red flag and must surface in the next
   cycle's plan.

## Active

| ID | Title | Opened | Cycles open | Owning subsystem | Blocking? | Notes |
|----|-------|--------|------------:|------------------|-----------|-------|
| DEFEKT-4 | NPC route-follow quality not signed off (slope-stuck, navmesh crowd disabled, terrain solver stalls) | cycle-2026-04-17-drift-correction-run | 8 | navigation | no | Phase 3 R5 (NavmeshSystem split) creates the seam; runtime acceptance after that. |
| STABILIZAT-1 | combat120 baseline refresh blocked (measurement trust WARN) | cycle-2026-04-21-stabilization-reset | 7 | perf-harness | yes (blocks all baseline updates) | Refresh on a quiet machine after Phase 0 lint installs; pair with the artifact-prune CI. |
| AVIATSIYA-1 / DEFEKT-5 | Helicopter rotor + close-NPC + explosion human visual review pending | cycle-2026-04-23-debug-cleanup | 6 | aviation / combat | no | Resolves via human playtest gate (Phase 0 rule 20). |
| KB-LOAD residual | Pixel Forge candidate import (vegetation) deferred behind owner visual acceptance | cycle-2026-05-08-stabilizat-2-closeout | 4 | assets | no | Strategic Reserve. Reopen only with explicit "go". |
| KB-STARTUP-1 | Mode-start terrain surface bake production hardening | 2026-05-13 mode-startup spike | 0 | terrain / engine-init / perf-harness | yes (branch merge) | `task/mode-startup-terrain-spike` proves the stall is terrain CPU bake, not Recast/WASM cache. Needs Open Frontier + A Shau visual review of the coarse visual-margin source-delta cache before production acceptance. |
| cloudflare-stabilization-followups | Web Analytics token provisioned but not verified live | cycle-2026-05-10-zone-manager-decoupling | 2 | release / cloudflare | no | Code-side subfindings are fixed and deployed in the 2026-05-10 release-stewardship pass: PostCSS resolves to 8.5.14, `_headers` has HSTS/CSP/Permissions-Policy, `robots.txt` + meta description exist, and unused preload hints are removed. Remaining action is the Pages dashboard Web Analytics toggle + live beacon verification; Cloudflare API access in this session returned authentication error 10000. |
| weapons-cluster-zonemanager-migration | Finish the IZoneQuery migration for the 5 remaining concrete `ZoneManager` imports in the weapons cluster: `FirstPersonWeapon`, `WeaponAmmo`, `AmmoManager`, `AmmoSupplySystem`, `PlayerHealthSystem` | cycle-2026-05-10-zone-manager-decoupling | 2 | weapons | no | Out-of-scope for Phase 2 R2 batches A/B/C; aspirational ≤5 ZoneManager-import target missed. Phase 3+ can finish; cycle-2026-05-10's ≤20 success criterion was met (achieved 17 read / 5 concrete). |
| konveyer-large-file-splits | HosekWilkieSkyBackend.ts (807 LOC, slated for the TSL fragment-shader sky port) — water half closed in cycle-voda-1-water-shader-and-acceptance | exp→master merge prep 2026-05-12 | 2 | environment | no | Split-debt tracking. WaterSystem.ts split landed (1125 → 300 LOC orchestrator + 4 modules ≤300 each) and grandfather entry removed in PR #232. Sky half still grandfathered. **Cycle #13 `cycle-sun-and-atmosphere-overhaul` (queued 2026-05-17) absorbs the HosekWilkieSkyBackend half** — the TSL fragment-shader sky port per `docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md` candidate F retires the 256×128 LUT for visuals, keeps a 32×8 CPU LUT for fog/hemisphere readers, and ports `evaluateAnalytic` to a TSL node graph; closes fully when cycle #13 lands. |

## Parked

Items intentionally de-prioritized but not closed. They remain owed work;
they just do not count against the ≤12 active rule while parked. To reactivate,
move the row back into the Active table and reset its `Cycles open` counter to
the cycle that re-opens it.

| ID | Title | Parked | Origin | Reason | Reactivate when |
|----|-------|--------|--------|--------|-----------------|
| AVIATSIYA-2 | AC-47 low-pitch takeoff single-bounce | 2026-05-12 vision-pivot park | cycle-2026-04-21-stabilization-reset (7 cycles open at park) | Helicopter / fixed-wing polish. Not vision-critical under the 2026-05-12 directions (WebGPU experimental + driveable land vehicles). Anchor at `Airframe` ground rolling. | Phase 4 F5 close-out resumes, or a fixed-wing-feature cycle opens. |
| AVIATSIYA-3 | Helicopter parity audit: HelicopterVehicleAdapter vs HelicopterPlayerAdapter | 2026-05-12 vision-pivot park | cycle-2026-04-22-heap-and-polish (7 cycles open at park) | Audit memo exists at `docs/rearch/helicopter-parity-audit.md`; work is documented, not actioned. Not vision-critical under the 2026-05-12 directions. | Phase 4 F5 close-out resumes, or the helicopter-adapter cluster is touched again. |

History log:

- 2026-05-12 — vision-pivot park: AVIATSIYA-2 and AVIATSIYA-3 moved Active → Parked
  to free slots in the active-list budget for the WebGPU (KONVEYER-11 successor
  IDs) and driveable-land-vehicle (VEKHIKL-3 successor IDs) directions confirmed
  by the owner on 2026-05-12. No status change for the two items themselves.
- 2026-05-12 — master-merge close: KONVEYER-10 moved Active → Closed via
  [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
  (commit `1df141ca`), which folded the `exp/konveyer-webgpu-migration` branch
  into `master`. Active count: 9 → 8.
- 2026-05-16 — `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` launch:
  KB-MOBILE-WEBGPU and KB-SKY-BLAND opened from the owner's 2026-05-15
  post-WebGPU-merge playtest observations (mobile unplayable, sky bland).
  Both opened by the investigation cycle's launch PR; both close at cycle
  end with "promoted to fix cycle <fix-slug>" resolution. Active count
  9 → 11 → 9 (net 0).
- 2026-05-16 — `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` close:
  KB-MOBILE-WEBGPU and KB-SKY-BLAND moved Active → Closed via the R2
  alignment memo at
  [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
  Fix work tracked under `cycle-sky-visual-restore` (KB-SKY-BLAND) and
  `cycle-mobile-webgl2-fallback-fix` (KB-MOBILE-WEBGPU); both queued in
  [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md).
  Active count: 11 → 9 (back to cycle-start level; net cycle delta 0).
- 2026-05-13 — mode-startup spike: KB-STARTUP-1 opened from the user-reported
  "mode selection takes forever" issue. `task/mode-startup-terrain-spike`
  moved terrain surface baking off the mode-click main-thread path and proved
  the cache/Recast path was not the blocker. Active count: 8 → 9.
- 2026-05-16 — `cycle-sky-visual-restore` close (autonomous-loop posture):
  shipped the KB-SKY-BLAND fix as 3 R1 PRs (#208, #210, #209). KB-SKY-BLAND
  Closed entry updated above with merge SHAs and screenshot evidence path.
  Owner playtest deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md);
  merge gated on CI green + orchestrator memo APPROVE per posture rule.
  No active carry-over churn (KB-SKY-BLAND already in Closed at cycle start).
  Active count: 9 → 9 (no change).
- 2026-05-16 — `cycle-mobile-webgl2-fallback-fix` close (autonomous-loop posture):
  shipped the KB-MOBILE-WEBGPU fix as 9 PRs across 3 rounds. KB-MOBILE-WEBGPU
  Closed entry updated above with all 9 merge SHAs + harness script + close-
  validation memo path. Real-device walk-through deferred to
  [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) (3rd active deferral row).
  Active count: 9 → 9 (no change; KB-MOBILE-WEBGPU was already in Closed
  from the prior investigation cycle).
  Out-of-band ci(mobile-ui) matrix fan-out commit `47c42216` also landed
  during the cycle, root-cause-fixing the 30-minute mobile-ui CI timeout
  flake (BACKLOG retro nit closed: 4 devices were running sequentially
  at ~12 min each = 48 min total against a 30-min ceiling; matrix fans
  to 4 parallel jobs at ~3-10 min wall time each).
- 2026-05-16 — `cycle-konveyer-11-spatial-grid-compute` close (autonomous-loop posture):
  shipped DEFEKT-3 fix as 3 R1 PRs (#220 `9a02714a` CoverSpatialGrid foundation,
  #221 `a5b5bcd6` AIStateEngage consumer, #222 `8d12ede5` integration test).
  R2 GPU-compute prototype skipped — R1 wins meet acceptance bars
  (`Combat.AI` peak dropped from ~954ms documented baseline to zero >100ms
  hitches over 5939 frames; combat_budget_dominance dropped to 0% from prior
  spike pattern; p99 +3.0% vs baseline, under 5% hard-stop). DEFEKT-3 moved
  Active → Closed. Active count: 9 → 8.
- 2026-05-16 — `cycle-vekhikl-1-jeep-drivable` close (autonomous-loop posture):
  shipped VEKHIKL-1 code-complete as 5 PRs across 2 rounds. R1: #223
  GroundVehiclePhysics (hand-rolled fixed-step rigid-body sim per
  GROUND_VEHICLE_PHYSICS memo; FixedStepRunner; four wheel samples
  conformed to ITerrainRuntime; Ackermann steering kinematics; explicit
  Euler with exponential damping), #224 GroundVehiclePhysics tests
  (post stub→real swap, 7 behavior tests against real impl). R2: #226
  GroundVehiclePlayerAdapter (W/S throttle, A/D steer, Space brake, F
  enter/exit, third-person follow), #227 M151 integration (existing
  motor_pool prefab spawn points satisfy "visible on both modes"; the
  documented no-op VehicleManager.update was fanned out to vehicle.update
  to actually step ground vehicles), #225 playtest evidence + capture
  script + PLAYTEST_PENDING row. VEKHIKL-1 in DIRECTIVES.md moved Open →
  code-complete (full `done` promotion blocks on owner walk-through
  deferred to PLAYTEST_PENDING). No carry-over delta (VEKHIKL-1 lives in
  DIRECTIVES.md, not CARRY_OVERS Active). Active count: 8 → 8.
- 2026-05-17 — `cycle-vekhikl-2-stationary-weapons` close (autonomous-loop posture):
  shipped VEKHIKL-2 code-complete as 6 PRs across 3 rounds (one R2 iteration
  after combat-reviewer CHANGES-REQUESTED → APPROVE). R1: #233 `0096d825`
  Emplacement IVehicle surface, #234 `917d83df` EmplacementPlayerAdapter.
  R2: #235 `c9725b76` playtest-evidence (docs + capture script +
  PLAYTEST_PENDING row, deferred under autonomous-loop posture), #237
  `0732beaa` m2hb-weapon-integration, #236 `afa90775` emplacement-npc-gunner
  (mount via orderBoard + cached emplacement scan after reviewer note).
  R3: #238 `78c9c55a` system bootstrap wiring (M2HBEmplacementSystem
  registration + scenario spawns at Open Frontier US base + A Shau NVA
  bunker overlook). VEKHIKL-2 in DIRECTIVES.md moved Open → code-complete
  (full `done` promotion blocks on owner walk-through deferred to
  PLAYTEST_PENDING). No fence change (VehicleCategory extension stayed
  inside the IVehicle module per INTERFACE_FENCE.md). No carry-over delta
  (VEKHIKL-2 lives in DIRECTIVES.md, not CARRY_OVERS Active). Active count:
  8 → 8.

  Cycle #13 `cycle-sun-and-atmosphere-overhaul` queued in
  [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  at position #12 (inserted between cycle #11 defekt-4 and the renumbered
  cycle #13 baselines-refresh) per
  [docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
  recommendation (sun-and-atmosphere visual + perf cost lands BEFORE
  baseline refresh so the +0.5-1ms p99 sky cost becomes the new normal).
  Cycle #13 absorbs the HosekWilkieSkyBackend half of `konveyer-large-file-splits`
  (notes column in the Active table updated to reflect cycle #13 closure
  condition). `Cycles open` for `konveyer-large-file-splits` bumped 1 → 2.
- 2026-05-16 — `cycle-voda-1-water-shader-and-acceptance` close (autonomous-loop posture):
  shipped VODA-1 code-complete as 5 PRs across 2 rounds + the WaterSystem
  half of `konveyer-large-file-splits`. R1: #228 terrain-water intersection
  mask + foam line (opt-in, default-off binding; pre-VODA-1 visuals byte-
  identical when unbound; terrain-nav-reviewer APPROVE), #229 production
  water surface shader (`MeshStandardMaterial` + `onBeforeCompile` chosen
  over TSL node material to preserve `?renderer=webgl` escape hatch and
  avoid the mobile node-material cost regression; composed with #228's
  foam patch into single `installWaterMaterialPatches()` at rebase time).
  R2: #231 hydrology river flow visuals (per-vertex `aFlowDir`/`aFoamMask`
  attributes + `installHydrologyRiverFlowPatch` shader patch; foam mask
  composes narrownessFoam at flowFactor<0.6 + slopeFoam at 5% rise/run),
  #232 WaterSystem.ts split (1125 → 300 LOC orchestrator + 5 modules:
  HydrologyRiverSurface 144, HydrologyRiverGeometry 222, HydrologyRiverFlowPatch
  178, WaterSurfaceBinding 299, WaterSurfaceSampler 146 — all ≤300 LOC;
  the 5-file outcome from the 3-file plan was forced by integrating #231's
  flow-patch logic at rebase time; grandfather entry removed from
  `scripts/lint-source-budget.ts`; 11 existing WaterSystem.test.ts pass
  byte-identical; +17 new sibling tests across the 3 originally-planned
  modules), #230 playtest evidence + capture script + PLAYTEST_PENDING row.
  No `WebGLRenderTarget` reflection pass added anywhere (mobile no-RT win
  preserved). VODA-1 in DIRECTIVES.md moved Open → code-complete (full
  `done` promotion blocks on owner walk-through deferred to PLAYTEST_PENDING).
  `konveyer-large-file-splits` water half closed; sky half remains active
  pending TSL fragment-shader sky port. Active count: 8 → 8 (no churn —
  carry-over notes column updated, sky still active).
- 2026-05-17 — `cycle-voda-2-buoyancy-swimming-wading` close (autonomous-loop posture):
  shipped VODA-2 code-complete as 7 PRs across 2 rounds. R1: [#239](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/239)
  `89365f4c` buoyancy-physics (new `src/systems/environment/water/BuoyancyForce.ts`
  + sibling test; `applyBuoyancyForce(body, dt, waterSystem)` reads
  `sampleWaterInteraction(body.position)` and applies upward force
  proportional to `buoyancyScalar × volume × g` with denser-medium
  damping; behavior tests cover neutral float, sink, surface, dampened
  oscillation), [#240](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/240)
  `98ffeabc` npc-wade-behavior (CombatantMovement speed scales with
  `1 - immersion01 × 0.6` in shallow water; nav cost up-weight verified
  on water tiles; combat-reviewer APPROVE), [#241](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/241)
  `83415458` player-swim-and-breath (PlayerMovement branches on
  `sampleWaterInteraction(playerPos).submerged` → swim mode with WASD +
  Space up + Ctrl down + depth-proportional drag; PlayerHealthSystem
  breath timer at head position, gasp + damage past 45 s; new
  PlayerSwimState module; HUD breath gauge). R2: [#242](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/242)
  `2496b4e1` water-sampler-composer-wiring (activates the dormant R1
  consumers by wiring the NPC water sampler adapter through the system
  composer), [#245](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/245)
  `163ecb73` river-flow-gameplay-current (extends BuoyancyForce with
  horizontal flow force from hydrology channel direction × magnitude ×
  body drag; visible swim-perpendicular drift in A Shau river per playtest
  capture), [#244](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/244)
  `0b24a19f` wade-foot-splash-visuals (new `src/systems/effects/WadeSplashEffect.ts`
  triggered on footstep when `immersion01 ∈ [0.1, 0.5]`; reuses existing
  impact-effects pool, no perf regression), [#243](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/243)
  `47e394c2` voda-2-playtest-evidence (`docs/playtests/cycle-voda-2-buoyancy-swimming-wading.md`
  + capture script + PLAYTEST_PENDING row, deferred under autonomous-loop
  posture). VODA-2 in DIRECTIVES.md moved Open → code-complete (full
  `done` promotion blocks on owner walk-through deferred to
  PLAYTEST_PENDING per autonomous-loop posture). No fence change
  (`sampleWaterInteraction` contract consumed, not modified). No
  carry-over delta (VODA-2 lives in DIRECTIVES.md, not CARRY_OVERS
  Active). Active count: 8 → 8.

## Closed

(Entries get appended here as carry-overs close. Format: `<ID> | <title> | closed in <cycle-id> | resolution one-liner`.)

- worldbuilder-invulnerable-wiring | `PlayerHealthSystem.takeDamage` early-return when WorldBuilder `invulnerable` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | wired in `src/systems/player/PlayerHealthSystem.ts` behind `import.meta.env.DEV`; behavior test in `PlayerHealthSystem.test.ts`.
- worldbuilder-infinite-ammo-wiring | `AmmoManager` / `WeaponShotExecutor` skip decrement when `infiniteAmmo` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AmmoManager.consumeRound()` returns true without decrement when flag active; new `AmmoManager.test.ts` covers the no-op.
- worldbuilder-noclip-wiring | `PlayerMovement` skip terrain collision + gravity when `noClip` flag active | closed in cycle-2026-05-09-doc-decomposition-and-wiring | gated gravity / sandbag / terrain-block / ground-snap / world-boundary in `PlayerMovement.simulateMovementStep`; behavior tests in `PlayerMovement.test.ts`.
- worldbuilder-postprocess-wiring | `PostProcessingManager.setEnabled` consumed by WorldBuilder `postProcessEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `PostProcessingManager.beginFrame/endFrame` consult `getWorldBuilderState()`; tests recordingrenderer assertions.
- worldbuilder-tod-wiring | AtmosphereSystem honors WorldBuilder `forceTimeOfDay` (-1 = follow live) | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AtmosphereSystem.update` snaps `simulationTimeSeconds` to `forceTimeOfDay * dayLengthSeconds` when in [0,1] and the active preset has a `todCycle`.
- worldbuilder-ambient-audio-wiring | AudioManager consumes WorldBuilder `ambientAudioEnabled` flag | closed in cycle-2026-05-09-doc-decomposition-and-wiring | `AudioManager.update` calls `ambientManager.setVolume(0)` on flag-flip-down and `setVolume(1)` on flip-up; idempotent across steady ticks.
- artifact-prune-baseline-pin-fix | `artifact-prune` baseline-pin matching accepts both bare perf-baseline directory names and `artifacts/perf/` paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` with source update in `scripts/artifact-prune.ts`.
- worldbuilder-oneshotkills-wiring | `oneShotKills` WorldBuilder flag wired into NPC/projectile combat damage | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` in `CombatantCombat` and `CombatantSystemDamage`, with behavior tests.
- perf-doc-script-paths-drift | perf docs and asset acceptance references updated from retired `scripts/projekt-143-*` paths to retained commands/archive paths | closed in release-stewardship-2026-05-10 | fixed by `a9ebfbe` across `docs/perf/*` and `docs/ASSET_ACCEPTANCE_STANDARD.md`.
- KONVEYER-10 | Rest-of-scene WebGPU parity and frame-budget attribution after K0-K9 branch-review completion | closed in 2026-05-12 master-merge (PR #192) | `exp/konveyer-webgpu-migration` merged into `master` via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192) (commit `1df141ca`); WebGPU + TSL becomes the default production renderer with WebGL2 fallback. R2-R4 follow-on materialization work queued as separate cycles on master.
- KB-MOBILE-WEBGPU | Mobile is unplayable post-WebGPU-merge; was playable on WebGL pre-merge | closed in cycle-2026-05-16-mobile-webgpu-and-sky-recovery (investigation) + fix shipped in cycle-mobile-webgl2-fallback-fix | Investigation pinned root cause to TSL-fragment-cost regression on WebGPURenderer's WebGL2 backend. **Fix landed via 9 PRs across 3 rounds in `cycle-mobile-webgl2-fallback-fix`**: R1 [#213](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/213) `6e7a8879` terrain-tsl-biome-early-out + [#211](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/211) `9e1ccab5` terrain-tsl-triplanar-gate + [#212](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/212) `0b3b749d` render-bucket-telemetry-fix; R2 [#215](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/215) `99044966` mobile-pixel-ratio-cap + [#214](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/214) `ca725369` mobile-skip-npc-prewarm + [#216](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/216) `706ad344` mobile-sky-cadence-gate + [#217](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/217) `83fb9fb0` asset-audio-defer; R3 [#218](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/218) `ff87e635` tsl-shader-cost-probe + [#219](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/219) `a81d8cda` real-device-validation-harness. Plus the out-of-band CI fix [`47c42216`](https://github.com/matthew-kissinger/terror-in-the-jungle/commit/47c42216) matrix-fan-out mobile-ui job (root-cause-fixed the 30-min timeout flake; wall time 30+ min → 3-10 min per device parallel). Asset-audio-defer measured `modeClickToPlayableMs` 19,341ms → 11,349ms (−7,992ms). Real-device walk-through deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) under autonomous-loop posture; harness script `scripts/real-device-validation.ts` ready for owner-attach run; close-validation memo at [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md](rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md). Alignment memo: [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
- KB-SKY-BLAND | Sky / clouds look bland on master post-WebGPU-merge | closed in cycle-2026-05-16-mobile-webgpu-and-sky-recovery (investigation) + fix shipped in cycle-sky-visual-restore | Investigation complete; root cause is visual-fidelity loss (not perf): 128×64 CPU-baked `DataTexture` replaced per-fragment Preetham `ShaderMaterial`, HDR clamped to [0,1] at bake time, missing `toneMapped: false` routes dome through ACES, sun-disc normalised to peak 1.0 kills HDR pearl. **Fix landed via three R1 PRs in `cycle-sky-visual-restore`**: [#208](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/208) `2118177f` (toneMapped:false + 256×128 LUT), [#210](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/210) `3455fa96` (HalfFloatType HDR LUT + drop [0,1] clamp + ceiling 8→64), [#209](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/209) `9e1ce7c7` (additive HDR sun-disc sprite). Owner walk-through deferred under autonomous-loop posture; Playwright smoke screenshots under `artifacts/cycle-sky-visual-restore/playtest-evidence/` (5 PNGs: dome-noon, hdr-{webgpu,webgl}, sun-disc-{noon,nadir}); deferral tracked in [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md). Alignment memo: [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
- DEFEKT-3 | Combat AI p99 — synchronous cover search in `AIStateEngage.initiateSquadSuppression` | closed in cycle-konveyer-11-spatial-grid-compute | **R1 spatial grid landed via 3 PRs**: [#220](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/220) `9a02714a` (CoverSpatialGrid 282 LOC + 277 LOC tests, 8m cells, deterministic order, queryNearest + queryWithLOS), [#221](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/221) `a5b5bcd6` (AIStateEngage routes flank-cover scan through structural `CoverGridQuery` interface; preserves 2-search cap + reuse; adds `engage.suppression.initiate.coverGridQuery` Phase F sub-marker + `suppressionFlankCoverGridHits/Misses` telemetry), [#222](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/222) `8d12ede5` (L3 integration test `src/integration/combat/cover-grid-suppression.test.ts`, perf budget p99 ≤ 5ms with ~190x margin vs ~954ms baseline). Post-merge `combat120` capture at `8d12ede5`: avg_frame 15.54ms (PASS), peak_p99 34.40ms (+3.0% vs baseline 33.4ms, under 5% hard-stop), **combat_budget_dominance 0% (Combat never topped 16.67ms vs pre-R1 954ms peak)**, **hitch_100ms_percent 0% in 5939 frames (vs documented 954ms baseline)**. R2 GPU-compute prototype skipped per brief's skip condition — R1 wins meet ≥3x avg drop + ≥10x peak drop bars. Artifact: `artifacts/perf/2026-05-16T19-32-35-293Z/`.

## Reading the table

- **Cycles open** = number of cycles this item has appeared in the active list,
  including the cycle it was opened.
- **Blocking?** = does this gate the canonical 3,000-NPC vision sentence
  becoming truthful, or block a release? `yes` items must be addressed before
  a cycle can claim "stabilized."
- **Owning subsystem** = the subsystem dir in `src/systems/` that owns the fix.

## Update protocol

- The orchestrator updates `Cycles open` at end-of-cycle ritual (see
  `docs/AGENT_ORCHESTRATION.md`). Programmatic helper:
  `npx tsx scripts/cycle-validate.ts --increment-carryovers`.
- A PR that closes a carry-over must reference its ID in the PR description
  and move the row to the Closed table in the same PR.
- Do not edit this file's `Last verified` line manually; the
  `cycle-validate.ts` increment step refreshes it.
