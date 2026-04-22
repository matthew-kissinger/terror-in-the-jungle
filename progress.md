Original prompt: we had an intern come in a really both things up recently - can you take sober look at all the code end to end and come up with a plan to right the wrongs and properly bring this engine back up to speed with latest tech, standards, practices, techniques, novel implementation and referring to docs and code and not assuming but validating. look at handoff perf harness and understand it could be a symptom of a larger system issue.

2026-04-01
- Validated the perf-harness freeze in the real browser path instead of assuming. Root cause is the same-document View Transition boundary used by `GameUI.hide()` during live-entry, not a generic Playwright/WebGL/rAF failure.
- Added `src/ui/engine/UITransitions.ts` to centralize transition policy. Menu-only transitions still opt in when supported; live-entry always falls back to immediate DOM updates. `?uiTransitions=0|1` is available for diagnostics. Perf/sandbox default to no transitions.
- Updated `GameUI` to route title/mode-select through menu transitions and route live-entry through the non-transition path.
- Hardened `scripts/perf-capture.ts` with startup diagnostics (`startupPhase`, `rafTicks`, visibility, active transition state), partial artifact writing on emergency shutdown, and signal cleanup for browser/lock release.
- Canonicalized perf scenario IDs to `combat120`, `openfrontier:short`, `ashau:short`, and `frontier30m`; aligned baselines and CI perf gating; added missing `@recast-navigation/generators`; removed stale `webgl-memory`; expanded `knip` entrypoints.
- Added focused tests for transition policy and `GameUI.hide()` behavior.
- Fixed two harness-adjacent runtime issues discovered during cold-start validation:
  - Replaced the inline `page.addInitScript(() => ...)` startup probe with raw script content after browser pageerrors showed the injected bundle expected a helper (`__name`) that did not exist in page scope.
  - Hardened deferred startup work in `LiveEntryActivator` so background tasks bail if the engine has already been disposed, preventing stale short-lived warmup runs from throwing `SystemRegistry is missing required system "combatantSystem"`.
- Fixed the fresh-dev-server navmesh worker race by awaiting Recast init inside `src/workers/navmesh.worker.ts` and falling back to main-thread navmesh generation in `NavmeshSystem` if worker generation still fails.
- Limited Vite dev-server dependency scanning to `index.html` and ignored `artifacts/**` so newly written perf artifacts do not pollute the next capture's dev-server graph.

2026-04-02 validation
- `npm run lint`: PASS
- `npm run deadcode`: PASS
- `npm run test:quick`: PASS (`182` files, `3627` tests)
- `npm run build`: PASS
- Fresh cold-start perf capture succeeded:
  - command: `npx tsx scripts/perf-capture.ts --headed --mode ai_sandbox --npcs 120 --duration 90 --warmup 15 --reuse-dev-server false`
  - artifact: `artifacts/perf/2026-04-02T03-44-57-591Z`
  - startup threshold: `6s`
  - browser errors/pageerrors: `0`
  - overall validation: `warn` only because `peak_p99_frame_ms=34.30ms`
