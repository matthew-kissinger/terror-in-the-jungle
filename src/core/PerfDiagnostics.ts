const PERF_QUERY_FLAGS = ['sandbox', 'perf', 'telemetry', 'diagnostics'] as const;

function readBooleanFlag(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readGlobalOverride(): boolean | null {
  const globalScope = globalThis as {
    __ENABLE_PERF_DIAGNOSTICS__?: boolean;
    __ENABLE_PERF_TELEMETRY__?: boolean;
  };

  if (typeof globalScope.__ENABLE_PERF_DIAGNOSTICS__ === 'boolean') {
    return globalScope.__ENABLE_PERF_DIAGNOSTICS__;
  }
  if (typeof globalScope.__ENABLE_PERF_TELEMETRY__ === 'boolean') {
    return globalScope.__ENABLE_PERF_TELEMETRY__;
  }
  return null;
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
    return PERF_QUERY_FLAGS.some(flag => readBooleanFlag(params.get(flag)));
  } catch {
    return false;
  }
}

export function isPerfUserTimingEnabled(): boolean {
  return isPerfDiagnosticsEnabled()
    && typeof performance !== 'undefined'
    && typeof performance.mark === 'function'
    && typeof performance.measure === 'function';
}
