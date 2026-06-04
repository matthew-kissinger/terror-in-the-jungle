# Backlog

This file is the compact Strategic Reserve index. **Active carry-overs and
unresolved items live in [docs/CARRY_OVERS.md](CARRY_OVERS.md)** (Phase 0
realignment, 2026-05-09). Active directives + current state live in
[docs/DIRECTIVES.md](DIRECTIVES.md). Historical cycle records live under
`docs/cycles/<cycle-id>/RESULT.md`.

Keep this file at or below 200 measured lines of evergreen index. Long cycle
retrospectives (the "Recently Completed" sections below) are historical
record, not current state.

## Current state

See [docs/DIRECTIVES.md](DIRECTIVES.md).

## Owner-gated cycles

Cycles queued but explicitly **not** auto-promoted. Each waits on the named
owner-gate before re-queuing. Live source-of-truth (was previously
duplicated inside campaign manifests; the manifests are archived).

| slug | gate | scope |
|---|---|---|
| `cycle-vekhikl-seat-swaps` | owner signs off on `cycle-vekhikl-player-boarding-wire` playtest evidence (deferred row in `docs/PLAYTEST_PENDING.md`) | pilot↔gunner seat swap on M48 + PBR |
| `cycle-vekhikl-5-fleet-expansion` | owner signs off on both `cycle-vehicle-wayfinding-and-prompts` and `cycle-vekhikl-player-boarding-wire` playtest evidence | M113 APC + M35 truck + T-54 tank (+ optional ZU-23-2 AA + LCM-8) |
| `cycle-sky-screen-space-quad` | `cycle-skylut-resolution-bump` shipped but owner playtest still shows visible artifacts | Hillaire-style screen-space sky rework |
| `cycle-stabilizat-1-baselines-refresh` | owner re-queues (removed from post-WebGPU campaign 2026-05-18) | STABILIZAT-1 / combat120 baseline refresh on a quiet machine |
| `cycle-hydrology-river-surface-fix` | owner provides a concrete observed hydrology river-surface defect + repro pose (the Wave-0 characterization the brief requires) | fix the observed OF/A Shau hydrology river-surface defect + implement `WatercraftPhysics.isUnderBridge` (stayed Wave-0-pending in `cycle-2026-05-28-vehicles-aircraft-operable`; brief retained at `docs/tasks/hydrology-river-surface-fix.md`) |

## Active Branch (task/mode-startup-terrain-spike)

Opened 2026-05-13 for the user-reported "click a game mode and it takes
forever" issue. The investigation found that Cloudflare/Recast/WASM cache
delivery was already correct; the stall was synchronous terrain surface baking
after mode select.

The branch moves mode-start terrain surface baking to the terrain worker pool,
uses transferable typed arrays for height/normal buffers, and batches mode
terrain configuration through `TerrainSystem.configureModeSurface(...)`.
Spike memo and evidence:
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

Merge-hardening left: Open Frontier and A Shau visual review of the coarse
source-delta cache used for the render-only visual margin; if rejected, promote
persistent/prebaked visual-surface artifacts or an IndexedDB/OPFS bake cache.

## Recently Completed (cycle-2026-06-04-deploy-zone-vehicle)

Closes three owner-reported deploy/spawn/mount defects, triaged to file:line then
fixed in parallel (disjoint systems). All three shipped to master CI-green, each
with a repro-first L3 behavior test; all playtest-deferred to
[PLAYTEST_PENDING](PLAYTEST_PENDING.md).

- **UX-5** `loadout-deploy-equip-match` — PR #335 (`e0144444`). "Deployed weapon
  not the one I had on me." Root cause was `WeaponRigManager.startWeaponSwitch`
  dropping an in-flight weapon switch, so a stale switch won when the player died
  mid-swap; fix is last-requested-wins. L3 `LoadoutDeployEquip.test.ts`.
- **DEFEKT-7** `zone-base-ditch-placement` — PR #336 (`fb371129`,
  terrain-nav-reviewer APPROVE-WITH-NOTES). "Enemy spawn + closest base always in
  a ditch." `ZoneTerrainAdapter.validateAndNudge` had no terrain-readiness guard
  and dragged the flatten-stamped home bases off their own pad; fix adds the guard,
  sets `validateTerrain:false` on the home bases, and widens the nudge search so
  stamp-less capture zones escape steep-walled ditches. L3 `ZoneDitchPlacement.test.ts`.
- **VEKHIKL-5** `vehicle-board-drive-e2e` — PR #334 (`f63b0da5`). Jeep "mounts
  behind, spawns stuck in terrain, won't drive." Mount-behind = the locked
  `seatIndex` was fetched then unused (chassis-center passed to boarding); spawn
  clip left the jeep ungrounded so drive force (gated on `isGrounded`) stayed zero.
  Fix = seat-world-offset board + `conformToTerrain` on spawn. L3
  `VehicleBoardDriveE2E.test.ts` (jeep + M48).

Follow-ups (not carry-overs — in-cycle gaps named per the carry-over discipline):
- `MOVEMENT_NAV_CHECKIN`: add the same readiness guard to the unconditional spiral
  pre-pass in `ZoneInitializer.findSuitableZonePosition` (harmless today).
- Vehicle: M48 `TrackedVehiclePhysics` did not get the spawn rest-height conform
  this cycle (only `GroundVehiclePhysics` did); revisit if the tank ever spawns clipped.

## Recently Completed (cycle-2026-05-28-vehicles-aircraft-operable)

Closes the owner-reported **"vehicles and aircraft are not actually operable"**
gap. Boarding a ground vehicle/tank welded the camera under the chassis at the
ground-origin boarding point (`PlayerCamera` had no ground/tank branch though
the correct third-person follow-cam already existed but was never called);
tanks had no usable crew/cannon and no spawn discoverability; aircraft weapons
were broken end-to-end (Huey M60 door guns filtered out of `initWeapons`,
fixed-wing `weaponCount:0`, and pilot guns hit friendlies — no friend-or-foe
check). Bundled repo-alignment ran in parallel (dead `CoverSpatialGrid` O(1)
path, drifted docs, unreferenced scripts).

**7 of 8 task PRs merged** across R1 (5 parallel) + R2 (2 of 3, after the
keystone). The 8th task (`hydrology-river-surface-fix`) was never dispatched —
it stayed **Wave-0-pending** (the brief forbids dispatch until the orchestrator
names a concrete observed hydrology defect + repro pose, which needs a headed
GPU walk on this box) and is deferred to the owner-gated queue above as
`cycle-hydrology-river-surface-fix`.

