# Agent Instructions

Last updated: 2026-04-19

This is the authoritative, agent-agnostic operating guide for this repo. Every agent (Claude Code, Codex, Cursor, Gemini, humans) should read this file first. `CLAUDE.md` is a thin wrapper that adds Claude-Code-specific context on top of what's here.

## Project

Terror in the Jungle - a browser-based 3D combat game set in the Vietnam War. Three.js 0.184, TypeScript 6.0, Vite 8, Vitest 4, Node 22.

Vision: up to 3,000 AI combatants in a single match, stable frame-time tails under load, real-terrain scenarios (A Shau Valley 21km DEM). Ships to Cloudflare Pages at https://terror-in-the-jungle.pages.dev/.

## Commands

```bash
# Dev loop
npm run doctor                   # Verify Node, dependencies, and Playwright browsers
npm run dev                      # Vite dev server (HMR, unminified)
npm run build                    # Retail production build (dist/) - no harness
npm run build:perf               # Perf-harness build (dist-perf/) - VITE_PERF_HARNESS=1
npm run preview                  # Preview dist/ via vite preview
npm run preview:perf             # Preview dist-perf/ via vite preview

# Tests and lint
npm run typecheck                # Source TypeScript check
npm run test:run                 # All Vitest tests
npm run test:quick               # All tests, dot reporter (fast output)
npm run test:integration         # Integration scenario tests only
npm run lint                     # ESLint on src/
npm run deadcode                 # knip dead-code scan (advisory)

# Gated checks
npm run validate:fast            # typecheck + lint + test:quick
npm run validate                 # lint + test:run + build + smoke:prod
npm run validate:full            # test:run + build + combat120 capture + perf:compare
npm run check:mobile-ui          # Built-app phone viewport flow gate
npm run check:states             # State coverage probe
npm run check:hud                # HUD layout validator
npm run check:memory             # Memory growth tracker
npm run probe                    # Engine health probe
npm run playtest:mobile          # Mobile playtest driver

# Perf captures and comparison
npm run perf:capture:combat120      # Primary regression target, 120 NPC AI stress
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m    # 30min soak
npm run perf:quick                  # Smoke capture (not a baseline)
npm run perf:compare                # Compare latest vs tracked baselines
npm run perf:compare:strict         # Same, but fail on warnings too
npm run perf:update-baseline        # Overwrite baselines from latest
```

## Daily loop

```
1. Branch: task/<id>-<kebab-slug> (e.g. task/B3-npc-terrain-stall)
2. npm run doctor
3. npm run dev (or npm run build:perf && npm run preview:perf for prod-shape)
4. Make change
5. npm run validate:fast
6. git commit, push to task branch
7. Open PR titled "<type>(<scope>): <summary> (<slug>)"
```

For perf-sensitive work, add `npm run validate:full` before push.

## Runtime Landmarks

