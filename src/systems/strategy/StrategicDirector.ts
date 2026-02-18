import { Faction } from '../combat/types';
import { WarSimulatorConfig } from '../../config/gameModeTypes';
import { StrategicAgent, StrategicSquad, AgentTier } from './types';
import { WarEventEmitter } from './WarEventEmitter';
import type { ZoneManager, CaptureZone } from '../world/ZoneManager';

/**
 * Strategic AI Director.
 *
 * Runs every directorUpdateInterval (5s). Evaluates the battlefield and assigns
 * squads to objectives. Models the NVA's historical defensive posture and the
 * US air assault offensive approach.
 *
 * Algorithm:
 * 1. Score each zone by strategic value and threat level
 * 2. Partition squads by faction and strength
 * 3. Assign objectives based on faction doctrine:
 *    - NVA: defend controlled zones, counterattack lost zones, patrol supply routes
 *    - US: assault NVA-held zones, reinforce contested zones, hold captured ground
 * 4. Move orders propagate to squad members as destination points
 */
export class StrategicDirector {
  private squads: Map<string, StrategicSquad>;
  private agents: Map<string, StrategicAgent>;
  private config: WarSimulatorConfig;
  private events: WarEventEmitter;
  private zoneManager?: ZoneManager;

  private lastUpdateTime = 0;
  private lastReinforcementTime: Record<string, number> = {};

  constructor(
    squads: Map<string, StrategicSquad>,
    agents: Map<string, StrategicAgent>,
    config: WarSimulatorConfig,
    events: WarEventEmitter,
    zoneManager?: ZoneManager
  ) {
    this.squads = squads;
    this.agents = agents;
    this.config = config;
    this.events = events;
    this.zoneManager = zoneManager;
  }

  update(elapsedTime: number): void {
    if (elapsedTime - this.lastUpdateTime < this.config.directorUpdateInterval / 1000) return;
    this.lastUpdateTime = elapsedTime;

    if (!this.zoneManager) return;

    const zones = this.zoneManager.getAllZones();
    if (zones.length === 0) return;

    // Score zones
    const zoneScores = this.scoreZones(zones);

    // Assign squads per faction
    this.assignFactionSquads(Faction.US, zones, zoneScores);
    this.assignFactionSquads(Faction.OPFOR, zones, zoneScores);

    // Propagate orders to agents
    this.propagateOrders();

    // Handle reinforcement respawning for wiped squads
    this.handleReinforcements(elapsedTime, zones);
  }

  private scoreZones(zones: CaptureZone[]): Map<string, number> {
    const scores = new Map<string, number>();

    for (const zone of zones) {
      if (zone.isHomeBase) {
        scores.set(zone.id, 0); // Don't assign squads to own HQs
        continue;
      }

      // Base value from ticket bleed rate
      let score = zone.ticketBleedRate;

      // Contested zones are high priority
      if (zone.state === 'contested') {
        score *= 2.0;
      }

      // Count nearby friendly/enemy squads for threat assessment
      let friendlyNearby = 0;
      let enemyNearby = 0;
      for (const squad of this.squads.values()) {
        if (squad.strength <= 0) continue;
        const dx = squad.x - zone.position.x;
        const dz = squad.z - zone.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 2000 * 2000) { // 2km
          // Count for both factions - each faction evaluates separately
          if (squad.faction === Faction.US) friendlyNearby++;
          else enemyNearby++;
        }
      }

      // Zones with more enemy presence are higher priority
      score *= 1 + (friendlyNearby + enemyNearby) * 0.2;
      scores.set(zone.id, score);
    }

