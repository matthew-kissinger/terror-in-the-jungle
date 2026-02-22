/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIComponent } from './UIComponent';

// Concrete test component
class TestComponent extends UIComponent {
  public buildCalled = false;
  public mountCalled = false;
  public unmountCalled = false;
  public lastDt = 0;

  public label = this.signal('hello');
  public count = this.signal(0);
  public doubled = this.computed(() => this.count.value * 2);

  protected build(): void {
    this.buildCalled = true;
    this.root.className = 'test-component';
    this.root.innerHTML = `
      <span data-ref="label"></span>
      <span data-ref="count"></span>
    `;
  }

  protected onMount(): void {
    this.mountCalled = true;
    this.effect(() => {
      this.text('[data-ref="label"]', this.label.value);
    });
    this.effect(() => {
      this.text('[data-ref="count"]', String(this.count.value));
    });
  }

  protected onUnmount(): void {
    this.unmountCalled = true;
  }

  update(dt: number): void {
    this.lastDt = dt;
  }
}

describe('UIComponent', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('lifecycle', () => {
    it('defers build() until first element access (lazy init)', () => {
      const comp = new TestComponent();
      // build() is NOT called during construction
      // (useDefineForClassFields: true makes field initializers run after super())
      expect(comp.buildCalled).toBe(false);

      // Accessing .element triggers build
      const el = comp.element;
      expect(comp.buildCalled).toBe(true);
      expect(el.className).toBe('test-component');
    });

    it('build() runs exactly once across multiple element accesses', () => {
      const comp = new TestComponent();
      comp.element; // triggers build
      comp.buildCalled = false; // reset flag
      comp.element; // second access
      expect(comp.buildCalled).toBe(false); // should not re-trigger
    });

    it('mount() triggers build if not yet built', () => {
      const comp = new TestComponent();
      expect(comp.buildCalled).toBe(false);
      comp.mount(container);
      expect(comp.buildCalled).toBe(true);
    });

    it('is not mounted after construction', () => {
      const comp = new TestComponent();
      expect(comp.mounted).toBe(false);
    });

    it('mount() appends to parent and calls onMount', () => {
      const comp = new TestComponent();
      comp.mount(container);
      expect(comp.mounted).toBe(true);
      expect(comp.mountCalled).toBe(true);
      expect(container.contains(comp.element)).toBe(true);
    });

    it('mount() is idempotent', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.mount(container); // should not throw or double-mount
      expect(container.querySelectorAll('.test-component').length).toBe(1);
    });

    it('unmount() removes from DOM and calls onUnmount', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.unmount();
      expect(comp.mounted).toBe(false);
      expect(comp.unmountCalled).toBe(true);
      expect(container.contains(comp.element)).toBe(false);
    });

    it('unmount() is idempotent', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.unmount();
      comp.unmount(); // should not throw
      expect(comp.mounted).toBe(false);
    });

    it('dispose() calls unmount', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.dispose();
      expect(comp.mounted).toBe(false);
      expect(container.contains(comp.element)).toBe(false);
    });

    it('dispose() is safe when not mounted', () => {
      const comp = new TestComponent();
      comp.dispose(); // should not throw
    });

    it('signals declared as class fields are available inside build()', () => {
      // This verifies the lazy build pattern works with useDefineForClassFields.
      // If build() ran during super(), this.label would be undefined.
      const comp = new TestComponent();
      comp.mount(container);
      // label signal was used in onMount effect - if build() ran too early,
      // the signal field initializer wouldn't have run yet and this would fail
      const labelEl = comp.element.querySelector('[data-ref="label"]');
      expect(labelEl?.textContent).toBe('hello');
    });
  });

  describe('reactive signals', () => {
    it('signal effects update DOM on mount', () => {
      const comp = new TestComponent();
      comp.mount(container);

      const labelEl = comp.element.querySelector('[data-ref="label"]');
      expect(labelEl?.textContent).toBe('hello');
    });

    it('signal changes propagate to DOM', () => {
      const comp = new TestComponent();
      comp.mount(container);

      comp.label.value = 'world';
      const labelEl = comp.element.querySelector('[data-ref="label"]');
      expect(labelEl?.textContent).toBe('world');
    });

    it('computed signals derive values', () => {
      const comp = new TestComponent();
      comp.count.value = 5;
      expect(comp.doubled.value).toBe(10);
    });

    it('effects are disposed on unmount', () => {
      const comp = new TestComponent();
      comp.mount(container);

      comp.label.value = 'before';
      expect(comp.element.querySelector('[data-ref="label"]')?.textContent).toBe('before');

      comp.unmount();

      // After unmount, signal changes should NOT update DOM
      comp.label.value = 'after';
      // Element is detached, but check the element still has old value
      expect(comp.element.querySelector('[data-ref="label"]')?.textContent).toBe('before');
    });
  });

  describe('DOM helpers', () => {
    it('$() queries within root', () => {
      const comp = new TestComponent();
      comp.mount(container); // ensure built
      const el = (comp as any).$('[data-ref="label"]');
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe('SPAN');
    });

    it('$all() returns all matches', () => {
      const comp = new TestComponent();
      comp.mount(container); // ensure built
      const els = (comp as any).$all('span');
      expect(els.length).toBe(2);
    });

    it('text() sets textContent', () => {
      const comp = new TestComponent();
      comp.mount(container); // ensure built
      (comp as any).text('[data-ref="label"]', 'test');
      expect(comp.element.querySelector('[data-ref="label"]')?.textContent).toBe('test');
    });

    it('text() is no-op for missing selector', () => {
      const comp = new TestComponent();
      comp.mount(container); // ensure built
      // Should not throw
      (comp as any).text('[data-ref="missing"]', 'test');
    });

    it('toggleClass() toggles CSS classes on root', () => {
      const comp = new TestComponent();
      (comp as any).toggleClass('active', true);
      expect(comp.element.classList.contains('active')).toBe(true);
      (comp as any).toggleClass('active', false);
      expect(comp.element.classList.contains('active')).toBe(false);
    });

    it('setVar() sets CSS custom property', () => {
      const comp = new TestComponent();
      (comp as any).setVar('--test-color', 'red');
      expect(comp.element.style.getPropertyValue('--test-color')).toBe('red');
    });
  });

  describe('event listener auto-cleanup', () => {
    it('listen() adds event listener that auto-removes on unmount', () => {
      const comp = new TestComponent();
      const handler = vi.fn();

      comp.mount(container);
      (comp as any).listen(comp.element, 'click', handler);

      // Fire event - handler should be called
      comp.element.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      // Unmount
      comp.unmount();

      // Re-mount to re-attach to DOM for event dispatch test
      container.appendChild(comp.element);

      // Fire event again - handler should NOT be called (removed on unmount)
      comp.element.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('update()', () => {
    it('receives deltaTime', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.update(0.016);
      expect(comp.lastDt).toBeCloseTo(0.016);
    });
  });
});
