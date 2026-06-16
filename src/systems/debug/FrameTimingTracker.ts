// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { SystemTiming, FrameData } from './PerformanceTypes'
import { Logger } from '../../utils/Logger'
import { BoundedRingBuffer } from '../../core/BoundedRingBuffer'

export class FrameTimingTracker {
  private systems: Map<string, SystemTiming> = new Map()
  private readonly FRAME_BUDGET_MS = 16.67 // 60fps target
  private readonly HISTORY_SIZE = 120 // 2 seconds at 60fps
  private readonly EMA_ALPHA = 0.1
  private readonly frameHistory = new BoundedRingBuffer<FrameData>(this.HISTORY_SIZE)

  private currentFrameStart: number | null = null
  private readonly currentFrameSystemNames: string[] = []
  private readonly currentFrameSystemSeen: Set<string> = new Set()
  private readonly currentFrameSystemDurations: Record<string, number | undefined> = Object.create(null)

  // System start times tracked independently of the frame bracket so that
  // buckets opened/closed outside an explicit beginFrame/endFrame pair
  // (notably `RenderMain` / `RenderOverlay`, which fire in GameEngineLoop
  // after SystemUpdater already closed the frame) still produce EMA samples.
  // Without this, `getSystemBreakdown()` would silently drop those buckets.
  private pendingSystemStarts: Map<string, number> = new Map()

  // Slow frame logging
  private lastSlowFrameLog = 0
  private readonly SLOW_FRAME_LOG_INTERVAL_MS = 1000 // Max 1 log per second

  /**
   * Call at the start of each frame
   */
  beginFrame(): void {
    this.currentFrameStart = performance.now()
    this.currentFrameSystemNames.length = 0
    this.currentFrameSystemSeen.clear()
  }

  /**
   * Call before updating a system
   */
  beginSystem(name: string): void {
    const start = performance.now()
    this.pendingSystemStarts.set(name, start)
    if (this.currentFrameStart !== null) {
      if (!this.currentFrameSystemSeen.has(name)) {
        this.currentFrameSystemSeen.add(name)
        this.currentFrameSystemNames.push(name)
      }
      this.currentFrameSystemDurations[name] = undefined
    }
  }

  /**
   * Call after updating a system
   */
  endSystem(name: string): void {
    const start = this.pendingSystemStarts.get(name)
    if (start === undefined) return
    this.pendingSystemStarts.delete(name)

    const duration = performance.now() - start
    if (this.currentFrameStart !== null && this.currentFrameSystemSeen.has(name)) {
      this.currentFrameSystemDurations[name] = duration
    }
    this.updateSystemEMA(name, duration)
  }

  /**
   * Call at the end of each frame
   */
  endFrame(): void {
    if (this.currentFrameStart === null) return

    const duration = performance.now() - this.currentFrameStart
    const overBudget = duration > this.FRAME_BUDGET_MS

    // Record frame data
    const frameData: FrameData = {
      timestamp: this.currentFrameStart,
      duration,
      overBudget,
      systems: {}
    }

    for (let index = 0; index < this.currentFrameSystemNames.length; index++) {
      const name = this.currentFrameSystemNames[index]
      const durationMs = this.currentFrameSystemDurations[name]
      if (durationMs !== undefined) {
        frameData.systems[name] = durationMs
      }
    }

    this.frameHistory.push(frameData)

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

    this.currentFrameStart = null
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
    if (this.currentFrameStart === null) return []

    const slow: string[] = []
    for (let index = 0; index < this.currentFrameSystemNames.length; index++) {
      const name = this.currentFrameSystemNames[index]
      const durationMs = this.currentFrameSystemDurations[name]
      if (durationMs && durationMs > 2.0) {
        slow.push(`${name}(${durationMs.toFixed(1)}ms)`)
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
    let sum = 0
    const frameCount = this.frameHistory.forEachLatest(frame => {
      sum += frame.duration
    })
    if (frameCount === 0) return 16.67
    return sum / frameCount
  }

  /**
   * Get percentage of frames over budget
   */
  getOverBudgetPercent(): number {
    let overCount = 0
    const frameCount = this.frameHistory.forEachLatest(frame => {
      if (frame.overBudget) overCount++
    })
    if (frameCount === 0) return 0
    return (overCount / frameCount) * 100
  }

  /**
   * Get system breakdown for display
   */
  getSystemBreakdown(): SystemTiming[] {
    return Array.from(this.systems.values()).sort((a, b) => b.emaMs - a.emaMs)
  }

  /**
   * Get the highest last-frame timings without sorting the whole system map.
   */
  getTopSystemBreakdownByLast(limit: number): SystemTiming[] {
    const max = Math.max(0, Math.floor(limit))
    if (max === 0) return []
    const output: SystemTiming[] = []
    for (const timing of this.systems.values()) {
      if (!Number.isFinite(timing.lastMs) || timing.lastMs < 0) {
        continue
      }
      let insertAt = 0
      while (insertAt < output.length && output[insertAt].lastMs >= timing.lastMs) {
        insertAt++
      }
      if (insertAt >= max) {
        continue
      }
      const nextLength = Math.min(output.length + 1, max)
      for (let index = nextLength - 1; index > insertAt; index--) {
        output[index] = output[index - 1]
      }
      output[insertAt] = timing
      output.length = nextLength
    }
    return output
  }

  /**
   * Reset frame timing data
   */
  reset(): void {
    this.systems.clear()
    this.frameHistory.clear()
    this.pendingSystemStarts.clear()
    this.currentFrameStart = null
    this.currentFrameSystemNames.length = 0
    this.currentFrameSystemSeen.clear()
  }
}
