# Strategy Domain

War simulation layer. Active only in A Shau Valley mode. Sits ABOVE CombatantSystem - CS knows nothing about WarSimulator. The bridge is MaterializationPipeline, which creates and destroys combatants in CombatantSystem based on player proximity.

---

## Blocks

| Block | File | Tick | Budget |
|-------|------|------|--------|
| WarSimulator | [strategy/WarSimulator.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/WarSimulator.ts) | WarSim | 2ms |
| StrategicFeedback | [strategy/StrategicFeedback.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/StrategicFeedback.ts) | WarSim | 2ms |

---

## Module Registry

| Module | File | Role |
|--------|------|------|
| WarSimulator | [strategy/WarSimulator.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/WarSimulator.ts) | Owns 3000 StrategicAgent records. Top-level war engine. |
| MaterializationPipeline | [strategy/MaterializationPipeline.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/MaterializationPipeline.ts) | STRATEGIC->SIMULATED->MATERIALIZED tier transitions. 800m mat / 900m demat / 100m hysteresis. Max 60 materialized. |
| AbstractCombatResolver | [strategy/AbstractCombatResolver.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/AbstractCombatResolver.ts) | Squad-vs-squad abstract combat for SIMULATED/STRATEGIC agents. Runs every 2s. |
| StrategicDirector | [strategy/StrategicDirector.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/StrategicDirector.ts) | Zone-objective assignment for all squads. Runs every 5s. |
| WarEventEmitter | [strategy/WarEventEmitter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/WarEventEmitter.ts) | Batched pub/sub. ONLY formal event bus in the codebase. subscribe() returns unsubscribe fn. emit() queues, flush() delivers batch. |
| PersistenceSystem | [strategy/PersistenceSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/PersistenceSystem.ts) | JSON save/load of WarState (~360KB). 3 localStorage slots (slot 0 = auto-save). Auto-save every 60s. |
| StrategicFeedback | [strategy/StrategicFeedback.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/StrategicFeedback.ts) | Subscribes to WarEventEmitter. Drives HUD messages + distant audio for war events. No per-frame work. |
| types | [strategy/types.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/types.ts) | AgentTier enum, StrategicAgent, StrategicSquad, WarEvent union, WarState. |

---

## Agent Tiers

| Tier | Memory | Distance | Behavior |
|------|--------|----------|----------|
| STRATEGIC | ~120 bytes | >3000m | Position + stats only. No per-frame position updates. |
| SIMULATED | ~120 bytes | <3000m | Lerp movement toward squad objective destination. No rendering. |
| MATERIALIZED | ~2KB | <800m | Full Combatant in CombatantSystem. AI, physics, rendering active. |

Hysteresis: materialize at 800m, dematerialize at 900m (100m gap prevents thrashing).

Throttling: max 4 materialized + 4 dematerialized per frame to spread cost.

Squad coherence: materialization is squad-granular. When any member qualifies, the whole squad is queued. Each member is spawned within an extended radius (matRadius + 100m) buffer.

---

## StrategicAgent Fields

Defined in [strategy/types.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/types.ts). Plain numbers, no Vector3, to avoid GC pressure.

| Field | Type | Notes |
|-------|------|-------|
| id | string | `ws_agent_N` |
| faction | Faction | US / NVA / ARVN / VC |
| x, y, z | number | World position. y terrain-aligned on each simulated movement tick. |
| health | number | 0-100 |
| alive | boolean | False = dead, counted by AbstractCombatResolver |
| tier | AgentTier | STRATEGIC / SIMULATED / MATERIALIZED |
| squadId | string | Parent squad |
| isLeader | boolean | First member of squad |
| destX, destZ | number | Movement destination set by StrategicDirector |
| speed | number | 3.5-5.0 m/s (randomized on spawn) |
| combatState | string | idle / moving / fighting / dead |
| combatantId | string? | Set when MATERIALIZED. Links to CombatantSystem entity. |

---

## StrategicSquad Fields

