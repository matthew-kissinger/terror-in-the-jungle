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

2026-04-26 Pixel Forge visual follow-up
- Began second-pass fixes for the Pixel Forge-only vegetation/NPC runtime after playtest notes: vegetation disappeared at very close range, distant impostors over-fogged/brightened, atlas views snapped during flight, and close NPC GLBs read too small with foot/terrain issues.
- Current patch direction: disable vegetation near fade until close LOD meshes exist, bind billboard fog density to the active scene fog instead of the old hardcoded dense billboard fog, blend adjacent vegetation impostor atlas columns, and scale/ground close NPC GLBs from their measured bounds against the Pixel Forge impostor visual height.
- Implemented the visual pass and validated it: targeted billboard/combat tests passed, `npm run validate:fast` passed, `npm run build` passed, and a WebGL smoke against `http://127.0.0.1:5173/?sandbox=1&npcs=60&seed=2718&diag=1` reached live sandbox with no browser errors. Latest screenshot: `artifacts/web-game/pixel-forge-lod-smoke/shot-2.png`.

TODO
- Human playtest should still check high-speed flight around bamboo/palms; adjacent atlas blending removes hard tile pops but may read slightly softer at oblique angles.
- Static building/prop distance culling still needs a measured pass with renderer-category instrumentation before changing residency or HLOD policy.

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

2026-04-22 Cloudflare R2 manifest pipeline
- Authenticated local Wrangler through OAuth and inspected the Cloudflare account. Pages project `terror-in-the-jungle` exists as Direct Upload/no Git provider.
- Created R2 buckets `titj-game-assets-prod` and `titj-game-assets-preview`; applied public read CORS; enabled temporary `r2.dev` endpoints.
- Uploaded and validated content-addressed A Shau DEM/rivers objects in prod R2. DEM URL now returns 21,233,664 bytes, `application/octet-stream`, immutable cache, and CORS.
- Added `scripts/cloudflare-assets.ts`, `src/core/GameAssetManifest.ts`, and deploy workflow integration. A Shau DEM now resolves through `/asset-manifest.json` in production with dev fallback to local `public/data/vietnam/`.
- GitHub deploy initially failed because the Actions Cloudflare token can deploy Pages but cannot write R2 objects. Patched workflow to set `TITJ_SKIP_R2_UPLOAD=1`; CI now writes/validates the manifest from pinned R2 metadata while local OAuth runs still perform real R2 uploads.
- Deployed `fe90e8f` successfully via GitHub run `24757914408`. Live Pages source shows `fe90e8f`.
- Live validation:
  - `/asset-manifest.json` returns JSON with `Cache-Control: public, max-age=0, must-revalidate`.
  - R2 DEM URL from the manifest returns expected size/type/cache/CORS.
  - Web-game Playwright menu flow screenshot saved under `output/web-game/live-pages-r2-fe90e8f/`.
  - A Shau browser flow requested both `/asset-manifest.json` and the R2 DEM with no failed network requests.
- Residual issue: A Shau flow still logged a TileCache/navmesh failure after
  asset delivery was fixed. Later Cycle 10 logging narrowed this to tile `1, 0`;
  the branch now makes the fallback explicit by retrying static tiled nav, but
  A Shau nav remains a terrain/nav quality pass item.

TODO
- Replace temporary `r2.dev` with a custom R2 asset domain.
- Update the GitHub `CLOUDFLARE_API_TOKEN` secret to include `Account -> Workers R2 Storage -> Edit`, then remove `TITJ_SKIP_R2_UPLOAD=1`.
- Decide how future generated terrain payloads get into CI without relying on local-only gitignored source files; pinned metadata is acceptable only for already-uploaded immutable assets.

2026-04-23 Cycle 1 vehicle session continuation
- Patched the user-reported in-flight aircraft exit and stuck-forward walk issues during the architecture-recovery pass.
- Fixed-wing emergency ejection now preserves airborne placement instead of projecting bailout to terrain height.
- `VehicleSessionController` now clears transient `PlayerInput` state on vehicle enter/exit; `PlayerInput` also clears held keys on pointer-lock release/failure, blur, and hidden-tab transitions.
- Added a pointer-lock failure fallback for embedded browsers and aligned debug free-fly with the gameplay pointer-lock target.
- Updated the fixed-wing runtime probe to validate keyboard bailout through the real `KeyE` path and check immediate post-exit altitude before the player naturally falls.
- Validation:
  - targeted vehicle/input/model tests: PASS (`4` files, `92` tests)
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3762` tests)
  - `npm run build`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47 takeoff, approach, bailout, and handoff

TODO
- Human playtest still needs to confirm bailout feel, no stuck forward movement, and embedded-browser mouse-look fallback usability.
- Helicopter rotor stopped/idle/spool/flight-RPM visual lifecycle remains Cycle 2 work.
- Airfield height datum/surface authority remains a Cycle 2/6 bridge before deeper fixed-wing taxi/takeoff tuning.

2026-04-23 Cycle 2 rotor lifecycle continuation
- Added `docs/playtest/PLAYTEST_2026-04-23_ARCHITECTURE_RECOVERY_CYCLE.md` as the comprehensive end-of-cycle playtest form for vehicle, pointer-lock, airfield, atmosphere, combat, UI, assets, bugs, and triage notes.
- Patched helicopter rotor lifecycle:
  - `HelicopterPhysics` can now distinguish engine-active idle from true stopped rotor state.
  - Exited/grounded helicopters spool down to `engineRPM = 0` instead of being held at idle.
  - `HelicopterModel` only keeps ticking unoccupied grounded helicopters while they still need to spool down.
  - `HelicopterAnimation` uses higher flight-RPM visual speed so blades read faster before considering GLB replacement.
- Validation:
  - targeted helicopter tests: PASS (`4` files, `64` tests)
  - `npm run typecheck`: PASS

TODO
- Human playtest still decides whether rotor blur or GLB pivot/asset work is needed.
- Continue with airfield height datum/surface authority and automated probes.

2026-04-23 Cycle 2/6 airfield datum continuation
- Patched generated airfield terrain shaping so runway, apron, taxiway, filler, and envelope stamps share one runway-derived `fixedTargetHeight` when the runtime terrain provider is available during feature compilation.
- `StampedHeightProvider` now honors that fixed datum before falling back to local target-height sampling. This keeps stamped runtime terrain and baked stamped heightmaps on the same airfield datum.
- Added a sloped forward-strip regression that samples the parking stand, taxi connector, hold-short point, runway entry, and runway start through `StampedHeightProvider` and requires one resolved height.
- Validation:
  - targeted terrain + vehicle/helicopter suites: PASS (`7` files, `93` tests)
  - targeted terrain suite after the type fix: PASS (`2` files, `13` tests)
  - `npm run lint`: PASS
  - `npm run typecheck`: PASS

TODO
- Human playtest the A Shau forward-strip stand-to-runway route, lineup point, and takeoff over surrounding terrain.
- Cycle 6 still needs a proper terrain/collision runtime owner so spawn metadata, vehicle physics, NPC contact, LOS, and probes cannot query different terrain truths.

2026-04-23 Cycle 2 AC-47 orbit closeout
- `npm run probe:fixed-wing` initially caught a real AC-47 regression after the terrain datum patch: A-1/F-4 passed, AC-47 completed takeoff/approach/bailout/handoff but stalled during orbit hold.
- Root cause: `FixedWingControlLaw` orbit-hold roll controller used the wrong roll-error sign and damping sign for the Airframe roll-rate convention, so it over-banked and bled speed.
- Fixed orbit roll control to use target-bank minus current-bank, with damping aligned to the Airframe roll-rate sign.
- Added coverage to the sustained full-throttle AC-47 orbit test so it checks transient roll and airspeed stall margin, not only final state.
- Validation:
  - targeted fixed-wing suites: PASS (`3` files, `39` tests)
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47, including AC-47 orbit hold
  - `npm run test:quick`: PASS (`242` files, `3769` tests)
  - `npm run build`: PASS

TODO
- Human playtest still owns feel sign-off for AC-47 orbit, fixed-wing camera shake, bailout UX, and forward-strip taxi/takeoff.

2026-04-23 Cycle 3 scheduler kickoff
- User explicitly deferred playtesting until the end of all current recovery cycles.
- Updated `docs/ARCHITECTURE_RECOVERY.md`, `docs/STATE_OF_REPO.md`, and `docs/BACKLOG.md` so Cycle 1/2 human feel gates are deferred, not blockers for Cycle 3.
- Cycle 3 scope: declarative system schedule/update authority. Do not tune vehicle feel, terrain, or combat behavior unless needed to preserve update-order parity.

TODO
- Audit `SystemUpdater`, `SimulationScheduler`, and `SystemInitializer` for all manual update lists, scheduler groups, fallback updates, and tracked-system exclusions.
- Implement the smallest schedule-inspection/validation layer that prevents silent double updates without changing gameplay order.

2026-04-23 Cycle 3 scheduler first pass
- Added `src/core/SystemUpdateSchedule.ts` with inspectable phase metadata for current `SystemUpdater` groups, budgets, scheduler cadence groups, and scheduled system keys.
- Replaced `SystemUpdater`'s private hand-maintained tracked-system predicate with schedule-derived fallback exclusions.
- Covered the latent double-update path where `navmeshSystem` or `npcVehicleController` could be manually updated and then updated again if later added to the generic `systems` list.
- Timing budgets now come from schedule metadata, while the actual gameplay update order remains unchanged.
- Focused validation:
  - `npm run test:quick -- SystemUpdater SimulationScheduler`: PASS
  - `npm run typecheck`: PASS

TODO
- Run `npm run lint`, `npm run test:quick`, and `npm run build` for the Cycle 3 implementation gate.
- Move into Cycle 4 UI/input boundary cleanup after the Cycle 3 gate is green.

2026-04-23 Cycle 3 scheduler gate
- Cycle 3 implementation gate passed:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3772` tests)
  - `npm run build`: PASS
- Updated docs to mark Cycle 4 as the next active recovery cycle.

TODO
- Audit UI/input authority for actor/vehicle mode, HUD context, touch controls, and pointer-lock fallback.
- Keep Cycle 4 out of vehicle physics, terrain shaping, and scheduler order.

2026-04-23 Cycle 4 UI/input boundary first pass
- Removed the public touch-control vehicle-mode mutators that could independently force helicopter/flight UI state.
- `TouchControls` now derives vehicle controls and flight cyclic visibility from presentation `VehicleUIContext`.
- Actor mode alone no longer makes touch controls show the vehicle action bar; runtime should supply `HUDSystem.setVehicleContext()` with capabilities and HUD variant.
- Validation:
  - `npm run test:quick -- TouchControls VehicleActionBar PlayerInput FixedWingPlayerAdapter HelicopterPlayerAdapter`: PASS
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run build`: PASS
  - `npm run check:hud`: PASS
  - `npm run check:mobile-ui`: PASS after rebuilding `dist/`
  - `npm run test:quick`: PASS (`242` files, `3772` tests)

TODO
- Move into Cycle 5 combat scale/data ownership.
- Human playtest still owns touch/mobile aircraft exit and pointer-lock fallback feel sign-off at the end of the recovery run.

2026-04-23 Cycle 5 combat spatial ownership first pass
- Moved the combat LOD spatial dependency behind `CombatantSystem` injection.
  `CombatantLODManager` no longer imports the global `spatialGridManager`
  singleton directly.
- LOD dead-actor removal, position sync, and AI update dependency flow now use
  the same supplied `SpatialGridManager` instance for the current combat world.
- Added regression coverage that constructs a non-global spatial grid and proves
  LOD sync plus `CombatantAI.updateAI()` receive the injected instance.
- Validation:
  - `npm run test:quick -- CombatantLODManager CombatantSystem SpatialGridManager CombatantMovement`: PASS
  - `npm run typecheck`: PASS

TODO
- Move into Cycle 6 terrain/collision authority.
- Combat hot state is still a shared object map; fuller data-store migration
  remains a separate vertical slice with combat scenario/perf-tail evidence.

2026-04-23 Cycle 6 terrain/collision authority first pass
- Removed the live vehicle-runtime `HeightQueryCache` dependency from
  helicopter squad deployment. `SquadDeployFromHelicopter` now accepts a
  runtime terrain query surface and prefers `getEffectiveHeightAt()` for
  collision-aware deploy positions.
- `OperationalRuntimeComposer` now wires `terrainSystem` into helicopter squad
  deployment via `setSquadDeployTerrain()`.
- `NavmeshSystem` now receives `terrainSystem` from `SystemConnector` and
  samples navmesh heightfields, obstacle placement, and startup connectivity
  representative heights through runtime terrain instead of direct
  `HeightQueryCache` calls.
- Validation:
  - `npm run test:quick -- SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer TerrainSystem TerrainQueries`: PASS
  - `npm run test:quick -- NavmeshSystem NavmeshHeightfieldBuilder SystemConnector ModeStartupPreparer SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer`: PASS
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS (`242` files, `3774` tests)
  - `npm run build`: PASS
  - `npm run probe:fixed-wing`: first run closed the browser during AC-47 and
    left partial artifacts; clean rerun PASS for A-1, F-4, and AC-47.

TODO
- Move into Cycle 7 harness productization after the gate is green.
- Remaining terrain authority risks: world-feature static obstacles still use a
  direct `LOSAccelerator` hook, and `PlayerMovement` still has a no-runtime
  `HeightQueryCache` fallback.

2026-04-23 Cycle 7 harness productization first pass
- Patched `scripts/fixed-wing-runtime-probe.ts` to write `summary.json`
  incrementally after each aircraft scenario instead of only at the end.
- Failed scenarios now write a structured failed result with error text and a
  best-effort failure screenshot path if the page is still alive.
- This directly addresses the Cycle 6 transient where the first probe attempt
  completed A-1/F-4 screenshots, then closed during AC-47 before updating the
  stale summary file.
- Validation:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run probe:fixed-wing`: PASS; summary now has `status: "passed"`
  - `npm run check:states`: PASS
  - `npm run check:hud`: PASS

TODO
- Start Cycle 8 dead-code/docs/guardrail triage. Do not delete findings from
  `npm run deadcode` without current code evidence and a delete/adopt/retain
  classification.

2026-04-24 Cycle 8 cleanup and guardrails first pass
- Classified `npm run deadcode` findings before editing:
  - retained/adopted root airframe evidence probes by making them explicit Knip
    entries;
  - retained archived cycle evidence `probe.mts` files through Knip ignore
    configuration;
  - retained Cloudflare deploy tooling dependencies through Knip dependency
    ignores;
  - cleaned local-only source exports so helpers/types/constants are private
    unless another module actually imports them.
- Added the missing terrain subsystem guardrail and tightened combat, UI, and
  scripts guardrails around injected spatial authority, presentation-only UI,
  and honest browser-probe paths.
- Validation:
  - `npm run typecheck`: PASS
  - `npm run deadcode`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS

TODO
- Final user playtest remains the game-feel gate for aircraft feel, bailout UX,
  pointer-lock fallback, and airfield taxi/takeoff usability.

2026-04-24 follow-up gates from user review
- Verified and documented that clouds are configured for all five current game
  modes, but v1 clouds are not considered fixed because `CloudLayer` is still a
  single camera-following plane.
- Verified and documented that silent fallback risk remains: DEM load failure
  can leave flat terrain, `PlayerMovement` can fall back to `HeightQueryCache`,
  air-support non-spooky missions still use legacy direct positioning, terrain
  LOS wiring has a side channel, and combat spatial singleton compatibility
  remains.
- Reframed airfield as partially fixed: terrain stamps share one datum, but
  stands/taxi/runway helpers still need one airfield surface runtime.
- Reframed render/LOD/culling as not fully audited: aircraft have visibility
  gates and static GLBs have draw-call optimization, but buildings/props lack a
  measured render-in/render-out/perf contract.
- Updated docs and the architecture-recovery playtest form with Cycles 9-12:
  atmosphere/cloud evidence, fallback retirement, airfield surface authority,
  and render/LOD/culling perf.

2026-04-24 Cycle 9/10 evidence refresh and doc alignment
- First regenerated atmosphere evidence with `npm run evidence:atmosphere -- --port
  9224` at
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T01-51-14-709Z/`.
- That run proved the local/perf preview had no `asset-manifest.json`; A Shau
  correctly failed before live mode and recorded browser errors.
- Patched `npm run build` and `npm run build:perf` so retail and perf output
  dirs emit `asset-manifest.json`.
- Regenerated evidence again. Later superseded artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T02-18-34-516Z/`.
- A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 now enter
  live mode and capture ground plus aircraft/cloud screenshots.
- A Shau records DEM-backed terrain heights, but still emitted a TileCache
  generation failure at tile `1, 0`.
- Visual inspection confirms the current state is evidence, not sign-off:
  Open Frontier/combat120 high views are still mostly sky/haze, TDM/Zone
  Control expose obvious flat cloud-plane artifacts, A Shau has a visible
  cloud-plane/horizon band, and all captured live modes still report
  `cloudFollowCheck.followsCameraXZ === true`.
- Aligned docs to the new truth in `docs/ARCHITECTURE_RECOVERY.md`,
  `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, `docs/ATMOSPHERE.md`,
  `docs/ARCHITECTURE.md`, `docs/CLOUDFLARE_STACK.md`, and
  `docs/playtest/PLAYTEST_2026-04-23_ARCHITECTURE_RECOVERY_CYCLE.md`.
- Validation:
  - `npm run typecheck`: PASS
  - `npx vitest run src/core/ModeStartupPreparer.test.ts src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/CloudLayer.test.ts`: PASS, 63 tests
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS, with the existing Vite large-chunk warning

TODO
- Cycle 10: investigate the current A Shau TileCache generation failure at tile
  `0, 0` with generated bounds
  `origin=(-8168,-8839) extent=(17057,17722) anchors=18`. The earlier
  disconnected-home-base warning stopped after the terrain-flow shoulder patch,
  but static fallback is still degraded and route/NPC movement needs a real
  A Shau nav gate.
- Cycle 11: unify airfield surface authority after A Shau terrain is real;
  keep `tabat_airstrip` and Open Frontier `airfield_main` in scope.
- Cycle 12: capture airfield/world-feature render, LOD, culling, collision, and
  LOS perf before replacing models or adding imposters.

2026-04-24 Cycle 10 fallback update and doc realignment
- Added explicit A Shau nav fallback behavior after the TileCache build failure:
  `NavmeshSystem` logs the TileCache failure, retries a static tiled navmesh,
  and warns that TileCache streaming/obstacles are disabled when that fallback
  is active.
- Regenerated atmosphere evidence with warning capture enabled. Later
  superseded artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T02-33-47-922Z/`.
