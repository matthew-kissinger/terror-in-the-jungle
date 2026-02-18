import { Faction } from '../combat/types';
import { WarSimulatorConfig } from '../../config/gameModeTypes';
import { AgentTier, StrategicAgent, StrategicSquad } from './types';
import { WarEventEmitter } from './WarEventEmitter';
import type { TicketSystem } from '../world/TicketSystem';
import type { ZoneManager, CaptureZone } from '../world/ZoneManager';

/**
 * Abstract Combat Resolver.
 *
 * Runs every abstractCombatInterval (2s). Resolves combat between
 * non-materialized squads using probability-based outcomes.
 *
 * Only resolves combat for SIMULATED and STRATEGIC tier agents.
 * MATERIALIZED agents are handled by the full CombatantSystem.
 *
 * Algorithm:
 * 1. Find opposing squads within engagement range (200m centroid distance)
 * 2. For each engaged pair: casualty probability based on strength ratio
 * 3. Apply terrain/defense modifiers
 * 4. Randomly select casualties, update health/alive
 * 5. Feed deaths into TicketSystem
 * 6. Emit war events for feedback
 */
export class AbstractCombatResolver {
  private agents: Map<string, StrategicAgent>;
  private squads: Map<string, StrategicSquad>;
  private config: WarSimulatorConfig;
  private events: WarEventEmitter;
  private ticketSystem?: TicketSystem;
  private zoneManager?: ZoneManager;

  private lastUpdateTime = 0;

  // Combat parameters
  private readonly ENGAGEMENT_RANGE_SQ = 200 * 200;  // 200m
  private readonly BASE_KILL_PROBABILITY = 0.05;      // 5% per 2s tick per engagement
  private readonly DEFENSE_MULTIPLIER = 1.5;          // Defending at owned zone bonus
  private readonly MAJOR_BATTLE_THRESHOLD = 4;         // Squads involved for "major battle" event

  constructor(
    agents: Map<string, StrategicAgent>,
    squads: Map<string, StrategicSquad>,
    config: WarSimulatorConfig,
    events: WarEventEmitter,
    ticketSystem?: TicketSystem,
    zoneManager?: ZoneManager
  ) {
    this.agents = agents;
    this.squads = squads;
    this.config = config;
    this.events = events;
    this.ticketSystem = ticketSystem;
    this.zoneManager = zoneManager;
  }

  update(elapsedTime: number): void {
    const interval = this.config.abstractCombatInterval / 1000;
    if (elapsedTime - this.lastUpdateTime < interval) return;
    this.lastUpdateTime = elapsedTime;

    // Build list of alive squads by faction
    const usSquads: StrategicSquad[] = [];
    const opforSquads: StrategicSquad[] = [];

    for (const squad of this.squads.values()) {
      if (squad.strength <= 0) continue;
      if (squad.faction === Faction.US) usSquads.push(squad);
      else opforSquads.push(squad);
    }

    // Find engagements
    const engagements: Array<[StrategicSquad, StrategicSquad]> = [];
    const engagedSquads = new Set<string>();

    for (const usSquad of usSquads) {
      for (const opforSquad of opforSquads) {
        const dx = usSquad.x - opforSquad.x;
        const dz = usSquad.z - opforSquad.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < this.ENGAGEMENT_RANGE_SQ) {
          engagements.push([usSquad, opforSquad]);
          engagedSquads.add(usSquad.id);
          engagedSquads.add(opforSquad.id);
        }
      }
    }

    // Reset combat flags
    for (const squad of this.squads.values()) {
      squad.combatActive = engagedSquads.has(squad.id);
    }

    if (engagements.length === 0) return;

    // Track major battles (clusters of engagements)
    const battleClusters = new Map<string, { x: number; z: number; count: number }>();

