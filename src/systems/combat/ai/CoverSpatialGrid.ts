import * as THREE from 'three';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';

/**
 * CoverSpatialGrid — CPU-side uniform spatial grid for cover candidates.
 *
 * Built in cycle-konveyer-11-spatial-grid-compute (DEFEKT-3) to replace the
 * synchronous cover scan in `AIStateEngage.initiateSquadSuppression()` with
 * an O(1)-average range query.
 *
 * Semantics
 * - Cell size is 8 m, matching the existing world-chunk granularity so
 *   cache locality for cover-and-chunk co-access patterns stays aligned.
 * - The grid is constructed once at scene-load and updated incrementally
 *   when cover geometry changes (insert/remove). There is no implicit
 *   rebuild — callers manage cover lifecycle explicitly.
 * - Out-of-bounds positions are not supported; callers should pass
 *   finite world coordinates. NaN/Infinity positions are rejected.
 * - Lookups are deterministic: results are sorted by squared distance
 *   ascending, with `coverId` lexicographic compare as the tiebreaker.
 *   Two callers that insert the same set of (id, position) pairs in any
 *   order will see the same query results in the same order.
 *
 * This class is internal to `src/systems/combat/ai/**`. It is NOT a
 * fenced interface in `src/types/SystemInterfaces.ts`; callers depend
 * on the concrete class.
 */

export const COVER_GRID_CELL_SIZE = 8;

/** Result of a grid query. `distance` is the linear distance, not squared. */
export interface CoverGridQueryResult {
  coverId: string;
  position: THREE.Vector3;
  distance: number;
}

interface CoverEntry {
  coverId: string;
  position: THREE.Vector3;
  cellKey: string;
}

// Module-level scratch vectors keep the hot path allocation-free.
const _toCover = new THREE.Vector3();
const _direction = new THREE.Vector3();