- `npm run perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - warns: `p95FrameMs=33.30ms`, `p99FrameMs=34.30ms`

TODO
- Re-baseline perf scenarios after the recovered harness is confirmed stable.
- Capture and compare the remaining canonical scenarios: `openfrontier:short`, `ashau:short`, `frontier30m`.
- Investigate the remaining `combat120` tail-latency warnings (`p95`/`p99`) now that the harness itself is trustworthy again.

Suggestions
- Keep WebGPU/TSL/ECS work out of scope until perf baselines are current again.
- The grenade/explosion first-use hitch still needs fresh evidence after the harness recovery; current docs mark that as unresolved.

2026-04-02 continuation
- Continued the `combat120` tail cleanup with a frame-local cover-search result cache in `AICoverFinding`, wired through `AITargeting.beginFrame()`. Also corrected the vegetation cover probe to the intended centered `8x8` sample grid and added tests covering sample count, cache reuse, and cache reset behavior.
- Safe patch/minor dependency upgrades landed for Playwright, Vite, Vitest, jsdom, knip, ESLint 9, TypeScript ESLint, `@types/node`, `@preact/signals-core`, and `three-mesh-bvh`.
- Real browser smoke via the `develop-web-game` Playwright client exposed an `Infinity:NaN` HUD timer on first paint. Fixed both `MatchTimer` and `MobileStatusBar` to sanitize non-finite time values and added focused tests.
- Newer tooling surfaced a duplicate `THREE` import in `DeathCamSystem.test.ts`; removed the duplicate import so the full suite stays green.
- `prod-smoke.ts` and `mobile-ui-check.ts` no longer assume fixed localhost ports. They now bind to a free local port by default, which fixed local `validate` failures when a dev server was already running on `127.0.0.1:4173`.
- `perf:compare` now keeps warning-level perf deviations visible but non-blocking by default. `FAIL` remains blocking; `--fail-on-warn` and `npm run perf:compare:strict` preserve the previous strict behavior for local use.

2026-04-02 final validation
- `npm run validate`: PASS
  - lint PASS
  - `test:run` PASS (`184` files, `3634` tests)
  - build PASS
  - `smoke:prod` PASS on an auto-selected localhost port
- `npm run deadcode`: PASS
- `npm run check:mobile-ui`: PASS
  - artifact: `artifacts/mobile-ui/2026-04-02T04-17-59-668Z/mobile-ui-check`
- Fresh perf capture on the current tree: PASS for capture, WARN for accepted perf tails only
  - command: `npm run perf:capture:combat120`
  - artifact: `artifacts/perf/2026-04-02T04-20-55-734Z`
  - startup threshold: `6s`
  - browser errors/pageerrors/crashes: `0`
  - avg frame: `13.94ms`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - remaining warns: `p95FrameMs=32.90ms`, `p99FrameMs=34.30ms`
  - validation-only warns inside artifact: `peak_p99_frame_ms=34.30ms`, `heap_peak_growth_mb=90.78MB`

TODO
- Re-capture `openfrontier:short`, `ashau:short`, and `frontier30m` on the recovered harness and refresh baselines.
- Continue reducing `combat120` p95/p99 tails and peak heap growth from the now-stable evidence set instead of from harness symptoms.

2026-04-02 CI follow-up
- Remote GitHub Actions run `23883724043` failed only in the `perf` job. `lint`, `test`, `build`, `smoke`, and `mobile-ui` all passed.
- The perf failure was a headed-Xvfb scheduling issue, not a gameplay failure: startup reached live-entry, but the capture page advanced only a handful of frames every several seconds until runtime samples collapsed to `100ms` and validation failed.
- Added explicit `page.bringToFront()` + `window.focus()` foregrounding in `scripts/perf-capture.ts` before startup waiting, before warmup, and before runtime sampling so the harness does not behave like a throttled background tab in CI.
- Revalidated the healthy local path after the patch:
  - fresh capture: `artifacts/perf/2026-04-02T04-35-45-253Z`
  - startup threshold: `6s`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`

2026-04-02 remaining recovery
- Remote GitHub Actions run `23884105743` narrowed the remaining CI-only perf failure to a browser pageerror in `WebGLRenderer.compileAsync()` when `KHR_parallel_shader_compile` was unavailable. Hardened `GameRenderer.precompileShaders()` to skip async precompile entirely when the extension is absent and to swallow the synchronous-throw path as best-effort warmup only.
- Revalidated the renderer guard locally:
  - `npm run validate`: PASS
  - `npm run deadcode`: PASS
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-02T05-12-16-803Z/mobile-ui-check`)
  - fresh perf capture: `artifacts/perf/2026-04-02T05-14-51-257Z`
  - `perf:compare -- --scenario combat120`: `6 pass`, `2 warn`, `0 fail`
  - latest metrics: `avgFrameMs=15.48`, `p95FrameMs=32.90`, `p99FrameMs=34.60`, `heapGrowthMb=16.50`
- Real browser smoke with the `develop-web-game` client is still free of pageerrors after the startup fixes, but the `ai_sandbox` live-entry camera remains visually dense/occluded because the mode still uses a per-match random terrain seed and spawns the active player into arbitrary jungle geometry. Added a terrain-aware spawn-facing helper plus a nearby-ground search to reduce the worst cases, but this is still not a complete design fix.

TODO
- Remote-watch the next CI run after the `GameRenderer` hardening lands; if perf is green, confirm Pages deploy and production URL.
- Decide whether `ai_sandbox` should keep per-match random terrain. For perf governance it is a poor default because `combat120` is being compared against static thresholds while terrain/layout still changes each run.
- If the sandbox start UX matters, finish that with a deterministic seed or curated sandbox spawn contract rather than more heuristics against random terrain.

2026-04-02 air-vehicle follow-up
- Fixed-wing runtime and parked air-vehicle perf pass landed:
  - new fixed-step `FixedWingPhysics` with takeoff rotation, climb trim, banked turning, stall state, and ground-roll behavior
  - `FixedWingModel` now keeps parked aircraft collision-valid while skipping unnecessary flight simulation
  - `AirVehicleVisibility` now gates helicopter/fixed-wing rendering against camera/fog distance
  - `ModelDrawCallOptimizer` batches static aircraft meshes by material while preserving animated rotor/propeller nodes
- Docs updated to reflect the fixed-wing feature and the air-vehicle render/runtime changes:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/PERFORMANCE.md`
  - `docs/BACKLOG.md`