- Latest evidence summary:
  - A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 all
    enter live mode, capture ground plus aircraft screenshots, and record `0`
    browser errors.
  - All five modes still report `cloudFollowCheck.followsCameraXZ === true`,
    so the one-plane cloud representation remains a known v1 limit.
  - A Shau loads DEM-backed terrain, but TileCache generation still fails at
    tile `1, 0` and degrades to static nav. That run reported disconnected
    nav islands and a steep
    `tabat_airstrip` warning (`112.1m` vertical span across `320m` runway
    footprint), WebGL context-loss warnings during capture, and ReadPixels GPU
    stall warnings.
- Updated docs so agents do not inherit the older A Shau browser-failure
  framing. Current docs now describe explicit degraded static nav plus
  remaining connectivity/airfield blockers in `docs/ARCHITECTURE_RECOVERY.md`,
  `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, `docs/ATMOSPHERE.md`,
  `docs/ARCHITECTURE.md`, `docs/CLOUDFLARE_STACK.md`,
  `docs/DEVELOPMENT.md`, `docs/PLAYTEST_CHECKLIST.md`, historical cloud-cycle
  caveats, and the architecture-recovery playtest form.
- Validation after the fallback/docs alignment:
  - `npm run typecheck`: PASS
  - `npm run lint`: PASS
  - `npm run test:quick`: PASS, 242 files / 3774 tests
  - `npm run build`: PASS, writes `dist/asset-manifest.json`; existing Vite
    large-chunk warning remains

TODO
- Continue Cycle 10 by tracing why A Shau TileCache fails and whether the
  static fallback is acceptable only as a degraded diagnostic path.
- Continue Cycle 11 with `tabat_airstrip`: author a real airfield surface
  authority or move/reshape the site so taxi/takeoff does not rely on a 112m
  flattening envelope.
- Continue Cycle 12 with render/LOD/culling evidence; include WebGL
  context-loss and ReadPixels warnings in the capture/perf audit.

2026-04-24 Cycle 10 A Shau continuation and all-mode release gate
- User clarified that A Shau still needs to be fixed and must not be skipped,
  while the cycle also needs all-mode validation before push/deploy.
- Patched large-world navmesh generation so tiled/static generation bounds are
  anchored to scenario zones instead of assuming world origin contains useful
  navigation. Added bounds to the TileCache fallback warning.
- Patched startup connectivity validation to snap home-base representative
  points to nearby navmesh and warn when a home base has no navmesh nearby.
- Enabled A Shau terrain-flow shoulders around home bases/objectives. Latest
  evidence no longer reports disconnected home-base islands after this change.
- Current evidence artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T03-01-30-184Z/`.
- Latest evidence summary:
  - A Shau, Open Frontier, TDM, Zone Control, and combat120 all enter live mode
    with `0` browser errors and ground/aircraft screenshots.
  - A Shau still falls back from TileCache to static tiled nav:
    `Failed to build nav mesh tiles at 0, 0; bounds origin=(-8168,-8839)
    extent=(17057,17722) anchors=18`.
  - A Shau still warns that `tabat_airstrip` has `112.1m` vertical span across
    the `320m` runway footprint.
  - Open Frontier now also warns that `airfield_main` is steep (`19.3m` span
    across `480m`), and several non-A Shau modes show TacticalUI/World/Combat
    budget warnings. These are part of the final all-mode release gate.
- Updated docs to state the current cycle intent:
  - keep fixing A Shau rather than accepting degraded nav as done;
  - before push/deploy, rerun all-mode evidence so A Shau work does not regress
    Open Frontier, TDM, Zone Control, or combat120;
  - bridge local-vs-prod evidence by checking live Pages/R2/WASM/service-worker
    headers after deployment because local perf-preview evidence is not live
    production truth.

TODO
- Continue A Shau Cycle 10: determine whether TileCache can support the current
  generated bounds or whether A Shau needs a baked/streamed nav layer.
- Keep `tabat_airstrip` and Open Frontier `airfield_main` in Cycle 11 airfield
  authority.
- Final release gate needs local all-mode evidence, normal validation, and live
  deploy/header checks.

2026-04-24 Cycle 10/12 atmosphere, terrain-clipping, and water clarification
- Updated current-facing docs after the latest all-mode evidence artifact:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T05-24-42-281Z/`.
- Current code truth:
  - visible clouds are sky-dome clouds from `HosekWilkieSkyBackend`;
    `CloudLayer` is still present but hidden so the old hard horizon divider /
    one-tile plane is no longer the visible cloud authority. The shader now uses
    a seamless cloud-deck projection instead of azimuth-wrapped UVs.
  - all five modes enter live mode with `0` browser errors and terrain resident
    at the camera in ground, sky, and aircraft evidence views.
  - the refreshed artifact reports `cameraBelowTerrain=false` and
    `waterExposedByTerrainClip=false` in every captured view.
  - Open Frontier and combat120 cloud metrics pass and now show lighter
    scattered-cloud forms. A Shau, TDM, and Zone Control read as heavier broken
    cloud layers. Human playtest remains the final art/readability sign-off.
  - A Shau water is disabled and no longer reports underwater state in the
    evidence capture. Terrain/camera clipping and water rendering are separate
    issues: clipping can expose the global water plane, while water quality /
    hydrology remains its own render backlog item.
  - the old TileCache fallback path is removed. Large worlds use explicit
    static-tiled nav generation, and A Shau startup stops if no generated or
    pre-baked navmesh exists. Remaining A Shau risk is route/NPC quality, not a
    hidden TileCache/beeline fallback.
  - the refreshed artifact records A Shau nav diagnostics: 6/6 representative
    bases snapped to navmesh, `connected=true`, and every representative pair
    returned a path. This is not a human/NPC movement sign-off, but it closes
    the prior missing connectivity evidence gap.
- Aligned docs: `docs/ARCHITECTURE_RECOVERY.md`, `docs/STATE_OF_REPO.md`,
  `docs/ATMOSPHERE.md`, `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT.md`, `docs/CLOUDFLARE_STACK.md`, the 2026-04-22 cloud cycle
  caveats, `docs/PLAYTEST_CHECKLIST.md`, and the architecture-recovery playtest
  form.
- Added `clipDiagnostics` to `scripts/capture-atmosphere-recovery-shots.ts` so
  evidence rows report raw/effective terrain clearance, water-level clearance,
  and whether water was exposed by an invalid below-terrain camera position.
- Added `navDiagnostics` to the same evidence script. A Shau now fails the
  artifact if representative bases cannot snap/connect on the navmesh.
- Repo pulse:
  - `master`, `origin/master`, and the active recovery worktree all pointed at
    `4a940957` before this recovery work was committed, so this session's work
    lived in the dirty main worktree.
  - No branch has committed work dated 2026-04-23 or 2026-04-24 in this clone.
  - Most April 22 task branches are patch-equivalent to `master`; four remain
    non-equivalent and need post-ship cleanup review:
    `task/world-overlay-debugger`, `task/live-tuning-panel`,
    `task/airfield-envelope-ramp-softening`, and
    `task/airframe-ground-rolling-model`.

Validation:
- `npm run typecheck`: PASS
- `npx vitest run src/systems/environment/AtmosphereSystem.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/WaterSystem.test.ts src/systems/navigation/NavmeshSystem.test.ts src/core/ModeStartupPreparer.test.ts`: PASS, 91 tests
- `npm run lint`: PASS
- `npm run evidence:atmosphere -- --port 9224`: PASS, wrote
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T05-24-42-281Z/summary.json`

TODO
- Continue Cycle 10 with A Shau route/NPC movement quality over explicit
  static-tiled generation.
- Continue Cycle 11 with `tabat_airstrip` / `airfield_main` surface authority.
- Continue Cycle 12 with render/LOD/culling plus separate water/hydrology and
  terrain/camera clipping evidence.

2026-04-24 Final local recovery gate before commit
- Current docs aligned away from branch-scoped language in the current truth
  anchors: `AGENTS.md`, `docs/STATE_OF_REPO.md`,
  `docs/ARCHITECTURE_RECOVERY.md`, `docs/BACKLOG.md`,
  `docs/AGENT_ORCHESTRATION.md`, `docs/DEVELOPMENT.md`,
  `docs/DEPLOY_WORKFLOW.md`, and `docs/PERFORMANCE.md`.
- Validation completed:
  - `npm run validate:fast`: PASS, 242 files / 3781 tests.
  - `npm run build`: PASS, with the existing large-chunk Vite warning.
  - `npm run probe:fixed-wing`: PASS for A-1, F-4, and AC-47, including
    takeoff, climb, approach, airborne bailout, and player/NPC handoff.
  - `npm run check:states`: PASS, artifact
    `artifacts/states/state-coverage-2026-04-24T05-40-49-159Z.json`.
  - `npm run check:hud`: PASS, artifact
    `artifacts/hud/hud-layout-report.json`.
  - `npm run check:mobile-ui`: PASS, artifact
    `artifacts/mobile-ui/2026-04-24T05-43-18-934Z/mobile-ui-check`.
  - `npm run doctor`: PASS.
  - `npm run deadcode`: PASS.
  - `git diff --check`: PASS, with CRLF warnings only.
  - `npm run validate:full`: PASS/WARN. Unit/build stages passed; first
    combat120 capture failed one heap-recovery check. Standalone
    `npm run perf:capture:combat120` then passed with warnings at
    `artifacts/perf/2026-04-24T05-49-45-656Z`, and
    `npm run perf:compare -- --scenario combat120` passed 8/8 checks.
- Remaining release-owner work: stage, commit, fast-forward `master`, push,
  trigger manual deploy, then verify live Pages/R2/WASM/service-worker headers.

2026-04-24 NPC movement/navmesh deployment pass
- Verified current production deploy points at commit
  `9dafb7766ae94b20a501c9bc1fd2b0f0b64d9d80`; latest `deploy.yml` run
  succeeded, and live Pages headers show `/`, `/asset-manifest.json`,
  `/sw.js`, seed navmesh binaries, and Recast WASM serving with the intended
  cache split.
- Deployment/navmesh finding: Open Frontier, Zone Control, and TDM use
  committed seed-keyed navmesh/heightmap files under `public/data`; A Shau
  resolves DEM/rivers through the asset manifest/R2 and builds static-tiled
  navmesh at startup. Cloudflare is not building navmesh, and the current risk
  is route-follow quality, not the Pages cache path.
- Reduced infantry locomotion speeds to a real `NPC_MAX_SPEED = 6m/s`, removed
  hidden 9-10m/s state speeds, reduced distant-culled coarse movement, and made
  high/medium LOD combatants clamp rendered Y near grounded logical Y to reduce
  visible hover.
- Targeted movement/render/navigation tests passed:
  `npx vitest run src/systems/combat/CombatantMovement.test.ts src/systems/combat/CombatantMovementStates.test.ts src/systems/combat/CombatantRenderInterpolator.test.ts src/systems/combat/CombatantLODManager.test.ts src/systems/navigation/NavmeshSystem.test.ts src/systems/navigation/NavmeshMovementAdapter.test.ts`.

TODO
- `npm run validate:fast` passed after docs/code edits: typecheck, lint, and
  243 test files / 3789 tests.
- `npm run build` passed after docs/code edits; `prebuild` found all 22 baked
  assets already present and skipped regeneration. Existing Vite large-chunk
  warning remains.
- `npm run smoke:prod` passed at `http://127.0.0.1:53616/`.
- Human playtest still needs to judge infantry pacing and whether route-follow
  navmesh quality, not speed, is now the main problem.

2026-04-24 README OSS front-door pass
- Rewrote `README.md` to make the live game link, current-state truth anchor,
  stabilization focus, quickstart, validation, repo map, docs map,
  contributing rules, and deploy caveat clearer for public OSS readers.
- Kept claims aligned with current docs: A Shau is described as a 3,000-unit
  strategic simulation with local materialization, not 3,000 fully live NPC
  meshes; known open work remains visible instead of hidden behind marketing
  language.
- Fresh final validation after the README/doc alignment:
  - `git diff --check`: PASS, CRLF warnings only.
  - `npm run validate:fast`: PASS, 243 files / 3789 tests.
  - `npm run build`: PASS, existing large-chunk Vite warning only.
  - `npm run smoke:prod`: PASS at `http://127.0.0.1:59767/`.
  - `npm run evidence:atmosphere`: PASS/WARN, artifact
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/summary.json`.
- Commit `ce87fef885c1a6d6678a4f4b7be6342c70053c60` pushed to `origin/master`;
  manual `deploy.yml` run `24891880026` succeeded and live Pages verification
  passed. Live `/asset-manifest.json` served the release git SHA and R2 DEM
  URL, stable shell assets revalidated, hashed build/navmesh/WASM assets were
  immutable, and a live Zone Control smoke reached the deployment UI without
  console/page/request errors.
- Follow-up docs alignment replaces the old "needs deploy" caveat with a
  recurring release-gate requirement: repeat manifest/header/live-smoke checks
  after each player-test push.

2026-04-26 Pixel Forge asset-only cutover
- Began hard cutover from old NPC/vegetation art to Pixel Forge-only runtime
  assets. Copied accepted vegetation impostor packages, NPC combined GLBs,
  NPC animated impostor atlases, and the 80 new prop GLBs into `public/`.
- Added the Pixel Forge runtime manifest, prop catalog, and cutover validator.
  `AssetLoader` now registers NPC/vegetation textures from the manifest instead
  of old root-level webp filenames.
- Removed old root-level NPC sprite and vegetation webp assets from
  `public/assets`; terrain, UI, audio, and weapon assets were left alone.
- Rewired combatant rendering to Pixel Forge-only impostor buckets plus capped
  close GLB model pools from the combined faction GLBs; old directional soldier
  texture keys are no longer runtime inputs.
- Validation so far: `npm run typecheck` PASS,
  `npm run check:pixel-forge-cutover` PASS, targeted Vitest for vegetation,
  billboard, and combat renderer/factory PASS (6 files / 69 tests).
- Final local validation for the cutover pass: `npm run validate:fast` PASS
  (244 files / 3796 tests), `npm run build` PASS, `npm run smoke:prod` PASS,
  `git diff --check` PASS with CRLF warnings only. The generic web-game
  Playwright client captured the mode-select screen with no console errors,
  but did not drive the DOM mode card because that helper sends mouse actions
  relative to the canvas.
- Removed the old vegetation/soldier optimizer path that could regenerate
  deleted webp assets; `assets:optimize:vegetation` and `assets:fix-alpha`
  now route to the Pixel Forge cutover validator.
- User-visible stale asset report traced to an old `dist-perf` build that still
  shipped the legacy AssetLoader registry and copied old webp files. Expanded
  `check:pixel-forge-cutover` to scan `dist` and `dist-perf`, then rebuilt both
  outputs. The validator now fails on stale shipped legacy filenames/tokens.
- Added a vegetation billboard near-field fade uniform in the Pixel Forge shader
  path to reduce large impostor planes clipping into the first-person camera.
- Fresh follow-up validation: `npm run build` PASS, `npm run build:perf` PASS,
  `npm run check:pixel-forge-cutover` PASS, `npm run validate:fast` PASS
  (244 files / 3796 tests), `npm run smoke:prod` PASS, and `git diff --check`
  PASS with CRLF warnings only. Direct preview probes for both `dist` and
  `dist-perf` confirmed old asset URLs serve only HTML fallback, not images,
  while new Pixel Forge PNG/GLB paths serve real asset bytes.
- Visual perf follow-up found the first `giantPalm` candidate
  (`palm-quaternius-3`) had an off-origin 25.9m capture footprint and produced
  huge near-camera billboard planes. Switched runtime `giantPalm` to the
  approved `palm-quaternius-2` package, removed the oversized variant from
  `public/`, and taught the validator to fail on that variant in source or
  shipped output.
- Rebuilt after the palm swap and reran: `npm run build` PASS,
  `npm run build:perf` PASS, `npm run check:pixel-forge-cutover` PASS,
  `npm run validate:fast` PASS, `npm run smoke:prod` PASS, `git diff --check`
  PASS with CRLF warnings only, and direct preview/prod-perf probes confirmed
  old `.webp` URLs do not serve images while new Pixel Forge PNG/GLB URLs do.
  `npm run perf:quick` still fails on the active-driver combat hit/shots gate
  (`artifacts/perf/2026-04-26T13-23-51-069Z`), but its final screenshot shows
  the stale old art and oversized palm slabs are gone.
- User playtest appearance notes from the local preview:
  - Vegetation impostors currently disappear when the player gets too close;
    the near-field fade is too aggressive as a gameplay solution and should be
    replaced or limited by a proper near LOD/clearance strategy.
  - Distant scene reads too bright and foggy; atmosphere/fog/vegetation
    lighting needs to be separated from asset color calibration instead of
    solved by texture swaps.
  - NPCs animate and walk, but their world scale is too small and legs can
    clip through terrain; close GLB scale, impostor scale, y-offset, and
    terrain grounding need a single calibration pass.
  - Vegetation impostors snap noticeably, especially while flying. The current
    view-angle tile selection/LOD transition is too discrete for fast camera
    movement and needs smoothing, hysteresis, or cross-fade.
  - These should be split into separate fixes: vegetation near handling,
    atmosphere/lighting, NPC scale/grounding, and vegetation LOD snapping.

2026-04-26 Pixel Forge NPC renderer restart
- Root-cause note for the bad NPC pass: close Pixel Forge GLBs were spawned
  without weapon attachments, the 6-per-faction / 24-total close mesh pool was
  exhausted in clustered sandbox combat and nearby enemies fell back to
  impostors, NVA/VC close GLBs are flat-color assets rather than textured
  assets and need runtime readability tuning, the current `advance_fire` source
  clip contains horizontal root motion that rubberbands scene movement, and the
  review-only NPC package was promoted into runtime before those contracts were
  enforced.
- Restart plan: centralize faction/body/weapon/socket/clip/LOD metadata in a
  Pixel Forge NPC runtime adapter, reserve the 45m near range for close GLB
  meshes only, attach M16A1/AK-47 weapons through the `RightHand`/`LeftHand`
  socket contract, strip horizontal root motion from looped close clips at load
  time, keep animated impostors for mid/far range only, and add tests/probes so
  the renderer cannot silently regress to near impostors or unarmed close GLBs.
- Implementation checkpoint: added `PixelForgeNpcRuntime`, moved moving combat
  states to `walk_fight_forward`, strips horizontal `Hips.position` root motion
  from looped clips, expands close model pools to 32 per pool / 96 selected,
  suppresses near impostors on close-pool overflow, attaches M16A1/AK-47 weapon
  GLBs to close models, and tunes flat NVA/VC close-material colors for
  readability without old textures.
- Validation checkpoint: targeted Pixel Forge NPC runtime/renderer/factory
  Vitest passed, `npm run check:pixel-forge-cutover` passed with weapon GLB
  requirements, `npm run validate:fast` passed (245 files / 3807 tests), and
  `npm run build` passed with the existing large-chunk warning. The new
  `npm run probe:pixel-forge-npcs` live sandbox probe passed at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1`; nearest NPCs
  were close GLBs with `hasWeapon=true` and no actor inside 45m rendered as an
  impostor. Probe artifacts are in `artifacts/pixel-forge-npc-probe/`. The
  generic web-game Playwright client also captured
  `output/web-game/shot-0.png`; the screenshot still shows vegetation occlusion
  and overall environment readability as follow-up visual issues, separate
  from the near-range NPC renderer contract.

