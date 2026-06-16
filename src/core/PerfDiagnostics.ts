// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

const PERF_HARNESS_QUERY_FLAGS = ['sandbox', 'perf'] as const;
const PERF_DIAGNOSTICS_QUERY_FLAGS = ['telemetry', 'diagnostics', 'perfDetails', 'perfAttribution'] as const;
const PERF_ATTRIBUTION_QUERY_FLAGS = ['diagnostics', 'perfDetails', 'perfAttribution'] as const;
const PERF_VEGETATION_DENSITY_SCALE_PARAM = 'perfVegetationDensityScale';

function readBooleanFlag(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readGlobalOverride(): boolean | null {
  const globalScope = globalThis as {
    __ENABLE_PERF_DIAGNOSTICS__?: boolean;
    __ENABLE_PERF_TELEMETRY__?: boolean;
    __ENABLE_PERF_ATTRIBUTION__?: boolean;
  };

  if (typeof globalScope.__ENABLE_PERF_DIAGNOSTICS__ === 'boolean') {
    return globalScope.__ENABLE_PERF_DIAGNOSTICS__;
  }
  if (typeof globalScope.__ENABLE_PERF_TELEMETRY__ === 'boolean') {
    return globalScope.__ENABLE_PERF_TELEMETRY__;
  }
  if (globalScope.__ENABLE_PERF_ATTRIBUTION__ === true) {
    return true;
  }
  return null;
}

function readAttributionGlobalOverride(): boolean | null {
  const globalScope = globalThis as {
    __ENABLE_PERF_ATTRIBUTION__?: boolean;
    __ENABLE_PERF_DIAGNOSTICS__?: boolean;
    __ENABLE_PERF_TELEMETRY__?: boolean;
  };

  if (typeof globalScope.__ENABLE_PERF_ATTRIBUTION__ === 'boolean') {
    return globalScope.__ENABLE_PERF_ATTRIBUTION__;
  }
  return readGlobalOverride();
}

export function isPerfDiagnosticsEnabled(): boolean {
  const override = readGlobalOverride();
  if (typeof override === 'boolean') {
    return override;
  }

  if (typeof window === 'undefined' || !window.location?.search) {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return PERF_DIAGNOSTICS_QUERY_FLAGS.some(flag => readBooleanFlag(params.get(flag)));
  } catch {
    return false;
  }
}

export function isPerfHarnessEnabled(): boolean {
  const globalScope = globalThis as {
    __ENABLE_PERF_HARNESS__?: boolean;
  };

  if (typeof globalScope.__ENABLE_PERF_HARNESS__ === 'boolean') {
    return globalScope.__ENABLE_PERF_HARNESS__;
  }
  if (readGlobalOverride() === true) {
    return true;
  }

  if (typeof window === 'undefined' || !window.location?.search) {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return PERF_HARNESS_QUERY_FLAGS.some(flag => readBooleanFlag(params.get(flag)))
      || PERF_DIAGNOSTICS_QUERY_FLAGS.some(flag => readBooleanFlag(params.get(flag)));
  } catch {
    return false;
  }
}

/**
 * Heavy attribution flag for per-method CPU timing. Plain `?perf=1` keeps the
 * capture harness available without adding per-NPC method timing overhead.
 */
export function isPerfAttributionEnabled(): boolean {
  const override = readAttributionGlobalOverride();
  if (typeof override === 'boolean') {
    return override;
  }

  if (typeof window === 'undefined' || !window.location?.search) {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return PERF_ATTRIBUTION_QUERY_FLAGS.some(flag => readBooleanFlag(params.get(flag)));
  } catch {
    return false;
  }
}

/**
 * Production-safe diagnostics flag: enabled via `?diag=1` query param.
 * Exposes only lightweight, read-only metrics (no engine internals).
 */
export function isDiagEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('diag') === '1';
  } catch { return false; }
}

export function getPerfVegetationDensityScale(): number {
  if (!(import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') || !isPerfHarnessEnabled()) {
    return 1;
  }
  if (typeof window === 'undefined' || !window.location?.search) {
    return 1;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(PERF_VEGETATION_DENSITY_SCALE_PARAM);
    if (raw === null) return 1;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return 1;
  }
}

export function isPerfUserTimingEnabled(): boolean {
  return isPerfDiagnosticsEnabled()
    && typeof performance !== 'undefined'
    && typeof performance.mark === 'function'
    && typeof performance.measure === 'function';
}
