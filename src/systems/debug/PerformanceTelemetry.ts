import * as THREE from 'three'
import { GPUTimingTelemetry, GPUTelemetry } from './GPUTimingTelemetry'
import { PerformanceBenchmark, BenchmarkResult, BenchmarkDependencies } from './PerformanceBenchmark'
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

  private systems: Map<string, SystemTiming> = new Map()
  private frameHistory: FrameData[] = []
  private readonly FRAME_BUDGET_MS = 16.67 // 60fps target
  private readonly HISTORY_SIZE = 120 // 2 seconds at 60fps
  private readonly EMA_ALPHA = 0.1

  private currentFrame: {
    start: number
    systems: Record<string, { start: number; duration?: number }>
  } | null = null

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

  // Slow frame logging
  private lastSlowFrameLog = 0
  private readonly SLOW_FRAME_LOG_INTERVAL_MS = 1000 // Max 1 log per second

  // Sub-modules
  private gpuTiming = new GPUTimingTelemetry()
  private benchmark = new PerformanceBenchmark()

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
    this.currentFrame = {
      start: performance.now(),
      systems: {}
    }
    // Reset per-frame counters
    this.spatialGridTelemetry.queriesThisFrame = 0
  }

  /**
   * Call before updating a system
   */
  beginSystem(name: string): void {
    if (!this.currentFrame) return
    this.currentFrame.systems[name] = { start: performance.now() }
  }

  /**
   * Call after updating a system
   */
  endSystem(name: string): void {
    if (!this.currentFrame) return
    const sys = this.currentFrame.systems[name]
    if (!sys) return

    sys.duration = performance.now() - sys.start
    this.updateSystemEMA(name, sys.duration)
  }

  /**
   * Call at the end of each frame
   */
  endFrame(): void {
    if (!this.currentFrame) return

    const duration = performance.now() - this.currentFrame.start
    const overBudget = duration > this.FRAME_BUDGET_MS

    // Record frame data
    const frameData: FrameData = {
      timestamp: this.currentFrame.start,
      duration,
      overBudget,
      systems: {}
    }

    for (const [name, data] of Object.entries(this.currentFrame.systems)) {
      if (data.duration !== undefined) {
        frameData.systems[name] = data.duration
      }
    }

    this.frameHistory.push(frameData)
    if (this.frameHistory.length > this.HISTORY_SIZE) {
      this.frameHistory.shift()
    }

    // Log slow frames (throttled)
    if (duration > this.FRAME_BUDGET_MS * 1.5) {
      const now = performance.now()
      if (now - this.lastSlowFrameLog > this.SLOW_FRAME_LOG_INTERVAL_MS) {
        this.lastSlowFrameLog = now
        const slowSystems = this.getSlowSystemsThisFrame()
        if (slowSystems.length > 0) {
          console.warn(
            `[Perf] Slow frame: ${duration.toFixed(1)}ms - Heavy systems: ${slowSystems.join(', ')}`
          )
        }
      }
    }

    this.currentFrame = null
  }

  private updateSystemEMA(name: string, duration: number): void {
    let entry = this.systems.get(name)
    if (!entry) {
      entry = {
        name,
        budgetMs: this.FRAME_BUDGET_MS / 4, // Default budget per system
        lastMs: duration,
        emaMs: duration,
        peakMs: duration
      }
      this.systems.set(name, entry)
    } else {
      entry.lastMs = duration
      entry.emaMs = entry.emaMs * (1 - this.EMA_ALPHA) + duration * this.EMA_ALPHA
      entry.peakMs = Math.max(entry.peakMs, duration)
    }
  }

  private getSlowSystemsThisFrame(): string[] {
    if (!this.currentFrame) return []

    const slow: string[] = []
    for (const [name, data] of Object.entries(this.currentFrame.systems)) {
      if (data.duration && data.duration > 2.0) {
        slow.push(`${name}(${data.duration.toFixed(1)}ms)`)
      }
    }
    return slow
  }

  /**
   * Set the budget for a specific system
   */
  setSystemBudget(name: string, budgetMs: number): void {
    const entry = this.systems.get(name)
    if (entry) {
      entry.budgetMs = budgetMs
    }
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
    if (this.frameHistory.length === 0) return 16.67
    const sum = this.frameHistory.reduce((acc, f) => acc + f.duration, 0)
    return sum / this.frameHistory.length
  }

  /**
   * Get percentage of frames over budget
   */
  getOverBudgetPercent(): number {
    if (this.frameHistory.length === 0) return 0
    const overCount = this.frameHistory.filter(f => f.overBudget).length
    return (overCount / this.frameHistory.length) * 100
  }

  /**
   * Get system breakdown for display
   */
  getSystemBreakdown(): SystemTiming[] {
    return Array.from(this.systems.values()).sort((a, b) => b.emaMs - a.emaMs)
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
    this.systems.clear()
    this.frameHistory = []
    this.hitDetectionStats = { shotsThisSession: 0, hitsThisSession: 0 }
    this.spatialGridTelemetry = {
      initialized: false,
      entityCount: 0,
      queriesThisFrame: 0,
      avgQueryTimeMs: 0,
      fallbackCount: 0,
      lastSyncMs: 0
    }
    console.log('[Perf] Telemetry reset')
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
