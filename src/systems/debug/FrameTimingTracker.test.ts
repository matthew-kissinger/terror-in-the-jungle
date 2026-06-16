// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameTimingTracker } from './FrameTimingTracker'
import { BoundedRingBuffer } from '../../core/BoundedRingBuffer'

function runBracketedFrame(tracker: FrameTimingTracker, work?: () => void): void {
  tracker.beginFrame()
  if (work) work()
  tracker.endFrame()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FrameTimingTracker.getSystemBreakdown', () => {
  it('includes buckets that begin and end inside a frame bracket', () => {
    const tracker = new FrameTimingTracker()

    runBracketedFrame(tracker, () => {
      tracker.beginSystem('Combat')
      tracker.endSystem('Combat')
    })

    const breakdown = tracker.getSystemBreakdown()
    const names = breakdown.map(entry => entry.name)
    expect(names).toContain('Combat')
  })

  it('finalizes frame system timings without allocating Object.entries()', () => {
    const tracker = new FrameTimingTracker()
    const entriesSpy = vi.spyOn(Object, 'entries')

    try {
      runBracketedFrame(tracker, () => {
        tracker.beginSystem('Combat')
        tracker.endSystem('Combat')
      })

      expect(entriesSpy).not.toHaveBeenCalled()
      expect(tracker.getSystemBreakdown().map(entry => entry.name)).toContain('Combat')
    } finally {
      entriesSpy.mockRestore()
    }
  })

  it('surfaces RenderMain and RenderOverlay when they bracket outside an active frame', () => {
    // Mirrors the real call order: SystemUpdater opens and closes the frame
    // around game-system updates, then GameEngineLoop measures the render
    // submission buckets after endFrame() has already fired. The tracker
    // must still attribute those samples so render cost surfaces in the
    // mobile-emulation systemBreakdown.
    const tracker = new FrameTimingTracker()

    runBracketedFrame(tracker, () => {
      tracker.beginSystem('Combat')
      tracker.endSystem('Combat')
    })

    tracker.beginSystem('RenderMain')
    tracker.endSystem('RenderMain')

    tracker.beginSystem('RenderOverlay')
    tracker.endSystem('RenderOverlay')

    const names = tracker.getSystemBreakdown().map(entry => entry.name)
    expect(names).toContain('RenderMain')
    expect(names).toContain('RenderOverlay')
  })

  it('records non-negative durations for buckets opened outside a frame bracket', () => {
    const tracker = new FrameTimingTracker()

    tracker.beginSystem('RenderMain')
    tracker.endSystem('RenderMain')

    const renderMain = tracker.getSystemBreakdown().find(entry => entry.name === 'RenderMain')
    expect(renderMain).toBeDefined()
    expect(renderMain!.lastMs).toBeGreaterThanOrEqual(0)
    expect(renderMain!.emaMs).toBeGreaterThanOrEqual(0)
  })

  it('reset() drops both bracketed and out-of-bracket bucket history', () => {
    const tracker = new FrameTimingTracker()

    runBracketedFrame(tracker, () => {
      tracker.beginSystem('Combat')
      tracker.endSystem('Combat')
    })
    tracker.beginSystem('RenderMain')
    tracker.endSystem('RenderMain')

    expect(tracker.getSystemBreakdown().length).toBeGreaterThan(0)

    tracker.reset()

    expect(tracker.getSystemBreakdown()).toEqual([])
  })

  it('returns top last-frame timings without sorting the full breakdown', () => {
    const tracker = new FrameTimingTracker()
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const sortSpy = vi.spyOn(Array.prototype, 'sort')

    const recordSystem = (name: string, durationMs: number): void => {
      tracker.beginSystem(name)
      now += durationMs
      tracker.endSystem(name)
      now += 1
    }

    try {
      recordSystem('AI', 4)
      recordSystem('Render', 7)
      recordSystem('Audio', 2)
      recordSystem('Terrain', 5)

      const top = tracker.getTopSystemBreakdownByLast(2)

      expect(sortSpy).not.toHaveBeenCalled()
      expect(top.map(entry => entry.name)).toEqual(['Render', 'Terrain'])
    } finally {
      sortSpy.mockRestore()
    }
  })
})

describe('FrameTimingTracker frame history', () => {
  it('bases aggregate frame metrics on the latest 120 frames', () => {
    const tracker = new FrameTimingTracker()
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const filterSpy = vi.spyOn(Array.prototype, 'filter')
    const reduceSpy = vi.spyOn(Array.prototype, 'reduce')
    const snapshotSpy = vi.spyOn(BoundedRingBuffer.prototype, 'snapshotLatest')

    const recordFrame = (durationMs: number): void => {
      tracker.beginFrame()
      now += durationMs
      tracker.endFrame()
      now += 1
    }

    recordFrame(24)
    for (let index = 0; index < 120; index++) {
      recordFrame(1)
    }

    try {
      expect(tracker.getAvgFrameTime()).toBeCloseTo(1, 5)
      expect(tracker.getOverBudgetPercent()).toBe(0)
      expect(reduceSpy).not.toHaveBeenCalled()
      expect(filterSpy).not.toHaveBeenCalled()
      expect(snapshotSpy).not.toHaveBeenCalled()
    } finally {
      snapshotSpy.mockRestore()
      reduceSpy.mockRestore()
      filterSpy.mockRestore()
    }
  })

  it('counts over-budget frames without allocating a filtered frame array', () => {
    const tracker = new FrameTimingTracker()
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const filterSpy = vi.spyOn(Array.prototype, 'filter')
    const snapshotSpy = vi.spyOn(BoundedRingBuffer.prototype, 'snapshotLatest')

    const recordFrame = (durationMs: number): void => {
      tracker.beginFrame()
      now += durationMs
      tracker.endFrame()
      now += 1
    }

    recordFrame(10)
    recordFrame(20)
    recordFrame(40)
    recordFrame(12)

    try {
      expect(tracker.getOverBudgetPercent()).toBe(50)
      expect(filterSpy).not.toHaveBeenCalled()
      expect(snapshotSpy).not.toHaveBeenCalled()
    } finally {
      snapshotSpy.mockRestore()
      filterSpy.mockRestore()
    }
  })
})
