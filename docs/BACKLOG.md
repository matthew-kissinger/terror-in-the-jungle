# Backlog

Last updated: 2026-04-19 (atmosphere-foundation cycle drafted)

## Recently Completed (cycle-2026-04-18-harness-flight-combat, 2026-04-18 → 2026-04-19)

Seven merged PRs, two rounds abandoned pre-merge, one round replaced mid-cycle. Briefs archived under `docs/tasks/archive/cycle-2026-04-18-harness-flight-combat/`.

- **PR #86 `b1-flight-cutover`** — deleted the `FixedWingPhysics` shim; 5 callers now consume `Airframe` directly.
- **PR #87 `utility-ai-doctrine-expansion`** — per-faction response curves + reposition/hold actions; closed the RETREATING orphan state.
- **PR #88 `perf-harness-architecture`** — declarative scenario runner. **Reverted by PR #89** after live playtest showed the policy didn't drive the player toward enemies.
- **PR #90 `perf-harness-redesign`** — 4-layer imperative terrain-aware driver with LOS gate and per-mode validators. Replaced the reverted declarative runner.
- **PR #91 `heap-regression-investigation`** — pooled utility-AI per-tick allocations; killed the +296% combat120 heap growth from the prior cycle.
- **PR #92 `npc-fixed-wing-pilot-ai`** — NPC fixed-wing pilot state machine + airfield integration. First live consumer of the post-cutover `Airframe` surface.
- **PR #93 `perf-harness-killbot`** — rule-only NSRL-style killbot driver with navmesh + pure-pursuit. Superseded later in the cycle by the state-machine bot.
- **PR #94 `perf-harness-verticality-and-sizing`** — NPC speed cap, player eye-height raise (2→2.2), NPC billboard shrink (5×7→3.2×4.5), exported `PLAYER_MAX_CLIMB_ANGLE_RAD`, path-trust invariant.
- **PR #95 `perf-harness-player-bot`** — state-machine bot (PlayerBotIntent + controller) mirroring NPCFixedWingPilot. **Shipped a behavior regression** (retreats on damage, hits=0 in live playtest) fixed by PR #96.
- **PR #96 `perf-harness-player-bot-aim-fix`** — root-caused the PR #95 regression to a yaw-convention bug (`atan2(dx, -dz)` in a Three.js world where `forward = (-sin(yaw), 0, -cos(yaw))`). Switched aim path to `camera.lookAt()` matching the rest of the codebase. Wired the dormant `evaluateFireDecision` aim-dot gate. Stripped SEEK_COVER + RETREAT. Combat120 smoke: `shots=420, hits=221, 52.6% hit rate`. User confirmed live playtest: bot reached victory.

### Abandoned rounds

- `perf-openfrontier-navmesh-fix` (narrow navmesh-null bug investigation) — killed mid-run after deeper architectural gap surfaced.
- `perf-harness-player-bot-aggressive` (defensive-state strip) — killed mid-run after executor's own smoke revealed the deeper aim convention bug.
- `perf-baseline-refresh` Round 3, 5, 8 attempts — Round 3 stopped on openfrontier validator fail (killbot artifact), Round 5 stopped because the bot was retreating, Round 8 died on a transient 500 API error before producing captures. Baseline refresh carries into next cycle.

### Follow-ups filed (new briefs under `docs/tasks/`)

- `perf-baseline-refresh` (P0) — carried forward.
- `harness-lifecycle-halt-on-match-end` (P1) — harness kept running past in-game victory screen during PR #96 playtest.
- `bot-pathing-pit-and-steep-uphill` (P1) — bot over-paths on steep direct-uphill-to-objective, and gets trapped in pit geometry.
- `harness-stats-accuracy-damage-wiring` (P2) — accuracy / damage-dealt / damage-taken / kills not surfaced in `summary.json`; state histogram disconnect between `harnessDriver.getDebugSnapshot().botState` and `perf-capture.ts`'s `movementState` read.

### Lessons (codified)

