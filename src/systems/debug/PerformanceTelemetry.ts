import * as THREE from 'three'

export interface SystemTiming {
  name: string
  budgetMs: number
  lastMs: number
  emaMs: number
  peakMs: number
}

export interface FrameData {
  timestamp: number
  duration: number
  overBudget: boolean
  systems: Record<string, number>
}

export interface SpatialGridTelemetry {
  initialized: boolean
  entityCount: number
  queriesThisFrame: number
  avgQueryTimeMs: number
  fallbackCount: number
  lastSyncMs: number
}

export interface GPUTelemetry {
  available: boolean
  gpuTimeMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

export interface TelemetryReport {
  fps: number
  avgFrameMs: number
  overBudgetPercent: number
  systemBreakdown: SystemTiming[]
  spatialGrid: SpatialGridTelemetry
  hitDetection: {
    shotsThisSession: number
    hitsThisSession: number
    hitRate: number
  }
  gpu: GPUTelemetry
}

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

  // Slow frame logging
  private lastSlowFrameLog = 0
  private readonly SLOW_FRAME_LOG_INTERVAL_MS = 1000 // Max 1 log per second

  // Dependencies for benchmark (injected at runtime)
  private benchmarkDeps: {
    hitDetection?: any
    chunkManager?: any
    combatants?: Map<string, any>
    spatialGridManager?: any
  } = {}

  // GPU timing (EXT_disjoint_timer_query_webgl2)
  private gpuTimerExt: any = null
  private gpuQuery: WebGLQuery | null = null
  private gpuTimeMs: number = 0
  private gpuTimingAvailable: boolean = false
  private renderer: THREE.WebGLRenderer | null = null

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
  injectBenchmarkDependencies(deps: {
    hitDetection?: any
    chunkManager?: any
    combatants?: Map<string, any>
    spatialGridManager?: any
  }): void {
    this.benchmarkDeps = { ...this.benchmarkDeps, ...deps }
  }

  /**
   * Initialize GPU timing (call once with renderer)
   */
  initGPUTiming(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer
    const gl = renderer.getContext() as WebGL2RenderingContext

    if (!gl) {
      console.warn('[Perf] WebGL2 context not available for GPU timing')
      return
    }

    this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')

    if (this.gpuTimerExt) {
      this.gpuTimingAvailable = true
      console.log('[Perf] GPU timing enabled (EXT_disjoint_timer_query_webgl2)')
    } else {
      console.log('[Perf] GPU timing unavailable (extension not supported)')
    }
  }

  /**
   * Begin GPU timing measurement (call before renderer.render())
   */
  beginGPUTimer(): void {
    if (!this.gpuTimingAvailable || !this.renderer || this.gpuQuery) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
    this.gpuQuery = gl.createQuery()

    if (this.gpuQuery) {
      gl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, this.gpuQuery)
    }
  }

  /**
   * End GPU timing measurement (call after renderer.render())
   */
  endGPUTimer(): void {
    if (!this.gpuTimingAvailable || !this.renderer || !this.gpuQuery) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
    gl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT)
  }

  /**
   * Collect GPU timing result from previous frame (async, non-blocking)
   * Call once per frame after endGPUTimer()
   */
  collectGPUTime(): void {
    if (!this.gpuQuery || !this.renderer) return

    const gl = this.renderer.getContext() as WebGL2RenderingContext
    const available = gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT_AVAILABLE)
    const disjoint = gl.getParameter(this.gpuTimerExt.GPU_DISJOINT_EXT)

    if (available && !disjoint) {
      const ns = gl.getQueryParameter(this.gpuQuery, gl.QUERY_RESULT)
      this.gpuTimeMs = ns / 1e6 // Convert nanoseconds to milliseconds
    }

    if (available || disjoint) {
      gl.deleteQuery(this.gpuQuery)
      this.gpuQuery = null
    }
  }

  /**
   * Get current GPU telemetry
   */
  getGPUTelemetry(): GPUTelemetry {
    if (!this.renderer) {
      return {
        available: false,
        gpuTimeMs: 0,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0
      }
    }

    const info = this.renderer.info
    return {
      available: this.gpuTimingAvailable,
      gpuTimeMs: this.gpuTimeMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: (info.memory as any).programs ?? 0
    }
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
    return {
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
    console.log(`[Perf] Starting benchmark with ${iterations} iterations...`)

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

    console.log('[Perf] Benchmark complete:', result)
    return result
  }

  private generateRandomRays(count: number): THREE.Ray[] {
    const rays: THREE.Ray[] = []
    const { spatialGridManager } = this.benchmarkDeps
    
    // Get world size from manager if available, otherwise default to 4000
    let worldSize = 4000

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
    const { spatialGridManager } = this.benchmarkDeps

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
    const { hitDetection, combatants } = this.benchmarkDeps
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
    const { chunkManager } = this.benchmarkDeps
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
