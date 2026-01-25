import * as THREE from 'three'
import { Combatant, CombatantState } from './types'

/**
 * 2D spatial grid for fast proximity queries of combatants.
 * Uses a grid-based spatial hash to reduce O(n^2) complexity to O(1) average case.
 */
export class SpatialGrid {
  private cellSize: number
  private grid: Map<string, Set<string>> = new Map()
  private combatantCells: Map<string, string> = new Map() // Track which cell each combatant is in
  private worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number }

  constructor(cellSize: number = 30, worldSize: number = 4000) {
    this.cellSize = cellSize
    const halfSize = worldSize / 2
    this.worldBounds = {
      minX: -halfSize,
      maxX: halfSize,
      minZ: -halfSize,
      maxZ: halfSize
    }
  }

  /**
   * Update world bounds dynamically
   */
  setWorldSize(worldSize: number): void {
    const halfSize = worldSize / 2
    this.worldBounds = {
      minX: -halfSize,
      maxX: halfSize,
      minZ: -halfSize,
      maxZ: halfSize
    }
  }

  /**
   * Get grid cell key for a position
   */
  private getCellKey(x: number, z: number): string {
    const cellX = Math.floor(x / this.cellSize)
    const cellZ = Math.floor(z / this.cellSize)
    return `${cellX},${cellZ}`
  }

  /**
   * Update combatant position in grid
   */
  updatePosition(id: string, position: THREE.Vector3): void {
    const newCellKey = this.getCellKey(position.x, position.z)
    const oldCellKey = this.combatantCells.get(id)

    // Skip if still in same cell
    if (oldCellKey === newCellKey) {
      return
    }

    // Remove from old cell
    if (oldCellKey) {
      const oldCell = this.grid.get(oldCellKey)
      if (oldCell) {
        oldCell.delete(id)
        if (oldCell.size === 0) {
          this.grid.delete(oldCellKey)
        }
      }
    }

    // Add to new cell
    let newCell = this.grid.get(newCellKey)
    if (!newCell) {
      newCell = new Set()
      this.grid.set(newCellKey, newCell)
    }
    newCell.add(id)
    this.combatantCells.set(id, newCellKey)
  }

  /**
   * Remove combatant from grid
   */
  remove(id: string): void {
    const cellKey = this.combatantCells.get(id)
    if (cellKey) {
      const cell = this.grid.get(cellKey)
      if (cell) {
        cell.delete(id)
        if (cell.size === 0) {
          this.grid.delete(cellKey)
        }
      }
      this.combatantCells.delete(id)
    }
  }

  /**
   * Query combatants within radius (returns combatant IDs)
   */
  queryRadius(position: THREE.Vector3, radius: number): string[] {
    const results: string[] = []
    const cellRadius = Math.ceil(radius / this.cellSize)
    const centerCellX = Math.floor(position.x / this.cellSize)
    const centerCellZ = Math.floor(position.z / this.cellSize)

    // Check all cells within the bounding square
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cellKey = `${centerCellX + dx},${centerCellZ + dz}`
        const cell = this.grid.get(cellKey)
        if (cell) {
          cell.forEach(id => results.push(id))
        }
      }
    }

    return results
  }

  /**
   * Query single cell (fast path for very localized queries)
   */
  queryCell(position: THREE.Vector3): string[] {
    const cellKey = this.getCellKey(position.x, position.z)
    const cell = this.grid.get(cellKey)
    return cell ? Array.from(cell) : []
  }

  /**
   * Rebuild entire grid from scratch (useful for debugging or mode changes)
   */
  rebuild(combatants: Map<string, Combatant>): void {
    this.grid.clear()
    this.combatantCells.clear()

    combatants.forEach((combatant, id) => {
      if (combatant.state !== CombatantState.DEAD) {
        this.updatePosition(id, combatant.position)
      }
    })
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.grid.clear()
    this.combatantCells.clear()
  }

  /**
   * Get stats for debugging
   */
  getStats(): { totalCells: number; totalCombatants: number; avgPerCell: number } {
    const totalCells = this.grid.size
    const totalCombatants = this.combatantCells.size
    const avgPerCell = totalCells > 0 ? totalCombatants / totalCells : 0

    return { totalCells, totalCombatants, avgPerCell }
  }
}