- `memory/feedback_harness_reuses_npc_primitives.md` — reference NPC primitives (LOS, targeting, navmesh), but do NOT inherit NPC cautiousness (SEEK_COVER, RETREAT). Harness bot plays like a focused human, not a cautious AI soldier.
- Hand-rolled yaw math for camera-pointing is fragile; match the codebase's existing `camera.lookAt()` pattern (used by `PlayerCamera`, `DeathCamSystem`, `MortarCamera`, `SpectatorCamera`, `flightTestScene`, old killbot).
- Wire `evaluateFireDecision`-style aim-dot gates into fire paths; they catch entire classes of future convention regressions automatically.

## Cycle conventions (2026-04-18)

## Cycle conventions (2026-04-18)

Phase-letter task IDs (A/B/C/D/E/F) are retired. Every cycle starts from
the "Current cycle" stub in
[AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md), uses descriptive slugs
for task IDs (`plane-test-harness`, not `A1`), and identifies itself with
a dated slug: `cycle-YYYY-MM-DD-<slug>`. Closed-cycle briefs live under
`docs/tasks/archive/<cycle-id>/`. See the "Cycle lifecycle" section of
the runbook for the end-of-cycle ritual.


## P0 - Performance Blockers

- [ ] `perf-baseline-refresh` — rebaseline all 4 scenarios against the aim-fixed player bot (PR #96). Carried from `cycle-2026-04-18-harness-flight-combat` after three failed attempts. Stale since 2026-03-06. Brief: `docs/tasks/perf-baseline-refresh.md`.
- [ ] Reduce initial JS bundle (~710-734kB main runtime chunks). Recast WASM dedupe (C2) trimmed shipped WASM ~half; remaining wins are in `three` and `index` chunks.

## P1 - Perf harness

- [ ] `harness-lifecycle-halt-on-match-end` — stop perf capture when match ends (bot kept running past victory screen in PR #96 playtest). Blocks reliable `frontier30m`. Brief: `docs/tasks/harness-lifecycle-halt-on-match-end.md`.
- [ ] `bot-pathing-pit-and-steep-uphill` — bot over-paths on direct-uphill-to-objective and gets stuck in pit geometry. Brief: `docs/tasks/bot-pathing-pit-and-steep-uphill.md`.

## P1 - Gameplay

- [ ] Wire NPC pilot AI into SystemUpdater for live NPC flight
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB)
- [ ] Ground vehicles (M151 jeep first - GLB exists, need driving runtime)
- [ ] Fixed-wing role split follow-up: A-1 rough-field tuning, AC-47 orbit workflow, F-4 assist/HUD/weapons
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds
- [ ] Stationary weapons (M2 .50 cal emplacements, NPC manning)
- [ ] Faction AI doctrines - D2 landed the first observable differentiation (VC panics sooner than NVA); keep expanding the `FACTION_COMBAT_TUNING` lookup with stance/engagement/retreat parameters.

## P2 - Observability

- [ ] `harness-stats-accuracy-damage-wiring` — accuracy, damage-dealt, damage-taken, kills not surfaced in `summary.json`; state histogram disconnect between bot snapshot and capture reader. Brief: `docs/tasks/harness-stats-accuracy-damage-wiring.md`.

## P2 - Content & Polish

- [ ] Vegetation billboard remakes
- [ ] Terrain texture improvements
- [ ] Road network generation (splines, intersections, pathfinding)
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh)
- [ ] Day/night cycle — v1 foundation queued for `cycle-2026-04-20-atmosphere-foundation` (per-scenario static TOD presets; live cycling deferred). Design: `docs/ATMOSPHERE.md`.
- [ ] Music/soundtrack
- [ ] Re-capture `openfrontier:short` after the 2026-04-02 air-vehicle batching + visibility pass and decide whether aircraft/helicopter far-LOD meshes are still needed

## P3 - Architecture

