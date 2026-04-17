# E5 — Non-determinism audit

Branch: `spike/E5-deterministic-sim`
Date: 2026-04-16
Status: Audit. Informs `E5-determinism-evaluation.md`.

## Headline counts (non-test `src/**/*.ts`)

| Source                | Files | Call sites |
|-----------------------|------:|-----------:|
| `Math.random()`       |    45 |        161 |
| `Date.now()`          |    44 |         90 |
| `performance.now()`   |    43 |        150 |

Plus iteration-order-sensitive containers (`Set`, `Map`) and the variable-dt
tick loop. Call counts are raw hit counts — some call sites are inside logic
paths, others are inside HUD/telemetry paths that do not need to be
deterministic.

Classification below uses three labels:

- **LOGIC** — observable from another tick or another frame. Must be made
  deterministic for replay to converge.
- **COSMETIC** — effect-only (sparks, muzzle flashes, smoke puffs, audio
  variation). Safe to leave non-deterministic; replay can ignore.
- **TELEMETRY** — performance counters, budget warnings, logger timestamps.
  Never affects sim state. Ignore.

## 1. `Math.random()` — 161 sites, 45 files

### 1.1 LOGIC (must be seeded)

These reads change simulation state that downstream ticks read from. A
divergence here will snowball within tens of ticks.