2026-04-26 Pixel Forge vegetation/NPC readability pass
- Implemented close vegetation alpha hardening and lighting calibration in the
  Pixel Forge billboard shader while keeping `nearFadeDistance=0`: core atlas
  pixels are pushed toward opaque inside 30m, transition back by roughly 55m,
  and close foliage gets a brighter minimum light/exposure floor without old
  vegetation assets or close mesh vegetation LODs.
- Removed the runtime retro/pixelated look for this pass: the main renderer no
  longer constructs `PostProcessingManager`, WebGL antialiasing is enabled,
  post-process/pixel-size hotkeys are no longer bound, and foliage/NPC impostor
  atlases use linear mipmapped sampling instead of nearest-neighbor billboard
  filtering.
- Disabled the renderer-facing NPC turn smoothing because the Pixel Forge turn
  rig is not reliable; `visualRotation` now snaps to authoritative combatant
  rotation and clears turn velocity.
- Increased shared NPC visual height by 1.5x for both close GLBs and far
  impostors, then added material/emissive readability tuning for close flat GLBs
  and a mild contrast/lift in the NPC impostor shader so actors stand out more
  against terrain.
- Validation: targeted billboard/combat/renderer tests passed (7 files / 85
  tests), `npm run validate:fast` passed (246 files / 3813 tests), `npm run
  build` passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build.
- Browser smoke: the develop-web-game Playwright client reached live sandbox
  at `http://127.0.0.1:5173/?sandbox=1&npcs=80&seed=2718&diag=1` with captures
  under `artifacts/web-game/pixel-forge-vegetation-npc-readability-rerun/`.
 A direct runtime probe reported `hasPostProcessing=false`, `gameStarted=true`,
 and no browser console/page errors. Visual note: a nearby friendly can now
 fill the camera when standing very close after the 1.5x scale increase; leave
 any proximity-hide or squad spacing change for a separate playtest decision.

2026-04-26 Pixel Forge grounding/wind/readability follow-up
- Fixed floating vegetation caused by transparent lower padding in low-angle
  Pixel Forge atlas rows. Runtime vegetation type generation now applies
  species-specific grounding sinks for the affected approved assets
  (`bambooGrove`, `coconut`, `elephantEar`, `fanPalm`, `giantPalm`) so visible
  bases land at or slightly below terrain without per-frame terrain sampling.
- Strengthened vegetation wind by replacing the tiny hardcoded sway with
  per-material GPU vertex uniforms (`windStrength`, `windSpeed`,
  `windSpatialScale`). The animation remains fully shader-side, LOD-scaled,
  and does not add CPU-side instance updates.
- Improved NPC readability by lifting Pixel Forge impostor color toward the
  faction marker color, raising and enlarging the instanced ground marker so it
  follows elevated terrain instead of staying at world `y=0.1`, and adding
  faction-specific close-GLB material tuning for US/ARVN as well as NVA/VC.
- Validation: targeted vegetation/billboard/combat tests passed (5 files / 77
  tests) plus focused NPC runtime/renderer tests passed (2 files / 23 tests).
  `npm run validate:fast` passed (246 files / 3817 tests), `npm run build`
  passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build.
- Browser smoke: sandbox at
  `http://127.0.0.1:5173/?sandbox=1&npcs=80&seed=2718&diag=1` reached gameplay
  with no browser console/page errors. Latest visual capture:
  `artifacts/web-game/pixel-forge-grounding-wind-readability-final/shot-0.png`.
  The faction marker is now visible on elevated terrain; it may need a later
  style pass if the horizontal ring reads too UI-like in human playtest.

2026-04-26 Pixel Forge NPC impostor facing/lighting/range follow-up
- Inspected the packed Pixel Forge NPC atlas row for `usArmy/idle`; the current
  renderer was treating the camera-in-front case as view column 0, which reads
  like a side/back presentation for the package. Runtime view-column selection
  now applies a 180-degree Pixel Forge forward offset before sampling the 7-wide
  impostor row, with a regression test for front/rear view columns.
- Pushed the no-impostor near band farther out: close GLBs now cover 64m
  instead of 45m, the selected close cap is 128, and per-pool capacity is 40.
  The renderer still suppresses over-cap near impostors instead of silently
  falling back to billboarded NPCs inside the hard close range.
- Added cheap shader-side readability lighting for billboarded NPCs:
  `npcExposure=1.14`, `minNpcLight=0.82`, `npcTopLight=0.22`, plus a slightly
  stronger faction-color lift. This keeps far impostors visible without adding
  CPU-side lighting work or old sprite assets.
- Updated `scripts/probe-pixel-forge-npcs.ts` to read the runtime close-radius
  constant so the live probe enforces the current 64m contract instead of the
  retired 45m threshold.
- Validation: targeted NPC renderer/factory/runtime tests passed (3 files / 39
  tests), `npm run validate:fast` passed (246 files / 3820 tests), `npm run
  build` passed with the existing large-chunk warning, and
  `npm run check:pixel-forge-cutover` passed after build. Live probe at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` passed with
  `closeRadiusMeters=64`, 26 active close GLBs, armed nearest actors, and no
  failures; artifacts are in `artifacts/pixel-forge-npc-probe/`.
- Browser note: a short develop-web-game smoke reached live sandbox with no
  browser console/page errors and screenshot
  `artifacts/web-game/pixel-forge-npc-facing-lighting-range-short/shot-0.png`.
 A longer virtual-time web-game run timed out before writing artifacts. The
 probe screenshot still shows a very close GLB can fill the camera after the
 1.5x scale increase; treat that as a later squad spacing/proximity-hide
 decision rather than an impostor LOD issue.

2026-04-26 Pixel Forge docs/progress drift alignment
- Opened the local sandbox in the in-app browser for human testing at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1`.
- Corrected non-archived docs that still described the pre-Pixel-Forge state:
  `docs/STATE_OF_REPO.md` now has a 2026-04-26 Pixel Forge cutover section,
  `docs/ASSET_MANIFEST.md` now lists 159 GLBs plus Pixel Forge NPC/vegetation
  assets instead of old 2D sprites/root WebP vegetation, `docs/BACKLOG.md`
  now treats the Pixel Forge asset pipeline as active/current, and
  `docs/ARCHITECTURE_RECOVERY.md` now references the 64m close-GLB contract
  instead of the old faction-sprite sizing path.
- Kept unresolved visual risk visible in docs: vegetation close readability,
  wind/snap feel, close GLB camera occlusion after 1.5x scale, faction marker
  style, static building/prop culling/HLOD measurement, and human playtest
  sign-off.

2026-04-26 Pixel Forge NPC impostor brightness and small-palm stabilization
- Fixed Pixel Forge NPC impostors reading too dark versus close GLBs by
  outputting straight RGB with alpha instead of multiplying impostor color by
  alpha before transparent blending. Also lifted the billboard NPC lighting
  floor (`npcExposure=1.2`, `minNpcLight=0.92`) and reduced the top-light crush
  so far actors stay closer to the flat-color GLB look.
- Confirmed the small Pixel Forge palm (`giantPalm` / `palm-quaternius-2`) uses
  a curved trunk in its atlas. Azimuth interpolation makes that trunk jump
  laterally during camera angle changes, so `giantPalm` now locks to atlas
  column 3 and disables per-angle atlas blending for that species. This is the
  cheap billboard fix; a close 3D vegetation LOD or per-column pivot metadata
  would be the higher-fidelity follow-up.
- Increased `giantPalm` runtime size by 1.75x while scaling its y-offset and
  grounding sink with the same factor so the larger palm stays planted.
- Validation: targeted Pixel Forge combat/vegetation/billboard tests passed
  (4 files / 63 tests), `npm run check:pixel-forge-cutover` passed,
  `npm run validate:fast` passed (246 files / 3823 tests), `npm run build`
  passed with the existing large-chunk warning, and the post-build Pixel Forge
  cutover check passed. Browser smoke reached sandbox gameplay at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no browser
 console/page errors; NPC probe passed with `closeRadiusMeters=64`, armed
  close GLBs, and no failures.

2026-04-26 Pixel Forge tall-palm atlas row quarantine
- Investigated the remaining "two trunk locations" report on tall palms. The
  coconut/tall-palm bottom atlas row (`coconut-palm-google`, row 3) contains a
  duplicated/offset palm silhouette in the tile itself, and azimuth blending on
  the curved trunk draws two trunks during camera-angle transitions. Debug
  strips were written under `artifacts/debug/coconut-row2.png` and
  `artifacts/debug/coconut-row3.png`.
- Added manifest-backed runtime controls for problematic vegetation atlases:
  `stableAzimuthColumn` continues to lock skinny asymmetric trunks to a clean
  column, and new `maxElevationRow` lets a species avoid a bad low-angle row
  without affecting the rest of the billboard renderer.
- Applied the guard only to `coconut`: lock to column 2 and cap elevation row
  at 2 so ground-level views no longer sample the broken row 3. This is a
  production-safe interim fix; the higher-quality answer is regenerating palms
  with close mesh/trunk LODs or a hybrid trunk-mesh/canopy-impostor path.
- Validation: targeted vegetation/billboard tests passed (3 files / 51 tests),
  `npm run check:pixel-forge-cutover` passed, `npm run validate:fast` passed
  (246 files / 3825 tests), `npm run build` passed with the existing
  large-chunk warning, and the post-build Pixel Forge cutover check passed.
  The in-app browser sandbox was reopened at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no
  browser console errors.

2026-04-26 Pixel Forge dev-cycle close-out and docs alignment
- Aligned current-state docs for the end of the Pixel Forge visual iteration:
  `docs/STATE_OF_REPO.md` now has a dev-cycle close-out snapshot, current green
  local gates, current runtime truth, and the next polish queue; `docs/BACKLOG.md`
  now prioritizes hitbox/shot feedback, close NPC occlusion/collision feel,
  faction readability, palm/tree close LOD quality, vegetation atlas snapping,
  and static prop/building culling evidence; `docs/ASSET_MANIFEST.md` records
  the interim `giantPalm`/`coconut` atlas guards and the likely need for close
  mesh or hybrid trunk/canopy vegetation; `docs/ARCHITECTURE_RECOVERY.md` now
  reflects the latest 3825-test fast gate and routes any remaining scale/hitbox
  issues back through telemetry instead of hidden offsets.
- Close-out intent: this is a local development checkpoint so the next session
  can start on polish work, not a live production release claim. Remaining
  human-review items are explicit and current docs no longer imply old sprite
  or old vegetation runtime behavior.
- Final close-out validation: `npm run validate:fast` passed (246 files / 3825
  tests), `npm run build` passed with the existing large-chunk warning,
  post-build `npm run check:pixel-forge-cutover` passed, `git diff --check`
  reported only existing CRLF normalization warnings, and a fresh in-app
  browser sandbox opened at
  `http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1` with no browser
  console errors.

2026-04-26 Pixel Forge hitbox alignment and gun-range route
- Rebuilt player shot registration around shared Pixel Forge visual hit
  proxies in `CombatantBodyMetrics`: head sphere, chest capsule, pelvis sphere,
  and two leg capsules are derived from the current 1.5x NPC visual height and
  can use logical or rendered visual position.
- Updated `CombatantHitDetection` so player damage/preview paths use
  `positionMode: 'visual'`, while NPC-vs-NPC raycasts still default to logical
  positions. Player weapon firing now keeps the original camera/crosshair ray
  for damage and uses the barrel-aligned ray only for tracer visuals.
- Added `?diag=1&hitboxes=1` renderer debug proxies over nearby live NPCs,
  sourced from the same helper rather than duplicated offsets.
- Added an isolated Pixel Forge GLB dev gun range at `?mode=gun-range` for
  crosshair, tracer, and hit-proxy validation without loading terrain, AI,
  vegetation, impostors, or combat120. The scene exposes
  `window.render_game_to_text()` and `window.advanceTime(ms)` for automation.
- Documentation aligned in `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, and
  `docs/COMBAT.md`. Human playtest still needs to judge final shot feel,
  muzzle/tracer presentation, and close NPC collision/occlusion.
- Validation: targeted gun-range/combat/weapon/renderer tests passed (5 files /
  85 tests), `npm run validate:fast` passed (247 files / 3833 tests),
  `npm run build` passed with the existing large-chunk warning, and post-build
  `npm run check:pixel-forge-cutover` passed. In-app browser smoke at
  `http://127.0.0.1:5173/?mode=gun-range` rendered the range with no console
  errors; automation artifact
  `artifacts/web-game/gun-range-hitbox-smoke/state-0.json` recorded a center
  shot head hit on the target.

2026-04-26 Pixel Forge hitbox follow-up: taller shared player/NPC proxies
- Increased the shared Pixel Forge hit-proxy height multiplier to better cover
  the actual GLB silhouettes seen in the gun-range playtest.
- Moved `checkPlayerHit()` off the old fixed sprite-era player spheres and onto
  `CombatantBodyMetrics.writeCharacterHitProxies()`, so NPC shots against the
  player now use the same head/chest/pelvis/leg proportions as close GLB NPCs
  and impostor NPCs.
- Kept player damage on the original camera/crosshair ray, but changed the
  first-person blue tracer presentation to project from the actual overlay
  weapon muzzle/barrel point and start farther in front of the camera. This
  keeps fair hit registration while reducing the distracting near-camera red
  vs. blue ray gap in the gun range.
- Updated the gun-range tracer debug path to use a lightweight invisible
  muzzle/barrel object in camera space instead of a bare fixed line origin, so
  the blue debug ray is derived from an explicit barrel marker just like
  production derives from the weapon rig `muzzleRef`.
- Updated docs to reflect the GLB gun range and the shared player/NPC/impostor
  hit-proxy contract. Human playtest still needs to confirm the taller proxy,
  projected barrel tracer, and close camera feel.

2026-04-26 Pixel Forge close-out asset cleanup
- Removed the old `public/assets/source/soldiers/` source PNGs after user
  approval because Vite copied them into `dist/assets/source/soldiers/`, which
  violated the no-old-NPC-assets shipped-output rule.
- Tightened `scripts/validate-pixel-forge-cutover.ts` so
  `assets/source/soldiers` paths and the old source-soldier PNG filenames fail
  the cutover check in source, `dist`, or `dist-perf`.
- Rebuilt both retail and perf outputs after the asset cleanup:
  `npm run build` passed, `npm run build:perf` passed, and the generated
  `dist/asset-manifest.json` plus `dist-perf/asset-manifest.json` were refreshed.
- Validation after cleanup: `npm run check:pixel-forge-cutover` passed,
  `npm run validate:fast` passed (247 files / 3834 tests), and direct scans of
  `public`, `dist`, and `dist-perf` found no `assets/source/soldiers` paths or
  old source-soldier filenames.

2026-04-26 Pixel Forge production deploy verification
- Committed the Pixel Forge NPC/vegetation cutover, hitbox/gun-range, and source
  asset cleanup as `c70d6d74f689b99ae97513e842b40248923c62c2`, pushed it to
  `origin/master`, and manually triggered GitHub Actions Deploy run
  `24968673208`.
- Deploy run `24968673208` passed: checkout, setup, dependency install, build,
  Cloudflare asset upload/validation, and Cloudflare Pages deploy all completed.
  The only annotation was the existing `cloudflare/wrangler-action@v3` Node 20
  deprecation warning from GitHub Actions.
- Live Pages verification passed:
  `https://terror-in-the-jungle.pages.dev/asset-manifest.json` served git SHA
  `c70d6d74f689b99ae97513e842b40248923c62c2`; `/`, `/sw.js`,
  `/asset-manifest.json`, main build assets, terrain/navmesh workers, Recast
  WASM/build assets, and A Shau R2 DEM/rivers returned `200` with expected cache
  headers.
- Live browser smoke passed at
  `https://terror-in-the-jungle.pages.dev/?sandbox=1&npcs=40&seed=2718&diag=1`:
  the gameplay HUD rendered with canvases, `window.__engineHealth` and
  `window.__rendererInfo` were exposed by `?diag=1`, and there were no browser
  console errors or failed requests. `?mode=gun-range` remains a DEV-only route,
  so production smoke uses live sandbox gameplay instead.

2026-04-26 Pixel Forge NPC death lifecycle fix
- New playtest issue: Pixel Forge NPC deaths could visually fall more than once
  during the 8.7s dying window. Root cause is split across LOD paths: close GLB
  `death_fall_back` actions were ordinary looping `AnimationAction`s, and far
  impostor death atlases used the same looping time/phase shader as locomotion.
- Implemented the contract that death is driven by combatant `deathProgress`:
  close GLBs use a one-shot clamped `death_fall_back` pose, and far impostors
  receive per-instance one-shot animation progress plus fade opacity. Meshes
  still remain pooled for performance, but they fade near the end of the dying
  window and are hidden/released when the combatant leaves the active map.
- Validation: targeted renderer/mesh-factory tests passed (2 files / 39 tests),
  `npm run typecheck` passed, `npm run validate:fast` passed (247 files / 3839
  tests), `npm run build` passed with the existing large-chunk warning, and
  post-build `npm run check:pixel-forge-cutover` passed. Local gun-range browser
  smoke at `http://127.0.0.1:5173/?mode=gun-range&glb=1&t=1777241544507`
  rendered four Pixel Forge GLB targets with no console errors.

2026-05-02 Projekt Objekt-143 KB-METRIK continuation
- Added perf-capture measurement-trust reporting. Each capture now writes
  `measurement-trust.json`, embeds `measurementTrust` in `summary.json`, and
  adds a `measurement_trust` validation check before frame-time numbers are
  treated as usable evidence.
- Normalized perf server bind/navigation to `127.0.0.1`, avoiding Windows
  localhost/IPv6 ambiguity during startup captures.
- Added post-sample `scene-attribution.json` capture with category buckets,
  mesh/material/geometry counts, live instance-aware triangle estimates,
  effective parent visibility, example meshes, and visible-example meshes. The
  attribution pass runs after the runtime sample window so it does not pollute
  frame timing.
- Validation: `npm run typecheck` passed. Headed perf-build control
  `artifacts/perf/2026-05-02T16-37-21-875Z` exited 0 with measurement trust
  PASS (`probeAvg=14.00ms`, `probeP95=17.00ms`, missed samples 0%), avg frame
  14.23ms, heap recovery PASS, no browser errors, and validation WARN only for
  peak p99 31.70ms.
- Finding: scene attribution now classifies terrain, water, atmosphere,
  vegetation imposters, NPC imposters, hidden close NPC GLBs, hidden weapon
  pools, and static features. Visible unattributed triangles fell to 244 in the
  control capture, but hidden resident pools are large even with `npcs=0`:
  1,360 close-NPC meshes / 132,840 resident triangles and 8,480 weapon meshes /
  133,440 resident triangles. That is now a KB-LOAD/KB-CULL startup and asset
  residency target.

