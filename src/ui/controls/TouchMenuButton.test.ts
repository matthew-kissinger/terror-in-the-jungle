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

  it('mounts into the document', () => {
    expect(document.getElementById('touch-menu-btn')).toBeTruthy();
  });

  it('show / hide toggle visibility', () => {
    button.hide();
    expect(document.getElementById('touch-menu-btn')!.style.display).toBe('none');

    button.show();
    expect(document.getElementById('touch-menu-btn')!.style.display).not.toBe('none');
  });

  it('tapping the button invokes the open callback', () => {
    const onOpen = vi.fn();
    button.setOpenCallback(onOpen);

    document.getElementById('touch-menu-btn')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the button from the DOM', () => {
    button.dispose();
    expect(document.getElementById('touch-menu-btn')).toBeNull();
  });
});