| File | Sites | Notes |
|------|------:|-------|
| `src/systems/combat/CombatantFactory.ts` (L22, L55, L56, L62, L160, L161) | 6 | Initial rotation, wanderAngle, timeToDirectionChange, OPFOR focus flag, skill-profile jitter. Injected at spawn, read forever after. |
| `src/systems/combat/CombatantBallistics.ts` (L65, L66, L100, L101) | 4 | Bullet spread jitter. Directly changes hit/miss outcomes. |
| `src/systems/combat/CombatantCombatEffects.ts` (L71, L135, L149) | 3 | `Math.random() < 0.3` gates damage propagation. L71/L135 are visual but L149 is a gameplay gate. |
| `src/systems/combat/ClusterManager.ts` (L162, L200, L241) | 3 | Targeting delay, scoring tiebreaker, density gate — all gameplay. |
| `src/systems/combat/CombatantLODManager.ts` (L808, L810) | 2 | Distant-sim positional jitter (LOD culled AI nudge). Changes where entities stand next frame. |
| `src/systems/combat/CombatantMovementStates.ts` (L109, L142) | 2 | Zone-eval interval jitter + strafe direction roll. Both read in subsequent ticks. |
| `src/systems/combat/CombatantSpawnManager.ts` (L109, L120, L363) | 3 | Faction roll + anchor pick at spawn. Output positions persist. |
| `src/systems/combat/SquadManager.ts` (L100, L101, L259, L317) | 4 | Formation offset, zone select, retreat distance. |
| `src/systems/combat/SpawnPositionCalculator.ts` (L82, L161, L162, L200, L201, L314, L328, L329) | 8 | Spawn radius/angle/count roll. Massive sensitivity: 8 rolls × every spawn. |
| `src/systems/combat/ai/AIStateEngage.ts` (L368, L383) | 2 | Suppression duration jitter + flank distance jitter. |
| `src/systems/combat/ai/AIStatePatrol.ts` (L157, L158) | 2 | Patrol target angle + distance. |
| `src/systems/combat/ai/AITargetAcquisition.ts` (L197) | 1 | `Math.random() < engageProbability` gate — direct gameplay branch. |
| `src/systems/combat/ai/FlankingTacticsResolver.ts` (L71, L72) | 2 | Left/right flank scoring tiebreaker. |
| `src/systems/strategy/StrategicDirector.ts` (L212, L240, L241, L349, L350) | 5 | Zone targeting, objective offset, squad jitter. |
| `src/systems/strategy/WarSimulator.ts` (L279, L285, L305, L316, L317, L333) | 6 | Faction picks, squad size, spawn spread, speed. |
| `src/systems/strategy/AbstractCombatResolver.ts` (L200) | 1 | `Math.random() < killProb` — literal kill decision in abstracted combat. |
| `src/systems/weapons/GunplayCore.ts` (L99, L100, L163, L164) | 4 | Bullet spread (player + NPC firing). |
| `src/systems/weapons/WeaponPickupSystem.ts` (L260, L266) | 2 | Drop-chance gate, weapon type pick. Gameplay. |
| `src/systems/weapons/GrenadePhysics.ts` (L122, L123, L124) | 3 | Grenade bounce impulse scatter. Affects where grenades land. |
| `src/systems/weapons/MortarRoundManager.ts` (L97, L98, L99) | 3 | Mortar impact scatter. |
| `src/systems/helicopter/HelicopterWeaponSystem.ts` (L326, L327) | 2 | Door-gun spread. Gameplay. |
| `src/systems/helicopter/HelicopterDoorGunner.ts` (L187, L188) | 2 | NPC door-gun spread. Gameplay. |
| `src/systems/airsupport/SpookyMission.ts` (L25, L70, L90, L92) | 4 | Orbit angle, burst interval, ground-scatter impact. |
| `src/systems/airsupport/AAEmplacement.ts` (L135, L283, L284, L285) | 4 | Scan stagger, AA spread. |
| `src/systems/airsupport/RocketRunMission.ts` (L72, L73) | 2 | Rocket aim jitter. |
| `src/systems/environment/WeatherLightning.ts` (L40, L62) | 2 | Storm lightning trigger + distance. Player-observable if weather hurts or gates anything (currently cosmetic, but flagged because it rolls every frame). |
| `src/systems/environment/WeatherSystem.ts` (L150–L284) | 8 | Particle spawn positions. **COSMETIC** — rain/snow rendering only. Skip. |
| `src/systems/world/ZoneTerrainAdapter.ts` (L39) | 1 | Distance scale on zone placement. Runs once at world init. |
| `src/core/ModeStartupPreparer.ts` (L223) | 1 | `'random'` seed fallback — the one existing seed-control knob. |
| `src/config/MapSeedRegistry.ts` (L?) | 1 | Picks a variant at mode start. |
| `src/utils/Math.ts` (L5, L43, L48) | 3 | `MathUtils.randomInRange`, poisson disk sampling. Callers determine LOGIC vs COSMETIC. |
| `src/systems/player/PlayerRespawnManager.ts` (L557, L559) | 2 | Respawn offset jitter. Player-observable. |
| `src/systems/player/weapon/WeaponAnimations.ts` (L121) | 1 | Recoil kick jitter. Arguably cosmetic, but it offsets the weapon camera, which feeds aim in some code paths. |

**Estimate: ~100–110 LOGIC call sites in ~35 files.**

### 1.2 COSMETIC (ignorable for replay)

Effects/pool systems that only draw to screen. Leave `Math.random()` in
place; make them sample from a parallel cosmetic RNG so they don't consume
the sim RNG stream.

| File | Sites | Notes |
|------|------:|-------|
| `src/systems/effects/ImpactEffectsPool.ts` | 9 | Dust/spark particles. |
| `src/systems/effects/ExplosionSpawnInitializer.ts` | 9 | Explosion particles. |
| `src/systems/effects/SmokeCloudSystem.ts` | 8 | Smoke puff positions. |
| `src/systems/effects/MuzzleFlashSystem.ts` | 5 | Muzzle flash. |
| `src/systems/combat/CombatantCombatEffects.ts` L71, L135 | 2 | Tracer end-points (visual). |
| `src/systems/weapons/ProgrammaticExplosivesFactory.ts` | 3 | Mesh vertex jitter at build time. Runs once. |
| `src/systems/audio/AudioWeaponSounds.ts` | 10 | Volume + pitch variation. |
| `src/systems/audio/FootstepSynthesis.ts` | 3 | White-noise buffer fill (init only). |
| `src/systems/audio/FootstepAudioSystem.ts` | 1 | Pitch variation. |
| `src/systems/audio/AudioManager.ts` | 1 | Random sound pick. |
| `src/systems/helicopter/HelicopterAudio.ts` | 1 | 2% frame log jitter. |
| `src/systems/environment/WeatherSystem.ts` | 8 | Particle positions. |

