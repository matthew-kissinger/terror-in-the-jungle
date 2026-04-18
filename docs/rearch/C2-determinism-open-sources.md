# C2 — Determinism: remaining open non-determinism sources

Last updated: 2026-04-18
Depends on: `docs/rearch/E5-deterministic-sim.md`, `docs/rearch/E5-nondeterminism-audit.md`.

C2 landed the seam (`SeededRandom` ambient session + `ReplayRecorder` +
`ReplayPlayer`) and replaced the top-20 `Math.random()` LOGIC call sites
across the highest-leverage combat paths. A 30-second scripted replay now
converges within the default tolerance (position < 0.1 m, attitude < 1 deg,
health < 1 HP) on the same machine.

This file tracks what is still non-deterministic and prioritizes the next
pass. Everything below is from the E5 audit; restating with a
"hit-next-round" lens.

## Tolerance and scope

- Single machine, same build, same user agent only. Cross-machine
  determinism is an explicit non-goal.
- All epsilons in `DEFAULT_REPLAY_TOLERANCE` (`src/core/ReplayPlayer.ts`).
  Tune per scenario — e.g. long aircraft flights will need a larger
  position epsilon than a 30-second ground-combat test.

## What landed in C2

Top-20 `Math.random()` LOGIC sites routed through `SeededRandom.random()`:

| File | Sites |
|------|------:|
| `src/systems/combat/CombatantFactory.ts` | 6 |
| `src/systems/combat/CombatantBallistics.ts` | 4 |
| `src/systems/combat/SpawnPositionCalculator.ts` | 8 |
| `src/systems/combat/ai/AITargetAcquisition.ts` | 1 |
| `src/systems/combat/ai/AIStateEngage.ts` | 1 |

`SeededRandom.random()` falls back to `Math.random()` when no replay
session is active, so production behavior is unchanged off the replay path.

## Remaining `Math.random()` LOGIC sites (~80–90)

Listed in descending priority. See `E5-nondeterminism-audit.md` §1.1 for the
full catalogue.

### Combat AI (next batch)

- `src/systems/combat/ClusterManager.ts` — 3 sites (targeting delay,
  scoring tiebreaker, density gate).
- `src/systems/combat/CombatantLODManager.ts` — 2 sites (distant-sim
  positional jitter).
- `src/systems/combat/CombatantMovementStates.ts` — 2 sites (zone-eval
  interval jitter, strafe roll).
- `src/systems/combat/CombatantSpawnManager.ts` — 3 sites.
- `src/systems/combat/SquadManager.ts` — 4 sites (formation offset, zone
  select, retreat distance).
- `src/systems/combat/CombatantCombatEffects.ts` L149 — 1 gameplay gate
  (the other two on L71/L135 are cosmetic).
- `src/systems/combat/ai/AIStateEngage.ts` L383 — 1 remaining flank
  distance jitter (L368 done).
- `src/systems/combat/ai/AIStatePatrol.ts` — 2 sites.
- `src/systems/combat/ai/FlankingTacticsResolver.ts` — 2 sites.

### Strategy and weapons

- `src/systems/strategy/StrategicDirector.ts` — 5 sites.
- `src/systems/strategy/WarSimulator.ts` — 6 sites.
- `src/systems/strategy/AbstractCombatResolver.ts` L200 — 1 kill-decision
  gate.
- `src/systems/weapons/GunplayCore.ts` — 4 sites (player + NPC spread).
  Deferred from C2 because `Math.random()` is nested inside `computeShotRay`
  and `computePelletRays`; clean port wants an injected RNG param to avoid
  mixing `Math.random` and seeded calls in the same function body.
- `src/systems/weapons/WeaponPickupSystem.ts` — 2 sites.
- `src/systems/weapons/GrenadePhysics.ts` — 3 sites.
- `src/systems/weapons/MortarRoundManager.ts` — 3 sites.

### Helicopter / air support

- `src/systems/helicopter/HelicopterWeaponSystem.ts` — 2 sites.
- `src/systems/helicopter/HelicopterDoorGunner.ts` — 2 sites.
- `src/systems/airsupport/SpookyMission.ts` — 4 sites.
- `src/systems/airsupport/AAEmplacement.ts` — 4 sites.
- `src/systems/airsupport/RocketRunMission.ts` — 2 sites.

### Player and utils

