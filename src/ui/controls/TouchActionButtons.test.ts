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

  it('creates Reload and Jump buttons (weapon cycling handled by WeaponPill)', () => {
    expect(container).toBeTruthy();
    // 2 action buttons only — weapon cycler removed (WeaponPill handles cycling)
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('R');
    expect(buttons[1].textContent).toBe('JUMP');
  });

  it('arranges buttons in a column layout', () => {
    expect(container.className).toContain('actionContainer');
  });

  it('triggers callbacks for reload and jump actions', () => {
    const onAction = vi.fn();
    actions.setOnAction(onAction);

    buttons[0].dispatchEvent(pointerDownEvent());
    buttons[1].dispatchEvent(pointerDownEvent());

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
