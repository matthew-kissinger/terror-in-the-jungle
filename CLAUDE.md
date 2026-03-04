# Project Notes

Last updated: 2026-03-04

## Project

Terror in the Jungle is a browser-based 3D combat game focused on:
- large-scale AI combat
- stable frame-time tails under load
- realistic/testable large-map scenarios (A Shau Valley)

## Daily Commands

```bash
npm run dev
npm run build
npm run test:run
npm run test:quick           # unit tests only (excludes integration)
npm run test:integration     # integration scenario tests only
npm run validate             # quick: type-check + unit tests + build
npm run validate:full        # full: type-check + all tests + build
npm run perf:capture
npm run perf:analyze:latest
```

## Perf Commands

```bash
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m
npm run perf:quick            # capture combat120 + compare baseline
npm run perf:compare          # compare latest capture against baselines
npm run perf:update-baseline  # update baseline from latest capture
```

## Runtime Landmarks

- Entry: `src/main.ts`, `src/core/bootstrap.ts`
- Engine: `src/core/GameEngine.ts`, `src/core/GameEngineInit.ts`, `src/core/SystemUpdater.ts`
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`
- Combat: `src/systems/combat/*`
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`
- Integration tests: `src/integration/harness/`, `src/integration/scenarios/`

## Current Focus

1. Phase 1 perf frontier baselines captured for `combat120`, `openfrontier:short`, `ashau:short`, and `frontier30m`; see `docs/PERF_FRONTIER.md`.
2. Deep `combat120` evidence localizes the worst tails to `CombatantAI.updateAI()` inside high-LOD full updates. A March 4, 2026 frame-local `AITargetAcquisition` neighborhood cache is now accepted: matched warm `combat120` improved from `15.10ms` to `14.59ms` average frame time and from `16.82` to `12.91` AI-starvation events/sample, but p99 still fails.
3. `HeightQueryCache.getHeightAt()` remains a cross-cutting hotspot; a separate March 4, 2026 numeric-key linked-list LRU attempt was reverted because combat heap recovery regressed and warm evidence was inconsistent.
4. A March 4, 2026 attempt to disable friendly-spacing work on visual-only high-LOD frames in `CombatantLODManager` was reverted. Warm means improved slightly, but hitch rate, long-task totals, and AI starvation regressed, including one rerun that under-shot badly (`54 / 32` shots / hits).
5. March 4, 2026 diagnostic captures now show the worst nominal `suppressing` / `advancing` AI spikes are actually `AIStateEngage.handleEngaging()` transitions dominated by `initiateSquadSuppression()`, specifically the per-flanker fallback cover search path.
6. A March 4, 2026 attempt to reuse targets and throttle advancing threat reacquisition during flank movement was also reverted. The warm rerun improved mean frame time but collapsed combat pressure (`90 / 53` shots / hits) and worsened tail signals.
7. Open-world tail stability remains terrain-led in `open_frontier` / `frontier30m`; current suspects are near-field BVH rebuild bursts plus height-query cost, not CDLOD tile selection alone.
8. A Shau harness is now behavior-valid after nearest-first materialization and high-elevation spatial-bounds fixes; next step is terrain-tail reduction, then WarSim/heap isolation.

## Documentation Contract

- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions.
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change.
- See `docs/AGENT_TESTING.md` for agent validation workflows and perf baselines.
- Keep docs concise; remove stale status logs.
