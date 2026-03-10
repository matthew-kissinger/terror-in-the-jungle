# Next Phase Refactor Plan

Last updated: 2026-03-10

## Objective

Move from "stabilized and test-gated" to "composable and maintainable" in core runtime code.

Phase 1 fixed the deployed boot failure, added a real production smoke gate, introduced startup/deploy state controllers, and gave the loop an initial scheduler. Phase 2 is about paying down the remaining architecture debt those changes exposed.

## Baseline After Phase 1

- Production boot is stable again.
- `validate` now includes a built-app Playwright smoke.
- `StartupFlowController` tracks startup phases end to end.
- `DeployFlowController` owns deploy-session state and initial-deploy resolution.
- `SystemUpdater` now uses a `SimulationScheduler` for cadence-safe groups.
- A Shau no-contact recovery is explicit and player-visible instead of teleport-driven.

## What Still Hurts

- `src/core/GameEngineInit.ts` is smaller and now defers mode/deploy startup modules until `Play`, but startup still crosses too many mutable runtime contracts.
- `src/core/SystemConnector.ts` is now mostly orchestration, but the underlying systems still own large setter bursts internally.
- Initial bundle cost is still too high, even after deferring `ModeStartupPreparer` and `InitialDeployStartup`.
- `SystemUpdater` is only partially budgeted by cadence; many groups still run every frame because the boundaries are too coarse.
- Core docs now match the code again, but the code still has service-locator shape and startup-order fragility.
- Cleanup debt is no longer the blocking issue: `eslint`, `knip`, tests, build, and `smoke:prod` are all green.

## Refactor Tracks

### Track 1: Startup Pipeline Extraction

Status: Complete

Goal:
- Break `GameEngineInit` into explicit startup modules with narrow responsibilities.

Steps:
- [x] Extract mode preparation into a dedicated startup service (`ModeStartupPreparer`).
- [x] Extract deploy handoff and initial spawn selection into a dedicated startup/deploy module (`InitialDeployStartup`).
- [x] Extract live-entry activation (`showRenderer`, `setGameStarted`, deferred init handoff, ambient start) into its own startup stage runner (`LiveEntryActivator`).
- [x] Keep `StartupFlowController` as the phase authority and make each stage advance it explicitly.
- [x] Reduce `GameEngineInit.ts` to coordination and error handling.

Acceptance:
- `GameEngineInit.ts` becomes a coordinator instead of the implementation body.
- Each startup stage is unit-testable without booting the whole engine.
- Cancel and error paths do not need to unwind one giant try/catch block.

### Track 2: System Composition Cleanup

Status: In Progress

Goal:
- Reduce setter-injection fragility around startup, player, UI, and strategy wiring.

Steps:
- [x] Introduce a typed service/composition object for startup-critical dependencies (`StartupPlayerRuntimeComposer`).
- [x] Migrate the deploy/player startup path first, since it crosses `GameEngineInit`, `PlayerRespawnManager`, `HUDSystem`, and `GameModeManager`.
- [x] Extract combat/world/game-mode/environment wiring into a grouped runtime helper (`GameplayRuntimeComposer`).
- [x] Extract strategy/vehicle/air-support runtime wiring into a second grouped composition helper (`OperationalRuntimeComposer`).
- [x] Reduce `SystemConnector.ts` to orchestration plus navigation/telemetry.
- Replace the highest-risk setter chains with constructor or grouped runtime dependency injection.
- Leave low-value or cold-path systems on setters until the hot-path/core wiring is stable.

Acceptance:
- Startup-critical systems no longer depend on hidden wiring order.
- New systems in the startup/deploy path declare dependencies explicitly.
- `SystemConnector.ts` shrinks materially in the startup/player, gameplay-runtime, and operational-runtime areas.

### Track 3: Loop Decomposition

Status: Ready

Goal:
- Turn more of the main-thread serial update path into deliberate scheduling instead of "run now, log budget later."

Steps:
- Split current tracked groups into smaller declared groups where cadence can differ safely.
- Keep movement, weapon feel, and input-coupled systems every frame.
- Move more world, strategy, and passive UI work behind scheduler contracts.
- Add tests for cadence and accumulated-delta behavior when groups are skipped.

Acceptance:
- More work is controlled by schedule rather than by post-hoc telemetry.
- `SystemUpdater` reads as group orchestration, not a long imperative list.
- Budget tuning has obvious levers with fewer hidden couplings.

### Track 4: Bundle And Boot Surface Reduction

Status: In Progress

Goal:
- Reduce initial JS cost without reintroducing fragile chunking.

Steps:
- Identify menu-critical modules versus mode-start-only modules.
- [x] Dynamically import mode-start startup modules after menu entry where safe (`ModeStartupPreparer`, `InitialDeployStartup`).
- [x] Extract shared spawn fallback logic into a tiny always-loaded helper (`ModeSpawnPosition`) so heavy mode-prep code can actually defer.
- Keep shared engine shell, menu shell, and required UI styles in the boot path.
- [x] Add one smoke assertion that checks the menu renders before any deploy-only code is needed.
- Continue identifying deploy-only UI/runtime that can defer without touching the menu path.

Acceptance:
- Initial chunk size drops meaningfully.
- Menu still loads and transitions reliably in production preview.
- No reintroduction of `three` chunk-order/runtime init failures.

## Recommended Execution Order

1. Finish Track 2 by replacing the highest-risk remaining setter bursts with runtime dependency objects in hot-path systems
2. Track 3: Loop Decomposition
3. Continue Track 4 around deploy-only UI/runtime once loop boundaries are cleaner

## Validation Gate

Every accepted slice must pass:

- `npm run deadcode`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run smoke:prod`

For loop or terrain changes, also run:

- `npm run perf:capture:combat120`
- `npm run perf:compare -- --scenario combat120`

For startup/deploy changes, manually verify:

- menu -> play -> deploy -> live
- initial deploy cancel -> return to menu
- respawn deploy -> confirm -> live

## Out Of Scope For This Phase

- Terrain architecture pivot
- ECS rewrite
- WebGPU renderer rewrite
- Full dependency-injection container conversion across the entire repo

## Next Slice

Stop splitting `SystemConnector`; that part is effectively done.

The next high-leverage follow-up is inside the systems themselves:

- replace remaining hot-path setter bursts with runtime dependency objects, starting with combat/world/player-adjacent systems
- push more cadence-safe work behind `SimulationScheduler` once those boundaries are explicit
- continue boot-surface reduction only around deploy-only UI/runtime after those contracts are cleaner
- run longer battle-test passes against terrain grading and spawn/nav reliability so the new authored-base shaping gets real gameplay coverage
