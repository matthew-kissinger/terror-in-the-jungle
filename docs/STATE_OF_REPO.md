# State Of Repo

Last updated: 2026-04-24

This file is the current-state snapshot for the repo. [ROADMAP.md](ROADMAP.md)
remains aspirational. [BACKLOG.md](BACKLOG.md) tracks queued work. This
document answers the narrower question: what is verified in the current repo
state. Historical cycle/archive docs remain historical evidence; this file is
the current truth anchor.

## Architecture Recovery Update On 2026-04-23/24

- Architecture recovery Cycles 0-12 are tracked in
  [ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md).
- Player vehicle-session transitions are now routed through
  `VehicleSessionController`. `VehicleStateManager` remains as a compatibility
  re-export, but the current session owner is the controller.
- Fixed-wing and helicopter models provide exit capability/placement facts via
  typed exit plans. The session controller owns the final player transition,
  derived `PlayerState` flags, and cleanup order.
- Touch action-bar EXIT wiring is covered at the UI orchestration layer and
  routes through the generic vehicle enter/exit callback.
- Keyboard `KeyE` and gamepad interact routing are covered at the `PlayerInput`
  callback layer and prefer the generic vehicle enter/exit callback.
- `HelicopterModel.exitHelicopter()` routes through the session-aware
  `requestVehicleExit()` path when available, leaving `HelicopterInteraction`
  as a legacy fallback instead of the primary active-player exit authority.
- The fixed-wing browser probe was updated so player/NPC handoff exits through
  the keyboard `KeyE` path instead of directly calling a private exit method.
  It now also validates in-flight emergency bailout through the real keyboard
  path for A-1, F-4, and AC-47.
- Vehicle-session validation completed:
  - targeted vehicle/session contract tests - PASS
  - targeted touch vehicle-exit callback tests - PASS
  - targeted keyboard/gamepad vehicle-exit callback tests - PASS
  - targeted helicopter model/session exit tests - PASS
  - `npm run validate:fast` - PASS
  - `npm run check:mobile-ui` - PASS
  - `npm run build` - PASS
  - `npm run probe:fixed-wing` - PASS, including takeoff, approach, in-flight
    bailout, and player/NPC handoff
- Cycle 3 scheduler recovery first pass is now in place:
  `SystemUpdateSchedule` declares the current `SystemUpdater` phases, budgets,
  cadence groups, and fallback-tracked system keys. `SystemUpdater` derives its
  `Other` fallback exclusions from that schedule instead of maintaining a
  second manual list.
- Cycle 3 implementation gate passed on 2026-04-23:
  `npm run typecheck`, `npm run lint`, `npm run test:quick`, and
  `npm run build`.
- Cycle 4 UI/input boundary first pass is now in place:
  `TouchControls` no longer has public enter/exit vehicle-mode mutators.
  Touch flight layout derives from `VehicleUIContext` supplied by the
  presentation controller, and actor mode alone no longer makes touch controls
  show flight vehicle UI. Cycle 4 automated gate passed: targeted UI/input
  suites, `npm run typecheck`, `npm run lint`, `npm run build`,
  `npm run check:hud`, `npm run check:mobile-ui`, and `npm run test:quick`.
- Cycle 5 combat ownership first pass is now in place:
  `CombatantSystem` owns the current combat spatial index dependency and
  injects it into `CombatantLODManager`. The LOD manager no longer imports the
  global spatial singleton directly, and coverage proves injected spatial sync
  plus `CombatantAI.updateAI()` use the supplied grid. Targeted combat suites
  and `npm run typecheck` passed.
