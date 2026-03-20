/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('renders menu icon', () => {
    const el = document.getElementById('touch-menu-btn')!;
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('icon-menu.png');
  });

  it('show() makes button visible', () => {
    button.hide();
    button.show();
    expect(document.getElementById('touch-menu-btn')!.style.display).toBe('flex');
  });

  it('hide() hides the button', () => {
    button.show();
    button.hide();
    expect(document.getElementById('touch-menu-btn')!.style.display).toBe('none');
  });

  it('tapping the button calls the shared menu callback', () => {
    const onOpen = vi.fn();
    button.setOpenCallback(onOpen);

    document.getElementById('touch-menu-btn')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.getElementById('touch-menu-overlay')).toBeNull();
  });

  it('dispose removes button from DOM', () => {
    button.dispose();
    expect(document.getElementById('touch-menu-btn')).toBeNull();
  });
});
