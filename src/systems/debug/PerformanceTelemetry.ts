import * as THREE from 'three'
import { GPUTimingTelemetry, GPUTelemetry } from './GPUTimingTelemetry'
import { PerformanceBenchmark, BenchmarkResult, BenchmarkDependencies } from './PerformanceBenchmark'
import { FrameTimingTracker } from './FrameTimingTracker'
import { Logger } from '../../utils/Logger'
import {
  SystemTiming,
  FrameData,
  SpatialGridTelemetry,
  TelemetryReport,
  TerrainMergerTelemetry
} from './PerformanceTypes'

// Re-export types for convenience
export type {
  SystemTiming,
  FrameData,
  SpatialGridTelemetry,
  TelemetryReport,
  GPUTelemetry,
  BenchmarkResult,
  BenchmarkDependencies,
  TerrainMergerTelemetry
}

export class PerformanceTelemetry {
  private static instance: PerformanceTelemetry | null = null

  // Spatial grid telemetry (updated by SpatialGridManager)
  private spatialGridTelemetry: SpatialGridTelemetry = {
    initialized: false,
    entityCount: 0,
    queriesThisFrame: 0,
    avgQueryTimeMs: 0,
    fallbackCount: 0,
    lastSyncMs: 0
  }

  // Hit detection stats
  private hitDetectionStats = {
    shotsThisSession: 0,
    hitsThisSession: 0
  }

  // Terrain merger telemetry (updated externally by chunk manager)
  private terrainMergerTelemetry: TerrainMergerTelemetry | null = null

  // Sub-modules
  private gpuTiming = new GPUTimingTelemetry()
  private benchmark = new PerformanceBenchmark()
  private frameTiming = new FrameTimingTracker()

  private constructor() {
    // Expose to window for console debugging
    if (typeof window !== 'undefined') {
      (window as any).perf = {
        report: () => this.getReport(),
        validate: () => this.validate(),
        benchmark: (iterations: number = 1000) => this.runBenchmark(iterations),
        reset: () => this.reset()
      }
    }
  }

  static getInstance(): PerformanceTelemetry {
    if (!PerformanceTelemetry.instance) {
      PerformanceTelemetry.instance = new PerformanceTelemetry()
    }
    return PerformanceTelemetry.instance
  }

  /**
   * Inject dependencies required for benchmarking
   */
  injectBenchmarkDependencies(deps: BenchmarkDependencies): void {
    this.benchmark.injectDependencies(deps)
  }

  /**
   * Initialize GPU timing (call once with renderer)
   */
  initGPUTiming(renderer: THREE.WebGLRenderer): void {
    this.gpuTiming.init(renderer)
  }

  /**
   * Begin GPU timing measurement (call before renderer.render())
   */
  beginGPUTimer(): void {
    this.gpuTiming.beginTimer()
  }

  /**
   * End GPU timing measurement (call after renderer.render())
   */
  endGPUTimer(): void {
    this.gpuTiming.endTimer()
  }

  /**
   * Collect GPU timing result from previous frame (async, non-blocking)
   * Call once per frame after endGPUTimer()
   */
  collectGPUTime(): void {
    this.gpuTiming.collectTime()
  }

  /**
   * Get current GPU telemetry
   */
  getGPUTelemetry(): GPUTelemetry {
    return this.gpuTiming.getTelemetry()
  }

  /**
   * Call at the start of each frame
   */
  beginFrame(): void {
    this.frameTiming.beginFrame()
    // Reset per-frame counters
    this.spatialGridTelemetry.queriesThisFrame = 0
  }

  /**
   * Call before updating a system
   */
  beginSystem(name: string): void {
    this.frameTiming.beginSystem(name)
  }

  /**
   * Call after updating a system
   */
  endSystem(name: string): void {
    this.frameTiming.endSystem(name)
  }

  /**
   * Call at the end of each frame
   */
  endFrame(): void {
    this.frameTiming.endFrame()
  }

  /**
   * Set the budget for a specific system
   */
  setSystemBudget(name: string, budgetMs: number): void {
    this.frameTiming.setSystemBudget(name, budgetMs)
  }

  /**
   * Update spatial grid telemetry (called by SpatialGridManager)
   */
  updateSpatialGridTelemetry(telemetry: Partial<SpatialGridTelemetry>): void {
    Object.assign(this.spatialGridTelemetry, telemetry)
  }

  /**
   * Record a shot for hit detection stats
   */
  recordShot(hit: boolean): void {
    this.hitDetectionStats.shotsThisSession++
    if (hit) {
      this.hitDetectionStats.hitsThisSession++
    }
  }

  /**
   * Increment fallback counter (for when spatial grid can't be used)
   */
  recordFallback(): void {
    this.spatialGridTelemetry.fallbackCount++
  }

