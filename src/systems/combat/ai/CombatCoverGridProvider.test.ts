// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { CombatCoverGridProvider } from './CombatCoverGridProvider'
import { AICoverSystem, type CoverSpot } from './AICoverSystem'
import { mockTerrainRuntime } from '../../../test-utils'

/**
 * Behavior tests for the production cover-grid bridge. These assert what
 * a caller (AIStateEngage via the CoverGridQuery shape) observes — a
 * cover position that the synchronous scan could also have produced,
 * LOS-gated against the threat — not the grid's internal cell layout.
 */
describe('CombatCoverGridProvider', () => {
  // A controllable fake AICoverSystem that returns a fixed candidate set,
  // so we can assert WHICH candidate the grid hands back without coupling
  // to terrain-spot generation noise.
  function makeCoverSystem(candidates: CoverSpot[]): AICoverSystem {
    const system = new AICoverSystem()
    vi.spyOn(system, 'collectCoverCandidates').mockReturnValue(candidates)
    return system
  }

  function spot(x: number, y: number, z: number, type: CoverSpot['coverType'] = 'terrain'): CoverSpot {
    return {
      position: new THREE.Vector3(x, y, z),
      score: 0,
      coverType: type,
      height: 2,
      lastEvaluatedTime: 0,
    }
  }

  let now: number
  const nowProvider = () => now

  beforeEach(() => {
    now = 1000
  })

  it('returns null until a terrain runtime is wired (engage handler keeps its fallback)', () => {
    const coverSystem = makeCoverSystem([spot(2, 0, 2)])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)

    const result = provider.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 0, 0))

    expect(result).toBeNull()
    // Without terrain the grid is never even populated.
    expect(provider.indexedCount).toBe(0)
  })

  it('indexes the scan candidates and returns the nearest LOS-valid cover', () => {
    // Two candidates: one 3m away, one 10m away. Both have clear LOS.
    const near = spot(3, 0, 0)
    const far = spot(10, 0, 0)
    const coverSystem = makeCoverSystem([far, near])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    const origin = new THREE.Vector3(0, 0, 0)
    const threat = new THREE.Vector3(50, 0, 0)
    const result = provider.queryWithLOS(origin, threat)

    expect(result).not.toBeNull()
    // Nearest-first ordering => the 3m candidate wins.
    expect(result!.distanceTo(near.position)).toBeLessThan(0.001)
    expect(provider.indexedCount).toBeGreaterThanOrEqual(2)
  })

  it('only returns cover the cover system actually offered (never invents cover)', () => {
    const offered = spot(4, 0, 4)
    const coverSystem = makeCoverSystem([offered])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    const result = provider.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 0, 0))

    expect(result).not.toBeNull()
    expect(result!.distanceTo(offered.position)).toBeLessThan(0.001)
  })

  it('returns null when every candidate is blocked from the threat (LOS gate)', () => {
    const coverSystem = makeCoverSystem([spot(3, 0, 0)])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    // Terrain raycast reports a hit well short of the target => no LOS.
    provider.setTerrainRuntime(
      mockTerrainRuntime({
        raycastTerrain: vi.fn(() => ({ hit: true, distance: 1 })),
      })
    )

    const result = provider.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(50, 0, 0))

    // Grid yields nothing -> AIStateEngage falls back to the synchronous scan.
    expect(result).toBeNull()
  })

  it('returns null when no cover is within range', () => {
    const coverSystem = makeCoverSystem([])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    const result = provider.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 0, 0))

    expect(result).toBeNull()
  })

  it('refreshes candidates on the TTL rather than every query', () => {
    const coverSystem = makeCoverSystem([spot(3, 0, 0)])
    const collectSpy = coverSystem.collectCoverCandidates as ReturnType<typeof vi.fn>
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    const origin = new THREE.Vector3(0, 0, 0)
    const threat = new THREE.Vector3(40, 0, 0)

    provider.queryWithLOS(origin, threat)
    provider.queryWithLOS(origin, threat) // same region, within TTL
    expect(collectSpy).toHaveBeenCalledTimes(1)

    // Advance past the TTL: the next query for the same region re-collects.
    now += 2000
    provider.queryWithLOS(origin, threat)
    expect(collectSpy).toHaveBeenCalledTimes(2)
  })

  it('clears all indexed cover on reset (mode switch / game reset)', () => {
    const coverSystem = makeCoverSystem([spot(3, 0, 0)])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    provider.queryWithLOS(new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 0, 0))
    expect(provider.indexedCount).toBeGreaterThan(0)

    provider.reset()
    expect(provider.indexedCount).toBe(0)
  })

  it('rejects non-finite query origins (defensive, no throw)', () => {
    const coverSystem = makeCoverSystem([spot(3, 0, 0)])
    const provider = new CombatCoverGridProvider(coverSystem, 30, nowProvider)
    provider.setTerrainRuntime(mockTerrainRuntime())

    const result = provider.queryWithLOS(
      new THREE.Vector3(Number.NaN, 0, 0),
      new THREE.Vector3(40, 0, 0)
    )

    expect(result).toBeNull()
  })
})
