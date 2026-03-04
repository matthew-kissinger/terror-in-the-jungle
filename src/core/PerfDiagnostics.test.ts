import { describe, expect, it, vi } from 'vitest';

async function loadModule(opts?: { search?: string; enabled?: boolean }) {
  vi.resetModules();
  if (typeof opts?.enabled === 'boolean') {
    (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__ = opts.enabled;
  } else {
    delete (globalThis as any).__ENABLE_PERF_DIAGNOSTICS__;
  }
  (globalThis as any).window = { location: { search: opts?.search ?? '' } };
  return import('./PerfDiagnostics');
}

describe('PerfDiagnostics', () => {
  it('enables diagnostics for sandbox captures', async () => {
    const mod = await loadModule({ search: '?sandbox=true' });
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
  });

  it('keeps diagnostics off without an explicit flag', async () => {
    const mod = await loadModule({ search: '' });
    expect(mod.isPerfDiagnosticsEnabled()).toBe(false);
  });

  it('accepts an explicit test override', async () => {
    const mod = await loadModule({ search: '', enabled: true });
    expect(mod.isPerfDiagnosticsEnabled()).toBe(true);
  });
});
