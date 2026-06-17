// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function installObserverHarness(
  driverSnapshot: Record<string, unknown> = { botState: 'ENGAGE', firingHeld: true },
  options: { capturePresentationContext?: boolean } = {},
) {
  const source = readFileSync(new URL('./perf-browser-observers.js', import.meta.url), 'utf8');
  const callbacksByType = new Map<string, (list: { getEntries: () => unknown[] }) => void>();
  let nowMs = 0;
  class FakeWebGLRenderingContext {
    __uploadDurationMs = 0;
    createTexture(): Record<string, unknown> {
      return {};
    }
    activeTexture(_unit: number): void {}
    bindTexture(_target: number, _texture: unknown): void {}
    texImage2D(): void {
      nowMs += Number(this.__uploadDurationMs || 0);
    }
  }
  const window = {
    __metrics: { frameCount: 0 },
    __presentationEpochContext: {
      getLatestContext: () => ({ camera: { yawDeg: 1, pitchDeg: 2 } }),
    },
    __perfHarnessDriverState: {
      getDebugSnapshot: () => driverSnapshot,
    },
    __TIJ_PERF_CAPTURE_PRESENTATION_CONTEXT__: options.capturePresentationContext ?? true,
    WebGLRenderingContext: FakeWebGLRenderingContext,
  };
  let rafCallback = null;
  let rafHandle = 0;
  class FakePerformanceObserver {
    static supportedEntryTypes = ['longtask', 'long-animation-frame', 'resource'];
    constructor(private readonly callback: (list: { getEntries: () => unknown[] }) => void) {}
    observe(options: { type?: string }): void {
      if (options.type) callbacksByType.set(options.type, this.callback);
    }
    disconnect(): void {}
  }
  const context = {
    window,
    document: { visibilityState: 'visible' },
    PerformanceObserver: FakePerformanceObserver,
    performance: {
      now: () => nowMs,
      clearMeasures: () => {},
      clearResourceTimings: () => {},
      setResourceTimingBufferSize: () => {},
    },
    requestAnimationFrame: (callback) => {
      rafCallback = callback;
      rafHandle += 1;
      return rafHandle;
    },
    cancelAnimationFrame: () => {},
    Date: { now: () => 1234 },
  };

  runInNewContext(source, context);
  if (!window.__perfHarnessObservers || typeof rafCallback !== 'function') {
    throw new Error('perf observer harness did not install');
  }

  return {
    observer: window.__perfHarnessObservers,
    createWebglContext: () => new FakeWebGLRenderingContext(),
    tick: (timestamp) => {
      window.__metrics.frameCount += 1;
      rafCallback(timestamp);
    },
    trigger: (type: string, entries: unknown[]) => {
      const callback = callbacksByType.get(type);
      if (!callback) throw new Error(`No observer for ${type}`);
      callback({ getEntries: () => entries });
    },
  };
}

