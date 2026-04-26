# Architecture Recovery

Last updated: 2026-04-24

This is the execution artifact for the multi-agent architecture recovery plan. Treat it as a current-state control board, not proof that a subsystem is correct. Code and runtime evidence still outrank this document.

## Global Gates

| Gate | Required evidence | Stop condition |
|---|---|---|
| Evidence | Current file references, runtime output, or generated static analysis. | Claim depends only on comments, docs, stale test names, or memory. |
| Single authority | One writer for each runtime state, or one named transition owner. | Two live writers mutate the same state without an explicit arbiter. |
| Interface fence | Human approval before changing `src/types/SystemInterfaces.ts`. | A task requires a fenced interface change without `[interface-change]` approval. |
| Runtime | `npm run typecheck`, `npm run lint`, `npm run test:quick`, `npm run build` for implementation cycles. | Domain probe bypasses the real behavior being validated. |
| Feel | Human playtest for vehicle, combat rhythm, driving, camera, or UI responsiveness. | Automated checks are used as the only sign-off for feel. |

## State Ownership Matrix

| Runtime state | Current owner | Known readers / collaborators | Risk |
|---|---|---|---|
| Player vehicle session | `VehicleSessionController` | `PlayerController`, vehicle adapters, vehicle interaction systems | High; this was previously split between models, `PlayerState`, input mode, and HUD. |
| Vehicle-specific control state | `HelicopterPlayerAdapter`, `FixedWingPlayerAdapter` | `PlayerInput`, vehicle models, HUD | Medium; adapter state must not become a second session authority. |
| Fixed-wing physical state | `FixedWingModel` / `Airframe` | camera, HUD, probes, vehicle adapter | High; feel and session bugs can look identical unless measured separately. |
| Input context | `PlayerInput` / `InputContextManager` | vehicle adapters, UI controls, spectator flow | High; should be derived from session/presentation changes, not independently guessed. |
| Pointer lock / mouse look | intended owner: `PlayerInput`; compatibility path: `GameEngineInput` free-fly | ground FPS camera, vehicle flight mouse, debug free-fly | Medium; current code now uses one lock target (`document.body`) and reports lock failures, but embedded-browser fallback feel still needs human validation. |
| HUD/presentation state | `GameplayPresentationController` through `HUDSystem` | touch controls, action bars, gameplay systems | High; UI should render vehicle facts, not decide gameplay mode. |
| Terrain/collision truth | `TerrainSystem` plus legacy `HeightQueryCache` | vehicles, combatants, world features, probes | High; global cache is still a second authority. |
| Airfield surface / aircraft staging height | terrain stamp datum: `TerrainFeatureCompiler`; staging still split across `WorldFeatureSystem` and `FixedWingModel` | fixed-wing spawn, taxi routes, runway helpers, terrain stamps | High; terrain stamps now share one generated airfield datum, but spawn metadata and runtime terrain/collision are not yet a unified airfield surface service. |
| Atmosphere cloud/fog presentation | `AtmosphereSystem`, `HosekWilkieSkyBackend`, scenario presets | renderer, weather, perf captures, playtests | Medium; visible clouds now come from the sky-dome pass, the old `CloudLayer` plane is hidden, and the shader now uses a seamless cloud-deck projection. Open Frontier/combat120 are lighter scattered-cloud presets and still need art review. |
| World feature render/collision presence | `WorldFeatureSystem` plus per-model optimizer; aircraft use `AirVehicleVisibility` | terrain collision, LOS accelerator, renderer, perf probes | Medium; props/buildings do not yet have the same explicit render/sim visibility contract aircraft have. |
| Combatant hot state | `CombatantSystem` object map | LOD manager, movement, AI, renderer, spatial grid | High; public maps and singleton spatial access remain scale risks. |
| Actor height / combat verticality | `CombatantConfig`, `CombatantBodyMetrics`, `CombatantMeshFactory` | player respawn, NPC spawn/deploy, ballistics, LOS, hit zones, tracers, cover checks, billboard renderer | Medium; 2026-04-24 code now uses an eye-level actor-anchor contract and smaller billboard container, but human playtest still must confirm visual NPC/player scale and fire height. |
| Combatant spatial index | Injected `SpatialGridManager` dependency owned by `CombatantSystem` for the current world/session | `CombatantLODManager`, `CombatantAI`, movement/LOD sync, query callers | Medium; LOD no longer imports the global singleton directly, but the default singleton remains the bootstrap compatibility path until combat storage is fully session-scoped. |
| System update order | `SystemUpdater` plus `SimulationScheduler` | all runtime systems | High; manual tracked-system exclusions remain a double-update risk. |
| Probe/harness API | `bootstrap.ts` window hooks and scripts | perf, state, HUD, fixed-wing probes | Medium; useful but still broad private access. |

## Active Cycle Board

Human feel/playtest gates are intentionally deferred until the end of the
current architecture-recovery run per user direction on 2026-04-23. Automated
checks and runtime probes may advance later cycles, but vehicle feel,
airfield usability, pointer-lock fallback usability, combat rhythm, and UI
responsiveness stay unsigned until the final human playtest form is completed.

