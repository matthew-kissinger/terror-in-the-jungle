import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { WarSimulatorConfig } from '../../config/gameModeTypes';
import { Logger } from '../../utils/Logger';
import {
  AgentTier,
  StrategicAgent,
  StrategicSquad,
  WarState
} from './types';
import { WarEventEmitter } from './WarEventEmitter';
import { MaterializationPipeline } from './MaterializationPipeline';
import { AbstractCombatResolver } from './AbstractCombatResolver';
import { StrategicDirector } from './StrategicDirector';
import { PersistenceSystem } from './PersistenceSystem';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { ZoneManager } from '../world/ZoneManager';
import type { TicketSystem } from '../world/TicketSystem';
import type { InfluenceMapSystem } from '../combat/InfluenceMapSystem';

const WAR_STATE_SCHEMA_VERSION = 1;

/**
 * WarSimulator - persistent large-scale war engine.
 *
 * Sits ABOVE CombatantSystem. Owns all 3000 lightweight agent records.
 * CombatantSystem doesn't know this exists - it just sees 30-60 combatants
 * that appear and disappear via materialize/dematerialize.
 *
 * Update budget: 2ms per frame.
 */
export class WarSimulator implements GameSystem {
  // State
  private enabled = false;
  private config: WarSimulatorConfig | null = null;
  private agents: Map<string, StrategicAgent> = new Map();
  private squads: Map<string, StrategicSquad> = new Map();
  private elapsedTime = 0;
  private factionStats = {
    [Faction.US]: { tickets: 0, kills: 0, deaths: 0 },
    [Faction.OPFOR]: { tickets: 0, kills: 0, deaths: 0 }
  };

  // Player tracking
  private playerX = 0;
  private playerY = 0;
  private playerZ = 0;
  private playerVelX = 0;
  private playerVelZ = 0;

  // Subsystems
  public readonly events = new WarEventEmitter();
  private pipeline: MaterializationPipeline | null = null;
  private resolver: AbstractCombatResolver | null = null;
  private director: StrategicDirector | null = null;
  private persistence: PersistenceSystem | null = null;

  // Dependencies (set via setters)
  private combatantSystem: CombatantSystem | null = null;
  private zoneManager: ZoneManager | null = null;
  private ticketSystem: TicketSystem | null = null;
  private influenceMap: InfluenceMapSystem | null = null;

  // Height query function (set during configure)
  private getTerrainHeight: ((x: number, z: number) => number) | null = null;

  // Zone name lookup cache
  private zoneNames: Map<string, string> = new Map();

  // Timing
  private nextAgentId = 0;
  private nextSquadId = 0;

  async init(): Promise<void> {
    Logger.info('war-sim', 'WarSimulator initialized (dormant until configured)');
  }

  update(deltaTime: number): void {
    if (!this.enabled || !this.config) return;

    // Gate on game phase: during SETUP the player is still loading terrain
    // and spawning in. Don't run the war machine yet.
    const phase = this.ticketSystem?.getGameState().phase;
    if (phase === 'SETUP') return;
    const gameActive = phase !== 'ENDED';

    const budgetStart = performance.now();
    this.elapsedTime += deltaTime;

    // 1. Update materialization pipeline (always - handles despawn on game end too)
    if (this.pipeline) {
      this.pipeline.update(
        this.playerX, this.playerY, this.playerZ,
        this.playerVelX, this.playerVelZ
      );
    }

    // 2. Update simulated agent movement (position lerp toward destination)
    if (gameActive) {
      this.updateSimulatedMovement(deltaTime, budgetStart);
    }

    // 3. Run abstract combat resolver on schedule (only during active combat)
    if (this.resolver && gameActive) {
      this.resolver.update(this.elapsedTime);
    }

    // 4. Run strategic director on schedule (only during active combat)
    if (this.director && gameActive) {
      this.director.update(this.elapsedTime);
    }

    // 5. Auto-save
    if (this.persistence) {
      this.persistence.checkAutoSave(this.elapsedTime, () => this.getWarState());
    }

    // 6. Flush events to listeners
    this.events.flush();
  }

  dispose(): void {
    this.disable();
    this.events.clear();
  }

  // -- Configuration --

