/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GPUTimingTelemetry } from './GPUTimingTelemetry';

const originalHref = window.location.href;

// jsdom does not ship a WebGL2 context class. The telemetry's WebGL2 detection
// uses `gl instanceof WebGL2RenderingContext`, so provide a minimal stand-in
// the mock GL context can be reparented onto.
class FakeWebGL2RenderingContext {}
if (typeof (globalThis as Record<string, unknown>).WebGL2RenderingContext === 'undefined') {
  (globalThis as Record<string, unknown>).WebGL2RenderingContext = FakeWebGL2RenderingContext;
}
const WebGL2Ctor = (globalThis as unknown as {
  WebGL2RenderingContext: new () => unknown;
}).WebGL2RenderingContext;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

function makeInfo(overrides: { timestamp?: number } = {}) {
  return {
    render: { calls: 7, triangles: 4200, timestamp: overrides.timestamp ?? 0 },
    memory: { geometries: 3, textures: 5, programs: 2 },
  };
}

/** Minimal WebGPU-shaped renderer stub. */
function makeWebGPURenderer(opts: {
  trackTimestamp?: boolean;
  hasFeature?: boolean;
  resolveValue?: number;
  timestamp?: number;
  hasInitialized?: boolean;
}) {
  return {
    isWebGPURenderer: true,
    trackTimestamp: opts.trackTimestamp ?? true,
    hasInitialized: () => opts.hasInitialized ?? true,
    hasFeature: (name: string) => name === 'timestamp-query' && (opts.hasFeature ?? true),
    resolveTimestampsAsync: vi.fn(async () => opts.resolveValue),
    info: makeInfo({ timestamp: opts.timestamp }),
  } as unknown as THREE.WebGLRenderer;
}

/** Minimal WebGL2-shaped renderer stub with a fake EXT timer extension. */
function makeWebGL2Renderer(opts: { extensionAvailable?: boolean } = {}) {
  const query = {} as WebGLQuery;
  const gl = {
    createQuery: () => query,
    beginQuery: vi.fn(),
    endQuery: vi.fn(),
    deleteQuery: vi.fn(),
    getExtension: (name: string) =>
      name === 'EXT_disjoint_timer_query_webgl2' && (opts.extensionAvailable ?? true)
        ? { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }
        : null,
    getQueryParameter: (_q: unknown, param: number) => (param === 3 ? true : 5_000_000),
    getParameter: () => false,
    QUERY_RESULT_AVAILABLE: 3,
    QUERY_RESULT: 4,
  };
  // Make gl pass the `instanceof WebGL2RenderingContext` guard.
  Object.setPrototypeOf(gl, WebGL2Ctor.prototype);
  return {
    isWebGPURenderer: false,
    getContext: () => gl,
    info: makeInfo(),
  } as unknown as THREE.WebGLRenderer;
}

beforeEach(() => {
  setSearch('');
});

afterEach(() => {
  window.history.replaceState(null, '', originalHref);
  vi.restoreAllMocks();
});

describe('GPUTimingTelemetry flag gating', () => {
  it('stays off and reports nothing measurable when the ?gpuTiming flag is absent', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGPURenderer({}));

    expect(telemetry.isAvailable).toBe(false);
    const report = telemetry.getTelemetry();
    expect(report.available).toBe(false);
    expect(report.gpuTimeMs).toBe(0);
  });

  it('arms a timing path only once the operator opts in with ?gpuTiming=1', () => {
    setSearch('?gpuTiming=1');
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGPURenderer({}));

    expect(telemetry.isAvailable).toBe(true);
  });
});

describe('GPUTimingTelemetry WebGPU path', () => {
  beforeEach(() => setSearch('?gpuTiming=1'));

  it('measures render-pass GPU time under WebGPU when the device supports timestamps', async () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGPURenderer({ resolveValue: 2.5 }));

    expect(telemetry.getTelemetry().available).toBe(true);

    telemetry.collectTime();
    // resolveTimestampsAsync resolves asynchronously; let the microtask settle.
    await Promise.resolve();
    await Promise.resolve();

    const report = telemetry.getTelemetry();
    expect(report.available).toBe(true);
    expect(report.gpuTimeMs).toBeCloseTo(2.5);
  });

  it('surfaces the settled info.render.timestamp value without any unit conversion', () => {
    const telemetry = new GPUTimingTelemetry();
    // WebGPU resolveTimestampsAsync already returns milliseconds and mirrors it
    // onto info.render.timestamp; the telemetry must pass it through as-is.
    telemetry.init(makeWebGPURenderer({ timestamp: 3.2, resolveValue: undefined }));

    telemetry.collectTime();

    expect(telemetry.getTelemetry().gpuTimeMs).toBeCloseTo(3.2);
  });

  it('reports an explicit unsupported reason (not a fake number) when the device lacks the feature', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGPURenderer({ hasFeature: false }));

    const report = telemetry.getTelemetry();
    expect(report.available).toBe(false);
    expect(report.gpuTimeMs).toBe(0);
    expect(report.unsupportedReason).toBeTruthy();
  });

  it('reports unsupported when trackTimestamp was never armed at construction', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGPURenderer({ trackTimestamp: false }));

    const report = telemetry.getTelemetry();
    expect(report.available).toBe(false);
    expect(report.unsupportedReason).toContain('trackTimestamp');
  });

  it('does not run the WebGL2 begin/end query path for a WebGPU renderer', () => {
    const renderer = makeWebGPURenderer({});
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(renderer);

    // These are WebGL2-only hooks; they must be inert under WebGPU.
    expect(() => {
      telemetry.beginTimer();
      telemetry.endTimer();
    }).not.toThrow();
  });
});

describe('GPUTimingTelemetry WebGL2 fallback', () => {
  beforeEach(() => setSearch('?gpuTiming=1'));

  it('falls back to EXT_disjoint_timer_query on a WebGL2 renderer', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGL2Renderer());

    expect(telemetry.getTelemetry().available).toBe(true);
  });

  it('records a positive GPU time after a completed WebGL2 query round trip', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGL2Renderer());

    telemetry.beginTimer();
    telemetry.endTimer();
    telemetry.collectTime();

    expect(telemetry.getTelemetry().gpuTimeMs).toBeGreaterThan(0);
  });

  it('reports unavailable when neither GPU timing path exists', () => {
    const telemetry = new GPUTimingTelemetry();
    telemetry.init(makeWebGL2Renderer({ extensionAvailable: false }));

    expect(telemetry.getTelemetry().available).toBe(false);
  });
});