**Estimate: ~55 COSMETIC sites.**

### 1.3 TEST / DEBUG / DEV

- `src/systems/debug/PerformanceBenchmark.ts` (6) — debug tool.
- `src/test-utils/`, `src/**/*.test.ts` — tests set their own mocks.

Not part of production replay scope.

## 2. `Date.now()` — 90 sites, 44 files

`Date.now()` is the worst form of non-determinism for replay, because it
anchors gameplay timers to wall-clock. Two successive replays cannot agree on
"5 seconds since last hit" if the wall clock moved between them.

### 2.1 LOGIC (must be replaced with sim-time)

| File | Sites | Notes |
|------|------:|-------|
| `src/systems/combat/CombatantDamage.ts` (L83) | 1 | `target.lastHitTime = Date.now()` — read by cover-seeking, suppression, assist tracking. |
| `src/systems/combat/CombatantSystemDamage.ts` (L116) | 1 | Same pattern. |
| `src/systems/combat/CombatantSuppression.ts` (L102) | 1 | `combatant.lastSuppressedTime = Date.now()`. |
| `src/systems/combat/CombatantCombat.ts` (L157) | 1 | `Date.now() < combatant.flashDisorientedUntil` gate. |
| `src/systems/combat/CombatantAI.ts` (L334) | 1 | `(Date.now() - combatant.lastSuppressedTime) / 1000`. |
| `src/systems/combat/ClusterManager.ts` (L179) | 1 | Task retargeting interval gate. |
| `src/systems/combat/CombatantLODManager.ts` (L312) | 1 | LOD re-eval timer. |
| `src/systems/combat/CombatantMovementStates.ts` (L211) | 1 | `Math.sin(Date.now() * STRAFE_FREQUENCY)` — strafe phase uses wall-clock as phase source. |
| `src/systems/combat/CombatantSpawnManager.ts` (L302) | 1 | Spawn timer. |
| `src/systems/combat/InfluenceMapSystem.ts` (L77) | 1 | Influence decay timestamp. |
| `src/systems/combat/ai/AIFlankingSystem.ts` (L101, L173, L180, L184, L200, L300, L321) | 7 | Flank cooldown + operation timeout timers. |
| `src/systems/combat/ai/AIStateEngage.ts` (L139, L159, L191, L251, L323, L351) | 6 | Cover seek time, suppression cooldown, flash-disoriented gate. |
| `src/systems/combat/ai/AIStatePatrol.ts` (L204, L216) | 2 | Defense-reassign timer. |
| `src/systems/combat/ai/AITargetAcquisition.ts` (L178) | 1 | Time-since-hit gate. |
| `src/systems/combat/ai/AICoverEvaluation.ts` (L22) | 1 | Cover eval freshness. |
| `src/systems/combat/ai/AICoverFinding.ts` (L67, L72) | 2 | Cover-seek recency gates. |
| `src/systems/combat/ai/AICoverSystem.ts` (L276, L297) | 2 | Cover cache TTL. |
| `src/systems/combat/ai/FlankingRoleManager.ts` (L76) | 1 | Suppression-end anchor. |
| `src/systems/combat/RespawnManager.ts` (L73, L99, L108) | 3 | Respawn timers. |
| `src/systems/weapons/WeaponPickupSystem.ts` (L124, L242) | 2 | Pickup despawn timers. |
| `src/systems/weapons/GrenadeSystem.ts` (L178) | 1 | Aim-start anchor. |
| `src/systems/weapons/GrenadeEffects.ts` (L229, L252) | 2 | Disorient timing. |
| `src/systems/helicopter/HelicopterInteraction.ts` (L63, L116, L177) | 3 | Post-exit lockout cooldown. |
| `src/systems/helicopter/SquadDeployFromHelicopter.ts` (L47, L87, L119) | 3 | Deploy cooldown — already threaded as a `now: number = Date.now()` default. Easy fix. |
| `src/systems/vehicle/FixedWingInteraction.ts` (L75, L117, L152) | 3 | Post-exit lockout cooldown. |
| `src/systems/player/PlayerHealthSystem.ts` (L116, L158) | 2 | Regen delay. Already has a seam because tests `vi.setSystemTime()` against it. |
| `src/systems/player/PlayerHealthEffects.ts` (L106, L128, L138) | 3 | Damage indicator age. |
| `src/systems/player/PlayerStatsTracker.ts` (L44, L129) | 2 | Match duration. |
| `src/systems/player/PlayerSuppressionSystem.ts` (L54, L109, L271) | 3 | Suppression timers. |
| `src/systems/strategy/WarSimulator.ts` (L672) | 1 | Event log timestamp. (Could be argued TELEMETRY, but events drive UI logic.) |
| `src/systems/navigation/NavmeshCache.ts` (L110) | 1 | Cache entry timestamp — only used for eviction policy, not gameplay. **Borderline TELEMETRY**. |
| `src/systems/world/runtime/GameModeRuntime.ts` (L128) | 1 | Mode transition timer. |
| `src/core/bootstrap.ts` (L11, L87, L247) | 3 | Session epoch. **TELEMETRY** (reported to perf tooling). |
| `src/core/GameEngineLoop.ts` (L142) | 1 | Crash-window throttle. **TELEMETRY-adjacent**; doesn't affect sim but affects error overlay. |

