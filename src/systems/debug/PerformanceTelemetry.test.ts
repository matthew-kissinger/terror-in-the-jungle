import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../../utils/Logger'

const frameTimingSpies = {
  beginFrame: vi.fn(),
  beginSystem: vi.fn(),
  endSystem: vi.fn(),
  endFrame: vi.fn(),
  setSystemBudget: vi.fn(),
  getAvgFrameTime: vi.fn(() => 16.67),
  getOverBudgetPercent: vi.fn(() => 0),
  getSystemBreakdown: vi.fn(() => []),
  reset: vi.fn()
}

const gpuTelemetryMock = {
  available: true,
  gpuTimeMs: 1.5,
  drawCalls: 12,
  triangles: 345,
  geometries: 7,
  textures: 9,
  programs: 2
}

const gpuTimingSpies = {
  init: vi.fn(),
  beginTimer: vi.fn(),
  endTimer: vi.fn(),
  collectTime: vi.fn(),
  getTelemetry: vi.fn(() => gpuTelemetryMock)
}

const benchmarkResultMock = {
  totalTimeMs: 10,
  avgPerRayMs: 0.2,
  p95Ms: 0.5,
  p99Ms: 0.9,
  iterations: 50
}

const benchmarkSpies = {
  injectDependencies: vi.fn(),
  run: vi.fn(() => benchmarkResultMock)
}

vi.mock('three', () => ({
  WebGLRenderer: class {}
}))

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('./GPUTimingTelemetry', () => ({
  GPUTimingTelemetry: class {
    init = gpuTimingSpies.init
    beginTimer = gpuTimingSpies.beginTimer
    endTimer = gpuTimingSpies.endTimer
    collectTime = gpuTimingSpies.collectTime
    getTelemetry = gpuTimingSpies.getTelemetry
  }
}))

vi.mock('./PerformanceBenchmark', () => ({
  PerformanceBenchmark: class {
    injectDependencies = benchmarkSpies.injectDependencies
    run = benchmarkSpies.run
  }
}))

vi.mock('./FrameTimingTracker', () => ({
  FrameTimingTracker: class {
    beginFrame = frameTimingSpies.beginFrame
    beginSystem = frameTimingSpies.beginSystem
    endSystem = frameTimingSpies.endSystem
    endFrame = frameTimingSpies.endFrame
    setSystemBudget = frameTimingSpies.setSystemBudget
    getAvgFrameTime = frameTimingSpies.getAvgFrameTime
    getOverBudgetPercent = frameTimingSpies.getOverBudgetPercent
    getSystemBreakdown = frameTimingSpies.getSystemBreakdown
    reset = frameTimingSpies.reset
  }
}))

async function loadTelemetry(withWindow: boolean = true, opts?: { telemetryEnabled?: boolean; search?: string }) {
  vi.resetModules()
  if (typeof opts?.telemetryEnabled === 'boolean') {
    ;(globalThis as any).__ENABLE_PERF_TELEMETRY__ = opts.telemetryEnabled
  } else {
    delete (globalThis as any).__ENABLE_PERF_TELEMETRY__
  }
  if (withWindow) {
    ;(globalThis as any).window = { location: { search: opts?.search ?? '' } }
  } else {
    delete (globalThis as any).window
  }
  const module = await import('./PerformanceTelemetry')
  return {
    PerformanceTelemetry: module.PerformanceTelemetry,
    performanceTelemetry: module.performanceTelemetry,
    instance: module.PerformanceTelemetry.getInstance(),
    windowRef: (globalThis as any).window
  }
}

