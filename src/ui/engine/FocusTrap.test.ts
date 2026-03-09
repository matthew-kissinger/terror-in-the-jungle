/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FocusTrap } from './FocusTrap';

describe('FocusTrap', () => {
  let container: HTMLDivElement;
  let btn1: HTMLButtonElement;
  let btn2: HTMLButtonElement;
  let btn3: HTMLButtonElement;
  let trap: FocusTrap;

  beforeEach(() => {
    container = document.createElement('div');
    btn1 = document.createElement('button');
    btn1.textContent = 'First';
    btn2 = document.createElement('button');
    btn2.textContent = 'Second';
    btn3 = document.createElement('button');
    btn3.textContent = 'Third';
    container.appendChild(btn1);
    container.appendChild(btn2);
    container.appendChild(btn3);
    document.body.appendChild(container);
    trap = new FocusTrap(container);
  });

  afterEach(() => {
    trap.dispose();
    container.remove();
  });

  it('activate focuses the first focusable element', () => {
    trap.activate();
    expect(document.activeElement).toBe(btn1);
  });

  it('Tab on last element wraps to first', () => {
    trap.activate();
    btn3.focus();
    expect(document.activeElement).toBe(btn3);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const prevented = !btn3.dispatchEvent(event);
    // The handler calls preventDefault, but dispatchEvent returns !defaultPrevented
    // Check focus moved to first
    expect(document.activeElement).toBe(btn1);
  });

  it('Shift+Tab on first element wraps to last', () => {
    trap.activate();
    btn1.focus();
    expect(document.activeElement).toBe(btn1);

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    btn1.dispatchEvent(event);
    expect(document.activeElement).toBe(btn3);
  });

  it('Tab in the middle does not wrap', () => {
    trap.activate();
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    btn2.dispatchEvent(event);
    // Focus should stay on btn2 (browser handles normal tab, we only intercept edges)
    expect(document.activeElement).toBe(btn2);
  });

  it('deactivate stops trapping', () => {
    trap.activate();
    trap.deactivate();

    btn3.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    btn3.dispatchEvent(event);
    // Without trap, focus stays where browser left it (btn3 in jsdom)
    expect(document.activeElement).toBe(btn3);
  });

  it('dispose removes all listeners', () => {
    trap.activate();
    trap.dispose();

    btn3.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    btn3.dispatchEvent(event);
    expect(document.activeElement).toBe(btn3);
  });

  it('activate is idempotent (no duplicate listeners)', () => {
    trap.activate();
    trap.activate();

    btn3.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    btn3.dispatchEvent(event);
    expect(document.activeElement).toBe(btn1);
  });

  it('handles container with no focusable elements', () => {
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    const emptyTrap = new FocusTrap(empty);

    // Should not throw
    emptyTrap.activate();
    emptyTrap.dispose();
    empty.remove();
  });
});
