import { SystemTiming, FrameData } from './PerformanceTypes'
import { Logger } from '../../utils/Logger'

export class FrameTimingTracker {
  private systems: Map<string, SystemTiming> = new Map()
  private frameHistory: FrameData[] = []
  private readonly FRAME_BUDGET_MS = 16.67 // 60fps target
  private readonly HISTORY_SIZE = 120 // 2 seconds at 60fps
  private readonly EMA_ALPHA = 0.1

  private currentFrame: {
    start: number
    systems: Record<string, { start: number; duration?: number }>
  } | null = null

  // Slow frame logging
  private lastSlowFrameLog = 0
  private readonly SLOW_FRAME_LOG_INTERVAL_MS = 1000 // Max 1 log per second

  /**
   * Call at the start of each frame
   */
  beginFrame(): void {
    this.currentFrame = {
      start: performance.now(),
      systems: {}
    }
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
          Logger.warn('performance',
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
   * Reset frame timing data
   */
  reset(): void {
    this.systems.clear()
    this.frameHistory = []
  }
}
