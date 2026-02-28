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

  it('creates weapon cycler, Reload, and Jump buttons', () => {
    expect(container).toBeTruthy();
    // 3 children: weapon cycler pill + 2 action buttons (reload, jump)
    expect(buttons).toHaveLength(3);
    // First child is the weapon cycler pill (contains chevrons + label)
    expect(buttons[0].className).toContain('weaponCycler');
    expect(buttons[1].textContent).toBe('R');
    expect(buttons[2].textContent).toBe('JUMP');
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
});