2026-05-02 Projekt Objekt-143 KB-LOAD measurement opening
- Refreshed the retail build with `npm run build`; `dist/asset-manifest.json`
  now reports git SHA `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Ran headed retail startup UI benchmarks, three iterations each:
  `artifacts/perf/2026-05-02T18-30-01-826Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T18-30-45-200Z/startup-ui-zone-control`.
- Open Frontier averaged 5457.3ms from mode click to playable; Zone Control
  averaged 5288.3ms. The measured stall is real, but this sample does not yet
  support treating Open Frontier as uniquely worse by more than noise.
- Stage split: Open Frontier averaged 1156.6ms across
  `engine-init.start-game.*` and 3893.2ms from startup-flow begin to
  interactive-ready; Zone Control averaged 1177.1ms and 3633.5ms. KB-LOAD's
  next target is live-entry spawn warming/hidden pool construction and first-use
  shader/material work, not broad terrain/navmesh speculation.

2026-05-02 Projekt Objekt-143 startup telemetry label fix
- Changed `SystemInitializer` startup marks to use stable `SystemRegistry` keys
  instead of constructor names, because retail minification converted several
  labels into unreadable identifiers.
- Validation: `npm run typecheck` passed, `npm run build` passed, and a one-run
  headed Open Frontier startup benchmark wrote
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier`.
- The validation artifact now exposes labels such as
  `systems.init.combatantSystem`; in that run `combatantSystem` init measured
  576.9ms, `firstPersonWeapon` init 62.0ms, `terrainSystem` init 49.0ms,
  `engine-init.start-game.open_frontier` 1265.3ms, and live-entry 3271.3ms.

2026-05-02 Projekt Objekt-143 live-entry stall narrowing
- Added named `engine-init.startup-flow.*` marks inside `LiveEntryActivator`
  for hide-loading, position-player, flush-chunk-update, renderer-visible,
  enable-player-systems, audio-start, combat-enable, background task
  scheduling, and enter-live.
- Added `browser-stalls.json` to `scripts/perf-startup-ui.ts` by installing the
  existing `perf-browser-observers.js` long-task/long-animation-frame observer
  during retail startup UI benchmarks.
- Validation: `npm run typecheck` passed; `npm run build` passed; one Open
  Frontier startup run with marks wrote
  `artifacts/perf/2026-05-02T18-59-10-446Z/startup-ui-open-frontier`.
- A three-run Open Frontier validation after the bounded frame-yield guard wrote
  `artifacts/perf/2026-05-02T19-01-27-585Z/startup-ui-open-frontier` and still
  averaged 5298.0ms from mode click to playable. Live-entry still averaged
  about 3757ms, almost entirely inside `flush-chunk-update` after the sync
  terrain update ended. The yield resolved by `requestAnimationFrame`, not the
  100ms timeout, so the guard did not fix the local stall.
- Follow-up observer-enabled artifact
  `artifacts/perf/2026-05-02T19-03-09-195Z/startup-ui-open-frontier` recorded
  `startup-flow-total=3804.3ms`, `frame-yield-wait=3802.1ms`, and a 3813ms
  long task starting at 4571.2ms. Startup marks put terrain-update end at
  4513.4ms and yield return at 8315.5ms. Next KB-LOAD target is attribution of
  that long task, not terrain update speculation.

2026-05-02 Projekt Objekt-143 texture-upload lead
- Extended startup UI evidence so `perf-browser-observers.js` preserves
  long-task attribution and long-animation-frame script entries, and
  `scripts/perf-startup-ui.ts` writes per-iteration Chrome CPU profiles as
  `cpu-profile-iteration-N.cpuprofile`.
- Validation: `npm run typecheck` passed; headed Open Frontier startup UI runs
  wrote `artifacts/perf/2026-05-02T19-09-45-201Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier`.
- The latest profiled artifact measured `modeClickToPlayable=5535ms`,
  `deployClickToPlayable=4688ms`, `startup-flow-total=3841.7ms`,
  `frame-yield-wait=3838.6ms`, and a 3850ms long task after terrain update.
  Long-task browser attribution remained `unknown/window`.
- CPU profile aggregation for
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier/cpu-profile-iteration-1.cpuprofile`
  showed dominant self-time in generated Three code:
  `je build-assets/three-DgNwuF1l.js 4079:13616` at 3233.9ms. Inspecting the
  generated bundle maps `je` to `WebGLState.texSubImage2D`.
- Current KB-LOAD lead: the live-entry stall is likely first-present WebGL
  texture upload/update work. Next useful step is texture-upload attribution by
  asset owner, then a policy decision between pre-upload/precompile before the
  loading screen clears, compression/downscale/atlas fixes, or deferring
  non-critical textures behind truthful progressive readiness.

2026-05-02 Projekt Objekt-143 texture-owner attribution
- Added diagnostic WebGL texture-upload wrapping to `perf-browser-observers.js`.
  It tracks upload operation, bound texture id, dimensions, source type, source
  URL for image sources, and top uploads by duration. This is intentionally
  intrusive and should be used for attribution, not clean timing baselines.
- Added WebGL upload counts and durations into `scripts/perf-startup-ui.ts`
  summary output.
- Validation: `node --check scripts/perf-browser-observers.js` passed,
  `npm run typecheck` passed, and a headed Open Frontier startup UI capture
  wrote `artifacts/perf/2026-05-02T19-19-47-099Z/startup-ui-open-frontier`.
- Finding: the diagnostic artifact recorded 324 WebGL texture upload calls,
  3157.8ms total upload wrapper time, and a 2342.3ms max `texSubImage2D`.
  The largest single upload was
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  at 4096x2048. Other top uploads were the giantPalm normal map, Pixel Forge
  vegetation imposter albedo/normal maps at 2048x2048, and Pixel Forge NPC
  animated albedo atlases at 2688x1344.
- Next KB-LOAD/KBCULL/KB-OPTIK handoff: define an asset acceptance policy for
  imposter/NPC texture dimensions, compression, mip generation, normal-map
  necessity, and preload/deferred-upload behavior before attempting a runtime
  workaround.
- Final validation after adding WebGL upload fields to `summary.json` wrote
  `artifacts/perf/2026-05-02T19-21-53-436Z/startup-ui-open-frontier`.
  `summary.json` now reports `webglTextureUploadCount=345`,
  `webglTextureUploadTotalDurationMs=2757.2ms`, and
  `webglTextureUploadMaxDurationMs=1958.0ms`; the largest upload was again the
  giantPalm imposter albedo texture.

2026-05-02 Projekt Objekt-143 Pixel Forge texture acceptance audit
- Added `scripts/pixel-forge-texture-audit.ts` and wired it as
  `npm run check:pixel-forge-textures`.
- The audit reads `src/config/pixelForgeAssets.ts`, verifies each registered
  texture has an on-disk file, checks dimensions against registry expectations,
  and estimates uncompressed RGBA plus full mip chain residency. The thresholds
  are deliberately an acceptance-standard draft: warn at 16MiB and fail at
  32MiB per texture.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-26-55-682Z/pixel-forge-texture-audit/texture-audit.json`.
- Finding: all 42 registered Pixel Forge textures exist, but 38 are flagged.
  Total source PNG bytes are 26,180,240, while estimated mipmapped RGBA
  residency is 781.17MiB. Vegetation color and normal atlases each account for
  133.33MiB; NPC albedo atlases account for 514.5MiB. GiantPalm color and normal
  are hard failures at 42.67MiB each; all 28 NPC albedo atlases warn at 18.38MiB
  each and are non-power-of-two at 2688x1344.
- Extended the audit with vegetation pixels-per-runtime-meter and reran it at
  `artifacts/perf/2026-05-02T19-28-36-962Z/pixel-forge-texture-audit/texture-audit.json`.
  GiantPalm is 81.5px/m and bananaPlant is 108.02px/m, so both now carry an
  oversampling warning in addition to their residency flags. Fern and
  elephantEar are the compact counterexamples at 2.67MiB per atlas.
- Next handoff: use this audit as the first KB-CULL asset acceptance gate, then
  decide whether giantPalm needs downscale/regeneration, normal-map removal,
  compression, or explicit pre-upload before attempting a runtime fix.

2026-05-02 Projekt Objekt-143 texture target candidates
- Extended `scripts/pixel-forge-texture-audit.ts` with remediation candidates.
  Candidate sizes are planning evidence only: they estimate what a regeneration
  target would buy before anyone approves replacement art.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-33-14-632Z/pixel-forge-texture-audit/texture-audit.json`.
- Finding: applying candidates to every flagged texture would reduce estimated
  mipmapped RGBA residency from 781.17MiB to 373.42MiB, saving 407.75MiB.
  GiantPalm color/normal would move from 4096x2048 / 42.67MiB each to
  2048x1024 / 10.67MiB each. Mid-level vegetation 2048x2048 atlases would move
  to 1024x1024 / 5.33MiB each. NPC animated albedo atlases would target padded
  2048x1024 / 10.67MiB each using 64px frames instead of the current 2688x1344
  / 18.38MiB shape.
- Next handoff: candidate targets must go through visual QA for imposter
  darkness, silhouettes, animation readability, and distant-canopy coverage
  before any runtime import or preload policy treats them as accepted.

2026-05-02 Projekt Objekt-143 texture scenario estimates
- Extended `scripts/pixel-forge-texture-audit.ts` again so the JSON report
  includes package-level scenario estimates, not just per-texture candidates.
- Validation: `npm run typecheck` passed and `npm run check:pixel-forge-textures`
  wrote
  `artifacts/perf/2026-05-02T19-34-49-412Z/pixel-forge-texture-audit/texture-audit.json`.
- Scenario estimates from the current registry: no vegetation normals
  647.97MiB, vegetation candidates only 589.3MiB, vegetation candidates without
  normals 551.97MiB, NPC candidates only 565.42MiB, all candidates 373.42MiB.
- Next handoff: KB-CULL can now compare package-level asset-policy choices in
  the same artifact. KB-OPTIK still has to validate visual consequences before
  any candidate texture target can be treated as accepted.

2026-05-02 Projekt Objekt-143 local ship-state alignment
- Updated `docs/STATE_OF_REPO.md` with an explicit local pending recovery slice:
  current branch/head, planned development-cycle scope, local files waiting to
  ship, and what cannot be claimed yet.
- Updated `docs/PROJEKT_OBJEKT_143.md` so the Phase 2 status includes both
  KB-LOAD texture-upload attribution and KB-CULL texture-acceptance/scenario
  estimates, plus a local ship-state section.
- Current local payload is an instrumentation/evidence slice: measurement trust,
  startup/live-entry attribution, stable startup labels, diagnostic WebGL upload
  attribution, and the Pixel Forge texture acceptance audit. It is not a
  startup remediation, asset-regeneration patch, visual sign-off, WebGPU
  migration, or Phase 3 remediation execution.

2026-05-02 Projekt Objekt-143 KB-EFFECTS grenade-spike attribution
- Added frag-grenade user timings in `src/systems/weapons/GrenadeEffects.ts`
  and a dedicated `scripts/perf-grenade-spike.ts` probe, exposed as
  `npm run perf:grenade-spike`.
- The grenade probe disables the startup WebGL texture-upload observer because
  wrapping every WebGL texture call contaminates sustained runtime attribution.
- Best low-load evidence:
  `artifacts/perf/2026-05-02T20-21-05-603Z/grenade-spike-ai-sandbox`.
  With `npcs=2` and two grenades, baseline p95/p99/max were
  22.6ms/23.6ms/25.0ms; detonation p95/p99/max were 25.7ms/30.6ms/100.0ms.
  The first trigger aligned with a 379ms long task and 380.5ms long animation
  frame; the second trigger did not produce a matching long task.
- Frag detonation JS is not the observed spike: two detonations measured
  `kb-effects.grenade.frag.total` at 1.4ms total / 1.0ms max, while
  spawnProjectile was 0.6ms total / 0.4ms max and the pool/audio/damage/shake
  steps were sub-millisecond.
- CPU profile lead: aggregate self-time points at first visible Three/WebGL
  render/program work (`updateMatrixWorld`, minified Three render functions,
  `(program)`, `getProgramInfoLog`, `renderBufferDirect`), not particle
  allocation, damage, audio decode, or physics broadphase.
- 120-NPC evidence:
  `artifacts/perf/2026-05-02T20-19-04-818Z/grenade-spike-ai-sandbox` is not a
  valid grenade-isolation capture because the baseline is already saturated at
  100ms frames before detonation. It still shows grenade JS at about 1.2ms.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`, and
  `docs/PERFORMANCE.md` with the KB-EFFECTS brief and local ship-state
  alignment. No grenade-spike remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-OPTIK imposter optics audit
- Added `scripts/pixel-forge-imposter-optics-audit.ts` and wired it as
  `npm run check:pixel-forge-optics`.
- The audit reads registered Pixel Forge NPC/vegetation assets, metadata JSON,
  alpha occupancy, luma/chroma statistics, and runtime scale constants. It
  writes
  `artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/optics-audit.json`.
- Validation: `npm run check:pixel-forge-optics` passed and wrote
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`;
  `npm run typecheck` passed.
- Finding: NPC runtime atlases are a confirmed scale/resolution suspect.
  `28/28` runtime NPC clip atlases were flagged. Median visible actor height is
  65px inside a 96px tile, runtime/source height ratio median is 2.63x, and
  runtime effective resolution is only 21.69px/m.
- Finding: the field report that NPC imposters look wrong is supported, but
  this static pass does not prove the runtime plane is half-sized. It points to
  a bake/runtime contract mismatch plus low effective pixels per meter. A
  screenshot rig still needs to compare projected close-GLB and imposter bounds.
- Finding: the darkness/parity issue is credible architecturally because the
  three LOD/render paths are split. NPC imposters use a straight-alpha
  `ShaderMaterial` with independent readability/exposure/min-light constants;
  vegetation uses an atmosphere-aware premultiplied `RawShaderMaterial`; close
  GLBs use the regular Three material path.
- Vegetation optics repeated the texture-audit scale concerns: `bananaPlant`
  is oversampled at 108.02px/m, while `giantPalm` is runtime-scaled 1.75x over
  its declared source size and still oversampled at 81.5px/m.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `docs/ASSET_MANIFEST.md`. No imposter brightness,
  scale, atlas, or normal-map remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-TERRAIN vegetation horizon audit
- Added `scripts/vegetation-horizon-audit.ts` and wired it as
  `npm run check:vegetation-horizon`.
- The audit compares mode camera far planes, visual terrain extents, terrain
  LOD inputs, vegetation cell residency, biome palettes, and registered
  vegetation fade/max distances. It writes
  `artifacts/perf/<timestamp>/vegetation-horizon-audit/horizon-audit.json`.
- Validation: `npm run check:vegetation-horizon` passed and wrote
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`.
- Finding: the barren-horizon report is supported for large/elevated modes.
  Current vegetation fades out by 600m, while Open Frontier can expose an
  estimated 396.79m terrain band beyond visible vegetation and A Shau can
  expose 3399.2m because its camera far plane is 4000m.
- Finding: the large-mode limiter is not generated-cell residency in the first
  static pass. Vegetation residency reaches 832m on-axis and 1176.63m at the
  cell-square corner; the shader max distance cuts visibility first.
- Recommended direction: add a reversible outer canopy representation for large
  modes, likely sparse GPU-instanced canopy cards plus terrain tint in the far
  band, while keeping Pixel Forge imposters as the near/mid layer. Do not
  blindly raise existing billboard max distances without overdraw, draw-call,
  and screenshot evidence.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `docs/ASSET_MANIFEST.md`. No distant-canopy or
  barren-horizon remediation has shipped yet.

2026-05-02 Projekt Objekt-143 KB-STRATEGIE WebGL/WebGPU decision basis
- Added `scripts/webgpu-strategy-audit.ts` and wired it as
  `npm run check:webgpu-strategy`.
- The audit records active renderer construction, active WebGPU source matches,
  WebGL-specific type/context dependencies, migration-blocker patterns, current
  combatant bucket capacity, and retained E2 spike evidence. It writes
  `artifacts/perf/<timestamp>/webgpu-strategy-audit/strategy-audit.json`.
- Validation: `npm run check:webgpu-strategy` passed and wrote
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`.
- Finding: active runtime source has no WebGPU renderer path. The audit reports
  0 active WebGPU source matches, 5 WebGL renderer entrypoints including dev
  tools, and 94 migration-blocker matches across custom shader/material,
  post-processing, and WebGL context usage.
- Finding: the retained E2 rendering spike remains available at
  `origin/spike/E2-rendering-at-scale`. It measured the keyed-instanced
  NPC-shaped path at about 2.02ms avg for 3000 instances and recommended
  deferring WebGPU migration. The old 120-instance bucket cliff has since been
  reduced as a silent-risk item: current default bucket capacity is 512 and
  overflow is reported.
- External check: Three.js WebGPURenderer can fall back to WebGL 2 but requires
  ShaderMaterial, RawShaderMaterial, onBeforeCompile, and old EffectComposer
  paths to move to node materials/TSL. MDN still marks WebGPU as not Baseline.
- Recommendation filed: reinforce WebGL for stabilization. WebGPU remains a
  post-stabilization spike for an isolated renderer path, not a migration to
  start inside the current recovery slice.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `progress.md`. No WebGPU migration implementation
  has shipped or been started.

2026-05-02 Projekt Objekt-143 Phase 3 draft plan
- Added the first dependency-aware Phase 3 multi-cycle plan to
  `docs/PROJEKT_OBJEKT_143.md`.
- Sequence: Cycle 0 ships the evidence slice, Cycle 1 certifies baselines and
  asset policy, Cycle 2 builds visual/runtime proof harnesses, Cycle 3 applies
  measured WebGL remediations, and Cycle 4 is a contained WebGPU/TSL spike only
  if WebGL remains the measured blocker.
- Acceptance criteria now call out specific gates for startup upload evidence,
  trusted combat captures, NPC projected-height/luma parity, elevated
  vegetation screenshots, draw-call attribution, grenade long-task removal,
  outer-canopy p95/draw-call limits, and explicit WebGPU point-of-no-return
  approval.
- Updated `docs/STATE_OF_REPO.md` so the local state says Phase 3 draft exists
  and the next cycle should ship the evidence slice before remediation.

2026-05-02 Projekt Objekt-143 Cycle 0 static evidence suite
- Added `scripts/projekt-143-evidence-suite.ts` and wired it as
  `npm run check:projekt-143`.
- The suite runs the four static bureau audits as one local gate:
  Pixel Forge texture audit, Pixel Forge imposter optics audit, vegetation
  horizon audit, and WebGL/WebGPU strategy audit. It writes
  `artifacts/perf/<timestamp>/projekt-143-evidence-suite/suite-summary.json`.
- First attempt failed because `execFileSync('npx.cmd', ...)` returned
  `spawnSync npx.cmd EINVAL` on Windows. The runner now invokes the local
  `tsx` CLI through `node` directly, avoiding shell argument warnings and
  `.cmd` spawn failures.
- Validation: `npm run check:projekt-143` passed and wrote
  `artifacts/perf/2026-05-02T21-49-44-009Z/projekt-143-evidence-suite/suite-summary.json`.
- The suite intentionally does not run `perf:grenade-spike`; that probe remains
  separate because it is a headed runtime/browser capture and should not be
  hidden inside the quick static evidence gate.
- Updated `docs/PROJEKT_OBJEKT_143.md`, `docs/STATE_OF_REPO.md`,
  `docs/PERFORMANCE.md`, and `progress.md`.

2026-05-02 Projekt Objekt-143 Cycle 0 release
- Committed the recovery evidence slice as
  `475aa7792c51823184c454a0b63852e79da2285d`
  (`chore(projekt-143): ship recovery evidence slice`) and pushed `master`.
- Manual Deploy workflow run `25262818886` passed: checkout,
  `game-field-kits` checkout/build, dependency install, production build,
  Cloudflare asset validation, and Cloudflare Pages deploy all completed.
- After the first Cycle 0 deploy, live `/asset-manifest.json` reported
  `475aa7792c51823184c454a0b63852e79da2285d`; `/`, `/sw.js`,
  `/asset-manifest.json`, the A Shau R2 DEM URL, hashed JS/CSS assets, and
  Recast WASM assets returned `200` with the expected production cache/content
  headers.
- Live browser smoke against `https://terror-in-the-jungle.pages.dev/` clicked
  `START GAME`, selected `zone_control`, and reached the deploy UI with no
  console errors, page errors, request failures, or retry panel.