- Entry: `src/main.ts`, `src/core/bootstrap.ts`
- Engine: `src/core/GameEngine.ts`, `src/core/GameEngineInit.ts`, `src/core/SystemUpdater.ts`, `src/core/GameEventBus.ts`
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`, `src/config/MapSeedRegistry.ts`, `src/config/FactionCombatTuning.ts`
- Combat: `src/systems/combat/*` (authoritative subsystem doc: `docs/COMBAT.md`)
- Navigation: `src/systems/navigation/*` (navmesh, crowd, movement adapter)
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Vehicles: `src/systems/vehicle/*` (VehicleStateManager, FixedWingPlayerAdapter, HelicopterPlayerAdapter, FixedWingModel, FixedWingPhysics, VehicleManager), `src/systems/helicopter/*`
- World features: `src/systems/world/*` (WorldFeatureSystem, FirebaseLayoutGenerator, AirfieldLayoutGenerator)
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`, `scripts/preview-server.ts`
- UI: `src/ui/hud/`, `src/ui/controls/`, `src/ui/icons/`, `src/ui/screens/`, `src/ui/loading/`, `src/ui/engine/`
- Tests: `src/integration/`, `src/test-utils/`

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap, key patterns |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat subsystem architecture (new, D1 2026-04-17) |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer test contract. Read before writing tests. |
| [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) | Fenced interfaces in `src/types/SystemInterfaces.ts` |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Profiling commands, scenarios, validation gates |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev setup, validation, deployment, pre-push checklist |
| [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) | Cloudflare Pages deploy + cache strategy (new, C3 2026-04-17) |
| [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) | Human playtest gate for game-feel changes |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Open work items, known bugs, architecture debt |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Vision and phase plan |
| [docs/AGENT_ORCHESTRATION.md](docs/AGENT_ORCHESTRATION.md) | Multi-agent DAG (active when orchestrating) |
| [docs/REARCHITECTURE.md](docs/REARCHITECTURE.md) | Phase E paradigm questions |
| `docs/rearch/E[1-6]*.md` | Phase E evaluation memos (on `spike/E*` branches only; not merged) |
| [docs/ASSET_MANIFEST.md](docs/ASSET_MANIFEST.md) | 75 GLBs, integration status |
| [docs/UI_ICON_MANIFEST.md](docs/UI_ICON_MANIFEST.md) | Pixel-art UI icons |

## Conventions

### Code Style
- TypeScript strict mode
- ESLint with `import/no-cycle` (warn, maxDepth 3)
- No `any` types in `src/types/SystemInterfaces.ts`
- Named constants over magic numbers (see `CombatantConfig.ts`, `FactionCombatTuning.ts`)
- Scratch vector pre-allocation in hot paths

### Testing
- Vitest with jsdom environment
- Shared test utilities in `src/test-utils/`
- Integration tests in `src/integration/scenarios/`
- **Behavior tests only, not implementation-mirror tests.** See `docs/TESTING.md` for the four-layer contract. Do not assert on tuning constants, phase/state label strings, or internal method names.

### Patterns to Follow
- Systems implement `GameSystem` interface (`init`, `update`, `dispose`)
- Grouped runtime composers for dependency wiring
- `SimulationScheduler` cadence-based update groups
- `ObjectPool` for hot-path allocations
- `GameEventBus` for cross-system events (queue-and-flush)
- CSS Modules + UIComponent for new UI
- Per-faction tuning via `FACTION_COMBAT_TUNING[faction]` lookup (see D2 pattern in `AIStateEngage`)

### Patterns to Avoid
- Do not add `any` types
- Do not reorder tick groups without checking dependencies
- Do not add systems without updating SystemInitializer + isTrackedSystem()
- Do not commit .env files or secrets
- Do not assert on internal tuning numbers or state-name strings in tests

## Hard rules

1. **Don't modify fenced interfaces without explicit approval.** `src/types/SystemInterfaces.ts` is the fence boundary. Changes there require `[interface-change]` in the PR title and human approval. Try to solve the problem without a fence change first.
2. **Don't rewrite code that isn't in your task's scope list.** Comments and formatting outside scope are off-limits unless required by the change.
3. **Don't write implementation-mirror tests.** Assert behavior, not how the code happens to spell it today.
4. **Don't push directly to master unless you own the merge step.** Agents on tasks push to their own branches; the orchestrator merges.
5. **Verify locally before pushing:** `npm run lint`, `npm run test:run`, `npm run build` all green.

## Game-feel requires human playtest

Tests, lint, build, and the fixed-wing runtime probe catch correctness regressions. They do not catch feel regressions. An aircraft that passes every test can still be miserable to fly. A combat pacing change that leaves AI reaction times "technically correct" can still feel lifeless.

Any change to flight, driving, combat rhythm, or UI responsiveness must be validated by a human running `docs/PLAYTEST_CHECKLIST.md`. Passing automated checks is necessary, not sufficient. If you can't get a human through the checklist, say so explicitly in the PR description rather than claiming the change is done.

## Known gotchas for agents

- **gh PAT scope.** If `gh pr create` or `gh pr merge` fails with "Resource not accessible by personal access token", prefix with `GITHUB_TOKEN= GH_TOKEN= gh ...` to fall back to keyring auth.
- **Don't anchor on doc claims against current file state.** Briefs and backlogs drift. Verify with Read against the current file before proposing a fix. If the brief's premise is wrong, stop and escalate, don't rationalize an outdated task.
- **Executor discipline.** If you are a dispatched executor, read `Assess before you execute` in `.claude/agents/executor.md` before editing. Trace end-to-end, confirm the bug reproduces or the code referenced still exists, and check the tests that target the area.
- **Perf captures default to preview mode** (post-C1). To debug against source maps, pass `--server-mode dev` to `scripts/perf-capture.ts` or `scripts/fixed-wing-runtime-probe.ts`.
- **Worktrees do not inherit `node_modules`.** `test -d node_modules || npm ci --prefer-offline` before local verification.
- **Keep ephemeral agent worktrees outside the repo root when possible.** Nested clones and caches slow IDE indexing, ripgrep, and agent tree walks even when ignore rules are present.
