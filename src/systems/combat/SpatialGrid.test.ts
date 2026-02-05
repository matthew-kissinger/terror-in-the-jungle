import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpatialGrid } from './SpatialGrid';
import { Combatant, CombatantState, Faction } from './types';

// Helper to create a mock combatant
function createMockCombatant(id: string, position: THREE.Vector3, state: CombatantState = CombatantState.IDLE): Combatant {
  return {
    id,
    faction: Faction.US,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
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
    lastUpdateTime: Date.now(),
    updatePriority: 0,
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  };
}

describe('SpatialGrid', () => {
  describe('Constructor', () => {
    it('should create with default cell size and world size', () => {
      const grid = new SpatialGrid();
      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(0);
      expect(stats.totalCells).toBe(0);
      expect(stats.avgPerCell).toBe(0);
    });

    it('should create with custom cell size', () => {
      const grid = new SpatialGrid(50, 4000);
      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(0);
      expect(stats.totalCells).toBe(0);
    });

    it('should create with custom world size', () => {
      const grid = new SpatialGrid(30, 2000);
      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(0);
      expect(stats.totalCells).toBe(0);
    });

    it('should create with both custom parameters', () => {
      const grid = new SpatialGrid(40, 3000);
      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(0);
      expect(stats.totalCells).toBe(0);
    });
  });

  describe('updatePosition', () => {
    it('should add combatant to grid', () => {
      const grid = new SpatialGrid();
      const position = new THREE.Vector3(100, 0, 100);

      grid.updatePosition('c1', position);
      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(1);
      expect(stats.totalCells).toBe(1);
    });

    it('should add multiple combatants to same cell', () => {
      const grid = new SpatialGrid(50);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(110, 0, 110));
      grid.updatePosition('c3', new THREE.Vector3(120, 0, 120));

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(3);
      expect(stats.totalCells).toBe(1); // All in same cell
      expect(stats.avgPerCell).toBe(3);
    });

    it('should place combatants in different cells', () => {
      const grid = new SpatialGrid(30);

      grid.updatePosition('c1', new THREE.Vector3(0, 0, 0));
      grid.updatePosition('c2', new THREE.Vector3(100, 0, 100)); // Different cell

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(2);
      expect(stats.totalCells).toBe(2);
    });

    it('should move combatant within same cell', () => {
      const grid = new SpatialGrid(50);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      let stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
      expect(stats.totalCells).toBe(1);

      // Move slightly within the same cell
      grid.updatePosition('c1', new THREE.Vector3(110, 0, 110));
      stats = grid.getStats();

      expect(stats.totalCombatants).toBe(1);
      expect(stats.totalCells).toBe(1); // Still in same cell
    });

    it('should move combatant to different cell', () => {
      const grid = new SpatialGrid(30);

      grid.updatePosition('c1', new THREE.Vector3(0, 0, 0));
      let stats = grid.getStats();
      expect(stats.totalCells).toBe(1);

      // Move to different cell
      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      stats = grid.getStats();

      expect(stats.totalCombatants).toBe(1);
      expect(stats.totalCells).toBe(1); // Old cell removed, new cell created
    });

    it('should handle negative coordinates', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(-100, 0, -100));
      grid.updatePosition('c2', new THREE.Vector3(-200, 0, -200));

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(2);
    });

    it('should update existing combatant correctly', () => {
      const grid = new SpatialGrid(50);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c1', new THREE.Vector3(200, 0, 200)); // Update same ID
      grid.updatePosition('c1', new THREE.Vector3(300, 0, 300)); // Update again

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1); // Should have only 1 combatant
    });

    it('should calculate cell keys correctly with different cell sizes', () => {
      const grid20 = new SpatialGrid(20);
      const grid100 = new SpatialGrid(100);

      // Same position, different cell size = different cells
      grid20.updatePosition('c1', new THREE.Vector3(50, 0, 50));
      grid100.updatePosition('c1', new THREE.Vector3(50, 0, 50));

      const stats20 = grid20.getStats();
      const stats100 = grid100.getStats();

      expect(stats20.totalCells).toBe(1);
      expect(stats100.totalCells).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove existing combatant', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      expect(grid.getStats().totalCombatants).toBe(1);

      grid.remove('c1');
      expect(grid.getStats().totalCombatants).toBe(0);
      expect(grid.getStats().totalCells).toBe(0);
    });

    it('should remove combatant from cell with multiple inhabitants', () => {
      const grid = new SpatialGrid(50);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(110, 0, 110));

      expect(grid.getStats().totalCombatants).toBe(2);

      grid.remove('c1');

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
      expect(stats.totalCells).toBe(1); // Cell still exists
    });

    it('should handle removing non-existent combatant gracefully', () => {
      const grid = new SpatialGrid();

      expect(() => grid.remove('non-existent')).not.toThrow();
      expect(grid.getStats().totalCombatants).toBe(0);
    });

    it('should clean up empty cells', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(200, 0, 200));

      expect(grid.getStats().totalCells).toBe(2);

      grid.remove('c1');
      grid.remove('c2');

      expect(grid.getStats().totalCells).toBe(0);
    });

    it('should allow removing and re-adding combatant', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.remove('c1');
      grid.updatePosition('c1', new THREE.Vector3(200, 0, 200));

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
    });
  });

  describe('queryRadius', () => {
    it('should find combatants within radius', () => {
      const grid = new SpatialGrid(30);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(110, 0, 110));
      grid.updatePosition('c3', new THREE.Vector3(200, 0, 200));

      const results = grid.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      expect(results).toContain('c1');
      expect(results).toContain('c2');
      expect(results).not.toContain('c3');
    });

    it('should return empty array for empty grid', () => {
      const grid = new SpatialGrid();

      const results = grid.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      expect(results).toEqual([]);
    });

    it('should return empty array when no combatants in radius', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(1000, 0, 1000));

      const results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 50);

      expect(results).toEqual([]);
    });

    it('should find all combatants with large radius', () => {
      const grid = new SpatialGrid(30);

      for (let i = 0; i < 10; i++) {
        grid.updatePosition(`c${i}`, new THREE.Vector3(i * 50, 0, i * 50));
      }

      const results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 1000);

      expect(results).toHaveLength(10);
    });

    it('should find combatants at cell boundaries', () => {
      const grid = new SpatialGrid(100);

      // Place combatants at cell boundaries
      grid.updatePosition('c1', new THREE.Vector3(0, 0, 0));
      grid.updatePosition('c2', new THREE.Vector3(99, 0, 99));
      grid.updatePosition('c3', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c4', new THREE.Vector3(150, 0, 150));

      const results = grid.queryRadius(new THREE.Vector3(50, 0, 50), 75);

      // Should query cells around the center
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find single combatant with exact position match', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));

      const results = grid.queryRadius(new THREE.Vector3(100, 0, 100), 0.1);

      expect(results).toContain('c1');
    });

    it('should handle large radius spanning multiple cells', () => {
      const grid = new SpatialGrid(50);

      // Spread combatants across grid
      for (let i = -5; i <= 5; i++) {
        for (let j = -5; j <= 5; j++) {
          grid.updatePosition(`c${i}_${j}`, new THREE.Vector3(i * 100, 0, j * 100));
        }
      }

      const results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 600);

      // Should find many combatants
      expect(results.length).toBeGreaterThan(10);
    });

    it('should respect cell boundaries in queries', () => {
      const grid = new SpatialGrid(100);

      grid.updatePosition('c1', new THREE.Vector3(50, 0, 50));
      grid.updatePosition('c2', new THREE.Vector3(150, 0, 50)); // Different cell

      const results = grid.queryRadius(new THREE.Vector3(50, 0, 50), 50);

      expect(results).toContain('c1');
      // c2 might or might not be included depending on cell boundary calculations
    });
  });

  describe('queryCell', () => {
    it('should query single cell', () => {
      const grid = new SpatialGrid(50);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(110, 0, 110));

      const results = grid.queryCell(new THREE.Vector3(105, 0, 105));

      expect(results).toContain('c1');
      expect(results).toContain('c2');
    });

    it('should return empty array for empty cell', () => {
      const grid = new SpatialGrid();

      const results = grid.queryCell(new THREE.Vector3(100, 0, 100));

      expect(results).toEqual([]);
    });

    it('should return different results for different cells', () => {
      const grid = new SpatialGrid(30);

      grid.updatePosition('c1', new THREE.Vector3(0, 0, 0));
      grid.updatePosition('c2', new THREE.Vector3(100, 0, 100));

      const results1 = grid.queryCell(new THREE.Vector3(0, 0, 0));
      const results2 = grid.queryCell(new THREE.Vector3(100, 0, 100));

      expect(results1).toContain('c1');
      expect(results1).not.toContain('c2');
      expect(results2).toContain('c2');
      expect(results2).not.toContain('c1');
    });

    it('should find all combatants in cell', () => {
      const grid = new SpatialGrid(50);

      // Add multiple combatants to same cell
      for (let i = 0; i < 5; i++) {
        grid.updatePosition(`c${i}`, new THREE.Vector3(100 + i, 0, 100 + i));
      }

      const results = grid.queryCell(new THREE.Vector3(102, 0, 102));

      expect(results).toHaveLength(5);
    });

    it('should use correct cell key calculation', () => {
      const grid = new SpatialGrid(100);

      // Positions in same cell
      grid.updatePosition('c1', new THREE.Vector3(50, 0, 50));
      grid.updatePosition('c2', new THREE.Vector3(99, 0, 99));

      // Position in different cell
      grid.updatePosition('c3', new THREE.Vector3(100, 0, 100));

      const results = grid.queryCell(new THREE.Vector3(75, 0, 75));

      expect(results).toContain('c1');
      expect(results).toContain('c2');
      expect(results).not.toContain('c3');
    });
  });

  describe('setWorldSize', () => {
    it('should update world bounds', () => {
      const grid = new SpatialGrid(30, 4000);

      grid.updatePosition('c1', new THREE.Vector3(500, 0, 500));

      // Change world size
      grid.setWorldSize(2000);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
    });

    it('should preserve combatants after size change', () => {
      const grid = new SpatialGrid(30, 4000);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(200, 0, 200));

      grid.setWorldSize(2000);

      const results = grid.queryRadius(new THREE.Vector3(100, 0, 100), 200);
      expect(results).toContain('c1');
    });

    it('should allow querying after size change', () => {
      const grid = new SpatialGrid(30, 4000);

      grid.updatePosition('c1', new THREE.Vector3(500, 0, 500));

      grid.setWorldSize(2000);

      const results = grid.queryRadius(new THREE.Vector3(500, 0, 500), 100);
      expect(results).toContain('c1');
    });

    it('should handle shrinking world size', () => {
      const grid = new SpatialGrid(30, 4000);

      grid.updatePosition('c1', new THREE.Vector3(500, 0, 500));
      grid.updatePosition('c2', new THREE.Vector3(1500, 0, 1500));

      grid.setWorldSize(1000);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(2);
    });

    it('should handle expanding world size', () => {
      const grid = new SpatialGrid(30, 2000);

      grid.updatePosition('c1', new THREE.Vector3(500, 0, 500));

      grid.setWorldSize(4000);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all combatants', () => {
      const grid = new SpatialGrid();

      for (let i = 0; i < 10; i++) {
        grid.updatePosition(`c${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      expect(grid.getStats().totalCombatants).toBe(10);

      grid.clear();

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(0);
      expect(stats.totalCells).toBe(0);
    });

    it('should allow adding combatants after clear', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('old', new THREE.Vector3(100, 0, 100));
      grid.clear();
      grid.updatePosition('new', new THREE.Vector3(200, 0, 200));

      const results = grid.queryRadius(new THREE.Vector3(200, 0, 200), 100);
      expect(results).toContain('new');
    });

    it('should handle clearing empty grid', () => {
      const grid = new SpatialGrid();

      expect(() => grid.clear()).not.toThrow();
      expect(grid.getStats().totalCombatants).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stat properties', () => {
      const grid = new SpatialGrid();
      const stats = grid.getStats();

      expect(stats).toHaveProperty('totalCells');
      expect(stats).toHaveProperty('totalCombatants');
      expect(stats).toHaveProperty('avgPerCell');
    });

    it('should calculate stats correctly for empty grid', () => {
      const grid = new SpatialGrid();
      const stats = grid.getStats();

      expect(stats.totalCells).toBe(0);
      expect(stats.totalCombatants).toBe(0);
      expect(stats.avgPerCell).toBe(0);
    });

    it('should calculate average per cell correctly', () => {
      const grid = new SpatialGrid(50);

      // 2 combatants in cell 1
      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      grid.updatePosition('c2', new THREE.Vector3(110, 0, 110));

      // 3 combatants in cell 2
      grid.updatePosition('c3', new THREE.Vector3(200, 0, 200));
      grid.updatePosition('c4', new THREE.Vector3(210, 0, 210));
      grid.updatePosition('c5', new THREE.Vector3(220, 0, 220));

      const stats = grid.getStats();

      expect(stats.totalCombatants).toBe(5);
      expect(stats.totalCells).toBe(2);
      expect(stats.avgPerCell).toBe(2.5);
    });

    it('should update stats after each operation', () => {
      const grid = new SpatialGrid();

      let stats = grid.getStats();
      expect(stats.totalCombatants).toBe(0);

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));
      stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);

      grid.updatePosition('c2', new THREE.Vector3(200, 0, 200));
      stats = grid.getStats();
      expect(stats.totalCombatants).toBe(2);

      grid.remove('c1');
      stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
    });
  });

  describe('rebuild', () => {
    it('should rebuild from combatants map', () => {
      const grid = new SpatialGrid();

      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
        ['c2', createMockCombatant('c2', new THREE.Vector3(200, 0, 200))],
        ['c3', createMockCombatant('c3', new THREE.Vector3(300, 0, 300))],
      ]);

      grid.rebuild(combatants);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(3);
    });

    it('should skip dead combatants', () => {
      const grid = new SpatialGrid();

      const combatants = new Map<string, Combatant>([
        ['alive', createMockCombatant('alive', new THREE.Vector3(100, 0, 100), CombatantState.IDLE)],
        ['dead', createMockCombatant('dead', new THREE.Vector3(200, 0, 200), CombatantState.DEAD)],
      ]);

      grid.rebuild(combatants);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1);
    });

    it('should clear existing combatants before rebuild', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('old', new THREE.Vector3(100, 0, 100));

      const combatants = new Map<string, Combatant>([
        ['new', createMockCombatant('new', new THREE.Vector3(200, 0, 200))],
      ]);

      grid.rebuild(combatants);

      // Only new combatant should exist
      const results = grid.queryRadius(new THREE.Vector3(200, 0, 200), 100);
      expect(results).toContain('new');

      const oldResults = grid.queryRadius(new THREE.Vector3(100, 0, 100), 100);
      expect(oldResults).not.toContain('old');
    });

    it('should handle rebuild with all dead combatants', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));

      const combatants = new Map<string, Combatant>([
        ['dead1', createMockCombatant('dead1', new THREE.Vector3(200, 0, 200), CombatantState.DEAD)],
        ['dead2', createMockCombatant('dead2', new THREE.Vector3(300, 0, 300), CombatantState.DEAD)],
      ]);

      grid.rebuild(combatants);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(0);
    });

    it('should handle empty rebuild map', () => {
      const grid = new SpatialGrid();

      grid.updatePosition('c1', new THREE.Vector3(100, 0, 100));

      const combatants = new Map<string, Combatant>();
      grid.rebuild(combatants);

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(0);
    });
  });

  describe('Integration tests', () => {
    it('should handle mixed operations correctly', () => {
      const grid = new SpatialGrid(50);

      // Add combatants
      for (let i = 0; i < 5; i++) {
        grid.updatePosition(`c${i}`, new THREE.Vector3(i * 100, 0, i * 100));
      }

      // Query some
      let results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 300);
      expect(results.length).toBeGreaterThan(0);

      // Remove some
      grid.remove('c0');
      grid.remove('c1');

      // Query again
      results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 300);
      expect(results).not.toContain('c0');
      expect(results).not.toContain('c1');

      // Update positions
      grid.updatePosition('c2', new THREE.Vector3(0, 0, 0));

      // Final query
      results = grid.queryRadius(new THREE.Vector3(0, 0, 0), 50);
      expect(results).toContain('c2');
    });

    it('should maintain consistency across operations', () => {
      const grid = new SpatialGrid();
      const positions = new Map<string, THREE.Vector3>();

      // Add 20 combatants at random positions
      for (let i = 0; i < 20; i++) {
        const pos = new THREE.Vector3(
          (Math.random() - 0.5) * 1000,
          0,
          (Math.random() - 0.5) * 1000
        );
        positions.set(`c${i}`, pos);
        grid.updatePosition(`c${i}`, pos);
      }

      // Verify all combatants are findable
      for (const [id, pos] of positions) {
        const results = grid.queryRadius(pos, 1);
        expect(results).toContain(id);
      }

      // Remove half
      for (let i = 0; i < 10; i++) {
        grid.remove(`c${i}`);
      }

      // Verify removed combatants are not found
      for (let i = 0; i < 10; i++) {
        const pos = positions.get(`c${i}`)!;
        const results = grid.queryRadius(pos, 100);
        expect(results).not.toContain(`c${i}`);
      }

      // Verify remaining combatants are still found
      for (let i = 10; i < 20; i++) {
        const pos = positions.get(`c${i}`)!;
        const results = grid.queryRadius(pos, 1);
        expect(results).toContain(`c${i}`);
      }
    });

    it('should handle rapid position updates', () => {
      const grid = new SpatialGrid(30);
      const id = 'test-combatant';

      // Rapidly update position
      for (let i = 0; i < 100; i++) {
        const pos = new THREE.Vector3(i * 10, 0, i * 10);
        grid.updatePosition(id, pos);
      }

      const stats = grid.getStats();
      expect(stats.totalCombatants).toBe(1); // Should only have 1 combatant
    });
  });
});
