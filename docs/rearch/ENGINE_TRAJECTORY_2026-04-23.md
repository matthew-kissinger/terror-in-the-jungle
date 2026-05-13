# Engine trajectory memo — reuse across locations / games

Branch: `task/engine-trajectory-memo`
Date: 2026-04-23
Author: engine-trajectory-memo executor (cycle-2026-04-23-debug-and-test-modes, R1)
Status: Research + recommendations. Not a decision document. Informs future cycle planning. No code changes.

---

## 0. Framing

Terror in the Jungle started as one game and is drifting, by virtue of its own surface area, toward a reusable engine for jungle-combat-adjacent projects (additional wars, theatres, biomes, and eventually non-combat scenarios that share the 21km-DEM + large-AI-population shape). The human asked for a concrete map of what is currently working well, what is hand-rolled in places where a library would serve us better, what the fences look like today, and what sequencing would move us toward multi-location / multi-game reuse without a rearchitecture pause.

This memo is a map, not a plan. Its recommendations feed cycle planning — they do not auto-execute. Every recommendation is scoped against the stated vision anchors in `docs/REARCHITECTURE.md`: up to 3,000 AI combatants, stable frame-time tails under load, realistic large-map scenarios, and the longer-term aspiration of agent-as-player interaction.

---

## 1. Current stack snapshot

Versions pulled from `package.json` at HEAD and `npm outdated` against the 2026-04-23 registry. "Last updated" is the lockfile version in this tree; "Latest" is the `npm outdated` column at memo-write time.

| Dependency | Current | Latest (2026-04-23) | Role | 2026 verdict |
|---|---|---|---|---|
| `three` | 0.184.0 | 0.184.0 (wanted) | WebGL scene graph, GLTF loaders, PMREMGenerator, shadows | **Keep.** The r183→r184 upgrade landed in 7b74b3a; MEMORY.md currently says "r183" but the checked-in dep is `^0.184.0`. The project note should be refreshed. No known breakage on r185+ relevant to us; WebGPU backend is still preview for instancing-heavy scenes and lags on shadow map parity. |
| `three-mesh-bvh` | 0.9.9 | newer micros available | Fast raycast/LOS accelerator for combat + terrain | **Keep.** The library is tracked by the maintainer and currently the best-in-class raycast accelerator for Three.js. We have a local typing file (`src/types/three-mesh-bvh.d.ts`) — worth checking if the upstream types have caught up, which would let us drop our shim. |
| `@recast-navigation/core` | 0.43.0 | 0.43.1 | Navmesh runtime (WASM-backed Recast port) | **Keep.** Actively maintained; 0.43.1 is a patch. We already generate prebaked navmeshes at build time via `scripts/prebake-navmesh.ts`. |
| `@recast-navigation/generators` | 0.43.0 | 0.43.1 | Tile / solo navmesh generators | **Keep.** Same as above. |
| `@recast-navigation/three` | 0.43.0 | 0.43.1 | Three.js adapter for Recast | **Keep.** Same as above. |
| `@preact/signals-core` | 1.14.1 | 1.14.1 | Reactivity primitive (UI only) | **Keep, but bound.** Used by `UIComponent` and a handful of HUD surfaces (~2 source-file imports). It is tiny (~1KB), well-maintained, and fits the dev model. It is not spreading into game logic. |
| `tweakpane` | 4.0.5 (new this cycle) | 4.0.5 | Dev-only tuning UI | **New addition.** Scoped under `import.meta.env.DEV`; retail build tree-shakes it out. |
| `@fontsource-variable/jetbrains-mono`, `@fontsource/rajdhani`, `@fontsource/teko` | 5.x | 5.x | HUD typography | **Keep.** Static, no risk. |
| `vite` | 8.0.8 | 8.0.9 | Build + dev server | **Keep.** Patch available, nothing urgent. |
| `vitest` | 4.1.2 | 4.1.5 | Test runner | **Keep.** Patch available, nothing urgent. |
| `typescript` | 6.0.3 | 6.0.3 | Type system | **Keep.** `strict` on. |
| `eslint` | 9.39.4 | 10.2.1 | Linter | **Defer.** ESLint 10 is a major; wait for the first x.1 bugfix and read the migration notes before the flip. |
| `jsdom` | 29.0.1 | 29.0.2 | Test environment | **Keep.** Patch. |
| `playwright` | 1.59.1 | current | Browser automation for perf/probe harness | **Keep.** |
| `sharp` | 0.34.5 | current | Asset-pipeline image processing | **Keep.** |
| `cross-env` | 7.0.3 | 10.1.0 | Env-var shim for perf build | **Neutral.** A version bump is disruption with no gain; skip unless a need arises. |
| `knip` | 6.4.1 | 6.6.1 | Dead-code scan (advisory) | **Keep.** Minor bump is low risk. |