| Field | Type | Notes |
|-------|------|-------|
| id | string | `ws_squad_N` |
| faction | Faction | |
| members | string[] | Agent IDs |
| leaderId | string | |
| x, z | number | Centroid (updated each simulated movement tick) |
| objectiveZoneId | string? | Assigned by StrategicDirector |
| objectiveX, objectiveZ | number | Target position within assigned zone |
| stance | string | attack / defend / patrol / retreat / reinforce |
| strength | number | 0-1 ratio of alive members |
| combatActive | boolean | True if currently engaged with an enemy squad |
| lastCombatTime | number | Timestamp of last abstract combat tick |

---

## WarSimulator.update(dt) Flow

```
if ticketSystem phase == SETUP: return early

pipeline.update(playerX, playerY, playerZ, velX, velZ)
  Prediction: project player 200m ahead based on velocity
  First pass (all agents):
    if MATERIALIZED:
      poll combatantSystem.getCombatantLiveness(combatantId)
        not exists -> mark strategic agent dead, clear combatantId
        alive=false -> dematerialize, snapshot position/health
      if beyond 900m -> dematerialize (up to 4/frame)
    else:
      if within 800m (or 800m of predicted pos) -> queue squad for materialization
      update tier: SIMULATED if <3000m, STRATEGIC otherwise
  Second pass (queued squads, up to 4 materialize/frame):
    for each member in squad:
      if alive + not materialized + within matRadius+100m:
        combatantSystem.materializeAgent({faction, x, y, z, health, squadId})
        agent.tier = MATERIALIZED, agent.combatantId = returned ID

if gameActive: updateSimulatedMovement(dt)
  for each SIMULATED/STRATEGIC alive agent:
    move toward destX/destZ at agent.speed
    terrain-align y via getTerrainHeight(x, z)
    stop within 2m of destination
  recalculate squad centroids + strength ratios

if gameActive: resolver.update(elapsedTime)   // abstract combat, 2s interval
if gameActive: director.update(elapsedTime)   // objective reassignment, 5s interval

persistence.checkAutoSave(elapsedTime)        // every 60s

events.flush()  // deliver all queued WarEvents to subscribers
```

---

## AbstractCombatResolver

[strategy/AbstractCombatResolver.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/AbstractCombatResolver.ts)

Runs on `abstractCombatInterval` (2000ms). Only resolves combat for SIMULATED and STRATEGIC agents - MATERIALIZED agents are handled by CombatantSystem.

**Algorithm:**
1. Collect alive squads per faction.
2. Find opposing squad pairs within 200m centroid distance.
3. For each engaged pair: apply defense modifier (1.5x) if squad is at its own zone within 2x zone radius.
4. `killProb = BASE_KILL_PROBABILITY * min(attackerStrength / defenderStrength, 3.0)` where BASE = 0.05 per tick.
5. Roll per non-materialized alive member. On kill: `agent.alive = false`, ticketSystem.onCombatantDeath(), emit `agent_killed`.
6. Emit `squad_engaged` on first contact, `squad_wiped` when strength reaches 0.
7. Emit `major_battle` when >= 4 squads are engaged in a 500m cluster.

---

## StrategicDirector

[strategy/StrategicDirector.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/StrategicDirector.ts)

Runs on `directorUpdateInterval` (5000ms). Evaluates battlefield and assigns squad objectives.

**Zone scoring:** base = ticketBleedRate. Contested zones x2. Zones with nearby squads get +20% per squad within 2km.

**Doctrine split (strong squads, strength > 0.5):**

| Faction | Attack | Defend | Patrol |
|---------|--------|--------|--------|
| NVA | 20% | 50% | 30% |
| US | 50% | 25% | 25% |

**Weak squads (strength 0.1-0.5):** retreat to nearest friendly zone.

**Reinforcements:** when faction drops below 70% alive, respawn up to 30 dead agents at HQ positions. Cooldown: `reinforcementCooldown` seconds (90s in A Shau config). Emits `reinforcements_arriving`.

**Order propagation:** each agent gets `destX/destZ` = squad objective position + 30m random formation spread offset.

---

## WarEventEmitter

[strategy/WarEventEmitter.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/WarEventEmitter.ts)

The only formal event bus in the entire codebase.

```typescript
// Subscribe - returns unsubscribe fn
const unsub = warSimulator.events.subscribe((events: WarEvent[]) => { ... });

// Emit (queued, not delivered until flush)
warSimulator.events.emit({ type: 'zone_captured', ... });

// Flush - called at end of WarSimulator.update()
warSimulator.events.flush();  // delivers current batch to all subscribers
```