- 2026-04-24 Cycle 5 combat actor-height follow-up is in place:
  NPC and player positions now share an eye-level actor-anchor contract.
  `NPC_Y_OFFSET` matches `PLAYER_EYE_HEIGHT` (`2.2m`), `PlayerRespawnManager`
  uses the same player eye height for spawn grounding, and
  `CombatantBodyMetrics` centralizes NPC muzzle, NPC center-mass, player
  center-mass, and LOS eye positions. Ballistics, terrain fire checks, LOS,
  cover threat rays, tracer/muzzle effects, death effects, and hit zones no
  longer stack independent vertical offsets on top of already raised actor
  positions. The NPC billboard plane was also reduced from `3.2m x 4.5m` to
  `2.0m x 2.8m` and shifted down by `NPC_SPRITE_RENDER_Y_OFFSET` so the
  optimized sprite alpha bounds read as a human-scale silhouette with feet near
  terrain and head near the actor eye anchor. This addresses the playtest
  symptom where NPC fire appeared above the player's head and the player felt
  short next to combatants. Human playtest still decides whether the sprite art
  itself reads correctly in motion.
- Cycle 6 terrain/collision first pass is now in place:
  helicopter squad deployment uses the runtime terrain query surface and
  collision-aware `getEffectiveHeightAt()` when available; `NavmeshSystem`
  receives `terrainSystem` from `SystemConnector` and samples navmesh
  heightfields plus connectivity representative heights through the terrain
  runtime instead of directly through `HeightQueryCache`. Targeted terrain,
  navigation, helicopter, and composer suites plus `npm run typecheck` passed.
  The Cycle 6 broad gate also passed: `npm run lint`, `npm run test:quick`,
  `npm run build`, and a clean rerun of `npm run probe:fixed-wing`.
- Cycle 7 harness first pass is now in place:
  `scripts/fixed-wing-runtime-probe.ts` writes `summary.json` incrementally
  after each scenario and records structured failure rows plus best-effort
  failure screenshots. `npm run typecheck` and `npm run lint` passed; the
  post-patch `npm run probe:fixed-wing` rerun passed and wrote
  `status: "passed"` to `artifacts/fixed-wing-runtime-probe/summary.json`.
  `npm run check:states` and `npm run check:hud` also passed after the harness
  change.
- Cycle 8 cleanup/guardrail first pass is now in place:
  Knip now has explicit entries/ignores for retained flight evidence probes,
  archived evidence scripts, and Cloudflare deploy tooling; source modules no
  longer export local-only helpers as public API; terrain/combat/UI/scripts
  subsystem guardrails now encode the ownership rules discovered in this run.
  `npm run typecheck`, `npm run deadcode`, `npm run lint`,
  `npm run test:quick`, and `npm run build` all passed.
