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
    it('build runs lazily on first element access and mount', () => {
      const comp = new TestComponent();
      expect(comp.buildCalled).toBe(false);
      void comp.element; // triggers build
      expect(comp.buildCalled).toBe(true);

      const comp2 = new TestComponent();
      comp2.mount(container);
      expect(comp2.buildCalled).toBe(true);
    });

    it('mount appends to parent and calls onMount exactly once', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.mount(container); // idempotent

      expect(comp.mounted).toBe(true);
      expect(comp.mountCalled).toBe(true);
      expect(container.querySelectorAll('.test-component')).toHaveLength(1);
    });

    it('unmount removes from DOM, calls onUnmount, and is idempotent', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.unmount();
      comp.unmount();

      expect(comp.mounted).toBe(false);
      expect(comp.unmountCalled).toBe(true);
      expect(container.contains(comp.element)).toBe(false);
    });

    it('dispose unmounts and is safe when never mounted', () => {
      const comp = new TestComponent();
      comp.mount(container);
      comp.dispose();
      expect(comp.mounted).toBe(false);

      const comp2 = new TestComponent();
      expect(() => comp2.dispose()).not.toThrow();
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
