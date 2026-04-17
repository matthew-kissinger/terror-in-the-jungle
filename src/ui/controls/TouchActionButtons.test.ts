/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchActionButtons } from './TouchActionButtons';

/**
 * Behavior-focused tests for the touch action button strip.
 *
 * Covers reload/jump routing, weapon swipe cycling, quick-switch double-tap,
 * grenade long-press, and show/hide. We intentionally do not assert on the
 * exact number of buttons, their specific icon file names, or the container
 * class name — those are layout details that will change.
 */
function pointerDownEvent(opts: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: 'touch',
    ...opts,
  });
}

describe('TouchActionButtons', () => {
  let actions: TouchActionButtons;
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    actions = new TouchActionButtons();
    actions.mount(document.body);
    container = document.getElementById('touch-action-buttons') as HTMLDivElement;
  });

  it('mounts into the document', () => {
    expect(container).toBeTruthy();
  });

  it('routes reload and jump presses to the onAction callback', () => {
    const onAction = vi.fn();
    actions.setOnAction(onAction);

    const reloadBtn = container.querySelector('[aria-label="R"]') as HTMLDivElement;
    const jumpBtn = container.querySelector('[aria-label="JUMP"]') as HTMLDivElement;
    reloadBtn.dispatchEvent(pointerDownEvent());
    jumpBtn.dispatchEvent(pointerDownEvent());

    expect(onAction).toHaveBeenNthCalledWith(1, 'reload');
    expect(onAction).toHaveBeenNthCalledWith(2, 'jump');
  });

  it('show / hide toggle visibility', () => {
    actions.hide();
    expect(container.style.display).toBe('none');

    actions.show();
    expect(container.style.display).not.toBe('none');
  });

  it('dispose removes the container', () => {
    actions.dispose();
    expect(document.getElementById('touch-action-buttons')).toBeNull();
  });

  describe('weapon swipe detection', () => {
    const weaponCycler = () =>
      container.firstElementChild as HTMLElement;

    it('a horizontal swipe on the cycler selects a different weapon', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      weaponCycler().dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler().dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 150,
      }));

      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
    });

    it('a tiny drag is not treated as a swipe', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      weaponCycler().dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler().dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 110,
      }));

      // A single tap should not fire weapon select (needs double-tap for quick-switch)
      expect(onWeaponSelect).not.toHaveBeenCalled();
    });
  });

  describe('double-tap quick-switch', () => {
    const weaponCycler = () =>
      container.firstElementChild as HTMLElement;

    it('double-tap on the cycler switches to the previous weapon', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      // Establish a previous weapon via the next chevron
      const nextChevron = weaponCycler().children[3] as HTMLElement;
      nextChevron.dispatchEvent(pointerDownEvent());
      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
      onWeaponSelect.mockClear();

      // Two quick taps on the label area
      for (let i = 0; i < 2; i++) {
        weaponCycler().dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
          clientX: 100,
        }));
        weaponCycler().dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
          clientX: 100,
        }));
      }

      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('grenade long-press', () => {
    const weaponCycler = () =>
      container.firstElementChild as HTMLElement;

    it('fires quick-throw after a long press while on the grenade slot', () => {
      vi.useFakeTimers();
      try {
        const onQuickThrow = vi.fn();
        actions.setOnGrenadeQuickThrow(onQuickThrow);
        actions.setActiveSlot(1); // grenade slot

        weaponCycler().dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
          clientX: 100,
        }));

        vi.advanceTimersByTime(1_000);
        expect(onQuickThrow).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not fire quick-throw on a non-grenade slot', () => {
      vi.useFakeTimers();
      try {
        const onQuickThrow = vi.fn();
        actions.setOnGrenadeQuickThrow(onQuickThrow);
        // activeIndex defaults to a non-grenade slot

        weaponCycler().dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
          clientX: 100,
        }));

        vi.advanceTimersByTime(1_000);
        expect(onQuickThrow).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