- `src/systems/player/PlayerRespawnManager.ts` — 2 sites.
- `src/systems/player/weapon/WeaponAnimations.ts` — 1 site.
- `src/utils/Math.ts` — 3 sites; replace at call-site level (some are
  cosmetic, some LOGIC).

## `Date.now()` LOGIC sites (~60)

Unaddressed in C2. Requires a `SimClock` seam; the brief scope ruled this
out. Highest-value clusters from the E5 audit:

- Combat AI state cooldowns: `AIFlankingSystem.ts` (7 sites),
  `AIStateEngage.ts` (6 sites), `AIStatePatrol.ts`,
  `AITargetAcquisition.ts`, cover seek/eval/find.
- Combatant timers: `CombatantDamage.ts`, `CombatantSuppression.ts`,
  `CombatantSystemDamage.ts`, `CombatantCombat.ts` (flash-disoriented gate),
  `CombatantAI.ts` (suppressed-time delta).
- Respawn and cooldown timers across combat / weapons / helicopter /
  fixed-wing interaction systems.
- **`CombatantMovementStates.ts:211`** uses `Math.sin(Date.now() * FREQ)` as
  a strafe phase — this one alone can cause divergence even with seeded
  RNG.

Systematic fix: introduce `SimClock.nowMs()` and replace these in a single
mechanical pass (per the E5 memo estimate: 1-2 days).

## `performance.now()` LOGIC sites (~30)

Same pattern as `Date.now()` above — fold into the `SimClock` seam. Key
files: `CombatantCombat.ts` (shot timer), `AmmoManager.ts`, `GunplayCore.ts`
(fire rate gate), `CombatantLODManager.ts` update throttle, LOS/cover TTL
caches.

## Variable-dt outer loop

`src/core/GameEngineLoop.ts:65-66` reads from `THREE.Timer` which is
wall-clock-anchored. Even with seeded RNG, a replay run at 120 Hz vs 60 Hz
will diverge. For the 30-second convergence test this is addressed by
having the harness drive fixed-tick input directly; for in-engine replay a
replay-mode flag on the engine loop to switch `deltaTime` to `1/tickRateHz`
is the fix.

## Iteration-order risks

Still unenforced. The E5 audit lists `AIFlankingSystem.ts`,
`AICoverSystem.ts`, `CombatantSpawnManager.ts`, `RespawnManager.ts`,
`LOSAccelerator.ts` as hotspots where insertion-order iteration is
deterministic today but will silently break if any write path becomes
concurrent. A property test per container ("same-seed replay iterates in
the same order") is cheap insurance (~30 lines).

## Async worker ordering

`src/workers/terrain.worker.ts` — terrain chunks compile off-thread with no
deterministic order guarantee. Today they don't write into sim state; keep
them out of the sim-state write path and this stays safe.

## Cosmetic / telemetry — intentionally untouched

Per E5 audit §1.2 and §3.2: effects pools (~55 sites), weather particles
(~8), audio (~15), HUD timestamps, perf counters (~120). Routing these
through a seeded RNG is work without gameplay payoff and spends the
deterministic RNG stream faster. Leave them on `Math.random()` /
`performance.now()` or — if a future pass wants decorative determinism —
give them a parallel `CosmeticRandom` stream so they don't desynchronize
the gameplay RNG.

## Recommended next pass

1. **`SimClock` seam.** Mirror what `SeededRandom` did for RNG — ambient
   session + static `now()` drop-in. Enables the ~60 `Date.now()` LOGIC
   sites and the ~30 `performance.now()` LOGIC sites to migrate as a
   mechanical grep-and-replace.
2. **Fixed-step replay mode.** Add an opt-in flag to `GameEngineLoop` that
   drives `deltaTime` from tick index during replay, leaves the normal
   variable-dt path alone.
3. **Next top-20 RNG sites.** Combat AI movement states, strategy pickers,
   and weapons spread. All one-liner replacements like C2.
4. **Property test: iteration order.** One test per hot map/set in the list
   above.
5. **Harness wire-up.** `npm run test:determinism` currently covers the
   scripted 30-s session. Extend to the three perf scenarios
   (`combat120`, `openfrontier:short`, `ashau:short`) once the `SimClock`
   seam is in.

Exit criterion for declaring "deterministic sim" done: all three perf
scenarios produce byte-identical checksum traces over N tick counts. Until
then, keep `npm run test:determinism` advisory on CI.
