# Agent Instructions

Last updated: 2026-05-03

This is the authoritative, agent-agnostic operating guide for this repo. Every agent (Claude Code, Codex, Cursor, Gemini, humans) should read this file first. `CLAUDE.md` is a thin wrapper that adds Claude-Code-specific context on top of what's here.

## Project

Terror in the Jungle - a browser-based 3D combat game set in the Vietnam War. Three.js 0.184, TypeScript 6.0, Vite 8, Vitest 4, Node 24.

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
npm run validate:fast            # Pixel Forge cutover/crop checks + typecheck + lint + test:quick
npm run validate                 # lint + test:run + build + smoke:prod
npm run validate:full            # test:run + build + combat120 capture + perf:compare
npm run check:mobile-ui          # Built-app phone viewport flow gate
npm run check:states             # State coverage probe
npm run check:hud                # HUD layout validator
npm run check:memory             # Memory growth tracker
npm run check:projekt-143-culling-proof  # Headed deterministic renderer/category proof
npm run check:projekt-143-cycle2-proof  # Cycle 2 visual/runtime proof bundle
npm run probe                    # Engine health probe
npm run probe:fixed-wing         # Browser-level fixed-wing takeoff/climb/orbit/handoff/approach probe
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
npm run evidence:atmosphere         # All-mode ground/sky/aircraft atmosphere + terrain visibility evidence