function isFiniteVec3(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function compareResults(a: CoverGridQueryResult, b: CoverGridQueryResult): number {
  // Stable, deterministic order: nearest first, lexicographic id on ties.
  if (a.distance !== b.distance) return a.distance - b.distance;
  if (a.coverId < b.coverId) return -1;
  if (a.coverId > b.coverId) return 1;
  return 0;
}

export class CoverSpatialGrid {
  private readonly cellSize: number;
  /** cellKey -> set of coverIds in that cell. */
  private readonly cells: Map<string, Set<string>> = new Map();
  /** coverId -> entry (so remove() and re-insert work in O(1)). */
  private readonly entries: Map<string, CoverEntry> = new Map();

  constructor(cellSize: number = COVER_GRID_CELL_SIZE) {
    if (!(cellSize > 0) || !Number.isFinite(cellSize)) {
      throw new Error(`CoverSpatialGrid: cellSize must be a positive finite number, got ${cellSize}`);
    }
    this.cellSize = cellSize;
  }

  /** Number of cover entries currently indexed. */
  get size(): number {
    return this.entries.size;
  }

  /** Cell size in meters. */
  getCellSize(): number {
    return this.cellSize;
  }

  /**
   * Insert (or move) a cover entry. Re-inserting the same `coverId` moves
   * it to the new position and updates its cell membership.
   *
   * Returns true when the entry was accepted, false when the position was
   * rejected (non-finite coordinates).
   */
  insert(coverId: string, position: THREE.Vector3): boolean {
    if (!isFiniteVec3(position)) return false;

    const cellKey = this.cellKeyForWorld(position.x, position.z);
    const existing = this.entries.get(coverId);

    if (existing) {
      if (existing.cellKey === cellKey) {
        existing.position.copy(position);
        return true;
      }
      this.removeFromCell(existing.cellKey, coverId);
      existing.position.copy(position);
      existing.cellKey = cellKey;
      this.addToCell(cellKey, coverId);
      return true;
    }

    const entry: CoverEntry = {
      coverId,
      position: position.clone(),
      cellKey,
    };
    this.entries.set(coverId, entry);
    this.addToCell(cellKey, coverId);
    return true;
  }

  /**
   * Remove a cover entry. Returns true when it existed, false otherwise.
   */
  remove(coverId: string): boolean {
    const existing = this.entries.get(coverId);
    if (!existing) return false;
    this.removeFromCell(existing.cellKey, coverId);
    this.entries.delete(coverId);
    return true;
  }

  /** True when `coverId` is currently indexed. */
  has(coverId: string): boolean {
    return this.entries.has(coverId);
  }

  /** Drop every entry. The grid is empty afterward. */
  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  /**
   * Return every cover entry whose stored position is within `radius`
   * meters (linear distance) of `origin`. Results are deterministic:
   * sorted by ascending distance, with `coverId` as the tiebreaker.
   *
   * Returns an empty array when:
   * - `origin` has non-finite coordinates
   * - `radius <= 0`
   * - the grid is empty
   * - no entry sits within the radius
   */
  queryNearest(origin: THREE.Vector3, radius: number): CoverGridQueryResult[] {
    if (!isFiniteVec3(origin)) return [];
    if (!(radius > 0) || !Number.isFinite(radius)) return [];
    if (this.entries.size === 0) return [];

    const results: CoverGridQueryResult[] = [];
    const radiusSq = radius * radius;

    this.forEachCandidateInRadius(origin, radius, (entry) => {
      _toCover.subVectors(entry.position, origin);
      const distSq = _toCover.lengthSq();
      if (distSq > radiusSq) return;
      results.push({
        coverId: entry.coverId,
        position: entry.position.clone(),
        distance: Math.sqrt(distSq),
      });
    });

    results.sort(compareResults);
    return results;
  }

  /**
   * Range query with line-of-sight gating against the target. A candidate
   * is included only when the terrain raycast from the candidate's eye
   * height toward the target reports no hit short of the target — i.e.
   * the cover position can plausibly observe (and be observed by) the
   * target. The query origin distance still bounds the candidate set via
   * `radius` (defaults to 30 m, matching the synchronous cover-search
   * default in `AICoverSystem.findBestCover`).
   *
   * Results are sorted by ascending distance from `origin`.
   *
   * Returns an empty array when:
   * - any input vector has non-finite coordinates
   * - `terrainRuntime` is null/undefined
   * - the radius is non-positive
   * - the grid is empty
   * - no candidate has LOS to the target
   */
  queryWithLOS(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    terrainRuntime: ITerrainRuntime | null | undefined,
    radius: number = 30,
  ): CoverGridQueryResult[] {
    if (!terrainRuntime) return [];
    if (!isFiniteVec3(origin) || !isFiniteVec3(target)) return [];
    if (!(radius > 0) || !Number.isFinite(radius)) return [];
    if (this.entries.size === 0) return [];

    const candidates = this.queryNearest(origin, radius);
    if (candidates.length === 0) return candidates;

    const visible: CoverGridQueryResult[] = [];
    for (const candidate of candidates) {
      if (this.hasLineOfSight(candidate.position, target, terrainRuntime)) {
        visible.push(candidate);
      }
    }
    return visible;
  }

  // --- internals -----------------------------------------------------------

  private cellKeyForWorld(worldX: number, worldZ: number): string {
    const cx = Math.floor(worldX / this.cellSize);
    const cz = Math.floor(worldZ / this.cellSize);
    return `${cx}_${cz}`;
  }

  private addToCell(cellKey: string, coverId: string): void {
    let bucket = this.cells.get(cellKey);
    if (!bucket) {
      bucket = new Set();
      this.cells.set(cellKey, bucket);
    }
    bucket.add(coverId);
  }

  private removeFromCell(cellKey: string, coverId: string): void {
    const bucket = this.cells.get(cellKey);
    if (!bucket) return;
    bucket.delete(coverId);
    if (bucket.size === 0) this.cells.delete(cellKey);
  }

  /**
   * Iterate every entry in cells overlapping the AABB of the query disk.
   * `visit` is invoked once per entry; callers re-test exact distance.
   */
  private forEachCandidateInRadius(
    origin: THREE.Vector3,
    radius: number,
    visit: (entry: CoverEntry) => void,
  ): void {
    const minCx = Math.floor((origin.x - radius) / this.cellSize);
    const maxCx = Math.floor((origin.x + radius) / this.cellSize);
    const minCz = Math.floor((origin.z - radius) / this.cellSize);
    const maxCz = Math.floor((origin.z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.cells.get(`${cx}_${cz}`);
        if (!bucket || bucket.size === 0) continue;
        for (const coverId of bucket) {
          const entry = this.entries.get(coverId);
          if (entry) visit(entry);
        }
      }
    }
  }

  private hasLineOfSight(
    coverPosition: THREE.Vector3,
    target: THREE.Vector3,
    terrainRuntime: ITerrainRuntime,
  ): boolean {
    _direction.subVectors(target, coverPosition);
    const maxDistance = _direction.length();
    if (maxDistance <= 0) return true;
    _direction.divideScalar(maxDistance);

    const result = terrainRuntime.raycastTerrain(coverPosition, _direction, maxDistance);
    if (!result || !result.hit) return true;
    if (result.distance === undefined) return false;
    // LOS is clear when the terrain hit is at or beyond the target.
    return result.distance >= maxDistance;
  }
}