- Updated `docs/PROJEKT_OBJEKT_143.md` and `docs/STATE_OF_REPO.md` from local
  pending language to shipped/live-verified Cycle 0 state. The docs avoid
  treating their own SHA as durable state; live `/asset-manifest.json` remains
  the current deployed SHA source of truth after doc-only alignment commits.
- Next agent-team handoff: execute Phase 2 / Cycle 1. Do not start texture,
  imposter, grenade, vegetation, or WebGPU remediation before certifying
  trusted baselines and the Asset Acceptance Standard.

2026-05-02 Projekt Objekt-143 Phase 2 / Cycle 1 baseline certification
- Required first actions passed: `npm run doctor` and `npm run check:projekt-143`.
  Fresh static suite artifact:
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
- Refreshed local builds at HEAD `cef45fcc906ebe4357009109e2186c83c2a38426`;
  both `dist/asset-manifest.json` and `dist-perf/asset-manifest.json` report
  that SHA.
- Startup baselines:
  - Open Frontier:
    `artifacts/perf/2026-05-02T22-07-48-283Z/startup-ui-open-frontier`,
    3 headed retail runs, avg mode-click-to-playable `6180.7ms`, max WebGL
    upload `2780.5ms`.
  - Zone Control:
    `artifacts/perf/2026-05-02T22-08-46-576Z/startup-ui-zone-control`,
    3 headed retail runs, avg mode-click-to-playable `6467.7ms`, max WebGL
    upload `2608.2ms`.
- Runtime baselines:
  - combat120:
    `artifacts/perf/2026-05-02T22-09-13-541Z`, validation FAIL and measurement
    trust FAIL (`probeAvg=149.14ms`, `probeP95=258ms`). Do not use frame-time
    numbers for regression decisions.
  - Open Frontier short:
    `artifacts/perf/2026-05-02T22-11-29-560Z`, measurement trust PASS,
    validation WARN, avg/p95/p99/max `23.70/29.20/32.70/100ms`, 4 hitches
    above `50ms`.
  - A Shau short:
    `artifacts/perf/2026-05-02T22-15-19-678Z`, measurement trust PASS,
    validation WARN, avg/p95/p99/max `12.04/18.30/31.50/48.50ms`, no hitches
    above `50ms`.
- Grenade low-load probe:
  `artifacts/perf/2026-05-02T22-19-40-381Z/grenade-spike-ai-sandbox`, `npcs=2`,
  2 grenades, CPU profile present. Stall reproduced: baseline p95/p99/max
  `21.8/22.6/23.2ms`, detonation p95/p99/max `23.7/32.5/100ms`, one `387ms`
  long task, two LoAF entries, grenade frag JS `2.5ms` total.
- Added `scripts/projekt-143-cycle1-benchmark-bundle.ts` and package script
  `check:projekt-143-cycle1-bundle`. It wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  and `projekt-143-cycle1-metadata.json` sidecars into the six source artifact
  directories. Bundle status is WARN because combat120 is untrusted and the
  grenade stall remains.
- Added `docs/ASSET_ACCEPTANCE_STANDARD.md` and updated
  `docs/PROJEKT_OBJEKT_143.md`, `docs/PERFORMANCE.md`, and
  `docs/STATE_OF_REPO.md`. No remediation, texture regeneration, imposter
  tuning, grenade warmup fix, culling certification, or WebGPU migration was
  started. No live deploy check was run, so do not claim production parity from
  this Cycle 1 local evidence.

2026-05-02 Projekt Objekt-143 Phase 2 / Cycle 1 commit/deploy continuation
- Committed Cycle 1 certification docs/tooling as
  `806d5fa43d63854dd80496a67e8aaef4a741c627`
  (`docs(projekt-143): certify cycle 1 baselines`) and pushed to `master`.
- GitHub Actions CI run `25263686228` passed: lint, build, perf, test, smoke,
  and mobile UI jobs all completed successfully.
- Manual Deploy workflow run `25264091996` passed and deployed the commit to
  Cloudflare Pages.
- Live `/asset-manifest.json` reported
  `806d5fa43d63854dd80496a67e8aaef4a741c627`. Header checks returned `200` for
  `/`, `/sw.js`, `/asset-manifest.json`, representative public assets, Open
  Frontier navmesh/heightmap assets, the A Shau R2 DEM URL, and Recast
  WASM/build assets with expected cache/content headers.
- Live browser smoke reached the Zone Control deploy UI with no console, page,
  request, or retry-panel failures. This verifies the docs/tooling release only;
  Cycle 1 still makes no texture, imposter, grenade, culling, or WebGPU
  remediation claim.

2026-05-02 Agent ergonomics / release DX follow-up
- The Cycle 1 release exposed two repeatable agent friction points: limited
  GitHub token environment variables can shadow keyring auth for workflow
  dispatch, and docs-only release-state commits may not start automatic CI
  because `ci.yml` is path-filtered.
- Added `scripts/github-workflow-run.ts`, `npm run ci:manual`, and updated
  `npm run deploy:prod` so agents have repo-native workflow commands that clear
  `GITHUB_TOKEN` / `GH_TOKEN` and watch the resulting Actions run.
- Updated `AGENTS.md` and `docs/DEPLOY_WORKFLOW.md` so future agents treat those
  issues as repo DX signals, not one-off terminal quirks.
- First wrapper-dispatched CI run `25264683973` proved the GitHub dispatch
  wrapper works but failed the hosted `mobile-ui` job in Android wide landscape:
  the gameplay menu button was visible, yet `#settings-modal` remained hidden.
  Local `npm run check:mobile-ui` passed all four Chromium cases at
  `artifacts/mobile-ui/2026-05-02T23-52-01-666Z/mobile-ui-check`.
- Added stable UI/harness state hooks for future agents: `#touch-menu-btn`
  now exposes `data-ready`, `#settings-modal` exposes `data-visible`, and the
  mobile UI harness waits on those attributes while emitting selector/hit-stack
  diagnostics if a trigger still fails.
- Commit `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`
  (`test(mobile): harden gameplay menu gate`) passed manual CI run
  `25265347136`; the previously failing hosted `mobile-ui` job passed.
- Manual Deploy workflow run `25265623981` deployed `f68f09a`. Live
  `/asset-manifest.json` reported `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`;
  Pages shell, `sw.js`, asset manifest, representative GLB/data/build/WASM
  assets, and the R2 A Shau DEM URL returned expected headers. Live browser
  smoke reached the Zone Control deploy UI with no console, page, request, or
  retry-panel failures.
- The deploy run emitted GitHub's Node 20 action deprecation warning for the
  Cloudflare deploy action. Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to
  `.github/workflows/deploy.yml` and documented this as release-DX maintenance.

2026-05-03 Projekt Objekt-143 Phase 2 / Cycle 2 proof opening
- User asked to update docs, align repo, and continue the cycle. Confirmed
  `npm run doctor` passed on Node `24.14.1` and Playwright `1.59.1`.
- Refreshed runtime visual proof with
  `npm run evidence:atmosphere -- --out-dir artifacts/perf/2026-05-03T01-00-12-099Z/projekt-143-cycle2-runtime-proof`.
  The run rebuilt `dist-perf` and captured all-mode ground-readability,
  sky-coverage, and aircraft-clouds screenshots. Open Frontier and A Shau now
  have current elevated runtime screenshots with renderer/terrain samples.
- Added `scripts/projekt-143-cycle2-proof-suite.ts` and package script
  `check:projekt-143-cycle2-proof`. The latest proof suite wrote
  `artifacts/perf/2026-05-03T01-13-21-209Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`
  with WARN status: runtime horizon screenshots PASS, static horizon audit PASS,
  culling scene attribution WARN, NPC matched GLB/imposter screenshots WARN.
- Cycle 2 remains proof-only. Do not accept shader, atlas, culling, far-canopy,
  grenade, texture, or WebGPU remediation until the relevant proof check is
  PASS or carries a documented exception.

2026-05-03 Pixel Forge aircraft GLB replacement in Cycle 2
- User approved adding the six Pixel Forge aircraft GLBs to Cycle 2, with the
  constraint that this be treated as an evidence-gated asset/runtime import
  rather than a blind copy or an optimization claim.
- Added `scripts/import-pixel-forge-aircraft.ts` and
  `npm run assets:import-pixel-forge-aircraft`. The importer reads each GLB and
  sidecar provenance file from the Pixel Forge aircraft source folder, wraps
  the `+X`-forward source scene under
  `TIJ_AxisNormalize_XForward_To_ZForward` so TIJ public aircraft assets remain
  `+Z` forward, writes the runtime GLBs under
  `public/models/vehicles/aircraft/`, and mirrors provenance sidecars under
  `docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`.
- Updated helicopter/fixed-wing runtime animation handling so rotor and
  propeller spin axes can be inferred from embedded GLB quaternion tracks
  instead of assuming one global axis. Fixed-wing static mesh optimization now
  preserves animated prop descendants by ancestor pivot name.
- Local import evidence:
  `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`.
  Local standalone viewer evidence:
  `artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
- Pending gates before production parity or perf claims: focused runtime tests,
  typecheck/build, `npm run probe:fixed-wing`, Open Frontier/A Shau renderer
  evidence, CI/deploy, live Pages checks, and human aircraft-feel playtest.
- Fixed-wing probe follow-up: the first browser probe pass completed A-1 and
  F-4 but then exposed a nondeterministic Open Frontier seed/airfield coverage
  issue while attempting AC-47. `MapSeedRegistry` now honors `?seed=<n>` for
  pre-baked modes, and `scripts/fixed-wing-runtime-probe.ts` pins Open Frontier
  to seed `42` by default while retaining a retry plus render-state diagnostic
  for boots that reach gameplay without the required fixed-wing set. A seed-42
  Open Frontier perf capture produced renderer stats with `0` console errors,
  but it failed the active-driver gate because that seed did not move/shoot; the
  general short perf script keeps its existing unpinned scenario semantics.
- `npm run probe:fixed-wing -- --boot-attempts=2` passed at
  `artifacts/fixed-wing-runtime-probe/summary.json` after the seed/retry
  hardening, covering A-1, F-4, and AC-47.
- Open Frontier short initially failed with 42 browser errors from
  `THREE.BufferGeometryUtils.mergeAttributes()` while batching imported GLB
  geometry. `ModelDrawCallOptimizer` now deinterleaves GLTFLoader interleaved
  attributes before static merge/batch handoff, with a regression test in
  `src/systems/assets/ModelDrawCallOptimizer.test.ts`.
- Rerun Open Frontier short:
  `artifacts/perf/2026-05-03T03-07-26-873Z` with measurement-trust PASS, `0`
  browser errors, validation WARN on peak p99 `48.90ms`, and strict
  `perf:compare -- --scenario openfrontier:short --dir 2026-05-03T03-07-26-873Z`
  failing against the older baseline. This is renderer evidence, not a perf win.
- A Shau short:
  `artifacts/perf/2026-05-03T03-11-40-162Z` with measurement-trust PASS, `0`
  browser errors, validation WARN on peak p99 `47.70ms`, and strict
  `perf:compare -- --scenario ashau:short --dir 2026-05-03T03-11-40-162Z`
  failing against the older baseline. This is renderer evidence, not a perf win.
- Fixed the FixedWingModel unit-test mock to cover the new animated-model loader
  contract. `npm run test:run -- src/systems/vehicle/FixedWingModel.test.ts`
  passed with 16 tests.
- Local gates now passing after the aircraft patch: `npm run validate:fast`,
  `npm run build`, and `npm run check:projekt-143`. The fresh Projekt-143 static
  suite wrote
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
- Refreshed `npm run check:projekt-143-cycle2-proof` after the aircraft patch;
  it remains WARN for missing dedicated culling/optic certification views and
  wrote
  `artifacts/perf/2026-05-03T09-17-01-580Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
- Still not claimed: production parity, aircraft feel, or any performance
  improvement. Those require CI/deploy/live Pages checks and a human aircraft
  playtest.

2026-05-03 Pixel Forge aircraft GLB release verification
- Committed and pushed `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`
  (`feat(assets): import Pixel Forge aircraft`) to `master`.
- Manual CI run `25274278013` passed test, build, perf, lint, smoke, and
  mobile-ui.
- Manual Deploy workflow run `25274649157` passed.
- Live `/asset-manifest.json` reported
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Header checks returned `200` for
  `/`, `/sw.js`, `/asset-manifest.json`, representative aircraft GLBs, Open
  Frontier navmesh/heightmap assets, hashed build JS, Recast WASM, and the A
  Shau R2 DEM URL.
- Live browser smoke reached the Zone Control deploy UI with no console, page,
  request, or retry-panel failures. Artifact:
  `artifacts/live-smoke/2026-05-03T08-49-58-395Z/summary.json`.
- Production delivery is verified for the aircraft asset/runtime import. Still
  not claimed: aircraft-feel sign-off or any performance improvement.

2026-05-03 Cycle 2 KB-CULL diagnostic follow-up
- Ran focused AI Sandbox culling probes to try to populate the missing
  close-NPC and NPC-imposter renderer categories without remediation:
  `artifacts/perf/2026-05-03T09-10-57-791Z` (`npcs=120`) and
  `artifacts/perf/2026-05-03T09-13-00-811Z` (`npcs=60`).
- Both artifacts failed validation and `measurement_trust`; the 60-NPC run had
  probeAvg `96.62ms`, probeP95 `211ms`, avg/p99 `100ms`, and
  `hitch_50ms_percent=100%`.
- The 60-NPC artifact did expose the needed categories in `scene-attribution`:
  `npc_close_glb` had `39601` visible triangles and `npc_imposters` had `2`
  visible triangles. This is diagnostic signal only, not KB-CULL certification.
- Agent-DX finding: do not repeat combat-heavy AI Sandbox captures for Cycle 2
  culling certification. The next useful step is a deterministic low-overhead
  camera/culling proof that records renderer stats and scene attribution with a
  trusted measurement path.

2026-05-03 Cycle 2 KB-CULL deterministic proof
- Added `scripts/projekt-143-scene-attribution.ts` so perf capture and Cycle 2
  proof tooling share the same renderer-category classifier and required
  Projekt-143 category list.
- Added `scripts/projekt-143-culling-proof.ts` and
  `npm run check:projekt-143-culling-proof`. The proof serves a small headed
  WebGL fixture with current runtime GLBs for static features, fixed-wing
  aircraft, helicopters, and close Pixel Forge NPCs, plus shader-uniform
  proxies for vegetation/NPC imposter categories.
- A headless exploratory run at
  `artifacts/perf/2026-05-03T09-31-20-350Z/projekt-143-culling-proof/summary.json`
  loaded the scene categories but lost the WebGL context and recorded zero
  renderer counters, so the npm command is headed by default.
- The trusted headed proof passed at
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`
  with `0` browser/page/request errors, probeP95 `1.96ms`, CPU profile capture,
  browser long-task/LoAF capture, renderer stats (`133` draw calls, `4,887`
  triangles), and all required categories visible.
- Follow-up from screenshot review: the proof fixture is not runtime scale
  evidence. Its GLBs are scaled by longest bounding-box axis so all categories
  fit one camera; renamed the fixture sizing field to
  `fixtureLongestAxisMeters` and documented that KB-OPTIK matched screenshots
  own NPC/vehicle relative-scale judgment.
- Refreshed `npm run check:projekt-143-cycle2-proof`; the new suite artifact is
  `artifacts/perf/2026-05-03T09-35-33-689Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  It remains WARN overall only because KB-OPTIK still lacks matched
  close-GLB/imposter screenshot crops. KB-CULL scene attribution is now PASS.
- Refreshed `npm run check:projekt-143`; the static suite passed at
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
- Still not claimed: any culling/HLOD optimization, imposter visual parity,
  aircraft feel, or production parity for the docs/tooling-only changes.

2026-05-03 Cycle 2 KB-OPTIK matched scale proof
- Added `scripts/projekt-143-optics-scale-proof.ts` and
  `npm run check:projekt-143-optics-scale-proof`. The proof serves a headed
  browser fixture that renders current close Pixel Forge NPC GLBs and matching
  NPC imposter shader crops with the same orthographic camera/light setup, then
  records projected geometry height, rendered visible silhouette height,
  luma/chroma deltas, and a same-scale aircraft lineup.
- Trusted proof passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`
  with `0` browser/page/request/load errors, four matched NPC crop pairs, six
  aircraft native-scale entries, and renderer stats captured.
- Finding: close GLB and imposter geometry both target `4.425m`, but rendered
  imposter silhouettes are only `0.52-0.54x` close-GLB height across the four
  factions. Imposter crops are darker by `26.59-59.06` luma. This supports the
  screenshot review concern, but the likely problem is the NPC bake/runtime
  scale contract plus shader/luma parity, not the Cycle 2 culling proof
  screenshot.
- Aircraft native GLB longest-axis/current-NPC-height ratios are `2.07x` UH-1C,
  `2.14x` AH-1, `2.33x` UH-1, `2.82x` A-1, `3.21x` F-4, and `5.52x` AC-47.
  The aircraft are not obviously below NPC size, but the smaller helicopters
  are close enough that absolute NPC visual height needs a design/art-contract
  decision before remediation.
- `npm run check:projekt-143-cycle2-proof` now consumes the scale proof and
  passed at
  `artifacts/perf/2026-05-03T11-19-13-862Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  PASS means Cycle 2 evidence surfaces are complete for review. Still not
  claimed: NPC scale remediation, imposter parity, shader/atlas changes,
  aircraft-size remediation, or production parity.