- 2026-04-24 Cycle 9 atmosphere update: `npm run evidence:atmosphere`
  attempts all five modes from ground, sky-coverage, and aircraft views. Current
  evidence is under
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T07-05-19-071Z/`.
  A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 enter live
  mode with `0` browser errors, terrain resident at the camera, and non-zero
  sky-dome cloud coverage. Visible clouds now come from
  `HosekWilkieSkyBackend`; the old planar `CloudLayer` is hidden so it no
  longer owns the horizon. The cloud shader now uses a seamless cloud-deck
  projection instead of azimuth-wrapped UVs. A Shau, TDM, and Zone Control read
  as heavier broken cloud layers; Open Frontier and combat120 read as lighter
  scattered-cloud presets. Cloud art is still not human-signed off.
- 2026-04-24 A Shau evidence update: the DEM/asset-manifest blocker was fixed
  for local retail/perf previews by generating `asset-manifest.json` during
  `npm run build` and `npm run build:perf`. A Shau now enters live mode and
  records DEM-backed terrain heights in the atmosphere evidence. The latest run
  has `0` browser errors and A Shau water is correctly disabled
  (`enabled=false`, `waterVisible=false`, `cameraUnderwater=false`). The old
  TileCache fallback path has been removed; large worlds now use explicit
  static-tiled nav generation, and A Shau startup hard-fails if no generated or
  pre-baked navmesh exists. A Shau navigation is still not signed off because
  static-tiled route/NPC movement still need play-path validation. The latest
  artifact now records an A Shau nav gate: 6/6 representative bases snapped to
  navmesh, `connected=true`, and every representative pair returned a path. The
  run still reports a steep `tabat_airstrip` warning with `112.1m` vertical span
  across the `320m` runway footprint.
- 2026-04-24 all-mode regression note: the same evidence run produced `0`
  browser errors for Open Frontier, TDM, Zone Control, and combat120. Do not let
  the A Shau repair narrow validation: before push/deploy, rerun all-mode
  evidence and keep non-A Shau warnings visible. Latest non-A Shau warnings
  include an Open Frontier `airfield_main` steep-site warning, combat120 AI and
  `Combat` budget warnings, and TacticalUI/World budget warnings in several
  modes.
- Silent fallback risk is not fully removed; `PlayerMovement`,
  air-support mission positioning, terrain LOS wiring, and combat spatial
  singleton compatibility all still need an explicit fallback-retirement cycle.
  `ModeStartupPreparer` now hard-fails required A Shau terrain/nav evidence
  instead of masking it. Airfield terrain stamps share one datum, but
  spawn/taxi/runway helpers still do not share a single airfield surface
  runtime. Render/LOD/culling has only partial coverage through aircraft
  visibility and draw-call optimization; it still needs an airfield perf audit.
- Not yet signed off: human playtest for aircraft feel, emergency bailout UX,
  helicopter/fixed-wing enter/exit feel, pointer-lock fallback usability, and
  A Shau airfield taxi/takeoff usability. NPC/player visual scale and AI fire
  height are now code-corrected but still need human combat-feel confirmation.
  Per user direction on 2026-04-23, these feel gates are deferred until the end
  of all current recovery cycles.
- 2026-04-24 release validation did not treat the first `validate:full` run as
  a clean pass because `perf:capture:combat120` failed one heap recovery check.
  The unit/build portions passed, and a follow-up standalone
  `npm run perf:capture:combat120` plus
  `npm run perf:compare -- --scenario combat120` passed. Treat this as
  PASS/WARN, not an unresolved frame-time failure.
- 2026-04-23 in-app browser playtest added findings to
  [ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md):
  - fixed-wing emergency bailout previously exited successfully but dropped the
    player directly to terrain. Current fix now preserves airborne ejection
    height, and `npm run probe:fixed-wing` validates keyboard bailout for A-1,
    F-4, and AC-47;
  - W/throttle could leak into infantry movement after aircraft exit. Branch
    fix now clears transient input on vehicle session transitions and on
    pointer-lock loss/blur;
  - pointer lock fails in the Codex in-app browser. Current fix now shares the
    same lock target for gameplay/free-fly and activates an unlocked mouse-look
    fallback on `pointerlockerror`;
  - helicopter rotors kept idling after exit because engine RPM floored at
    idle. Cycle 2 patch now gives helicopter physics an explicit
    engine active/stopped lifecycle, lets exited helicopters spool down to
    `engineRPM = 0`, and raises flight-RPM visual rotor speed;
  - airfield stands, taxi routes, and runway helpers exposed a terrain datum
    split. Cycle 2/6 bridge patch now gives generated airfield
    terrain stamps one runway-derived `fixedTargetHeight`, so runway, apron,
    taxiway, filler, and envelope stamps do not resolve separate local heights
    on sloped sites;
  - the fixed-wing browser probe then exposed an AC-47 orbit-hold overbank
    failure. Branch-local fix corrects the orbit roll-error sign in
    `FixedWingControlLaw`; the probe now passes AC-47 orbit hold again;
  - A Shau fog/cloud readability and airfield render cost need targeted
    captures before tuning or asset replacement. Cycle 9 now has all-mode
    atmosphere coverage, A Shau DEM evidence is valid in local perf preview,
  and Cycle 10 has removed the old TileCache fallback path in favor of explicit
  static-tiled generation plus startup failure when no navmesh exists. The
  previous disconnected-home-base warning no longer recurs after the A Shau
  terrain-flow shoulder patch. Current blockers are route/NPC movement quality
  beyond representative-base connectivity, terrain/camera clipping reproduction,
  separate water rendering/hydrology quality, and the steep `tabat_airstrip`
  surface warning.

## Verified locally on 2026-04-21

- `npm run validate:fast` — PASS
- `npm run validate` — PASS
- `npm run build` — PASS
  - current build emits content-hashed Vite output under `/build-assets/`
  - build output no longer emits `.gz` or `.br` sidecar files; Cloudflare
    handles visitor-facing compression for Pages assets
- `npm run smoke:prod` — PASS
- `npm run check:mobile-ui` — PASS
- `npm run check:states` — PASS
- `npm run check:hud` — PASS
- `npm run check:assets` — WARN
  - route is now correct; remaining warnings are duplicate Vite/Recast
    dev-mode requests, not missing `/terror-in-the-jungle/` assets
  - rerun after the cache split still reports no missing GLBs or public assets
- `npm run probe:fixed-wing` — PASS
  - A-1, F-4, and AC-47 all enter, accelerate, rotate, climb to target AGL,
    and can be positioned onto short-final approach
  - AC-47 also reaches its orbit-hold engagement altitude and sustains
    `orbit_hold` in the browser probe
  - player/NPC fixed-wing handoff is covered for all three aircraft: an attached
    NPC mission stays cold while the player owns the aircraft, then resumes
    after player exit
- Helicopter and fixed-wing entry reset shared flight mouse state to
  direct-control mode, preventing stale free-look state from carrying between
  vehicle adapters.
- Fixed-wing feel has its first Cycle 2 fix in place, but it is not human-signed
  off yet. Manual feedback reported stiff aircraft response, altitude
  bounce/porpoise after climb, and visible screen shake at speed. Code
  inspection found fixed-wing was rendering/querying raw airframe steps while
  helicopter physics exposed interpolated state. Airframe now exposes an
  interpolated pose, FixedWingModel renders/queries that visual pose, and
  PlayerCamera smooths fixed-wing follow, look target, and FOV by elapsed time.
  `npm run probe:fixed-wing` passes after the patch; the playtest checklist is
  still required before calling aircraft feel done.
- `npm run perf:compare` — PASS, 8/8 checks against refreshed baselines
- Targeted Cycle 2 soak/lifecycle tests — PASS
  - `npx vitest run src/systems/world/GameModeManager.test.ts src/systems/world/TicketSystem.test.ts scripts/perf-harness/perf-active-driver.test.js`
- Targeted terrain-contact regression tests — PASS on 2026-04-22
  - `npx vitest run src/systems/combat/CombatantMovement.test.ts src/systems/combat/CombatantLODManager.test.ts src/systems/combat/CombatantRenderInterpolator.test.ts src/systems/vehicle/airframe/terrainProbe.test.ts src/systems/vehicle/__tests__/fixedWing.integration.test.ts src/systems/vehicle/FixedWingModel.test.ts src/systems/airsupport/NPCFlightController.test.ts`
- Cycle 2 terrain-contact delta validation — PASS on 2026-04-22
  - `npm run validate:fast`
  - `npm run build`
  - `npm run probe:fixed-wing` (A-1, F-4, and AC-47 all passed takeoff,
    climb, approach, and handoff; AC-47 orbit hold also passed)
- Branch-local Cycle 2/6 airfield datum validation — PASS on 2026-04-23
  - targeted terrain and vehicle suites passed after adding shared airfield
    terrain-stamp datum coverage
  - `npm run lint` — PASS
  - `npm run typecheck` — PASS
- Cycle 2 closeout validation — PASS on 2026-04-23
  - targeted fixed-wing control/model tests passed after the AC-47 orbit
    sign fix
  - `npm run test:quick` — PASS (`242` files, `3769` tests)
  - `npm run build` — PASS
  - `npm run probe:fixed-wing` — PASS for A-1, F-4, and AC-47, including
    AC-47 orbit hold, approach setup, emergency bailout, and handoff
- Cycle 9/10 atmosphere, water, and A Shau fallback validation —
  PASS/WARN on 2026-04-24
  - `npm run typecheck` — PASS after the capture harness and atmosphere patch
  - `npx vitest run src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/WaterSystem.test.ts src/systems/navigation/NavmeshSystem.test.ts src/core/ModeStartupPreparer.test.ts` — PASS after sky-dome cloud coverage, disabled-water state, and explicit static-tiled nav changes
  - `npm run evidence:atmosphere` — PASS and rebuilt the perf
    bundle; current artifact is
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T07-05-19-071Z/`
  - WARN: all five modes produced ground, sky, and aircraft screenshots with
    `0` browser errors and terrain resident at the camera. All captured views
    report `cameraBelowTerrain=false` and `waterExposedByTerrainClip=false`.
    A Shau water is disabled and no longer reports underwater state. A Shau nav
    representatives now pass snap/connectivity/path checks, but `tabat_airstrip`
    remains steep and route/NPC movement still needs play-path validation. Open
    Frontier and combat120 now show lighter scattered-cloud forms, but cloud
    art is not final without human review. ReadPixels GPU-stall warnings, Open Frontier
    `airfield_main`, combat120, and UI/system budget warnings remain part of the
    release evidence.
  - `npm run lint` — PASS after the evidence/docs alignment
  - `npm run test:quick` — PASS (`243` files, `3787` tests)
  - `npm run build` — PASS, with the existing large-chunk Vite warning