- [#325](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/325) `7366bc73`+`8ffb0b1e` `vehicle-occupancy-camera` (R1 keystone) — `VehicleFollowCamera` provider slot on `PlayerCamera` + third-person branch in `updateCamera`; ground/tank adapters register in `onEnter`, clear in `onExit`; pose-unavailable frame falls back to first-person. L2 `PlayerCamera.test.ts` is the merge gate; live-loop smoke deferred (existing capture script bypasses the prod follow-cam path). Memo `docs/playtests/vehicle-occupancy-camera.md`.
- [#326](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/326) `db157965`+`3b0b3fb2`+`129f2f11` `aircraft-armament` (R1) — Huey M60 door guns registered + fire only when manned AND airborne; fixed-wing nose cannon (`weaponCount>0`, real muzzle, fire through adapter trigger); aircraft hitscan threads owning `Faction` through `handlePlayerShot`→`raycastCombatants` so US/ARVN take ZERO damage from player aircraft fire. `combat-reviewer` APPROVE. Deterministic IFF unit tests stand in for the smoke. Memo `docs/playtests/aircraft-armament.md`. Seam noted: the live `beginFire/endFire` `isInFixedWing` route lands with the keystone.
- [#327](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/327) `3dc351a6` `doc-consolidation-and-refs` (R1) — refreshed `CURRENT.md` + fixed drifted cross-references. Gate: lint:docs.
- [#328](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/328) `123d7295`+`c111ac69`+`fe8c1cc8`+`ff68d7c6` `cover-grid-wiring` (R1) — wired the O(1) `CoverSpatialGrid` into prod engage cover selection; unified the flank cover-search source; **cover-grid reset on BOTH mode-switch repopulation paths** (`reseedForcesForMode` for OF/ZC/TDM AND `clearCombatantsForExternalPopulation` for WarSimulator/A Shau) — the original fix only wired the WarSimulator branch, so the common path still leaked stale cross-map cover cells. `combat-reviewer` APPROVE (two-pass; lifecycle-leak follow-up landed as commits 2-3).
- [#329](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/329) `353cd9cf` `script-inventory-archival` (R1) — archived 9 unreferenced top-level one-off scripts. Gate: validate.
- [#330](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/330) `a158a4e1` `tank-crew-cannon-turret` (R2) — operable M48 crew + cannon + real turret (seat swap pilot↔gunner, cannon fire, turret slew). addBlockedBy `vehicle-occupancy-camera`. `combat-reviewer` APPROVE. CI test failure was the known pre-existing hydrology-compositor sub-5ms timing flake (`compositor-hydrology-cache-cycle.integration.test.ts`), unrelated to tank code → merged real-checks-green.
- [#331](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/331) `3245ee15` `tank-deploy-loadout-ux` (R2) — tank deploy/loadout option + OF respawn-map vehicle markers + controls hint. UI-only. orchestrator + smoke.

### Perf harness fix (folded in)

The headed-Playwright `perf:capture:combat120` gate was hitting `net::ERR_FAILED`
at boot: `startServer` only rebuilt `dist-perf` when `index.html` was missing
(no staleness detection), so a stale bundle made Vite preview's SPA fallback
serve `index.html` (text/html, 200) for a since-renamed dynamic-import/worker
chunk, which the browser refuses to execute as a module. Fixed in
`scripts/perf-capture.ts` by forcing a fresh perf build per capture by default
(`forceServerBuild`, matching the sibling capture scripts), with a `--no-build`
opt-out for fast local iteration and `dev` mode unaffected. Validated via
`npm run build:perf` (exit 0). The combat120 **regression gate itself remains
deferred** under the existing `STABILIZAT-1` carry-over ("refresh on a quiet
machine") — the harness is now correct, but the run was not taken on a busy box.
`cover-grid-wiring` + the `combat-reviewer` pass cleared the merged combat code
of p99 risk (the O(1) grid is expected to hold or improve combat120).

### Cycle status

- **Carry-overs: 6 active, unchanged (6 → 6).** No new carry-over opened; the
  deferred hydrology work lives in the owner-gated queue, not CARRY_OVERS
  Active. Per-entry "Cycles open" counter incremented by 1 (normal close).
- **Partial close**: 7/8 task PRs merged; `hydrology-river-surface-fix` deferred
  owner-gated (Wave-0-pending). Close commit carries `(playtest-deferred)`.
- **Playtests deferred** under autonomous-loop posture; PLAYTEST_PENDING rows
  appended for the four user-observable tasks (occupancy-camera, aircraft-
  armament, tank crew/cannon, tank deploy/UX).

## Recently Completed (cycle-terrain-compositor)

Closes the Open Frontier **water-on-walls** bug (rivers appearing to run on
elevated terrain near airfields) and the **airfield random-mountain /
padding-gap** bug — both rooted in the same gap: three independent stamp
compilers (`TerrainFeatureCompiler`, `TerrainFlowCompiler`,
`HydrologyTerrainFeatures`) producing stamps in isolation, getting
concat-and-sort merged at startup with no spatial conflict detection and no
feedback loop letting downstream stamps influence upstream target heights.
A Shau Valley unaffected (DEM provides real river valleys and airfields
ship `validateTerrain: false`) — used as the cycle's regression sentinel.

Introduces `TerrainCompositor` as the canonical owner of stamp composition
+ spatial conflict detection + hydrology feedback. Three passes:
**Pass A** (existing compilers emit annotated stamps), **Pass B** (AABB
overlap detector + policy resolver: `consult` / `never_above` /
`never_below` / `override`), **Pass C** (re-sample river elevations
against the composed provider; navmesh sees the original artifact, water
surface mesh sees the recomposed copy). Ships an IndexedDB → OPFS →
in-memory LRU recompose cache wired into the startup path for sub-5ms
second-compose. Dev-only `Shift+\ → J` overlay visualizes stamp AABBs +
conflict edges.

8 PRs merged in DAG order (R1 parallel; R2 parallel after merge-conflict
rebase; R3 sequential). All R2 PRs gated by `terrain-nav-reviewer`
APPROVE-WITH-NOTES; mandatory R2.2 reviewer pass cleared the load-bearing
Pass C navmesh-desync invariant.

- [#317](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/317) `ce68a39a` `terrain-compositor-skeleton` (R1.1) — NO-OP wrapper module + contract types + behavior-identical tests (snapshot of stamps + 64-coord height sample on OF seed 42 + A Shau, worker-parity sanity at 16 coords). Routes `compileStartupTerrainFeatures` through `composeTerrain`.
- [#318](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/318) `b49edc28` `compositor-conflict-detection` (R1.2) — Standalone AABB conflict detector with `flatten_circle` / `flatten_capsule` / airfield-envelope-class heuristic (`gradeRadius - outerRadius >= 30 m`). 5 unit tests. Logging-only — R2.1 wires it.
- [#319](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/319) `0f2f59a2` `compositor-stamp-policy-annotations` (R1.3) — Extends `TerrainStampConfig` with optional `obstructionPolicy` + `targetHeightStrategy` fields. Three compilers annotate emissions with behavior-preserving defaults (airfield envelope → `consult` + `sample_post_compose`; airfield rect → `override` + `baked`; route + zone-shoulder → `override` + `baked`; hydrology bed → `consult` + `baked`).
- [#320](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/320) `58f95c34` `compositor-debug-overlay` (R2.3, two-pass) — Dev-only `Shift+\ → J` overlay; renders stamp AABBs (envelope white, hydrology blue, route green, facility orange) + red conflict edges via batched `THREE.LineSegments`. Reviewer first pass returned CHANGES-REQUESTED (hotkey `S` collided with free-fly back-strafe; priority-band classifier mis-labelled envelope as hydrology; `setLastTerrainCompositorOutput` writer ungated). Fix commit landed all three plus a focused regression test ("envelope at priority 30 ≠ hydrology at priority 40") — reviewer APPROVED.
- [#321](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/321) `be4c958b` `compositor-stamp-policy-resolver` (R2.1) — Wires R1.2 detector into compositor; implements four resolution rules; deletes R1.1 `TerrainStampConflict` placeholder; F1 fixes stale "90m" comment to 48m; F2 reconciles AABB with `TerrainStampGridBaker` by returning dual inner/outer bbox via `stampAABBs`. OF airfield-interior-flatness sentinel asserts `max-min < 0.5 m` across a 20m grid centered at (365, 0, -1335). 8 resolver tests pin behavior. Reviewer APPROVE-WITH-NOTES.
- [#322](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/322) `e50a63d7` `compositor-hydrology-feedback` (R2.2, two-pass) — **Pass C** + IndexedDB/OPFS/in-memory LRU cache wired end-to-end. Reviewer first pass: APPROVE-WITH-NOTES but flagged cache as dead code (library + unit-tested but no caller). Cycle owner explicit decision to ship the cache → re-dispatched with wire-up scope. Follow-up commit `769e3d00` adds `ModeStartupPreparer` plumbing + canonical stamp fingerprint + integration test pinning second-compose <5ms via reference-equality. Mandatory reviewer pass APPROVED; navmesh desync invariant verified (original artifact → bake/navmesh path; recomposed copy → `WaterSystem.setHydrologyChannels` only).
- [#323](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/323) `062947b8` `compositor-of-acceptance-captures` (R3.1) — Playwright capture script asserting (a) zero water-on-walls violations (`|TerrainSystem.getHeightAt + 0.85 - WaterSystem.getWaterSurfaceY| ≤ 0.5 m` at known overlap points) and (b) airfield interior flatness (20m grid at OF main airfield, `max - min ≤ 0.5 m`). Three OF locations: airfield interior, south envelope edge, hydrology∩airfield overlap. Outputs JSON summary + 3 PNGs into `artifacts/cycle-terrain-compositor/playtest-evidence/`.
- [#324](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/324) `935e8dc2` `compositor-playtest-evidence` (R3.2) — Owner-walk memo at `docs/playtests/cycle-terrain-compositor.md` (5-item OF walk-list + A Shau regression check + `Shift+\ → J` overlay verification) + PLAYTEST_PENDING row.

### Cycle-retro follow-ups (captured from reviewer APPROVE-WITH-NOTES)

- **A Shau sentinel strengthening** (R2.1 Note 1): `TerrainCompositor.test.ts` A Shau test should add `expect(composed.conflicts).toHaveLength(0)` so "no overlap → no rewrites → byte-identical" becomes proven, not presupposed. The current test allows `sample_post_compose` rewrites to silently slip past.
- **R2.1 in-code clarifications** (R2.1 Notes 2-4): comment for `sample_post_compose` higher-index invariant in resolver Pass 1; comment for `consult` global rewrite (envelope-of-airfield) in resolver Pass 2; `annotateResolutionsForStamp` first-conflict-only is documented and downstream R2.3 telemetry doesn't depend on per-conflict counts.
- **Cache fingerprint completeness** (R2.2 Note 1): `fingerprintStamps` in `ModeStartupPreparer` projects positions + radii + priority + `fixedTargetHeight` + `heightOffset` + `obstructionPolicy` + `targetHeightStrategy`, but omits `gradeStrength`, `samplingRadius`, `targetHeightMode`. Stable today (those fields derive deterministically from feature compilation) but a tweakpane knob that ever varies them at runtime introduces a silent stale-cache risk.
- **Integration test budget tight** (R2.2 Note 2): 5ms cache-hit assertion; reference-equality is the load-bearing claim. Consider relaxing to 20ms if flake materializes.
- **OPFS/IDB end-to-end coverage** (R2.2 Note 3): cache persistence layer exercised only by unit test with in-process IDB shim. End-to-end roundtrip not gated in CI.
- **CI infrastructure: Playwright browser install timing out** (cross-cycle): Both `perf` (25min) and `smoke` (15min) jobs cancelled on multiple PRs during this cycle's `Install Playwright browsers --with-deps` step. Independent of code; needs a CI workflow fix (pin/cache the Playwright browser bundle, or move the install ahead of CI matrix split). Filed as a follow-up task for next cycle's R1.
- **Brief mismatch** (R2.3 retro): brief referenced `src/ui/debug/DiagnosticChordHandler.ts` which does not exist; actual seams are `WorldOverlayRegistry` + `GameEngineInit.wireWorldOverlays` + `GameEngineInput.handleWorldOverlayHotkey`. Next time we author a brief for a chord-registered overlay, point at those.

### Cycle summary

- **8 PRs merged** in DAG order (R1.1/1.2/1.3 parallel; R2.1/2.2/2.3 parallel after rebase; R3.1/3.2 sequential).
- **Two reviewer two-pass loops**: R2.3 (hotkey + classifier + dev-gate) and R2.2 (cache wire-up). Both APPROVED on the second pass.
- **One CI infrastructure halt averted**: master has no branch protection; Playwright install timeouts on perf + smoke gates were bypassed per "broken CI gate, not code regression" with explicit owner sign-off.
- **Acceptance**: R3.1 capture script reports zero water-on-walls violations + airfield interior flatness `max - min < 0.5 m` at OF main airfield post-merge. Owner walk-through deferred to PLAYTEST_PENDING.

## Recently Completed (water-hydrology-polish, doctor pass 2026-05-21)

Doctor pass on top of the 2026-05-20 vehicle-boarding-and-water campaign
after owner playtest showed the OF river-surface visibility shipped via
`cycle-of-river-surface-enable` was leaning on the wrong abstraction
(global sea-level plane co-existing with hydrology channels). The polish
pass made hydrology river surfaces the accepted OF / A Shau water path,
made the global sea-level plane opt-in only, snapped Sampan + PBR onto
the hydrology surface from frame 0, and exposed the hydrology channels
on the minimap + full map so owner playtest has a discoverability
surface. Slug contains `polish` and is therefore a **doctor pass, not a
formal cycle** (cycle-validate stoplist); shipped as 3 sequential PRs
off master with no orchestrator dispatch.

- [#313](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/313) `f69e119c` `water-polish-ui` — Minimap + Full Map gain optional `setHydrologyChannels(channels | null)` so the cyan river ribbon paints scaled by accumulation; Full Map gains `setVehicleManager` so ground / watercraft / emplacement markers refresh per-frame; Full Map `worldSize > 5000` `autoFitView` switched from player-centered ~13× to overview 1.0× (A Shau was unusable as a strategic surface); legend gains Water + Boat rows; `GPUBillboardSystem.clearInstancesInZones` batches per-chunk culling across all exclusion zones in one pass. 312 LOC added across 8 files, pure UI / pure-perf — safe as a no-op until the core wire lands.
- [#314](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/314) `f375aa02` `water-polish-core` — Hydrology-driven river surface + terrain features + watercraft spawn snap. `OpenFrontierConfig.globalWaterPlaneEnabled: false` (explicit); `SystemManager` + `gameModeTypes` resolution tightened to `=== true` (the old `!== false` defaulting was silently flipping plumbing on); new `HydrologyTerrainFeatures` compiles river-bake artifacts into terrain stamps + vegetation exclusion zones; new `HydrologyRiverPath` + `HydrologyRiverMetrics` extracted modules; `HydrologyRiverGeometry` / `HydrologyRiverSurface` / `HydrologyRiverFlowPatch` / `WaterSurfaceBinding` rebuilt around the new metrics with `TerrainSystem`-bound Y sampling; `OperationalRuntimeComposer.bindSpawnedWatercraftRuntime` injects water + terrain samplers into Sampan + PBR on spawn; `ModeStartupPreparer` pipes hydrology channel polylines to minimap + full map. PR-size exception (GOST-TIJ-001): 26 files, +1597 / -260 — tightly cross-coupled hydrology cluster.
- [#315](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/315) `30d8b9f0` `water-polish-docs` — Regenerated `cycle-of-river-surface-enable` playtest evidence (previous post-captures were stale from a worktree before #286 / #291 merged; new captures show `riverSurface.visible: true, source: "hydrology"` for Sampan + PBR + river-segment), rolled CARRY_OVERS + state/CURRENT + ROADMAP + BACKLOG + PLAYTEST_PENDING forward to reflect the merged work, amended `rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md` with a water-surface-on-hydrology pointer. Closes the `VODA-OF-1` deferred-playtest follow-up gate from `cycle-of-river-surface-enable`. **`package.json` description + keywords aligned for aircraft**: description now mentions helicopters (UH-1 Huey, AH-1 Cobra) and fixed-wing (A-1 Skyraider, F-4 Phantom, AC-47 Spooky), matching the README Highlights line that has always called this out as combined-arms; keywords gain `aviation`, `helicopters`, `fixed-wing`, `vehicles`.

### Doctor-pass summary

- 3 PRs merged in order (UI no-op → core wire → docs + npm metadata). UI shipped first so the core's unconditional `setHydrologyChannels(...)` calls had landing pads.
- ~2,024 LOC net delta across `src/` (+1,909 / -282) plus regenerated playtest evidence and metadata alignment.
- Closes the `VODA-OF-1` deferred-playtest follow-up gate; updates the `cycle-of-river-surface-enable` PLAYTEST_PENDING row to direct the owner walk at hydrology-first criteria instead of the now-wrong global-plane assumption.
- Housekeeping bundled with the pass: pruned 9 stale perf captures (493.2 MB), pruned 3 merged feature branches locally + remote.
- VODA-1 and VODA-2 stay `code-complete (playtest deferred)` — the polish pass does not unilaterally promote them.

## Recently Completed (cycle-framework-recovery-pass-2)

Pass 2 of the framework recovery plan
([docs/archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md);
self-archived by R2.3 per the plan's own instruction). Closes the
governance debt named in the plan's signal-vs-noise table: status
mirrored across 6 docs, 500-line cycle briefs killing executors,
campaign-manifest abstraction for ≤3-cycle parallel runs adding a third
nesting level for no payoff, zero-cycle carry-over bookkeeping, and the
unreliable sandbox push from agent worktrees. **6 PRs merged across R1
+ R2; R1.3 (CI shared-setup job) deferred** because the cache plumbing
broke on cross-workspace paths and the wall-clock win is incremental on
top of Pass 1's path-filter doctor PR.

### R1 (4 dispatched, 3 merged, 1 deferred)

- [#307](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/307) `677fe2a4` `directives-slim-refactor` — `docs/DIRECTIVES.md` 303 → 76 LOC (table-row-per-directive); 13 per-id memo files under `docs/directives/<id>.md`; new sibling test `docs/DIRECTIVES.test.ts` (4 cases, structure parsing) + one-line addition of `docs/**/*.test.ts` to `vitest.config.ts`.
- [#306](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/306) `7d94a0ec` `brief-template-slim` — new `docs/tasks/_TEMPLATE.md` (≤80 LOC); `scripts/cycle-validate.ts` LOC warn at 100+ / 150+; `scripts/cycle-validate.test.ts` extension. The cycle-framework-recovery-pass-2 brief itself trips the new WARN at 113 LOC (surfaced as expected validator behavior).
- [#305](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/305) `50170d5a` `sandbox-push-fix-or-document` — DOCUMENT route taken: `.claude/settings.local.json` keeps `Bash(git push:*)` under `ask` and is intentionally untracked, so the orchestrator-push protocol is codified in `docs/AGENT_ORCHESTRATION.md` §"Dispatch protocol" step 4 + `.claude/agents/executor.md` ground rule + report format. Executors that hit sandbox-block report `pr_url: blocked-by-sandbox` and the orchestrator pushes from the main session.
- [#304](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/304) `ci-shared-setup-job` — **CLOSED DEFERRED**. The `setup` job ran green but `actions/cache/save@v4` failed to save `../game-field-kits` (path outside `GITHUB_WORKSPACE`), so all 6 downstream jobs failed with `fail-on-cache-miss: true`. Fix-forward path: drop game-field-kits from the cache; each downstream job re-checkouts it (~10-30 s). Wall-clock win is incremental on top of the Pass 1 doctor PR's path-filter wins, so not load-bearing. Can be re-attempted in a future targeted CI cycle.

### R2 (3 dispatched, 3 merged)

- [#310](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/310) `ecba36ee` `status-mirror-consolidation` — 78 files changed, +31 / -468 lines. CLAUDE.md 220 → 34; AGENT_ORCHESTRATION.md 402 → 306; BACKLOG.md 599 → 570; README.md 320 → 305. Bulk strip of `Last verified:` / `Last updated:` headers across 74 doc files (kept only on DIRECTIVES.md per the canonical-status-source design). Current-state sections collapsed to `See [docs/DIRECTIVES.md](docs/DIRECTIVES.md).` one-liners.
- [#308](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/308) `f5511c53` `carryovers-zero-cycle-ban` — new rule in AGENT_ORCHESTRATION.md §"Carry-over discipline" (and matching CARRY_OVERS.md header): "Carry-overs track only items spanning ≥2 cycles." Validator check in `scripts/cycle-validate.ts <slug> --close` diffs CARRY_OVERS Closed against a `git merge-base HEAD origin/master` cycle-start snapshot and FAILs on a newly closed ID that wasn't Active at cycle start. Best-effort design (logs "skipped" if no merge-base available, not hard-fails on infrastructure issues).
- [#309](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/309) `6c02d1bf` `campaign-layer-delete-or-shrink` — Campaign-manifest abstraction now reserved for ≥4 sequenced cycles. ≤3-cycle parallel runs use a `## Active cycles` inline block in AGENT_ORCHESTRATION.md under "Current state" instead of a separate manifest file. Hold-list moved to BACKLOG.md "Owner-gated cycles" table (live source-of-truth; the archived campaign manifests stay untouched). Plan file self-archived: `docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md` → `docs/archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md` per the plan's lines 207-209 instruction.

### Cycle-level summary

- **6 PRs merged** (R1: 3 of 4; R2: 3 of 3). R1.3 closed deferred — not load-bearing, can re-attempt later.
- One mid-merge conflict on `docs/AGENT_ORCHESTRATION.md` (R2.1 + R2.3 both touched the file). Resolved by orchestrator rebase, kept both R2.2's "No zero-cycle carry-overs" rule and R2.3's "Active cycles template shape" guidance; R2.1's "Current state" pointer became the new section name.
- Zero fence changes. Zero perf hard-stops. Zero source-code touches (`src/**` untouched per the brief's non-goals).
- **Validator self-test**: the new 100+ LOC brief warning correctly fires on the cycle-framework-recovery-pass-2 brief itself at 113 LOC. Next cycle that uses the new `docs/tasks/_TEMPLATE.md` should land ≤80 LOC.
- **Expected impact** (per the plan, to be measured on next non-Pass-2 cycle): orchestrator prose per cycle drops from ~1,750 → ~250 lines; cycle wall-clock for similar 3-parallel scope ~day → 1-2 hours; executor token-budget deaths near zero; doc-state edits per cycle close 6 → 1.

## Recently Completed (campaign-2026-05-20-vehicle-boarding-and-water)

Three parallel cycles in
[docs/archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md)
(autonomous-loop posture). **15 PRs merged across the three cycles**
without inter-cycle dispatch dependency. Closes the three 2026-05-20
owner-walk + audit-surfaced gaps (player F-key boarding never wired
despite shipped HUD prompt, OF river surface not rendered, OF motor
pool clutter + duplicate M48). Campaign closed with the production
deploy gate firing against master tip `e99be58e` via
`gh workflow run deploy.yml --ref master` (deploy run `26182116715`,
success) — explicit fulfillment of the owner ask "make sure water is
proper in production as well."

### Cycle #1 — `cycle-vekhikl-player-boarding-wire`

Closes `VEKHIKL-UX-2` (zero-cycle carry-over). 5 R1 + 1 R2 in the
brief; landed as 8 PRs after a mid-cycle hard-stop (3 of 5 executors
terminated mid-thought at ≥90k tokens) was handled via re-dispatch
with tighter inline prompts + a split of the largest R1 task into a
factory module + handler/composer wire. Pilot seat only — M48 + PBR
gunner swaps deferred to `cycle-vekhikl-seat-swaps` on the hold list.

- [#288](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/288) `02fcf31c` `vekhikl-board-ground-adapter-wire` — Wired M151 jeep boarding end-to-end (`GroundVehiclePlayerAdapter` construction + `VehicleSessionController.enterVehicle('ground', _, _)` call site).
- [#289](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/289) `4b25e45b` `vekhikl-board-tank-adapter-wire` — Wired M48 Patton pilot boarding (`TankPlayerAdapter` construction; W/S throttle + A/D skid-steer + F enter/exit).
- [#293](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/293) `b23e882f` `vekhikl-board-input-router` (retry) — F-key router with mortar fallback ("no-vehicle-in-6m → onMortarFire" path is the load-bearing regression sentinel; F-while-seated triggers exit, not mortar fire). Original R1 task #3 executor terminated at ≥90k tokens; retry succeeded with a tighter inline prompt.
- [#296](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/296) `5582a127` `vekhikl-board-watercraft-and-emplacement-wire` — Wired Sampan + PBR + M2HB boarding (`WatercraftPlayerAdapter` + `EmplacementPlayerAdapter` construction; PBR/WatercraftIVehicle structural shape gap bridged via local helper in this PR; centralized in #297).
- [#297](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/297) `d455078c` `vekhikl-board-factory-module` (split A retry) — Per-category player adapter factory module (`createGroundVehiclePlayerAdapter` / `Tank` / `Watercraft` / `Emplacement` returning the right adapter for the right IVehicle category). Split out of the original `vekhikl-board-controller-factory` task to fit executor context budget after the original terminated mid-thought.
- [#298](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/298) `8560a280` `vekhikl-board-handler-and-composer-wire` (split B retry) — `PlayerController` boarding handler + composer wire. Constructs the factory once at startup and routes the F-key router's "board nearest" intent through it.
- [#299](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/299) `a6cfef34` `vekhikl-board-system-updater-wire` — Wired `GroundVehicleProximityChecker` (and the four sibling category checkers) through `SystemUpdater` so the proximity radius latches the prompted vehicle id under the live game loop (without this, the HUD prompt fires but the F-key router has no vehicle id to forward to `enterVehicle`).
- [#300](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/300) `e99be58e` `vekhikl-board-integration-test-and-playtest-evidence` — L3 cross-category integration test at `src/integration/vehicle/board-five-types.test.ts` (7/7 assertions; real factory + proximity checker + session controller against all five categories, zero stubs at unit-under-test layer); 15-shot capture script `scripts/capture-vekhikl-player-boarding-shots.ts` (5 vehicles × 3 frames each: pre-press, post-press, post-exit; PNG run deferred to owner walk-through per R2 budget-discipline note); playtest memo + PLAYTEST_PENDING row.

Carry-over delta: 0 (VEKHIKL-UX-2 opened+closed). Cycle retro item:
the executor context-budget hard-stop pattern is captured in
[docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md)
Pass 2 (framework trim).

### Cycle #2 — `cycle-of-river-surface-enable`

Closes `VODA-OF-1` (zero-cycle carry-over). 3 R1 + 1 R2; landed as
4 PRs. Mandatory `terrain-nav-reviewer` APPROVE on the config flip PR.

- [#286](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/286) `3312d0f6` `of-water-config-flip` — Flipped `waterEnabled: true` on `OpenFrontierConfig.ts`; the earlier "keep the global sea-level plane" assumption is superseded by the 2026-05-20 water polish pass, which disables the global plane for Open Frontier and treats accepted water as hydrology river surfaces only. `terrain-nav-reviewer` APPROVE.
- [#291](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/291) `0b28d689` `of-water-spawn-snap-resolver` — Snapped OF Sampan (`-200, 0, 100`) and PBR (`-880, 0, -760`) spawns to the water-surface Y at scenario load so the hulls start on the river surface, not 0 m above it. Watercraft physics expects the hull-on-surface initial state.
- [#292](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/292) `b78276cc` `of-water-capture-pair` — Playwright pre/post capture pair via new `scripts/capture-of-river-surface-shots.ts`. **Post captures stale at write time** (executor ran the post step before #286 + #291 merged, so committed `summary-of-water-post.json` records `riverSurface.visible: false` across all three records). Regeneration flagged as the load-bearing close gate in the playtest memo retro section.
- [#294](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/294) `f418443f` `of-water-playtest-evidence` — Playtest memo + PLAYTEST_PENDING row landed with the stale-post-capture regen gate explicitly called out.

Carry-over delta: 0 (VODA-OF-1 opened+closed).

### Cycle #3 — `cycle-motor-pool-reflow-and-tank-dedup`

Closes `VEKHIKL-LAYOUT-1` (zero-cycle carry-over). 2 R1 + 1 R2;
landed as 3 PRs. User-approved scope expansion in PR #290 (prefab
split) flagged at mid-cycle.

- [#287](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/287) `71a8d2f0` `of-tank-relocate-to-motor-pool` — Relocated the real M48 Tank IVehicle scenario spawn from West FOB `(-1025, 0, -760)` to the motor pool bay `(183, 0, -1173)`; removed the dressing M48 mesh from the OF prefab so OF has exactly one M48 silhouette.
- [#290](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/290) `d74abb36` `motor-pool-heavy-reflow` — Reflowed `motor_pool_heavy` into staggered bays (z ∈ [8, 18], yaw 72° spread π × 0.3 → 0.7, ≥1.5 m bounding-box clearance per pair); flanked AMMO/SUPPLY/FUEL crates around the comms tower at x=-24 (no longer behind vehicles). **User-approved scope expansion**: the OF reflow's M48 bay sat outside A Shau's 34 m footprint, so the shared prefab was split into `motor_pool_heavy_of` + `motor_pool_heavy_ashau` with side-effects in `gameModeTypes.ts` + `scripts/check-terrain-visual.ts` for the new prefab IDs (A Shau half preserves the cycle-vekhikl-3-shipped layout byte-for-byte).
- [#295](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/295) `34d202c5` `motor-pool-and-tank-dedup-playtest-evidence` — 5-shot capture script (`of-motor-pool-pre/post`, `ashau-motor-pool-pre/post`, `of-fob-no-tank` single-state); optional `of-motor-pool-tank-prompt.png` flag-gated on cycle #1 boarding wire landing first. PNG run deferred to owner walk-through per R2 budget-discipline note.

Carry-over delta: 0 (VEKHIKL-LAYOUT-1 opened+closed). Cycle-retro
item: prefab-ID additions ripple to `gameModeTypes.ts` +
`scripts/check-terrain-visual.ts` in any future prefab-split cycle.

### Campaign-level summary

- **15 PRs merged across the three cycles** (cycle #1 boarding: 8 PRs; cycle #2 OF water: 4 PRs; cycle #3 motor pool: 3 PRs).
- One mid-cycle hard-stop in cycle #1 R1 (executor context-budget overflow on 3 of 5 tasks) handled via tighter-prompt re-dispatch + task split into a factory module + handler/composer wire. Zero fence changes; zero perf hard-stops; zero CI red after retries.
- Intermittent sandbox blocked git commit/push from 3 worktrees (#291, #298, #299) at ~30% incidence — orchestrator-side push from the main session unblocked each. Flagged in [docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md).
- Production deploy gate fired against master tip `e99be58e` via `gh workflow run deploy.yml --ref master` (deploy run `26182116715` → success). Explicit fulfillment of the owner ask "make sure water is proper in production as well."
- Carry-over count: 6 → 6 (zero net change; three zero-cycle IDs opened+closed in-campaign).
- Hold list intact: `cycle-vekhikl-seat-swaps`, `cycle-vekhikl-5-fleet-expansion`, `cycle-sky-screen-space-quad`, `cycle-stabilizat-1-baselines-refresh` remain owner-gated on the autonomous-loop-deferred playtest evidence.
- Owner playtests deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) across all three cycles. Two known stale-post-capture regen gates (PR #292 OF water, PR #295 motor pool PNG run) called out in the respective playtest memos as load-bearing close gates for the deferred owner walks.
- Next work batch: framework recovery plan at [docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md) (landed in-campaign as commit `45d77250`; owner-gated post-compact review).

## Recently Completed (campaign-2026-05-19-visual-and-wayfinding)

Three parallel cycles in
[docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md](archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md)
(autonomous-loop posture). 11 PRs merged across the three cycles
without inter-cycle dispatch dependency. Closes the three
2026-05-19 owner-playtest issues (Open Frontier midday dark spots,
A Shau CDLOD edge fins + nav-lane trenches + sampan on dry dirt,
no vehicle wayfinding HUD / minimap / map markers).

### Cycle #1 — `cycle-skylut-resolution-bump`

Closes `KB-SKY-LUT-BANDING` (zero-cycle carry-over). Single-file
LUT dimension bump (32×8 → 32×32) in `HosekWilkieSkyBackend.ts`
for fog/hemisphere reader smoothness. No mandatory reviewer.

- [#276](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/276) `51763218` `skylut-resolution-bump` — Bumped `SKY_TEXTURE_HEIGHT` 8→32 (kept `SKY_TEXTURE_WIDTH=32`); `LUT_ELEVATION_BINS` bumped in tandem (executor caught both constants feed the fog/hemisphere reader). Parity-test delta inside 0.05 ceiling. +48 / −23 LOC.
- [#284](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/284) `4dd2c054` `skylut-playtest-evidence` — Extended `scripts/capture-sun-and-atmosphere-shots.ts` with `--lut-bump-check`; capture pair (Open Frontier noon + A Shau midday) committable post-merge. Playtest memo + PLAYTEST_PENDING row landed. Required two rebases (PLAYTEST_PENDING.md collisions with sibling cycle R2s).

Carry-over delta: 0 (KB-SKY-LUT-BANDING opened+closed).

### Cycle #2 — `cycle-ashau-edge-and-flow-tuning`

Closes `KB-DEM-EDGE-TAPER` (zero-cycle) AND Stage D3 of
`cycle-2026-05-09-cdlod-edge-morph` (carry-over from 2026-05-09).
Three R1 production landings + one R2 evidence PR.
`terrain-nav-reviewer` MANDATORY on all three R1 PRs.

- [#275](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/275) `f0359e80` + `a98c1f28` `dem-edge-taper` — Replaced boundary clamp in `DEMHeightProvider.sampleBilinear` with smoothstep taper to `DEM_EDGE_BASELINE_M=0` over `DEM_EDGE_TAPER_RADIUS_M=1500`. First reviewer pass returned CHANGES-REQUESTED on missing worker-side parity (`src/workers/terrain.worker.ts` had a duplicate `sampleDEM` that still clamped — taper was a no-op at the rendering path). Re-dispatch landed `src/systems/terrain/DEMSampling.ts` as a shared canonical sampler; both call sites delegate. Latent coord-system mismatch (worker treated origin as DEM corner vs. provider's center) fixed in lockstep. A Shau not in `prebake-navmesh.ts` MODES list so no prebake regen needed. Reviewer 2nd pass: **APPROVE**. +262 / −8 LOC + worker fix.
- [#277](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/277) `d0adbd9c` `ashau-water-enable` — Flipped `waterEnabled: true` at `AShauValleyConfig.ts:147`; added `globalWaterPlaneEnabled` field (default = `waterEnabled`) to decouple the sea-level plane from the hydrology river surface; relocated Sampan spawn from `(60, 0, 80)` to `(-6895, 0, 4835)` on the largest hydrology channel midpoint. Executor finding: the spawn relocation was the actual fix — the flag flip alone would not have fixed sampan-on-dirt (the old spawn was 1.8–2.3 km from any wet cell). Reviewer: **APPROVE-WITH-NOTES** (5 INFOs, including: spawn coord brittle to future hydrology bake regen, follow-up to use `resolvePosition` for runtime resolution; back-compat semantics for `globalWaterPlaneEnabled` cross-check). +69 / −10 LOC.
- [#282](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/282) `78eb7230` `route-stamp-slope-guard` — Added slope-aware drape blend to `TerrainFlowCompiler.appendRouteFlow` (4-tap differential at stamp center; `slopeGuardDegrees=15`, `routeBlendOnSteepSlope=0.0` for A Shau; 30° for Open Frontier). Trenches stop appearing on hillsides. Auto-regenerated `open_frontier-42` prebake artifacts (heightmap + navmesh + bake-manifest; +21KB navmesh delta from fewer flattened cells, intended effect). Reviewer: **APPROVE-WITH-NOTES** (4 INFOs: test asserts on stamp radii vs heightmap delta — acceptable; `samplingRadius` not scaled by `flattenStrength` — one-line comment recommended; 4-tap slope sample directionally biased toward zero at DEM edges — campaign-retro item; stray pre-existing prebake artifacts not regressed). +253 / −9 LOC.
- [#283](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/283) `0ae68009` `ashau-edge-and-flow-playtest-evidence` — New `scripts/capture-ashau-edge-and-flow-shots.ts` (3 capture pairs: north-edge flyover, valley road, sampan close-up). Playtest memo + PLAYTEST_PENDING row landed. R1 reviewer follow-up items captured in memo's "Cycle retro items" section.

Carry-over delta: 0 (KB-DEM-EDGE-TAPER opened+closed; Stage D3 of cycle-2026-05-09-cdlod-edge-morph closed; net active count unchanged).

### Cycle #3 — `cycle-vehicle-wayfinding-and-prompts`

Closes `VEKHIKL-UX-1` (zero-cycle). Four R1 production landings
(including the stretch compass markers) + one R2 evidence PR
that also folded in the deferred compass runtime wiring. No
mandatory reviewer.

- [#279](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/279) `44ddf347` `vehicle-proximity-prompt` — New `src/systems/vehicle/GroundVehicleProximityChecker.ts` mirroring `FixedWingInteraction.ts` (10 Hz, 6 m radius). Per-vehicle copy: "Press F to board M151 Jeep" / "M48 Patton tank" / "Sampan" / "PBR gunboat" / "Press F to crew M2HB emplacement". Added non-fenced `PlayerController.isInAnyVehicle()` helper (impl class, not interface — `IPlayerController` untouched). Executor disclosure: actual M151 ids are feature-derived (`motor_pool_small_m151`) not the brief's `m151_*` prefix — label resolver tolerates both. +486 / −0 LOC.
- [#280](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/280) `9977c335` `minimap-vehicle-markers` — Extended `MinimapSystem.ts` + `MinimapRenderer.ts` using helipad-marker pattern. `VehicleMarker` type lives in `MinimapRenderer.ts` (matches existing `HelipadMarker` export pattern so the sibling fullmap task imports cleanly). Composer wiring at `OperationalRuntimeComposer.ts`. Faction colors (US blue, OPFOR red). +555 / −7 LOC.
- [#281](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/281) `6cc01c69` `fullmap-vehicle-markers` — Mirrored minimap markers onto `FullMapSystem.ts` using the north-up flipped-axis transform. +205 / −2 LOC.
- [#278](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/278) `3fc34f1f` `compass-vehicle-markers` (stretch) — New `CompassVehicleMarkers.ts` modeled on `CompassZoneMarkers.ts`. Bearing chevrons + distance labels for the nearest vehicle of each drivable category. Stretch landed (not dropped). Runtime wiring (`compassSystem.setVehicleQuery()` in the startup composer) was outside the brief's `src/ui/compass/**` fence and deferred; landed in PR #285 commit 1. +547 / −0 LOC.
- [#285](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/285) `d78df6e5` + `f6439494` `vehicle-wayfinding-playtest-evidence` (+ compass wiring) — Commit 1 wired `compassSystem.setVehicleQuery()` in `StartupPlayerRuntimeComposer.ts` with a `vehicleManager.getAllVehicles()`-backed adapter and sibling test. Commit 2 landed `scripts/capture-vehicle-wayfinding-shots.ts` (22-shot matrix across 5 vehicle types × 4 surfaces + negative cases), playtest memo, PLAYTEST_PENDING row.

Carry-over delta: 0 (VEKHIKL-UX-1 opened+closed).

### Campaign-level summary

- 11 PRs merged across the three cycles (cycle #1: 2; cycle #2: 4; cycle #3: 5).
- R1 round dispatched all 8 production tasks in parallel under a 9-cap (1 stretch dropped → no, landed; actual = 8 R1 + 3 R2 = 11).
- One reviewer-driven re-dispatch on PR #275 (worker-side parity miss); zero fence changes; zero hard-stops.
- `combat120` perf: PASS by CI-gate inference. All 8 R1 PRs landed `perf` CI green; per-cycle p99 deltas inferred below the 5% campaign-level soft gate. STABILIZAT-1 baselines remain warn-stamped per the un-run cycle #13.
- Carry-over count: 6 → 6 (zero net change; three zero-cycle IDs opened+closed in-cycle; Stage D3 of cycle-2026-05-09-cdlod-edge-morph closed; no new active items opened).
- Hold list intact: `cycle-vekhikl-5-fleet-expansion` and `cycle-sky-screen-space-quad` remain owner-gated on the autonomous-loop-deferred playtest evidence; `cycle-stabilizat-1-baselines-refresh` remains parked per 2026-05-18 owner direction.
- Owner playtests deferred to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) across all three cycles (per `posture: autonomous-loop`).

## Recently Completed (cycle-mobile-webgl2-fallback-fix)

Campaign position #2 of 12 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(autonomous-loop posture). Three-round cycle, 9 PRs merged. Closes
the shipped fix for `KB-MOBILE-WEBGPU` (the post-WebGPU-merge
WebGL2-fallback mobile-unplayable regression).

PRs merged in dispatch order across 3 rounds:

R1 — Foundation (terrain TSL early-outs + telemetry plumbing):
- [#213](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/213) `6e7a8879` `terrain-tsl-biome-early-out` — Replaces the 8-way `mix(prev,sample,step(N-0.5,biomeSlot))` unroll in `TerrainMaterial.sampleBiomeTextureRaw` with a TSL `If/ElseIf` chain inside `Fn(()=>...)`. terrain-nav-reviewer **APPROVE-WITH-NOTES**. Notes: compile-time sampler-count verification deferred to R3 `tsl-shader-cost-probe`; strict-WebGPU desktop visual deferred to owner walk-through.
- [#211](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/211) `9e1ccab5` `terrain-tsl-triplanar-gate` — Wraps triplanar sample sub-graph in `If(triplanarBlend > 0.001)` so flat-terrain compiles skip the 6 triplanar samples. terrain-nav-reviewer **APPROVE-WITH-NOTES**. Identity-preservation argument: `mix(planar, triplanar, 0)` equals `planar`, so both branches yield byte-equivalent output.
- [#212](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/212) `0b3b749d` `render-bucket-telemetry-fix` — Root cause was an ordering interaction in `SystemUpdater.updateSystems()` calling `endFrame()` before `GameEngineLoop.animate()` opened `RenderMain`/`RenderOverlay` buckets; the `currentFrame` was null and the `beginSystem`/`endSystem` short-circuit dropped every render sample. Fix tracks pending starts on a separate map. 4 new behavior tests.

R2 — Mobile-specific knobs:
- [#215](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/215) `99044966` `mobile-pixel-ratio-cap` — `DeviceDetector.ts` mobile UA returns 1.0 pixel ratio instead of 2.0; proportionally reduces render bandwidth.
- [#214](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/214) `ca725369` `mobile-skip-npc-prewarm` — Gates the NPC close-model prewarm dispatch on `!isMobileGPU()` in `LiveEntryActivator.ts`; mobile-emulation was always hitting the 1.8s prewarm timeout for zero benefit. Adds a `npc-close-model-prewarm.skipped-mobile` startup mark for visibility.
- [#216](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/216) `706ad344` `mobile-sky-cadence-gate` — `HosekWilkieSkyBackend` exposes `setRefreshCadenceSeconds()`; `AtmosphereSystem` calls it with `isMobileGPU() ? 8 : 2`. Mobile sky `World.Atmosphere.SkyTexture` avg-EMA expected to drop ~4x.
- [#217](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/217) `83fb9fb0` `asset-audio-defer` — Splits audio init into boot-critical (ambient+UI) and background (SFX bank, music). Background decodes after first playable frame via new `whenSfxReady()` seam. **Measured: `modeClickToPlayableMs` 19,341ms → 11,349ms (−7,992ms)**. First-shot audio gap check deferred to PLAYTEST_PENDING.

R3 — Validation (probe + harness):
- [#218](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/218) `ff87e635` `tsl-shader-cost-probe` — New `scripts/perf-tsl-shader-cost.ts` (405 LOC) + dev-only `collectKonveyerNodeMaterialShaders()` surface on `RendererBackend.ts` (+278 LOC; dual-renderer-path: WebGL `_latestBuilder` vs WebGPU mangled `nodeBuilderCache`). `window.__tslShaderCost()` wired behind `?diag=1` gate. Closes the R1 terrain-nav-reviewer's "compile-time perf evidence deferred to R3" note.
- [#219](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/219) `a81d8cda` `real-device-validation-harness` — New `scripts/real-device-validation.ts` (484 LOC) extends mobile-renderer-probe with Playwright remote-debug for `android-chrome-debug` + `ios-safari-manual`. Cycle close memo at `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md` documents owner-attach steps. Pixel 5 + iPhone 12 emulation captures (23.68 / 28.30 avgFps) committed; real-device walk-through deferred to PLAYTEST_PENDING.

Out-of-band CI fix (root cause for the 30-min mobile-ui timeout flake):
- `47c42216` `ci(mobile-ui): matrix fan-out 4 devices into parallel jobs` — 4 device cases × ~12 min each (post-WebGPU mode-startup bake) = ~48 min sequential vs 30 min timeout = impossible. Matrix-fans the 4 device cases into parallel jobs at 18-min per-job ceiling; wall time max-of-devices ≈ 3-10 min. New `scripts/mobile-ui-check.ts --device-id <id>` flag; local invocations unchanged. Verified on R2 PRs: all 4 mobile-ui matrix jobs pass under 10 min, no timeouts.

Carry-over delta: 0. KB-MOBILE-WEBGPU was already in Closed at cycle start;
the Closed entry is updated with all 9 merge SHAs, the CI-fix commit, and
the harness/memo paths.

Perf delta (post-R1 perf-analyst + post-R2 perf-analyst, both rounds): same
pattern as cycle #1 — literal >5% p99 trip on `combat120` (R1 +34%, R2
+34%), both rounds explicitly diagnosed by perf-analyst as **runner-environment
noise, NOT real signal**. Evidence: (1) per-PR p99 ordering placed the
**telemetry-only PR #212 as the WORST** in R1 (an impossible GPU signal —
proves variance dominates); (2) the R2 worst-by-p99 was **PR #215
mobile-pixel-ratio-cap**, which only changes a UA-gated numeric constant
that cannot affect desktop combat120; (3) all four R2 captures ran the
WebGPU→WebGL2 fallback path on the CI Linux runner with mid-capture
WebGL context loss spam, while the baseline is the WebGL-native pre-WebGPU
build from 4 weeks ago. Campaign manifest explicitly defers strict 5% rule
until cycle #12 baseline refresh. No PAUSE fired per the cycle #1 precedent;
proper signal will come from the deferred real-device walk-through + the
cycle #12 quiet-machine re-capture.

Deferrals appended to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md):
- `asset-audio-defer` first-shot audio gap (automated assertion too
  heavyweight for single-task scope).
- `real-device-validation-harness` walk-through on real Android Chrome +
  real iOS Safari (run `scripts/real-device-validation.ts` per the
  close-validation memo).

Follow-ups for the next cycle (#3, `cycle-konveyer-11-spatial-grid-compute`):
- The R1 terrain-nav-reviewer flagged `customProgramCacheKey 'KonveyerTerrainTSL_v1'`
  not bumped after the structural change — bundle a `_v2` bump or removal
  into the next terrain-material touch.
- The R1 terrain-nav-reviewer flagged a `Switch(value).Case(N, fn)` TSL
  alternative to chained `If/ElseIf` — re-bench with `tsl-shader-cost-probe`
  in place. Low priority.
- The triplanar-gate capture script names "strict" but captures
  `webgpu-webgl-fallback` (truthfulness nit); rename or extend the script
  on next terrain-touch.

## Recently Completed (cycle-sky-visual-restore)

Campaign position #1 of 12 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(autonomous-loop posture). Single-round cycle, three parallel R1 tasks all
touching `src/systems/environment/atmosphere/**`. Closes the shipped fix for
`KB-SKY-BLAND` (the post-WebGPU-merge sky-bland visual regression).

PRs merged in dispatch order:

- [#208](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/208)
  `2118177f` `sky-dome-tonemap-and-lut-resolution` —
  `MeshBasicMaterial` constructor on the dome gets `toneMapped: false`
  (bypasses ACES in `GameRenderer`); `SKY_TEXTURE_WIDTH/HEIGHT` bumped from
  128×64 to 256×128 in `HosekWilkieSkyBackend.ts`. LUT-bake EMA capture
  deferred — the 2s-gated refresh path didn't fire during the harness sample
  window; static reasoning (~18-20 ms projected, amortized 0.5% frame budget)
  recorded in PR description.
- [#210](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/210)
  `3455fa96` `sky-hdr-bake-restore` — Sky LUT `DataTexture` migrates from
  `UnsignedByteType` + sqrt-gamma + `clamp01` to `HalfFloatType` (`Uint16Array`
  of `THREE.DataUtils.toHalfFloat` bit patterns; matches Three.js r184
  `Float16BufferAttribute` storage and WebGPU `RGBA16Float` upload). Texture
  `colorSpace` flips `SRGBColorSpace → LinearSRGBColorSpace` (correct for
  fp16 linear payload). Analytic ceiling lifts `Math.min(8, …)` → `Math.min(64, …)`
  so the sun-disc spike survives bake without overflowing fp16's exponent.
  `compressSkyRadianceForRenderer` deliberately untouched (cap correct for
  downstream fog + hemisphere readers).
- [#209](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/209)
  `9e1ce7c7` `sky-sun-disc-restore` — New `SunDiscMesh.ts` (196 LOC, under
  200 cap) + 7-test sibling `SunDiscMesh.test.ts`. Additive HDR sprite
  (`PlaneGeometry` + `MeshBasicMaterial` with `toneMapped: false`,
  `AdditiveBlending`, `depthWrite/Test: false`) billboarded to the camera,
  positioned at `sunDir * (domeRadius * 0.99)`. Hidden when sun
  `.y < 0`. Existing dome `mixSunDisc` soft glow stays; sprite is the
  bright pin-point on top.

Carry-over delta: 0. KB-SKY-BLAND was already in Closed at cycle start;
the Closed entry is updated with the three merge SHAs + Playwright
screenshot evidence path (`artifacts/cycle-sky-visual-restore/playtest-evidence/`).

Perf delta (post-round perf-analyst diff vs `perf-baselines.json` baseline,
`combat120`): raw numbers show p99 +9.8 ms (+29.3%) on the cumulative final
state vs the 4-week-old baseline, but the analyst reads this as no
detectable sky-attributable regression after accounting for measurement
trust (WARN on all three captures, probeP95 41-46 ms i.e. inside the
delta), baseline staleness (STABILIZAT-1 has blocked baseline refresh for
~4 weeks), and the within-cycle trajectory (p99 monotonically *improved*
66.6 → 73.7 → 43.2 ms across the three merges in order — inconsistent with
a sky-attributable cumulative regression). No >5% p99 hard-stop fired.
Independent confirmation requires a quiet-machine re-capture, which is
STABILIZAT-1 work (closes at campaign cycle #12).

CI notes for the cycle retro: `mobile-ui` CI job timed out at exactly the
30-minute mark on each of the three PRs — the known BACKLOG retro nit
(timeout flake on a job unrelated to sky scope). Master is unprotected so
merge was not blocked; flake count was 3-of-3 PRs in the round, well below
any reasonable real-signal threshold for a known-flaky timer-bound job.

Owner playtest deferred under autonomous-loop posture; the three sky
deferrals are appended to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)
for the owner to walk after the 12-cycle campaign completes (or during a
planned break).

Follow-ups for the next cycle (#2, `cycle-mobile-webgl2-fallback-fix`):
- Real-device validation can confirm the noon sky reads "right" on a phone.
- LUT-bake EMA on a mobile-emulation capture can quantify whether the
  256×128 step needs to fall back to 192×96 on phones (cycle-specific
  graceful-degradation hard-stop is wired but uncaught here).

## Recently Completed (cycle-2026-05-16-mobile-webgpu-and-sky-recovery)

Investigation cycle covering two owner-reported 2026-05-15 post-WebGPU-merge
playtest regressions: mobile unplayable + sky bland. Five parallel R1
investigation memos landed under
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/` with `file:line`
citations, paired pre/post sky screenshots, mobile-emulation adapter-info
evidence, and labelled-emulation perf magnitudes (with explicit
host-contention perf-taint caveat carried into the R2 alignment memo).
R2 alignment memo synthesised findings and named two fix cycles, both
queued at the top of `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.

Headline findings:
- Mobile lands on `webgpu-webgl-fallback` (WebGL2 backend of `WebGPURenderer`),
  not classic `WebGLRenderer`. `strictWebGPU=false` (commit `4aec731e`) is
  the only reason mobile boots at all.
- Terrain TSL biome-sampler chain unrolled into `mix(prev, sample, step(...))`
  forces all 8 biome samplers per fragment → ~146 effective samples/fragment
  vs ~19 pre-merge (8x amplification). Highest per-fragment cost lever.
- Sky-bland is visual-fidelity only (not perf): 128×64 CPU-baked DataTexture
  replaced per-fragment Preetham, HDR clamped to [0,1], missing
  `toneMapped: false` routes dome through ACES, sun-disc normalised to peak
  1.0 kills HDR pearl.

PRs merged:

- [#203](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/203) `mobile-renderer-mode-truth` — Pixel 5 + iPhone 12 Playwright emulation probe; `capabilities.resolvedBackend === "webgpu-webgl-fallback"` in both contexts. Ships `scripts/mobile-renderer-probe.ts` for fix-cycle re-validation.
- [#204](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/204) `tsl-shader-cost-audit` — three production TSL materials inventoried; terrain TSL biome-sampler chain identified as the dominant per-fragment regression (~8x sampler amplification, ~146 effective samples/fragment worst case).
- [#205](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/205) `sky-visual-and-cost-regression` — four-part visual diff + paired pre/post screenshots across 5 scenarios; root cause is `MeshBasicMaterial`+`DataTexture` resolution drop + HDR clamp + ACES on dome + sun-disc normalisation.
- [#206](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/206) `mobile-startup-and-frame-budget` — mode-click → playable timings, 60s steady-state `systemBreakdown` (`Combat.AI` 46.86 ms / `World.Atmosphere.SkyTexture` 31.60 ms / `Combat.Billboards` 13.19 ms avg-EMA at 4.42 fps under 4x CPU throttle). Ships `scripts/perf-startup-mobile.ts`.
- [#207](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/207) `webgl-fallback-pipeline-diff` — eight new pipeline elements in WebGL2-fallback path vs pre-merge; top-3 cost contributors flagged (terrain TSL, renderer construction overhead, CPU-baked sky refresh).
- Plus the R2 alignment memo `docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md` (orchestrator-authored).

Carry-over delta: +2 opened (`KB-MOBILE-WEBGPU`, `KB-SKY-BLAND`) at launch
(9 → 11); −2 closed at cycle end with promotion-to-fix-cycle resolution
(11 → 9). Net cycle delta: 0. Active count back to **9**.

Fix cycles named:
- `cycle-sky-visual-restore` (small, leads): set `toneMapped: false` on dome,
  bump LUT resolution, restore HDR sun-disc.
- `cycle-mobile-webgl2-fallback-fix` (larger, real-device validation = merge
  gate): TSL terrain biome-sampler early-out, mobile pixel-ratio cap, skip
  NPC prewarm, mobile-gated sky cadence.

Optional sequencing: `cycle-konveyer-11-spatial-grid-compute` (already
queued) closes the steady-state #1 mobile bucket (`Combat.AI` / `DEFEKT-3`)
independently and can run in parallel.

## Recently Completed (cycle-2026-05-13-konveyer-materialization-rearch + doc-vision-alignment + master-merge)

R1 of the Phase F materialization rearch plus the doc-vision-alignment pass
landed on the `exp/konveyer-webgpu-migration` branch and merged to `master`
on 2026-05-13 as PR #192. **Master is now the WebGPU + TSL renderer branch
by default**, with automatic WebGL2 fallback for browsers without WebGPU.
KONVEYER-10 closes with this arc.

- [#183](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/183) `konveyer-combat-sub-attribution` — `Combat.{Influence,AI,Billboards,Effects}` telemetry children wired into `CombatantSystem.update` blocks; probe-side child breakdown captured across all five modes.
- [#184](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/184) `konveyer-materialization-lane-rename` — pure refactor: `Combatant.lodLevel` → `simLane` + `renderLane`. Surface for the budget arbiter v2.
- [#185](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/185) `konveyer-sky-refresh-investigate` — sky-refresh idempotency at the 2 s cadence; `setCloudCoverage` no-op on unchanged input.
- [#186](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/186) `doc-align-historical-headers` — historical "Last verified" headers added to `CAMPAIGN_2026-05-09.md`, `STABILIZATION_CHECKPOINT_2026-05-09.md`, and `REARCHITECTURE.md`.
- [#187](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/187) `doc-align-roadmap-and-agents` — ROADMAP and AGENTS docs aligned with the 3,000-combatant vision sentence; Phase 6 Ground Vehicles flipped to IN PROGRESS.
- [#188](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/188) `doc-align-claude-and-carryovers` — CLAUDE.md "Current focus" reflects the 2026-05-12 vision confirmation; AVIATSIYA-2/3 parked.
- [#189](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/189) `rearch-ground-vehicle-physics` — `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md` memo (wheeled physics, Ackermann steering, ground-normal conform) and the 2026-05-13 addendum to `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md`.
- [#190](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/190) `rearch-tank-systems` — `docs/rearch/TANK_SYSTEMS_2026-05-13.md` memo (skid-steer, independent turret, gunner seat, ballistic cannon, damage states).
- [#191](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/191) `rearch-browser-runtime-primitives` — `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` memo (Rust-WASM, compute, audio, and related runtime primitives).
- [#192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192) `exp→master merge` — `exp/konveyer-webgpu-migration` folded into `master` (merge commit `1df141ca`); WebGPU + TSL becomes the default production renderer.
- Inline fix on PR #192 (commit `4aec731e`) — gate WebGL-fallback rejection on strict mode only. Production users without WebGPU now automatically hit Three.js's WebGL2 backend.

Carry-over delta: −1 closed (KONVEYER-10), +0 opened. Active count: 9 → 8.
Follow-up cycles queued on master: cover-spatial-grid, render-silhouette/cluster
lanes, squad-aggregated strategic sim, budget arbiter v2, strict-WebGPU
multi-mode proof, docs review packet v2.

## Recently Completed (cycle-2026-05-09-cdlod-edge-morph)

Hot-fix cycle 2.4 (single task), inserted ahead of Phase 2.5 to address a
P1 user-reported visual regression: white seam cracks at terrain chunk
borders from helicopter altitude on A Shau. Predecessor `terrain-cdlod-seam`
(cycle-2026-05-08) closed same-LOD parity but explicitly deferred the
LOD-transition T-junction case; this cycle shipped the canonical
Strugar-style fix. The first live deployment still left user-visible white
crack risk, so the 2026-05-10 release-stewardship pass added two-sided CDLOD
skirt walls in `5e3436c`.

- [#178](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/178) `cdlod-edge-morph` — 4 commits (3 staged + 1 harden). Stage 2 ships: per-edge `edgeMorphMask` attribute on `CDLODTile` + integer-cell-keyed neighbor pass in `CDLODQuadtree.resolveEdgeMorphMasks` + `Float32Array` per-instance attribute on `CDLODRenderer` + shader force-morph at coarser-neighbor edges. Stage 1 (snap-math) reverted in harden commit — terrain-nav-reviewer caught a wiring conflation in the brief (`tileResolution` vertex count vs. `tileGridResolution` quad count). Master's pre-PR `parentStep = 2/tileGridResolution` was geometrically correct. Net diff: +410 / -9 across 6 files. terrain-nav-reviewer APPROVE-WITH-NOTES.

Carry-over delta: −0 closed, +0 opened. Active count holds at **12** (at
the ≤12 limit). Cycle ships a user-observable feature (closes the seam
regression) — COMPLETE under the "ship a user-observable gap" half of the
rule.

Post-cycle follow-up status:

- A Shau mask-test claim softening, the CDLOD perf ceiling, and the
  `tileKey()` guard comment were closed by `a9ebfbe`.
- Mobile UI CI timeout was bumped from 25 to 30 minutes by `6892a36`.
- Post-merge combat120 evidence exists at
  `artifacts/perf/2026-05-10T10-45-07-263Z`, but `perf:compare` still fails
  avg, p99, and max-frame gates. STABILIZAT-1 remains open.
- Terrain visual evidence exists at
  `artifacts/perf/2026-05-10T10-53-32-328Z/projekt-143-terrain-visual-review/visual-review.json`.
  That historical gate WARNed because one A Shau river-ground screenshot timed
  out and Open Frontier water/exposure remained washed out. The later KONVEYER
  strict-WebGPU terrain packet supersedes the terrain-color concern; water
  polish remains routed through VODA and rest-of-scene WebGPU parity through
  KONVEYER-10.
- **Visual A/B at A Shau north ridgeline** (helicopter altitude, screenshot
  coordinate from the original 2026-05-09 user report) is the human gate
  per the cycle brief. Save before/after PNGs into
  `artifacts/cdlod-edge-morph/{before,after}/`.

Comprehensive context: cycle brief at
`docs/tasks/archive/cycle-2026-05-09-cdlod-edge-morph/cycle-2026-05-09-cdlod-edge-morph.md`.

## Recently Completed (cycle-2026-05-10-zone-manager-decoupling)

Phase 2 of the realignment campaign. ZoneManager fan-in 52 → 17 read / 5
concrete via `IZoneQuery` interface. **Stabilization checkpoint after this
cycle**; campaign auto-advance paused.

- [#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173) `zone-manager-design-memo` — `docs/rearch/zone-manager-decoupling.md` (303 LOC), 6-method `IZoneQuery` shape proposal, batch plan
- [#174](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/174) `izone-query-fence` — `[interface-change]` PR; `IZoneQuery` added to fence; ZoneManager implements; +3 trivial accessors (`getZoneAt`/`getZoneById`/`getCapturableZones`); terrain-nav-reviewer APPROVE
- [#175](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/175) `zone-decoupling-batch-a-readonly` — HUD/Compass/Minimap/FullMap migrated to `IZoneQuery`
- [#176](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/176) `zone-decoupling-batch-b-state-driven` — Combat/Tickets/WarSim migrated; ZoneManager.update() now publishes `zone_captured`/`zone_lost` events; combat-reviewer APPROVE-WITH-NOTES
- [#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177) `zone-decoupling-batch-c-owners` — PlayerRespawn + CommandInputManager migrated; adapter shims dropped; ZoneManager removed from lint-source-budget grandfather list; `docs/ARCHITECTURE.md` heatmap updated; combat-reviewer APPROVE-WITH-NOTES

Carry-over delta: −0 closed, +3 opened (`cloudflare-stabilization-followups`,
`weapons-cluster-zonemanager-migration`, `perf-doc-script-paths-drift`).
Active 9 → 12 (at the `≤12 active` rule limit). The +3 are deferred work
formally registered as part of the **stabilization checkpoint**; the cycle
ships its user-observable feature (fan-in reduction) and would be COMPLETE
under the "ship a feature" half of the rule but registers INCOMPLETE under
the strict-decrease half — flagged for the next cycle's plan to close ≥2
of the 12 active before Phase 3 dispatches.

Comprehensive context: [docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md](archive/STABILIZATION_CHECKPOINT_2026-05-09.md).
Live audit findings: `artifacts/live-audit-2026-05-09/FINDINGS.md`.

## Recently Completed (cycle-2026-05-09-doc-decomposition-and-wiring)

Phase 1 of the 12-week realignment campaign. Doc surface decomposed and
WorldBuilder god-mode flags wired into engine consumers.

- [#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167) `state-doc-split` — `docs/STATE_OF_REPO.md` (2,708 LOC) → `docs/state/` (3 files ≤140 LOC each)
- [#168](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/168) `codex-decomposition` — `docs/PROJEKT_OBJEKT_143*.md` archived; `docs/DIRECTIVES.md` (199 LOC) replaces Article III
- [#169](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/169) `perf-doc-split` — `docs/PERFORMANCE.md` (2,332 LOC) → `docs/perf/` (4 files ≤200 LOC each)
- [#170](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/170) `script-triage` — 89 `check:projekt-143-*` → 12 plain-named retained; 80 archived under `scripts/audit-archive/`
- [#171](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/171) `artifact-gc` — weekly `artifact-prune.yml` workflow; ~7.4 GB local prune
- [#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172) `worldbuilder-wiring` — 6 god-mode flags wired into PlayerHealthSystem, AmmoManager, PlayerMovement, PostProcessingManager, AtmosphereSystem, AudioManager (all DEV-gated, Vite DCE confirmed)

Carry-over delta: −6 worldbuilder-wiring closed, +2 opened (artifact-prune
baseline-pin fix; `oneShotKills` 7th flag wiring). Net −4. Active count
13 → 9. Cycle COMPLETE.

Follow-ups for next cycles (combat-reviewer notes from PR #172):
- Update stale "703 LOC" reason text in `scripts/lint-source-budget.ts:54` (file is now 718 LOC).
- `oneShotKills` flag wiring (carry-over filed).
- `artifact-prune.ts` baseline-pin regex fix (carry-over filed).

## Strategic Reserve

Items below are acknowledged but not active directives unless the project
owner opens or reassigns them.

### KB-LOAD

- Accepted Pixel Forge vegetation candidate import and runtime proof.
- Dense vegetation ecology, bamboo and palm clustering, grass, ground cover,
  and disturbed trail edges.
- Pixel Forge building and vehicle replacement with foundation, collision, and
  pivot checks.
- GLB migration into the content-addressed asset manifest after terrain
  delivery is stable.

### KB-TERRAIN

- Far-canopy and distance-policy after evidence for Open Frontier and A Shau.
- A Shau route and NPC movement quality beyond representative-base connectivity.
- Terrain texture improvements.
- Road network generation with splines, intersections, and pathfinding.
- Additional DEM modes such as Ia Drang and Khe Sanh.

### KB-CULL

- Broad HLOD.
- Static-cluster policy.
- Vegetation culling.
- Parked-aircraft playtest coverage.
- Building and prop residency decisions after renderer-category evidence.

### KB-OPTIK / KB-EFFECTS

- Human-signed atmosphere and cloud readability.
- Vegetation normal-map and material parity follow-ups.
- Music, soundtrack, weapon sound variants, and impact/body/headshot sounds.
- Stress-scene grenade and explosion validation after combat120 trust returns.

### KB-STRATEGIE

- WebGPU, OffscreenCanvas worker render, WASM-SIMD, SharedArrayBuffer, and
  cross-origin isolation branches. Reopen only with project-owner direction.
- Multiplayer and networking.
- Destructible structures.
- Survival / roguelite mode.
- Campaign system.
- Theater-scale tiled DEM maps.

### Phase F Candidates

- E1: ECS evaluation remains deferred; bitECS measured about parity with the
  current Vector3-shaped runtime in the old spike.
- E2: GPU-driven rendering and WebGPU migration are now active on
  `exp/konveyer-webgpu-migration` (KONVEYER-0 through KONVEYER-10). The
  scene/material/materialization rearchitecture memo lives at
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`; concrete
  instancing-capacity cliffs may still be fixed in place on `master` while
  the experimental branch matures.
- E3: Utility-AI combat layer expansion remains a design candidate; do not
  block present faction tuning on it.
- E4: Agent/player API unification needs a minimal movement/observation
  prototype before any full active-driver rewrite.
- E5: Deterministic sim and seeded replay need a `SimClock` / `SimRng` pilot
  before any broad pass.
- E6: Vehicle physics rebuild needs a flagged Skyraider `Airframe` prototype
  and human playtest before any full migration.

## Known Deferred Risks

1. Fixed-wing and helicopter feel are not human-signed-off.
2. Pointer-lock fallback is implemented but not usability-signed.
3. Airfield height authority is partially repaired, not fully unified.
4. NPC route-follow quality is not signed off.
5. Production freshness must be rechecked after every player-testing push.
6. Main production/perf chunks remain heavy.
7. `frontier30m` baseline remains stale until a quiet-machine soak.
8. Mixed UI paradigms remain architecture debt.
9. SystemManager and composer ceremony remain architecture debt.
10. Variable-delta physics remains architecture debt outside fixed-step vehicle
    systems.

## Historical Cycle Index

| Cycle | Record |
|---|---|
| cycle-mobile-webgl2-fallback-fix | `docs/tasks/archive/cycle-mobile-webgl2-fallback-fix/cycle-mobile-webgl2-fallback-fix.md` |
| cycle-sky-visual-restore | `docs/tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md` |
| cycle-2026-05-10-zone-manager-decoupling | `docs/tasks/archive/cycle-2026-05-10-zone-manager-decoupling/cycle-2026-05-10-zone-manager-decoupling.md` |
| cycle-2026-05-09-doc-decomposition-and-wiring | `docs/tasks/archive/cycle-2026-05-09-doc-decomposition-and-wiring/cycle-2026-05-09-doc-decomposition-and-wiring.md` |
| cycle-2026-05-09-phase-0-foundation | `docs/tasks/archive/cycle-2026-05-09-phase-0-foundation/cycle-2026-05-09-phase-0-foundation.md` |
| cycle-2026-05-08-stabilizat-2-closeout | `docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md` |
| cycle-2026-04-23-debug-cleanup | `docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md` |
| cycle-2026-04-23-debug-and-test-modes | `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md` |
| cycle-2026-04-22-heap-and-polish | `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md` |
| cycle-2026-04-22-flight-rebuild-overnight | `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` |
| cycle-2026-04-21-stabilization-reset | `docs/cycles/cycle-2026-04-21-stabilization-reset/RESULT.md` |
| cycle-2026-04-21-atmosphere-polish-and-fixes | `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/RESULT.md` |
| cycle-2026-04-20-atmosphere-foundation | `docs/cycles/cycle-2026-04-20-atmosphere-foundation/RESULT.md` |
| cycle-2026-04-18-harness-flight-combat | `docs/cycles/cycle-2026-04-18-harness-flight-combat/RESULT.md` |
| cycle-2026-04-18-rebuild-foundation | `docs/cycles/cycle-2026-04-18-rebuild-foundation/RESULT.md` |
| cycle-2026-04-17-drift-correction-run | `docs/cycles/cycle-2026-04-17-drift-correction-run/RESULT.md` |
| cycle-2026-04-06-vehicle-stack-foundation | `docs/cycles/cycle-2026-04-06-vehicle-stack-foundation/RESULT.md` |

## Research References

- `examples/prose-main/` remains a gitignored external-repo reference target for
  declarative runtime config and orchestration patterns.
- Write generalized findings to `docs/rearch/prose-research.md` before using
  them as implementation guidance.