| Cycle | Owner role | Forbidden scope | Validation | Rollback trigger |
|---|---|---|---|---|
| 0 Ownership audit | Architecture Lead | Feature work or tuning changes. | Static owner matrix, import-risk report, current branch status. | Any claimed owner cannot be backed by current code. |
| 1 Vehicle session authority | Implementer + Verification | Scheduler, terrain authority, combat storage, fenced interfaces. | Targeted vehicle tests, typecheck, fixed-wing probe, input cleanup smoke before merge. | A vehicle model becomes the primary session writer again. |
| 2 Fixed-wing feel | Scorch Reviewer | UI/input/session rewrites. | sandbox metrics, fixed-wing probe, airfield staging evidence, human playtest. | Raw `Airframe` cannot be stabilized without hidden correction loops. |
| 3 Declarative schedule | Architecture Lead | Vehicle feel tuning. | schedule parity report, fast validation, combat smoke. | Update order changes without explicit dependency evidence. |
| 4 UI/input boundary | Implementer | Vehicle physics or scheduler changes. | mobile UI, HUD check, keyboard/touch browser smoke. | Touch/HUD code writes gameplay vehicle state. |
| 5 Combat scale | Architecture Lead | Flight tuning, terrain rewrites. | combat scenarios, combat120 capture, memory check, actor-height contract tests. | Renderer, AI, movement, spatial index, or combat verticality creates separate combatant truth. |
| 6 Terrain/collision authority | Architecture Lead | Combat data-store migration. | terrain probes, fixed-wing probe, aircraft collision checks. | Vehicles and NPCs query different terrain sources. |
| 7 Harness productization | Verification Lead | Gameplay behavior changes not required by probe API. | failure artifacts, state/HUD/fixed-wing/perf probes. | Probe succeeds while bypassing the real user path. |
| 8 Cleanup/guardrails | Integration Captain | Behavior changes without a cycle owner. | deadcode triage, fast validation, current-state doc check. | Deleting a probe removes coverage without replacement. |
| 9 Atmosphere/cloud readability | Architecture Lead + Verification | Vehicle/session fixes, terrain authority rewrites. | mode comparison screenshots, cloud/fog metrics, shader cost capture. | Fog/clouds hide terrain, airfield, or aircraft evidence. |
| 10 Fallback retirement | Architecture Lead | Tuning/feel changes. | fallback inventory, runtime assertions, targeted tests. | A fallback can silently replace missing runtime truth. |
| 11 Airfield surface authority | Implementer + Verification | Raw `Airframe` tuning unless surface evidence requires it. | taxi/runway height report, fixed-wing probe, human taxi/takeoff pass. | Stands, taxi routes, runway starts, and terrain stamps use different height truth. |
| 12 Render/LOD/culling perf | Performance Lead | Asset replacement before measurement. | airfield perf capture, draw-call/triangle/LOS/collision report, pop-in screenshots. | Optimization adds another hidden visibility/simulation authority. |

## Cycle 1 Current Decision

Vehicle session transitions are now routed through `VehicleSessionController`. Active vehicle exit requests from `PlayerVehicleController` use the session callback when present. Fixed-wing exit policy is represented as a typed exit plan:

- normal ground exit when `FixedWingOperations.getFixedWingExitStatus()` allows it;
- blocked normal exit when aircraft state is unsafe and ejection is not requested;
- emergency ejection when the player uses the active vehicle-exit path while airborne or otherwise unsafe.

The fixed-wing model still owns aircraft physics and flight data. It does not own the final player session transition for the active input path.

## Cycle 1 Playtest Findings On 2026-04-23

These started as observations from the in-app browser playtest
plus code inspection, used to route work to the correct cycle instead of
widening Cycle 1 blindly. The first three Cycle 1 closure items now have
current-code fixes and automated evidence, but still need human playtest.

| Finding | Evidence anchor | Cycle placement | Required next step |
|---|---|---|---|
| Fixed-wing emergency bailout exits the vehicle but drops the player directly to terrain. | `FixedWingModel.buildAircraftExitPosition(projectToGround=true)` projects ejection to `getEffectiveHeightAt() + 1.5`. | Cycle 1 blocker for exit UX. | Split airborne bailout from grounded exit: airborne ejection should preserve altitude into a falling/parachute/recovery state; grounded exit keeps side-of-aircraft placement. |
| Forward walk can stick after exiting an aircraft. | `PlayerInput` stores pressed keys until `keyup`; `VehicleSessionController` resets adapter controls but does not clear infantry movement keys. | Cycle 1 blocker for vehicle session cleanup. | Clear movement/action keys on vehicle context change, pointer-lock loss, and window blur; add a regression test around W-throttle-to-infantry transition. |
| Pointer lock does not work in the Codex in-app browser. | Branch-local code now makes `PlayerInput` and `GameEngineInput` use `document.body`, and `PlayerInput` reports `pointerlockerror` / rejected requests. | Cycle 1 narrow input fix landed; Cycle 4 still owns boundary cleanup. | Human playtest must confirm the unlocked mouse-look fallback is usable in embedded browsers and does not fight ground FPS or vehicle look. |
| Helicopter blades keep spinning after exit and do not visually read as high RPM in flight. | `HelicopterPhysics.updateEngine()` floors engine RPM at 0.2; `HelicopterAnimation` spins at `engineRPM * 20` with no blurred-disc state. | Cycle 2 vehicle feel/presentation. | Add explicit engine/rotor lifecycle states: stopped, idle, spool-up, flight RPM, and high-RPM blur. Inspect GLB nodes only after the lifecycle is correct. |
| Airfield aircraft/taxi/runway height mismatch still appears in playtest. | Parked aircraft sample height at stand position; runway line-up samples height again at runway start; generated runway/apron/taxi stamps previously picked local target heights independently on slopes. | Cycle 2/6 bridge: airfield staging before Airframe scorch decision. | Branch-local patch gives generated airfield terrain stamps one runway datum and validates parking/taxi/runway route height deltas. Human playtest still needs to confirm A Shau usability, then Cycle 6 should unify terrain/collision/staging access. |
| Fog/clouds can obscure whether terrain and airfields are correct. | Branch-local visible clouds moved into `HosekWilkieSkyBackend`; `AtmosphereSystem` keeps the old `CloudLayer` invisible so the finite plane cannot create a hard horizon divider. | Cycle 9 atmosphere pass. | Latest all-mode evidence shows sky coverage metrics in every mode and no visible cloud-plane authority. Human playtest must still judge whether Open Frontier/combat120 haze is acceptable cloud art. |
| A Shau required terrain/nav can block evidence. | Branch-local `ModeStartupPreparer` now throws when the required DEM/manifest path fails; local perf preview now loads DEM-backed terrain. Large-world nav is explicit static-tiled generation, and A Shau startup fails if no navmesh is generated or pre-baked. | Cycle 10 fallback retirement plus Cycle 11 airfield validation. | Do not skip A Shau: keep fixing static-tiled nav quality and `tabat_airstrip` surface. The final pre-release all-mode evidence rerun after the NPC/README pass kept Open Frontier/TDM/ZC/combat120 entering live mode with `0` browser errors; rerun it again if more runtime code lands before deploy. |
| Aircraft/buildings appear to hurt frames near airfields. | Aircraft have `AirVehicleVisibility`; world props load through `WorldFeatureSystem` and draw-call optimizer but lack an equivalent prop/building visibility contract. | Cycle 5/6 perf ownership. | Run an airfield perf capture with draw calls, triangles, collision objects, and LOS obstacle counts before replacing GLBs. |

