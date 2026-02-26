# Project Notes

Last updated: 2026-02-25

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

1. Spatial ownership unification and heap-growth triage.
2. A Shau spawn/grounding and contact-fidelity stabilization.
3. Sustained skirmish gameplay flow (not just first-contact success).

## Documentation Contract

- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions.
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change.
- See `docs/AGENT_TESTING.md` for agent validation workflows and perf baselines.
- Keep docs concise; remove stale status logs.
