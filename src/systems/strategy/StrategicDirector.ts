import { Faction, getAlliance, isBlufor, isOpfor, getEnemyAlliance } from '../combat/types';
import { WarSimulatorConfig } from '../../config/gameModeTypes';
import { StrategicAgent, StrategicSquad, AgentTier } from './types';
import { WarEventEmitter } from './WarEventEmitter';
import type { CaptureZone } from '../world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';

const OBJECTIVE_SCATTER_RADIUS_SCALE = 0.38;
const HOME_OBJECTIVE_SCATTER_RADIUS_SCALE = 0.5;
const MIN_OBJECTIVE_SCATTER_RADIUS_M = 10;
const MAX_OBJECTIVE_SCATTER_RADIUS_M = 45;

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
  private zoneQuery?: IZoneQuery;

  private lastUpdateTime = 0;
  private lastReinforcementTime: Record<string, number> = {};

  // Player position for pressure biasing
  private playerX = 0;
  private playerZ = 0;

  // Zones within this radius of the player get a score boost
  private readonly PLAYER_PRESSURE_RADIUS = 1500; // meters
  private readonly PLAYER_PRESSURE_BOOST = 3.0;   // additive score boost

  // Forward reinforcement: allow spawning at zones near the player
  private readonly FORWARD_REINFORCE_RADIUS = 2000; // meters

  constructor(
    squads: Map<string, StrategicSquad>,
    agents: Map<string, StrategicAgent>,
    config: WarSimulatorConfig,
    events: WarEventEmitter,
    zoneQuery?: IZoneQuery
  ) {
    this.squads = squads;
    this.agents = agents;
    this.config = config;
    this.events = events;
    this.zoneQuery = zoneQuery;
  }

  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  update(elapsedTime: number): void {
    if (elapsedTime - this.lastUpdateTime < this.config.directorUpdateInterval / 1000) return;
    this.lastUpdateTime = elapsedTime;

    if (!this.zoneQuery) return;

    const zones = this.zoneQuery.getAllZones();
    if (zones.length === 0) return;

    // Score zones
    const zoneScores = this.scoreZones(zones);

    // Assign squads per active faction. Large-map configs can mix US/ARVN and
    // NVA/VC, so hardcoding only US/NVA leaves allied squads without orders.
    for (const faction of this.getActiveFactions()) {
      this.assignFactionSquads(faction, zones, zoneScores);
    }

    // Propagate orders to agents
    this.propagateOrders();

    // Handle reinforcement respawning for wiped squads
    this.handleReinforcements(elapsedTime, zones);
  }

  private scoreZones(zones: readonly CaptureZone[]): Map<string, number> {
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
          if (isBlufor(squad.faction)) friendlyNearby++;
          else enemyNearby++;
        }
      }

      // Zones with more enemy presence are higher priority
      score *= 1 + (friendlyNearby + enemyNearby) * 0.2;

      // Boost zones near the player to sustain contact pressure
      const pdx = zone.position.x - this.playerX;
      const pdz = zone.position.z - this.playerZ;
      const playerDistSq = pdx * pdx + pdz * pdz;
      if (playerDistSq < this.PLAYER_PRESSURE_RADIUS * this.PLAYER_PRESSURE_RADIUS) {
        const proximity = 1 - Math.sqrt(playerDistSq) / this.PLAYER_PRESSURE_RADIUS;
        score += this.PLAYER_PRESSURE_BOOST * proximity;
      }

      scores.set(zone.id, score);
    }

    return scores;
  }

  private getActiveFactions(): Faction[] {
    const activeFactions = new Set<Faction>();

    for (const squad of this.squads.values()) {
      if (squad.strength > 0) {
        activeFactions.add(squad.faction);
      }
    }

    for (const agent of this.agents.values()) {
      if (agent.alive) {
        activeFactions.add(agent.faction);
      }
    }

    return activeFactions.size > 0
      ? [...activeFactions]
      : [Faction.US, Faction.NVA];
  }

  private assignFactionSquads(
    faction: Faction,
    zones: readonly CaptureZone[],
    zoneScores: Map<string, number>
  ): void {
    const factionSquads = Array.from(this.squads.values())
      .filter(s => s.faction === faction && s.strength > 0);

    if (factionSquads.length === 0) return;
    const alliance = getAlliance(faction);

    // Partition by strength
    const strong = factionSquads.filter(s => s.strength > 0.5);
    const weak = factionSquads.filter(s => s.strength > 0.1 && s.strength <= 0.5);

    // Get zone lists by faction perspective
    const enemyAlliance = getEnemyAlliance(alliance);
    const enemyZones = zones.filter(z => z.owner !== null && getAlliance(z.owner) === enemyAlliance && !z.isHomeBase);
    const ownedZones = zones.filter(z => zoneBelongsToAlliance(z, alliance) && !z.isHomeBase);
    const contestedZones = zones.filter(z => z.state === 'contested' && !z.isHomeBase);
    const neutralZones = zones.filter(z => z.owner === null && !z.isHomeBase);

    // Historical doctrine:
    // NVA: primarily defend, counterattack when strong, patrol supply routes
    // US: primarily attack, reinforce contested, hold captured
    const isDefensiveFaction = isOpfor(faction);

    // Strong squads: split between attack and defend
    let attackRatio: number;
    let defendRatio: number;
    let _patrolRatio: number;

    if (isDefensiveFaction) {
      // NVA: 20% attack, 50% defend, 30% patrol
      attackRatio = 0.2;
      defendRatio = 0.5;
      _patrolRatio = 0.3;
    } else {
      // US: 50% attack, 25% defend, 25% patrol
      attackRatio = 0.5;
      defendRatio = 0.25;
      _patrolRatio = 0.25;
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
      const friendlyZones = zones.filter(z => zoneBelongsToAlliance(z, alliance));
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
    const objectiveOffset = randomObjectiveOffset(zone);
    squad.objectiveZoneId = zone.id;
    squad.objectiveX = zone.position.x + objectiveOffset.x;
    squad.objectiveZ = zone.position.z + objectiveOffset.z;
    squad.stance = stance;
    squad.routeGoalKey = undefined;
    squad.routeWaypoints = undefined;
    squad.routeWaypointIndex = 0;
  }

  private propagateOrders(): void {
    for (const squad of this.squads.values()) {
      const routeWaypoint = this.getCurrentRouteWaypoint(squad);
      const baseX = routeWaypoint?.x ?? squad.objectiveX;
      const baseZ = routeWaypoint?.z ?? squad.objectiveZ;
      const useFormationSpread = !routeWaypoint || routeWaypoint.kind === 'objective';

      for (const memberId of squad.members) {
        const agent = this.agents.get(memberId);
        if (!agent || !agent.alive || agent.tier === AgentTier.MATERIALIZED) continue;

        if (!useFormationSpread) {
          agent.destX = baseX;
          agent.destZ = baseZ;
          continue;
        }

        const offset = this.getFormationOffset(squad, memberId);
        agent.destX = baseX + offset.x;
        agent.destZ = baseZ + offset.z;
      }
    }
  }

  private getCurrentRouteWaypoint(squad: StrategicSquad) {
    if (!squad.routeWaypoints || squad.routeWaypoints.length === 0) {
      return null;
    }

    const routeIndex = Math.min(
      squad.routeWaypointIndex ?? 0,
      squad.routeWaypoints.length - 1,
    );
    return squad.routeWaypoints[routeIndex];
  }

  private getFormationOffset(
    squad: StrategicSquad,
    memberId: string,
  ): { x: number; z: number } {
    const slot = squad.members.indexOf(memberId);
    if (slot <= 0) {
      return { x: 0, z: 0 };
    }

    const adjustedSlot = slot - 1;
    const ring = Math.floor(adjustedSlot / 6) + 1;
    const angle = (adjustedSlot % 6) / 6 * Math.PI * 2;
    const radius = ring * 12;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    };
  }

  private handleReinforcements(elapsedTime: number, zones: readonly CaptureZone[]): void {
    const cooldown = this.config.reinforcementCooldown;

    for (const faction of this.getActiveFactions()) {
      const alliance = getAlliance(faction);
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
        const hqs = zones.filter(z => z.isHomeBase && zoneBelongsToAlliance(z, alliance));
        if (hqs.length === 0) continue;

        // Find forward zones near the player owned by this faction
        // This gets reinforcements into the fight faster than HQ-only spawning
        const forwardZones = zones.filter(z => {
          if (z.isHomeBase || !zoneBelongsToAlliance(z, alliance)) return false;
          const fdx = z.position.x - this.playerX;
          const fdz = z.position.z - this.playerZ;
          return (fdx * fdx + fdz * fdz) < this.FORWARD_REINFORCE_RADIUS * this.FORWARD_REINFORCE_RADIUS;
        });

        // Mix spawn points: 50% forward zones (if available), 50% HQ
        const spawnPoints = forwardZones.length > 0
          ? [...forwardZones, ...hqs]
          : hqs;

        // Respawn dead agents
        let respawned = 0;
        const maxRespawn = Math.min(30, total - alive);

        for (const agent of this.agents.values()) {
          if (respawned >= maxRespawn) break;
          if (agent.faction !== faction || agent.alive) continue;

          const spawnZone = spawnPoints[respawned % spawnPoints.length];
          const angle = Math.random() * Math.PI * 2;
          const dist = 50 + Math.random() * 100;

          agent.alive = true;
          agent.health = 100;
          agent.x = spawnZone.position.x + Math.cos(angle) * dist;
          agent.z = spawnZone.position.z + Math.sin(angle) * dist;
          agent.y = 0; // Will be updated by movement tick
          agent.combatState = 'idle';
          agent.tier = AgentTier.STRATEGIC;
          agent.combatantId = undefined;
          respawned++;
        }

        if (respawned > 0) {
          this.lastReinforcementTime[key] = elapsedTime;
          const primaryZone = forwardZones.length > 0 ? forwardZones[0] : hqs[0];
          const zoneName = primaryZone.name || primaryZone.id;
          this.events.emit({
            type: 'reinforcements_arriving',
            faction,
            zoneId: primaryZone.id,
            zoneName,
            count: respawned,
            timestamp: elapsedTime
          });
        }
      }
    }
  }
}

function randomObjectiveOffset(zone: CaptureZone): { x: number; z: number } {
  const radiusScale = zone.isHomeBase
    ? HOME_OBJECTIVE_SCATTER_RADIUS_SCALE
    : OBJECTIVE_SCATTER_RADIUS_SCALE;
  const scatterRadius = clamp(
    zone.radius * radiusScale,
    MIN_OBJECTIVE_SCATTER_RADIUS_M,
    MAX_OBJECTIVE_SCATTER_RADIUS_M,
  );
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * scatterRadius;
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function zoneBelongsToAlliance(zone: CaptureZone, alliance: ReturnType<typeof getAlliance>): boolean {
  return zone.owner !== null && getAlliance(zone.owner) === alliance;
}