  /**
   * Update terrain merger telemetry (called by chunk manager)
   */
  updateTerrainMergerTelemetry(telemetry: TerrainMergerTelemetry | null): void {
    this.terrainMergerTelemetry = telemetry
  }

  /**
   * Get average frame time over history
   */
  getAvgFrameTime(): number {
    return this.frameTiming.getAvgFrameTime()
  }

  /**
   * Get percentage of frames over budget
   */
  getOverBudgetPercent(): number {
    return this.frameTiming.getOverBudgetPercent()
  }

  /**
   * Get system breakdown for display
   */
  getSystemBreakdown(): SystemTiming[] {
    return this.frameTiming.getSystemBreakdown()
  }

  /**
   * Get full telemetry report
   */
  getReport(): TelemetryReport {
    const avgFrameMs = this.getAvgFrameTime()
    const report: TelemetryReport = {
      fps: avgFrameMs > 0 ? 1000 / avgFrameMs : 0,
      avgFrameMs,
      overBudgetPercent: this.getOverBudgetPercent(),
      systemBreakdown: this.getSystemBreakdown(),
      spatialGrid: { ...this.spatialGridTelemetry },
      hitDetection: {
        shotsThisSession: this.hitDetectionStats.shotsThisSession,
        hitsThisSession: this.hitDetectionStats.hitsThisSession,
        hitRate:
          this.hitDetectionStats.shotsThisSession > 0
            ? this.hitDetectionStats.hitsThisSession / this.hitDetectionStats.shotsThisSession
            : 0
      },
      gpu: this.getGPUTelemetry()
    }

    // Add terrain merger telemetry if available
    if (this.terrainMergerTelemetry) {
      report.terrainMerger = { ...this.terrainMergerTelemetry }
    }

    return report
  }

  /**
   * Validation check for debugging
   */
  validate(): {
    spatialGrid: { initialized: boolean; entityCount: number; fallbackCount: number }
    hitDetection: { shotsThisSession: number; hitsThisSession: number; hitRate: number }
    frameBudget: { avgMs: number; overBudgetPercent: number }
  } {
    return {
      spatialGrid: {
        initialized: this.spatialGridTelemetry.initialized,
        entityCount: this.spatialGridTelemetry.entityCount,
        fallbackCount: this.spatialGridTelemetry.fallbackCount
      },
      hitDetection: {
        shotsThisSession: this.hitDetectionStats.shotsThisSession,
        hitsThisSession: this.hitDetectionStats.hitsThisSession,
        hitRate:
          this.hitDetectionStats.shotsThisSession > 0
            ? this.hitDetectionStats.hitsThisSession / this.hitDetectionStats.shotsThisSession
            : 0
      },
      frameBudget: {
        avgMs: this.getAvgFrameTime(),
        overBudgetPercent: this.getOverBudgetPercent()
      }
    }
  }

  /**
   * Run a comprehensive benchmark for raycasting and hit detection
   */
  runBenchmark(iterations: number): BenchmarkResult {
    return this.benchmark.run(iterations)
  }

  /**
   * Reset all telemetry data
   */
  reset(): void {
    this.frameTiming.reset()
    this.hitDetectionStats = { shotsThisSession: 0, hitsThisSession: 0 }
    this.spatialGridTelemetry = {
      initialized: false,
      entityCount: 0,
      queriesThisFrame: 0,
      avgQueryTimeMs: 0,
      fallbackCount: 0,
      lastSyncMs: 0
    }
    Logger.info('performance', '[Perf] Telemetry reset')
  }

  /**
   * Get formatted string for debug overlay
   */
  getDebugString(): string {
    const report = this.getReport()
    const lines = [
      `FPS: ${report.fps.toFixed(0)} | Frame: ${report.avgFrameMs.toFixed(1)}ms | Over: ${report.overBudgetPercent.toFixed(1)}%`,
      `Grid: ${this.spatialGridTelemetry.initialized ? 'OK' : 'UNINIT'} | Entities: ${this.spatialGridTelemetry.entityCount} | Fallbacks: ${this.spatialGridTelemetry.fallbackCount}`,
      `Shots: ${this.hitDetectionStats.shotsThisSession} | Hits: ${this.hitDetectionStats.hitsThisSession} | Rate: ${(report.hitDetection.hitRate * 100).toFixed(0)}%`
    ]

    // Add top 3 heaviest systems
    const topSystems = report.systemBreakdown.slice(0, 3)
    if (topSystems.length > 0) {
      const sysStr = topSystems.map(s => `${s.name}: ${s.emaMs.toFixed(1)}ms`).join(' | ')
      lines.push(sysStr)
    }

    return lines.join('\n')
  }
}

// Export singleton getter
export const performanceTelemetry = PerformanceTelemetry.getInstance()