Cycle 1 follow-up patch on 2026-04-23:

- Fixed-wing emergency ejection now uses an airborne ejection placement that
  preserves altitude instead of projecting to `terrain + 1.5`.
- `VehicleSessionController` clears transient `PlayerInput` state on vehicle
  enter/exit, so held throttle/movement keys do not leak into infantry.
- `PlayerInput` clears keys on pointer-lock loss, pointer-lock failure, window
  blur, and hidden-tab transitions. `pointerlockerror` now activates an
  unlocked mouse-look fallback for embedded browsers.
- `GameEngineInput` free-fly and `PlayerInput` now use the same pointer-lock
  target (`document.body`) for the narrow fix. Cycle 4 still owns
  the larger input/UI boundary cleanup.

Cycle 2 rotor follow-up patch on 2026-04-23:

- `HelicopterPhysics` now has explicit engine active/stopped lifecycle. A
  grounded, unoccupied helicopter can spool down to true `engineRPM = 0`
  instead of being held at idle forever.
- `HelicopterModel` keeps ticking grounded unoccupied helicopters only while
  their engine/rotor state is still spooling down, then returns to the parked
  no-update path.
- `HelicopterAnimation` uses a faster flight-RPM visual speed so spinning
  blades read faster before any GLB replacement or blurred-disc work.

Cycle 2/6 airfield datum patch on 2026-04-23:

- Generated airfield terrain stamps now carry a shared `fixedTargetHeight`
  when the current terrain provider is available during feature compilation.
  Runway, apron, taxiway, filler, and envelope stamps no longer resolve
  separate local target heights on a sloped site.
- The datum is sampled from the runway centerline using the airfield feature's
  authored `targetHeightMode`. This is deliberately a terrain-shaping fix, not
  a new fixed-wing physics correction loop.
- `StampedHeightProvider` resolves fixed target heights directly, so runtime
  terrain queries and baked stamped heightmaps use the same datum.
- New regression coverage models a sloped `forward_strip` and asserts the
  parking stand, taxi connector, hold-short point, runway entry, and runway
  start resolve to one height through the stamped provider.

Cycle 2 AC-47 orbit hold patch on 2026-04-23:

- The fixed-wing browser probe exposed an AC-47 failure after the airfield
  datum patch: takeoff, bailout, approach, and handoff passed, but gunship
  orbit hold over-banked, bled speed, and stalled.
- Root cause was the orbit controller's roll-error sign. It commanded away
  from the desired left-bank target, then rate damping chased the oscillation.
- `FixedWingControlLaw` now computes orbit roll error as target bank minus
  current bank and damps with the Airframe roll-rate sign convention. Coverage
  now asserts sustained full-throttle AC-47 orbit stays above stall margin and
  keeps transient roll under 25 degrees.

## Cycle 1 Evidence

- `npm run validate:fast` - PASS
- `npm run check:mobile-ui` - PASS
- `npm run build` - PASS
- `npm run probe:fixed-wing` - PASS, including takeoff, approach, in-flight
  bailout, and player/NPC handoff
- 2026-04-23 continuation: `npm run typecheck`, `npm run lint`,
  `npm run test:quick`, `npm run build`, and `npm run probe:fixed-wing` all
  PASS after the ejection/input/pointer-lock patch.
- 2026-04-23 rotor/airfield continuation: targeted helicopter/terrain suites
  PASS, `npm run lint` PASS, and `npm run typecheck` PASS after the rotor
  lifecycle and airfield datum patches.
- 2026-04-23 Cycle 2 closeout: `npm run typecheck`, `npm run lint`,
  targeted fixed-wing tests, `npm run test:quick`, `npm run build`, and
  `npm run probe:fixed-wing` all PASS after the AC-47 orbit-hold sign fix.
- Targeted vehicle tests cover blocked fixed-wing exit, emergency ejection,
  session-routed active vehicle exit, and fixed-wing exit plan generation.