    // Resolve each engagement
    for (const [usSquad, opforSquad] of engagements) {
      // Emit squad engaged event (throttled - only on first contact)
      if (!usSquad.combatActive || !opforSquad.combatActive) {
        this.events.emit({
          type: 'squad_engaged',
          squadId: usSquad.id,
          enemySquadId: opforSquad.id,
          x: (usSquad.x + opforSquad.x) / 2,
          z: (usSquad.z + opforSquad.z) / 2,
          timestamp: elapsedTime
        });
      }

      usSquad.lastCombatTime = elapsedTime;
      opforSquad.lastCombatTime = elapsedTime;

      // Get defense modifiers
      const usDefending = this.isDefendingOwnZone(usSquad);
      const opforDefending = this.isDefendingOwnZone(opforSquad);

      const usEffectiveStrength = usSquad.strength * (usDefending ? this.DEFENSE_MULTIPLIER : 1.0);
      const opforEffectiveStrength = opforSquad.strength * (opforDefending ? this.DEFENSE_MULTIPLIER : 1.0);

      // Resolve casualties for each side
      this.resolveCasualties(opforSquad, usEffectiveStrength, elapsedTime);
      this.resolveCasualties(usSquad, opforEffectiveStrength, elapsedTime);

      // Track battle cluster
      const cx = Math.floor((usSquad.x + opforSquad.x) / 2 / 500) * 500;
      const cz = Math.floor((usSquad.z + opforSquad.z) / 2 / 500) * 500;
      const key = `${cx}_${cz}`;
      const cluster = battleClusters.get(key) || { x: cx, z: cz, count: 0 };
      cluster.count += 2;
      battleClusters.set(key, cluster);
    }

    // Emit major battle events
    for (const cluster of battleClusters.values()) {
      if (cluster.count >= this.MAJOR_BATTLE_THRESHOLD) {
        this.events.emit({
          type: 'major_battle',
          x: cluster.x,
          z: cluster.z,
          intensity: Math.min(1.0, cluster.count / 10),
          timestamp: elapsedTime
        });
      }
    }

    // Check for wiped squads
    for (const squad of this.squads.values()) {
      if (squad.strength <= 0 && squad.combatActive) {
        this.events.emit({
          type: 'squad_wiped',
          squadId: squad.id,
          faction: squad.faction,
          timestamp: elapsedTime
        });
        squad.combatActive = false;
      }
    }
  }

  private resolveCasualties(
    targetSquad: StrategicSquad,
    attackerStrength: number,
    elapsedTime: number
  ): void {
    // Kill probability scales with attacker strength relative to target
    const ratio = targetSquad.strength > 0 ? attackerStrength / targetSquad.strength : 2.0;
    const killProb = this.BASE_KILL_PROBABILITY * Math.min(ratio, 3.0);

    // Roll for each alive non-materialized member
    for (const memberId of targetSquad.members) {
      const agent = this.agents.get(memberId);
      if (!agent || !agent.alive) continue;

      // Don't kill materialized agents - CombatantSystem handles their combat
      if (agent.tier === AgentTier.MATERIALIZED) continue;

      if (Math.random() < killProb) {
        agent.alive = false;
        agent.health = 0;
        agent.combatState = 'dead';

        // Deduct ticket
        if (this.ticketSystem) {
          this.ticketSystem.onCombatantDeath(agent.faction);
        }

        this.events.emit({
          type: 'agent_killed',
          agentId: agent.id,
          faction: agent.faction,
          x: agent.x,
          z: agent.z,
          timestamp: elapsedTime
        });
      }
    }

    // Update squad strength
    let alive = 0;
    for (const memberId of targetSquad.members) {
      const a = this.agents.get(memberId);
      if (a && a.alive) alive++;
    }
    targetSquad.strength = targetSquad.members.length > 0
      ? alive / targetSquad.members.length
      : 0;
  }

  private isDefendingOwnZone(squad: StrategicSquad): boolean {
    if (!this.zoneManager || !squad.objectiveZoneId) return false;

    const zones = this.zoneManager.getAllZones();
    const zone = zones.find(z => z.id === squad.objectiveZoneId);
    if (!zone) return false;

    // Defending if the zone is owned by the squad's faction and squad is within radius
    if (zone.owner !== squad.faction) return false;

    const dx = squad.x - zone.position.x;
    const dz = squad.z - zone.position.z;
    return (dx * dx + dz * dz) < zone.radius * zone.radius * 4; // 2x radius
  }
}