# Asset import and validation
npm run assets:import-pixel-forge-aircraft  # Normalize/copy Pixel Forge aircraft GLBs + provenance
npm run assets:generate-npc-crops            # Regenerate Pixel Forge NPC per-tile imposter crop map
npm run check:pixel-forge-npc-crops          # Verify generated NPC crop map is current
```

## Daily loop

```
1. Branch: task/<descriptive-slug> (e.g. task/preserve-drawing-buffer-dev-gate). Phase-letter IDs (A/B/C/D) were retired 2026-04-18.
2. npm run doctor
3. npm run dev (or npm run build:perf && npm run preview:perf for prod-shape)
4. Make change
5. npm run validate:fast
6. git commit, push to task branch
7. Open PR titled "<type>(<scope>): <summary> (<slug>)"
```

For perf-sensitive work, add `npm run validate:full` before push.

## Current-state discipline

- Read [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) before making current
  claims. Roadmap, backlog, comments, archived docs, and tests are sensors, not
  truth.
- A Shau Valley is a required scenario, not optional coverage. If work touches
  terrain, navigation, atmosphere, vehicles, airfields, deploy assets, or
  performance, validate A Shau directly and keep its current blockers visible.
- Do not let A Shau-focused work narrow the release gate. Before push/deploy in
  a recovery pass, rerun the all-mode evidence path so Open Frontier, TDM,
  Zone Control, and combat120 stay covered too.
- Local preview evidence is not live production evidence. After deployment,
  verify the live Pages app shell, `/asset-manifest.json`, R2 DEM URL, `/sw.js`,
  Recast WASM/build asset headers, and any service-worker cache behavior before
  claiming the deployed game matches local validation.

## Runtime Landmarks

- Entry: `src/main.ts`, `src/core/bootstrap.ts`
- Engine: `src/core/GameEngine.ts`, `src/core/GameEngineInit.ts`, `src/core/SystemUpdater.ts`, `src/core/GameEventBus.ts`
- Modes: `src/config/gameModeTypes.ts`, `src/config/*Config.ts`, `src/config/MapSeedRegistry.ts`, `src/config/FactionCombatTuning.ts`
- Combat: `src/systems/combat/*` (authoritative subsystem doc: `docs/COMBAT.md`)
- Navigation: `src/systems/navigation/*` (navmesh, crowd, movement adapter)
- Strategy (A Shau): `src/systems/strategy/*`
- Terrain: `src/systems/terrain/*`
- Vehicles: `src/systems/vehicle/*` (VehicleStateManager, FixedWingPlayerAdapter, HelicopterPlayerAdapter, FixedWingModel, `airframe/*`, VehicleManager), `src/systems/helicopter/*`
- World features: `src/systems/world/*` (WorldFeatureSystem, FirebaseLayoutGenerator, AirfieldLayoutGenerator)
- Harness: `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `scripts/perf-compare.ts`, `scripts/preview-server.ts`
- UI: `src/ui/hud/`, `src/ui/controls/`, `src/ui/icons/`, `src/ui/screens/`, `src/ui/loading/`, `src/ui/engine/`
- Tests: `src/integration/`, `src/test-utils/`

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tick graph, coupling heatmap, key patterns |
| [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) | Current verified repo state, known drift, and immediate priorities |
| [docs/ARCHITECTURE_RECOVERY.md](docs/ARCHITECTURE_RECOVERY.md) | Architecture recovery cycles, gates, current findings, and residual risks |
| [docs/COMBAT.md](docs/COMBAT.md) | Combat subsystem architecture (new, D1 2026-04-17) |
| [docs/TESTING.md](docs/TESTING.md) | Four-layer test contract. Read before writing tests. |
| [docs/INTERFACE_FENCE.md](docs/INTERFACE_FENCE.md) | Fenced interfaces in `src/types/SystemInterfaces.ts` |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Profiling commands, scenarios, validation gates |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev setup, validation, deployment, pre-push checklist |
| [docs/DEPLOY_WORKFLOW.md](docs/DEPLOY_WORKFLOW.md) | Cloudflare Pages deploy + cache/service-worker strategy |
| [docs/CLOUDFLARE_STACK.md](docs/CLOUDFLARE_STACK.md) | Target Cloudflare architecture for Pages, R2 assets, Workers, and interaction services |
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
- Do not add systems without updating `SystemInitializer` plus the declarative
  schedule metadata that drives fallback exclusions.
- Do not commit .env files or secrets
- Do not assert on internal tuning numbers or state-name strings in tests

## Hard rules

1. **Don't modify fenced interfaces without explicit approval.** `src/types/SystemInterfaces.ts` is the fence boundary. Changes there require `[interface-change]` in the PR title and human approval. Try to solve the problem without a fence change first.
2. **Don't rewrite code that isn't in your task's scope list.** Comments and formatting outside scope are off-limits unless required by the change.
3. **Don't write implementation-mirror tests.** Assert behavior, not how the code happens to spell it today.
4. **Don't push directly to master unless you own the merge step.** Agents on tasks push to their own branches; the orchestrator merges.
5. **Verify locally before pushing:** `npm run lint`, `npm run test:run`, `npm run build` all green.

## Game-feel requires human playtest

Tests, lint, and build catch many correctness regressions. The fixed-wing runtime probe is intended to cover browser-level aircraft validation too; check [docs/STATE_OF_REPO.md](docs/STATE_OF_REPO.md) and run `npm run probe:fixed-wing` before treating aircraft changes as validated. None of these checks catch feel regressions. An aircraft that passes every other test can still be miserable to fly. A combat pacing change that leaves AI reaction times "technically correct" can still feel lifeless.

Any change to flight, driving, combat rhythm, or UI responsiveness must be validated by a human running `docs/PLAYTEST_CHECKLIST.md`. Passing automated checks is necessary, not sufficient. If you can't get a human through the checklist, say so explicitly in the PR description rather than claiming the change is done.

Cycle 2 explicitly owns fixed-wing feel/interpolation work. Do not add more
vehicle types until the stiff response, altitude bounce/porpoise, and high-speed
camera/render shake questions have an evidence-backed decision.

## Known gotchas for agents

- **gh PAT scope.** If `gh pr create`, `gh pr merge`, or `gh workflow run ...`
  fails with "Resource not accessible by personal access token", clear
  `GITHUB_TOKEN` and `GH_TOKEN` so `gh` can fall back to keyring auth. For
  workflow dispatch, prefer the repo wrappers: `npm run ci:manual` and
  `npm run deploy:prod`.
- **Docs-only pushes may skip automatic CI.** `ci.yml` is path-filtered. If a
  doc-only commit is intended to prove or ship release state, run
  `npm run ci:manual` before deployment instead of assuming GitHub started CI.
- **Deploy is manual.** Pushing `master` is not production proof. Use
  `npm run deploy:prod`, then verify live `/asset-manifest.json`, Pages/R2/WASM
  headers, service-worker behavior, and a meaningful live browser flow before
  claiming production parity.
- **Deploy action runtime warnings.** The deploy workflow opts JavaScript
  actions into Node 24 with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`. If
  GitHub emits a new action-runtime deprecation warning, treat it as release-DX
  maintenance and document the decision before changing third-party action
  versions.
- **Don't anchor on doc claims against current file state.** Briefs and backlogs drift. Verify with Read against the current file before proposing a fix. If the brief's premise is wrong, stop and escalate, don't rationalize an outdated task.
- **Executor discipline.** If you are a dispatched executor, read `Assess before you execute` in `.claude/agents/executor.md` before editing. Trace end-to-end, confirm the bug reproduces or the code referenced still exists, and check the tests that target the area.
- **Perf captures default to preview mode** (post-C1). To debug against source maps, pass `--server-mode dev` to `scripts/perf-capture.ts` or `scripts/fixed-wing-runtime-probe.ts`.
- **Cycle 2 KB-CULL proof.** Do not certify close-NPC/NPC-imposter culling from combat-heavy AI Sandbox captures when `measurement_trust` fails. The 2026-05-03 60/120 NPC diagnostic captures exposed the renderer categories but failed harness trust. Use `npm run check:projekt-143-culling-proof` and then `npm run check:projekt-143-cycle2-proof`; the proof is headed by default because headless Chromium produced a lost WebGL context and zero renderer counters on this machine.
- **Worktrees do not inherit `node_modules`.** `test -d node_modules || npm ci --prefer-offline` before local verification.
- **Keep ephemeral agent worktrees outside the repo root when possible.** Nested clones and caches slow IDE indexing, ripgrep, and agent tree walks even when ignore rules are present.
