import * as THREE from 'three';

/**
 * Grid cell data representing tactical influence at a position
 */
export interface InfluenceCell {
  position: THREE.Vector2;
  threatLevel: number;          // 0-1: Based on enemy density and LOS
  opportunityLevel: number;      // 0-1: Based on uncontested zones, flanking routes
  coverValue: number;            // 0-1: Based on nearby sandbags and terrain features
  squadSupport: number;          // 0-1: Friendly unit density for mutual support
  combinedScore: number;         // Overall tactical value
}

/**
 * Grid bounds helper result
 */
export interface GridBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Grid management utilities for influence map system
 */
export class InfluenceMapGrid {
  /**
   * Initialize a new grid with pre-allocated cells
   */
  static initializeGrid(
    gridSize: number,
    worldSize: number,
    worldOffset: THREE.Vector2
  ): InfluenceCell[][] {
    const grid: InfluenceCell[][] = [];
    const cellSize = worldSize / gridSize;

    for (let x = 0; x < gridSize; x++) {
      grid[x] = [];
      for (let z = 0; z < gridSize; z++) {
        const worldX = worldOffset.x + x * cellSize;
        const worldZ = worldOffset.y + z * cellSize;

        grid[x][z] = {
          position: new THREE.Vector2(worldX, worldZ),
          threatLevel: 0,
          opportunityLevel: 0,
          coverValue: 0,
          squadSupport: 0,
          combinedScore: 0
        };
      }
    }

    return grid;
  }

  /**
   * Get grid cell bounds for a circular area
   */
  static getCellBounds(
    centerX: number,
    centerZ: number,
    radius: number,
    gridSize: number,
    cellSize: number,
    worldOffset: THREE.Vector2
  ): GridBounds {
    const minX = Math.max(
      0,
      Math.floor((centerX - radius - worldOffset.x) / cellSize)
    );
    const maxX = Math.min(
      gridSize - 1,
      Math.floor((centerX + radius - worldOffset.x) / cellSize)
    );
    const minZ = Math.max(
      0,
      Math.floor((centerZ - radius - worldOffset.y) / cellSize)
    );
    const maxZ = Math.min(
      gridSize - 1,
      Math.floor((centerZ + radius - worldOffset.y) / cellSize)
    );

    return { minX, maxX, minZ, maxZ };
  }

  /**
   * Reset all cell values to zero
   */
  static resetGrid(grid: InfluenceCell[][], gridSize: number): void {
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const cell = grid[x][z];
        cell.threatLevel = 0;
        cell.opportunityLevel = 0;
        cell.coverValue = 0;
        cell.squadSupport = 0;
        cell.combinedScore = 0;
      }
    }
  }
}
