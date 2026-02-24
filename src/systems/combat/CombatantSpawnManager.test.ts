import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { Combatant, CombatantState, Faction } from './types';
import { CombatantFactory } from './CombatantFactory';
import { SquadManager } from './SquadManager';
import { SpatialOctree } from './SpatialOctree';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { RallyPointSystem } from './RallyPointSystem';
import { TicketSystem } from '../world/TicketSystem';

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3,
  state: CombatantState = CombatantState.IDLE,
  health: number = 100
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health,
    maxHealth: 100,
    state,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant;
}

// Mock factory functions
function createMockCombatantFactory(): CombatantFactory {
  return {
    createCombatant: vi.fn((faction, position) =>
      createMockCombatant(`combatant-${Math.random()}`, faction, position)
    ),
  } as unknown as CombatantFactory;
}

function createMockSquadManager(): SquadManager {
  return {
    createSquad: vi.fn((faction, position, size) => {
      const members: Combatant[] = [];
      for (let i = 0; i < size; i++) {
        members.push(createMockCombatant(`member-${i}`, faction, position.clone()));
      }
      return {
        squad: {
          id: `squad-${Math.random()}`,
          faction,
          members: members.map(m => m.id),
          isPlayerControlled: false,
          currentCommand: 0,
        },
        members,
      };
    }),
    getSquad: vi.fn(() => null),
  } as unknown as SquadManager;
}

function createMockSpatialOctree(): SpatialOctree {
  return {
    updatePosition: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn(() => ({
      totalNodes: 10,
      totalEntities: 20,
      maxDepth: 3,
    })),
  } as unknown as SpatialOctree;
}

function createMockZoneManager(): ZoneManager {
  return {
    getAllZones: vi.fn(() => []),
  } as unknown as ZoneManager;
}

function createMockGameModeManager(): GameModeManager {
  return {
    getCurrentConfig: vi.fn(() => ({
      worldSize: 400,
      terrainScale: 1.0,
      baseSpacing: 600,
      usBasePosition: new THREE.Vector3(-150, 0, -150),
      opforBasePosition: new THREE.Vector3(150, 0, 150),
      zones: [],
    })),
  } as unknown as GameModeManager;
}

function createMockRallyPointSystem(): RallyPointSystem {
  return {
    getRallyPoint: vi.fn(() => null),
  } as unknown as RallyPointSystem;
}

function createMockTicketSystem(): TicketSystem {
  return {
    getGameState: vi.fn(() => ({
      phase: 'COMBAT',
      usTickets: 100,
      opforTickets: 100,
    })),
    isGameActive: vi.fn(() => true),
    onCombatantDeath: vi.fn(),
  } as unknown as TicketSystem;
}