describe('perf-browser-observers presentation epochs', () => {
  it('retains bounded chronological rAF-gap epochs without losing latest entries', () => {
    const { observer, tick } = installObserverHarness();

    for (let index = 0; index < 4102; index++) {
      tick(index * 26);
    }

    const allEpochs = observer.getPresentationEpochs();
    expect(allEpochs).toHaveLength(4096);
    expect(allEpochs[0].seq).toBe(allEpochs.at(-1).seq - 4095);
    expect(allEpochs.at(-1).gapMs).toBe(26);

    const latestThree = observer.getPresentationEpochs({ limit: 3 });
    expect(latestThree.map((entry) => entry.seq)).toEqual(
      allEpochs.slice(-3).map((entry) => entry.seq),
    );

    const lastSeq = allEpochs.at(-1).seq;
    expect(observer.getPresentationEpochs({ sinceSeq: lastSeq - 2 }).map((entry) => entry.seq)).toEqual([
      lastSeq - 1,
      lastSeq,
    ]);

    expect(observer.getPresentationEpochs({ sinceSeq: lastSeq - 10, limit: 3 }).map((entry) => entry.seq)).toEqual([
      lastSeq - 2,
      lastSeq - 1,
      lastSeq,
    ]);
  });

  it('records rAF time over the 60Hz budget separately from dropped-frame count', () => {
    const { observer, tick } = installObserverHarness();

    tick(0);
    tick(16);
    tick(42);
    tick(92);
    tick(112);

    const drained = observer.drain();
    expect(drained.totals.rafCadence.intervalCount).toBe(4);
    expect(drained.totals.rafCadence.estimatedDropped60HzFrames).toBe(3);
    expect(drained.totals.rafCadence.overBudget60HzMs).toBeCloseTo(46, 4);
    expect(drained.totals.rafCadence.droppedFrameTime60HzMs).toBeCloseTo(42.6667, 4);
    expect(drained.recent.rafCadence.entries).toHaveLength(2);
    expect(drained.recent.rafCadence.overBudget60HzMs).toBeCloseTo(42.6667, 4);
    expect(drained.recent.rafCadence.droppedFrameTime60HzMs).toBeCloseTo(42.6667, 4);
    expect(drained.recent.rafCadence.entries[0].overBudget60HzMs).toBeCloseTo(9.3333, 4);
    expect(drained.recent.rafCadence.entries[0].droppedFrameTime60HzMs).toBeCloseTo(9.3333, 4);
    expect(observer.getPresentationEpochs().at(-1).droppedFrameTime60HzMs).toBeCloseTo(33.3333, 4);
  });

  it('copies latest driver view and fire-gate telemetry into rAF gap context', () => {
    const driverSnapshot = {
      botState: 'ENGAGE',
      firingHeld: true,
      shotsFired: 7,
      maxViewYawStepDeg: 12,
      maxViewPitchStepDeg: 4,
      viewSlewClampCount: 3,
      lastViewStepYawDeg: 11.8,
      lastViewStepPitchDeg: 3.7,
      lastViewYawClamped: true,
      lastViewPitchClamped: false,
      lastViewTargetKind: 'aim_target',
      lastViewAnchorResyncChanged: true,
      lastViewAnchorResyncYawDeg: 2.5,
      lastViewAnchorResyncPitchDeg: 0.5,
      lastViewUpdateAtMs: 4567,
      lastAimDot: 0.92,
      lastFireIntent: true,
      lastAimGatePassed: true,
      lastAimGateReason: 'ok',
      lastFireLosGatePassed: false,
      lastFireProbe: {
        aimDot: 0.92,
        aimReason: 'ok',
        losStatus: 'blocked',
        losReason: 'terrain_hit_before_target',
      },
      maxAimMovementDivergenceDeg: 18,
    };
    const { observer, tick } = installObserverHarness(driverSnapshot);

    tick(0);
    tick(50);

    const latestEpoch = observer.getPresentationEpochs().at(-1);
    expect(latestEpoch?.harnessContext).toMatchObject({
      botState: 'ENGAGE',
      firingHeld: true,
      shotsFired: 7,
      lastViewStepYawDeg: 11.8,
      lastViewStepPitchDeg: 3.7,
      lastViewYawClamped: true,
      lastViewPitchClamped: false,
      lastViewTargetKind: 'aim_target',
      lastViewAnchorResyncChanged: true,
      lastAimDot: 0.92,
      lastFireIntent: true,
      lastAimGatePassed: true,
      lastAimGateReason: 'ok',
      lastFireLosGatePassed: false,
      lastFireProbe: {
        losReason: 'terrain_hit_before_target',
      },
    });

    const drained = observer.drain();
    expect(drained.recent.rafCadence.entries.at(-1).harnessContext).toMatchObject({
      lastViewYawClamped: true,
      lastFireProbe: {
        losStatus: 'blocked',
      },
    });
  });

  it('can keep rAF gap counters while skipping rich presentation context cloning', () => {
    const { observer, tick } = installObserverHarness(
      { botState: 'ENGAGE', firingHeld: true },
      { capturePresentationContext: false },
    );

    tick(0);
    tick(50);

    const latestEpoch = observer.getPresentationEpochs().at(-1);
    expect(latestEpoch?.gapMs).toBe(50);
    expect(latestEpoch?.presentationContext).toBeNull();
    expect(latestEpoch?.harnessContext).toBeNull();

    const drained = observer.drain();
    expect(drained.totals.rafCadence.intervalCount).toBe(1);
    expect(drained.totals.rafCadence.estimatedDropped60HzFrames).toBe(2);
    expect(drained.recent.rafCadence.entries.at(-1).presentationContext).toBeNull();
    expect(drained.recent.rafCadence.entries.at(-1).harnessContext).toBeNull();
  });

  it('retains bounded chronological recent observer entries for drain summaries', () => {
    const { observer, tick, trigger } = installObserverHarness();

    for (let index = 0; index < 40; index++) {
      tick(index * 26);
    }

    trigger('longtask', Array.from({ length: 40 }, (_, index) => ({
      name: `long-${index}`,
      startTime: index,
      duration: index,
    })));
    trigger('long-animation-frame', Array.from({ length: 40 }, (_, index) => ({
      startTime: index,
      duration: index,
      blockingDuration: index / 2,
    })));
    trigger('resource', Array.from({ length: 70 }, (_, index) => ({
      name: `resource-${index}`,
      duration: index,
      transferSize: index,
    })));

    const drained = observer.drain();
    expect(drained.recent.rafCadence.entries).toHaveLength(32);
    expect(drained.recent.rafCadence.entries[0].atMs).toBe(8 * 26);
    expect(drained.recent.rafCadence.entries.at(-1).atMs).toBe(39 * 26);

    expect(drained.recent.longTasks.entries).toHaveLength(32);
    expect(drained.recent.longTasks.entries[0].name).toBe('long-8');
    expect(drained.recent.longTasks.entries.at(-1).name).toBe('long-39');

    expect(drained.recent.longAnimationFrames.entries).toHaveLength(32);
    expect(drained.recent.longAnimationFrames.entries[0].startTime).toBe(8);
    expect(drained.recent.longAnimationFrames.entries.at(-1).startTime).toBe(39);

    expect(drained.recent.resources.entries).toHaveLength(64);
    expect(drained.recent.resources.entries[0].name).toBe('resource-6');
    expect(drained.recent.resources.entries.at(-1).name).toBe('resource-69');
  });

  it('tracks top WebGL texture uploads in descending order without sorting per upload', () => {
    const sortSpy = vi.spyOn(Array.prototype, 'sort');
    try {
      const { observer, createWebglContext } = installObserverHarness();
      const gl = createWebglContext();
      const texture = gl.createTexture();
      gl.bindTexture(3553, texture);

      for (let index = 0; index < 40; index++) {
        gl.__uploadDurationMs = index + 1;
        gl.texImage2D(3553, 0, 0, 1, 1, 0, 0, 0, { width: 1, height: 1 });
      }

      const drained = observer.drain();
      expect(sortSpy).not.toHaveBeenCalled();
      expect(drained.recent.webglTextureUploadTop).toHaveLength(32);
      expect(drained.recent.webglTextureUploadTop[0].duration).toBe(40);
      expect(drained.recent.webglTextureUploadTop.at(-1).duration).toBe(9);
      expect(drained.totals.webglTextureUploadCount).toBe(40);
    } finally {
      sortSpy.mockRestore();
    }
  });
});