- 2026-04-24 final local validation for the recovery commit — PASS/WARN
  - `npm run validate:fast` — PASS (`243` files, `3787` tests)
  - `npm run build` — PASS, with the existing large-chunk Vite warning
  - `npm run evidence:atmosphere` — PASS/WARN; all five modes reported
    `0` browser errors, cloud follow `true`, nav ready/connected `true`, cloud
    legibility `pass`, terrain ready at camera `true`,
    `cameraBelowTerrain=false`, and `waterExposedByTerrainClip=false`;
    artifact:
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T07-05-19-071Z/summary.json`
  - `npm run probe:fixed-wing` — PASS for A-1, F-4, and AC-47, including
    takeoff, climb, approach, in-flight bailout, and player/NPC handoff
  - `npm run check:states` — PASS; artifact
    `artifacts/states/state-coverage-2026-04-24T05-40-49-159Z.json`
  - `npm run check:hud` — PASS; artifact
    `artifacts/hud/hud-layout-report.json`
  - `npm run check:mobile-ui` — PASS; artifact
    `artifacts/mobile-ui/2026-04-24T05-43-18-934Z/mobile-ui-check`
  - `npm run validate:full` — PASS/WARN: unit/build stages passed, first
    combat120 capture failed one heap-recovery gate, standalone
    `npm run perf:capture:combat120` then passed with warnings, and
    `npm run perf:compare -- --scenario combat120` passed 8/8 checks
  - `npm run doctor`, `npm run deadcode`, and `git diff --check` — PASS
- Cycle 5 combat actor-height and billboard-scale validation — PASS on 2026-04-24
  - `npx vitest run src/systems/combat/CombatantMeshFactory.test.ts src/systems/combat/CombatantRenderer.test.ts src/systems/combat/CombatantBallistics.test.ts src/systems/combat/CombatantCombatEffects.test.ts src/systems/combat/CombatantHitDetection.test.ts src/systems/combat/ai/AILineOfSight.test.ts src/systems/combat/CombatantMovement.test.ts src/systems/helicopter/SquadDeployFromHelicopter.test.ts src/systems/player/PlayerRespawnManager.test.ts`
    — PASS, 190 tests after the billboard visual-scale patch
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
- `npm run doctor` — PASS
  - current shell: Node 24.14.1
  - repo target: `.nvmrc` says Node 24
- `npm run deadcode` — PASS
  - file-level removals, export hygiene, and retained historical script ignores
    are documented in `docs/rearch/deadcode-triage-2026-04-21.md`
- `npm audit --audit-level=moderate` — PASS
  - `npm audit fix` updated the ESLint tooling path for the `brace-expansion`
    advisory

## What Is Real Today

- The repo is healthy enough to build, smoke-test, run the mobile UI gate, and
  compare perf against refreshed baselines.
- The project is a playable combined-arms browser game, not just an engine
  shell.
- Helicopters and fixed-wing aircraft are both live in runtime.
- Atmosphere v1 is live: analytic sky, sky-tinted fog, day/night presets, ACES
  tone mapping before quantize, vegetation lighting parity, and procedural
  cloud coverage.
- The legacy static skybox path is gone: no `Skybox.ts`, no `NullSkyBackend`,
  and no `public/assets/skybox.png`.
- A Shau Valley is truthfully a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants.
- Performance governance is useful again after the 2026-04-20 baseline refresh,
  and the runtime/toolchain target is now aligned on Node 24.

## Current Drift

- Toolchain truth is aligned on Node 24. CI reads `.nvmrc`, and the refreshed
  2026-04-20 perf baseline memo was captured on Node 24.14.1.
- Local diagnostic scripts now route through the current Vite root path instead
  of the stale `/terror-in-the-jungle/?perf=1` local route.
- The fixed-wing browser probe is restored as `npm run probe:fixed-wing`; keep
  it maintained when `FixedWingModel` or airfield staging APIs change. It now
  validates takeoff, climb, AC-47 orbit hold, player/NPC handoff, and
  short-final approach setup.
- `npm run deadcode` is clean after removing unused files, accidental value
  exports, and unused type-only public surfaces.
- Deploy freshness is now part of the stabilization control plane:
  content-hashed Vite output builds into `/build-assets/`, stable public assets
  and GLBs revalidate through Cloudflare, and the service worker cache is bumped
  to `titj-v2-2026-04-21` so old `titj-v1` Cache Storage entries are dropped.
- Vite no longer runs `vite-plugin-compression`; `dist/` contains canonical
  assets only, while Cloudflare handles gzip/Brotli/Zstandard delivery according
  to visitor `Accept-Encoding` and zone rules.
- A Shau production runtime data now has the first R2 manifest path:
  `titj-game-assets-prod` contains content-addressed DEM/rivers objects,
  public `r2.dev` access is enabled for temporary validation, and
  `scripts/cloudflare-assets.ts` uploads, writes `dist/asset-manifest.json`,
  uploads manifest copies to R2, and validates size/content-type/cache/CORS.
  The custom R2 domain is still open, and production still needs a live Pages
  deploy after merge before the live A Shau gap can be called fixed.
- Cycle 2 terrain-contact work is active: nearby NPC hillside phasing/floating
  was traced to render Y smoothing treating >1m high-LOD terrain corrections as
  distant snaps, while low-cost/distant NPC paths could preserve stale altitude.
  Fixed-wing and air-support aircraft also used flat terrain probes for each
  airframe step. The code now has targeted fixes and tests, but needs human
  hillside/takeoff playtest before it is called signed off.
- Airfield terrain stamps now share one generated datum when
  compiled with the runtime height provider. This is a terrain-shaping fix, not
  a full terrain/collision runtime unification. `WorldFeatureSystem` and
  `FixedWingModel` still independently consume terrain for spawn/lineup, so
  Cycle 6 remains the owner for a proper terrain/collision/staging service.
- Atmosphere v1 is functional but not playtest-signed for readability. Visible
  clouds now come from a sky-dome pass in `HosekWilkieSkyBackend`; the old flat
  `CloudLayer` plane is hidden so it cannot create the hard divider or "one
  tile" horizon artifact. The sky shader now uses a seamless cloud-deck
  projection instead of azimuth-wrapped UVs. The 2026-04-24 capture proves sky
  coverage is wired and measurable in all five modes; Open Frontier and
  combat120 read as lighter scattered-cloud presets, not final cloud art. A
  Shau terrain evidence is DEM-backed,
  water is disabled without underwater fog, and no navmesh means startup stops
  instead of silently continuing. Terrain clipping and water rendering are not
  the same root cause: clipping can expose the global water plane, while water
  quality/hydrology remains a separate render backlog item. The atmosphere
  evidence harness now records `clipDiagnostics` for raw/effective terrain
  clearance, water-level clearance, and `waterExposedByTerrainClip`. A Shau
  navigation still needs Cycle 10 route and NPC movement validation against the
  explicit static-tiled nav path.
- Pointer-lock behavior is not yet a reliable in-app browser validation path.
  A proper FPS playtest should use a normal browser until the game exposes a
  drag-look/dev fallback and reports `pointerlockerror` instead of silently
  swallowing lock rejection.
- NPC/player combat verticality and billboard container scale now have one code
  contract, but not a human combat-feel sign-off. If playtest still reports
  oversized NPCs, head-high tracers, or shots passing above the player, inspect
  sprite alpha padding, weapon animation/tracer visuals, and live combat
  telemetry before changing `NPC_Y_OFFSET` or adding local ballistics offsets.
- `npm run perf:capture:frontier30m` now uses perf-only Open Frontier lifecycle
  overrides (`perfMatchDuration=3600`, `perfDisableVictory=1`) so the script is
  a non-terminal 30-minute soak again. The tracked 2026-04-20 baseline still
  predates this fix and must be refreshed on a quiet machine.
- Historical docs and archived briefs still describe the pre-cutover skybox and
  stale perf baseline state. Current docs should point at the stabilization
  cycle before new feature work.
- Locked nested agent worktrees have been removed. The 24 local `task/*`
  branches that mapped to merged GitHub PRs were deleted locally.

## Immediate Priorities

1. Run Cycle 10 fallback retirement: classify silent fallbacks as delete,
   explicit failure, dev-only recovery, or named compatibility shim. Continue
   A Shau rather than skipping it: required terrain/nav failures now stop
   startup, and representative-base connectivity has an artifact gate, but
   route/NPC movement quality is not signed off.
2. Use the latest Cycle 9 atmosphere/cloud evidence as the current visual
   baseline, but do not call clouds fixed until human playtest reviews the
   sky-dome clouds in all modes, especially Open Frontier/combat120 haze and
   the absence of horizon divider artifacts.
3. Run Cycle 11 airfield surface authority: stands, taxi routes, runway starts,
   terrain stamps, collision, and validation need one airfield surface truth.
4. Run Cycle 12 render/LOD/culling/water perf: airfield draw calls, triangles,
   collision registrations, LOS obstacles, water/hydrology visuals, object
   pop-in, and aircraft/building visibility before asset replacement.
5. Continue the Cycle 7 probe API audit: decide what broad `window.__engine`
   access remains acceptable and which probe paths should become narrow named
   diagnostic helpers.
6. Keep the full human playtest deferred until the current recovery run is
   complete. The final playtest must still cover grounded exits, in-flight
   bailout, helicopter entry/exit and rotor feel, AC-47 orbit, A Shau
   forward-strip taxi/takeoff, pointer-lock fallback, and keyboard/touch paths.
7. Re-run `npm run validate:full` and refresh the `frontier30m` baseline from a
   quiet-machine session; do not use captures from a background-game session as
   baseline-quality evidence.
8. Run the updated manual deploy workflow and rerun the prod header spot-check
   in `docs/DEPLOY_WORKFLOW.md` for both Pages and the R2 asset URL. Then
   replace the temporary `r2.dev` endpoint with a custom R2 asset domain.
9. Bridge local-vs-prod evidence before release: local perf-preview screenshots
   are not deployed truth until the live Pages URL serves the same
   `asset-manifest.json`, R2 DEM, service worker, WASM, and content-hashed build
   assets.
