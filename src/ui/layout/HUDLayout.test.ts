/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUDLayout } from './HUDLayout';
import { ViewportManager } from '../design/responsive';
import type { LayoutComponent, HUDRegion } from './types';

// Polyfill ResizeObserver for jsdom
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** Create a mock LayoutComponent for testing registration. */
function mockComponent(): LayoutComponent & { mountCalls: HTMLElement[]; unmountCalls: number; disposeCalls: number } {
  const el = document.createElement('div');
  el.className = 'test-component';
  const comp = {
    mountCalls: [] as HTMLElement[],
    unmountCalls: 0,
    disposeCalls: 0,
    mount(parent: HTMLElement) {
      comp.mountCalls.push(parent);
      parent.appendChild(el);
    },
    unmount() {
      comp.unmountCalls++;
      el.remove();
    },
    dispose() {
      comp.disposeCalls++;
      el.remove();
    },
  };
  return comp;
}

describe('HUDLayout', () => {
  let layout: HUDLayout;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    ViewportManager.resetForTest();
    layout = new HUDLayout();
  });

  it('creates #game-hud-root element', () => {
    layout.init();
    const root = document.getElementById('game-hud-root');
    expect(root).toBeTruthy();
    expect(root?.tagName).toBe('DIV');
    layout.dispose();
  });

  it('injects stylesheet into <head>', () => {
    layout.init();
    const styles = document.head.querySelectorAll('style');
    const hasGridStyle = Array.from(styles).some((s) =>
      s.textContent?.includes('#game-hud-root')
    );
    expect(hasGridStyle).toBe(true);
    layout.dispose();
  });

  it('creates grid slot divs for all regions', () => {
    layout.init();
    const allRegions: HUDRegion[] = [
      'timer', 'tickets', 'game-status', 'compass', 'minimap',
      'objectives', 'stats', 'kill-feed', 'ammo', 'weapon-bar',
      'center', 'health', 'joystick', 'fire', 'ads', 'action-btns', 'menu',
    ];
    for (const region of allRegions) {
      const slot = layout.getSlot(region);
      expect(slot).toBeTruthy();
      expect(slot.dataset.region).toBe(region);
      expect(slot.classList.contains('hud-slot')).toBe(true);
    }
    layout.dispose();
  });

  it('getSlot throws for unknown region', () => {
    expect(() => layout.getSlot('bogus' as HUDRegion)).toThrow('unknown region');
  });

  it('init() is idempotent (calling twice does not duplicate)', () => {
    layout.init();
    layout.init();
    const roots = document.querySelectorAll('#game-hud-root');
    expect(roots.length).toBe(1);
    layout.dispose();
  });

  it('dispose() removes root and style from DOM', () => {
    layout.init();
    expect(document.getElementById('game-hud-root')).toBeTruthy();
    layout.dispose();
    expect(document.getElementById('game-hud-root')).toBeNull();
    // Style tag should also be removed
    const styles = document.head.querySelectorAll('style');
    const hasGridStyle = Array.from(styles).some((s) =>
      s.textContent?.includes('#game-hud-root')
    );
    expect(hasGridStyle).toBe(false);
  });

  it('register() mounts component into the correct slot', () => {
    layout.init();
    const comp = mockComponent();
    layout.register({ region: 'tickets', component: comp });

    expect(comp.mountCalls.length).toBe(1);
    const slot = layout.getSlot('tickets');
    expect(comp.mountCalls[0]).toBe(slot);
    expect(slot.querySelector('.test-component')).toBeTruthy();

    layout.dispose();
  });

  it('register() sets data-show when showContext is provided', () => {
    layout.init();
    const comp = mockComponent();
    layout.register({ region: 'fire', component: comp, showContext: 'infantry' });

    const slot = layout.getSlot('fire');
    expect(slot.dataset.show).toBe('infantry');

    layout.dispose();
  });

  it('unregister() unmounts component', () => {
    layout.init();
    const comp = mockComponent();
    layout.register({ region: 'ammo', component: comp });
    expect(comp.unmountCalls).toBe(0);

    layout.unregister(comp);
    expect(comp.unmountCalls).toBe(1);

    layout.dispose();
  });

  it('dispose() unmounts all registered components', () => {
    layout.init();
    const comp1 = mockComponent();
    const comp2 = mockComponent();
    layout.register({ region: 'tickets', component: comp1 });
    layout.register({ region: 'ammo', component: comp2 });

    layout.dispose();
    expect(comp1.unmountCalls).toBe(1);
    expect(comp2.unmountCalls).toBe(1);
  });

  it('getRoot() returns the #game-hud-root element', () => {
    expect(layout.getRoot().id).toBe('game-hud-root');
  });

  it('getVisibilityManager() returns the VisibilityManager', () => {
    const vm = layout.getVisibilityManager();
    expect(vm).toBeTruthy();
    expect(typeof vm.setState).toBe('function');
    layout.dispose();
  });

  it('setState() delegates to VisibilityManager', () => {
    layout.init();
    layout.setState({ phase: 'playing' });
    const root = layout.getRoot();
    expect(root.dataset.phase).toBe('playing');
    layout.dispose();
  });

  it('setPhase() convenience method works', () => {
    layout.init();
    layout.setPhase('playing');
    expect(layout.getRoot().dataset.phase).toBe('playing');
    layout.setPhase('paused');
    expect(layout.getRoot().dataset.phase).toBe('paused');
    layout.dispose();
  });
});
