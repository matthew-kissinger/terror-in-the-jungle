// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type DisposeFn = () => void;

export class DisposableScope {
  private disposers: DisposeFn[] = [];
  private disposed = false;

  add(disposer: DisposeFn): DisposeFn {
    if (this.disposed) {
      disposer();
      return () => undefined;
    }
    this.disposers.push(disposer);
    return () => this.remove(disposer);
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    event: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): DisposeFn;
  listen<K extends keyof DocumentEventMap>(
    target: Document,
    event: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): DisposeFn;
  listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    event: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): DisposeFn;
  listen(
    target: Window | Document | HTMLElement,
    event: string,
    handler: EventListener,
    options?: AddEventListenerOptions,
  ): DisposeFn {
    target.addEventListener(event, handler, options);
    return this.add(() => target.removeEventListener(event, handler, options));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const disposer of this.disposers.splice(0).reverse()) {
      disposer();
    }
  }

  remove(disposer: DisposeFn): void {
    const index = this.disposers.indexOf(disposer);
    if (index >= 0) {
      this.disposers.splice(index, 1);
    }
  }

  get size(): number {
    return this.disposers.length;
  }
}

export abstract class UIComponent {
  protected readonly root: HTMLElement;
  private readonly scope = new DisposableScope();
  private built = false;
  private isMounted = false;

  constructor(tagName = 'div') {
    this.root = document.createElement(tagName);
  }

  protected abstract build(): void;
  protected onMount(): void {}
  protected onUnmount(): void {}

  mount(parent: HTMLElement): void {
    if (this.isMounted) {
      return;
    }
    this.ensureBuilt();
    parent.appendChild(this.root);
    this.isMounted = true;
    this.onMount();
  }

  unmount(): void {
    if (!this.isMounted) {
      return;
    }
    this.onUnmount();
    this.scope.dispose();
    this.root.remove();
    this.isMounted = false;
  }

  dispose(): void {
    this.unmount();
  }

  get element(): HTMLElement {
    this.ensureBuilt();
    return this.root;
  }

  get mounted(): boolean {
    return this.isMounted;
  }

  protected listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    event: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): DisposeFn {
    return this.scope.listen(target, event, handler, options);
  }

  protected text(selector: string, value: string): void {
    const element = this.root.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  protected toggleClass(className: string, force?: boolean): void {
    this.root.classList.toggle(className, force);
  }

  protected setVar(name: string, value: string): void {
    this.root.style.setProperty(name, value);
  }

  protected addDisposer(disposer: DisposeFn): DisposeFn {
    return this.scope.add(disposer);
  }

  private ensureBuilt(): void {
    if (!this.built) {
      this.built = true;
      this.build();
    }
  }
}

export class FocusTrap {
  private readonly scope = new DisposableScope();
  private previouslyFocused: Element | null = null;

  constructor(private readonly root: HTMLElement) {}

  activate(): void {
    this.previouslyFocused = document.activeElement;
    this.scope.listen(document, 'keydown', (event) => {
      if (event.key !== 'Tab') {
        return;
      }
      const focusable = this.getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    (this.getFocusable()[0] as HTMLElement | undefined)?.focus();
  }

  deactivate(): void {
    this.scope.dispose();
    if (this.previouslyFocused instanceof HTMLElement) {
      this.previouslyFocused.focus();
    }
  }

  private getFocusable(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute('disabled'));
  }
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: {
    className?: string;
    text?: string;
    attrs?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}