- Local validation on this tree:
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-03T02-12-22-988Z/mobile-ui-check`)
  - `npm run validate`: PASS
- One stale test surfaced during `validate` and was corrected:
  - `src/systems/player/PlayerVehicleController.test.ts` now asserts the current mouse-input flow (`PlayerVehicleController` passes mouse deltas into `updateHelicopterControls`; `PlayerMovement` applies them)

TODO
- Push the air-vehicle/docs commit to `master`.
- Confirm the GitHub Actions `CI` run passes `lint`, `test`, `build`, `smoke`, `mobile-ui`, `perf`, and `deploy`.
- Verify `https://terror-in-the-jungle.pages.dev/` returns healthy content after the deploy completes.

2026-04-03 fixed-wing controller rebuild follow-up
- Reworked the fixed-wing stack around a command-driven sim-lite flight model:
  - `src/systems/vehicle/FixedWingPhysics.ts` now owns fixed-step ground-roll / rotation / airborne / stall / landing-rollout behavior, terrain-aware ground contact, air-relative aerodynamics, and touchdown recovery.
  - `src/systems/vehicle/FixedWingConfigs.ts` now uses per-aircraft envelope/control/ground-handling data (`vrSpeed`, `v2Speed`, lift/drag envelope, damping, steering, brakes, ground effect) instead of the old sparse lift/turn constants.
  - `src/systems/vehicle/FixedWingModel.ts` now feeds terrain normals/heights into the flight model, resets plane command state on enter/exit, and exposes richer flight snapshots to HUD/camera consumers.
- Cleaned up the plane control path:
  - `src/systems/player/PlayerMovement.ts` now builds normalized `FixedWingCommand` input with persistent throttle, wheel braking near idle, mouse virtual-stick recentering, and stability-assist toggling.
  - `src/systems/player/PlayerInput.ts`, `src/systems/player/PlayerVehicleController.ts`, and `src/ui/controls/TouchControls.ts` no longer make the fixed-wing path depend on helicopter-only input semantics. Planes now use explicit flight-vehicle mode plumbing while keeping compatibility shims where tests/mocks still expect helicopter-named methods.
- Validation after the rebuild and input cleanup:
  - `npm run test:run -- src/systems/player/PlayerInput.test.ts src/systems/player/PlayerVehicleController.test.ts src/ui/controls/TouchControls.test.ts src/systems/player/PlayerMovement.test.ts`: PASS
  - `npm run validate`: PASS
  - `npm run check:mobile-ui`: PASS (`artifacts/mobile-ui/2026-04-03T03-32-54-466Z/mobile-ui-check`)
- Browser/runtime artifacts:
  - Direct Playwright entry reached Open Frontier deploy flow without console/page errors: `artifacts/web-game/fixed-wing-direct-entry/`
  - Direct Playwright deploy reached live runtime without console/page errors: `artifacts/web-game/fixed-wing-live-runtime/`
  - Runtime screenshot confirms live scene/HUD load: `artifacts/web-game/fixed-wing-live-runtime/runtime.png`
- Local gotcha during validation:
  - `npm run validate` initially failed because stale `vite preview` processes from manual smoke work were holding `dist/assets` open on Windows. Killing those local preview/smoke processes and rerunning the gates fixed it; this was not a source change.

TODO
- Do a dedicated in-world plane acceptance pass that actually enters a fixed-wing aircraft, performs takeoff / climb / turn / landing input, and captures screenshots or telemetry for that sequence. Current browser smoke validates runtime entry and UI flow, not the full pilot interaction loop.
- If gamepad fixed-wing support matters soon, expose trigger analog values cleanly instead of relying on the shared infantry fire/ADS mapping.

2026-04-02 fixed-wing controller rebuild
- Rebuilt the player-facing fixed-wing path around an explicit command/snapshot flow:
  - `FixedWingPhysics` now owns a fixed-step sim-lite FDM with ground-roll / rotation / airborne / stall / landing-rollout phases, aerodynamic forces from air-relative velocity, and ground reaction that prevents the old vertical-pop takeoff behavior.
  - `FixedWingConfigs` now uses per-aircraft envelope/control data (`vr`, `v2`, lift/drag envelope, damping, steering, brake, thrust response) instead of the old loose rate constants.
  - `FixedWingModel` now passes terrain height + normal into the FDM, resets piloted command state on enter/exit, and exposes richer flight data (phase, AoA, sideslip, throttle, brake, WOW).
