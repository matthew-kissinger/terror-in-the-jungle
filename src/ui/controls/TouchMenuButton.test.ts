/**
 * @vitest-environment jsdom
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TouchMenuButton } from './TouchMenuButton';

describe('TouchMenuButton', () => {
  let button: TouchMenuButton;

  beforeEach(() => {
    document.body.innerHTML = '';
    button = new TouchMenuButton();
    button.mount(document.body);
  });

  afterEach(() => {
    button.dispose();
  });

  it('creates button element in the DOM', () => {
    const el = document.getElementById('touch-menu-btn');
    expect(el).toBeTruthy();
    expect(el!.className).toContain('menuBtn');
  });

  it('renders three hamburger lines', () => {
    const el = document.getElementById('touch-menu-btn')!;
    expect(el.children.length).toBe(3);
  });

  it('starts with overlay not visible', () => {
    expect(button.isPaused()).toBe(false);
    expect(document.getElementById('touch-menu-overlay')).toBeNull();
  });

  it('show() makes button visible', () => {
    button.hide();
    button.show();
    const el = document.getElementById('touch-menu-btn')!;
    expect(el.style.display).toBe('flex');
  });

  it('hide() hides the button', () => {
    button.show();
    button.hide();
    const el = document.getElementById('touch-menu-btn')!;
    expect(el.style.display).toBe('none');
  });

  it('tapping button opens pause overlay', () => {
    const el = document.getElementById('touch-menu-btn')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(button.isPaused()).toBe(true);
    const overlay = document.getElementById('touch-menu-overlay');
    expect(overlay).toBeTruthy();
  });

  it('tapping button again closes overlay', () => {
    const el = document.getElementById('touch-menu-btn')!;
    // Open
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(button.isPaused()).toBe(true);

    // Close
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(button.isPaused()).toBe(false);
    expect(document.getElementById('touch-menu-overlay')).toBeNull();
  });

  it('calls onPause callback when overlay opens', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    button.setCallbacks(onPause, onResume);

    const el = document.getElementById('touch-menu-btn')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });

  it('calls onResume callback when overlay closes', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    button.setCallbacks(onPause, onResume);

    const el = document.getElementById('touch-menu-btn')!;
    // Open
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // Close
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('hide() closes overlay and fires onResume', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    button.setCallbacks(onPause, onResume);

    const el = document.getElementById('touch-menu-btn')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(button.isPaused()).toBe(true);

    button.hide();
    expect(button.isPaused()).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('dispose removes button from DOM', () => {
    button.dispose();
    expect(document.getElementById('touch-menu-btn')).toBeNull();
  });

  it('overlay contains Resume and Quit buttons', () => {
    const el = document.getElementById('touch-menu-btn')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const overlay = document.getElementById('touch-menu-overlay')!;
    const buttons = overlay.querySelectorAll('div');
    const textContents = Array.from(buttons).map(b => b.textContent);

    expect(textContents).toContain('PAUSED');
    expect(textContents).toContain('Resume');
    expect(textContents).toContain('Quit to Menu');
  });
});