- Adapter contract tests cover fixed-wing exit-plan option delegation,
  helicopter exit-plan delegation, and legacy helicopter fallback placement.
- Touch control tests cover the vehicle action-bar EXIT route through the
  generic vehicle enter/exit callback, with the legacy helicopter callback only
  as fallback.
- Player input tests cover keyboard `KeyE` and gamepad interact preferring the
  generic vehicle enter/exit callback over the legacy helicopter callback.
- Helicopter model tests cover model-owned exit requests routing through
  `requestVehicleExit()` when the session-aware player controller is present.
- `scripts/fixed-wing-runtime-probe.ts` now validates player/NPC fixed-wing
  handoff through keyboard `KeyE`, not a direct `player.exitFixedWing()` call.
- `scripts/fixed-wing-runtime-probe.ts` now validates in-flight emergency
  bailout through keyboard `KeyE` while airborne for A-1, F-4, and AC-47.

## Cycle 1 Remaining Gates

- Deferred final human playtest: grounded fixed-wing exit, unsafe in-flight
  emergency bailout, helicopter entry/exit, switch/respawn/death cleanup,
  embedded-browser pointer-lock fallback usability, A Shau forward-strip
  parking/taxi/runway/takeoff feel, and AC-47 orbit feel.
- Automated probes/tests now cover the code paths; they do not sign off feel.
- Touch/mobile exit path has unit-level callback coverage, and the current
  mobile UI check passes. It still needs a human aircraft enter/exit playtest
  before feel sign-off.

## Cycle 3 Kickoff: Declarative System Schedule

Cycle 3 starts after Cycle 1/2 automated gates passed and human playtest was
explicitly deferred. Scope is scheduler/update authority only. It must not tune
vehicle feel, change terrain authority, or alter combat behavior except where
needed to preserve update-order parity.

Cycle 3 first implementation pass on 2026-04-23:

- Added `src/core/SystemUpdateSchedule.ts` as the inspectable schedule metadata
  for the current manual `SystemUpdater` phases, budgets, cadence groups, and
  scheduled system keys.
- `SystemUpdater` still preserves the existing update order, but its `Other`
  fallback no longer owns a separate hard-coded tracked-system list. The
  fallback exclusion set is now derived from the schedule metadata.
- The explicit schedule includes latent collision cases that were manually
  updated but missing from the old fallback exclusion list: `navmeshSystem` and
  `npcVehicleController`. It also marks `gameModeManager` as a mode-runtime
  hook so its no-op generic `update()` is not treated as an unscheduled second
  authority.
- Timing budgets are now read from the same metadata used for schedule
  inspection.
- Regression coverage asserts that manually scheduled systems are not updated a
  second time when they also appear in the generic `systems` list, while
  unscheduled lightweight systems still run through `Other`.

Cycle 3 validation on 2026-04-23:

- `npm run typecheck` - PASS
- `npm run lint` - PASS
- `npm run test:quick` - PASS (`242` files, `3772` tests)
- `npm run build` - PASS

Cycle 3 remaining scope:

- Capture a schedule parity report before any future phase-order migration. This
  pass did not intentionally reorder gameplay.
- Deeper declarative migration remains possible later, but the silent
  double-update risk targeted by Cycle 3 is now guarded by code and tests.

## Cycle 4 Kickoff: UI/Input Boundary

Cycle 4 starts after the Cycle 3 implementation gate passed. Scope is UI/input
authority only: actor/vehicle mode, touch controls, HUD context, input context,
and pointer-lock presentation fallback. It must not tune vehicle physics,
terrain shaping, or scheduler order.

Cycle 4 first implementation pass on 2026-04-23:

- Removed the legacy `TouchControls.enterHelicopterMode()`,
  `enterFlightVehicleMode()`, `exitHelicopterMode()`, and
  `exitFlightVehicleMode()` mutators. Touch controls can no longer force their
  own vehicle mode independently of presentation state.
- `TouchControls` now derives flight/touch vehicle layout from
  `VehicleUIContext` supplied by `GameplayPresentationController` through
  `HUDSystem.setVehicleContext()`. Actor mode alone is not enough to show the
  vehicle action bar.
- Flight cyclic controls only appear for vehicle contexts with
  `hudVariant: 'flight'`; the vehicle action bar remains capability-driven for
  future non-flight vehicles.
- Regression coverage now asserts presentation vehicle context, not direct
  touch-control mode mutation, is what toggles vehicle controls and flight mode.

Cycle 4 validation on 2026-04-23:

- `npm run test:quick -- TouchControls VehicleActionBar PlayerInput FixedWingPlayerAdapter HelicopterPlayerAdapter` - PASS
- `npm run typecheck` - PASS
- `npm run lint` - PASS
- `npm run build` - PASS
- `npm run check:hud` - PASS
- `npm run check:mobile-ui` - PASS after rebuilding `dist/`
- `npm run test:quick` - PASS (`242` files, `3772` tests)

Cycle 4 remaining scope:

- Human playtest still needs to verify touch/mobile aircraft exit and
  pointer-lock fallback usability at the end of the recovery run.
- `HUDSystem.setVehicle()` remains a presentation-only legacy convenience
  method. Runtime vehicle controls should use `setVehicleContext()` so
  capability data, HUD variant, and actor mode stay together.

## Cycle 5 Kickoff: Combat Scale And Data Ownership

Cycle 5 starts after the Cycle 4 automated gate passed. Scope is combat data
ownership and hot-path update flow only: combatant store, AI/movement/combat
roles, LOD, renderer, and spatial index injection. It must not tune flight,
terrain, UI, or scheduler behavior unless a combat ownership bug requires it.