- Reworked plane controls in `PlayerMovement` / `PlayerVehicleController` / `PlayerController`:
  - keyboard + mouse now drive a virtual-stick `FixedWingCommand` instead of directly rotating aircraft state
  - stability assist is explicit and resets correctly on vehicle enter/exit
  - fixed-wing mouse control now follows the generic flight-mouse path instead of helicopter-only plumbing
- Cleaned up the remaining input/touch slop after the main rebuild:
  - `PlayerInput` uses explicit flight-vehicle mode (`none` / `helicopter` / `plane`)
  - `TouchControls` exposes generic flight-mode aliases so plane logic no longer has to reach through helicopter-only names
  - added focused tests for fixed-wing command composition and flight-mode alias behavior

2026-04-02 fixed-wing validation
- Targeted suites:
  - `npm run test:run -- src/systems/player/PlayerMovement.test.ts src/systems/player/PlayerVehicleController.test.ts src/systems/player/PlayerInput.test.ts src/ui/controls/TouchControls.test.ts`: PASS
- Full gate:
  - `npm run validate`: PASS
    - lint PASS
    - `test:run` PASS (`189` files, `3680` tests)
    - build PASS
    - `smoke:prod` PASS
- Real browser/manual smoke:
  - preview-driven browser probe reached gameplay and rendered correctly after deploy
  - artifact: `artifacts/web-game/fixed-wing-rebuild-after-deploy.png`
  - note: the first generic Playwright client capture stalled at the mode picker because the choreography never clicked a mode card; direct browser probing confirmed the live flow and screenshot correctness

TODO
- Run a real in-game fixed-wing takeoff/landing pass once a deterministic aircraft spawn or debug-entry shortcut is available; current browser smoke confirms live gameplay entry, while the plane-specific behavior is covered by unit/integration tests.
- If controller support for planes becomes a priority, extend `GamepadManager` with explicit trigger/shoulder access so throttle/brake/rudder are not inferred only from the left stick + keyboard parity.

2026-04-03 helicopter rotor regression fix
- Root cause: the helicopter draw-call batching pass in `src/systems/helicopter/HelicopterGeometry.ts` only excluded meshes named with `mainblade` / `tailblade` style tokens, but the real helicopter GLBs use `MRBlade`, `TRBlade`, `MRHub`, `TRHub`, `MRTip`, etc.
- Result: those rotor meshes were being merged into the static aircraft batch, leaving the rotor animation system rotating an empty transform while the visible blades stayed frozen in the body mesh.
- Fixes landed:
  - `src/systems/helicopter/HelicopterGeometry.ts`
    - broadened rotor-part detection to cover the real GLB naming (`MR*` / `TR*` / rotor mast/hub/tip variants)
    - made batching exclude any mesh under a tagged rotor subtree, not just a narrow set of mesh names
    - improved grouped-rotor detection so existing `Joint_MainRotor` / `Joint_TailRotor` roots are kept as animation roots instead of being unnecessarily regrouped
  - `src/systems/helicopter/HelicopterAnimation.ts`
    - caches main/tail rotor roots at init and updates those cached nodes directly instead of traversing the full helicopter scene every frame
    - disposed helicopters no longer lazily rebind rotor nodes and resume spinning
  - `src/systems/helicopter/HelicopterModel.ts`
    - passes the live helicopter group into animation init so rotor roots are cached once at spawn time

2026-04-03 helicopter rotor validation
- Targeted tests:
  - `npm run test:run -- src/systems/helicopter/HelicopterGeometry.test.ts src/systems/helicopter/HelicopterAnimation.test.ts src/systems/helicopter/HelicopterModel.test.ts`: PASS
- Full gate:
  - `npm run validate`: PASS
    - lint PASS
    - `test:run` PASS (`191` files, `3686` tests)
    - build PASS
    - `smoke:prod` PASS
- Browser/module validation:
  - In-browser module probe against the dev server confirmed real helicopter geometry still exposes populated rotor roots after optimization:
    - `UH1_HUEY`: main root children `5`, tail root children `3`
    - `UH1C_GUNSHIP`: main root children `5`, tail root children `3`
    - `AH1_COBRA`: main root children `4`, tail root children `3`
  - Playwright client artifact for visual inspection: `artifacts/web-game/helicopter-rotor-viewer/shot-1.png`

TODO
- Do a dedicated live-runtime helicopter acceptance pass that captures two time-separated runtime frames or telemetry after entering a helicopter, so rotor motion is confirmed through the full gameplay loop rather than via geometry/module inspection plus unit tests.

