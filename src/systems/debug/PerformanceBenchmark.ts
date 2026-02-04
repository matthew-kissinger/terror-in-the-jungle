import * as THREE from 'three'
import { Logger } from '../../utils/Logger'

export interface BenchmarkResult {
  totalTimeMs: number
  avgPerRayMs: number
  p95Ms: number
  p99Ms: number
  iterations: number
  details?: {
    gridQueryTimeMs: number
    hitDetectionTimeMs: number
    terrainTimeMs: number
  }
}

export interface BenchmarkDependencies {
  hitDetection?: any
  chunkManager?: any
  combatants?: Map<string, any>
  spatialGridManager?: any
}

export class PerformanceBenchmark {
  private deps: BenchmarkDependencies = {}

  injectDependencies(deps: BenchmarkDependencies): void {
    this.deps = { ...this.deps, ...deps }
  }

  /**
   * Run a comprehensive benchmark for raycasting and hit detection
   */
  run(iterations: number): BenchmarkResult {
    Logger.info('performance', `[Perf] Starting benchmark with ${iterations} iterations...`)

    const rays = this.generateRandomRays(iterations)
    const samples: number[] = []

    const startTotal = performance.now()

    // 1. Benchmark Octree specifically if available
    const gridTime = this.benchmarkOctreeQueries(rays)

    // 2. Benchmark Full Hit Detection if available
    const hitTime = this.benchmarkHitDetection(rays, samples)

    // 3. Benchmark Terrain Raycast if available
    const terrainTime = this.benchmarkTerrainRaycast(rays)

    const totalTimeMs = performance.now() - startTotal

    const result: BenchmarkResult = {
      totalTimeMs,
      avgPerRayMs: samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0,
      p95Ms: this.percentile(samples, 0.95),
      p99Ms: this.percentile(samples, 0.99),
      iterations,
      details: {
        gridQueryTimeMs: gridTime,
        hitDetectionTimeMs: hitTime,
        terrainTimeMs: terrainTime
      }
    }

    Logger.info('performance', '[Perf] Benchmark complete:', result)
    return result
  }

  private generateRandomRays(count: number): THREE.Ray[] {
    const rays: THREE.Ray[] = []
    
    // Default world size
    const worldSize = 4000

    for (let i = 0; i < count; i++) {
      const origin = new THREE.Vector3(
        (Math.random() - 0.5) * worldSize,
        2 + Math.random() * 20, // 2-22m height
        (Math.random() - 0.5) * worldSize
      )

      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        (Math.random() - 0.5) * 0.2, // Shallow angles mostly
        Math.random() - 0.5
      ).normalize()

      rays.push(new THREE.Ray(origin, direction))
    }

    return rays
  }

  private benchmarkOctreeQueries(rays: THREE.Ray[]): number {
    const { spatialGridManager } = this.deps

    if (!spatialGridManager || !spatialGridManager.getIsInitialized()) {
      return 0
    }

    const start = performance.now()
    for (const ray of rays) {
      spatialGridManager.queryRay(ray.origin, ray.direction, 150)
    }
    return performance.now() - start
  }

  private benchmarkHitDetection(rays: THREE.Ray[], samples: number[]): number {
    const { hitDetection, combatants } = this.deps
    if (!hitDetection || !combatants) return 0

    // Faction for testing
    const Faction = { US: 'US', OPFOR: 'OPFOR' } as any

    const start = performance.now()
    for (const ray of rays) {
      const rayStart = performance.now()
      hitDetection.raycastCombatants(ray, Faction.US, combatants)
      samples.push(performance.now() - rayStart)
    }
    return performance.now() - start
  }

  private benchmarkTerrainRaycast(rays: THREE.Ray[]): number {
    const { chunkManager } = this.deps
    if (!chunkManager) return 0

    const start = performance.now()
    for (const ray of rays) {
      chunkManager.raycastTerrain(ray.origin, ray.direction, 150)
    }
    return performance.now() - start
  }

  private percentile(samples: number[], p: number): number {
    if (samples.length === 0) return 0
    const sorted = [...samples].sort((a, b) => a - b)
    const index = Math.ceil(p * sorted.length) - 1
    return sorted[index]
  }
}