    return scores;
  }

  private assignFactionSquads(
    faction: Faction,
    zones: CaptureZone[],
    zoneScores: Map<string, number>
  ): void {
    const factionSquads = Array.from(this.squads.values())
      .filter(s => s.faction === faction && s.strength > 0);

    if (factionSquads.length === 0) return;

    // Partition by strength
    const strong = factionSquads.filter(s => s.strength > 0.5);
    const weak = factionSquads.filter(s => s.strength > 0.1 && s.strength <= 0.5);

    // Get zone lists by faction perspective
    const enemyFaction = faction === Faction.US ? Faction.OPFOR : Faction.US;
    const enemyZones = zones.filter(z => z.owner === enemyFaction && !z.isHomeBase);
    const ownedZones = zones.filter(z => z.owner === faction && !z.isHomeBase);
    const contestedZones = zones.filter(z => z.state === 'contested' && !z.isHomeBase);
    const neutralZones = zones.filter(z => z.owner === null && !z.isHomeBase);

    // Historical doctrine:
    // NVA: primarily defend, counterattack when strong, patrol supply routes
    // US: primarily attack, reinforce contested, hold captured
    const isDefensiveFaction = faction === Faction.OPFOR;

    // Strong squads: split between attack and defend
    let attackRatio: number;
    let defendRatio: number;
    let patrolRatio: number;

    if (isDefensiveFaction) {
      // NVA: 20% attack, 50% defend, 30% patrol
      attackRatio = 0.2;
      defendRatio = 0.5;
      patrolRatio = 0.3;
    } else {
      // US: 50% attack, 25% defend, 25% patrol
      attackRatio = 0.5;
      defendRatio = 0.25;
      patrolRatio = 0.25;
    }

    const attackCount = Math.ceil(strong.length * attackRatio);
    const defendCount = Math.ceil(strong.length * defendRatio);

    // Sort attack targets by score (descending)
    const attackTargets = [...enemyZones, ...contestedZones, ...neutralZones]
      .sort((a, b) => (zoneScores.get(b.id) || 0) - (zoneScores.get(a.id) || 0));

    // Assign attackers
    for (let i = 0; i < attackCount && i < strong.length; i++) {
      const squad = strong[i];
      const target = attackTargets[i % Math.max(1, attackTargets.length)];
      if (target) {
        this.assignSquadToZone(squad, target, 'attack');
      }
    }

    // Assign defenders to owned zones
    const defendTargets = [...ownedZones, ...contestedZones]
      .sort((a, b) => (zoneScores.get(b.id) || 0) - (zoneScores.get(a.id) || 0));

    for (let i = 0; i < defendCount && i < strong.length; i++) {
      const idx = attackCount + i;
      if (idx >= strong.length) break;
      const squad = strong[idx];
      const target = defendTargets[i % Math.max(1, defendTargets.length)];
      if (target) {
        this.assignSquadToZone(squad, target, 'defend');
      }
    }

    // Remaining strong squads: patrol between zones
    for (let i = attackCount + defendCount; i < strong.length; i++) {
      const squad = strong[i];
      const allZones = zones.filter(z => !z.isHomeBase);
      const target = allZones[Math.floor(Math.random() * allZones.length)];
      if (target) {
        this.assignSquadToZone(squad, target, 'patrol');
      }
    }

    // Weak squads: retreat to nearest friendly zone
    for (const squad of weak) {
      const friendlyZones = zones.filter(z => z.owner === faction || z.isHomeBase);
      let nearest: CaptureZone | null = null;
      let nearestDistSq = Infinity;
      for (const z of friendlyZones) {
        const dx = squad.x - z.position.x;
        const dz = squad.z - z.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearest = z;
        }
      }
      if (nearest) {
        this.assignSquadToZone(squad, nearest, 'retreat');
      }
    }
  }

  private assignSquadToZone(squad: StrategicSquad, zone: CaptureZone, stance: StrategicSquad['stance']): void {
    squad.objectiveZoneId = zone.id;
    squad.objectiveX = zone.position.x + (Math.random() - 0.5) * zone.radius;
    squad.objectiveZ = zone.position.z + (Math.random() - 0.5) * zone.radius;
    squad.stance = stance;
  }

  private propagateOrders(): void {
    for (const squad of this.squads.values()) {
      for (const memberId of squad.members) {
        const agent = this.agents.get(memberId);
        if (!agent || !agent.alive || agent.tier === AgentTier.MATERIALIZED) continue;

        // Set destination with slight offset per agent for formation spread
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetDist = Math.random() * 30; // 30m formation spread
        agent.destX = squad.objectiveX + Math.cos(offsetAngle) * offsetDist;
        agent.destZ = squad.objectiveZ + Math.sin(offsetAngle) * offsetDist;
      }
    }
  }

  private handleReinforcements(elapsedTime: number, zones: CaptureZone[]): void {
    const cooldown = this.config.reinforcementCooldown;

    for (const [faction, label] of [[Faction.US, 'US'], [Faction.OPFOR, 'OPFOR']] as const) {
      const key = `reinforce_${faction}`;
      const lastTime = this.lastReinforcementTime[key] || 0;
      if (elapsedTime - lastTime < cooldown) continue;

      // Count alive agents for this faction
      let alive = 0;
      let total = 0;
      for (const agent of this.agents.values()) {
        if (agent.faction === faction) {
          total++;
          if (agent.alive) alive++;
        }
      }

      // Reinforce if below 70% strength
      if (total > 0 && alive / total < 0.7) {
        const hqs = zones.filter(z => z.isHomeBase && z.owner === faction);
        if (hqs.length > 0) {
          // Respawn dead agents at HQ positions
          let respawned = 0;
          const maxRespawn = Math.min(30, total - alive);

          for (const agent of this.agents.values()) {
            if (respawned >= maxRespawn) break;
            if (agent.faction !== faction || agent.alive) continue;

            const hq = hqs[respawned % hqs.length];
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 100;

            agent.alive = true;
            agent.health = 100;
            agent.x = hq.position.x + Math.cos(angle) * dist;
            agent.z = hq.position.z + Math.sin(angle) * dist;
            agent.y = 0; // Will be updated by movement tick
            agent.combatState = 'idle';
            agent.tier = AgentTier.STRATEGIC;
            agent.combatantId = undefined;
            respawned++;
          }

          if (respawned > 0) {
            this.lastReinforcementTime[key] = elapsedTime;
            const hq = hqs[0];
            const zoneName = hq.name || hq.id;
            this.events.emit({
              type: 'reinforcements_arriving',
              faction,
              zoneId: hq.id,
              zoneName,
              count: respawned,
              timestamp: elapsedTime
            });
          }
        }
      }
    }
  }
}