**Estimate: ~60 LOGIC sites. Nearly all of them are timer comparisons of the
form `(Date.now() - someStartTime) / 1000` — systematically convertible to
`(simTimeMs - someStartTime) / 1000` once a sim-time clock exists.**

### 2.2 UI / TELEMETRY (ignorable)

`src/ui/hud/KillFeed.ts`, `src/ui/hud/StatsPanel.ts`, `src/ui/loading/LoadingProgress.ts`,
`src/ui/controls/VirtualJoystick.ts`, `src/ui/controls/TouchLook.ts`, `src/ui/controls/TouchActionButtons.ts`,
`src/ui/controls/TouchHelicopterCyclic.ts`, `src/ui/map/OpenFrontierRespawnMapRenderer.ts`,
`src/systems/strategy/PersistenceSystem.ts` (save-game stamp).

Leave alone.

## 3. `performance.now()` — 150 sites, 43 files

### 3.1 LOGIC (must be replaced with sim-time)

`performance.now()` is largely used for telemetry (budget timers, EMA
samples, per-system-update profiling). But a non-trivial slice is gameplay:

| File | Sites | Notes |
|------|------:|-------|
| `src/systems/combat/CombatantCombat.ts` (L140) | 1 | `combatant.lastShotTime = performance.now()` — gates next shot. |
| `src/systems/combat/CombatantDamage.ts` | 1 | `deathStartTime = performance.now()` — used for ragdoll/despawn timing. |
| `src/systems/combat/CombatantSystemDamage.ts` (L87) | 1 | Same. |
| `src/systems/combat/ai/AILineOfSight.ts` (L61, L140) | 2 | LOS cache TTL. |
| `src/systems/combat/CombatantMovement.ts` (L195, L931) | 2 | Path re-eval timer. |
| `src/systems/combat/CombatantMovementStates.ts` (L103) | 1 | State-change throttle. |
| `src/systems/combat/CombatantShaders.ts` (L107) | 1 | `performance.now() * 0.001` as shader time uniform. Cosmetic but flagged because some anim curves drive hit-box transforms. |
| `src/systems/combat/LOSAccelerator.ts` (L146) | 1 | LOS chunk cache freshness. |
| `src/systems/combat/KillAssistTracker.ts` (L13, L23) | 2 | Assist window timers. |
| `src/systems/combat/RallyPointSystem.ts` (L51, L132, L188, L205) | 4 | `performance.now() / 1000` as currentTime — rally point decay. |
| `src/systems/combat/CombatantLODManager.ts` L541, L562, L587 | ~3 (of 42) | Majority are TELEMETRY. These three set `lastUpdateTime` on combatants, which is read to throttle updates — LOGIC. |
| `src/systems/weapons/AmmoManager.ts` (L72, L89, L165) | 3 | Reload timer, resupply window. |
| `src/systems/weapons/AmmoSupplySystem.ts` (L138, L214) | 2 | Resupply window. |
| `src/systems/weapons/GunplayCore.ts` (L56, L60) | 2 | Fire rate gate. |
| `src/systems/player/weapon/ShotCommand.ts` (L98, L129) | 2 | Shot command timestamps. |
| `src/systems/player/PlayerController.ts` (L545) | 1 | Likely sprint / stamina timer. |
| `src/systems/vehicle/FixedWingModel.ts` (L651) | 1 | Animation time. |
| `src/systems/effects/TracerPool.ts` (L97, L102) | 2 | `aliveUntil = performance.now() + lifetimeMs`. Cosmetic. |