Listeners receive a full batch per flush, not individual events.

---

## War Event Types

Defined in [strategy/types.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/types.ts).

| Event type | Key fields | Emitter |
|------------|------------|---------|
| zone_captured | zoneId, zoneName, faction | ZoneManager (via resolver) |
| zone_contested | zoneId, zoneName | ZoneManager |
| zone_lost | zoneId, zoneName, faction | ZoneManager |
| squad_engaged | squadId, enemySquadId, x, z | AbstractCombatResolver |
| squad_wiped | squadId, faction | AbstractCombatResolver |
| reinforcements_arriving | faction, zoneId, zoneName, count | StrategicDirector |
| major_battle | x, z, intensity (0-1) | AbstractCombatResolver |
| faction_advantage | faction, ratio | (future use) |
| agent_killed | agentId, faction, x, z | AbstractCombatResolver |

---

## StrategicFeedback

[strategy/StrategicFeedback.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/StrategicFeedback.ts)

Subscribes to `warSimulator.events` via `setWarSimulator()`. No per-frame work in `update()`.

**HUD messages:** throttled per event key at 8s cooldown. Calls `hudSystem.showMessage(text, duration)`.

**Distant audio:** plays via `audioManager.playDistantCombat(volume)` (optional method, cast to `any`). Volume = `(1 - dist/5000) * 0.15 * intensity`. Throttled at 5s cooldown.

**Distance gating:**

| Event | Condition |
|-------|-----------|
| major_battle HUD | dist < 3000m from player |
| major_battle audio | dist < 5000m from player |
| squad_engaged audio | 200m < dist < 3000m from player |

Compass direction (8-point) computed from `atan2(dx, -dz)` for major_battle HUD messages.

---

## PersistenceSystem

[strategy/PersistenceSystem.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/PersistenceSystem.ts)

| Slot | Use |
|------|-----|
| 0 | Auto-save (every 60s) |
| 1-2 | Manual save slots |

Storage key: `titj-war-save-{slot}` in localStorage. ~360KB per save for 3000 agents. 3 slots = ~1.1MB, within 5MB localStorage limit.

On `loadWarState()`: all agents reset to STRATEGIC tier, `combatantId` cleared. Pipeline re-materializes as needed. `nextAgentId`/`nextSquadId` counters updated to avoid ID collisions.

Schema version checked on load. Mismatch = load rejected with warning.

---

## Wiring

**WarSimulator injects into (needs):**

| Dependency | Setter | Used by |
|------------|--------|---------|
| CombatantSystem | setCombatantSystem() | MaterializationPipeline |
| ZoneManager | setZoneManager() | AbstractCombatResolver, StrategicDirector, zone name cache |
| TicketSystem | setTicketSystem() | AbstractCombatResolver (death -> ticket deduction), phase gate |
| InfluenceMapSystem | setInfluenceMap() | (reserved, not yet used) |

**WarSimulator consumed by (fan-in):**

| Consumer | What it uses |
|----------|-------------|
| FullMap | getAgentPositionsForMap() -> Float32Array |
| GameModeManager | configure(), spawnStrategicForces(), disable() |
| Minimap | getAllAgents(), getAllSquads() |
| PlayerRespawn | getAllSquads() (pressure insertion logic) |
| StrategicFeedback | events.subscribe() |

**StrategicFeedback injects into (needs):**

| Dependency | Setter |
|------------|--------|
| WarSimulator | setWarSimulator() |
| HUDSystem | setHUDSystem() |
| AudioManager | setAudioManager() |

---

## A Shau Valley Config

[config/AShauValleyConfig.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/config/AShauValleyConfig.ts)

| Parameter | Value |
|-----------|-------|
| worldSize | 21136m (21km DEM) |
| totalAgents | 3000 |
| agentsPerFaction | 1500 |
| materializationRadius | 800m |
| dematerializationRadius | 900m |
| simulatedRadius | 3000m |
| abstractCombatInterval | 2000ms |
| directorUpdateInterval | 5000ms |
| maxMaterialized | 60 |
| squadSize | min 8, max 12 |
| reinforcementCooldown | 90s |
| maxTickets | 5000 |
| matchDuration | 3600s (session length, not hard limit) |

