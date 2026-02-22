/**
 * UIComponent - Base class for all game UI components.
 *
 * Lifecycle: mount(build+onMount) -> update -> unmount(onUnmount)
 *
 * Modeled after Unity UIToolkit's VisualElement:
 * - Build DOM lazily on first mount() or element access
 * - Defer subscriptions/timers to onMount() (AttachToPanelEvent equivalent)
 * - Auto-clean signal effects on onUnmount() (DetachFromPanelEvent equivalent)
 *
 * Reactive state via @preact/signals-core:
 * - this.signal(value) creates a reactive signal
 * - this.effect(fn) creates an auto-disposing effect (cleaned on unmount)
 * - this.computed(fn) creates a derived signal
 *
 * IMPORTANT: build() runs lazily (not in the base constructor) to support
 * `useDefineForClassFields: true`. This means subclass field initializers
 * (including signal declarations) are available inside build().
 */

import { signal, computed, effect, type Signal, type ReadonlySignal } from '@preact/signals-core';

export abstract class UIComponent {
  /** Root DOM element for this component */
  protected readonly root: HTMLDivElement;

  /** Whether this component is currently mounted in the DOM */
  private _mounted = false;

  /** Whether build() has been called */
  private _built = false;

  /** Active effect disposers (auto-cleaned on unmount) */
  private _disposers: (() => void)[] = [];

  constructor() {
    this.root = document.createElement('div');
    // build() is NOT called here - deferred to ensureBuilt()
    // to support `useDefineForClassFields: true` (ES2020+).
    // Subclass field initializers run AFTER super(), so calling
    // build() here would execute before signals are initialized.
  }

  /** Ensure build() has been called exactly once */
  private ensureBuilt(): void {
    if (!this._built) {
      this._built = true;
      this.build();
    }
  }

  // --- Lifecycle (subclass overrides) ---

  /**
   * Build initial DOM structure. Called lazily on first mount() or element access.
   * Set root.className, root.innerHTML, create child elements here.
   * Do NOT subscribe to events or signals here - use onMount().
   */
  protected abstract build(): void;

  /**
   * Called after root is attached to the live DOM.
   * Subscribe to signals, start timers, add event listeners here.
   * Use this.effect() for auto-cleaning signal subscriptions.
   */
  protected onMount(): void {}

  /**
   * Called just before root is removed from the DOM.
   * Clean up anything not handled by this.effect() auto-dispose.
   * Note: effect disposers are auto-called after onUnmount().
   */
  protected onUnmount(): void {}

  /**
   * Per-frame update. Only called when mounted.
   * Override for components that need frame-by-frame updates
   * (damage numbers, kill feed timers, etc.).
   */
  update(_dt: number): void {}

  // --- Public API ---

  /**
   * Mount this component into a parent DOM element.
   * Triggers build() on first call, then appends root and calls onMount().
   */
  mount(parent: HTMLElement): void {
    if (this._mounted) return;
    this.ensureBuilt();
    parent.appendChild(this.root);
    this._mounted = true;
    this.onMount();
  }

  /**
   * Remove this component from the DOM.
   * Triggers onUnmount() and auto-disposes all effects.
   */
  unmount(): void {
    if (!this._mounted) return;
    this.onUnmount();
    for (const d of this._disposers) d();
    this._disposers = [];
    this.root.remove();
    this._mounted = false;
  }

  /** Whether this component is currently in the live DOM */
  get mounted(): boolean {
    return this._mounted;
  }

  /** The root DOM element. Triggers build() on first access. */
  get element(): HTMLElement {
    this.ensureBuilt();
    return this.root;
  }

  /**
   * Move a mounted component to a different parent without triggering
   * unmount/mount lifecycle. Event listeners and effects stay active.
   * No-op if not mounted.
   */
  reparentTo(newParent: HTMLElement): void {
    if (!this._mounted) return;
    newParent.appendChild(this.root);
  }

  /**
   * Dispose this component. Calls unmount() if mounted.
   * Idempotent - safe to call multiple times.
   */
  dispose(): void {
    this.unmount();
  }

  // --- Reactive Helpers ---

  /**
   * Create a reactive signal scoped to this component.
   * Signals hold values that trigger re-computation when changed.
   * @example
   * private count = this.signal(0);
   * // later: this.count.value = 5;
   */
  protected signal<T>(initial: T): Signal<T> {
    return signal(initial);
  }

  /**
   * Create a reactive effect that auto-disposes on unmount.
   * The effect fn runs immediately and re-runs when any signal
   * it reads changes.
   * @example
   * this.effect(() => {
   *   this.text('[data-ref="count"]', String(this.count.value));
   * });
   */
  protected effect(fn: () => void | (() => void)): void {
    const dispose = effect(fn);
    this._disposers.push(dispose);
  }

  /**
   * Create a computed (derived) signal.
   * The value is lazily recomputed when dependencies change.
   * @example
   * private isLow = this.computed(() => this.ammo.value < 10);
   */
  protected computed<T>(fn: () => T): ReadonlySignal<T> {
    return computed(fn);
  }

  // --- DOM Helpers ---

  /**
   * Query a child element within this component's root.
   * Returns null if not found (does NOT search outside root).
   */
  protected $(selector: string): HTMLElement | null {
    this.ensureBuilt();
    return this.root.querySelector(selector);
  }

  /**
   * Query all matching child elements within this component's root.
   */
  protected $all(selector: string): NodeListOf<HTMLElement> {
    this.ensureBuilt();
    return this.root.querySelectorAll(selector);
  }

  /**
   * Set textContent of a child element found by selector.
   * No-op if element not found.
   */
  protected text(selector: string, value: string): void {
    const el = this.$(selector);
    if (el) el.textContent = value;
  }

  /**
   * Toggle a CSS class on the root element.
   */
  protected toggleClass(className: string, force?: boolean): void {
    this.ensureBuilt();
    this.root.classList.toggle(className, force);
  }

  /**
   * Set a CSS custom property on the root element.
   * Useful for per-component runtime theming.
   */
  protected setVar(name: string, value: string): void {
    this.ensureBuilt();
    this.root.style.setProperty(name, value);
  }

  /**
   * Add an event listener that auto-removes on unmount.
   */
  protected listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window | Document,
    event: K,
    handler: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(event, handler as EventListener, options);
    this._disposers.push(() => {
      target.removeEventListener(event, handler as EventListener, options);
    });
  }
}
