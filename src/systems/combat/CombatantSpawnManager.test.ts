import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { Combatant, CombatantState, Faction } from './types';
import { CombatantFactory } from './CombatantFactory';
import { SquadManager } from './SquadManager';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { RallyPointSystem } from './RallyPointSystem';
import { TicketSystem } from '../world/TicketSystem';
import { spatialGridManager } from './SpatialGridManager';

vi.mock('./SpatialGridManager', () => ({
  spatialGridManager: {
    syncEntity: vi.fn(),
    removeEntity: vi.fn(),
    getOctreeStats: vi.fn(() => ({
      totalNodes: 10,
      totalEntities: 20,
      maxDepth: 3,
    })),
    clear: vi.fn(),
  },
}));

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
  let combatantFactory: CombatantFactory;
  let squadManager: SquadManager;
  let zoneManager: ZoneManager;
  let gameModeManager: GameModeManager;
  let rallyPointSystem: RallyPointSystem;
  let ticketSystem: TicketSystem;

  beforeEach(() => {
    combatants = new Map();
    combatantFactory = createMockCombatantFactory();
    squadManager = createMockSquadManager();
    zoneManager = createMockZoneManager();
    gameModeManager = createMockGameModeManager();
    rallyPointSystem = createMockRallyPointSystem();
    ticketSystem = createMockTicketSystem();
    vi.mocked(spatialGridManager.syncEntity).mockClear();
    vi.mocked(spatialGridManager.removeEntity).mockClear();
    vi.mocked(spatialGridManager.getOctreeStats).mockClear();
    vi.mocked(spatialGridManager.clear).mockClear();

    spawnManager = new CombatantSpawnManager(
      combatants,
      combatantFactory,
      squadManager
    );

    spawnManager.setZoneManager(zoneManager);
    spawnManager.setGameModeManager(gameModeManager);
    spawnManager.setRallyPointSystem(rallyPointSystem);
  });

  describe('spawnInitialForces', () => {
    it('spawns squads for both factions and populates combatants + spatial grid', () => {
      spawnManager.spawnInitialForces(false);

      expect(squadManager.createSquad).toHaveBeenCalled();
      expect(combatants.size).toBeGreaterThan(0);
      expect(spatialGridManager.syncEntity).toHaveBeenCalled();
    });

    it('returns a player squad id only when requested', () => {
      const idNoPlayer = spawnManager.spawnInitialForces(false);
      expect(idNoPlayer).toBeUndefined();

      // Fresh manager
      const freshCombatants = new Map<string, Combatant>();
      const freshManager = new CombatantSpawnManager(freshCombatants, combatantFactory, squadManager);
      freshManager.setGameModeManager(gameModeManager);
      const idWithPlayer = freshManager.spawnInitialForces(true);
      expect(idWithPlayer).toBeDefined();
    });

    it('continues spawning OPFOR squads even when a player squad is requested', () => {
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
          { id: 'us_base', name: 'US Base', position: new THREE.Vector3(-100, 0, -100), radius: 30, owner: Faction.US, isHomeBase: true },
          { id: 'opfor_base', name: 'OPFOR Base', position: new THREE.Vector3(100, 0, 100), radius: 30, owner: Faction.NVA, isHomeBase: true },
        ],
      };
      vi.mocked(gameModeManager.getCurrentConfig).mockReturnValue(mockConfig as any);

      spawnManager.spawnInitialForces(true);

      const opforCalls = vi.mocked(squadManager.createSquad).mock.calls.filter(c => c[0] === Faction.NVA);
      expect(opforCalls.length).toBeGreaterThan(0);
    });

    it('spreads initial large-mode squads across multiple HQ anchors', () => {
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
    it('spawns requested squad size into the combatants map', () => {
      spawnManager.spawnSquad(Faction.US, new THREE.Vector3(10, 0, 10), 4);
      expect(combatants.size).toBe(4);

      // Second call is OPFOR - member ids overlap with the mock factory's placeholder ids,
      // but squadManager.createSquad is the only invariant we rely on here.
      spawnManager.spawnSquad(Faction.NVA, new THREE.Vector3(-10, 0, -10), 3);
      expect(squadManager.createSquad).toHaveBeenCalledWith(Faction.NVA, expect.any(Object), 3);
    });

    it('syncs every squad member into the spatial grid', () => {
      spawnManager.spawnSquad(Faction.US, new THREE.Vector3(10, 0, 10), 4);
      expect(spatialGridManager.syncEntity).toHaveBeenCalledTimes(4);
    });
  });

  describe('progressive spawn queue', () => {
    it('drains the queue over time and eventually stops spawning', () => {
      spawnManager.spawnInitialForces(false);
      const initialCount = combatants.size;

      // Drain the queue
      for (let i = 0; i < 6; i++) {
        spawnManager.update(1.1, true);
      }

      const drainedCount = combatants.size;
      expect(drainedCount).toBeGreaterThanOrEqual(initialCount);

      // Further updates should not grow the count
      spawnManager.update(1.1, true);
      expect(combatants.size).toBe(drainedCount);
    });
  });

  describe('reinforcement / refill policy', () => {
    it('does not refill during non-COMBAT phase when combat is disabled', () => {
      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'DEPLOY',
        usTickets: 100,
        opforTickets: 100,
      } as any);

      spawnManager.spawnInitialForces(false);
      for (let i = 0; i < 5; i++) {
        spawnManager.update(1.1, false, ticketSystem);
      }
      combatants.clear();

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, false, ticketSystem);

      expect(combatants.size).toBe(0);
    });

    it('respects the max-combatants cap when refilling', () => {
      spawnManager.setMaxCombatants(10);
      spawnManager.spawnInitialForces(false);

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      vi.mocked(ticketSystem.getGameState).mockReturnValue({
        phase: 'COMBAT',
        usTickets: 100,
        opforTickets: 100,
      } as any);

      spawnManager.update(4.0, true, ticketSystem);

      expect(combatants.size).toBeLessThanOrEqual(10);
    });

    it('removes dead combatants during the periodic spawn check', () => {
      const deadCombatant = createMockCombatant('dead-1', Faction.US, new THREE.Vector3(0, 0, 0), CombatantState.DEAD, 0);
      combatants.set('dead-1', deadCombatant);

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);

      spawnManager.update(4.0, true);

      expect(combatants.has('dead-1')).toBe(false);
    });
  });

  describe('match end behavior', () => {
    it('halts all spawn channels when ticket system reports game inactive', () => {
      spawnManager.spawnInitialForces(false);
      const initialCount = combatants.size;

      vi.mocked(ticketSystem.isGameActive).mockReturnValue(false);

      spawnManager.update(1.1, true, ticketSystem);
      spawnManager.update(5.1, true, ticketSystem);

      const futureDate = Date.now() + 4000;
      vi.spyOn(Date, 'now').mockReturnValue(futureDate);
      combatants.clear();
      spawnManager.update(4.0, true, ticketSystem);

      // Initial size captured before clearing matters for the first two calls;
      // for the periodic refill path we verify no new combatants are spawned.
      expect(initialCount).toBeGreaterThan(0);
      expect(combatants.size).toBe(0);
    });
  });

  describe('reseedForcesForMode', () => {
    it('clears the spatial grid and re-seeds combatants', () => {
      spawnManager.spawnInitialForces(false);
      expect(combatants.size).toBeGreaterThan(0);

      spawnManager.reseedForcesForMode();

      expect(spatialGridManager.clear).toHaveBeenCalled();
      expect(combatants.size).toBeGreaterThan(0);
    });
  });

  describe('robustness', () => {
    it('does not throw when optional managers are unset', () => {
      const manager = new CombatantSpawnManager(
        new Map<string, Combatant>(),
        combatantFactory,
        squadManager
      );
      expect(() => manager.update(1.0, true)).not.toThrow();
    });

    it('tolerates pathological delta times', () => {
      spawnManager.spawnInitialForces(false);
      expect(() => spawnManager.update(0, true)).not.toThrow();
      expect(() => spawnManager.update(1000, true)).not.toThrow();
    });
  });
});
