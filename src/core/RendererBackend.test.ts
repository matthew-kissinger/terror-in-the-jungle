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
  setSearch('');
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', originalHref);
});

describe('resolveRendererBackendMode', () => {
  it('keeps WebGL as the default runtime backend', () => {
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('selects the experimental WebGPU backend from the renderer query param', () => {
    setSearch('?renderer=webgpu');
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });

  it('selects the WebGPURenderer WebGL fallback backend for forced fallback testing', () => {
    setSearch('?renderer=webgpu-force-webgl');
    expect(resolveRendererBackendMode()).toBe('webgpu-force-webgl');
  });

  it('allows build-time opt-in for experimental branches', () => {
    vi.stubEnv('VITE_KONVEYER_WEBGPU', '1');
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });
});

describe('createInitialRendererCapabilities', () => {
  it('records the default WebGL backend as ready', () => {
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
  });
});

