import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AICoverFinding } from './AICoverFinding';
import { Combatant, CombatantState, Faction } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';

const mockChunkManager: ImprovedChunkManager = {
  raycastTerrain: vi.fn(() => ({ hit: false, distance: undefined })),
} as any;

const mockSandbagSystem: SandbagSystem = {
  getSandbagBounds: vi.fn(() => []),
} as any;

const mockHeightQueryCache = {
  getHeightAt: vi.fn((_x: number, _z: number) => 0),
};

vi.mock('../../terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => mockHeightQueryCache,
}));

function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  health: number = 100,
  state: CombatantState = CombatantState.IDLE,
  inCover: boolean = false,
  coverPosition?: THREE.Vector3
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
    target: undefined,
    lastKnownTargetPos: undefined,
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
    inCover,
    coverPosition,
    mesh: { position: position.clone() } as any,
  } as Combatant;
}

function makeSandbagBounds(center: THREE.Vector3, size = new THREE.Vector3(2, 2, 2)): THREE.Box3 {
  const half = size.clone().multiplyScalar(0.5);
  return new THREE.Box3(center.clone().sub(half), center.clone().add(half));
}

describe('AICoverFinding', () => {
  let coverFinding: AICoverFinding;

  beforeEach(() => {
    coverFinding = new AICoverFinding();
    coverFinding.setChunkManager(mockChunkManager);
    coverFinding.setSandbagSystem(mockSandbagSystem);

    vi.clearAllMocks();
    mockHeightQueryCache.getHeightAt = vi.fn(() => 0);
    (mockChunkManager.raycastTerrain as any).mockImplementation(() => ({ hit: false, distance: undefined }));
    (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([]);
  });

  describe('findNearestCover', () => {
    it('returns null when no systems are set', () => {
      const system = new AICoverFinding();
      const combatant = createMockCombatant('c1', Faction.US);
      const threatPos = new THREE.Vector3(10, 0, 0);

      const cover = system.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('returns null when no cover is available', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(20, 0, 0);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('finds sandbag cover when ray intersects sandbag bounds', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(10, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(5, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeCloseTo(3, 3);
        expect(cover.z).toBeCloseTo(0, 3);
      }
    });

    it('finds sandbag cover without a chunk manager set', () => {
      const system = new AICoverFinding();
      system.setSandbagSystem(mockSandbagSystem);
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(10, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(5, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      const cover = system.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
    });

    it('skips sandbag cover beyond search radius', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(60, 0, 0);
      const farSandbag = makeSandbagBounds(new THREE.Vector3(40, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([farSandbag]);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('positions sandbag cover two units behind the sandbag relative to the threat', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(20, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(10, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeCloseTo(8, 2);
        expect(cover.z).toBeCloseTo(0, 2);
      }
    });

    it('skips sandbag cover when the sandbag is too short to block line of sight', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(10, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(5, 0, 0), new THREE.Vector3(2, 1, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('prefers the closer of multiple valid sandbag covers', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(20, 0, 0);
      const nearSandbag = makeSandbagBounds(new THREE.Vector3(6, 0, 0), new THREE.Vector3(2, 4, 2));
      const farSandbag = makeSandbagBounds(new THREE.Vector3(16, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([farSandbag, nearSandbag]);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeLessThan(10);
      }
    });

    it('returns terrain cover when elevation and raycast indicate blocking terrain', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 9 && x <= 11) return 1.2;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation((_origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => ({
        hit: true,
        distance: maxDistance - 2,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeCloseTo(10, 1);
        expect(cover.y).toBeCloseTo(1.2, 2);
      }
    });

    it('returns null when terrain height difference is insufficient', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 9 && x <= 11) return 0.8;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation(() => ({
        hit: true,
        distance: 10,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('returns null when terrain raycast does not hit', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 9 && x <= 11) return 1.4;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation(() => ({
        hit: false,
        distance: undefined,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('prefers higher-scored terrain even if farther away', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(50, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 9 && x <= 11) return 1.2;
        if (x >= 19 && x <= 21) return 3.0;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation((_origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => ({
        hit: true,
        distance: maxDistance - 2,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeCloseTo(20, 1);
      }
    });

    it('returns null when only terrain beyond search radius has elevation', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(80, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 39 && x <= 41) return 2.5;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation((_origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => ({
        hit: true,
        distance: maxDistance - 2,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });

    it('finds vegetation cover based on height variation', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number, z: number) => {
        if (x >= 4 && x <= 6 && Math.abs(z) <= 1) return 2;
        return 0;
      });

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeLessThan(6);
      }
    });

    it('finds vegetation cover based on elevation alone', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(-30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number, z: number) => {
        if (x >= -6 && x <= -4 && Math.abs(z) <= 1) return 2;
        return 0;
      });

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeLessThan(0);
      }
    });

    it('prefers nearer vegetation cover when multiple are available', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number, z: number) => {
        if ((x >= 4 && x <= 6 && Math.abs(z) <= 1) || (x >= 14 && x <= 16 && Math.abs(z) <= 1)) return 2;
        return 0;
      });

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeLessThan(10);
      }
    });

    it('does not raycast terrain when height difference is below threshold', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(30, 0, 0);

      mockHeightQueryCache.getHeightAt = vi.fn(() => 0.6);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
      expect(mockChunkManager.raycastTerrain).not.toHaveBeenCalled();
    });

    it('prefers sandbag cover when it scores higher than terrain', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(25, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(8, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 19 && x <= 21) return 1.2;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation((_origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => ({
        hit: true,
        distance: maxDistance - 2,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeLessThan(10);
      }
    });

    it('prefers terrain cover when sandbag is far and terrain scores higher', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(35, 0, 0);
      const sandbag = makeSandbagBounds(new THREE.Vector3(25, 0, 0), new THREE.Vector3(2, 4, 2));
      (mockSandbagSystem.getSandbagBounds as any).mockReturnValue([sandbag]);

      mockHeightQueryCache.getHeightAt = vi.fn((x: number) => {
        if (x >= 8 && x <= 12) return 1.4;
        return 0;
      });

      (mockChunkManager.raycastTerrain as any).mockImplementation((_origin: THREE.Vector3, _dir: THREE.Vector3, maxDistance: number) => ({
        hit: true,
        distance: maxDistance - 2,
      }));

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).not.toBeNull();
      if (cover) {
        expect(cover.x).toBeCloseTo(10, 1);
      }
    });

    it('returns null when combatant and threat are at the same position', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(0, 0, 0);

      const cover = coverFinding.findNearestCover(combatant, threatPos);

      expect(cover).toBeNull();
    });
  });

  describe('isCoverFlanked', () => {
    it('returns true when no cover position is set', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0));
      const threatPos = new THREE.Vector3(10, 0, 0);

      const flanked = coverFinding.isCoverFlanked(combatant, threatPos);

      expect(flanked).toBe(true);
    });

    it('returns true when threat is on the same side as the combatant relative to cover', () => {
      const coverPos = new THREE.Vector3(5, 0, 0);
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), 100, CombatantState.IDLE, false, coverPos);
      const threatPos = new THREE.Vector3(-10, 0, 0);

      const flanked = coverFinding.isCoverFlanked(combatant, threatPos);

      expect(flanked).toBe(true);
    });

    it('returns false when cover sits between threat and combatant', () => {
      const coverPos = new THREE.Vector3(5, 0, 0);
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0), 100, CombatantState.IDLE, false, coverPos);
      const threatPos = new THREE.Vector3(12, 0, 0);

      const flanked = coverFinding.isCoverFlanked(combatant, threatPos);

      expect(flanked).toBe(false);
    });

    it('treats dot product at or below the threshold as not flanked', () => {
      const coverPos = new THREE.Vector3(0, 0, 0);
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(1, 0, 0), 100, CombatantState.IDLE, false, coverPos);
      const threatPos = new THREE.Vector3(0.299, 0, 0.954253);

      const flanked = coverFinding.isCoverFlanked(combatant, threatPos);

      expect(flanked).toBe(false);
    });

    it('returns true when dot product is slightly above the flank threshold', () => {
      const coverPos = new THREE.Vector3(0, 0, 0);
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(1, 0, 0), 100, CombatantState.IDLE, false, coverPos);
      const threatPos = new THREE.Vector3(0.31, 0, 0.950736);

      const flanked = coverFinding.isCoverFlanked(combatant, threatPos);

      expect(flanked).toBe(true);
    });
  });
});
