import { describe, expect, it } from 'vitest'
import { FrameTimingTracker } from './FrameTimingTracker'

function runBracketedFrame(tracker: FrameTimingTracker, work?: () => void): void {
  tracker.beginFrame()
  if (work) work()
  tracker.endFrame()
}

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
})