**Zones (18 total):**

| Zone | ID | Owner | Bleed |
|------|----|-------|-------|
| LZ Goodman | us_base | US (HQ) | 0 |
| LZ Stallion | us_hq_east | US (HQ) | 0 |
| LZ Eagle | us_hq_south | US (HQ) | 0 |
| Base Area 611 | opfor_hq_main | NVA (HQ) | 0 |
| Base Area 607 | opfor_hq_north | NVA (HQ) | 0 |
| NVA Supply Depot | opfor_hq_south | NVA (HQ) | 0 |
| Hill 937 (Hamburger Hill) | zone_hill937 | contested | 6 |
| Trail Junction | zone_trail_junction | NVA | 5 |
| Ta Bat Airfield | zone_tabat | NVA | 4 |
| A Luoi Airfield | zone_aluoi | contested | 4 |
| Firebase Ripcord | zone_ripcord | US | 4 |
| Firebase Blaze | zone_blaze | US | 3 |
| SF Camp A Shau | zone_sf_camp | NVA | 3 |
| Tiger Mountain | zone_tiger | NVA | 3 |
| Hill 996 | zone_hill996 | NVA | 3 |
| LZ Pepper | zone_pepper | US | 2 |
| Dong So Ridge | zone_dong_so | US | 2 |
| Firebase Cannon | zone_cannon | contested | 2 |

---

## Opt-In Architecture

WarSimulator is opt-in via `GameModeConfig.warSimulator`. When `warSimulator` is absent or `enabled: false`, `warSimulator.disable()` is called and it has zero per-frame cost (`if (!this.enabled) return` at top of `update()`).

Only A Shau Valley sets `warSimulator.enabled = true`. All other modes (Combat Arena, Open Frontier, etc.) skip the war sim entirely.

---

## Force Spawn Distribution

`spawnStrategicForces()` called once when war begins. Squads distributed:

| Bucket | Allocation |
|--------|------------|
| HQ reserve | 45% of squads |
| Controlled zone presence | remainder after HQ + frontline |
| Frontline seeding | 20% of squads (at contested/neutral zones sorted by bleed rate) |

Frontline seeding ensures early contact emerges near high-value objectives rather than all forces sitting at HQ at game start. Repeated calls to `spawnStrategicForces()` are safe - `resetStrategicForces()` clears state first.

---

## Queries (WarSimulator public API)

| Method | Returns | Notes |
|--------|---------|-------|
| getAllAgents() | Map<string, StrategicAgent> | Live reference, not a copy |
| getAllSquads() | Map<string, StrategicSquad> | Live reference |
| getAgentCount() | number | Total (alive + dead) |
| getAliveCount(faction?) | number | Optional faction filter |
| getMaterializedCount() | number | Agents currently in CombatantSystem |
| getAgentPositionsForMap() | Float32Array | Flat: [alliance, x, z, tierCode, ...]. No allocation overhead. |
| getWarState() | WarState | Full snapshot for persistence |
| loadWarState(state) | void | Restore from save |
| getElapsedTime() | number | Seconds since war started |
| isEnabled() | boolean | False = dormant |
| setPlayerPosition(x, y, z) | void | Called each frame to drive pipeline + velocity prediction |

---

## Tests

**Unit:** [strategy/WarSimulator.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/systems/strategy/WarSimulator.test.ts)
- Frontline seeding: both factions seed >= 20 agents near contested/neutral zones at game start.
- Priority: with one frontline squad per faction, agents spawn at highest-bleed zone only.
- No duplicate accumulation: repeated `spawnStrategicForces()` calls keep agent count stable.

**Integration:** [integration/scenarios/zone-capture.test.ts](https://github.com/matthew-kissinger/terror-in-the-jungle/blob/master/src/integration/scenarios/zone-capture.test.ts) - ticket bleed interacts with war sim state.

---

## Related Docs

- [combat.md](combat.md) - materialization target (CombatantSystem.materializeAgent / dematerializeAgent)
- [world.md](world.md) - zones and tickets gate war sim (ZoneManager, TicketSystem)
- [player.md](player.md) - respawn uses WarSimulator.getAllSquads() for pressure insertion