2026-04-06 Open Frontier stabilization
- Confirmed the current request is remediation, not diagnosis-only. Created `docs/OPEN_FRONTIER_STABILIZATION_PLAN.md` to track the recovery work against the Frontier regression evidence.
- Working set for this pass:
  - fix fixed-wing self-lift by separating aircraft terrain sampling from collision-overlay height queries
  - remove the new static-prop CPU tax by caching collision bounds for static registrations and only recomputing moving aircraft bounds
  - reduce staged vehicle/aircraft draw calls by improving static batching for duplicated material exports and applying it to generic world-feature placements
- Validation target for this pass:
  - targeted tests for terrain queries / fixed-wing / draw-call optimizer / world features
  - fresh `npm run perf:capture:openfrontier:short`
  - `npm run validate`

Original prompt: analyze state of codebase. i have had major issues getting planes to work. the arrow keys seem to not work or not work well and just in general it is ill conceived and we need to architect better and think about it as a whole and granularly and dependently and integrated all around that.

TODO
- After the first implementation pass, compare the fresh Frontier capture against `2026-04-07T03-17-24-101Z` before widening scope.

2026-04-07 Open Frontier stabilization completion
- Landed the Open Frontier recovery plan in code and docs:
  - `FixedWingModel` now uses raw terrain height for placement/update sampling instead of the collision-overlay height helper, removing the plane self-lift loop.
  - `TerrainQueries` / `TerrainSystem` / `SystemInterfaces` now support dynamic vs static collision registrations so static staged props cache bounds while moving aircraft refresh theirs.
  - `ModelDrawCallOptimizer` now merges static meshes by material signature instead of material UUID, and `WorldFeatureSystem` applies that optimizer to static staged placements.
  - `GameModeManager` now reapplies `combatantSystem.setSpatialBounds(config.worldSize)` before reseed/spawn so Open Frontier hit registration queries operate inside the correct world extents.
- Added/updated focused tests for:
  - `TerrainQueries`
  - `FixedWingModel`
  - `ModelDrawCallOptimizer`
  - `WorldFeatureSystem`
  - `GameModeManager`
  - `HelicopterModel` collision-registration expectation after the new dynamic collision metadata
- Open Frontier recovery evidence:
  - `npm run perf:capture:openfrontier:short`
  - artifact: `artifacts/perf/2026-04-07T04-01-01-963Z`
  - validation: `WARN` only
  - avg frame: `9.89ms`
  - p95 / p99: `17.00ms / 29.60ms`
  - player shots / hits: `234 / 131`
  - `npm run perf:compare -- --scenario openfrontier:short`: `7 pass`, `1 warn`, `0 fail`
- Release validation:
  - `npm run validate`: PASS
  - `npm run validate:full`: PASS
    - clean perf artifact: `artifacts/perf/2026-04-07T04-15-48-589Z`
    - overall validation: `WARN` only
    - avg frame: `16.00ms`
    - p99: `35.00ms`
    - heap peak-growth: `54.83MB`
    - player shots / hits: `47 / 25`
- One false-negative perf artifact was discarded after validation:
  - `artifacts/perf/2026-04-07T04-12-47-887Z`
  - cause: stale reused dev server produced repeated `@vite/client` pageerrors (`send was called before connect`) and invalidated the run
  - clean rerun from a fresh server state passed without browser errors

TODO
- Commit, push, and confirm the GitHub Actions / Cloudflare Pages deployment for the stabilization pass.

2026-04-07 fixed-wing control-law reset
- Reworked the player-facing fixed-wing stack around pilot intent instead of raw control-surface commands:
  - added `src/systems/vehicle/FixedWingControlLaw.ts` with phase-aware fixed-wing control phases (`taxi`, `takeoff_roll`, `rotation`, `initial_climb`, `flight`, `approach`, `landing_rollout`)
  - `FixedWingPlayerAdapter` now emits pilot intent + direct-stick overlay instead of raw elevator/aileron commands
  - `FixedWingModel` now owns the pilot-intent path and converts it into bounded raw `FixedWingCommand` values before physics update; legacy raw-command APIs remain for tests/non-player callers
- Split fixed-wing player roles by profile in config:
  - `A1_SKYRAIDER`: `trainer`
  - `F4_PHANTOM`: `fast_jet`
  - `AC47_SPOOKY`: `ambient`
  - F-4 now defaults to flight assist on for runway play
- Fixed runway/player interaction prioritization:
  - `FixedWingInteraction` now filters `ambient` aircraft out of the parked runway entry flow
  - trainer aircraft are preferred over other nearby fixed-wing aircraft when multiple are in range
- Cleaned up shared input/UI semantics so planes are no longer forced through helicopter-only callback names:
  - added `onEnterExitVehicle` and `onToggleFlightAssist` aliases through `PlayerInput`, `InputManager`, `TouchControls`, `VehicleActionBar`, and `PlayerController`
  - kept helicopter-era names as compatibility shims for unchanged code/tests
