import * as THREE from 'three';
import { Combatant, CombatantState, Faction, Squad } from '../../systems/combat/types';
import { SpatialGridManager } from '../../systems/combat/SpatialGridManager';
import { SquadManager } from '../../systems/combat/SquadManager';
import { CombatantFactory } from '../../systems/combat/CombatantFactory';
import { RespawnManager } from '../../systems/combat/RespawnManager';
import { TicketSystem } from '../../systems/world/TicketSystem';
import { ZoneCaptureLogic } from '../../systems/world/ZoneCaptureLogic';
import { CaptureZone, ZoneState } from '../../systems/world/ZoneManager';

/**
 * Integration test harness that wires real game systems together.
 *
 * Instantiates real SpatialGridManager, SquadManager, CombatantFactory,
 * RespawnManager, TicketSystem, and ZoneCaptureLogic with minimal mocking
 * (only HeightQueryCache is stubbed since it depends on noise generation
 * that isn't relevant to integration behavior).
 */
export class GameScenario {
  readonly spatialGrid: SpatialGridManager;
  readonly combatantFactory: CombatantFactory;
  readonly squadManager: SquadManager;
  readonly respawnManager: RespawnManager;
  readonly ticketSystem: TicketSystem;
  readonly captureLogic: ZoneCaptureLogic;
  readonly combatants: Map<string, Combatant>;
  readonly zones: Map<string, CaptureZone>;

  private worldSize: number;

  constructor(worldSize = 2000) {
    this.worldSize = worldSize;
    this.combatants = new Map();
    this.zones = new Map();

    // Real spatial grid
    this.spatialGrid = new SpatialGridManager();
    this.spatialGrid.initialize(worldSize);

    // Real factory and squad manager
    this.combatantFactory = new CombatantFactory();
    this.squadManager = new SquadManager(this.combatantFactory);

    // Real respawn manager wired to the shared combatants map
    this.respawnManager = new RespawnManager(
      this.combatants,
      this.squadManager,
      this.combatantFactory,
    );

    // Real ticket system
    this.ticketSystem = new TicketSystem();

    // Real capture logic
    this.captureLogic = new ZoneCaptureLogic();
  }

  // ---------------------------------------------------------------------------
  // Spawning helpers
  // ---------------------------------------------------------------------------

  /**
   * Spawn a squad using the real SquadManager + CombatantFactory pipeline
   * and register every member in the spatial grid and combatants map.
   */
  spawnSquad(
    faction: Faction,
    position: THREE.Vector3,
    count: number,
  ): { squad: Squad; members: Combatant[] } {
    const { squad, members } = this.squadManager.createSquad(faction, position, count);

    for (const member of members) {
      this.combatants.set(member.id, member);
      this.spatialGrid.syncEntity(member.id, member.position);
    }

    return { squad, members };
  }

  /**
   * Create a single combatant (no squad) and register it.
   */
  spawnCombatant(faction: Faction, position: THREE.Vector3): Combatant {
    const c = this.combatantFactory.createCombatant(faction, position);
    this.combatants.set(c.id, c);
    this.spatialGrid.syncEntity(c.id, c.position);
    return c;
  }

  // ---------------------------------------------------------------------------
  // Zone helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a capture zone and register it.
   */
  createZone(
    id: string,
    name: string,
    position: THREE.Vector3,
    opts: Partial<CaptureZone> = {},
  ): CaptureZone {
    const zone: CaptureZone = {
      id,
      name,
      position: position.clone(),
      radius: opts.radius ?? 30,
      height: opts.height ?? 20,
      owner: opts.owner ?? null,
      state: opts.state ?? ZoneState.NEUTRAL,
      captureProgress: opts.captureProgress ?? 0,
      captureSpeed: opts.captureSpeed ?? 10,
      currentFlagHeight: opts.currentFlagHeight ?? 0,
      isHomeBase: opts.isHomeBase ?? false,
      ticketBleedRate: opts.ticketBleedRate ?? 1,
    };
    this.zones.set(id, zone);
    return zone;
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  getCombatants(): Combatant[] {
    return Array.from(this.combatants.values());
  }

  getLiving(): Combatant[] {
    return this.getCombatants().filter(c => c.state !== CombatantState.DEAD);
  }

  getByFaction(faction: Faction): Combatant[] {
    return this.getCombatants().filter(c => c.faction === faction);
  }

  getLivingByFaction(faction: Faction): Combatant[] {
    return this.getLiving().filter(c => c.faction === faction);
  }

  // ---------------------------------------------------------------------------
  // Simulation helpers
  // ---------------------------------------------------------------------------

  /**
   * Advance simulation by one tick of `dt` seconds.
   * Syncs all combatant positions into the spatial grid.
   */
  tick(dt: number): void {
    const playerPos = new THREE.Vector3(0, 0, 0);
    this.spatialGrid.syncAllPositions(this.combatants, playerPos);
  }

  /**
   * Advance by `seconds` at 60 fps (calling tick() each frame).
   */
  advance(seconds: number): void {
    const frames = Math.round(seconds * 60);
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      this.tick(dt);
    }
  }

  /**
   * Kill a combatant: set health to 0, state to DEAD, remove from spatial grid.
   * Optionally notify the ticket system.
   */
  killCombatant(id: string, notifyTickets = false): void {
    const c = this.combatants.get(id);
    if (!c) return;
    c.health = 0;
    c.state = CombatantState.DEAD;
    this.spatialGrid.removeEntity(id);
    if (notifyTickets) {
      this.ticketSystem.onCombatantDeath(c.faction);
    }
  }

  /**
   * Move a combatant to a new position and sync the spatial grid.
   */
  moveCombatant(id: string, position: THREE.Vector3): void {
    const c = this.combatants.get(id);
    if (!c) return;
    c.position.copy(position);
    this.spatialGrid.syncEntity(id, position);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.spatialGrid.clear();
    this.combatants.clear();
    this.zones.clear();
    this.squadManager.dispose();
    this.ticketSystem.dispose();
  }
}