describe('PerformanceTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    frameTimingSpies.getAvgFrameTime.mockReturnValue(16.67)
    frameTimingSpies.getOverBudgetPercent.mockReturnValue(0)
    frameTimingSpies.getSystemBreakdown.mockReturnValue([])
    gpuTimingSpies.getTelemetry.mockReturnValue(gpuTelemetryMock)
    benchmarkSpies.run.mockReturnValue(benchmarkResultMock)
  })

  it('exposes perf API on window when available', async () => {
    const { windowRef } = await loadTelemetry(true)
    expect(windowRef).toBeDefined()
    expect(windowRef.perf).toBeDefined()
    expect(typeof windowRef.perf.report).toBe('function')
    expect(typeof windowRef.perf.validate).toBe('function')
    expect(typeof windowRef.perf.benchmark).toBe('function')
    expect(typeof windowRef.perf.reset).toBe('function')
  })

  it('getInstance returns the same singleton and reset clears core state', async () => {
    const { PerformanceTelemetry, instance } = await loadTelemetry(true)
    const again = PerformanceTelemetry.getInstance()
    expect(again).toBe(instance)

    instance.updateSpatialGridTelemetry({ initialized: true, entityCount: 12, queriesThisFrame: 4 })
    instance.recordShot(true)
    instance.recordShot(false)

    instance.reset()

    expect(frameTimingSpies.reset).toHaveBeenCalled()
    expect(Logger.info).toHaveBeenCalledWith('performance', '[Perf] Telemetry reset')

    const report = instance.getReport()
    expect(report.spatialGrid.initialized).toBe(false)
    expect(report.spatialGrid.entityCount).toBe(0)
    expect(report.spatialGrid.queriesThisFrame).toBe(0)
    expect(report.hitDetection.shotsThisSession).toBe(0)
    expect(report.hitDetection.hitsThisSession).toBe(0)
    expect(report.hitDetection.hitRate).toBe(0)
  })

  it('tracks frames and resets per-frame spatial grid counters', async () => {
    const { instance } = await loadTelemetry()

    instance.updateSpatialGridTelemetry({ queriesThisFrame: 9 })
    instance.beginFrame()
    instance.endFrame()

    const report = instance.getReport()
    expect(frameTimingSpies.beginFrame).toHaveBeenCalledTimes(1)
    expect(frameTimingSpies.endFrame).toHaveBeenCalledTimes(1)
    expect(report.spatialGrid.queriesThisFrame).toBe(0)

    instance.beginFrame()
    instance.endFrame()
    expect(frameTimingSpies.beginFrame).toHaveBeenCalledTimes(2)
    expect(frameTimingSpies.endFrame).toHaveBeenCalledTimes(2)
  })

  it('updates spatial grid telemetry and fallback count', async () => {
    const { instance } = await loadTelemetry()

    instance.updateSpatialGridTelemetry({
      initialized: true,
      entityCount: 42,
      queriesThisFrame: 3,
      avgQueryTimeMs: 1.25,
      fallbackCount: 2,
      lastSyncMs: 15
    })
    instance.recordFallback()

    const report = instance.getReport()
    expect(report.spatialGrid.initialized).toBe(true)
    expect(report.spatialGrid.entityCount).toBe(42)
    expect(report.spatialGrid.queriesThisFrame).toBe(3)
    expect(report.spatialGrid.avgQueryTimeMs).toBe(1.25)
    expect(report.spatialGrid.fallbackCount).toBe(3)
    expect(report.spatialGrid.lastSyncMs).toBe(15)
  })

  it('tracks hit detection stats and computes accuracy', async () => {
    const { instance } = await loadTelemetry()

    instance.recordShot(false)
    instance.recordShot(true)
    instance.recordShot(true)

    const report = instance.getReport()
    expect(report.hitDetection.shotsThisSession).toBe(3)
    expect(report.hitDetection.hitsThisSession).toBe(2)
    expect(report.hitDetection.hitRate).toBeCloseTo(2 / 3)
  })

  it('handles zero shots without divide-by-zero in hit rate', async () => {
    const { instance } = await loadTelemetry()

    const report = instance.getReport()
    expect(report.hitDetection.shotsThisSession).toBe(0)
    expect(report.hitDetection.hitsThisSession).toBe(0)
    expect(report.hitDetection.hitRate).toBe(0)
  })

  it('stores terrain merger telemetry when provided', async () => {
    const { instance } = await loadTelemetry()

    const telemetry = {
      activeRings: 2,
      totalChunks: 128,
      pendingMerge: true,
      estimatedDrawCallSavings: 40,
      enabled: true
    }

    instance.updateTerrainMergerTelemetry(telemetry)

    const report = instance.getReport()
    expect(report.terrainMerger).toEqual(telemetry)
  })

  it('generates a complete telemetry report with computed fps', async () => {
    const { instance } = await loadTelemetry()

    frameTimingSpies.getAvgFrameTime.mockReturnValue(20)
    frameTimingSpies.getOverBudgetPercent.mockReturnValue(12.5)
    frameTimingSpies.getSystemBreakdown.mockReturnValue([
      { name: 'render', budgetMs: 5, lastMs: 6, emaMs: 6, peakMs: 8 }
    ])

    instance.updateSpatialGridTelemetry({ initialized: true, entityCount: 5 })
    instance.recordShot(true)

    const report = instance.getReport()
    expect(report.fps).toBeCloseTo(50)
    expect(report.avgFrameMs).toBe(20)
    expect(report.overBudgetPercent).toBe(12.5)
    expect(report.systemBreakdown[0].name).toBe('render')
    expect(report.spatialGrid.initialized).toBe(true)
    expect(report.hitDetection.shotsThisSession).toBe(1)
    expect(report.gpu).toEqual(gpuTelemetryMock)
  })

  it('uses zero fps when average frame time is zero', async () => {
    const { instance } = await loadTelemetry()

    frameTimingSpies.getAvgFrameTime.mockReturnValue(0)
    const report = instance.getReport()
    expect(report.fps).toBe(0)
    expect(report.avgFrameMs).toBe(0)
  })

  it('returns structured validation data', async () => {
    const { instance } = await loadTelemetry()

    instance.updateSpatialGridTelemetry({ initialized: true, entityCount: 3, fallbackCount: 1 })
    instance.recordShot(true)
    instance.recordShot(false)

    frameTimingSpies.getAvgFrameTime.mockReturnValue(18)
    frameTimingSpies.getOverBudgetPercent.mockReturnValue(5)

    const validation = instance.validate()
    expect(validation.spatialGrid).toEqual({
      initialized: true,
      entityCount: 3,
      fallbackCount: 1
    })
    expect(validation.hitDetection.shotsThisSession).toBe(2)
    expect(validation.hitDetection.hitsThisSession).toBe(1)
    expect(validation.hitDetection.hitRate).toBeCloseTo(0.5)
    expect(validation.frameBudget).toEqual({
      avgMs: 18,
      overBudgetPercent: 5
    })
  })

  it('defaults telemetry off when no explicit enable flags are present', async () => {
    const { instance } = await loadTelemetry(true, { telemetryEnabled: false, search: '' })
    expect(instance.isEnabled()).toBe(false)
  })

  it('enables telemetry automatically in sandbox query mode', async () => {
    const { instance } = await loadTelemetry(true, { search: '?sandbox=true' })
    expect(instance.isEnabled()).toBe(true)
  })
})
