/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DebugHudRegistry, type DebugPanel } from './DebugHudRegistry';

function makePanel(id: string, defaultVisible = false): DebugPanel & { mounted: boolean } {
  const root = document.createElement('div');
  root.dataset.testPanel = id;
  let visible = false;
  let mounted = false;
  const panel: DebugPanel & { mounted: boolean } = {
    id,
    label: id,
    defaultVisible,
    get mounted() { return mounted; },
    set mounted(v: boolean) { mounted = v; },
    mount(container) {
      container.appendChild(root);
      mounted = true;
    },
    unmount() {
      if (root.parentElement) root.parentElement.removeChild(root);
      mounted = false;
    },
    setVisible(v) { visible = v; root.style.display = v ? 'block' : 'none'; },
    isVisible() { return visible; },
  };
  return panel;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DebugHudRegistry', () => {
  it('mounts registered panels into the shared container', () => {
    const registry = new DebugHudRegistry();
    const a = makePanel('a');
    registry.register(a);
    expect(a.mounted).toBe(true);
    expect(document.querySelector('[data-test-panel="a"]')).not.toBeNull();
    registry.dispose();
  });

  it('applies defaultVisible when the master container is visible', () => {
    const registry = new DebugHudRegistry();
    const visiblePanel = makePanel('v', true);
    const hiddenPanel = makePanel('h', false);
    registry.register(visiblePanel);
    registry.register(hiddenPanel);
    expect(visiblePanel.isVisible()).toBe(true);
    expect(hiddenPanel.isVisible()).toBe(false);
    registry.dispose();
  });

  it('togglePanel flips visibility for the addressed panel only', () => {
    const registry = new DebugHudRegistry();
    const a = makePanel('a');
    const b = makePanel('b');
    registry.register(a);
    registry.register(b);
    registry.togglePanel('a');
    expect(a.isVisible()).toBe(true);
    expect(b.isVisible()).toBe(false);
    registry.togglePanel('a');
    expect(a.isVisible()).toBe(false);
    registry.dispose();
  });

  it('togglePanel on a hidden master also reveals the master container', () => {
    const registry = new DebugHudRegistry();
    registry.setMasterVisible(false);
    const a = makePanel('a');
    registry.register(a);
    expect(registry.isMasterVisible()).toBe(false);
    registry.togglePanel('a');
    expect(registry.isMasterVisible()).toBe(true);
    expect(a.isVisible()).toBe(true);
    registry.dispose();
  });

  it('toggleAll hides and shows the master container without mutating panels', () => {
    const registry = new DebugHudRegistry();
    const a = makePanel('a', true);
    registry.register(a);
    expect(registry.isMasterVisible()).toBe(true);
    expect(a.isVisible()).toBe(true);

    registry.toggleAll();
    expect(registry.isMasterVisible()).toBe(false);
    // Panel-level visibility is preserved; only the master container is hidden.
    expect(a.isVisible()).toBe(true);

    registry.toggleAll();
    expect(registry.isMasterVisible()).toBe(true);
    expect(a.isVisible()).toBe(true);
    registry.dispose();
  });

  it('unregister detaches the panel and allows re-registration', () => {
    const registry = new DebugHudRegistry();
    const a = makePanel('a');
    registry.register(a);
    registry.unregister('a');
    expect(a.mounted).toBe(false);
    expect(registry.hasPanel('a')).toBe(false);
    // Can register a fresh panel with the same id.
    const a2 = makePanel('a');
    registry.register(a2);
    expect(a2.mounted).toBe(true);
    registry.dispose();
  });

  it('duplicate registration throws', () => {
    const registry = new DebugHudRegistry();
    const a = makePanel('a');
    const b = makePanel('a');
    registry.register(a);
    expect(() => registry.register(b)).toThrow();
    registry.dispose();
  });

  it('update fans out only to visible panels and only when master is on', () => {
    const registry = new DebugHudRegistry();
    let aTicks = 0;
    let bTicks = 0;
    const a: DebugPanel = {
      id: 'a', label: 'a', defaultVisible: true,
      mount(c) { c.appendChild(document.createElement('div')); },
      unmount() { /* noop */ },
      setVisible() { /* noop */ },
      isVisible() { return true; },
      update() { aTicks++; },
    };
    const b: DebugPanel = {
      id: 'b', label: 'b', defaultVisible: false,
      mount(c) { c.appendChild(document.createElement('div')); },
      unmount() { /* noop */ },
      setVisible() { /* noop */ },
      isVisible() { return false; },
      update() { bTicks++; },
    };
    registry.register(a);
    registry.register(b);

    registry.update(0.016);
    expect(aTicks).toBe(1);
    expect(bTicks).toBe(0);

    registry.setMasterVisible(false);
    registry.update(0.016);
    expect(aTicks).toBe(1);
    expect(bTicks).toBe(0);

    registry.dispose();
  });
});