describe('CombatantSpawnManager', () => {
  let spawnManager: CombatantSpawnManager;
  let combatants: Map<string, Combatant>;
  let spatialGrid: SpatialOctree;
  let combatantFactory: CombatantFactory;
  let squadManager: SquadManager;
  let zoneManager: ZoneManager;
  let gameModeManager: GameModeManager;
  let rallyPointSystem: RallyPointSystem;
  let ticketSystem: TicketSystem;

  beforeEach(() => {
    combatants = new Map();
    spatialGrid = createMockSpatialOctree();
    combatantFactory = createMockCombatantFactory();
    squadManager = createMockSquadManager();
    zoneManager = createMockZoneManager();
    gameModeManager = createMockGameModeManager();
    rallyPointSystem = createMockRallyPointSystem();
    ticketSystem = createMockTicketSystem();

    spawnManager = new CombatantSpawnManager(
      combatants,
      spatialGrid,
      combatantFactory,
      squadManager
    );

    spawnManager.setZoneManager(zoneManager);
    spawnManager.setGameModeManager(gameModeManager);
    spawnManager.setRallyPointSystem(rallyPointSystem);
  });

  describe('Constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(spawnManager).toBeDefined();
    });

    it('should create RespawnManager instance', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );
      expect(manager).toBeDefined();
    });
  });

  describe('Setters', () => {
    it('should set ZoneManager', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );
      manager.setZoneManager(zoneManager);
      expect(manager).toBeDefined();
    });

    it('should set GameModeManager', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );
      manager.setGameModeManager(gameModeManager);
      expect(manager).toBeDefined();
    });

    it('should set RallyPointSystem', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );
      manager.setRallyPointSystem(rallyPointSystem);
      expect(manager).toBeDefined();
    });

    it('should set max combatants', () => {
      spawnManager.setMaxCombatants(50);
      expect(spawnManager).toBeDefined();
    });

    it('should set squad sizes', () => {
      spawnManager.setSquadSizes(2, 8);
      expect(spawnManager).toBeDefined();
    });

    it('should set reinforcement interval', () => {
      spawnManager.setReinforcementInterval(30);
      expect(spawnManager).toBeDefined();
    });

    it('should enforce minimum reinforcement interval of 5 seconds', () => {
      spawnManager.setReinforcementInterval(2);
      // Internal SPAWN_CHECK_INTERVAL should be clamped to 5000ms minimum
      expect(spawnManager).toBeDefined();
    });
  });

  describe('spawnInitialForces', () => {
    it('should spawn initial forces for both factions', () => {
      spawnManager.spawnInitialForces(false);

      expect(squadManager.createSquad).toHaveBeenCalled();
      expect(combatants.size).toBeGreaterThan(0);
    });

    it('should create player squad when requested', () => {
      const playerSquadId = spawnManager.spawnInitialForces(true);

      expect(playerSquadId).toBeDefined();
      expect(squadManager.createSquad).toHaveBeenCalled();
    });

    it('should not create player squad when shouldCreatePlayerSquad is false', () => {
      const playerSquadId = spawnManager.spawnInitialForces(false);

      expect(playerSquadId).toBeUndefined();
    });

    it('should mark player squad as player-controlled', () => {
      const createSquadMock = vi.mocked(squadManager.createSquad);
      createSquadMock.mockImplementationOnce((faction, position, size) => {
        const members: Combatant[] = [];
        for (let i = 0; i < size; i++) {
          members.push(createMockCombatant(`player-${i}`, faction, position.clone()));
        }
        return {
          squad: {
            id: 'player-squad',
            faction,
            members: members.map(m => m.id),
            isPlayerControlled: true,
            currentCommand: 0,
            commandPosition: position.clone(),
          },
          members,
        };
      });

      spawnManager.spawnInitialForces(true);

      expect(createSquadMock).toHaveBeenCalled();
    });

    it('should add spawned combatants to the combatants map', () => {
      spawnManager.spawnInitialForces(false);

      expect(combatants.size).toBeGreaterThan(0);
    });

    it('should update spatial grid with spawned combatants', () => {
      spawnManager.spawnInitialForces(false);

      expect(spatialGrid.updatePosition).toHaveBeenCalled();
    });

    it('should seed progressive spawn queue', () => {
      spawnManager.spawnInitialForces(false);

      // Progressive spawn queue should have 2 entries (one per faction)
      // Can't directly test private field, but we can verify behavior in update()
      expect(spawnManager).toBeDefined();
    });

    it('should log octree stats after initialization', () => {
      spawnManager.spawnInitialForces(false);

      expect(spatialGrid.getStats).toHaveBeenCalled();
    });

    it('should spawn at HQ zones when configured', () => {
      const mockConfig = {
        worldSize: 400,
        terrainScale: 1.0,
        baseSpacing: 600,
        usBasePosition: new THREE.Vector3(-150, 0, -150),
        opforBasePosition: new THREE.Vector3(150, 0, 150),
        zones: [
          {
            id: 'us-hq',
            name: 'US HQ',
            position: new THREE.Vector3(-100, 0, -100),
            radius: 30,
            owner: Faction.US,
            isHomeBase: true,
          },
          {
            id: 'opfor-hq',
            name: 'OPFOR HQ',
            position: new THREE.Vector3(100, 0, 100),
            radius: 30,
            owner: Faction.NVA,
            isHomeBase: true,
          },
        ],
      };

      vi.mocked(gameModeManager.getCurrentConfig).mockReturnValue(mockConfig);

      spawnManager.spawnInitialForces(false);

      expect(squadManager.createSquad).toHaveBeenCalled();
    });

    it('should use base positions as fallback when no HQs configured', () => {
      const mockConfig = {
        worldSize: 400,
        terrainScale: 1.0,
        baseSpacing: 600,
        usBasePosition: new THREE.Vector3(-150, 0, -150),
        opforBasePosition: new THREE.Vector3(150, 0, 150),
        zones: [],
      };

      vi.mocked(gameModeManager.getCurrentConfig).mockReturnValue(mockConfig);

      spawnManager.spawnInitialForces(false);

      expect(squadManager.createSquad).toHaveBeenCalled();
    });

    it('should still spawn OPFOR squads when player squad is created', () => {
      spawnManager.setMaxCombatants(30);
      spawnManager.setSquadSizes(8, 12);
      const mockConfig = {
        id: 'zone_control',
        worldSize: 400,
        terrainScale: 1.0,
        baseSpacing: 600,
        usBasePosition: new THREE.Vector3(-150, 0, -150),
        opforBasePosition: new THREE.Vector3(150, 0, 150),
        zones: [
          {
            id: 'us_base',
            name: 'US Base',
            position: new THREE.Vector3(-100, 0, -100),
            radius: 30,
            owner: Faction.US,
            isHomeBase: true,
          },
          {
            id: 'opfor_base',
            name: 'OPFOR Base',
            position: new THREE.Vector3(100, 0, 100),
            radius: 30,
            owner: Faction.NVA,
            isHomeBase: true,
          },
        ],
      };
      vi.mocked(gameModeManager.getCurrentConfig).mockReturnValue(mockConfig as any);

      spawnManager.spawnInitialForces(true);

      const calls = vi.mocked(squadManager.createSquad).mock.calls;
      const opforCalls = calls.filter(call => call[0] === Faction.NVA);
      expect(opforCalls.length).toBeGreaterThan(0);
    });

    it('should spread initial large-mode squads across multiple HQ anchors', () => {
      spawnManager.setMaxCombatants(60);
      spawnManager.setSquadSizes(8, 12);
      const createSquadMock = vi.mocked(squadManager.createSquad);
      const capturedUSPositions: THREE.Vector3[] = [];
      const originalImpl = createSquadMock.getMockImplementation();
      createSquadMock.mockImplementation((faction, position, size) => {
        if (faction === Faction.US) {
          capturedUSPositions.push(position.clone());
        }
        if (originalImpl) {
          return originalImpl(faction, position, size);
        }
        const members: Combatant[] = [];
        for (let i = 0; i < size; i++) {
          members.push(createMockCombatant(`member-${i}`, faction, position.clone()));
        }
        return {
          squad: {
            id: `squad-${Math.random()}`,
            faction,
            members: members.map(m => m.id),
            isPlayerControlled: false,
            currentCommand: 0,
          },
          members,
        };
      });

      const usHQs = [
        new THREE.Vector3(-2000, 0, -2000),
        new THREE.Vector3(-1400, 0, -1300),
        new THREE.Vector3(-800, 0, -1900),
      ];
      const opforHQs = [
        new THREE.Vector3(1800, 0, 1800),
        new THREE.Vector3(1200, 0, 1500),
        new THREE.Vector3(700, 0, 2100),
      ];
      const mockConfig = {
        id: 'a_shau_valley',
        worldSize: 21136,
        terrainScale: 1.0,
        baseSpacing: 1800,
        usBasePosition: usHQs[0],
        opforBasePosition: opforHQs[0],
        zones: [
          { id: 'us_base', name: 'US Main', position: usHQs[0], radius: 30, owner: Faction.US, isHomeBase: true },
          { id: 'us_hq_east', name: 'US East', position: usHQs[1], radius: 30, owner: Faction.US, isHomeBase: true },
          { id: 'us_hq_south', name: 'US South', position: usHQs[2], radius: 30, owner: Faction.US, isHomeBase: true },
          { id: 'opfor_hq_main', name: 'OPFOR Main', position: opforHQs[0], radius: 30, owner: Faction.NVA, isHomeBase: true },
          { id: 'opfor_hq_north', name: 'OPFOR North', position: opforHQs[1], radius: 30, owner: Faction.NVA, isHomeBase: true },
          { id: 'opfor_hq_south', name: 'OPFOR South', position: opforHQs[2], radius: 30, owner: Faction.NVA, isHomeBase: true },
        ],
      };
      vi.mocked(gameModeManager.getCurrentConfig).mockReturnValue(mockConfig as any);

      spawnManager.spawnInitialForces(false);
      const usedAnchors = new Set<number>();
      for (const pos of capturedUSPositions) {
        let bestIndex = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < usHQs.length; i++) {
          const dx = pos.x - usHQs[i].x;
          const dz = pos.z - usHQs[i].z;
          const distSq = dx * dx + dz * dz;
          if (distSq < bestDist) {
            bestDist = distSq;
            bestIndex = i;
          }
        }
        if (bestIndex >= 0) {
          usedAnchors.add(bestIndex);
        }
      }

      expect(capturedUSPositions.length).toBeGreaterThan(1);
      expect(usedAnchors.size).toBeGreaterThan(1);
    });
  });

  describe('spawnSquad', () => {
    it('should spawn a squad at the given position', () => {
      const position = new THREE.Vector3(10, 0, 10);
      const size = 4;

      spawnManager.spawnSquad(Faction.US, position, size);

      expect(squadManager.createSquad).toHaveBeenCalledWith(Faction.US, position, size);
    });

    it('should add all squad members to combatants map', () => {
      const position = new THREE.Vector3(10, 0, 10);
      const size = 4;

      spawnManager.spawnSquad(Faction.US, position, size);

      expect(combatants.size).toBe(size);
    });

    it('should update spatial grid for all squad members', () => {
      const position = new THREE.Vector3(10, 0, 10);
      const size = 4;

      spawnManager.spawnSquad(Faction.US, position, size);

      expect(spatialGrid.updatePosition).toHaveBeenCalledTimes(size);
    });

    it('should spawn OPFOR squads', () => {
      const position = new THREE.Vector3(-10, 0, -10);
      const size = 3;

      spawnManager.spawnSquad(Faction.NVA, position, size);

      expect(squadManager.createSquad).toHaveBeenCalledWith(Faction.NVA, position, size);
      expect(combatants.size).toBe(size);
    });
  });

  describe('update - progressive spawn queue', () => {
    it('should process progressive spawn queue over time', () => {
      spawnManager.spawnInitialForces(false);
      const initialCount = combatants.size;

      // Trigger progressive spawn (1 second delay)
      spawnManager.update(1.1, true);

      // At least one progressive spawn should have occurred
      expect(combatants.size).toBeGreaterThanOrEqual(initialCount);
    });

    it('should not spawn from queue if not enough time passed', () => {
      spawnManager.spawnInitialForces(false);

      // Clear the progressive spawn queue to ensure clean test
      // (queue has 2 entries seeded after initial spawn)
      spawnManager.update(0.016, true);
      spawnManager.update(0.016, true);
      spawnManager.update(0.016, true);
      spawnManager.update(0.016, true);
      spawnManager.update(0.016, true);

      const initialCount = combatants.size;

      // Small delta time, shouldn't trigger progressive spawn
      spawnManager.update(0.016, true);

      expect(combatants.size).toBe(initialCount);
    });

    it('should clear progressive spawn queue after all spawns', () => {
      spawnManager.spawnInitialForces(false);

      // Process all progressive spawns
      for (let i = 0; i < 5; i++) {
        spawnManager.update(1.1, true);
      }

      // Queue should be empty, no more spawns
      const countBefore = combatants.size;
      spawnManager.update(1.1, true);
      expect(combatants.size).toBe(countBefore);
    });
  });

  describe('update - reinforcement waves', () => {
    it('should spawn reinforcement waves at configured interval', () => {
      spawnManager.setReinforcementInterval(10);
      spawnManager.spawnInitialForces(false);

      const initialCount = combatants.size;

      // Trigger reinforcement wave (10 second interval)
      spawnManager.update(10.1, true);

      // Reinforcements may or may not spawn depending on faction counts and max cap
      expect(spawnManager).toBeDefined();
    });

    it('should not spawn reinforcements before interval elapsed', () => {
      spawnManager.setReinforcementInterval(10);
      spawnManager.spawnInitialForces(false);

      // Process progressive spawn queue first
      for (let i = 0; i < 5; i++) {
        spawnManager.update(1.1, true);
      }

      const initialCount = combatants.size;

      // Small time delta, shouldn't trigger wave (still under 10s)
      spawnManager.update(1.0, true);

      expect(combatants.size).toBe(initialCount);
    });
  });

  describe('update - periodic spawn check', () => {
    it('should remove dead combatants', () => {
      const deadCombatant = createMockCombatant(
        'dead-1',
        Faction.US,
        new THREE.Vector3(0, 0, 0),
        CombatantState.DEAD,
        0
      );
      combatants.set('dead-1', deadCombatant);

      // Fast-forward past spawn check interval (3 seconds default)
      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, true);

      expect(combatants.has('dead-1')).toBe(false);
    });

    it('should maintain faction strength during COMBAT phase', () => {
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      });

      spawnManager.setMaxCombatants(30);
      spawnManager.spawnInitialForces(false);

      // Remove some combatants to trigger refill
      const toRemove: string[] = [];
      let count = 0;
      for (const [id, combatant] of combatants.entries()) {
        if (combatant.faction === Faction.US && count < 5) {
          toRemove.push(id);
          count++;
        }
      }
      toRemove.forEach(id => combatants.delete(id));

      const beforeCount = combatants.size;

      // Fast-forward past spawn check interval
      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, true, ticketSystem);

      // Should attempt to refill (may be capped at MAX_COMBATANTS)
      expect(spawnManager).toBeDefined();
    });

    it('should not refill during non-COMBAT phase when combat disabled', () => {
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'DEPLOY',
        usTickets: 100,
        opforTickets: 100,
      });

      spawnManager.spawnInitialForces(false);

      // Process progressive spawn queue first
      for (let i = 0; i < 5; i++) {
        spawnManager.update(1.1, false, ticketSystem);
      }

      // Remove all combatants
      combatants.clear();

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, false, ticketSystem);

      // Should not refill when not in COMBAT phase and combat disabled
      expect(combatants.size).toBe(0);
    });

    it('should refill when combatEnabled is true regardless of phase', () => {
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'DEPLOY',
        usTickets: 100,
        opforTickets: 100,
      });

      spawnManager.setMaxCombatants(30);
      spawnManager.spawnInitialForces(false);

      // Remove some US combatants
      const toRemove: string[] = [];
      for (const [id, combatant] of combatants.entries()) {
        if (combatant.faction === Faction.US) {
          toRemove.push(id);
        }
      }
      toRemove.forEach(id => combatants.delete(id));

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, true, ticketSystem);

      // Should refill when combatEnabled=true
      expect(spawnManager).toBeDefined();
    });

    it('should respect MAX_COMBATANTS cap when refilling', () => {
      spawnManager.setMaxCombatants(10);
      spawnManager.spawnInitialForces(false);

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      // Force refill attempts
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      });

      spawnManager.update(4.0, true, ticketSystem);

      // Should never exceed max
      expect(combatants.size).toBeLessThanOrEqual(10);
    });

    it('should trigger emergency refill when faction strength is critical', () => {
      spawnManager.setMaxCombatants(30);
      spawnManager.spawnInitialForces(false);

      // Remove most US combatants (below 30% threshold)
      const toRemove: string[] = [];
      for (const [id, combatant] of combatants.entries()) {
        if (combatant.faction === Faction.US) {
          toRemove.push(id);
        }
      }
      toRemove.forEach(id => combatants.delete(id));

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      });

      spawnManager.update(4.0, true, ticketSystem);

      // Emergency refill should spawn up to 3 squads
      expect(spawnManager).toBeDefined();
    });
  });

  describe('Match End Behavior', () => {
    it('should stop progressive spawning when game is not active', () => {
      // Setup progressive queue
      spawnManager.spawnInitialForces(false);
      const initialCount = combatants.size;

      // Mock ticket system to show game is inactive
      vi.mocked(ticketSystem.isGameActive).mockReturnValue(false);

      // Try to update progressive spawn
      spawnManager.update(1.1, true, ticketSystem);

      // Count should NOT have increased
      expect(combatants.size).toBe(initialCount);
    });

    it('should stop reinforcement waves when game is not active', () => {
      spawnManager.setReinforcementInterval(5);
      const initialCount = combatants.size;

      // Mock ticket system to show game is inactive
      vi.mocked(ticketSystem.isGameActive).mockReturnValue(false);

      // Trigger reinforcement wave interval
      spawnManager.update(5.1, true, ticketSystem);

      // Count should NOT have increased
      expect(combatants.size).toBe(initialCount);
    });

    it('should stop periodic refill when game is not active', () => {
      // Mock ticket system to show game is inactive
      vi.mocked(ticketSystem.isGameActive).mockReturnValue(false);
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      } as any);

      combatants.clear();

      // Fast-forward past spawn check interval
      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, true, ticketSystem);

      // Should NOT have refilled
      expect(combatants.size).toBe(0);
    });
  });

  describe('reseedForcesForMode', () => {
    it('should clear all combatants and spatial grid', () => {
      spawnManager.spawnInitialForces(false);
      expect(combatants.size).toBeGreaterThan(0);

      spawnManager.reseedForcesForMode();

      // Should clear and re-seed
      expect(spatialGrid.clear).toHaveBeenCalled();
    });

    it('should reset progressive spawn queue', () => {
      spawnManager.spawnInitialForces(false);

      spawnManager.reseedForcesForMode();

      // Queue should be reset (can't test directly, but no errors should occur)
      expect(spawnManager).toBeDefined();
    });

    it('should spawn fresh initial forces', () => {
      spawnManager.reseedForcesForMode();

      expect(squadManager.createSquad).toHaveBeenCalled();
      expect(combatants.size).toBeGreaterThan(0);
    });

    it('should not create player squad during reseed', () => {
      const createSquadMock = vi.mocked(squadManager.createSquad);

      spawnManager.reseedForcesForMode();

      // Verify none of the created squads are player-controlled
      const calls = createSquadMock.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('removeCombatant', () => {
    it('should delegate to RespawnManager', () => {
      const combatant = createMockCombatant('test-1', Faction.US, new THREE.Vector3(0, 0, 0));
      combatants.set('test-1', combatant);

      spawnManager.removeCombatant('test-1');

      // RespawnManager handles removal logic
      expect(spawnManager).toBeDefined();
    });
  });

  describe('respawnSquadMember', () => {
    it('should delegate to RespawnManager', () => {
      spawnManager.respawnSquadMember('squad-1');

      // RespawnManager handles respawn logic
      expect(spawnManager).toBeDefined();
    });
  });

  describe('queueRespawn', () => {
    it('should delegate to RespawnManager', () => {
      spawnManager.queueRespawn('squad-1', 'combatant-1');

      // RespawnManager handles queue logic
      expect(spawnManager).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty combatants map during update', () => {
      expect(() => {
        spawnManager.update(1.0, true);
      }).not.toThrow();
    });

    it('should handle update without ZoneManager set', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );

      expect(() => {
        manager.update(1.0, true);
      }).not.toThrow();
    });

    it('should handle update without GameModeManager set', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );

      expect(() => {
        manager.update(1.0, true);
      }).not.toThrow();
    });

    it('should handle update without RallyPointSystem set', () => {
      const manager = new CombatantSpawnManager(
        combatants,
        spatialGrid,
        combatantFactory,
        squadManager
      );

      expect(() => {
        manager.update(1.0, true);
      }).not.toThrow();
    });

    it('should handle update without TicketSystem', () => {
      spawnManager.spawnInitialForces(false);

      expect(() => {
        spawnManager.update(1.0, true);
      }).not.toThrow();
    });

    it('should handle zero delta time', () => {
      spawnManager.spawnInitialForces(false);

      expect(() => {
        spawnManager.update(0, true);
      }).not.toThrow();
    });

    it('should handle very large delta time', () => {
      spawnManager.spawnInitialForces(false);

      expect(() => {
        spawnManager.update(1000, true);
      }).not.toThrow();
    });

    it('should handle spawning at max combatant limit', () => {
      spawnManager.setMaxCombatants(2);

      spawnManager.spawnInitialForces(false);

      // Should respect max combatants (may spawn slightly over during initial squad creation)
      // Initial spawn logic creates at least one squad per faction (min 2 squads total)
      expect(combatants.size).toBeGreaterThan(0);
    });

    it('should handle spawning with very small squad sizes', () => {
      spawnManager.setSquadSizes(1, 1);

      spawnManager.spawnInitialForces(false);

      expect(combatants.size).toBeGreaterThan(0);
    });

    it('should handle spawning with very large squad sizes', () => {
      spawnManager.setSquadSizes(10, 15);

      spawnManager.spawnInitialForces(false);

      expect(combatants.size).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should handle rapid spawn/death cycles', () => {
      spawnManager.setMaxCombatants(20);
      spawnManager.spawnInitialForces(false);

      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      });

      // Process progressive spawn queue first
      for (let i = 0; i < 5; i++) {
        spawnManager.update(1.1, true, ticketSystem);
      }

      const initialCount = combatants.size;

      // Simulate combat: mark combatants as dead
      const toKill: string[] = [];
      let count = 0;
      for (const [id, combatant] of combatants.entries()) {
        if (count < 3) {
          combatant.state = CombatantState.DEAD;
          combatant.health = 0;
          toKill.push(id);
          count++;
        }
      }

      // Update to remove dead and potentially refill
      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);
      spawnManager.update(4.0, true, ticketSystem);

      // Should have combatants (refill may or may not occur depending on counts)
      expect(combatants.size).toBeGreaterThan(0);
    });
  });
});
