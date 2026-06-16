// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three'
import type { ITerrainRuntime } from '../../../types/SystemInterfaces'
import type { CoverGridQuery } from './AIStateEngage'
import { AICoverSystem } from './AICoverSystem'
import { CoverSpatialGrid } from './CoverSpatialGrid'

/**
 * Production bridge between the engaged-state cover consumer
 * (`AIStateEngage` via the `CoverGridQuery` structural shape) and the
 * concrete `CoverSpatialGrid`.
 *
 * Why this exists
 * - `AIStateEngage.setCoverGridQuery()` accepts a 2-arg
 *   `queryWithLOS(origin, target): Vector3 | null` so the consumer stays
 *   decoupled from grid storage details. The concrete `CoverSpatialGrid`
 *   has a richer 4-arg `queryWithLOS(origin, target, terrainRuntime,
 *   radius): CoverGridQueryResult[]`. This provider adapts the two:
 *   it owns the terrain runtime, picks the nearest LOS-valid candidate,
 *   and returns just its position (or null).
 * - The grid must be populated. Rather than wiring a new per-frame hook
 *   into the LOD manager, the provider lazily refreshes the cover
 *   candidates near each query origin on a short TTL. Cover geometry is
 *   effectively static (terrain ridges + placed sandbags), so a 1 s TTL
 *   keyed on the 8 m cell is plenty fresh while keeping the refresh off
 *   the hot path most ticks.
 *
 * Cover-choice sanity
 * - Candidates come from `AICoverSystem.collectCoverCandidates()`, i.e.
 *   the SAME terrain + sandbag spots the synchronous `findBestCover`
 *   scan draws from. The grid changes WHICH candidate wins (nearest
 *   LOS-valid rather than best-scored), never invents new cover, and
 *   stays LOS-gated against the threat — so an engaged NPC routed through
 *   the grid still picks a position the legacy scan could have produced.
 * - When the grid finds no LOS-valid candidate it returns null, and
 *   `AIStateEngage` falls back to the synchronous scan. The fallback is
 *   never bypassed.
 *
 * This class is internal to `src/systems/combat/ai/**`; it is not a
 * fenced interface.
 */

/** Default search radius, matching `AICoverSystem.findBestCover`. */
const DEFAULT_QUERY_RADIUS = 30

/**
 * How long a region's cover candidates stay valid before the next query
 * touching that region triggers a refresh. Cover geometry is static, so
 * this is generous; it bounds the refresh cost to roughly once per second
 * per active combat region.
 */
const REGION_REFRESH_TTL_MS = 1000

export class CombatCoverGridProvider implements CoverGridQuery {
  private readonly grid = new CoverSpatialGrid()
  private readonly coverSystem: AICoverSystem
  private readonly queryRadius: number
  private terrainRuntime: ITerrainRuntime | null = null
  // regionKey -> last refresh timestamp (ms). A region is the grid cell of
  // the query origin; refreshing it re-inserts every candidate within
  // queryRadius so neighbouring queries reuse the work.
  private readonly regionRefreshedAt = new Map<string, number>()
  private readonly now: () => number

  constructor(
    coverSystem: AICoverSystem,
    queryRadius: number = DEFAULT_QUERY_RADIUS,
    nowProvider: () => number = () => performance.now()
  ) {
    this.coverSystem = coverSystem
    this.queryRadius = queryRadius
    this.now = nowProvider
  }

  setTerrainRuntime(terrainRuntime: ITerrainRuntime | null): void {
    this.terrainRuntime = terrainRuntime
  }

  /** Drop every indexed candidate (game reset / mode switch). */
  reset(): void {
    this.grid.clear()
    this.regionRefreshedAt.clear()
  }

  /** Number of cover candidates currently indexed (diagnostics/tests). */
  get indexedCount(): number {
    return this.grid.size
  }

  /**
   * `CoverGridQuery` implementation. Ensures the region around `origin`
   * is freshly indexed, then returns the nearest LOS-valid cover position
   * to the threat, or null when none is indexed / no terrain is wired.
   */
  queryWithLOS(origin: THREE.Vector3, targetPosition: THREE.Vector3): THREE.Vector3 | null {
    if (!this.terrainRuntime) return null
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return null

    this.refreshRegion(origin, targetPosition)

    const result = this.grid.queryNearestWithLOS(
      origin,
      targetPosition,
      this.terrainRuntime,
      this.queryRadius
    )
    if (!result) return null
    return result.position.clone()
  }

  private refreshRegion(origin: THREE.Vector3, threatPosition: THREE.Vector3): void {
    const regionKey = this.regionKeyFor(origin)
    const now = this.now()
    const last = this.regionRefreshedAt.get(regionKey)
    if (last !== undefined && now - last < REGION_REFRESH_TTL_MS) return

    const candidates = this.coverSystem.collectCoverCandidates(
      origin,
      threatPosition,
      this.queryRadius
    )
    for (const candidate of candidates) {
      this.grid.insert(this.coverIdFor(candidate.position), candidate.position)
    }
    this.regionRefreshedAt.set(regionKey, now)
  }

  private regionKeyFor(origin: THREE.Vector3): string {
    const cell = this.grid.getCellSize()
    const cx = Math.floor(origin.x / cell)
    const cz = Math.floor(origin.z / cell)
    return `${cx}_${cz}`
  }

  // Stable cover id keyed on a 1 m grid so re-inserting the same terrain
  // spot across refreshes updates in place rather than accumulating
  // near-duplicate entries.
  private coverIdFor(position: THREE.Vector3): string {
    const x = Math.round(position.x)
    const z = Math.round(position.z)
    return `c_${x}_${z}`
  }
}