  configure(
    config: WarSimulatorConfig,
    heightQuery: (x: number, z: number) => number
  ): void {
    this.config = config;
    this.getTerrainHeight = heightQuery;
    this.enabled = config.enabled;

    if (!this.enabled) return;

    // Initialize persistence
    this.persistence = new PersistenceSystem();

    // Initialize subsystems
    this.pipeline = new MaterializationPipeline(
      this.agents,
      this.squads,
      config,
      this.combatantSystem!
    );

    this.resolver = new AbstractCombatResolver(
      this.agents,
      this.squads,
      config,
      this.events,
      this.ticketSystem ?? undefined,
      this.zoneManager ?? undefined
    );

    this.director = new StrategicDirector(
      this.squads,
      this.agents,
      config,
      this.events,
      this.zoneManager ?? undefined
    );

    // Cache zone names for event messages
    if (this.zoneManager) {
      for (const zone of this.zoneManager.getAllZones()) {
        this.zoneNames.set(zone.id, zone.name);
      }
    }

    Logger.info('war-sim', `Configured: ${config.totalAgents} agents, ${config.maxMaterialized} max materialized`);
  }

  disable(): void {
    this.enabled = false;
    this.agents.clear();
    this.squads.clear();
    this.pipeline = null;
    this.resolver = null;
    this.director = null;
    this.elapsedTime = 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // -- Force spawning --

  /**
   * Create initial strategic forces. Called once when the war begins.
   * Distributes agents across faction HQ zones in squads.
   */
  spawnStrategicForces(
    zones: Array<{
      id: string;
      name: string;
      position: { x: number; z: number };
      isHomeBase: boolean;
      owner: Faction | null;
      state?: string;
      ticketBleedRate?: number;
    }>
  ): void {
    if (!this.config) return;
    this.resetStrategicForces();

    const usHQs = zones.filter(z => z.isHomeBase && z.owner === Faction.US);
    const opforHQs = zones.filter(z => z.isHomeBase && z.owner === Faction.OPFOR);

    if (usHQs.length === 0 || opforHQs.length === 0) {
      Logger.warn('war-sim', 'No HQ zones found for one or both factions');
      return;
    }

    // Also spawn some squads at controlled non-HQ zones for both factions
    const usZones = zones.filter(z => !z.isHomeBase && z.owner === Faction.US);
    const opforZones = zones.filter(z => !z.isHomeBase && z.owner === Faction.OPFOR);
    const frontlineZones = zones
      .filter(z => !z.isHomeBase && (z.owner === null || z.state === 'contested'))
      .sort((a, b) => (b.ticketBleedRate ?? 0) - (a.ticketBleedRate ?? 0));

    const squadMin = this.config.squadSize.min;
    const squadMax = this.config.squadSize.max;
    const avgSquadSize = Math.floor((squadMin + squadMax) / 2);
    const squadsPerFaction = Math.ceil(this.config.agentsPerFaction / avgSquadSize);

    // Spawn distribution: keep HQ reserves, but guarantee frontline presence
    // so early contact emerges near strategic objectives.
    const frontlineSquads = frontlineZones.length > 0
      ? Math.max(1, Math.floor(squadsPerFaction * 0.2))
      : 0;
    const hqSquads = Math.max(1, Math.ceil(squadsPerFaction * 0.45));
    const zoneSquads = Math.max(0, squadsPerFaction - hqSquads - frontlineSquads);

    // Spawn US forces
    const usHQSquads = hqSquads;
    const usZoneSquads = zoneSquads;
    this.spawnFactionForces(Faction.US, usHQs, [], usHQSquads, squadMin, squadMax);
    if (usZoneSquads > 0 && usZones.length > 0) {
      this.spawnFactionForces(Faction.US, usZones, [], usZoneSquads, squadMin, squadMax);
    } else if (usZoneSquads > 0) {
      this.spawnFactionForces(Faction.US, usHQs, [], usZoneSquads, squadMin, squadMax);
    }
    if (frontlineSquads > 0) {
      this.spawnFactionForces(Faction.US, frontlineZones, [], frontlineSquads, squadMin, squadMax);
    }

    // Spawn OPFOR forces
    const opforHQSquads = hqSquads;
    const opforZoneSquads = zoneSquads;
    this.spawnFactionForces(Faction.OPFOR, opforHQs, opforZones, opforHQSquads, squadMin, squadMax);
    if (opforZoneSquads > 0 && opforZones.length > 0) {
      this.spawnFactionForces(Faction.OPFOR, opforZones, [], opforZoneSquads, squadMin, squadMax);
    } else if (opforZoneSquads > 0) {
      this.spawnFactionForces(Faction.OPFOR, opforHQs, [], opforZoneSquads, squadMin, squadMax);
    }
    if (frontlineSquads > 0) {
      this.spawnFactionForces(Faction.OPFOR, frontlineZones, [], frontlineSquads, squadMin, squadMax);
    }

    Logger.info('war-sim', `Spawned ${this.agents.size} agents in ${this.squads.size} squads`);
  }

  private resetStrategicForces(): void {
    this.agents.clear();
    this.squads.clear();
    this.nextAgentId = 0;
    this.nextSquadId = 0;
  }

  private spawnFactionForces(
    faction: Faction,
    primaryZones: Array<{ id: string; position: { x: number; z: number } }>,
    _secondaryZones: Array<{ id: string; position: { x: number; z: number } }>,
    squadCount: number,
    squadMin: number,
    squadMax: number
  ): void {
    for (let i = 0; i < squadCount; i++) {
      const zone = primaryZones[i % primaryZones.length];
      const size = squadMin + Math.floor(Math.random() * (squadMax - squadMin + 1));
      const spread = 100; // meters spread around zone center

      const squadId = `ws_squad_${this.nextSquadId++}`;
      const members: string[] = [];
      let firstAgentId = '';

      for (let j = 0; j < size; j++) {
        const agentId = `ws_agent_${this.nextAgentId++}`;
        if (j === 0) firstAgentId = agentId;

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * spread;
        const x = zone.position.x + Math.cos(angle) * dist;
        const z = zone.position.z + Math.sin(angle) * dist;
        const y = this.getTerrainHeight ? this.getTerrainHeight(x, z) : 0;

        const agent: StrategicAgent = {
          id: agentId,
          faction,
          x, z, y,
          health: 100,
          alive: true,
          tier: AgentTier.STRATEGIC,
          squadId,
          isLeader: j === 0,
          destX: x,
          destZ: z,
          speed: 3.5 + Math.random() * 1.5, // 3.5-5.0 m/s
          combatState: 'idle'
        };

        this.agents.set(agentId, agent);
        members.push(agentId);
      }

      const squad: StrategicSquad = {
        id: squadId,
        faction,
        members,
        leaderId: firstAgentId,
        x: zone.position.x,
        z: zone.position.z,
        objectiveX: zone.position.x,
        objectiveZ: zone.position.z,
        stance: faction === Faction.OPFOR ? 'defend' : 'patrol',
        strength: 1.0,
        combatActive: false,
        lastCombatTime: 0
      };

      this.squads.set(squadId, squad);
    }
  }

  // -- Simulated movement --

  private updateSimulatedMovement(deltaTime: number, budgetStart: number): void {
    const MOVEMENT_BUDGET_MS = 0.5;

    for (const agent of this.agents.values()) {
      if (performance.now() - budgetStart > MOVEMENT_BUDGET_MS + 1.5) break;

      if (!agent.alive || agent.tier === AgentTier.MATERIALIZED) continue;
      if (agent.combatState === 'dead' || agent.combatState === 'fighting') continue;

      // Move toward destination
      const dx = agent.destX - agent.x;
      const dz = agent.destZ - agent.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < 4) { // within 2m of destination
        agent.combatState = 'idle';
        continue;
      }

      agent.combatState = 'moving';
      const dist = Math.sqrt(distSq);
      const step = agent.speed * deltaTime;
      const ratio = Math.min(step / dist, 1);

      agent.x += dx * ratio;
      agent.z += dz * ratio;

      // Keep non-materialized agents terrain-aligned so later materialization
      // never inherits stale altitude from long-range strategic movement.
      if (this.getTerrainHeight) {
        agent.y = this.getTerrainHeight(agent.x, agent.z);
      }
    }

    // Update squad centroids
    for (const squad of this.squads.values()) {
      let sx = 0, sz = 0, alive = 0;
      for (const memberId of squad.members) {
        const a = this.agents.get(memberId);
        if (a && a.alive) {
          sx += a.x;
          sz += a.z;
          alive++;
        }
      }
      if (alive > 0) {
        squad.x = sx / alive;
        squad.z = sz / alive;
        squad.strength = alive / squad.members.length;
      } else {
        squad.strength = 0;
      }
    }
  }

