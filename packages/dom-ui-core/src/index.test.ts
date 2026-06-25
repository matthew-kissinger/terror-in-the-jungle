// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DisposableScope, FocusTrap, UIComponent, createElement } from './index';

class TestComponent extends UIComponent {
  clicks = 0;

  protected build(): void {
    this.element.innerHTML = '<button class="button">Click</button><span class="label"></span>';
  }

  protected override onMount(): void {
    const button = this.element.querySelector('.button');
    if (button instanceof HTMLElement) {
      this.listen(button, 'click', () => {
        this.clicks++;
      });
    }
    this.text('.label', 'ready');
  }
}

describe('dom-ui-core', () => {
  it('mounts, unmounts, and cleans listeners', () => {
    const component = new TestComponent();
    component.mount(document.body);
    const button = component.element.querySelector('.button') as HTMLButtonElement;

    button.click();
    expect(component.clicks).toBe(1);
    expect(component.element.textContent).toContain('ready');
    component.unmount();
    button.click();
    expect(component.clicks).toBe(1);
    expect(component.mounted).toBe(false);
  });

  it('disposes scopes idempotently', () => {
    const scope = new DisposableScope();
    const dispose = vi.fn();
    scope.add(dispose);
    scope.dispose();
    scope.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('creates elements with text and attributes', () => {
    const element = createElement('button', {
      className: 'primary',
      text: 'Go',
      attrs: { type: 'button' },
    });
    expect(element.className).toBe('primary');
    expect(element.textContent).toBe('Go');
    expect(element.getAttribute('type')).toBe('button');
  });

  it('keeps tab focus inside the trap root', () => {
    document.body.innerHTML = '<button id="outside"></button><div id="modal"><button id="a"></button><button id="b"></button></div>';
    const root = document.getElementById('modal') as HTMLElement;
    const trap = new FocusTrap(root);
    trap.activate();
    expect(document.activeElement?.id).toBe('a');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement?.id).toBe('b');
    trap.deactivate();
  });
});