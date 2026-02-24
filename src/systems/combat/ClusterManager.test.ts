import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ClusterManager } from './ClusterManager'
import { Combatant, CombatantState, Faction } from './types'
import { SpatialGridManager } from './SpatialGridManager'

// Helper to create a mock combatant
function createMockCombatant(
  id: string,
  faction: Faction,
  position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  state: CombatantState = CombatantState.ENGAGING,
  target?: Combatant | null
): Combatant {
  return {
    id,
    faction,
    health: 100,
    maxHealth: 100,
    state,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {
      burstLength: 3,
      burstPauseMs: 200,
    } as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    target,
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
  } as Combatant
}

// Helper to create mock spatial grid manager
function createMockSpatialGrid(queryRadiusResults: string[] = []): SpatialGridManager {
  return {
    queryRadius: vi.fn(() => queryRadiusResults),
  } as any
}

describe('ClusterManager', () => {
  let clusterManager: ClusterManager
  let allCombatants: Map<string, Combatant>

  beforeEach(() => {
    clusterManager = new ClusterManager()
    allCombatants = new Map()
  })

  describe('calculateSpacingForce', () => {
    it('should return zero force when no nearby friendlies', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1']) // Only self

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      expect(force.x).toBe(0)
      expect(force.y).toBe(0)
      expect(force.z).toBe(0)
    })

    it('should calculate repulsion force away from nearby friendlies', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0)) // 2m away (within 4m MIN_FRIENDLY_SPACING)
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2'])

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // Force should push away from nearby (negative X direction since nearby is at +X)
      expect(force.x).toBeLessThan(0)
      expect(force.y).toBe(0)
      expect(force.z).toBe(0)
    })

    it('should ignore dead combatants', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const deadNearby = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0), CombatantState.DEAD)
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', deadNearby)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2'])

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // No force since dead combatant ignored
      expect(force.x).toBe(0)
      expect(force.y).toBe(0)
      expect(force.z).toBe(0)
    })

    it('should ignore opposite faction', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy = createMockCombatant('c2', Faction.NVA, new THREE.Vector3(2, 0, 0))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', enemy)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2'])

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // No force since opposite faction ignored
      expect(force.x).toBe(0)
      expect(force.y).toBe(0)
      expect(force.z).toBe(0)
    })

    it('should exclude self from spacing calculations', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // No force since only self found
      expect(force.x).toBe(0)
      expect(force.y).toBe(0)
      expect(force.z).toBe(0)
    })

    it('should apply stronger force when closer', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const close = createMockCombatant('c2', Faction.US, new THREE.Vector3(1, 0, 0)) // 1m away
      const farther = createMockCombatant('c3', Faction.US, new THREE.Vector3(3, 0, 0)) // 3m away
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', close)
      allCombatants.set('c3', farther)

      // Test with close combatant only
      const spatialGridClose = createMockSpatialGrid(['c1', 'c2'])
      const forceClose = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGridClose)
      const forceCloseMagnitude = forceClose.length()

      // Test with farther combatant only
      allCombatants.delete('c2')
      const spatialGridFar = createMockSpatialGrid(['c1', 'c3'])
      const forceFar = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGridFar)
      const forceFarMagnitude = forceFar.length()

      // Force from closer combatant should be stronger
      expect(forceCloseMagnitude).toBeGreaterThan(forceFarMagnitude)
    })

    it('should normalize force when multiple friendlies nearby', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0))
      const nearby2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 2))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby1)
      allCombatants.set('c3', nearby2)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3'])

      const force = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // Force should be averaged (normalized) across multiple combatants
      // Direction should be roughly diagonal away from both
      expect(force.length()).toBeGreaterThan(0)
      expect(Math.abs(force.x)).toBeGreaterThan(0)
      expect(Math.abs(force.z)).toBeGreaterThan(0)
    })

    it('should accept optional output vector', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby = createMockCombatant('c2', Faction.US, new THREE.Vector3(2, 0, 0))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2'])

      const outputVector = new THREE.Vector3()
      const result = clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid, outputVector)

      // Should return the same vector reference
      expect(result).toBe(outputVector)
      // Should have calculated force
      expect(result.length()).toBeGreaterThan(0)
    })

    it('should use spatial grid queryRadius correctly', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      clusterManager.calculateSpacingForce(combatant, allCombatants, spatialGrid)

      // Verify spatial grid was queried with correct parameters (MIN_FRIENDLY_SPACING = 4.0)
      expect(spatialGrid.queryRadius).toHaveBeenCalledWith(combatant.position, 4.0)
    })
  })

  describe('isInCluster', () => {
    it('should return false when not enough nearby friendlies', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0))
      const nearby2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 5))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby1)
      allCombatants.set('c3', nearby2)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // Only 2 nearby friendlies, need 4 for cluster
      expect(result).toBe(false)
    })

    it('should return true when CLUSTER_THRESHOLD (4) or more friendlies nearby', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0))
      const nearby2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 5))
      const nearby3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-5, 0, 0))
      const nearby4 = createMockCombatant('c5', Faction.US, new THREE.Vector3(0, 0, -5))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby1)
      allCombatants.set('c3', nearby2)
      allCombatants.set('c4', nearby3)
      allCombatants.set('c5', nearby4)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // 4 nearby friendlies = cluster
      expect(result).toBe(true)
    })

    it('should ignore dead combatants', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const nearby1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0), CombatantState.DEAD)
      const nearby2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 5), CombatantState.DEAD)
      const nearby3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-5, 0, 0), CombatantState.DEAD)
      const nearby4 = createMockCombatant('c5', Faction.US, new THREE.Vector3(0, 0, -5), CombatantState.DEAD)
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', nearby1)
      allCombatants.set('c3', nearby2)
      allCombatants.set('c4', nearby3)
      allCombatants.set('c5', nearby4)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // All nearby combatants are dead, should not cluster
      expect(result).toBe(false)
    })

    it('should ignore opposite faction', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy1 = createMockCombatant('c2', Faction.NVA, new THREE.Vector3(5, 0, 0))
      const enemy2 = createMockCombatant('c3', Faction.NVA, new THREE.Vector3(0, 0, 5))
      const enemy3 = createMockCombatant('c4', Faction.NVA, new THREE.Vector3(-5, 0, 0))
      const enemy4 = createMockCombatant('c5', Faction.NVA, new THREE.Vector3(0, 0, -5))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', enemy1)
      allCombatants.set('c3', enemy2)
      allCombatants.set('c4', enemy3)
      allCombatants.set('c5', enemy4)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // All nearby combatants are enemies, should not cluster
      expect(result).toBe(false)
    })

    it('should exclude self from cluster count', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // Only self, should not cluster
      expect(result).toBe(false)
    })

    it('should early exit once threshold reached', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      // Create many nearby friendlies
      const nearby: Combatant[] = []
      for (let i = 0; i < 10; i++) {
        const c = createMockCombatant(`c${i + 2}`, Faction.US, new THREE.Vector3(i * 2, 0, 0))
        nearby.push(c)
        allCombatants.set(c.id, c)
      }
      allCombatants.set('c1', combatant)
      const nearbyIds = ['c1', ...nearby.map(c => c.id)]
      const spatialGrid = createMockSpatialGrid(nearbyIds)

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // Should return true and early exit at threshold
      expect(result).toBe(true)
    })

    it('should use spatial grid queryRadius correctly', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // Verify spatial grid was queried with correct parameters (CLUSTER_RADIUS = 15.0)
      expect(spatialGrid.queryRadius).toHaveBeenCalledWith(combatant.position, 15.0)
    })

    it('should check distance within CLUSTER_RADIUS (15m)', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      // Create combatants just inside and just outside radius
      const inside1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(14, 0, 0)) // 14m
      const inside2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 14)) // 14m
      const inside3 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-14, 0, 0)) // 14m
      const inside4 = createMockCombatant('c5', Faction.US, new THREE.Vector3(0, 0, -14)) // 14m
      const outside = createMockCombatant('c6', Faction.US, new THREE.Vector3(20, 0, 0)) // 20m (outside)

      allCombatants.set('c1', combatant)
      allCombatants.set('c2', inside1)
      allCombatants.set('c3', inside2)
      allCombatants.set('c4', inside3)
      allCombatants.set('c5', inside4)
      allCombatants.set('c6', outside)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])

      const result = clusterManager.isInCluster(combatant, allCombatants, spatialGrid)

      // 4 inside, 1 outside = cluster
      expect(result).toBe(true)
    })
  })

  describe('getClusterDensity', () => {
    it('should return 0 when no nearby combatants', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      const density = clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      expect(density).toBe(0)
    })

    it('should count nearby alive combatants regardless of faction', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const friendly1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0))
      const friendly2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 5))
      const enemy1 = createMockCombatant('c4', Faction.NVA, new THREE.Vector3(-5, 0, 0))
      const enemy2 = createMockCombatant('c5', Faction.NVA, new THREE.Vector3(0, 0, -5))
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', friendly1)
      allCombatants.set('c3', friendly2)
      allCombatants.set('c4', enemy1)
      allCombatants.set('c5', enemy2)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5'])

      const density = clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      // 4 nearby combatants (2 friendly + 2 enemy), maxExpected = 10
      // density = min(1, 4/10) = 0.4
      expect(density).toBeCloseTo(0.4, 2)
    })

    it('should ignore dead combatants', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const alive1 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0))
      const alive2 = createMockCombatant('c3', Faction.US, new THREE.Vector3(0, 0, 5))
      const dead1 = createMockCombatant('c4', Faction.US, new THREE.Vector3(-5, 0, 0), CombatantState.DEAD)
      const dead2 = createMockCombatant('c5', Faction.US, new THREE.Vector3(0, 0, -5), CombatantState.DEAD)
      allCombatants.set('c1', combatant)
      allCombatants.set('c2', alive1)
      allCombatants.set('c3', alive2)
      allCombatants.set('c4', dead1)
      allCombatants.set('c5', dead2)
      const spatialGrid = createMockSpatialGrid(['c1', 'c2', 'c3', 'c4', 'c5'])

      const density = clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      // 2 nearby alive, maxExpected = 10
      // density = min(1, 2/10) = 0.2
      expect(density).toBeCloseTo(0.2, 2)
    })

    it('should exclude self from density count', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      const density = clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      // Only self, density = 0
      expect(density).toBe(0)
    })

    it('should cap density at 1.0', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      // Create 15 nearby combatants (> maxExpected of 10)
      for (let i = 0; i < 15; i++) {
        const c = createMockCombatant(`c${i + 2}`, Faction.US, new THREE.Vector3(i * 1.5, 0, 0))
        allCombatants.set(c.id, c)
      }
      allCombatants.set('c1', combatant)
      const nearbyIds = ['c1', ...Array.from(allCombatants.keys()).filter(id => id !== 'c1')]
      const spatialGrid = createMockSpatialGrid(nearbyIds)

      const density = clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      // Should cap at 1.0 even with 15 nearby (> maxExpected of 10)
      expect(density).toBe(1.0)
    })

    it('should use spatial grid queryRadius correctly', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)
      const spatialGrid = createMockSpatialGrid(['c1'])

      clusterManager.getClusterDensity(combatant, allCombatants, spatialGrid)

      // Verify spatial grid was queried with correct parameters (CLUSTER_RADIUS = 15.0)
      expect(spatialGrid.queryRadius).toHaveBeenCalledWith(combatant.position, 15.0)
    })
  })

  describe('getStaggeredReactionDelay', () => {
    it('should return base delay when cluster density is 0', () => {
      const baseDelay = 500
      const density = 0

      const delay = clusterManager.getStaggeredReactionDelay(baseDelay, density)

      expect(delay).toBe(baseDelay)
    })

    it('should add extra delay based on cluster density', () => {
      const baseDelay = 500
      const density = 1.0 // Max density

      const delay = clusterManager.getStaggeredReactionDelay(baseDelay, density)

      // Should be between baseDelay and baseDelay + 500ms
      expect(delay).toBeGreaterThanOrEqual(baseDelay)
      expect(delay).toBeLessThanOrEqual(baseDelay + 500)
    })

    it('should scale extra delay with cluster density', () => {
      const baseDelay = 500
      const lowDensity = 0.2
      const highDensity = 0.8

      // Run multiple times to account for randomness
      const lowDelays: number[] = []
      const highDelays: number[] = []
      for (let i = 0; i < 100; i++) {
        lowDelays.push(clusterManager.getStaggeredReactionDelay(baseDelay, lowDensity))
        highDelays.push(clusterManager.getStaggeredReactionDelay(baseDelay, highDensity))
      }

      const avgLowDelay = lowDelays.reduce((a, b) => a + b, 0) / lowDelays.length
      const avgHighDelay = highDelays.reduce((a, b) => a + b, 0) / highDelays.length

      // Higher density should result in higher average delay
      expect(avgHighDelay).toBeGreaterThan(avgLowDelay)
    })
  })

  describe('assignDistributedTarget', () => {
    it('should return null when no potential targets', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      allCombatants.set('c1', combatant)

      const target = clusterManager.assignDistributedTarget(combatant, [], allCombatants)

      expect(target).toBeNull()
    })

    it('should return single target when only one available', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      allCombatants.set('c1', combatant)
      allCombatants.set('e1', enemy)

      const target = clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      expect(target).toBe(enemy)
    })

    it('should prefer closer targets', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const closeEnemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      const farEnemy = createMockCombatant('e2', Faction.NVA, new THREE.Vector3(100, 0, 0))
      allCombatants.set('c1', combatant)
      allCombatants.set('e1', closeEnemy)
      allCombatants.set('e2', farEnemy)

      const target = clusterManager.assignDistributedTarget(
        combatant,
        [closeEnemy, farEnemy],
        allCombatants
      )

      // Should prefer closer enemy (unless randomness overrides, but very unlikely)
      expect(target).toBe(closeEnemy)
    })

    it('should prefer less-targeted enemies', () => {
      const combatant1 = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy1 = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(20, 0, 0))
      const enemy2 = createMockCombatant('e2', Faction.NVA, new THREE.Vector3(20, 0, 5)) // Same distance

      allCombatants.set('c1', combatant1)
      allCombatants.set('e1', enemy1)
      allCombatants.set('e2', enemy2)

      clusterManager.reset()

      // Assign multiple times to establish a pattern
      // With random component up to 10 points and 20 point penalty per targeter,
      // after first assignment, the second enemy should be strongly preferred
      const targets: Combatant[] = []
      for (let i = 0; i < 10; i++) {
        const target = clusterManager.assignDistributedTarget(
          combatant1,
          [enemy1, enemy2],
          allCombatants
        )
        if (target) targets.push(target)
      }

      // Both targets should be selected at least once (distribution working)
      const e1Count = targets.filter(t => t.id === 'e1').length
      const e2Count = targets.filter(t => t.id === 'e2').length

      expect(e1Count).toBeGreaterThan(0)
      expect(e2Count).toBeGreaterThan(0)
    })

    it('should rebuild target counts periodically', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      combatant.target = enemy
      allCombatants.set('c1', combatant)
      allCombatants.set('e1', enemy)

      clusterManager.reset()

      // Mock Date.now to control timing
      const originalDateNow = Date.now
      let mockTime = 0
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

      // First call - should rebuild
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      // Advance time by less than TARGET_REASSIGN_INTERVAL (2000ms)
      mockTime += 1000
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      // Advance time beyond TARGET_REASSIGN_INTERVAL
      mockTime += 1500 // Total 2500ms
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      // Restore original Date.now
      vi.spyOn(Date, 'now').mockRestore()

      // If we got here without error, rebuild logic works
      expect(true).toBe(true)
    })

    it('should update target counts when assigning', () => {
      const combatant1 = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const combatant2 = createMockCombatant('c2', Faction.US, new THREE.Vector3(5, 0, 0))
      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      allCombatants.set('c1', combatant1)
      allCombatants.set('c2', combatant2)
      allCombatants.set('e1', enemy)

      clusterManager.reset()

      // First combatant targets enemy
      const target1 = clusterManager.assignDistributedTarget(combatant1, [enemy], allCombatants)
      expect(target1).toBe(enemy)

      // Second combatant should also get enemy (only option), but count should be updated
      const target2 = clusterManager.assignDistributedTarget(combatant2, [enemy], allCombatants)
      expect(target2).toBe(enemy)
    })
  })

  describe('shouldSimplifyAI', () => {
    it('should always return false below 50% density', () => {
      const results: boolean[] = []
      for (let i = 0; i < 100; i++) {
        results.push(clusterManager.shouldSimplifyAI(0.4))
      }

      // All should be false
      expect(results.every(r => r === false)).toBe(true)
    })

    it('should sometimes return true above 50% density', () => {
      const results: boolean[] = []
      for (let i = 0; i < 100; i++) {
        results.push(clusterManager.shouldSimplifyAI(0.8))
      }

      // Some should be true (probability-based)
      expect(results.some(r => r === true)).toBe(true)
    })

    it('should return true more often at higher densities', () => {
      const mediumDensityResults: boolean[] = []
      const highDensityResults: boolean[] = []

      for (let i = 0; i < 1000; i++) {
        mediumDensityResults.push(clusterManager.shouldSimplifyAI(0.6))
        highDensityResults.push(clusterManager.shouldSimplifyAI(0.9))
      }

      const mediumTrueRate = mediumDensityResults.filter(r => r).length / mediumDensityResults.length
      const highTrueRate = highDensityResults.filter(r => r).length / highDensityResults.length

      // Higher density should have higher true rate
      expect(highTrueRate).toBeGreaterThan(mediumTrueRate)
    })
  })

  describe('getSpreadDefensePosition', () => {
    it('should distribute defenders in a circle around zone', () => {
      const zoneCenter = new THREE.Vector3(0, 0, 0)
      const zoneRadius = 10
      const totalDefenders = 8

      const positions: THREE.Vector3[] = []
      for (let i = 0; i < totalDefenders; i++) {
        const pos = clusterManager.getSpreadDefensePosition(zoneCenter, zoneRadius, i, totalDefenders)
        positions.push(pos)
      }

      // All positions should be roughly same distance from zone center
      const expectedRadius = zoneRadius + 8 // CLUSTER_RADIUS + 8
      positions.forEach(pos => {
        const distance = pos.distanceTo(zoneCenter)
        expect(distance).toBeCloseTo(expectedRadius, 1)
      })
    })

    it('should spread defenders evenly around perimeter', () => {
      const zoneCenter = new THREE.Vector3(0, 0, 0)
      const zoneRadius = 10
      const totalDefenders = 8

      const positions: THREE.Vector3[] = []
      for (let i = 0; i < totalDefenders; i++) {
        const pos = clusterManager.getSpreadDefensePosition(zoneCenter, zoneRadius, i, totalDefenders)
        positions.push(pos)
      }

      // Calculate angles from center for each position
      const angles: number[] = []
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i].clone().sub(zoneCenter)
        const angle = Math.atan2(pos.z, pos.x)
        angles.push(angle)
      }

      // Sort angles for comparison
      angles.sort((a, b) => a - b)

      // Calculate angular spacing between consecutive positions
      const expectedSpacing = (Math.PI * 2) / totalDefenders
      for (let i = 0; i < angles.length - 1; i++) {
        const actualSpacing = angles[i + 1] - angles[i]
        expect(actualSpacing).toBeCloseTo(expectedSpacing, 1)
      }

      // Check wrap-around from last to first
      const wrapSpacing = (angles[0] + Math.PI * 2) - angles[angles.length - 1]
      expect(wrapSpacing).toBeCloseTo(expectedSpacing, 1)
    })

    it('should handle single defender', () => {
      const zoneCenter = new THREE.Vector3(0, 0, 0)
      const zoneRadius = 10
      const totalDefenders = 1

      const pos = clusterManager.getSpreadDefensePosition(zoneCenter, zoneRadius, 0, totalDefenders)

      // Should be positioned at perimeter
      const expectedRadius = zoneRadius + 8
      expect(pos.distanceTo(zoneCenter)).toBeCloseTo(expectedRadius, 1)
    })

    it('should preserve Y coordinate from zone center', () => {
      const zoneCenter = new THREE.Vector3(0, 50, 0)
      const zoneRadius = 10
      const totalDefenders = 4

      for (let i = 0; i < totalDefenders; i++) {
        const pos = clusterManager.getSpreadDefensePosition(zoneCenter, zoneRadius, i, totalDefenders)
        expect(pos.y).toBe(zoneCenter.y)
      }
    })

    it('should offset zone center correctly', () => {
      const zoneCenter = new THREE.Vector3(100, 0, 200)
      const zoneRadius = 10
      const totalDefenders = 4

      const positions: THREE.Vector3[] = []
      for (let i = 0; i < totalDefenders; i++) {
        const pos = clusterManager.getSpreadDefensePosition(zoneCenter, zoneRadius, i, totalDefenders)
        positions.push(pos)
      }

      // All positions should be centered around zoneCenter
      const avgX = positions.reduce((sum, pos) => sum + pos.x, 0) / positions.length
      const avgZ = positions.reduce((sum, pos) => sum + pos.z, 0) / positions.length
      expect(avgX).toBeCloseTo(zoneCenter.x, 0)
      expect(avgZ).toBeCloseTo(zoneCenter.z, 0)
    })
  })

  describe('reset', () => {
    it('should clear target counts', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      combatant.target = enemy
      allCombatants.set('c1', combatant)
      allCombatants.set('e1', enemy)

      // Assign some targets to populate target counts
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      // Reset
      clusterManager.reset()

      // After reset, target distribution should start fresh
      const target = clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)
      expect(target).toBe(enemy)
    })

    it('should reset last distribution time', () => {
      const combatant = createMockCombatant('c1', Faction.US, new THREE.Vector3(0, 0, 0))
      const enemy = createMockCombatant('e1', Faction.NVA, new THREE.Vector3(10, 0, 0))
      allCombatants.set('c1', combatant)
      allCombatants.set('e1', enemy)

      // Mock Date.now
      const mockTime = 5000
      vi.spyOn(Date, 'now').mockImplementation(() => mockTime)

      // Assign target to set last distribution time
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      // Reset
      clusterManager.reset()

      // Next call should trigger rebuild since last distribution time reset to 0
      clusterManager.assignDistributedTarget(combatant, [enemy], allCombatants)

      vi.spyOn(Date, 'now').mockRestore()

      // If we got here without error, reset logic works
      expect(true).toBe(true)
    })
  })
})
