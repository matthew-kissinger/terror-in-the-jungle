// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

export class MathUtils {
  static randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  static randomVector3(minX: number, maxX: number, minZ: number, maxZ: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(
      this.randomInRange(minX, maxX),
      y,
      this.randomInRange(minZ, maxZ)
    );
  }

  static poissonDiskSampling(width: number, height: number, radius: number, k = 30): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const grid: (THREE.Vector2 | null)[][] = [];
    const cellSize = radius / Math.sqrt(2);
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);

    // Initialize grid
    for (let i = 0; i < gridWidth; i++) {
      grid[i] = [];
      for (let j = 0; j < gridHeight; j++) {
        grid[i][j] = null;
      }
    }

    const activeList: THREE.Vector2[] = [];
    
    // Add first point
    const firstPoint = new THREE.Vector2(width / 2, height / 2);
    points.push(firstPoint);
    activeList.push(firstPoint);
    
    const gridX = Math.floor(firstPoint.x / cellSize);
    const gridY = Math.floor(firstPoint.y / cellSize);
    grid[gridX][gridY] = firstPoint;

    while (activeList.length > 0) {
      const randomIndex = Math.floor(Math.random() * activeList.length);
      const point = activeList[randomIndex];
      let found = false;

      for (let i = 0; i < k; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = this.randomInRange(radius, 2 * radius);
        const newPoint = new THREE.Vector2(
          point.x + Math.cos(angle) * distance,
          point.y + Math.sin(angle) * distance
        );

        if (newPoint.x >= 0 && newPoint.x < width && 
            newPoint.y >= 0 && newPoint.y < height &&
            this.isValidPoint(newPoint, grid, cellSize, radius, gridWidth, gridHeight)) {
          
          points.push(newPoint);
          activeList.push(newPoint);
          
          const newGridX = Math.floor(newPoint.x / cellSize);
          const newGridY = Math.floor(newPoint.y / cellSize);
          grid[newGridX][newGridY] = newPoint;
          found = true;
          break;
        }
      }

      if (!found) {
        activeList.splice(randomIndex, 1);
      }
    }

    return points;
  }

  private static isValidPoint(
    point: THREE.Vector2, 
    grid: (THREE.Vector2 | null)[][], 
    cellSize: number, 
    radius: number,
    gridWidth: number,
    gridHeight: number
  ): boolean {
    const gridX = Math.floor(point.x / cellSize);
    const gridY = Math.floor(point.y / cellSize);

    for (let i = Math.max(0, gridX - 2); i < Math.min(gridWidth, gridX + 3); i++) {
      for (let j = Math.max(0, gridY - 2); j < Math.min(gridHeight, gridY + 3); j++) {
        const neighbor = grid[i][j];
        if (neighbor && point.distanceTo(neighbor) < radius) {
          return false;
        }
      }
    }
    return true;
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  static smoothstep(edge0: number, edge1: number, x: number): number {
    // Scale, bias and saturate x to [0, 1] range
    x = this.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    // Evaluate polynomial
    return x * x * (3 - 2 * x);
  }
}