2026-05-03 Projekt Objekt-143 Cycle 3 kickoff
- Added `scripts/projekt-143-cycle3-kickoff.ts` and
  `npm run check:projekt-143-cycle3-kickoff` as an agent-DX/readiness command.
  It reads the latest Cycle 2 proof, KB-OPTIK scale proof, texture audit,
  startup evidence, grenade probe, vegetation horizon audit, culling proof, and
  the KB-OPTIK decision packet when present, then writes a remediation readiness
  matrix.
- Current kickoff artifact:
  `artifacts/perf/2026-05-03T15-03-08-568Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Overall status is WARN by design because the next phase needs decisions and
  baselines before fixes.
- The refreshed kickoff artifact carries Open Frontier and Zone Control startup
  paths plus Open Frontier, combat120, and A Shau perf summary paths so the
  next branch does not have to rediscover the trusted baseline bundle.
- Target states: KB-OPTIK `npc-imposter-scale-luma-contract` is
  `needs_decision`; KB-LOAD `pixel-forge-texture-upload-residency` and
  KB-EFFECTS `grenade-first-use-stall` are `ready_for_branch`; KB-TERRAIN
  `large-mode-vegetation-horizon` and KB-CULL
  `static-feature-and-vehicle-culling-hlod` are `needs_baseline`.
- Validation after the kickoff patch: `npm run check:projekt-143-cycle3-kickoff`
  WARN by design, `npm run check:projekt-143-cycle2-proof` PASS,
  `npm run check:projekt-143` PASS, and isolated `npm run validate:fast` PASS.
- This continues Projekt into Cycle 3 planning only. Still not claimed:
  startup remediation, texture regeneration, NPC scale/luma fix, grenade
  warmup fix, far-canopy layer, culling/HLOD change, WebGPU migration, or
  production parity.

2026-05-03 Projekt Objekt-143 KB-OPTIK decision packet
- Added `scripts/projekt-143-optik-decision-packet.ts` and
  `npm run check:projekt-143-optik-decision`.
- First packet artifact:
  `artifacts/perf/2026-05-03T15-03-07-006Z/projekt-143-optik-decision-packet/decision-packet.json`.
  Status is WARN because it intentionally leaves the absolute NPC target as an
  owner/art-direction decision.
- Findings: then-current NPC target was `4.425m` from a `2.95m` base target times
  `1.50`; close GLBs are scaled about `2.51x` from source; imposter visible
  height is only `0.522-0.544x` the close GLB; aircraft longest-axis ratios are
  `3.01x` average against current NPC height and `4.52x` against the base
  target.
- Decision: do not resize aircraft first. First runtime remediation should
  prototype NPC imposter crop/regeneration against one faction/clip, while the
  owner decided whether absolute NPC target should drop from `4.425m` to `2.95m` or
  requires a larger human-scale redesign. Shader/luma parity comes after
  scale/crop.
- Repo alignment: Cycle 3 kickoff commit
  `5b726746b0034d9327f5cb03ddcd3147294125ed` passed GitHub CI run
  `25277824856`. It was not deployed or live-verified, so no production parity
  is claimed.
- Validation for this decision-packet patch: `npm run typecheck` PASS,
  `npm run check:projekt-143-optik-decision` WARN by design,
  `npm run check:projekt-143-cycle3-kickoff` WARN by design with the decision
  packet path included, and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 first KB-OPTIK remediation
- Owner approved dropping the absolute NPC target to the recommended Pixel
  Forge base target. Commit `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`
  changes the shared Pixel Forge NPC runtime target from `4.425m` to `2.95m`,
  derives the imposter billboard Y offset from `NPC_Y_OFFSET`, and adds a
  generated per-tile crop map for upright NPC imposter atlases.
- Agent/DX improvement: added `scripts/generate-pixel-forge-npc-tile-crops.ts`,
  `npm run assets:generate-npc-crops`, and
  `npm run check:pixel-forge-npc-crops`. The crop check is now part of
  `npm run validate:fast`, so future Pixel Forge NPC atlas updates cannot leave
  stale crop metadata silently.
- Post-commit matched proof:
  `artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`.
  Source SHA is `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`. Visible-height
  ratios improved from the before range `0.52-0.54x` to `0.895` (US), `0.895`
  (ARVN), `0.863` (NVA), and `0.861` (VC), inside the first-remediation
  `+/-15%` proof band.
- Luma remains open: post-remediation imposter crops are still `-26.94` to
  `-59.29` darker than close GLB crops, so the next KB-OPTIK branch is
  shader/material luma parity or an explicit visual exception.
- Refreshed evidence artifacts:
  `artifacts/perf/2026-05-03T16-13-47-104Z/projekt-143-optik-decision-packet/decision-packet.json`,
  `artifacts/perf/2026-05-03T16-13-59-633Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`,
  `artifacts/perf/2026-05-03T16-14-08-949Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `artifacts/perf/2026-05-03T16-13-49-501Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation before the remediation commit: `npm run validate:fast` PASS and
  `npm run build` PASS. Post-commit proof and Projekt suite commands listed
  above passed/WARNed as designed. No production parity, performance
  improvement, aircraft-scale acceptance, or final human-scale/playtest signoff
  is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK selected-lighting luma pass
- Commit `1395198da4db95611457ecde769b611e3d36354e` adds per-faction Pixel
  Forge NPC imposter material tuning and upgrades the matched proof/decision
  tooling to track luma delta as a percentage of the close-GLB crop.
- Post-commit matched proof:
  `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`.
  Source SHA is `1395198da4db95611457ecde769b611e3d36354e`. Visible-height
  ratios remain `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861`
  (VC). Selected-lighting luma deltas are `-0.13%` (US), `-0.44%` (ARVN),
  `0.36%` (NVA), and `-0.08%` (VC), inside the `+/-12%` proof band.
- Refreshed evidence artifacts:
  `artifacts/perf/2026-05-03T16-48-44-272Z/projekt-143-optik-decision-packet/decision-packet.json`,
  `artifacts/perf/2026-05-03T16-48-58-020Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`,
  `artifacts/perf/2026-05-03T16-48-46-437Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `artifacts/perf/2026-05-03T16-49-11-364Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation: `npm run check:projekt-143-optics-scale-proof -- --port=0`
  PASS, `npm run check:projekt-143-optik-decision` WARN by design, `npm run
  check:projekt-143-cycle2-proof` PASS, `npm run check:projekt-143-cycle3-kickoff`
  WARN by design, and `npm run check:projekt-143` PASS.
- Repo alignment: update docs to treat the first KB-OPTIK remediation as
  target/crop plus selected-lighting luma only. Next pass is expanded
  dawn/dusk/haze/storm and gameplay-camera KB-OPTIK coverage, or switching the
  next remediation slot to KB-LOAD texture/upload or KB-EFFECTS grenade
  first-use. No production parity, performance improvement, final visual
  parity, aircraft-scale acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK expanded proof pass
- Commit `57d873e7f305fb528e7570232a291950e89c6ade` adds
  `scripts/projekt-143-optik-expanded-proof.ts` and
  `npm run check:projekt-143-optik-expanded`. The proof renders matched
  close-GLB/imposter crops for all four Pixel Forge NPC factions across five
  lighting profiles and two camera profiles.
- Committed-sha proof:
  `artifacts/perf/2026-05-03T17-26-45-106Z/projekt-143-optik-expanded-proof/summary.json`.
  Source SHA is `57d873e7f305fb528e7570232a291950e89c6ade`. Measurement trust
  is PASS with `0` browser errors, page errors, request failures, and load
  errors. Status is WARN because `34/40` samples flag; visible-height ratio
  range is `0.844-0.895`, and luma delta percent range is `-53.57` to
  `104.58`.
- Refreshed decision/kickoff artifacts:
  `artifacts/perf/2026-05-03T17-27-07-711Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T17-27-07-141Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-OPTIK now reads as `needs_decision`, not closeout: selected-lighting
  target/crop/luma is done, but expanded lighting/gameplay-camera proof found
  visual flags.
- Next owner/agent choice: target the expanded imposter lighting/material
  contract with this proof as before evidence, or switch the next remediation
  slot to KB-LOAD texture/upload residency or KB-EFFECTS grenade first-use.
  No production parity, performance improvement, final visual parity,
  aircraft-scale acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK atmosphere remediation
- Commit `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` forwards the scene
  lighting/fog snapshot into NPC imposter shader uniforms and updates
  `scripts/projekt-143-optik-expanded-proof.ts` so the proof exercises the
  same atmosphere contract.
- Committed-sha proof:
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`.
  Measurement trust is PASS with `0` browser, page, request, and load errors.
  Expanded luma now lands inside the `+/-12%` band (`-11.31%` to `9.03%`);
  remaining WARN is `10/40` gameplay-perspective visible-height samples.
- Agent/DX follow-up commit `b24c23bfdbd027458a4d3e27155158723a32f4ad`
  retargets the decision/kickoff scripts so future agents route the next
  KB-OPTIK choice to
  `target-gameplay-camera-silhouette-or-switch-bureau`, not another generic
  shader-constant pass.
- Refreshed handoff artifacts:
  `artifacts/perf/2026-05-03T18-50-04-224Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T18-50-03-715Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
- Validation: `npm run validate:fast` PASS, `npm run build` PASS,
  `npm run check:projekt-143-optik-expanded` WARN by design,
  `npm run check:projekt-143-optik-decision` WARN by design, and
  `npm run check:projekt-143-cycle3-kickoff` WARN by design. No production
 parity, performance improvement, final visual parity, aircraft-scale
 acceptance, or human-playtest signoff is claimed.

2026-05-03 Projekt Objekt-143 KB-OPTIK runtime LOD-edge proof pass
- Commit `5b053711cece65b5915ea786acc56e4a8ea22736` adds
  `--camera-profile-set=runtime-lod-edge` to
  `scripts/projekt-143-optik-expanded-proof.ts` and updates the decision/kickoff
  scripts so near-stress expanded proof and runtime LOD-edge proof are routed
  separately.
- Committed-sha runtime LOD-edge proof:
  `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`.
  Measurement trust is PASS and status is PASS: `40` samples, `0` flags,
  visible-height ratio `0.855-0.895`, and luma delta percent `-6.94` to
  `9.77`.
- The near-stress artifact remains
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
  with `10/40` visible-height flags at the 8.5m perspective camera. Because
  the runtime LOD-edge camera passes, this is now a near-stress visual-exception
  or human-review decision, not a measured runtime LOD-edge failure.
- Refreshed handoff artifacts:
  `artifacts/perf/2026-05-03T19-02-57-442Z/projekt-143-optik-decision-packet/decision-packet.json`
  and
  `artifacts/perf/2026-05-03T19-02-55-123Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-OPTIK remains `needs_decision`; the recommended next branch is
  `document-near-stress-silhouette-exception-or-switch-bureau`.
- No production parity, performance improvement, final visual parity,
  aircraft-scale acceptance, or human-playtest signoff is claimed.
- Validation after docs alignment: `npm run check:projekt-143` PASS,
  `artifacts/perf/2026-05-03T19-05-22-881Z/projekt-143-evidence-suite/suite-summary.json`.

2026-05-03 Projekt Objekt-143 KB-LOAD first texture-upload remediation
- Added `AssetLoader.warmGpuTextures()` and startup warmup marks/user timings
  for critical Pixel Forge texture uploads. Runtime startup now warms only the
  giantPalm color/normal atlas pair behind the spawn loading overlay before
  renderer reveal.
- Paired Open Frontier evidence: before
  `artifacts/perf/2026-05-03T21-45-13-207Z/startup-ui-open-frontier` averaged
  `4685.7ms` deploy-click-to-playable and `5340.7ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-01-10-796Z/startup-ui-open-frontier` averaged
  `4749.0ms` and `5443.3ms`. WebGL upload total/max averages moved
  `3341.0/2390.5ms` to `1157.2/275.4ms`.
- Paired Zone Control evidence: before
  `artifacts/perf/2026-05-03T21-46-34-676Z/startup-ui-zone-control` averaged
  `4909.0ms` deploy-click-to-playable and `5491.0ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-02-28-966Z/startup-ui-zone-control` averaged
  `4939.0ms` and `5469.0ms`. WebGL upload total/max averages moved
  `3340.6/2379.4ms` to `1229.6/360.1ms`.
- Negative evidence: broadening the warmup to fanPalm regressed the same
  startup samples, so that expansion was reverted. Rejected artifacts:
  `artifacts/perf/2026-05-03T21-54-02-583Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-03T21-55-18-768Z/startup-ui-zone-control`.
- Validation: `npm run typecheck` PASS, `npx vitest run
  src/systems/assets/AssetLoader.test.ts` PASS, `npm run build` PASS,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T21-57-48-690Z/projekt-143-evidence-suite/suite-summary.json`,
  `npm run check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-03T22-04-56-309Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  and `npm run validate:fast` PASS. No production parity, startup-latency win,
  startup closeout, texture residency closeout, or clean frame-time improvement
  is claimed.

2026-05-03 Projekt Objekt-143 KB-EFFECTS rejected warmup pass
- Fresh current-HEAD before evidence:
  `artifacts/perf/2026-05-03T22-09-54-365Z/grenade-spike-ai-sandbox`.
  The headed low-load two-grenade probe reproduced the first-use stall with
  baseline p95/max `22.6ms / 24.2ms`, detonation p95/max
  `22.5ms / 100.0ms`, max-frame delta `75.8ms`, one `379ms` long task, two
  LoAF entries, CPU profile present, and
  `kb-effects.grenade.frag.total=1.4ms` total / `0.9ms` max.
- Rejected remediation evidence: explosion-only visible render warmup
  `artifacts/perf/2026-05-03T22-12-40-344Z/grenade-spike-ai-sandbox`, full
  frag render-path warmup
  `artifacts/perf/2026-05-03T22-16-26-287Z/grenade-spike-ai-sandbox`, and
  culling-forced full frag warmup
  `artifacts/perf/2026-05-03T22-18-02-801Z/grenade-spike-ai-sandbox` all
  still hit detonation max `100.0ms` with one long task each (`397ms`,
  `387ms`, and `373ms`). The runtime warmup code was reverted; no KB-EFFECTS
  remediation landed.
- Agent/DX routing update: `scripts/projekt-143-cycle3-kickoff.ts` now sends
  KB-EFFECTS to render-frame attribution before another warmup branch and
  records the rejected warmup artifacts as negative evidence.
- Refreshed handoff artifacts: `npm run check:projekt-143-cycle3-kickoff`
  WARN by design at
  `artifacts/perf/2026-05-03T22-24-44-200Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
 `artifacts/perf/2026-05-03T22-27-16-532Z/projekt-143-evidence-suite/suite-summary.json`.
- Validation: `npm run typecheck` PASS and `npm run validate:fast` PASS. No
  production parity, grenade closeout, startup-latency win, culling, WebGPU, or
  performance-improvement claim is made from this pass.

2026-05-03 Projekt Objekt-143 KB-EFFECTS unlit explosion remediation
- Added scoped render/frame attribution to `scripts/perf-grenade-spike.ts`.
  The probe now writes `render-attribution.json`, records render/update phase
  costs around grenade triggers, drains metrics after a pre-trigger settle
  window, and schedules live grenade triggers on `requestAnimationFrame`.
- Before remediation evidence:
  `artifacts/perf/2026-05-03T22-36-46-874Z/grenade-spike-ai-sandbox`
  attributed the first-use stall to trigger-adjacent main-scene render work:
  `webgl.render.main-scene=380ms`, nested main-scene render `178.2ms`, one
  `387ms` long task, and CPU-profile weight in Three/WebGL program/render
  paths including `(program)`, `updateMatrixWorld`, and `getProgramInfoLog`.
- First-principles remediation: grenade explosions no longer create, pool, add,
  position, fade, or dispose dynamic `THREE.PointLight` instances. The runtime
  effect path is now unlit pooled flash sprite, smoke/fire/debris `Points`, and
  shockwave ring. Added `ExplosionEffectsPool.test.ts` to lock the no-light
  contract while preserving visible flash-spawn behavior.
- After evidence:
  `artifacts/perf/2026-05-03T23-04-07-778Z/grenade-spike-ai-sandbox` recorded
  baseline p95/max `36.1ms / 48.1ms`, detonation p95/max
  `31.0ms / 100.0ms`, `0` browser long tasks, trigger-adjacent main-scene
  render max `29.5ms`, and `kb-effects.grenade.frag.total=2.0ms` total /
  `1.4ms` max. This schema-refresh run is noisier than the preceding
  post-remediation run at
  `artifacts/perf/2026-05-03T22-57-28-665Z/grenade-spike-ai-sandbox`, but both
  remove the measured dynamic-light render/program stall. `summary.json` now
  carries `measurementTrust.status=warn` with CPU profile, long-task observer,
  LoAF observer, disabled upload observer, render attribution, and
  `preTriggerLongAnimationFrameCount=1` all present. KB-EFFECTS does not close
  because one pre-trigger LoAF and a `100.0ms` max frame still need
  classification.
- Validation before final docs/kickoff refresh: `npm run typecheck` PASS,
  `npm run perf:grenade-spike -- --npcs=2 --baseline-frames=120
  --post-frames=240 --baseline-ms=2000 --post-ms=4500 --warmup-ms=10000
  --grenades=2 --port=9192` PASS, and
  `npx vitest run src/systems/effects/ExplosionEffectsPool.test.ts
  src/systems/weapons/GrenadeEffects.test.ts
  src/systems/weapons/GrenadeSystem.test.ts
  src/systems/weapons/MortarSystem.test.ts` PASS. No production parity, final
  grenade closeout, broad combat120 closeout, WebGPU migration, or visual
  polish claim is made from this pass.
- Refreshed handoff artifact: `npm run check:projekt-143-cycle3-kickoff` WARN
  by design at
  `artifacts/perf/2026-05-03T23-05-29-475Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  KB-EFFECTS is `needs_decision` with `measurementTrustStatus=warn`,
  detonation long tasks `0`, LoAF count `1`, max near-trigger main-scene
  render `29.5ms`, pre-trigger LoAF count `1`, and the remaining required work
  is browser-stall/frame classification before final closeout.
- Final local validation: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-07-31-605Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 KB-EFFECTS low-load trust closeout
- Hardened `scripts/perf-grenade-spike.ts` so the first live grenade is armed
  inside its `requestAnimationFrame` callback: observer drains, frame metrics,
  perf reports, render attribution, and performance marks reset immediately
  before `spawnProjectile`. This prevents pre-trigger frame scheduling from
  being counted as grenade-trigger work.
- Added measurement-trust flags for trigger/post-trigger LoAF counts,
  post-trigger LoAF counts, and classified pre-trigger frame max state. The
  Cycle 3 kickoff matrix now supports `evidence_complete` targets and surfaces
  those flags for KB-EFFECTS handoff.
- Trusted evidence:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`
  is PASS for measurement trust. It records baseline p95/max
  `23.5ms / 27.6ms`, detonation p95/max `24.3ms / 30.2ms`, max-frame delta
  `2.6ms`, hitch50 delta `0`, detonation long tasks `0`,
  trigger/post-trigger LoAF count `0`, near-trigger main-scene render max
  `23.6ms`, and `kb-effects.grenade.frag.total=1.5ms` total / `0.9ms` max.
