# Project Notes

Last updated: 2026-03-06

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
npm run validate:full        # full: test + build + committed combat120 perf check
npm run perf:capture
npm run perf:analyze:latest
```

## Perf Commands

```bash
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m
npm run perf:quick            # quick smoke capture only (not a committed baseline)
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

1. `combat120` at WARN after micro-optimizations: p99 ~34ms (was 86.9ms), avg ~12.3ms (was 14.2ms), AI starvation ~3.6 (was 12.3). Cover search grid reduced (8x8 + early-out), terrain tick staggered (BVH skips vegetation-rebuild frames).
2. Shot-through-terrain bug fixed: height profile prefilter was too aggressive on undulating terrain, falsely blocking valid shots in Open Frontier. BVH raycast now handles occlusion within 200m; prefilter only applies 200-280m.
3. `frontier30m` soak tails remain FAIL (`p99=85.90ms`). Terrain-led; tick stagger landed but not yet re-measured.
4. A Shau harness is behavior-valid; next step is terrain-tail reduction, then WarSim/heap isolation.
5. Game modes Phases 6-7 complete. Mode product passes (Phase 5) are the next gameplay work.
6. Dead code cleanup: VoiceCalloutSystem removed (was disabled, wired through 16 files), FRIENDLY_FIRE dead constants removed.
7. See `docs/NEXT_WORK.md` for the active checklist.

## Documentation Contract

- Update `docs/ARCHITECTURE_RECOVERY_PLAN.md` after architecture/perf decisions.
- Update `docs/PROFILING_HARNESS.md` when capture flags/semantics change.
- See `docs/AGENT_TESTING.md` for agent validation workflows and perf baselines.
- Keep docs concise; remove stale status logs.