Cycle 5 first implementation pass on 2026-04-23:

- `CombatantSystem` now owns the spatial index dependency for the combat world
  and passes it into `CombatantLODManager`. The constructor defaults to the
  existing runtime singleton for bootstrap compatibility, but the LOD path no
  longer imports that singleton as hidden authority.
- `CombatantLODManager` now uses its injected `SpatialGridManager` for dead
  actor removal, AI query dependency flow, and position sync. This keeps AI,
  movement, LOD, and spatial updates on the same supplied grid for a session.
- Regression coverage constructs a non-global spatial grid and proves LOD
  update sync plus `CombatantAI.updateAI()` receive the injected instance
  instead of silently falling back to `spatialGridManager`.

Cycle 5 validation on 2026-04-23:

- `npm run test:quick -- CombatantLODManager CombatantSystem SpatialGridManager CombatantMovement` - PASS
- `npm run typecheck` - PASS

Cycle 5 remaining scope:

- `CombatantSystem` still exposes and mutates a shared object-map store. A
  fuller data-store migration should be a separate vertical slice with
  renderer, movement, AI, and combat consumers moved one path at a time.
- Combat scale performance is not signed off by this first pass. Run combat
  scenario tests, `npm run perf:capture:combat120`, memory checks, and
  `npm run perf:compare` on a quiet machine before using this branch as a
  combat perf baseline.

## Cycle 6 Kickoff: Terrain And Collision Authority

Cycle 6 starts after the Cycle 5 first-pass ownership cleanup. Scope is
terrain/collision query authority: terrain height, effective height, raycast,
LOS, sweep/contact checks, aircraft ground contact, NPC hillside contact, world
feature placement, and probes. It must not migrate combat storage or tune
aircraft feel except where required to make all runtime consumers ask the same
terrain/collision source.

Cycle 6 first implementation pass on 2026-04-23:

- Helicopter squad deployment now receives a terrain query runtime instead of
  a `HeightQueryCache`. Deployment positions prefer `getEffectiveHeightAt()`
  when available, so dropped squad positions respect the same collision-aware
  terrain source used by player, vehicle exit, combat spawn, and world props.
- `OperationalRuntimeComposer` no longer threads `HeightQueryCache` into the
  vehicle runtime. `HelicopterModel` still keeps a legacy
  `setHeightQueryCache()` shim for older tests/callers, but the live composer
  uses `setSquadDeployTerrain(runtime.terrainSystem)`.
- `NavmeshSystem` now accepts an injected terrain runtime and samples navmesh
  heightfields/obstacle placement from that runtime. `SystemConnector` wires
  `terrainSystem` into `navmeshSystem`, and navmesh connectivity validation now
  samples representative zone heights through `TerrainSystem`.
- Remaining direct `HeightQueryCache` uses after this pass are bootstrap
  provider setup (`ModeStartupPreparer`), terrain-owned internals
  (`TerrainSystem`, `TerrainQueries`, `VegetationScatterer`), and the
  `PlayerMovement` no-terrain fallback. The player fallback remains a
  current risk until a dedicated startup/wiring assertion removes it.

Cycle 6 validation on 2026-04-23:

- `npm run test:quick -- SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer TerrainSystem TerrainQueries` - PASS
- `npm run test:quick -- NavmeshSystem NavmeshHeightfieldBuilder SystemConnector ModeStartupPreparer SquadDeployFromHelicopter HelicopterModel OperationalRuntimeComposer` - PASS
- `npm run typecheck` - PASS
- `npm run lint` - PASS
- `npm run test:quick` - PASS (`242` files, `3774` tests)
- `npm run build` - PASS
- `npm run probe:fixed-wing` - first run closed the browser during AC-47 and
  left only partial A-1/F-4 artifacts; clean rerun PASS for A-1, F-4, and
  AC-47, including orbit, approach, bailout, and handoff.

Cycle 6 remaining scope:

- Human playtest still needs to confirm A Shau forward-strip taxi/takeoff,
  helicopter deploy/exit feel, and close-range NPC ground contact.
- World-feature LOS/static-obstacle registration still has a direct
  `LOSAccelerator` hook. It is narrower than the removed height-cache bypass,
  but a future pass should fold building/prop collision and LOS registration
  behind one terrain-collision registration surface.

## Cycle 7 Kickoff: Harness As Product

Cycle 7 starts after the Cycle 6 first-pass terrain/collision cleanup. Scope is
runtime diagnostic and browser probe trust: `window.__engine`, deterministic
time, text rendering, fixed-wing/perf/state/HUD probes, artifact quality, and
whether probes exercise player-visible paths instead of private backdoors. It
must not change gameplay behavior except where a probe is demonstrably using
the wrong path.

Cycle 7 first implementation pass on 2026-04-23:

- `scripts/fixed-wing-runtime-probe.ts` now writes `summary.json` after each
  scenario instead of only at the end. A mid-run browser close or scenario
  failure preserves completed results, partial status, and failure metadata.
- Scenario failures now produce a structured failed result with error text and
  a best-effort `*-failure.png` screenshot when the page is still alive. This
  directly addresses the Cycle 6 transient where A-1/F-4 artifacts existed but
  the stale summary still described an older run.
- Successful runs now write `status: "passed"`; in-progress/partial runs write
  `status: "partial"`; failed runs write `status: "failed"`.

Cycle 7 validation so far:

- `npm run typecheck` - PASS
- `npm run lint` - PASS
- `npm run probe:fixed-wing` - PASS after the incremental summary change;
  `artifacts/fixed-wing-runtime-probe/summary.json` now includes
  `status: "passed"`.
- `npm run check:states` - PASS; report:
  `artifacts/states/state-coverage-2026-04-24T00-48-24-039Z.json`.
- `npm run check:hud` - PASS; report:
  `artifacts/hud/hud-layout-report.json`.

Cycle 7 remaining scope:

- Audit broad `window.__engine` access and decide which probe APIs should stay
  broad for diagnostics versus which should become narrow, named helpers.

## Cycle 8 Kickoff: Dead Code, Docs, And Agent Guardrails

Cycle 8 starts after the Cycle 7 first-pass harness hardening. Scope is
repo-hygiene only: dead-code triage, verified-current docs, and local
agent-agnostic guardrails that reduce future drift. Do not delete code based on
tool output alone; each removal must be classified as delete, adopt, or retain
with current file/runtime evidence.

Cycle 8 first implementation pass on 2026-04-24:

- Knip findings were classified before cleanup:
  - retained/adopted: the four root `scripts/probe-*` airframe evidence probes
    are now explicit Knip entries because archived cycle docs still reference
    them as reproducible flight-dynamics probes;
  - retained/adopted: Cloudflare `wrangler` and `@cloudflare/workers-types`
    remain intentional dev dependencies for deploy/R2 tooling and are ignored
    by Knip's dependency report;
  - retained: archived `docs/cycles/**/evidence/**/probe.mts` files are
    evidence artifacts, not production entries, and are ignored as unused
    files;
  - cleaned: source modules no longer export helper types/constants/functions
    that are only used inside their own module.
- Added `src/systems/terrain/AGENTS.override.md` and tightened combat, UI, and
  scripts guardrails around spatial injection, presentation ownership, and
  probe-path honesty.

Cycle 8 validation:

- `npm run typecheck` - PASS
- `npm run deadcode` - PASS
- `npm run lint` - PASS
- `npm run test:quick` - PASS, 242 files / 3774 tests
- `npm run build` - PASS

Cycle 8 remaining scope:

- Human playtest is still deferred by user direction until the end of all
  cycles. This cleanup did not change gameplay behavior directly.
- Broad `window.__engine` diagnostic access remains a Cycle 7 follow-up
  decision; the scripts guardrail now requires probes to name private-hook
  limits when they rely on them.

## 2026-04-24 Follow-Up Gates

These are the current answers to the explicit follow-up questions raised after
Cycles 0-8. Treat every item below as current recovery evidence, not a human
playtest sign-off.

### Repository Pulse Before Commit

Pulse check on 2026-04-24:

- `master` and `origin/master` both point at `4a940957`.
- The active recovery worktree also pointed at `4a940957` before this work was committed,
  so all Cycle 0-12 recovery code from this session lived in the dirty main
  worktree until the release-owner commit.
- No branch in this clone has committed work dated 2026-04-23 or 2026-04-24.
  Do not search for today's recovery work in old agent worktrees; preserve and
  commit the current worktree diff.
- Most April 22 `task/*` branches are patch-equivalent to `master` despite not
  being ancestry-merged. Four still need branch-cleanup review rather than blind
  deletion or blind merge: `task/world-overlay-debugger`,
  `task/live-tuning-panel`, `task/airfield-envelope-ramp-softening`, and
  `task/airframe-ground-rolling-model`.
- The April 22 `.claude/worktrees/*` directories are locked agent worktrees.
  They should be pruned only after the recovery commit is pushed, deployed, and
  the non-equivalent task branches above are either adopted, superseded, or
  intentionally archived.

### Clouds And Fog

Clouds are implemented for all five current `GameMode` values through
`SCENARIO_ATMOSPHERE_PRESETS` and `scenarioKeyForMode()`: A Shau, Open
Frontier, TDM, Zone Control, and AI Sandbox/combat120.

Cycle 9 first pass on 2026-04-24 added `npm run evidence:atmosphere`
(`scripts/capture-atmosphere-recovery-shots.ts`) and attempts ground,
sky-coverage, and aircraft framings for all five modes. The harness boots with
`logLevel=warn`, records browser warnings as evidence, fails ground readability
if terrain is not resident at the camera, and records water plus
`clipDiagnostics` state so disabled water, water rendering, and terrain/camera
clipping stay separable. Current artifact:
`artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/summary.json`.
Evidence confirmed:

- A Shau, Open Frontier, TDM, Zone Control, and AI Sandbox/combat120 entered
  live mode with the expected active atmosphere preset and `0` browser errors;
- all five modes had passing cloud-legibility image scores, cloud follow
  `true`, terrain ready at camera, and no captured camera-below-terrain or
  water-exposed-by-terrain-clip state;
- the visible cloud authority is now `HosekWilkieSkyBackend`; `CloudLayer` is
  still constructed for compatibility but is kept invisible so the old finite
  plane cannot draw the hard horizontal divider seen in playtest screenshots;
- A Shau loaded real DEM height evidence after the build scripts generated
  `asset-manifest.json` into `dist/` and `dist-perf/`;
- A Shau water is disabled in evidence (`enabled=false`, `waterVisible=false`,
  `cameraUnderwater=false`), so disabled water no longer creates underwater fog
  or overlay state when a capture clips near or below `y=0`;
- new evidence runs include raw/effective terrain clearance, water-level
  clearance, and `waterExposedByTerrainClip` so terrain clipping and water
  rendering are not conflated. The latest all-mode run reports
  `cameraBelowTerrain=false` and `waterExposedByTerrainClip=false` for every
  captured view;