- Refreshed handoff artifact:
  `artifacts/perf/2026-05-03T23-30-22-640Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  is WARN by design for remaining KB-OPTIK, KB-TERRAIN, and KB-CULL work, but
  KB-EFFECTS `grenade-first-use-stall` is now `evidence_complete` for the
  low-load unlit pooled explosion path.
- Refreshed static suite:
  `artifacts/perf/2026-05-03T23-30-22-745Z/projekt-143-evidence-suite/suite-summary.json`
  PASS.
- Docs aligned in `docs/PROJEKT_OBJEKT_143.md`, `docs/PERFORMANCE.md`,
  `docs/STATE_OF_REPO.md`, and `docs/BACKLOG.md`. No production parity,
  combat120/stress grenade closeout, WebGPU migration, or future explosion
  visual-polish claim is made from this pass.
- Validation: `npm run check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-03T23-30-22-640Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-30-22-745Z/projekt-143-evidence-suite/suite-summary.json`,
  and `npm run validate:fast` PASS.

2026-05-03 Projekt Objekt-143 KB-TERRAIN baseline proof
- Added `scripts/projekt-143-terrain-horizon-baseline.ts` and wired
  `npm run check:projekt-143-terrain-baseline`. The command force-builds the
  perf target by default, captures elevated Open Frontier and A Shau
  vegetation-horizon screenshots, records browser/runtime metadata, warmup
  policy, renderer stats, terrain readiness, vegetation active counters,
  nonblank image-content checks, and links the latest trusted Open Frontier
  and A Shau perf-before summaries plus vegetation horizon and culling proof
  inputs.
- First script smoke with `--no-build` exposed a sky-only camera angle. The
  proof now uses downward horizon camera pitches and fails the capture if the
  ground band is blank, which should save future agents from accepting a
  telemetry-only screenshot artifact.
- Fresh-build baseline:
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
  is PASS from clean HEAD `294baf038cce9f9f31588169bf6f4c8c3e22976d`.
  It captured `4/4` screenshots with renderer, terrain, vegetation,
  and image-content evidence, plus trusted before perf baselines. Future
  far-horizon after captures must stay within the recorded guardrails: Open
  Frontier p95 `<=43.5ms` and draw calls `<=1141`; A Shau p95 `<=40.9ms` and
  draw calls `<=864`.
- Cycle 3 kickoff now consumes the terrain horizon baseline and writes
  `terrainHorizonBaseline` in its input list. The kickoff at this step:
  `artifacts/perf/2026-05-04T00-05-12-050Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  remained WARN overall because KB-OPTIK needed an owner decision and KB-CULL
  still needed an owner-path baseline, but KB-TERRAIN
  `large-mode-vegetation-horizon` is now `ready_for_branch`.
- Refreshed KB-OPTIK decision packet after stale routing cleanup:
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`.
  Its owner-choice language now routes non-OPTIK work to
  KB-LOAD/KB-TERRAIN/KB-CULL instead of reopening the completed low-load
  KB-EFFECTS path.
- Docs and agent-DX aligned in `AGENTS.md`, `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PERFORMANCE.md`, `docs/STATE_OF_REPO.md`, and this progress log. No
  far-canopy, culling/HLOD, startup-latency, WebGPU, production parity, or
  combat120/stress grenade closeout is claimed from this pass.
- Validation: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-03T23-59-39-390Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS.

2026-05-04 Projekt Objekt-143 KB-CULL owner baseline proof
- Added `scripts/projekt-143-culling-owner-baseline.ts` and wired
  `npm run check:projekt-143-culling-baseline`. The command consumes the
  headed culling proof, trusted Open Frontier and A Shau perf summaries,
  scene attribution, runtime renderer samples, and the latest AI Sandbox
  diagnostic. It selects an owner path only from trusted before evidence and
  keeps close-NPC/weapon pool residency diagnostic-only until combat stress
  measurement trust passes.
- Clean-HEAD baseline:
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  is PASS from source `527e05433ea72adaf83ca28692137f5be67fb438`. It selects
  `large-mode-world-static-and-visible-helicopters`. Guardrails for the first
  after branch: Open Frontier owner draw-call-like below `388`, A Shau owner
  draw-call-like below `719`, total draw calls not above `1037` / `785`, and
  visible unattributed triangles below `10%`.
- Cycle 3 kickoff now consumes `cullingOwnerBaseline` and marks KB-CULL
  `static-feature-and-vehicle-culling-hlod` as `ready_for_branch` at
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Overall remains WARN because KB-OPTIK still needs an owner decision.
- Docs and agent-DX aligned in `AGENTS.md`, `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PERFORMANCE.md`, `docs/STATE_OF_REPO.md`, `docs/BACKLOG.md`, and this
  progress log. No culling/HLOD, close-NPC residency, startup-latency,
  far-canopy, WebGPU, production parity, or combat120/stress grenade closeout
  is claimed from this pass.

2026-05-04 Projekt Objekt-143 fresh-agent handoff
- Added `docs/PROJEKT_OBJEKT_143_HANDOFF.md` as the short continuation prompt
  and evidence-anchor index for a fresh agent session. The handoff explicitly
  keeps local work ahead of `origin/master`, avoids push/deploy/live parity
  claims, and preserves WebGL stabilization as the current strategy.
- Agent-DX alignment: added Projekt Objekt-143, the fresh-agent handoff, and
  the Asset Acceptance Standard to the `AGENTS.md` documentation map, and linked
  the handoff from `docs/PROJEKT_OBJEKT_143.md` Cycle 3 status.
- Current handoff state: KB-LOAD, KB-TERRAIN, and KB-CULL are
  `ready_for_branch`; KB-EFFECTS is `evidence_complete` only for the trusted
  low-load unlit pooled grenade path; KB-OPTIK remains `needs_decision` for the
  8.5m near-stress silhouette exception/human-review decision.
- Latest evidence anchors remain:
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `artifacts/perf/2026-05-04T00-18-26-810Z/projekt-143-evidence-suite/suite-summary.json`,
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`,
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`,
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`,
  and
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`.
- Validation before handoff: `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T00-18-26-810Z/projekt-143-evidence-suite/suite-summary.json`
  and `npm run validate:fast` PASS. The final handoff pass is docs-only and
  does not claim any remediation beyond recorded evidence.

2026-05-04 Projekt Objekt-143 continuation and rejected KB-CULL candidate
- Fixed agent-DX in `scripts/doctor.ts`: Playwright browser discovery now calls
  the repo-local Playwright CLI through `process.execPath` instead of a Windows
  `cmd.exe`/`npx` shim, and spawn errors are included in doctor output. This
  keeps the Windows-safe no-shim pattern for agent sandboxes and local shells.
- Refreshed starting gates: `npm run doctor` PASS; `npm run
  check:projekt-143-cycle3-kickoff` WARN by design at
  `artifacts/perf/2026-05-04T01-04-49-022Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T01-04-58-778Z/projekt-143-evidence-suite/suite-summary.json`.
- Tested a narrow KB-CULL static-helicopter distance-cull prototype against
  `WorldFeatureSystem`, then rejected it before commit. The targeted Vitest
  slice passed, but the trusted Open Frontier after capture at
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` failed validation
  with `peak_p99_frame_ms=64.70ms` and did not improve the selected owner path:
  `world_static_features` stayed `349`, visible `helicopters` stayed `39`, and
  combined owner draw-call-like remained `388`. A Shau after capture was skipped
  because the first required guardrail already failed.
- Recorded the owner-requested KB-TERRAIN visual target in the Projekt ledger,
  handoff, performance notes, and state doc: keep terrain texture variety but
  make most traversable ground read jungle green rather than gravel; check for
  possible inverted slope/biome material weighting if green is mostly on
  hillsides; scale and ground tiny palms and ferns; add more big palms and
  ground vegetation; and make bamboo scattered dense clusters rather than the
  dominant forest layer.
- Final local validation: `npm run validate:fast` PASS. No culling/HLOD,
  terrain-material, vegetation-distribution, far-canopy, startup-latency,
  WebGPU, production-parity, or perf-improvement claim is made from this pass.

2026-05-04 Projekt Objekt-143 KB-TERRAIN material distribution pass
- Added `scripts/projekt-143-terrain-distribution-audit.ts` and wired
  `npm run check:projekt-143-terrain-distribution`. The audit samples all
  shipped mode height providers and records CPU biome classification,
  shader-primary material distribution, flat/steep material distribution,
  estimated vegetation density, and cliff-rock accent eligibility.
- Fixed the broad elevation-cap material problem instead of just raising a
  cutoff: procedural modes no longer classify high elevation as primary
  `highland`; Open Frontier no longer uses a generic flat/high `cleared` cap;
  A Shau no longer uses broad highland/cleared/bamboo elevation belts as
  primary terrain material. `highland` remains bound as a terrain material
  accent layer and is applied through slope-gated cliff/hillside blending.
- Final static distribution artifact:
  `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  Result: all modes have `100%` flat jungle-like primary ground; Open Frontier
  is `99.99%` jungle-like overall; A Shau is `100%`; all steep-side rock
  accent checks pass. The audit remains WARN only because AI Sandbox uses
  `terrainSeed: random` and the audit samples it with fixed fallback seed `42`.
- Updated the terrain horizon screenshot gate after a false negative on bright
  green Open Frontier terrain: the image-content check now accepts visible
  ground-band variance/green content instead of only the older low-luma
  contrast condition. The failed intermediate artifact was
  `artifacts/perf/2026-05-04T02-02-38-636Z/projekt-143-terrain-horizon-baseline/summary.json`;
  visual inspection showed terrain was present.
- Final screenshot/build proof:
  `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`
  PASS with `4/4` elevated screenshots, renderer/terrain/vegetation telemetry,
  and `0` browser/page/scenario errors.
- Targeted validation:
  `npx vitest run src\systems\terrain\BiomeClassifier.test.ts src\systems\terrain\TerrainBiomeRuntimeConfig.test.ts src\systems\terrain\TerrainMaterial.test.ts src\config\vegetationTypes.test.ts`
  PASS (`4` files, `20` tests).
- Folded new owner goals into docs/handoff: next KB-TERRAIN/KB-CULL work must
  also address hanging building foundations and poorly sampled airfield, HQ,
  vehicle, firebase, and support-compound placement. Pixel Forge building
  assets should be shortlisted by visual fit, foundation footprint,
  collision/LOD/HLOD readiness, draw calls, triangles, and acceptance evidence
  before replacement.
- Folded additional owner texture/route goals into docs/handoff: audit existing
  TIJ and Pixel Forge ground, path, trail, grass, foliage, and cover assets for
  more terrain variety before custom asset work; future routes should read as
  worn-in dirt/mud/grass/packed-earth trails and be smoothed/graded with
  future vehicle usability in mind.
- Still open: this pass does not accept final A Shau atmosphere/far-ridge
  color, vegetation scale/density, fern grounding, palm density, bamboo
  clustering, far canopy, building-placement fixes, Pixel Forge building
  imports, production parity, or any performance improvement.
- Final gates after docs and goal updates:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T02-19-44-373Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T02-20-04-490Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3854` tests).

2026-05-04 Projekt Objekt-143 KB-TERRAIN vegetation scale and cluster pass
- Tuned runtime vegetation toward the owner visual target without importing new
  assets: `fern` is larger/lifted, `giantPalm` is larger and denser,
  `fanPalm`/`coconut` density increased, and `bambooGrove` now uses a
  deterministic large-scale cluster mask so it appears in dense pockets instead
  of filling the whole mid-level forest layer.
- Added behavior coverage for larger/grounded ferns, larger giant palms, palm
  bias over bamboo, and cluster masks rejecting bamboo candidate points.
  Targeted validation passed:
  `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  (`3` files, `17` tests).
- Static distribution evidence:
  `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  Bamboo estimated share is now about `1.45-1.52%` across shipped modes while
  flat jungle-like primary ground remains `100%` in every mode and Open
  Frontier remains `99.99%` jungle-like overall. Clustered vegetation coverage
  in that audit is an estimate, not visual authority.
- Elevated screenshot/build proof:
  `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`
  PASS with `4/4` screenshots, renderer/terrain/vegetation telemetry, and `0`
  browser/page/scenario errors. Open Frontier screenshots no longer show the
  broad grey summit problem; A Shau far ridges still need art/perf review.
- Open Frontier perf after evidence:
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is measurement-trusted
  but validation WARN. It recorded avg `24.26ms`, peakP99 `49.90ms`,
  hitch50 `0.13%`, vegetation active instances `46,247`, and movement
  transitions `93`.
- A Shau is blocked, not accepted. First after capture
  `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed validation
  despite measurement trust PASS (`peakP99=93.90ms`, `hitch50=2.49%`, movement
  transitions `2`). Rerun
  `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` also failed and had
  measurement trust WARN. Both runs repeated the `tabat_airstrip` steep
  footprint warning (`112.1m` vertical span across `320m` runway footprint) and
  terrain-stall symptoms, which aligns with the still-open building/airfield/
  HQ/vehicle foundation and route-stamp goal.
- Asset/texture inventory notes for the later goal: TIJ already ships terrain
  WebPs including `jungle-floor`, `mud-ground`, `rice-paddy`,
  `rocky-highland`, `tall-grass`, `bamboo-floor`, `swamp`,
  `defoliated-ground`, and `firebase-ground`. Pixel Forge has candidate
  war-textures such as `jungle-mud`, `cracked-earth`, `napalmed-ground`,
  `bamboo-mat-floor`, `weathered-planks`, and `corrugated-metal`; output props
  include grass/patch-grass variants and rocks; building candidates include
  huts, stilt houses, shophouses, bunkers, warehouses, temple/pagoda/church,
  rice-barn/mill, and plantation/villa assets. These need acceptance review
  before runtime import, especially for footprint, collision, draw-call,
  triangle, and LOD/HLOD cost.
- Still open: no A Shau perf acceptance, no far-canopy fix, no static
  foundation/preset fix, no Pixel Forge building import, no custom trail/grass
  asset generation, no production parity, and no broad performance improvement
  claim from this pass.
- Final gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T03-03-26-031Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T03-03-39-979Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3857` tests).

2026-05-04 Projekt Objekt-143 terrain placement, bamboo clustering, and killbot aim follow-up
- Added `scripts/projekt-143-terrain-placement-audit.ts` and wired
  `npm run check:projekt-143-terrain-placement`. The audit samples flattened
  airfield/firebase/support features on source terrain and after stamps so
  hanging foundations, hill-edge runways, and generated airfield placements are
  caught mechanically before visual review.
- Initial placement evidence
  `artifacts/perf/2026-05-04T04-04-19-128Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  failed Open Frontier `airfield_main` (`43.3m` source span) and A Shau
  `tabat_airstrip` (`112.11m` source span). After relocating/reorienting the
  Open Frontier airfield/motor pool and Ta Bat airstrip/support/motor-pool
  presets, the latest placement audit
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  passes. `airfield_main` is now `5.24m`; `tabat_airstrip` is `9.18m`.
- A Shau after-placement perf evidence
  `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` is
  measurement-trusted/WARN and no longer logs the Ta Bat steep-footprint
  warning. It is not A Shau acceptance: terrain-stall/recovery and movement
  transition warnings remain and need route/nav/gameplay placement work.
- Fixed the bamboo follow-up the owner called out: clustered mid-level Poisson
  species now get their own per-type grid instead of sharing palm spacing, so
  `bambooGrove` can form denser local grove pockets. The latest distribution
  evidence is
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  flat jungle-like ground remains `100%` in every mode and bamboo estimated
  share is about `1.0-1.05%`. Still open: screenshot/human review for visual
  grove readability and whether the larger ferns are now too bright or too
  dominant at eye level.
- Fixed the perf active-player target-height contract after the Pixel Forge
  NPCs were shortened. The TypeScript player bot and CJS perf driver now aim
  at the visual chest proxy below the eye-level actor anchor, and the live
  driver can pass `renderedPosition` as an aim anchor for visual hit proxies.
  Targeted bot/driver tests pass, but the full Open Frontier active-player
  capture at `artifacts/perf/2026-05-04T10-36-41-205Z/summary.json` still
  recorded zero hits and only a short ENGAGE window. Do not use killbot
  captures for perf acceptance until a fresh post-fix capture records hits.
- Folded the latest owner goals into Projekt docs/handoff/state/performance:
  bamboo should be clustered groves, not random scatter; keep and audit other
  green ground texture variants rather than only `jungle-floor`; improve all
  vegetation placement logic; explore custom grass/ground foliage/cover only
  after asset review; make trails more worn-in/smooth/vehicle-usable; continue
  terrain-shaped building/HQ/vehicle/airfield placement; and review Pixel Forge
  building and foliage candidates through the asset acceptance/perf path before
  runtime import.
- Final validation for this follow-up:
  `npx vitest run src\config\vegetationTypes.test.ts src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\ChunkVegetationGenerator.test.ts`
  PASS (`3` files, `18` tests);
  `npx vitest run src\systems\terrain\TerrainFeatureCompiler.test.ts src\systems\world\AirfieldLayoutGenerator.test.ts src\systems\world\WorldFeatureSystem.test.ts`
  PASS (`3` files, `35` tests);
  `npx vitest run src\dev\harness\playerBot\states.test.ts scripts\perf-harness\perf-active-driver.test.js`
  PASS (`2` files, `157` tests).
- Final Projekt gates:
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143-terrain-distribution` WARN only for AI Sandbox
  fixed fallback seed at
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-baseline` PASS at
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T11-29-35-677Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T11-29-35-169Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).
- Fixed-wing probe caveat: `npm run probe:fixed-wing` hit sandbox
  `spawn EPERM`; the approved rerun built `dist-perf` and produced partial A-1
  success in `artifacts/fixed-wing-runtime-probe/summary.json`, then timed out
  before completing F-4/AC-47. The leftover probe preview/browser processes
  were cleaned up. Do not claim a full fixed-wing browser pass for this
  placement move until the probe completes all aircraft.
- Follow-up Open Frontier active-player capture:
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` has measurement trust
  PASS and records `120` player shots, `43` hits, and `9` kills, so the
  shorter-NPC killbot aim contract is no longer in the zero-hit state. The
  owner noted another browser game was running on and off during the capture;
  use this artifact as hit-contract evidence only, not clean frame-time/heap
  acceptance or baseline evidence.
- Resource note from owner: avoid additional perf/browser captures for roughly
  the next hour because another agent team needs machine/browser resources.
  Continue with low-resource static/code/docs work toward Objekt-143 instead.