Nothing in the stack is EOL or blocked. The only thing worth flagging is that **MEMORY.md and CLAUDE.md both mention `three@0.183` / `r183` in historical text while package.json already pins `^0.184.0`**; orient future docs off `package.json`, not the memos.

---

## 2. What we reinvented

This section classifies the hand-rolled subsystems into *intentional* (domain-specific, an outside lib would be worse), *accidental* (an outside lib would be as good or better, we just didn't evaluate), or *situational* (intentional today, worth re-evaluating once a pain point lands).

### 2.1 `Airframe` — fixed-wing physics (intentional)

`src/systems/vehicle/airframe/Airframe.ts` + `buildCommand.ts` + `terrainProbe.ts` is a fixed-step, swept-collision, configurable-tier (raw / assist) fixed-wing sim. It is ~9 source files including tests.

Reusing a general physics engine (Rapier, Cannon-es, Jolt) to build this would require us to re-implement the interesting parts anyway: continuous-wheel-load liftoff gating, phase-aware control authority, ground-effect, swept terrain probes, per-airframe `AirframeConfig` tuning. General physics engines are great at rigid-body dynamics and bad at the "feel" tuning work that a flight model needs. The E6 memo (`docs/REARCHITECTURE.md` §E6) and the cycle-04-22 overnight flight rebuild both reached the same conclusion.

**Verdict: keep.** Do not rewrite on Rapier unless *multi-vehicle parity* becomes a blocker (ground cars + boats + helicopters + tanks all needing the same broadphase). Even then, consider hybridising: keep `Airframe` for flight feel, use a physics lib for ground vehicles.

### 2.2 `SystemManager` + `SystemInitializer` + `SystemRegistry` (situational)

The pattern is: 41 systems are constructed by `SystemInitializer`, stored in `SystemRegistry` as a typed `Map`, wired by three `*RuntimeComposer` files, and ticked by `SystemUpdater` in a documented budgeted order. Coupling heatmap (see `docs/ARCHITECTURE.md` §"Coupling Heatmap") shows `ZoneManager` with fan-in 11, `TicketSystem` with 9, `CombatantSystem` with 8.

This is not ECS. It is service-locator with setter injection. Each system holds heap references to others and mutates through those references. It works today; tick order is deliberate; scheduled cadences exist for non-critical groups.

The actual hot-path problem is E1 (ECS migration). The E1 spike memo (`docs/rearch/E1-ecs-evaluation.md`) ported `GrenadePhysics` to bitECS and is the only extant bitECS data point on this codebase. The spike memo is the input to that decision, not this memo.

**Verdict: keep for now.** `SystemManager` is adequate for ~50 systems and becomes painful at ~100+. The actual throughput bottleneck at scale is the per-entity Vector3 scatter *inside* `CombatantSystem`, not the service-locator pattern around it. If the E1 decision lands on "port combat to ECS", the ECS layer sits *inside* `CombatantSystem` and `SystemManager` stays.

### 2.3 `InfluenceMapSystem` (intentional)

64x64 grid sampled every 500ms, computes per-cell threat / opportunity / cover / squad-support scores via `InfluenceMapComputations`. There is no canonical "influence map library" — this kind of thing tends to be game-specific. The modularity here (computations split from grid, grid split from system) is already good.

**Verdict: keep.** If we extract a general engine, this becomes `@engine/influence-map` with the grid + computations exported and `CombatantSystem` / `SquadManager` as consumers. Low cost, high reuse value — most tactical combat games want a scored spatial buffer.

### 2.4 `CombatantLODManager` (intentional)

Per-NPC tier selection (near / mid / far / cull) for model fidelity and AI update rate. This is exactly the kind of coupling that *must* live next to the game data — Unity's LOD component and UE5's Nanite are not drop-in replacements for a Three.js stack.

**Verdict: keep.** The hypersprint bug flagged in `CLAUDE.md` ("root-caused in `CombatantLODManager` but shelved") is a render-side interpolation issue, not an architecture issue with the LOD pattern.

### 2.5 `PostProcessingManager` — ACES + quantize + Bayer (situational)

~200 lines of hand-rolled shader that implements retro pixelation + ACES tone mapping + color quantization + Bayer dither + sky-respectful exposure. Vincent Schwenk's [`postprocessing`](https://github.com/pmndrs/postprocessing) is the canonical Three.js post-process lib but targets a different aesthetic (realistic bloom + SSAO + DoF), and bundling it for just tone mapping is overkill.

The cycle-04-22 work on `atmosphere-fog-tinted-by-sky` and `post-tone-mapping-aces` shows the current shader is actively tuned against our look target, not a placeholder. Swapping to `postprocessing` would force us to port those tunings into their effect composer pipeline, adding ~80KB of gzip for one pass we already have.

**Verdict: keep.** Revisit only if we want bloom or SSAO; then the decision is "integrate `postprocessing` for the new effects and keep our shader for the quantize + dither" rather than a full swap.

### 2.6 Noise generators — hand-rolled Perlin (accidental)

`src/utils/NoiseGenerator.ts` is a 2D Perlin implementation (not simplex). `src/systems/terrain/NoiseHeightProvider.ts` wraps it; `src/workers/terrain.worker.ts` duplicates the core as `WorkerNoise`. `simplex-noise` is not in `package.json`; there is no third-party noise dep.

Simplex (via `jwagner/simplex-noise`) is 5-15% faster than Perlin, has fewer directional artifacts, and would let us delete both the main-thread `NoiseGenerator` and the worker's `WorkerNoise` duplicate. Against that: terrain-param-sandbox lands heightmap generation this cycle, and swapping noise mid-cycle is gratuitous risk. The prebaked-variant story (`MapSeedRegistry`) also means we don't regenerate noise at runtime on most maps.

**Verdict: situational.** `terrain-param-sandbox` should be the forcing function for this eval. If the sandbox exposes noise params and the tuning feels bad at the edges where Perlin artifacts show up, move to `simplex-noise`. Until then, don't bother.

### 2.7 `InputManager` + `PlayerInput` (intentional)

`InputManager` wraps `PlayerInput` (legacy) with context-aware action gating and last-active-mode tracking. Input libraries like `@rbxts/input` or browser-specific `keydown` stacks don't have a story for context gating + menu/modal/gameplay/map mode isolation, which is the whole point of the wrapping. `Gamepad` support, pointer-lock, and touch are all handled here.

**Verdict: keep.** `PlayerInput` is the thing that would benefit from a rewrite — `InputContextManager` already won the gating battle. The legacy surface is a refactor target, not a replacement target.

### 2.8 `SeededRandom` + `ReplayRecorder` + `ReplayPlayer` (intentional)

The E5 (deterministic sim) R&D spike produced usable primitives. `SeededRandom` is a xoshiro-class PRNG; the replay infrastructure already records input deltas and reapplies them against a seeded sim. `test:determinism` runs the three files as a regression guard.

**Verdict: keep.** If we extract an engine, this is a headline primitive. No third-party lib gives us "recordable replays for a browser WebGL game" off the shelf.

---

## 3. Fenced interfaces review

`src/types/SystemInterfaces.ts` currently fences ten interfaces: `IHUDSystem`, `IPlayerController`, `IHelicopterModel`, `IFirstPersonWeapon`, `ITerrainRuntime`, `ITerrainRuntimeController`, `IAudioManager`, `IAmmoManager`, `IFlashbangScreenEffect`, `IGameRenderer`. Two more (`ISkyRuntime`, `ICloudRuntime`) were added in the 2026-04-20 atmosphere cycle but are marked as "stub / not consumed yet".

### What is well-fenced

- `ITerrainRuntime` is the right grain. Terrain extraction is high on the reuse priority list, and the interface exposes the operations callers need (height, slope, normal, raycast, collision registration) without leaking CDLOD internals. This is the single cleanest fence in the codebase.
- `IAudioManager` is intentionally thin (`getListener`, `play`, one optional). That's the right shape for a subsystem we expect to swap implementations on (Howler vs native WebAudio vs no-op for headless).
- `IAmmoManager` and `IFlashbangScreenEffect` are small and stable.

### What is fenced but maybe too large

- `IHUDSystem` has 50+ methods, many of them vehicle-specific (`updateFixedWingFlightData`, `setHelicopterAircraftRole`, etc.). This is "the HUD has to support every game mode we have", not "we drifted." But it does mean any new vehicle type requires a fence change — which will keep happening. A cleaner long-term shape is `IHUDSystem` + `IHUDVehicleChannel` with the latter registered per-vehicle. Not urgent.
- `IPlayerController` has ~25 setters (setTerrainSystem, setHelicopterModel, setFirstPersonWeapon, etc.). This is the old pre-composer pattern bleeding through the fence. The runtime composers already supplanted half of these in the internal implementation — ideally the fence matches that refactor with a single `configureDependencies()` surface. That's a breaking fence change. Defer until the reuse extraction pass is live and forces the simplification.

### Leaky abstractions that should be fenced but aren't

- `GameEngineInit` + `GameEngineLoop` + `GameEngineInput` — these are `*` import of three sibling modules, not a fenced interface. For reuse, the engine startup flow needs a stable "boot sequence" contract.
- `SystemUpdater` tick graph — the budgets (5ms combat, 2ms terrain, etc.) are hardcoded in the file, not data-driven. A reusing game will want to set its own budgets.
- `FactionCombatTuning` — `FACTION_COMBAT_TUNING[faction]` is read directly. Multi-location reuse wants a `ICombatDoctrine` fence that games implement.

### Things fenced that should be free

None observed. The fence is tight. If anything, the surface area has grown because the HUD and PlayerController grew, not because we over-fenced.

**Verdict: fence is in good shape.** Revisit `IHUDSystem` and `IPlayerController` *only* when the reuse extraction forces a decision; do not pre-rearchitect.

---

## 4. What a multi-location / multi-game reuse would require

Grouping the extraction work by blast radius.

### 4.1 Trivial — already data-driven

These already live in config files. Dropping in a new location means editing files, not code.

- `MapSeedRegistry` (5 OF, 3 ZC, 3 TDM variants) — new map is a new registry entry + prebaked assets.
- `FactionCombatTuning` — per-faction doctrine params, additive.
- `AircraftConfigs` — per-airframe physical constants.
- `WeaponConfigs` (implicit) — rifle / shotgun / smg / pistol / lmg / launcher already split by slot.
- Game mode configs (`ZoneControlConfig.ts`, `TeamDeathmatchConfig.ts`, etc.) — per-mode constants.
- `AssetLoader` manifest — GLB + texture registry.

### 4.2 Tractable — close to standalone, minor coupling

These are subsystems that already have a clean internal shape but hold a few `Game*` references that need to become injectable.

- **Terrain.** `TerrainSystem` + `CDLODRenderer` + `HeightQueryCache`. Already exposed through `ITerrainRuntime`. The extraction work is: strip the `AssetLoader` dep (passed in at constructor), strip the `GlobalBillboardSystem` dep (make terrain publish billboard candidates rather than drive the system), and extract the worker pipeline (`terrain.worker.ts` + `NoiseHeightProvider`) as a subpackage. The `terrain-param-sandbox` task seeded this cycle is the groundwork. Estimated: 1-2 cycles to ship as `@engine/terrain` consumable in standalone.
- **Navmesh.** `NavmeshSystem` + `NavmeshMovementAdapter` + `scripts/prebake-navmesh.ts`. Already a clean wrap around `@recast-navigation`. Extraction is mostly decoupling from `CombatantSystem` (which it only queries, not drives). Estimated: 1 cycle.
- **Audio.** `AudioManager` + `FootstepAudioSystem`. `IAudioManager` is already fenced small. Extraction is pulling out the Vietnam-specific sound manifest. Estimated: 0.5 cycle.
- **Atmosphere / Sky.** `AtmosphereSystem` + Hosek-Wilkie sky model + `WeatherSystem`. Already abstracted behind `ISkyRuntime` / `ICloudRuntime`. Extraction is pulling off the game-specific fog density presets. Estimated: 1 cycle.
- **Input.** `InputContextManager` + `InputManager`. The context gating is the extractable primitive. Estimated: 0.5 cycle.
- **Determinism + replay.** `SeededRandom` + `ReplayRecorder` + `ReplayPlayer`. Already decoupled; just needs to stop living in `src/core/`. Estimated: 0.25 cycle.
- **Spatial grid + object pool.** `SpatialGridManager` + `ObjectPoolManager` + `HeightQueryCache`. Already singletons that work standalone. Estimated: 0.25 cycle (mostly packaging).

### 4.3 Painful — tightly bound to Terror-in-the-Jungle specifics

These assume the current game's structure or tuning targets.

- **Combat AI.** `CombatantAI` + `AIStateEngage` + `AIStateDefend` + `AIStatePatrol` + `SquadManager` have Vietnam-era tuning assumptions: platoon structures, weapon mix, LOS habits, cover preferences (jungle = dense cover, high rotation speed, short engagement distances). A Pacific or Korean location could reuse the state-machine frame but wants different tuning surfaces. D2 (faction doctrine via `FACTION_COMBAT_TUNING`) was the start of the answer. The reuse work is to extract the state-machine frame as `@engine/combat-ai` and let games ship their own doctrine files. The E3 memo questions whether hand-written state machines even scale; that decision informs this extraction.
- **Airframe configs.** `FixedWingConfigs` hardcodes US and NVA aircraft (Skyraider, AC-47 vs MiG variants). The simulation class is reusable; the config catalog is specific. Reuse: ship a base `AirframeConfig` schema and let games populate the catalog.
- **Strategy layer.** `WarSimulator` + `StrategicDirector` + `MaterializationPipeline` are the A-Shau-specific large-map layer. The materialization pipeline (strategic actors promoted to materialized combatants when the player approaches) is the reusable idea; the strategic-ticket tuning and faction composition are specific.
- **UI / HUD.** `HUDSystem` is huge and the tickets/zones/scoreboard/kill-feed/mortar-indicator suite is game-specific. Jungle-scoped iconography, US/ARVN/NVA/VC palette, Vietnam-era typography all assume the theatre. A generic extraction needs a shell (CSS + signals layer) separate from the content slots (factions, weapons, scoreboards).

### 4.4 Unknown — not surveyed in this memo

- **Rendering.** The `GameRenderer` class, shadow map configuration, graphics-quality tiers (low / medium / high / ultra), and `ModelDrawCallOptimizer` have grown organically. E2 (rendering paradigm at scale) is the open question; until that memo is updated, don't design a reuse shape.
- **Post-processing.** Same — currently a single `PostProcessingManager` class with hand-rolled shaders. An engine extraction wants a registered pass pipeline with the quantize + dither + tone map as configurable passes.
- **Mobile UI layer.** `TouchControls` + `MobilePauseOverlay` + the viewport responsive layer — not evaluated for cross-game reuse in this pass.
- **Effects.** `ExplosionEffectsPool`, `ImpactEffectsPool`, `TracerPool`, `SmokeCloudSystem`. Pooling pattern (`EffectPool<T>`) is clean; content inside is game-specific.

---

## 5. Recommended sequence

Cycle-sized tasks, ordered by value / blast radius. Each line is a future cycle's task slug candidate.

1. **`engine-doc-snapshot`** — write down, in one doc, the packaging boundaries we want (`@engine/terrain`, `@engine/navmesh`, `@engine/audio`, `@engine/determinism`, `@engine/spatial`, `@engine/input`, `@engine/combat-frame`). Not real npm packages yet; module boundaries inside the repo that a later split can follow.
2. **`terrain-package-extraction`** — move `TerrainSystem` + `CDLODRenderer` + `HeightQueryCache` + `terrain.worker.ts` + `NoiseHeightProvider` behind a boot-without-`GameEngine` entry point. The `terrain-param-sandbox` from this cycle is the driver. Ship a standalone demo that instantiates a terrain scene with no other engine systems.
3. **`determinism-package-extraction`** — extract `SeededRandom` / `ReplayRecorder` / `ReplayPlayer` from `src/core/` into `src/engine/determinism/`. Smallest-blast-radius item on the list; gets one subpackage shape documented.
4. **`combat-doctrine-library-pattern`** — formalize `FactionCombatTuning` into an `ICombatDoctrine` fence + doctrine-registry pattern. Games ship their own doctrines; the engine ships the combat-AI frame. This is the D2 pattern promoted to an interface.
5. **`audio-manifest-convention`** — define an audio-manifest schema that a location ships (sound names, sample paths, fallback chains). Standardize the loader side so adding "Korean War ambient" is a manifest drop.
6. **`asset-manifest-convention`** — same for GLBs + textures. `ASSET_MANIFEST.md` is the existing scaffold.
7. **`ecs-decision-ripple`** — once E1 decision lands (go / no-go on bitECS for combatants), the ripple hits `CombatantSystem` and how combat doctrine plugs in. Do not plan past this without the decision.
8. **`rendering-at-scale-ripple`** — same for E2 (GPU-driven rendering decision).
9. **`hud-shell-vs-content-split`** — design the `IHUDSystem` split into a shell (layout, typography, theme) and a content registry (per-mode panels). Fence-change PR; human review.
10. **`strategy-materialization-extraction`** — extract the materialization pipeline as a primitive. The A Shau Valley structure (strategic actors + materialization corridor) is unusual enough to be a reuse anchor for other large-map games.

---

## 6. What NOT to do

Tempting moves that would hurt more than help.

- **Do NOT adopt `@needle-tools/engine`.** Their npm runtime forks `three@0.145.4`. We are on `three@0.184.0`. Adopting Needle means downgrading 40 Three.js minor releases and losing every r15x-r18x improvement. Use the Needle DevTools Chrome extension if you want scene-graph inspection — the cycle README already covers this distinction.
- **Do NOT rewrite `Airframe` on Rapier.** The rewrite cost is high, the feel-tuning work gets thrown away, and the vision anchor ("stable frame-time tails under load") is already met by the current simulation. Only reconsider if multi-vehicle parity across ground + air + boat becomes a concrete blocker.
- **Do NOT adopt `bitecs` or `koota` wholesale.** The E1 memo is the only current datapoint; it ported projectiles, not combatants. The decision on whether combatants warrant ECS is live, not settled. Don't let "it looks cleaner in a spike" force a codebase-wide rewrite.
- **Do NOT adopt a React / Svelte / Vue UI layer.** DOM overlays + `@preact/signals-core` suffice for our HUD. A framework buys reactivity we already have and adds bundle cost we don't want. If mobile UI forces a decision later, re-evaluate; don't pre-empt it.
- **Do NOT extract an "engine" package before Phase E decisions are in.** Extracting terrain, audio, and determinism is cheap and low-risk. Extracting the combat frame is expensive and rewrites once E1 / E3 land. Sequence the cheap ones first.
- **Do NOT replace `three-mesh-bvh`.** The raycast acceleration it gives is genuinely not replicable in reasonable time. The only reason to revisit is if upstream Three.js lands native BVH support (they have been gesturing at it for years; nothing shipped).
- **Do NOT gate reuse on ESLint 10.** Tooling bumps and engine architecture are independent. Don't bundle them.

---

## 7. Immediate vs long-term

| Next 3 cycles | Next 6 months |
|---|---|
| Refresh `MEMORY.md` + `CLAUDE.md` to say `three@0.184`, not `r183` (trivial doc fix). | Ship `@engine/terrain` as a standalone-bootable module; use it to drive `terrain-param-sandbox` and at least one new-location prototype. |
| Extract `SeededRandom` + replay primitives into `src/engine/determinism/` (smallest subpackage; sets the pattern). | Ship `@engine/combat-frame` with an `ICombatDoctrine` fence; validate by writing a non-Vietnam doctrine file that slots in. |
| Promote `FactionCombatTuning` to an `ICombatDoctrine` fence in `SystemInterfaces.ts` (additive fence change; human-reviewed). | Decide E1 (ECS) and E2 (rendering at scale) with updated spike data against the 2026-04 engine baseline — today's spike memos are from 2026-04-16 and predate the Airframe + LOD work. |
| Land the `engine-doc-snapshot` doc — packaging boundaries drawn on paper. | Fold the audio + input subsystems into the extracted module set. |
| Use `terrain-param-sandbox` outputs to drive a `simplex-noise` swap eval; decide to swap or not based on the noise-artifact evidence, not theory. | Split `IHUDSystem` into shell + content registry (breaking fence change; planned, not rushed). |

---

## 8. Appendix — specific citations against current HEAD

Files inspected directly during this memo (paths relative to repo root):

- `package.json` — dep list, script list. 127 lines. Verdicts in §1 grounded here.
- `AGENTS.md`, `CLAUDE.md` — authoritative agent orientation.
- `docs/REARCHITECTURE.md` — E1-E6 open paradigm questions.
- `docs/INTERFACE_FENCE.md` — fence rules.
- `docs/ARCHITECTURE.md` — tick graph, coupling heatmap, singletons.
- `docs/TESTING.md` — four-layer test contract (for memo style context).
- `docs/cycles/cycle-2026-04-23-debug-and-test-modes/README.md` — this cycle's shape.
- `docs/rearch/E1-ecs-evaluation.md` — only currently available ECS spike memo.
- `src/types/SystemInterfaces.ts` — fenced interface surface (ten interfaces + two stubs).
- `src/core/GameEngine.ts` — engine shell.
- `src/core/SystemManager.ts` (first 100 lines) — service-locator pattern.
- `src/core/SystemInitializer.ts` (first 120 lines) — 41-system construction.
- `src/core/GameplayRuntimeComposer.ts` — setter-injection wiring.
- `src/systems/vehicle/airframe/Airframe.ts` (first 60 lines) — fixed-wing sim entry.
- `src/systems/combat/InfluenceMapSystem.ts` (first 40 lines) — hand-rolled influence map.
- `src/systems/effects/PostProcessingManager.ts` (first 60 lines) — retro post-process shader.
- `src/utils/NoiseGenerator.ts` (first 50 lines) — hand-rolled Perlin.
- `src/systems/input/InputManager.ts` (first 40 lines) — input wrapping.
- `src/ui/engine/UIComponent.ts` (first 40 lines) — `@preact/signals-core` consumer.

`npm outdated` snapshot at memo-write time is transcribed into §1. The repository's lockfile `package-lock.json` was not modified by this memo.

---

## 9. Summary — top-3 recommendations for the PR body

1. **Keep the stack.** `three@0.184`, `three-mesh-bvh`, `@recast-navigation/*`, and `@preact/signals-core` are all the right picks for 2026-04; nothing on the outdated list demands action this cycle. Refresh `MEMORY.md` / `CLAUDE.md` to match the pinned `three@0.184`.
2. **Sequence reuse extraction small-first.** Land `determinism-package-extraction` and `engine-doc-snapshot` before touching combat or rendering. Extract terrain as the first real subpackage, driven by the `terrain-param-sandbox` output this cycle creates. Defer `@engine/combat-frame` until E1 + E3 spike data is refreshed against the 2026-04 engine.
3. **Don't pre-empt Phase E.** Don't adopt `@needle-tools/engine`, don't rewrite `Airframe` on Rapier, don't swap to ECS codebase-wide, and don't bring in a UI framework. Each of those is a rewrite masquerading as progress; the actual progress is in the small extractions plus one disciplined pass through the fence once reuse forces a decision.

---

## Addendum 2026-05-13: Ground-vehicle physics extension

The "no external physics lib" stance held in §2.1 and §6 covers helicopter and fixed-wing — both hand-rolled. Ground vehicles, starting with the M151 jeep MVP queued at [docs/tasks/vekhikl-1-jeep-spike.md](../tasks/vekhikl-1-jeep-spike.md), extend the same stance. The MVP is a hand-rolled chassis + Ackermann yaw + terrain-normal conform on `ITerrainRuntime` height/normal/slope, mirroring the shape of `HelicopterPhysics.ts`. The architecture, force list, integration loop, and behavior-test plan are documented in [docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md). Tracked vehicles (tanks) are sibling, not derived; a parallel `docs/rearch/TANK_SYSTEMS_2026-05-13.md` covers that branch.

The stance is **deferred-revisit, not absolute.** When (i) multi-vehicle collision interactions, (ii) ragdoll for ejected occupants, (iii) watercraft buoyancy (VODA-3), or (iv) multi-axle articulated trucks reach committed-cycle scope, re-evaluate Rapier (`@dimforge/rapier3d-compat`, ~600 KB gzipped). The gate triggers on any one of those four, and produces a follow-up memo rather than an automatic adoption. Bundle cost is not the reason to defer; leverage is — a single chassis on terrain does not exercise a constraint solver, so paying for one before the gate is premature.
