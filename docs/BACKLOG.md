# Backlog

Last updated: 2026-04-17

## P0 - Performance Blockers

- [ ] Reduce initial JS bundle (~710-734kB main runtime chunks). Recast WASM dedupe (C2) trimmed shipped WASM ~half; remaining wins are in `three` and `index` chunks.

## P1 - Gameplay

- [ ] Wire NPC pilot AI into SystemUpdater for live NPC flight
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB)
- [ ] Ground vehicles (M151 jeep first - GLB exists, need driving runtime)
- [ ] Fixed-wing role split follow-up: A-1 rough-field tuning, AC-47 orbit workflow, F-4 assist/HUD/weapons
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds
- [ ] Stationary weapons (M2 .50 cal emplacements, NPC manning)
- [ ] Faction AI doctrines - D2 landed the first observable differentiation (VC panics sooner than NVA); keep expanding the `FACTION_COMBAT_TUNING` lookup with stance/engagement/retreat parameters.

## P2 - Content & Polish

- [ ] Vegetation billboard remakes
- [ ] Terrain texture improvements
- [ ] Road network generation (splines, intersections, pathfinding)
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh)
- [ ] Day/night cycle
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