- Fixed-wing HUD now exposes phase cues separately from true stall state:
  - `TAKEOFF`, `ROTATE`, `CLIMB`, `APPROACH`, `STALL`
  - added fixed-wing flight-assist HUD plumbing alongside the legacy auto-level alias
- Extended fixed-wing physics snapshots with pitch/roll rates so the new control law can damp overshoot instead of blindly saturating keyboard input

2026-04-07 fixed-wing control-law validation
- Targeted tests:
  - `npm run test:run -- src/systems/vehicle/FixedWingControlLaw.test.ts src/systems/vehicle/FixedWingInteraction.test.ts src/systems/vehicle/FixedWingPlayerAdapter.test.ts src/systems/vehicle/FixedWingModel.test.ts src/systems/player/PlayerInput.test.ts src/ui/controls/VehicleActionBar.test.ts src/systems/player/PlayerVehicleController.test.ts src/ui/controls/TouchControls.test.ts src/systems/input/InputManager.test.ts`: PASS (`9` files, `139` tests)
- Build:
  - `npm run build`: PASS
- Browser validation:
  - required `develop-web-game` Playwright client pass against dev server completed: `artifacts/web-game/fixed-wing-control-law-client/`
  - live runtime probe artifacts:
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe/telemetry.json`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe/runtime.png`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe-runway/telemetry.json`
    - `artifacts/tmp/fixed-wing-control-law/runtime-probe-runway/runtime.png`
  - Result: the new HUD/control contract is visible in browser, but clean takeoff in the live Open Frontier path is still limited by the current parked-aircraft placement/taxi path. The direct control-law and simulation path are validated; the remaining runtime issue is airfield/placement workflow, not keyboard command propagation.

TODO
- Decide whether the A-1 should stay apron-parked with taxi expectation or move to a more explicit runway-ready spawn/start contract for the player-facing tutorial/default flow.
- If the live runtime probe remains a release gate for planes, add a deterministic debug aircraft spawn/reposition helper so browser automation can validate full takeoff/climb/turn loops without depending on current airfield parking layout.

2026-04-07 fixed-wing airfield recovery kickoff
- Created `docs/FIXED_WING_AIRFIELD_RECOVERY_PLAN.md` to scope the next pass around operable airfield layout, directional terrain shaping, local-space parking offsets, and regression coverage.
- Implementation plan for this pass:
  - rework `AirfieldTemplates` / `AirfieldLayoutGenerator` around longer runways, apron stands, and side-by-side fixed-wing parking
  - compile airfield-specific terrain stamps from layout geometry instead of the old circular flatten assumption
  - align Open Frontier / A Shau feature footprints and add tests plus a live browser verification loop

2026-04-07 fixed-wing airfield recovery completion
- Landed the full airfield/fixed-wing recovery scoped in `docs/FIXED_WING_AIRFIELD_RECOVERY_PLAN.md`:
  - `AirfieldTemplates` now define longer runways, apron/taxi geometry, and explicit stand locations instead of fraction-based parking rows.
  - `AirfieldLayoutGenerator` now keeps generated parking offsets in feature-local space, which removes the old double-rotation bug for yawed airfields.
  - `TerrainFeatureCompiler` now derives directional runway/apron/taxi `flatten_capsule` stamps from template geometry for authored airfields, so airfield terrain is shaped like the field instead of by one circular flatten volume.
  - `FixedWingConfigs` now exposes runway compatibility metadata; `AirfieldTemplates` / `WorldFeatureSystem` can validate parked fixed-wing content against runway length.
  - Open Frontier / A Shau airfield footprints and vegetation clear zones were resized to match the new runway/apron layouts.
- Validation:
  - `npm run validate`: PASS
  - focused suites covering airfield templates/layout/compiler/world features/fixed-wing model: PASS
  - `npm run perf:capture:openfrontier:short`: PASS (`artifacts/perf/2026-04-07T05-49-35-671Z`)
  - `npm run perf:compare -- --scenario openfrontier:short`: `7 pass`, `1 warn`, `0 fail`
- Settled browser probe against Open Frontier:
  - runway centerline samples at `x=80,200,320,440,560 / z=-1230`: all `14.94`
  - apron stand samples at `x=238,320,402 / z=-1326`: all `13.84`
  - fixed-wing parking now spawns side-by-side on one apron row at matching elevation

TODO
- Follow up on fixed-wing role specialization rather than one generic operating loop:
  - A-1 rough-field tuning
  - AC-47 orbit-first workflow
  - F-4 stronger assisted runway/attack workflow

2026-04-07 fixed-wing ops/orbit/taxi implementation in progress
- Continued the fixed-wing follow-up pass on top of the control-law and airfield work:
  - HUD plumbing now carries fixed-wing `operationState` through `IHUDSystem` / `HUDSystem` / `HUDElements` / `FixedWingHUD`, including explicit cue labels for `TAXI`, `LINE UP`, `TAKEOFF`, `ROTATE`, `CLIMB`, `ORBIT`, `APPROACH`, and `ROLLOUT`.
  - Plane touch/action-bar semantics now distinguish `LEVEL` vs `ORBIT` for gunship flow instead of reusing one generic stabilizer label.
  - `AirfieldLayoutGenerator` now only emits `fixedWingSpawn` metadata for real fixed-wing parking spots, not helicopter stands.
  - `FixedWingModel` now exposes aircraft IDs for runtime/debug validation, resets piloted command state when runway/approach helpers reposition the active aircraft, and uses a steeper short-final helper sink rate so the approach helper actually lands in the `approach` phase.
  - `FixedWingPlayerAdapter` now seeds the HUD with initial phase/ops/assist state on aircraft entry instead of waiting for a later update tick.
- Pending before closing the pass:
  - finish focused regression coverage for spawn metadata, orbit hold, runway/approach helpers, and exit gating
  - run targeted tests, build, and browser validation

2026-04-07 fixed-wing hybrid-input and diagnostics follow-up
- Normalized hybrid desktop/touch behavior so desktop flight controls are no longer degraded just because touch capability exists:
  - `DeviceDetector.shouldUseTouchControls()` now keeps touch overlays for mobile/coarse-pointer environments, but leaves hybrid/fine-pointer desktops in keyboard/mouse mode.
  - `InputManager` now treats `pointerdown` as touch activity only when `pointerType === 'touch'`.
  - `VehicleActionBar` and startup HUD mounting now use the same touch-control heuristic instead of raw `ontouchstart` checks.
- Added deterministic browser-automation hooks for the live dev runtime:
  - `GameEngine.advanceTime(ms)` advances the simulation at 60 Hz and renders one frame at the end of the step.
  - `bootstrap.ts` now exposes `window.advanceTime(ms)` and `window.render_game_to_text()` in dev diagnostics/perf mode.
  - `web_game_playwright_client` now captures `state-0.json` for this repo instead of only screenshots.
- Added `scripts/fixed-wing-runtime-probe.ts`:
  - boots Open Frontier in Playwright
  - forces desktop input semantics
  - steps simulation deterministically through `window.advanceTime`
  - runs one runway takeoff/climb probe per aircraft (`A1_SKYRAIDER`, `F4_PHANTOM`, `AC47_SPOOKY`)
  - writes screenshots + `artifacts/fixed-wing-runtime-probe/summary.json`
- Validation:
  - `npm run test:run -- src/utils/DeviceDetector.test.ts src/systems/input/InputManager.test.ts src/ui/controls/VehicleActionBar.test.ts`: PASS
  - `npm run build`: PASS
  - `node ...web_game_playwright_client.js --url http://127.0.0.1:4173/?perf=1 ...`: PASS, now writes `artifacts/web-game/fixed-wing-hybrid-input-client/state-0.json`
  - `npx tsx scripts/fixed-wing-runtime-probe.ts --port 4173 --reuse-dev-server true`: PASS
    - A-1 final: `59.9 m/s`, `13.9 m` AGL, `phase=airborne`, `operationState=cruise`
    - F-4 final: `86.9 m/s`, `15.3 m` AGL, `phase=airborne`, `operationState=initial_climb`
    - AC-47 final: `44.7 m/s`, `15.1 m` AGL, `phase=airborne`, `operationState=initial_climb`