  // -- Player tracking --

  setPlayerPosition(x: number, y: number, z: number): void {
    // Compute velocity for prediction
    this.playerVelX = x - this.playerX;
    this.playerVelZ = z - this.playerZ;
    this.playerX = x;
    this.playerY = y;
    this.playerZ = z;
  }

  // -- Dependency setters --

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  setTicketSystem(system: TicketSystem): void {
    this.ticketSystem = system;
  }

  setInfluenceMap(system: InfluenceMapSystem): void {
    this.influenceMap = system;
  }

  // -- Queries --

  getAllSquads(): Map<string, StrategicSquad> {
    return this.squads;
  }

  getAllAgents(): Map<string, StrategicAgent> {
    return this.agents;
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getAliveCount(faction?: Faction): number {
    let count = 0;
    for (const a of this.agents.values()) {
      if (a.alive && (!faction || a.faction === faction)) count++;
    }
    return count;
  }

  getMaterializedCount(): number {
    let count = 0;
    for (const a of this.agents.values()) {
      if (a.tier === AgentTier.MATERIALIZED) count++;
    }
    return count;
  }

  /**
   * Get agent positions for map rendering.
   * Returns a flat array: [faction, x, z, tier, faction, x, z, tier, ...]
   * for efficient iteration without allocation.
   */
  getAgentPositionsForMap(): Float32Array {
    const buf = new Float32Array(this.agents.size * 4);
    let i = 0;
    for (const a of this.agents.values()) {
      if (!a.alive) continue;
      buf[i++] = a.faction === Faction.US ? 0 : 1;
      buf[i++] = a.x;
      buf[i++] = a.z;
      buf[i++] = a.tier === AgentTier.MATERIALIZED ? 0 : a.tier === AgentTier.SIMULATED ? 1 : 2;
    }
    return buf.subarray(0, i);
  }

  getZoneName(zoneId: string): string {
    return this.zoneNames.get(zoneId) || zoneId;
  }

  getElapsedTime(): number {
    return this.elapsedTime;
  }

  // -- Persistence --

  getWarState(): WarState {
    return {
      schemaVersion: WAR_STATE_SCHEMA_VERSION,
      timestamp: Date.now(),
      gameMode: 'a_shau_valley',
      elapsedTime: this.elapsedTime,
      agents: Array.from(this.agents.values()),
      squads: Array.from(this.squads.values()),
      factions: { ...this.factionStats },
      zones: this.zoneManager
        ? this.zoneManager.getAllZones().map(z => ({
            id: z.id,
            owner: z.owner,
            captureProgress: z.captureProgress ?? 0
          }))
        : [],
      player: {
        x: this.playerX,
        y: this.playerY,
        z: this.playerZ,
        health: 100,
        kills: 0,
        deaths: 0
      }
    };
  }

  loadWarState(state: WarState): void {
    if (state.schemaVersion !== WAR_STATE_SCHEMA_VERSION) {
      Logger.warn('war-sim', `Schema mismatch: expected ${WAR_STATE_SCHEMA_VERSION}, got ${state.schemaVersion}`);
      return;
    }

    this.agents.clear();
    this.squads.clear();

    for (const a of state.agents) {
      // Reset materialized state on load - pipeline will re-materialize as needed
      a.tier = a.alive ? AgentTier.STRATEGIC : AgentTier.STRATEGIC;
      a.combatantId = undefined;
      this.agents.set(a.id, a);
    }

    for (const s of state.squads) {
      s.combatActive = false;
      this.squads.set(s.id, s);
    }

    this.elapsedTime = state.elapsedTime;
    if (state.factions) {
      this.factionStats = state.factions as typeof this.factionStats;
    }

    // Update nextId counters to avoid collisions
    let maxAgentId = 0;
    let maxSquadId = 0;
    for (const a of this.agents.values()) {
      const num = parseInt(a.id.replace('ws_agent_', ''), 10);
      if (num > maxAgentId) maxAgentId = num;
    }
    for (const s of this.squads.values()) {
      const num = parseInt(s.id.replace('ws_squad_', ''), 10);
      if (num > maxSquadId) maxSquadId = num;
    }
    this.nextAgentId = maxAgentId + 1;
    this.nextSquadId = maxSquadId + 1;

    Logger.info('war-sim', `Loaded war state: ${this.agents.size} agents, ${this.squads.size} squads, ${state.elapsedTime.toFixed(0)}s elapsed`);
  }
}