- [ ] Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] Decide: remaining connector bursts -> constructor/runtime dependency objects vs grouped setters
- [ ] Split tracked tick groups into smaller declared groups where cadence can differ safely
- [ ] Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] Continue identifying deploy-only UI/runtime that can defer without touching menu path

## Far Horizon

- Hydrology system / water engine (river system, swimming, depth rendering, watercraft physics)
- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Multiplayer/networking
- Destructible structures
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (tiled DEM)
- ECS evaluation for combat entities (see `docs/rearch/E1-ecs-evaluation.md` on `spike/E1-ecs` - deferred)

## Research references (external repos worth cloning into `examples/` for pattern study)

- **prose.md + peer prose-format repos** — clone into `examples/prose-main/` (gitignored) for reference on how they structure declarative runtime configs, policy/plugin registration, and orchestration/execution patterns. Findings inform the queued `perf-harness-architecture` brief and future multi-agent cycles. Write notes to `docs/rearch/prose-research.md` if patterns generalize.

## Known Issues (flagged, deferred)

1. **NPC hypersprint.** Mechanism identified in `CombatantLODManager` per-update dt amortization (lines ~425, ~454-456, ~652): logical positions tick at full dt but rendered positions don't interpolate, so low-LOD crowds visually teleport. Proper fix is render-side position interpolation (logical vs rendered position split). Shelved for Phase F; F1's attempted dt clamp was closed because it would have broken LOD amortization and the speed-ceiling bypasses it targeted were already fixed on master.
2. **Combatant mesh silent-drop at scale.** `CombatantMeshFactory` uses `maxInstances = 120`; any bucket that exceeds 120 silently drops the overflow. Flagged in E2 memo (`spike/E2-rendering-at-scale`).
3. **Orphan AI states.** `CombatantState.RETREATING` and `CombatantState.IDLE` are declared in `src/systems/combat/types.ts` but have no state handlers (E3 memo on `spike/E3-combat-ai-paradigm`).
4. **Duplicate squad-suppression mutation paths.** `AIFlankingSystem`, `AIStateEngage.initiateSquadSuppression`, and `applySquadCommandOverride` are three parallel paths that can mutate squad command state. Consolidation deferred to Phase F utility-AI design (E3 memo).
5. **Cross-vehicle state bleed.** `PlayerCamera.flightMouseControlEnabled` is not reset when switching between fixed-wing and helicopter adapters (E6 memo on `spike/E6-vehicle-physics-rebuild`). Low impact in practice but a latent source of adapter-entry surprise.
6. **Service worker cache version pinned.** `sw.js` uses hard-coded `CACHE_NAME = 'titj-v1'`. Bump on next theme-changing or asset-changing deploy to avoid stale caches (flagged during F2b).

## Known Bugs

1. Main runtime bundle is ~780kB (startup stable but heavy).
2. Open Frontier fixed-wing runtime is player-usable and now has deterministic takeoff probes, but still lacks NPC pilots, orbit/combat mission integration, and landing/orbit acceptance coverage beyond the current probe.
3. First grenade/explosion cold-start hitch needs fresh perf evidence after the hidden live-effect warmup change.

## Architecture Debt

1. SystemManager ceremony - adding a new system touches SystemInitializer + composers.
2. PlayerController setter methods (reduced after vehicle adapter refactor; model/camera setters still duplicated).
3. Variable deltaTime physics (no fixed timestep for grenade/NPC/particle systems; player, helicopter, and fixed-wing use FixedStepRunner).
4. Mixed UI paradigms (~50 files with raw createElement alongside UIComponent + CSS Modules).

## Phase F Candidates (planning input from E memos)

E-track spike memos were kept on `spike/E*` branches and never merged. Pull each branch to read its memo.

