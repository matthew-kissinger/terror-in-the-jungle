import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { InfluenceMapGrid } from './InfluenceMapGrid';

describe('InfluenceMapGrid', () => {
  describe('initializeGrid', () => {
    it('should create grid with correct dimensions', () => {
      const gridSize = 20;
      const worldSize = 400;
      const worldOffset = new THREE.Vector2(-200, -200);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      expect(grid).toHaveLength(gridSize);
      for (let x = 0; x < gridSize; x++) {
        expect(grid[x]).toHaveLength(gridSize);
      }
    });

    it('should initialize all cells with zero values', () => {
      const gridSize = 10;
      const worldSize = 200;
      const worldOffset = new THREE.Vector2(-100, -100);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          const cell = grid[x][z];
          expect(cell.threatLevel).toBe(0);
          expect(cell.opportunityLevel).toBe(0);
          expect(cell.coverValue).toBe(0);
          expect(cell.squadSupport).toBe(0);
          expect(cell.combinedScore).toBe(0);
        }
      }
    });

    it('should calculate correct cell positions based on worldOffset and cellSize', () => {
      const gridSize = 4;
      const worldSize = 40;
      const worldOffset = new THREE.Vector2(0, 0);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      const cellSize = worldSize / gridSize; // 10

      // Test corner cells
      expect(grid[0][0].position.x).toBe(0);
      expect(grid[0][0].position.y).toBe(0);

      expect(grid[1][0].position.x).toBe(cellSize);
      expect(grid[1][0].position.y).toBe(0);

      expect(grid[0][1].position.x).toBe(0);
      expect(grid[0][1].position.y).toBe(cellSize);

      expect(grid[3][3].position.x).toBe(3 * cellSize);
      expect(grid[3][3].position.y).toBe(3 * cellSize);
    });

    it('should apply world offset to cell positions', () => {
      const gridSize = 4;
      const worldSize = 40;
      const worldOffset = new THREE.Vector2(100, 200);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      const cellSize = worldSize / gridSize; // 10

      // Positions should be offset by worldOffset
      expect(grid[0][0].position.x).toBe(100);
      expect(grid[0][0].position.y).toBe(200);

      expect(grid[1][0].position.x).toBe(100 + cellSize);
      expect(grid[1][0].position.y).toBe(200);

      expect(grid[2][3].position.x).toBe(100 + 2 * cellSize);
      expect(grid[2][3].position.y).toBe(200 + 3 * cellSize);
    });

    it('should handle negative world offset', () => {
      const gridSize = 4;
      const worldSize = 40;
      const worldOffset = new THREE.Vector2(-200, -300);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      const cellSize = worldSize / gridSize;

      expect(grid[0][0].position.x).toBe(-200);
      expect(grid[0][0].position.y).toBe(-300);

      expect(grid[1][0].position.x).toBe(-200 + cellSize);
      expect(grid[1][0].position.y).toBe(-300);
    });

    it('should create unique Vector2 instances for each cell', () => {
      const gridSize = 2;
      const worldSize = 20;
      const worldOffset = new THREE.Vector2(0, 0);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      const pos1 = grid[0][0].position;
      const pos2 = grid[0][1].position;
      const pos3 = grid[1][0].position;

      expect(pos1).not.toBe(pos2);
      expect(pos1).not.toBe(pos3);
      expect(pos2).not.toBe(pos3);
    });
  });

  describe('getCellBounds', () => {
    const gridSize = 20;
    const worldSize = 400;
    const cellSize = worldSize / gridSize; // 20
    const worldOffset = new THREE.Vector2(-200, -200);

    it('should return correct bounds for center position', () => {
      // Center of grid at (0, 0) maps to grid cell [10][10]
      const bounds = InfluenceMapGrid.getCellBounds(
        0, // centerX (world position)
        0, // centerZ (world position)
        10, // radius
        gridSize,
        cellSize,
        worldOffset
      );

      expect(bounds.minX).toBeLessThanOrEqual(10);
      expect(bounds.maxX).toBeGreaterThanOrEqual(10);
      expect(bounds.minZ).toBeLessThanOrEqual(10);
      expect(bounds.maxZ).toBeGreaterThanOrEqual(10);
    });

    it('should clamp bounds to grid boundaries', () => {
      // Far outside grid, should clamp to valid range
      const bounds = InfluenceMapGrid.getCellBounds(
        -300, // Far left
        -300, // Far top
        100, // Large radius
        gridSize,
        cellSize,
        worldOffset
      );

      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(gridSize - 1);
      expect(bounds.minZ).toBeGreaterThanOrEqual(0);
      expect(bounds.maxZ).toBeLessThanOrEqual(gridSize - 1);
    });

    it('should clamp upper boundary correctly', () => {
      // Far right/bottom of grid
      const bounds = InfluenceMapGrid.getCellBounds(
        200, // Far right
        200, // Far bottom
        100, // Large radius
        gridSize,
        cellSize,
        worldOffset
      );

      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(gridSize - 1);
      expect(bounds.minZ).toBeGreaterThanOrEqual(0);
      expect(bounds.maxZ).toBeLessThanOrEqual(gridSize - 1);
    });

    it('should handle zero radius', () => {
      const bounds = InfluenceMapGrid.getCellBounds(
        0, // center
        0, // center
        0, // zero radius
        gridSize,
        cellSize,
        worldOffset
      );

      // Should still contain the center cell
      expect(bounds.minX).toBeLessThanOrEqual(10);
      expect(bounds.maxX).toBeGreaterThanOrEqual(10);
      expect(bounds.minZ).toBeLessThanOrEqual(10);
      expect(bounds.maxZ).toBeGreaterThanOrEqual(10);
    });

    it('should handle small radius properly', () => {
      const bounds = InfluenceMapGrid.getCellBounds(
        0, // center at grid center
        0,
        5, // small radius
        gridSize,
        cellSize,
        worldOffset
      );

      // minX <= 10 <= maxX
      expect(bounds.minX).toBeLessThanOrEqual(10);
      expect(bounds.maxX).toBeGreaterThanOrEqual(10);
      expect(bounds.maxX - bounds.minX).toBeLessThan(gridSize);
    });

    it('should expand bounds with larger radius', () => {
      const smallBounds = InfluenceMapGrid.getCellBounds(0, 0, 5, gridSize, cellSize, worldOffset);
      const largeBounds = InfluenceMapGrid.getCellBounds(0, 0, 50, gridSize, cellSize, worldOffset);

      const smallArea = (smallBounds.maxX - smallBounds.minX) * (smallBounds.maxZ - smallBounds.minZ);
      const largeArea = (largeBounds.maxX - largeBounds.minX) * (largeBounds.maxZ - largeBounds.minZ);

      expect(largeArea).toBeGreaterThan(smallArea);
    });

    it('should handle negative world positions', () => {
      const bounds = InfluenceMapGrid.getCellBounds(
        -100, // Negative world position
        -100,
        10,
        gridSize,
        cellSize,
        worldOffset
      );

      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(gridSize - 1);
      expect(bounds.minZ).toBeGreaterThanOrEqual(0);
      expect(bounds.maxZ).toBeLessThanOrEqual(gridSize - 1);
    });

    it('should return bounds with minX <= maxX and minZ <= maxZ', () => {
      const testCases = [
        { centerX: 0, centerZ: 0, radius: 10 },
        { centerX: 100, centerZ: 100, radius: 20 },
        { centerX: -150, centerZ: -150, radius: 30 },
        { centerX: 180, centerZ: 180, radius: 50 }
      ];

      testCases.forEach((testCase) => {
        const bounds = InfluenceMapGrid.getCellBounds(
          testCase.centerX,
          testCase.centerZ,
          testCase.radius,
          gridSize,
          cellSize,
          worldOffset
        );

        expect(bounds.minX).toBeLessThanOrEqual(bounds.maxX);
        expect(bounds.minZ).toBeLessThanOrEqual(bounds.maxZ);
      });
    });
  });

  describe('resetGrid', () => {
    it('should reset all values to zero', () => {
      const gridSize = 10;
      const worldSize = 200;
      const worldOffset = new THREE.Vector2(-100, -100);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      // Set non-zero values
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          grid[x][z].threatLevel = 0.5;
          grid[x][z].opportunityLevel = 0.7;
          grid[x][z].coverValue = 0.3;
          grid[x][z].squadSupport = 0.8;
          grid[x][z].combinedScore = 0.6;
        }
      }

      // Reset grid
      InfluenceMapGrid.resetGrid(grid, gridSize);

      // All values should be zero
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          const cell = grid[x][z];
          expect(cell.threatLevel).toBe(0);
          expect(cell.opportunityLevel).toBe(0);
          expect(cell.coverValue).toBe(0);
          expect(cell.squadSupport).toBe(0);
          expect(cell.combinedScore).toBe(0);
        }
      }
    });

    it('should preserve cell position vectors', () => {
      const gridSize = 5;
      const worldSize = 100;
      const worldOffset = new THREE.Vector2(50, 50);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      // Store original positions
      const originalPositions: THREE.Vector2[] = [];
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          originalPositions.push(grid[x][z].position.clone());
        }
      }

      // Set values and reset
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          grid[x][z].threatLevel = 0.9;
          grid[x][z].opportunityLevel = 0.4;
          grid[x][z].coverValue = 0.5;
          grid[x][z].squadSupport = 0.2;
          grid[x][z].combinedScore = 0.6;
        }
      }

      InfluenceMapGrid.resetGrid(grid, gridSize);

      // Verify positions unchanged
      let index = 0;
      for (let x = 0; x < gridSize; x++) {
        for (let z = 0; z < gridSize; z++) {
          const cell = grid[x][z];
          expect(cell.position.x).toBe(originalPositions[index].x);
          expect(cell.position.y).toBe(originalPositions[index].y);
          index++;
        }
      }
    });

    it('should handle partial grid reset', () => {
      const gridSize = 8;
      const worldSize = 160;
      const worldOffset = new THREE.Vector2(0, 0);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      // Set only some cells to non-zero
      grid[0][0].threatLevel = 1.0;
      grid[gridSize - 1][gridSize - 1].opportunityLevel = 0.8;
      grid[4][4].coverValue = 0.6;

      InfluenceMapGrid.resetGrid(grid, gridSize);

      expect(grid[0][0].threatLevel).toBe(0);
      expect(grid[gridSize - 1][gridSize - 1].opportunityLevel).toBe(0);
      expect(grid[4][4].coverValue).toBe(0);
    });

    it('should reset grid with variable gridSize parameter', () => {
      const fullGridSize = 20;
      const worldSize = 400;
      const worldOffset = new THREE.Vector2(-200, -200);

      const grid = InfluenceMapGrid.initializeGrid(fullGridSize, worldSize, worldOffset);

      // Set all values
      for (let x = 0; x < fullGridSize; x++) {
        for (let z = 0; z < fullGridSize; z++) {
          grid[x][z].threatLevel = 0.5;
          grid[x][z].opportunityLevel = 0.5;
          grid[x][z].coverValue = 0.5;
          grid[x][z].squadSupport = 0.5;
          grid[x][z].combinedScore = 0.5;
        }
      }

      // Reset with correct gridSize
      InfluenceMapGrid.resetGrid(grid, fullGridSize);

      // Verify all reset
      for (let x = 0; x < fullGridSize; x++) {
        for (let z = 0; z < fullGridSize; z++) {
          expect(grid[x][z].threatLevel).toBe(0);
          expect(grid[x][z].opportunityLevel).toBe(0);
          expect(grid[x][z].coverValue).toBe(0);
          expect(grid[x][z].squadSupport).toBe(0);
          expect(grid[x][z].combinedScore).toBe(0);
        }
      }
    });

    it('should handle single cell grid', () => {
      const gridSize = 1;
      const worldSize = 20;
      const worldOffset = new THREE.Vector2(0, 0);

      const grid = InfluenceMapGrid.initializeGrid(gridSize, worldSize, worldOffset);

      grid[0][0].threatLevel = 0.9;
      grid[0][0].opportunityLevel = 0.8;

      InfluenceMapGrid.resetGrid(grid, gridSize);

      expect(grid[0][0].threatLevel).toBe(0);
      expect(grid[0][0].opportunityLevel).toBe(0);
    });
  });
});
