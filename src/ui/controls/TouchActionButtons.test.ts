/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchActionButtons } from './TouchActionButtons';

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

function pointerUpEvent(opts: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerup', {
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
  let buttons: HTMLDivElement[];

  beforeEach(() => {
    document.body.innerHTML = '';
    actions = new TouchActionButtons();
    actions.mount(document.body);
    container = document.getElementById('touch-action-buttons') as HTMLDivElement;
    buttons = Array.from(container.children) as HTMLDivElement[];
  });

  it('creates weapon cycler, Reload, and Jump buttons', () => {
    expect(container).toBeTruthy();
    // 3 children: weapon cycler pill + 2 action buttons (reload, jump)
    expect(buttons).toHaveLength(3);
    // First child is the weapon cycler pill (contains chevrons + label)
    expect(buttons[0].className).toContain('weaponCycler');
    const reloadImg = buttons[1].querySelector('img') as HTMLImageElement;
    expect(reloadImg?.src).toContain('icon-reload.png');
    const jumpImg = buttons[2].querySelector('img') as HTMLImageElement;
    expect(jumpImg?.src).toContain('icon-jump.png');
  });

  it('arranges buttons in a column layout', () => {
    expect(container.className).toContain('actionContainer');
  });

  it('triggers callbacks for reload and jump actions', () => {
    const onAction = vi.fn();
    actions.setOnAction(onAction);

    // buttons[0] is weapon cycler (not an action button), buttons[1]=reload, buttons[2]=jump
    buttons[1].dispatchEvent(pointerDownEvent());
    buttons[2].dispatchEvent(pointerDownEvent());

    expect(onAction).toHaveBeenNthCalledWith(1, 'reload');
    expect(onAction).toHaveBeenNthCalledWith(2, 'jump');
  });

  it('show and hide toggle visibility', () => {
    actions.hide();
    expect(container.style.display).toBe('none');

    actions.show();
    expect(container.style.display).toBe('flex');
  });

  it('dispose removes the container and all buttons', () => {
    actions.dispose();
    expect(document.getElementById('touch-action-buttons')).toBeNull();
  });

  describe('weapon swipe detection', () => {
    it('swipe right cycles to next weapon', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      const weaponCycler = buttons[0];
      // Get the label element (middle child of cycler)
      const label = weaponCycler.children[1] as HTMLElement;

      // Simulate swipe right on the label area (>40px)
      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 150,
      }));

      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
    });

    it('swipe left cycles to previous weapon', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      const weaponCycler = buttons[0];

      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 150,
      }));
      weaponCycler.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));

      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
    });

    it('small movement is treated as tap (not swipe)', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      const weaponCycler = buttons[0];

      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 110,
      }));

      // Single tap should not fire weapon select (needs double-tap for quick-switch)
      expect(onWeaponSelect).not.toHaveBeenCalled();
    });
  });

  describe('double-tap quick-switch', () => {
    it('double-tap switches to previous weapon', () => {
      const onWeaponSelect = vi.fn();
      actions.setOnWeaponSelect(onWeaponSelect);

      // First set up previous weapon by cycling once
      const weaponCycler = buttons[0];
      const prevChevron = weaponCycler.children[0] as HTMLElement;
      const nextChevron = weaponCycler.children[2] as HTMLElement;

      // Cycle to next weapon via chevron to establish history
      nextChevron.dispatchEvent(pointerDownEvent());
      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
      const firstSlot = onWeaponSelect.mock.calls[0][0];

      onWeaponSelect.mockClear();

      // Double tap on label area to quick-switch back
      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));

      // Second tap immediately
      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));
      weaponCycler.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));

      // Should have quick-switched back to original weapon (AR=2)
      expect(onWeaponSelect).toHaveBeenCalledTimes(1);
      expect(onWeaponSelect).toHaveBeenCalledWith(2); // AR slot
    });
  });

  describe('grenade long-press', () => {
    it('fires onGrenadeQuickThrow after 500ms when on grenade slot', () => {
      vi.useFakeTimers();
      const onQuickThrow = vi.fn();
      actions.setOnGrenadeQuickThrow(onQuickThrow);

      // Switch to grenade slot
      actions.setActiveSlot(1); // GRN

      const weaponCycler = buttons[0];

      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));

      // Before 500ms: no callback
      vi.advanceTimersByTime(400);
      expect(onQuickThrow).not.toHaveBeenCalled();

      // At 500ms: callback fires
      vi.advanceTimersByTime(100);
      expect(onQuickThrow).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('does not fire quick-throw on non-grenade slot', () => {
      vi.useFakeTimers();
      const onQuickThrow = vi.fn();
      actions.setOnGrenadeQuickThrow(onQuickThrow);

      // activeIndex defaults to AR=2 (not grenade)
      const weaponCycler = buttons[0];

      weaponCycler.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
        clientX: 100,
      }));

      vi.advanceTimersByTime(600);
      expect(onQuickThrow).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