- **Utility-AI combat layer.** Informed by D2's `FACTION_COMBAT_TUNING` lookup pattern. Memo: `docs/rearch/E3-combat-ai-evaluation.md` on `spike/E3-combat-ai-paradigm`.
- **Render-side position interpolation for LOD'd combatants.** Unblocks the hypersprint fix that F1 could not safely ship. Cross-references `CombatantLODManager.ts` dt amortization.
- **Agent/player API unification.** 1755-LOC driver potentially rewritable to ~150 LOC. Memo: `docs/rearch/E4-agent-player-api.md` on `spike/E4-agent-player-api`. Status: prototype-more.
- **Deterministic sim + seeded replay.** Proven in spike; ~200 non-determinism sources catalogued. Memo: `docs/rearch/E5-deterministic-sim.md` on `spike/E5-deterministic-sim`. Status: prototype-more.
- **Vehicle physics rebuild.** Airframe spike and cross-vehicle state bleed confirmed. Memo: `docs/rearch/E6-vehicle-physics-evaluation.md` on `spike/E6-vehicle-physics-rebuild`. Status: prototype-more.
- **Rendering at scale.** E2 deferred overall but flagged the `maxInstances = 120` silent-drop listed under Known Issues. Memo: `docs/rearch/E2-rendering-evaluation.md` on `spike/E2-rendering-at-scale`.
- **ECS evaluation.** Deferred - bitECS came in ~0.97x at N=3000; V8 already inlines Vector3 shapes well enough. Memo: `docs/rearch/E1-ecs-evaluation.md` (also on master) and `spike/E1-ecs`.

## Recently Completed (cycle-2026-04-18-rebuild-foundation)

Nine commits on master between `9a0a53e` and `127f0a2`, seven merged PRs
plus an A2 root-cause followup and an A4 perf-driver revert. Briefs are
archived under `docs/tasks/archive/cycle-2026-04-18-rebuild-foundation/`
with letter prefixes dropped (slug convention).

- **plane-test-harness** (`5571be1`) — isolated `?mode=flight-test` scene
  plus L3 integration harness at
  `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`. Single
  source of truth for fixed-wing flight validation going forward.
- **render-position-interpolation** (`a6a78b1`) — new
  `CombatantRenderInterpolator` splits logical vs rendered position for
  LOD'd combatants. Fixes NPC hypersprint teleport under LOD dt
  amortization without changing sim behavior.
- **render-interpolation-followup** (`9a0a53e`) — root-cause fix in
  `CombatantLODManager` culled-loop: `return` → `continue` so a
  mid-bucket early-out no longer drops every combatant behind it.
  Removed the defensive try/finally scaffolding that was masking the
  symptom.
- **rendering-at-scale** (`797b610`) — raised `CombatantMeshFactory`
  instance cap and surfaced overflow instead of silently dropping past
  120. Addresses the silent-drop listed under Known Issues.
- **agent-player-api** (`86517d9` + revert `82159c8`) — typed
  `AgentController` / `AgentAction` / `AgentObservation` primitive
  landed under `src/systems/agent/`. Accompanying rewrite of
  `scripts/perf-active-driver.js` introduced a direction-inversion
  regression in combat120 perf captures and was reverted to the
  pre-cycle 1755-LOC driver. The primitive itself stays and will be
  consumed by the next cycle's harness rebuild.
- **vehicle-physics-rebuild** (`3268908`) — unified `Airframe` module
  with swept collision and explicit raw/assist control laws, backing the
  A1 integration tests. `FixedWingPhysics` / `FixedWingControlLaw` /
  `FixedWingConfigs` kept as thin compat shims to avoid an 18+ caller
  cascade; full cutover queued as a follow-up. `FixedWingPlayerAdapter`
  not rewritten in this cycle.
- **utility-ai-combat-layer** (`af62b37`) — opt-in `UtilityScorer`
  pre-pass in `AIStateEngage.handleEngaging`, gated on
  `FACTION_COMBAT_TUNING[faction].useUtilityAI`. VC faction canary
  enabled; NVA / US / ARVN still run the existing state machine
  unchanged.