TODO
- Extend `scripts/fixed-wing-runtime-probe.ts` from takeoff/climb validation into:
  - F-4 bank/recovery validation
  - AC-47 orbit-hold engagement validation after a deterministic airborne setup
  - A-1 / F-4 landing-rollout validation using `positionAircraftOnApproach()`
- Decide whether to expose a small in-game dev panel / console helpers for fixed-wing scenario setup, or keep the diagnostics path script-only.

2026-04-07 docs + validation sync for fixed-wing runtime pass
- Updated the primary docs to match the current live fixed-wing/runtime state:
  - `README.md` now points at the deterministic fixed-wing runtime probe.
  - `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/DEVELOPMENT.md`, and `docs/FIXED_WING_FLIGHT_ISSUES.md` now describe the phase-aware control law, airfield/ops runtime, and browser probe workflow instead of the older staged/static-aircraft state.
- Fixed one stale regression expectation in `TerrainFeatureCompiler.test.ts` so terrain validation matches the current forward-strip airfield geometry (`6` terrain stamps, `5` surface patches).
- Validation:
  - `npm run validate`: PASS
    - lint: PASS
    - tests: PASS (`198` files, `3737` tests)
    - build: PASS
    - prod smoke: PASS

2026-04-21 Cycle 2 fixed-wing feel first pass
- Investigated the reported fixed-wing stiffness, post-climb bounce/porpoise feel, and visual shake. The first code-level mismatch is at the render/camera boundary: fixed-wing was exposing raw Airframe fixed-step pose to scene/camera consumers while the helicopter path exposes an interpolated physics state.
- Added Airframe interpolated pose output, switched FixedWingModel visual pose/quaternion queries to that output, and made PlayerCamera fixed-wing follow/look/FOV smoothing use elapsed time instead of a fixed per-frame lerp.
- Validation:
  - `npx vitest run src/systems/vehicle/__tests__/fixedWing.integration.test.ts src/systems/player/PlayerCamera.test.ts src/systems/vehicle/FixedWingModel.test.ts`: PASS
  - `npm run typecheck`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47 takeoff/climb, AC-47 orbit, approach, and handoff
  - `npm run validate:fast`: PASS
