/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { VisibilityManager } from './VisibilityManager';
import { ViewportManager } from '../design/responsive';

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

describe('VisibilityManager', () => {
  let root: HTMLDivElement;
  let vm: VisibilityManager;

  beforeEach(() => {
    ViewportManager.resetForTest();
    root = document.createElement('div');
    root.id = 'game-hud-root';
    document.body.innerHTML = '';
    document.body.appendChild(root);
    vm = new VisibilityManager(root);
  });

  it('sets initial data attributes on root', () => {
    expect(root.dataset.device).toBeDefined();
    expect(root.dataset.phase).toBe('menu');
    expect(root.dataset.vehicle).toBe('infantry');
    expect(root.dataset.ads).toBe('false');
    expect(root.dataset.layout).toBeDefined();
  });

  it('getState() returns current state', () => {
    const state = vm.getState();
    expect(state.phase).toBe('menu');
    expect(state.vehicle).toBe('infantry');
    expect(state.ads).toBe(false);
  });

  it('setState() updates data attributes', () => {
    vm.setState({ phase: 'playing' });
    expect(root.dataset.phase).toBe('playing');
  });

  it('setState() handles multiple fields', () => {
    vm.setState({ phase: 'playing', vehicle: 'helicopter', ads: true });
    expect(root.dataset.phase).toBe('playing');
    expect(root.dataset.vehicle).toBe('helicopter');
    expect(root.dataset.ads).toBe('true');
  });

  it('setState() does not touch unchanged fields', () => {
    vm.setState({ phase: 'playing' });
    expect(root.dataset.vehicle).toBe('infantry'); // unchanged
  });

  it('setPhase() convenience method', () => {
    vm.setPhase('ended');
    expect(root.dataset.phase).toBe('ended');
  });

  it('setVehicle() convenience method', () => {
    vm.setVehicle('helicopter');
    expect(root.dataset.vehicle).toBe('helicopter');
  });

  it('setADS() convenience method', () => {
    vm.setADS(true);
    expect(root.dataset.ads).toBe('true');
    vm.setADS(false);
    expect(root.dataset.ads).toBe('false');
  });

  it('getState() returns snapshot (not reference)', () => {
    const s1 = vm.getState();
    vm.setState({ phase: 'playing' });
    const s2 = vm.getState();
    expect(s1.phase).toBe('menu');
    expect(s2.phase).toBe('playing');
  });

  it('device is set based on touch detection', () => {
    const state = vm.getState();
    // Device should be either 'desktop' or 'touch' based on environment
    expect(['desktop', 'touch']).toContain(state.device);
    expect(root.dataset.device).toBe(state.device);
  });

  it('layout is derived from viewport', () => {
    const state = vm.getState();
    // Layout should be one of the valid layout modes
    expect(['desktop', 'mobile-landscape', 'mobile-portrait']).toContain(state.layout);
    expect(root.dataset.layout).toBe(state.layout);
  });

  it('dispose() does not throw', () => {
    expect(() => vm.dispose()).not.toThrow();
  });
});
