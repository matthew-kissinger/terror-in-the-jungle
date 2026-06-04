import { describe, it, expect } from 'vitest';
import {
  computeTailAttribution,
  type TailAttributionSample,
} from './perf-tail-attribution';

/**
 * Unit proof for combat-p99-tail-attribution (DEFEKT-3, L1). Drives the pure
 * attribution function with synthetic capture samples modeled on the spike's
 * superposition finding (Combat +2.0ms movement/AI; render/"Other" +2.9ms; cover
 * timers ≈0) and asserts the attribution localizes the tail correctly from a
 * single run, no baseline.
 */
describe('computeTailAttribution', () => {
  // A "good" steady-state sample (low p99) plus a "tail" sample (high p99) that
  // reproduces the spike: the Combat phase total is dominated by an UNATTRIBUTED
  // residual (the contour terrain-stall movement cost, which is not a named
  // aiMethodMs timer) and state.advancing, while the cover-search timers are ~0.
  function tailSample(): TailAttributionSample {
    return {
      ts: '2026-06-03T00:00:10.000Z',
      frameCount: 5000,
      avgFrameMs: 16.6,
      p99FrameMs: 45.0,
      maxFrameMs: 49.5,
      // Frame-level: Combat top at 18ms but render/Other is the larger half.
      systemTop: [
        { name: 'SystemUpdater.Combat', emaMs: 18.0, peakMs: 22.0 },
        { name: 'Renderer', emaMs: 12.0, peakMs: 16.0 },
        { name: 'Other', emaMs: 6.0, peakMs: 9.0 },
      ],
      combatBreakdown: {
        totalMs: 18.0,
        aiUpdateMs: 6.0,
        spatialSyncMs: 1.0,
        billboardUpdateMs: 0.5,
        effectPoolsMs: 0.3,
        influenceMapMs: 0.2,
        // -> namedChildren = 8.0; unattributed = 10.0 (the movement stall storm).
        aiStateMs: {
          'state.advancing': 4.5,
          'state.engaging': 1.0,
          'state.patrolling': 0.4,
        },
        aiMethodMs: {
          // Cover-search timers: negligible, as the spike predicts.
          'engage.suppression.initiate.coverGridQuery': 0.02,
          'engage.suppression.initiate.coverSearch': 0.01,
          'engage.cover.findBestCover': 0.03,
          'engage.suppression.initiate.computeFlankDestination': 0.05,
          // A non-cover AI method that costs more than the cover search.
          'engage.targetAcquisition': 0.8,
        },
        aiMethodCounts: {
          'engage.suppression.initiate.coverSearch': 2,
          'engage.targetAcquisition': 40,
        },
        closeEngagement: {
          engagement: {
            suppressionFlankCoverSearches: 2,
            suppressionFlankCoverSearchCapSkips: 1,
          },
        },
      },
    };
  }

  function goodSample(): TailAttributionSample {
    return {
      ts: '2026-06-03T00:00:05.000Z',
      frameCount: 2500,
      avgFrameMs: 14.0,
      p99FrameMs: 31.0,
      maxFrameMs: 33.0,
      systemTop: [{ name: 'SystemUpdater.Combat', emaMs: 12.0, peakMs: 14.0 }],
      combatBreakdown: {
        totalMs: 12.0,
        aiUpdateMs: 8.0,
        spatialSyncMs: 1.0,
        billboardUpdateMs: 0.5,
        effectPoolsMs: 0.3,
        influenceMapMs: 0.2,
        aiStateMs: { 'state.advancing': 1.0 },
        aiMethodMs: { 'engage.suppression.initiate.coverSearch': 0.01 },
      },
    };
  }

  it('returns undefined when no sample carries a combatBreakdown', () => {
    expect(computeTailAttribution([])).toBeUndefined();
    expect(
      computeTailAttribution([
        { ts: 't', frameCount: 1, p99FrameMs: 50 } as TailAttributionSample,
      ])
    ).toBeUndefined();
  });

  it('selects the highest-p99 sample as the tail window', () => {
    const attribution = computeTailAttribution([goodSample(), tailSample()]);
    expect(attribution).toBeDefined();
    // The 45ms-p99 sample wins over the 31ms one.
    expect(attribution!.p99FrameMs).toBe(45.0);
    expect(attribution!.sampleFrameCount).toBe(5000);
  });

  it('proves the cover search is NOT the tail driver (cover timers ~0)', () => {
    const a = computeTailAttribution([tailSample()])!;
    expect(a.coverSearch.coverGridQueryMs).toBeCloseTo(0.02, 5);
    expect(a.coverSearch.coverSearchMs).toBeCloseTo(0.01, 5);
    expect(a.coverSearch.totalCoverMs).toBeLessThan(0.1);
    // The headline verdict: cover does not dominate the ~45ms tail frame.
    expect(a.coverDominatesTail).toBe(false);
    expect(a.conclusion).toContain('cover is NOT the driver');
  });

  it('localizes the movement-stall cost as the Combat-phase unattributed residual', () => {
    const a = computeTailAttribution([tailSample()])!;
    // totalMs 18 - namedChildren 8 = 10ms unattributed (the contour stall storm),
    // which dwarfs the entire cover search (<0.1ms).
    expect(a.combat.unattributedMs).toBeCloseTo(10.0, 5);
    expect(a.combat.unattributedMs).toBeGreaterThan(a.coverSearch.totalCoverMs * 50);
    // state.advancing is the top AI-state cost (where stalled NPCs accrue time).
    expect(a.topAiStates[0]?.name).toBe('state.advancing');
  });

  it('exposes the render/Other superposition (combat is not the whole frame)', () => {
    const a = computeTailAttribution([tailSample()])!;
    // Combat system EMA 18ms vs a ~45ms frame -> >half the frame is render/Other.
    expect(a.combatVsOther.combatSystemMs).toBe(18.0);
    expect(a.combatVsOther.frameMs).toBe(45.0);
    expect(a.combatVsOther.otherMs).toBeCloseTo(27.0, 5);
    // Combat is the top *system*, but it is NOT >half the frame, so the tail is a
    // superposition -> a combat-only fix is not guaranteed to clear it.
    expect(a.combatDominatesTail).toBe(false);
    expect(a.conclusion).toContain('superposition');
  });

  it('ranks named AI methods and carries call counts', () => {
    const a = computeTailAttribution([tailSample()])!;
    // The non-cover AI method outranks every cover timer.
    expect(a.topAiMethods[0]?.name).toBe('engage.targetAcquisition');
    expect(a.topAiMethods[0]?.calls).toBe(40);
    // The cover timers are present but ranked below.
    const coverEntry = a.topAiMethods.find(
      (m) => m.name === 'engage.suppression.initiate.coverSearch'
    );
    expect(coverEntry?.calls).toBe(2);
  });

  it('carries the flank-cover activity counters for context', () => {
    const a = computeTailAttribution([tailSample()])!;
    expect(a.coverSearch.flankCoverSearches).toBe(2);
    expect(a.coverSearch.flankCoverSearchCapSkips).toBe(1);
  });

  it('flags cover as a factor when the cover timers genuinely dominate a frame', () => {
    // Counter-case: if a regression made the cover search expensive, the verdict
    // must flip. This guards against a vacuous "always says cover is innocent".
    const heavyCover: TailAttributionSample = {
      ts: 't',
      frameCount: 10,
      p99FrameMs: 20.0,
      systemTop: [{ name: 'SystemUpdater.Combat', emaMs: 19.0, peakMs: 20.0 }],
      combatBreakdown: {
        totalMs: 19.0,
        aiUpdateMs: 19.0,
        aiMethodMs: {
          'engage.suppression.initiate.coverSearch': 9.0,
          'engage.cover.findBestCover': 6.0,
        },
      },
    };
    const a = computeTailAttribution([heavyCover])!;
    expect(a.coverSearch.totalCoverMs).toBeGreaterThan(a.combatVsOther.frameMs * 0.1);
    expect(a.coverDominatesTail).toBe(true);
    expect(a.combatDominatesTail).toBe(true);
    expect(a.conclusion).toContain('COVER IS A FACTOR');
  });

  it('falls back to maxFrameMs then avgFrameMs when p99 is absent', () => {
    const noP99: TailAttributionSample = {
      ts: 't',
      frameCount: 1,
      maxFrameMs: 40.0,
      systemTop: [{ name: 'Combat', emaMs: 10, peakMs: 12 }],
      combatBreakdown: { totalMs: 10, aiUpdateMs: 5 },
    };
    const a = computeTailAttribution([noP99])!;
    // frameMs derives from maxFrameMs (40) when p99 is missing.
    expect(a.combatVsOther.frameMs).toBe(40.0);
  });
});