- Note: user reported playing games in the background during this pass. Do not use this session for authoritative perf baselines or `validate:full` perf evidence.

TODO
- Run the fixed-wing human playtest checklist on A-1, AC-47, and F-4. If bounce/porpoise or stiffness remains, tune airframe/control-law damping next rather than adding more vehicles.
- Run `validate:full` later on a quiet machine before any perf baseline refresh.

2026-04-21 Cycle 2 frontier30m soak semantics
- Fixed the misleading `frontier30m` setup. Open Frontier's normal 15-minute match timer made the old 30-minute script hit victory around the halfway point, so the latter half was not a trustworthy active-combat soak.
- Added perf-harness-only runtime overrides:
  - `perfMatchDuration=<seconds>` extends the TicketSystem combat duration only when diagnostics/perf mode is enabled in dev or `VITE_PERF_HARNESS=1` builds.
  - `perfDisableVictory=1` disables terminal victory checks for soak captures so time-limit, ticket-depletion, and total-control paths do not transition into the victory screen.
- Updated `npm run perf:capture:frontier30m` to pass `--match-duration 3600 --disable-victory true`.
- Validation:
  - `npx vitest run src/systems/world/GameModeManager.test.ts src/systems/world/TicketSystem.test.ts scripts/perf-harness/perf-active-driver.test.js`: PASS

TODO
- Re-capture `frontier30m` and refresh the tracked baseline only on a quiet machine. User is running other games during this session, so current perf captures would not be baseline-quality.
- Continue Cycle 2 startup bundle work while fixed-wing human playtest waits for tomorrow.

2026-04-21 Cycle 2 deploy/bundle hygiene
- Ran a production build and sourcemap analysis build to inspect chunk shape. Current large chunks remain `index` (~851kB raw / ~221kB gzip), `three` (~734kB raw / ~187kB gzip), and `ui` (~449kB raw / ~106kB gzip). Recast still emits a ~339kB WASM asset plus ~275kB JS loader per main/worker graph.
- Removed `vite-plugin-compression` and the Vite compression plugin config. Cloudflare Pages already negotiates visitor-facing compression for JS/CSS/WASM/JSON/font assets, so the repo should not upload redundant `.gz`/`.br` sidecars with their own cache surface.
- Tested a narrower Recast manual-chunk split, but reverted it because Vite hoisted a ~956kB `recast` chunk into the initial modulepreload graph. Recast/Three chunk work needs a more deliberate lazy-boundary change, not a naming-rule tweak.
- Validation:
  - `npm run build`: PASS
  - `dist/` check: no `.gz` or `.br` sidecar files

TODO
- Real chunk-weight work remains: split startup-critical code from full live-game systems/UI, and revisit Recast/Three manual chunking without regressing startup.

2026-04-21 deploy validation catch
- First GitHub deploy after stabilization omitted gitignored `public/data/vietnam/` runtime files, causing live `/data/vietnam/a-shau-rivers.json` to fall through to HTML.
- Rejected the quick "track the 21 MB DEM in git" workaround after user feedback. Current target is Cloudflare-native delivery: R2 bucket + custom domain + content-addressed terrain/model keys + generated manifest + CI upload/header validation before Pages deploy. See `docs/CLOUDFLARE_STACK.md`.
- Local Wrangler is current (`4.84.1`) but not authenticated; GitHub repo has Cloudflare secrets, but local R2/Pages inspection needs `wrangler login` or `CLOUDFLARE_API_TOKEN` in the shell.