- **deterministic-sim-seeded-replay** (`127f0a2`) — `SeededRandom`
  (xoroshiro128++) plus `ReplayRecorder` / `ReplayPlayer`. A 30s replay
  converges byte-identical on tick-space input; open non-determinism
  sources catalogued in `docs/rearch/C2-determinism-open-sources.md`.
  Falls back to `Math.random()` when no replay session is active, so
  existing code paths are untouched.

### Follow-ups carried forward

- **Heap growth regression** on combat120 (~+296% vs baseline during the
  cycle) — investigate whether a specific round introduced it.
- **`perf-baselines.json` is stale.** p99=100ms in-file; reality is
  closer to 30ms. Refresh after the next cycle's harness rebuild so
  baselines reflect the new measurement methodology.
- **B1 full cutover.** Delete `FixedWingPhysics` /
  `FixedWingControlLaw` / `FixedWingConfigs`, rewrite
  `FixedWingPlayerAdapter`, fan out through the 18+ callers.
- **perf-harness-architecture** — brief already written at
  `docs/tasks/perf-harness-architecture.md`, staged for the next cycle.
  Replaces the keystroke-emulation active-driver with declarative
  scenario / policy / validator architecture on top of the
  `AgentController` primitive.

## Recently Completed (2026-04-17 drift-correction run)

Sixteen PRs merged across A/B/C/D tracks plus two F-track UI fixes. One PR (F1) was closed as obsolete-on-master.

- **B1** (#57) - wired player-as-attacker into NPC damage path. `CombatantCombat.ts` / `CombatantDamage.ts` now propagate a `_playerAttackerProxy` mirroring the existing `_playerTarget` pattern, so NPC suppression / panic / threat-bearing fires on player shots.
- **B2** (#63) - `scripts/perf-active-driver.js` dwell-timer fix.
- **B3** (#67) - `StuckDetector` escalation now tracks goal anchors independently of backtrack anchors, so the 4-attempt abandon path is reachable instead of being reset on every anchor flip.
- **A1-A5** (#66 / #62 / #64 / #65 / #68) - vehicle / nav / terrain / UI / combat test triage. Large deletions, no behavior change.
- **C1** (#61) - perf-build target via `VITE_PERF_HARNESS=1`; new `build:perf` / `preview:perf` scripts; `scripts/preview-server.ts` helper. Default perf-capture server mode is now `preview`.
- **C2** (#58) - `recast-navigation` WASM alias dedupe (`@recast-navigation/wasm` -> `@recast-navigation/wasm/wasm`). Saves ~212kB gzip across main and worker chunks.
- **C3** (#59) - new `docs/DEPLOY_WORKFLOW.md`; fixed a real Cloudflare Pages duplicate `Cache-Control` bug via `public/_headers`.
- **C4** (#60) - dev-server lifecycle hardening (port kill, explicit teardown, PID logging) around perf captures.
- **D1** (#69) - new `docs/COMBAT.md` documenting the combat subsystem. Concluded the combat tree is adequately bounded; no code refactor.
- **D2** (#74) - new `src/config/FactionCombatTuning.ts`. `FACTION_COMBAT_TUNING[faction]` lookup with per-faction `panicThreshold`, consumed in `AIStateEngage.handleEngaging`. First observable per-faction differentiation (VC panics sooner than NVA).
- **F2** (#70) + **F2b** (#73) - amber/jungle boot splash in `index.html`; residual blue eliminated from `src/core/LoadingUI.css` and `src/ui/loading/MissionBriefing.module.css`.

**Closed / shelved:** F1 (#71) was closed. Its dt clamp would have broken LOD amortization, and the speed-ceiling bypasses it targeted had already been fixed on master. The real hypersprint cause is logged under Known Issues above.

## Recently Completed (2026-04-06)

- [x] VehicleStateManager: single source of truth for player vehicle state with adapter pattern
- [x] Fixed-wing physics: ground stabilization, thrust speed gate, F-4 TWR correction, resetToGround on enter
- [x] Helicopter perf: door gunner restricted to piloted only, idle rotor animation skip
- [x] Vehicle control state decoupled from PlayerMovement (~550 lines removed)