**Estimate: ~30 LOGIC sites. Convertible identically to the `Date.now()`
LOGIC set — replace with sim-time.**

### 3.2 TELEMETRY (ignorable)

~120 of the 150 sites. Performance budget timers, frame counters, telemetry
EMAs, debug overlays, logger timestamps. Never affects sim.

Key files dominated by telemetry: `CombatantLODManager.ts` (42 sites, ~39
telemetry), `CombatantSystem.ts` (11), `SpatialGridManager.ts` (10),
`PerformanceBenchmark.ts` (10), `SystemUpdater.ts` (3), `GameRenderer.ts` (4).

## 4. Variable-dt tick loop

**Location:** `src/core/GameEngineLoop.ts:65-66`

```ts
engine.clock.update(timestamp);
const deltaTime = Math.min(engine.clock.getDelta(), 0.1);
```

`engine.clock` is `new THREE.Timer()` (constructed in `GameEngine.ts:46`).
`Timer.update(timestamp)` seeds from the `requestAnimationFrame` timestamp,
so `deltaTime` is wall-clock-derived. Subsequent system updates run on that
delta.

**FixedStepRunner exists but is scoped.** Three consumers only:
`PlayerMovement.ts:63`, `HelicopterPhysics.ts:58`, `FixedWingPhysics.ts:110`.
Everything else — combat, AI, weapons, strategy, air support, world state
— integrates on the outer variable `deltaTime`.

**Implication:** even if every RNG were seeded, the same input log replayed
on a machine at 120 Hz vs 60 Hz would accumulate different timer budgets,
take different numbers of sub-steps in scheduler groups (`tactical_ui`,
`war_sim`, etc. — `SimulationScheduler.ts`), and diverge.

For replay, the outer loop needs to be driven by tick index during playback,
not by rAF timestamps.

## 5. Iteration-order risks

`Map` / `Set` in JS preserve insertion order, so iteration is deterministic
**if and only if** insertions happen in a deterministic order. That is
usually true today but is a foot-gun:

| File | Risk |
|------|------|
| `src/systems/combat/ai/AIFlankingSystem.ts` L265, L340 | Iterates `this.activeOperations.values()` / `.entries()`. Operations are inserted as squads enter flank mode — which itself depends on sim state. Order is stable across a single run, but any code path that swaps an operation's slot could reorder. |
| `src/systems/combat/ai/AICoverSystem.ts` L175, L367 | `this.coverOccupation.entries()`. Cover keys are strings like `"x,z"` — order depends on reserve/release sequencing. |
| `src/systems/combat/CombatantSpawnManager.ts` L560 | `this.combatants.values()`. IDs are sequential (`combatant_${n}`) from `CombatantFactory.nextCombatantId`, so insertion order equals creation order. Safe unless we ever parallelize spawn. |
| `src/systems/combat/RespawnManager.ts` L247 | Same map, same guarantee. |
| `src/systems/combat/LOSAccelerator.ts` L129 | Chunk cache — keyed on world chunk coords. Cleanup loop reads `entries()`. Deterministic as long as chunks are inserted in the same sequence. |

No tests exercise "iteration order is fixed across deterministic replays" as
a property. Adding one concurrent operation (e.g. a Web Worker posting back
results in non-deterministic order and writing into one of these maps) would
break iteration order without any obvious failure signal until replay.

## 6. Async resolution order

Sources identified:

- `src/workers/terrain.worker.ts` — terrain chunks compiled off-thread. Results
  merge into the main-thread `TerrainWorkerPool`. Order is **not** guaranteed
  deterministic. Today this only affects when a chunk becomes visible; it
  does not currently write into gameplay state directly. Future replay-
  relevant code must be kept out of the worker response path, or the worker
  path must be sequenced.
- `src/core/bootstrap.ts` — async startup ordering is already `Promise.all`-
  based and sequenced by the `StartupFlowController`. Looks safe.
- Dynamic `import()` of mode configs in `ModeStartupPreparer.ts`. One-shot
  at game start; does not affect mid-session replay.

## 7. Float precision risks (single-machine scope)

**Vision anchor: cross-machine determinism is out of scope.** But
single-machine, same-build, same-input replay still needs to be wary of:

- **Operation-order-dependent accumulation.** `suppressionLevel += 0.1`
  repeated under a variable-dt loop. Fixed-step + seeded RNG resolves this
  because the sequence becomes identical.
- **Three.js internal temps** (`Vector3.applyQuaternion`, `Matrix4.decompose`).
  These are deterministic on a given V8 build but a minefield across
  browser versions. We accept that cost; replay scope is "same build, same
  user agent."
- **`Math.sin(Date.now() * FREQ)`** at `CombatantMovementStates.ts:211`.
  Strafe phase currently reads from wall clock — even if the rest of the
  sim is fixed, this term alone would diverge. Must be converted to
  `Math.sin(simTimeMs * FREQ)`.

## 8. Bonus: ID generation

`CombatantFactory.nextCombatantId` is a plain counter, reset per factory
instance. **Deterministic.** Squad IDs in production paths are also
counters. Tests use `squad-${Math.random()}` as a fixture convenience; that
is test-local and not replay-relevant.

No `crypto.randomUUID()` in sim code. Good.

## 9. Summary table

| Category                       | LOGIC sites | Telemetry / Cosmetic |
|--------------------------------|------------:|---------------------:|
| `Math.random()`                |     ~100-110 |                  ~55 |
| `Date.now()`                   |         ~60 |                  ~30 |
| `performance.now()`            |         ~30 |                 ~120 |
| Variable-dt loop               |           1 |                    - |
| Map/Set iteration (hot paths)  |           5 | iteration-risky but today deterministic |
| Async worker ordering          |           1 | terrain compile only |

**~200 LOGIC call sites across ~50 files.** Not 200 independent code paths
— the `Date.now()` and `performance.now()` LOGIC sites are the same pattern
(`(now() - startTime) / 1000`) and fix with a single injected sim-time
provider. The `Math.random()` sites are more varied but still convergent
under one seeded-RNG abstraction.

See `E5-determinism-evaluation.md` for the cost/value framing and
recommendation.