- A Shau no longer uses the removed TileCache fallback path. Large worlds use
  explicit static-tiled nav generation, and A Shau startup stops if no navmesh
  is generated or pre-baked instead of silently continuing with beeline
  navigation;
- A Shau now has an artifact-backed nav gate: 6/6 representative bases snapped
  to navmesh, `connected=true`, and every representative pair returned a path;
- A Shau still reports a steep `tabat_airstrip` warning with `112.1m` vertical
  span across the `320m` runway footprint;
- non-A Shau coverage matters: the same all-mode run reports `0` browser errors
  for Open Frontier, TDM, Zone Control, and combat120, while Open Frontier now
  has a separate steep `airfield_main` warning and several modes report
  budget/slow-frame warnings that must stay visible before push/deploy.

Cycle 9 code changes reduced per-scenario fog densities, moved the visible
cloud pass into the sky dome, left the old planar cloud layer hidden, and
replaced the azimuth-wrapped cloud UVs with a seamless cloud-deck projection.
That removes the known hard plane/divider from the visible path. It does not
make clouds a finished art or weather system: Open Frontier and combat120 now
show lighter scattered cloud forms, while A Shau/TDM/ZC read as heavier broken
clouds. Do not claim clouds are final until human playtest confirms every mode
and the A Shau DEM, navigation, terrain visibility, water state, and airfield
status are healthy.

### Legacy Fallbacks

Legacy and resilience fallbacks are not fully removed. Known masking risks:

- `ModeStartupPreparer` now fails required A Shau DEM/load failures. `npm run
  build` and `npm run build:perf` now generate
  `asset-manifest.json` into their output dirs, which fixed the local/perf
  preview missing-manifest path. Probes must keep recording required-asset
  failures as hard invalid evidence if the manifest or DEM regresses.
- `NavmeshSystem` no longer owns the old TileCache streaming/obstacle fallback
  path. Large worlds use explicit static-tiled generation with obstacle meshes
  baked into the input geometry. A Shau startup now stops if required terrain
  assets load but no generated or pre-baked navmesh exists. The remaining A Shau
  risk has moved from connectivity to route/NPC movement quality and terrain
  usability; it is not a hidden beeline or TileCache fallback.
- `PlayerMovement` still falls back to global `HeightQueryCache` when no
  runtime `TerrainSystem` is injected.
- `WorldFeatureSystem` receives the LOS accelerator through a direct side
  channel because `ITerrainRuntime` does not expose that surface.
- `AirSupportManager` uses physics-driven fixed-wing flight for spooky/AC-47,
  while other support mission types still use legacy direct positioning.
- `CombatantSystem` injects `SpatialGridManager` into LOD now, but the default
  singleton remains the bootstrap compatibility path.

Cycle 10 owns a fallback retirement pass. The goal is not "remove every
fallback"; the goal is to remove silent fallbacks that can hide bad wiring.
Useful fallbacks should become explicit diagnostic failures, dev-only recovery,
or named compatibility shims with retirement notes.

### Combat Actor Height And Aiming

The 2026-04-24 ground-combat playtest note said NPCs appeared to fire above the
player's head and that the player felt short relative to nearby NPCs. Current
code evidence showed a stacked vertical-offset problem: NPCs were spawned at a
raised position, ballistics and LOS added separate height offsets, and normal
tracer effects added another vertical offset on top of the shot ray origin.

Current code truth after the Cycle 5 follow-up:

- `Combatant.position` and player position are eye-level actor anchors.
- `NPC_Y_OFFSET` is `2.2`, matching `PLAYER_EYE_HEIGHT`.
- `CombatantBodyMetrics` derives NPC muzzle, NPC center mass, player center
  mass, and actor eye positions for ballistics, LOS, fire-occlusion checks,
  cover threat rays, tracers, muzzle flashes, death effects, and hit zones.
- `PlayerRespawnManager` now grounds respawns at `terrain + PLAYER_EYE_HEIGHT`
  instead of an older hardcoded `+2`.
- The 2026-04-26 Pixel Forge cutover supersedes the old faction-sprite sizing
  path. `CombatantMeshFactory` now gives Pixel Forge NPC impostors and close
  GLBs the same larger readability target, while `CombatantRenderer` keeps
  actors inside 64m on armed close GLBs and uses animated impostors only beyond
  that hard near band.
- Normal and suppressive tracers start from the actual shot ray origin instead
  of applying a second muzzle-height offset.
- The recoil hypothesis is not the primary code cause found here: NPC firing
  spread comes from skill/jitter and burst degradation, while the visible
  above-head fire came from anchor/offset drift.

Validation so far: targeted ballistics, effects, hit detection, sizing,
renderer, LOS, movement, helicopter deploy, and respawn suites passed. The
latest Pixel Forge cutover gate passed `npm run validate:fast` with 246 files /
3825 tests, `npm run build`, `npm run check:pixel-forge-cutover`, and
`npm run probe:pixel-forge-npcs` with no actors inside 64m rendered as
impostors. Human playtest still decides whether Pixel Forge scale, close-camera
occlusion, tracer visuals, faction markers, hitbox feel, and perceived
player/NPC scale feel correct. If playtest still reports mismatch, do not add
new hidden offsets; inspect GLB/impostor scale, atlas alpha padding, weapon
flash/tracer art, hit-zone telemetry, and live combat telemetry first.

### Terrain Clipping And Water Rendering

