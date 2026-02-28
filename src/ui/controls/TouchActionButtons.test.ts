/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchActionButtons } from './TouchActionButtons';

function pointerDownEvent(): PointerEvent {
  return new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: 'touch',
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

  it('creates Jump, Reload buttons and weapon cycler', () => {
    expect(container).toBeTruthy();
    // 2 action buttons + 1 weapon cycler row
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toBe('JUMP');
    expect(buttons[1].textContent).toBe('R');
    // Third child is the weapon cycler row (contains chevrons + label)
    expect(buttons[2].textContent).toContain('AR');
  });

  it('arranges buttons in a column layout', () => {
    expect(container.className).toContain('actionContainer');
  });

  it('triggers callbacks for jump and reload actions', () => {
    const onAction = vi.fn();
    actions.setOnAction(onAction);

    buttons[0].dispatchEvent(pointerDownEvent());
    buttons[1].dispatchEvent(pointerDownEvent());

    expect(onAction).toHaveBeenNthCalledWith(1, 'jump');
    expect(onAction).toHaveBeenNthCalledWith(2, 'reload');
  });

  it('weapon cycler triggers onWeaponSelect callback', () => {
    const onWeaponSelect = vi.fn();
    actions.setOnWeaponSelect(onWeaponSelect);

    // The weapon cycler row is the 3rd child; its next chevron is the last child
    const cyclerRow = buttons[2];
    const nextChevron = cyclerRow.lastElementChild as HTMLDivElement;
    nextChevron.dispatchEvent(pointerDownEvent());

    expect(onWeaponSelect).toHaveBeenCalledTimes(1);
    // Default activeIndex is 2 (AR), cycling next skips equipment → gives 4 (SMG)
    expect(onWeaponSelect).toHaveBeenCalledWith(4);
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
});