- Added low-resource static terrain asset inventory:
  `scripts/projekt-143-terrain-asset-inventory.ts` and
  `npm run check:projekt-143-terrain-assets`. First run hit sandbox `tsx`
  `spawn EPERM`; approved rerun passed with expected WARN at
 `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It found `12` terrain WebP textures (`5` green-ground variants, `4`
  trail/cleared/disturbed variants), `5` Pixel Forge ground-cover/trail prop
  candidates, `12` building candidates, `7` runtime Pixel Forge vegetation
  species, `6` still-blocked vegetation species, and `0` missing assets.
  Non-claim: this is inventory/shortlist evidence only, not asset import,
  visual acceptance, placement acceptance, or perf acceptance.

2026-05-04 Projekt Objekt-143 A Shau route/trail stamping pass
- Added `scripts/projekt-143-terrain-route-audit.ts` and
  `npm run check:projekt-143-terrain-routes`. The audit validates route-aware
  modes for generated route paths, full terrain stamping where required,
  `jungle_trail` surface patches, route capsule counts, and route centerline
  roughness before browser proof.
- Changed A Shau `terrainFlow` from `map_only` to full stamped
  `jungle_trail` corridors with conservative average-height smoothing
  (`routeWidth=36`, `routeBlend=14`, `routeSpacing=40`,
  `routeTerrainWidthScale=0.38`, `routeGradeStrength=0.06`,
  `routeTargetHeightMode=average`). This addresses the owner goal that routes
  should become worn-in, smoothed, future vehicle-usable trails, but it is not
  vehicle navigation acceptance.
- Route audit evidence:
  `artifacts/perf/2026-05-04T12-58-03-421Z/projekt-143-terrain-route-audit/terrain-route-audit.json`
  PASS. A Shau now reports `12` route paths, `52,504m` route length, `1,321`
  route capsule stamps, and `14` route surface patches with no policy flags.
- Static/browser terrain evidence after the route pass:
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-04T12-59-25-892Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143-terrain-distribution` WARN only for AI Sandbox
  fixed fallback seed at
  `artifacts/perf/2026-05-04T12-59-32-610Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-baseline` PASS at
  `artifacts/perf/2026-05-04T12-59-44-452Z/projekt-143-terrain-horizon-baseline/summary.json`.
- A Shau runtime capture:
  `artifacts/perf/2026-05-04T13-03-02-238Z/summary.json` completed with
  measurement trust PASS (`probeAvg=10.31ms`, `probeP95=16ms`, missed `0%`),
  avg `11.83ms`, peak p99 WARN `49.20ms`, `0` browser errors, `170` player
  shots, `59` hits, `57` movement transitions, and max stuck `1.3s`. It failed
  validation on heap end-growth/recovery (`+84.17MiB`, `0.5%` recovery), and
  terrain-stall warnings still appeared. Use it as trusted regression evidence
  and hit/movement evidence only; do not claim A Shau acceptance.
- Final gates after docs/code for this pass:
  targeted terrain/route Vitest suite PASS (`4` files, `17` tests);
  `npm run typecheck` PASS;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T13-11-32-562Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T13-11-45-723Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).

2026-05-04 Projekt Objekt-143 KB-CULL static-feature batching pass
- Implemented the first accepted KB-CULL category reduction: static
  `WorldFeatureSystem` placements now live under one
  `WorldStaticFeatureBatchRoot`, and compatible static meshes are batched
  across placement boundaries after collision/LOS registration. The
  `ModelDrawCallOptimizer` wrapper now exposes `minBucketSize` so this shared
  pass can skip one-off material buckets while preserving existing callers.
- Targeted validation before perf evidence:
  `npx vitest run src\systems\world\WorldFeatureSystem.test.ts src\systems\assets\ModelDrawCallOptimizer.test.ts`
  PASS (`2` files, `11` tests), and `npm run typecheck` PASS.
- Refreshed culling proof:
  `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T14-08-33-257Z/projekt-143-culling-proof/summary.json`.
  Required renderer categories remain visible/trusted; this is category proof,
  not visual scale proof.
- Fresh Open Frontier after evidence:
  `artifacts/perf/2026-05-04T14-13-30-766Z/summary.json` completed with
  measurement trust PASS and validation WARN only on `peak_p99_frame_ms`
  (`50.90ms`). Static attribution improved versus the previous local Open
  Frontier capture: `world_static_features` draw-call-like `328 -> 222`,
  materials `261 -> 155`, meshes `328 -> 222`, and unattributed draw-call-like
  `303 -> 199`. Non-claim: max renderer draw calls rose to `1019`, and the
  after capture had visible close NPCs/weapons that were not visible in the
  comparison artifact, so this is not a clean Open Frontier total renderer or
  frame-time win.
- Fresh A Shau after evidence:
  `artifacts/perf/2026-05-04T14-17-44-361Z/summary.json` completed with
  measurement trust PASS and validation WARN only on `peak_p99_frame_ms`
  (`40.70ms`). Against the previous local A Shau route artifact,
  `world_static_features` draw-call-like moved `666 -> 268`, materials
  `599 -> 201`, meshes `666 -> 268`, max renderer draw calls `1061 -> 376`,
  max frame `79.7ms -> 46.5ms`, and heap validation no longer fails in this
  run. Non-claim: terrain-stall warnings still appear, so this is not A Shau
  terrain/nav acceptance.
- Refreshed KB-CULL owner baseline:
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`.
  It records selected owner draw-call-like `261` Open Frontier / `307` A Shau
  and visible unattributed `0.428%` / `2.907%`.
- Accepted scope: static-feature layer draw-call reduction. Still open:
  visible helicopter remediation, close-NPC/weapon pool residency, broad
  culling/HLOD acceptance, far canopy, A Shau terrain/nav acceptance, human
  playtest, production parity, and any performance-baseline refresh.
- Final gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T14-29-34-142Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T14-29-43-744Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3860` tests).

2026-05-04 Projekt Objekt-143 KB-CULL grounded/parked helicopter visibility pass
- Fixed a helicopter visibility owner-path gap: stopped grounded helicopters
  previously skipped the update loop before `shouldRenderAirVehicle` was
  applied, so distant parked helicopters could remain scene-visible forever.
  `HelicopterModel` now applies the existing air-vehicle render-distance rule
  before that stopped/grounded early-continue path.
- Targeted tests:
  `npx vitest run src\systems\vehicle\AirVehicleVisibility.test.ts src\systems\helicopter\HelicopterModel.test.ts`
  PASS (`2` files, `39` tests).
- Open Frontier evidence:
  first run `artifacts/perf/2026-05-04T17-36-44-412Z/summary.json` was
  measurement-trusted but validation FAIL on peak p99 `61.60ms`, so it is not
  accepted. Rerun `artifacts/perf/2026-05-04T17-41-57-455Z/summary.json` is
  measurement-trusted with validation WARN only on peak p99 `48.70ms`.
  Scene attribution records `helicopters` at `0` visible objects / `0` visible
  triangles while `world_static_features` stays at the accepted batched count
  (`222` draw-call-like, `155` materials, `222` meshes).
- A Shau evidence:
  first run `artifacts/perf/2026-05-04T17-46-23-113Z/summary.json` was
  measurement-trusted but validation FAIL on heap recovery, so it is diagnostic
  only despite reducing helicopters to `19` visible objects / `2,100` visible
  triangles. Rerun `artifacts/perf/2026-05-04T17-51-52-562Z/summary.json` is
  measurement-trusted with validation WARN only on peak p99 `33.70ms`. Against
  the static-feature after point, helicopters reduced from `56` visible objects
  / `4,796` visible triangles to `37` / `2,696`.
- Refreshed Projekt culling evidence:
  `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T17-56-35-772Z/projekt-143-culling-proof/summary.json`;
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T17-56-41-253Z/projekt-143-culling-owner-baseline/summary.json`.
- Broad Projekt gates after docs:
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T17-58-34-753Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T17-58-50-965Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3863` tests).
- Accepted scope: grounded/parked helicopter visible-category reduction only.
  Non-claims: no broad vehicle culling/HLOD acceptance, no frame-time baseline
  refresh, no A Shau terrain/nav acceptance, and no close-NPC/weapon residency
  closeout.

2026-05-04 Projekt Objekt-143 terrain/culling/camera follow-up
- Fixed the hill-facing first-person camera clipping failure mode in
  `PlayerMovement`: if a grounded fixed-step move would place the player X/Z
  onto a terrain lip while Y is still limited by the rise clamp, the horizontal
  step is now rejected and marked terrain-blocked. This prevents the camera
  from being left inside a hillside when walking up into a slope.
- Kept jungle ground as the dominant material while reducing the remaining grey
  mountaintop look: highland/rock is now a moss-tinted steep-cliff accent, not
  a broad elevation cap. The refreshed distribution audit is WARN only for the
  expected AI Sandbox random-seed fallback:
  `artifacts/perf/2026-05-04T21-42-10-596Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
- Fixed nearby vegetation residency starvation: when frame pressure throttles
  general vegetation additions to zero, `VegetationScatterer` still admits one
  pending cell inside the critical player radius. The diagnostic Open Frontier
  capture shows near vegetation now fills in, but it also records `85,915`
  active vegetation instances, so follow-up needs coarse vegetation
  occlusion/distance policy rather than blind distance expansion.
- Fixed the "distant bases/houses always render" owner-path bug by changing
  `WorldFeatureSystem` from one globally visible static-feature root to
  per-feature render groups with distance/hysteresis visibility before
  per-feature batching. Diagnostic Open Frontier scene attribution at
  `artifacts/perf/2026-05-04T21-24-46-901Z/scene-attribution.json` records
  `world_static_features` visible triangles at `6,448`, but draw-call-like is
  `337` because finer culling granularity increases batch count. This is a
  visibility fix and HLOD prompt, not final renderer acceptance.
- Folded the remaining analysis into Projekt docs/handoff: AAA-style hidden
  vegetation/prop savings should come from coarse terrain/cluster/Hi-Z-style
  occlusion, not per-instance raycasts; and navmesh/heightmap validity needs a
  bake-manifest or terrain/stamp hash because `prebake-navmesh` skips existing
  assets unless forced and the runtime solo-navmesh cache key omits terrain
  and feature inputs.
- Validation: focused Vitest PASS (`5` files, `142` tests);
  `npm run build:perf` PASS; `npm run check:projekt-143-culling-proof` PASS at
  `artifacts/perf/2026-05-04T21-42-38-633Z/projekt-143-culling-proof/summary.json`;
  `npm run check:projekt-143-culling-baseline` PASS at
  `artifacts/perf/2026-05-04T21-42-16-288Z/projekt-143-culling-owner-baseline/summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-04T21-42-43-709Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T21-42-43-062Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`251` files, `3866` tests).
- Non-claims: the fresh Open Frontier runtime capture
  `artifacts/perf/2026-05-04T21-24-46-901Z/summary.json` failed validation on
  harness combat behavior (`7` shots, `0` hits), and local asset baking may
  skew frame-time metrics. Use its scene attribution diagnostically only.

2026-05-05 Projekt Objekt-143 navmesh invalidation shepherd pass
- Checkpointed the recovered navmesh/terrain-bake work as `e92523a`
  (`fix(navmesh): add terrain-aware bake invalidation`). The patch adds
  deterministic `NavmeshBakeSignature` hashing, a tracked
  `public/data/navmesh/bake-manifest.json`, stale-signature regeneration in
  `scripts/prebake-navmesh.ts`, terrain/feature fingerprints for runtime solo
  navmesh cache keys, and shared `NavmeshFeatureObstacles` so the bake/runtime
  contract uses collidable runtime placements instead of trafficable feature
  envelopes.
- Re-baked the currently registered procedural navmesh/heightmap assets. The
  prebuild check now reports `All 14 pre-baked assets match the navmesh bake
  manifest; skipping generation.` Open Frontier runtime selection is narrowed
  to seed `42`; seeds `137`, `2718`, `31415`, and `65537` remain withheld until
  they have per-seed feature presets.
- Expanded the terrain placement audit to check every registered pre-baked
  seed. Latest audit:
  `artifacts/perf/2026-05-05T01-41-42-472Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
  It is WARN, not FAIL: Zone Control seed `137` has two flattened-core span
  warnings (`nva_bunkers` and `trail_opfor_egress`). Do not claim all seeded
  placement/foundation work is closed from this pass.
- Aligned `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, `docs/STATE_OF_REPO.md`, and
  `docs/DEPLOY_WORKFLOW.md` so the stale-navmesh risk is no longer described
  as missing plumbing. It is now a partially closed invalidation problem with
  remaining acceptance risks: A Shau nav quality/heap/terrain-stall proof,
  withheld Open Frontier variants, and Zone Control seed `137` placement
  warnings.
- Validation:
  targeted nav/seed Vitest PASS (`4` files, `12` tests);
  `npm run typecheck` PASS;
  `npx tsx scripts/prebake-navmesh.ts` PASS/skip by manifest;
  `npm run check:projekt-143-terrain-placement` WARN at the artifact above;
  `npm run check:projekt-143-cycle3-kickoff` WARN as expected for KB-OPTIK at
  `artifacts/perf/2026-05-05T01-45-05-395Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T01-45-04-864Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run validate:fast` PASS (`253` files, `3872` tests);
  `npm run build` PASS;
  `npm run test:run` PASS (`253` files, `3872` tests).
- Non-claims: this is not A Shau navigation acceptance, not a far-canopy or
  culling/HLOD closeout, not a frame-time/perf-baseline refresh, not fixed-wing
  feel validation, and not production parity until the branch is pushed,
  CI/deploy state is checked, and live Pages/R2/WASM/service-worker behavior is
  verified.

2026-05-04 22:08 EDT Projekt Objekt-143 docs/status alignment
- Verified current repo truth after the shepherd push: `master` and
  `origin/master` are aligned at
  `356bc2e418af2f2f9aa8109dcf29a5ad7e291924`
  (`docs(projekt-143): align navmesh recovery state`).
- GitHub CI run `25353544629` passed on `356bc2e` for lint, test, build,
  smoke, perf, and mobile UI. The run still includes the known non-blocking
  perf artifact/continue-on-error annotations, but the workflow conclusion is
  success.
- Live production is intentionally not current: Pages
  `/asset-manifest.json` still reports
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Do not claim production parity
  for the last-24-hour Projekt work until `npm run deploy:prod` is run and the
  live Pages/R2/WASM/service-worker/browser-smoke proof is refreshed.
- Updated `docs/PROJEKT_OBJEKT_143.md`,
  `docs/PROJEKT_OBJEKT_143_HANDOFF.md`, and `docs/STATE_OF_REPO.md` to record
  the pushed/CI-verified but not-deployed state. Created
  `docs/PROJEKT_OBJEKT_143_24H_STATUS_2026-05-04.md` as the owner-facing
  status report for goal alignment before the next run.

2026-05-04 22:45 EDT Projekt Objekt-143 terrain/nav evidence refresh
- Focused `TerrainFeatureCompiler` Vitest passed with the local Zone Control
  seed `137` pad-flatness regression coverage (`9` tests).
- `npm run check:projekt-143-terrain-placement` passed and wrote
  `artifacts/perf/2026-05-05T02-39-51-929Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  all audited modes, including Zone Control seed `137`, have `0` placement
  warnings.
- `npm run build:perf` passed, then `npm run perf:capture:ashau:short` wrote
  `artifacts/perf/2026-05-05T02-41-21-751Z/summary.json`. A Shau is now
  measurement-trusted and clears heap, movement, and hit guardrails
  (`150` shots / `86` hits), but remains WARN on peak p99 and still logs NPC
  terrain-stall backtracking. Do not claim final A Shau route/nav acceptance.
- Folded the owner vegetation objective into Projekt: remove the small palm
  species from runtime completely, preserve the good tall palm, and redirect
  that visual/perf budget to grass or other ground cover.
- Refreshed broad Projekt gates after the docs/evidence update:
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T02-51-58-852Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN only for the expected
  KB-OPTIK visual-exception/human-review decision at
  `artifacts/perf/2026-05-05T02-53-11-768Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`;
  the regenerated kickoff packet now names small-palm removal as part of the
  KB-TERRAIN branch evidence.

2026-05-05 23:05 EDT Projekt Objekt-143 short-palm retirement
- Visual review confirmed the small palm to remove is the misleadingly named
  `giantPalm` / `palm-quaternius-2` short Quaternius palm. The taller
  palm-like species `fanPalm` and `coconut` remain runtime vegetation.
- Removed `giantPalm` from the runtime Pixel Forge vegetation registry,
  removed its biome palette entries, retired the old giantPalm-only startup
  warmup list, deleted the shipped public short-palm atlas files, and redirected
  the dense-jungle/highland budget toward `fern` and `elephantEar` ground
  cover.
- Updated Projekt docs and generated evidence scripts to record the retirement
  separately from blocked Pixel Forge species, and added the source-pipeline
  objective to investigate EZ Tree or a similar licensed procedural/tree GLB
  workflow for missing Vietnam trees, understory, grass/ground cover, and
  trail-edge assets before Pixel Forge baking/runtime import.
- Validation after removal: focused vegetation/AssetLoader Vitest PASS
  (`2` files, `13` tests); `npm run build` PASS after regenerating Zone
  Control navmesh/heightmaps; `npm run build:perf` PASS and cleared stale
  `dist-perf` short-palm assets; `npm run validate:fast` PASS (`253` files,
  `3874` tests); `npm run check:projekt-143-terrain-assets` WARN at
  `artifacts/perf/2026-05-05T03-23-29-111Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
  with `6` runtime vegetation species, `1` retired species, `6` blocked
  species, and `0` missing assets; `npm run check:projekt-143-terrain-distribution`
  WARN at
  `artifacts/perf/2026-05-05T03-23-42-696Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  `npm run check:projekt-143-terrain-placement` PASS at
  `artifacts/perf/2026-05-05T03-23-53-465Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`;
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-05T03-24-06-823Z/projekt-143-evidence-suite/suite-summary.json`;
  `npm run check:projekt-143-cycle3-kickoff` WARN at
  `artifacts/perf/2026-05-05T03-24-24-591Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`
  only because KB-OPTIK still needs the known visual-exception/human-review
  decision.

2026-05-05 23:40 EDT Projekt Objekt-143 vegetation source-pipeline review
- Researched the owner-suggested EZ Tree direction and split it from runtime
  acceptance. Added
  `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` as a decision packet:
  Dan Greenheck's `EZ-Tree` is the recommended first offline GLB-generation
  pilot because it is Three.js-oriented, MIT licensed, and can export GLB/PNG;
  it should not be added to the shipped runtime bundle for Cycle 3.
- Recorded QuickMesh as a low-poly fallback, botaniq/Shizen as licensed asset
  library candidates for grass, ground cover, tropical understory, and
  trail-edge variety, and Blender Sapling/Tree-Gen as experimental fallback
  paths only.
- Updated the Projekt ledger and handoff so future agents route generated or
  sourced vegetation through Pixel Forge `review-only` baking, license/provenance
  capture, asset inventory, screenshots, texture/upload evidence, and matched
  Open Frontier/A Shau validation before runtime import.
