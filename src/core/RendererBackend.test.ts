/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialRendererCapabilities,
  resolveRendererBackendMode,
} from './RendererBackend';

const originalHref = window.location.href;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  vi.stubEnv('VITE_KONVEYER_WEBGPU', '');
  vi.stubEnv('VITE_KONVEYER_FORCE_WEBGL', '');
  vi.stubEnv('VITE_KONVEYER_WEBGPU_STRICT', '');
  setSearch('');
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', originalHref);
});

describe('resolveRendererBackendMode', () => {
  it('requests WebGPU as the default runtime backend', () => {
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });

  it('selects the experimental WebGPU backend from the renderer query param', () => {
    setSearch('?renderer=webgpu');
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });

  it('allows explicit legacy WebGL selection from the renderer query param', () => {
    setSearch('?renderer=webgl');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('selects the forced-WebGL negative diagnostic mode from the renderer query param', () => {
    setSearch('?renderer=webgpu-force-webgl');
    expect(resolveRendererBackendMode()).toBe('webgpu-force-webgl');
  });

  it('selects strict WebGPU proof mode when fallback would hide migration failures', () => {
    setSearch('?renderer=webgpu-strict');
    expect(resolveRendererBackendMode()).toBe('webgpu-strict');
  });

  it('allows build-time legacy WebGL opt-out for compatibility runs', () => {
    vi.stubEnv('VITE_KONVEYER_WEBGPU', '0');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('allows explicit build-time force-WebGL compatibility runs', () => {
    vi.stubEnv('VITE_KONVEYER_FORCE_WEBGL', '1');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('allows build-time strict proof opt-in for migration gates', () => {
    vi.stubEnv('VITE_KONVEYER_WEBGPU', '1');
    vi.stubEnv('VITE_KONVEYER_WEBGPU_STRICT', '1');
    expect(resolveRendererBackendMode()).toBe('webgpu-strict');
  });
});

describe('createInitialRendererCapabilities', () => {
  it('records explicit WebGL diagnostic mode as ready', () => {
    const caps = createInitialRendererCapabilities('webgl');
    expect(caps.requestedMode).toBe('webgl');
    expect(caps.resolvedBackend).toBe('webgl');
    expect(caps.initStatus).toBe('ready');
  });

  it('records WebGPU selection as pending until async renderer init finishes', () => {
    const caps = createInitialRendererCapabilities('webgpu');
    expect(caps.requestedMode).toBe('webgpu');
    expect(caps.resolvedBackend).toBe('unknown');
    expect(caps.initStatus).toBe('pending');
    expect(caps.strictWebGPU).toBe(false);
  });

  it('marks strict WebGPU proof mode as pending and non-fallbackable', () => {
    const caps = createInitialRendererCapabilities('webgpu-strict');
    expect(caps.requestedMode).toBe('webgpu-strict');
    expect(caps.resolvedBackend).toBe('unknown');
    expect(caps.initStatus).toBe('pending');
    expect(caps.strictWebGPU).toBe(true);
  });
});
