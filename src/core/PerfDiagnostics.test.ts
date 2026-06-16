// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';

async function loadModule(opts?: {
  search?: string;
  enabled?: boolean;
  attributionEnabled?: boolean;
}) {
  vi.resetModules();
  if (typeof opts?.enabled === 'boolean') {
    (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__ = opts.enabled;
  } else {
    delete (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__;
  }
  if (typeof opts?.attributionEnabled === 'boolean') {
    (globalThis as any).__ENABLE_PERF_ATTRIBUTION__ = opts.attributionEnabled;
  } else {
    delete (globalThis as any).__ENABLE_PERF_ATTRIBUTION__;
  }
  (globalThis as any).window = { location: { search: opts?.search ?? '' } };
  return import('./PerfDiagnostics');
}

describe('PerfDiagnostics', () => {
  it('enables harness access without diagnostics for sandbox captures', async () => {
    const mod = await loadModule({ search: '?sandbox=true' });
    expect(mod.isPerfHarnessEnabled()).toBe(true);
    expect(mod.isPerfDiagnosticsEnabled()).toBe(false);
  });

  it('keeps plain perf captures clean unless diagnostics are explicit', async () => {
    const mod = await loadModule({ search: '?perf=1' });
    expect(mod.isPerfHarnessEnabled()).toBe(true);
    expect(mod.isPerfDiagnosticsEnabled()).toBe(false);
    expect(mod.isPerfAttributionEnabled()).toBe(false);
  });

  it('keeps diagnostics off without an explicit flag', async () => {
    const mod = await loadModule({ search: '' });
    expect(mod.isPerfHarnessEnabled()).toBe(false);
    expect(mod.isPerfDiagnosticsEnabled()).toBe(false);
  });

  it('accepts an explicit test override', async () => {
    const mod = await loadModule({ search: '', enabled: true });
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
  });

  it('enables diagnostics from telemetry without heavy attribution', async () => {
    const mod = await loadModule({ search: '?perf=1&telemetry=1' });
    expect(mod.isPerfHarnessEnabled()).toBe(true);
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
    expect(mod.isPerfAttributionEnabled()).toBe(false);
  });

  it('enables heavy attribution only for explicit attribution flags', async () => {
    const mod = await loadModule({ search: '?perf=1&diagnostics=1' });
    expect(mod.isPerfHarnessEnabled()).toBe(true);
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
    expect(mod.isPerfAttributionEnabled()).toBe(true);
  });

  it('accepts an explicit attribution override', async () => {
    const mod = await loadModule({ search: '?perf=1', attributionEnabled: true });
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
    expect(mod.isPerfAttributionEnabled()).toBe(true);
  });

  it('reads perf-only vegetation density scale for A/B captures', async () => {
    const mod = await loadModule({ search: '?perf=1&perfVegetationDensityScale=0.25' });
    expect(mod.getPerfVegetationDensityScale()).toBe(0.25);
  });

  it('keeps vegetation density unchanged outside harness access', async () => {
    const mod = await loadModule({ search: '?perfVegetationDensityScale=0' });
    expect(mod.getPerfVegetationDensityScale()).toBe(1);
  });

  it('clamps perf vegetation density scale to the supported range', async () => {
    const over = await loadModule({ search: '?perf=1&perfVegetationDensityScale=3' });
    expect(over.getPerfVegetationDensityScale()).toBe(1);

    const under = await loadModule({ search: '?perf=1&perfVegetationDensityScale=-2' });
    expect(under.getPerfVegetationDensityScale()).toBe(0);
  });
});