Terrain clipping and water rendering are separate systems. The attached
playtest screenshots showed the camera reaching an invalid below-terrain or
terrain-edge view; once that happens, the global water plane becomes highly
visible and looks wrong. Do not diagnose that as "water caused clipping." Treat
terrain/camera collision and water/hydrology quality as two adjacent issues that
need separate evidence.

Current code truth:

- A Shau water is disabled at runtime and no longer reports underwater state
  when the camera clips near or below world water level.
- Open Frontier, TDM, Zone Control, and combat120 still use the current global
  camera-following `WaterSystem` plane. That is acceptable as legacy runtime
  behavior but not a signed-off hydrology or river rendering solution.
- All five latest evidence scenarios report `terrain=true/true` at the camera
  for ground, sky, and aircraft views. Floating vegetation remains a playtest
  symptom to reproduce and triage; the first suspects are camera/terrain
  collision, tile residency around steep terrain, and vegetation placement
  authority. Water is a secondary visual exposure after the invalid camera
  position, plus its own render-quality backlog item.

Cycle 12 should include water/hydrology in the render and visibility audit
instead of treating it as a separate cosmetic polish item.

### Local Versus Deployed Evidence

The current evidence is local perf-preview evidence, not live production truth.
`npm run build` and `npm run build:perf` now emit local `asset-manifest.json`
files so prod-shaped local previews do not accidentally fetch the SPA HTML shell
for required A Shau assets. Production still has a separate delivery surface:
Pages serves the app shell and generated WASM/build assets, while the manifest
points at content-addressed R2 DEM/rivers URLs.

Before release, the release owner must bridge the gap explicitly:

- run the local all-mode evidence gate after the final code change, not just
  A Shau;
- run `npm run build` and verify `dist/asset-manifest.json` exists;
- after deployment, verify `/asset-manifest.json`, the R2 DEM URL, `/sw.js`,
  and the `recast-navigation.wasm` build asset headers from the live Pages URL;
- treat a local pass as insufficient if the live site still serves stale
  service-worker caches, old content-hashed WASM/build assets, or an old
  manifest.

### Airfield

Airfield terrain stamps are partially fixed. Generated runway, taxiway, apron,
filler, and broad envelope stamps now share one generated datum on sloped sites.
That addresses the obvious "different surface pieces at different heights"
failure mode. Latest A Shau evidence still warns that `tabat_airstrip`
(`forward_strip`) sits on steep terrain with `112.1m` of vertical span across a
`320m` runway footprint, so the site is smoothed by envelope flattening but is
not a signed-off taxi/takeoff surface.

Airfield is not closed. `WorldFeatureSystem` and `FixedWingModel` still sample
terrain separately for aircraft spawn, taxi metadata, runway line-up, and
short-final helpers. There is no single `AirfieldSurfaceRuntime` or equivalent
that owns stands, taxi lanes, runway starts, collision, and validation.

Cycle 11 owns the first-principles airfield surface authority. Human playtest
still decides whether the A Shau forward-strip taxi/takeoff path is usable.

### Render, LOD, And Culling

This has not had a full dedicated audit in the recovery run. Current evidence
is mixed:

- Fixed-wing aircraft have `AirVehicleVisibility` for render and simulation
  culling, with hysteresis and special cases for piloted/NPC airborne aircraft.
- Static world feature GLBs are draw-call optimized through
  `ModelDrawCallOptimizer` using merge/batch strategies.
- World props/buildings do not yet have the same explicit render-in/render-out
  contract that aircraft have.
- Buildings can be registered into terrain collision and LOS acceleration, but
  there is no airfield-specific perf report for draw calls, triangles, collision
  objects, LOS obstacle count, or pop-in behavior.
- The 2026-04-26 Pixel Forge vegetation cutover is intentionally still
  billboard/impostor-only. Runtime now avoids the worst reviewed palm atlas
  defects (`giantPalm` stable column, `coconut` bad-row quarantine), but close
  tree quality should move to measured close mesh LODs or a hybrid trunk-mesh /
  canopy-impostor renderer if human playtest still sees trunk snapping.

Cycle 12 owns render/LOD/culling. Do not replace GLBs or add imposters before
capturing the airfield cost profile; otherwise asset work can mask the real
render/culling contract problem.

## Next Recovery Cycles

Short term:

- Cycle 10: inventory and retire/make-explicit silent runtime fallbacks,
  starting with A Shau nav and terrain fallback quality now that required DEM/asset
  resolution works in local retail/perf previews. Do not skip A Shau: validate
  whether explicit static-tiled generation is enough for route/NPC movement
  quality beyond the current representative-base connectivity pass. Before
  push/deploy, rerun all-mode evidence so the A Shau repair does not regress
  Open Frontier, TDM, Zone Control, or combat120.
- Cycle 11: unify airfield surface/staging height authority and validate taxi /
  line-up / takeoff against the `tabat_airstrip` steep-site evidence.

Medium term:

- Cycle 12: dedicated airfield/world-feature render, culling, LOD, collision,
  water/hydrology, and LOS perf audit.
- Cycle 9 follow-up: decide whether the current sky-dome cloud texture is enough
  for cheap background atmosphere or whether the game needs multi-layer /
  volumetric clouds after the final human playtest.
- Combat data-store migration after spatial singleton compatibility is removed.
- Terrain/collision runtime expansion so LOS, raycast, sweep, effective height,
  and object collision all share one injected authority.

Long term:

- Asset replacement and LOD/imposter pipeline after render costs are measured.
- Data-oriented combat storage for the 3,000-combatant target.
- Diagnostic API productization replacing broad `window.__engine` access.
