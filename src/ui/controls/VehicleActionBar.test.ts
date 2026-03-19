/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleActionBar } from './VehicleActionBar';

function pointerEvent(type: string, opts: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: 'touch',
    ...opts,
  });
}

describe('VehicleActionBar', () => {
  let bar: VehicleActionBar;

  beforeEach(() => {
    document.body.innerHTML = '';
    bar = new VehicleActionBar();
    bar.mount(document.body);
  });

  it('creates EXIT, FIRE, STAB, and LOOK buttons', () => {
    const root = document.getElementById('vehicle-action-bar')!;
    expect(root).toBeTruthy();
    const buttons = Array.from(root.children) as HTMLDivElement[];
    expect(buttons).toHaveLength(4);
    expect(buttons[0].textContent).toBe('EXIT');
    expect(buttons[1].textContent).toBe('FIRE');
    expect(buttons[2].textContent).toBe('STAB');
    expect(buttons[3].textContent).toBe('LOOK');
  });

  it('starts hidden', () => {
    const root = document.getElementById('vehicle-action-bar')!;
    expect(root.style.display).toBe('none');
  });

  it('show/hide toggles visibility', () => {
    const root = document.getElementById('vehicle-action-bar')!;
    bar.show();
    expect(root.style.display).toBe('flex');
    bar.hide();
    expect(root.style.display).toBe('none');
  });

  it('EXIT fires onExitVehicle callback', () => {
    const onExit = vi.fn();
    bar.setCallbacks({ onExitVehicle: onExit });

    const exitBtn = document.querySelector('[aria-label="EXIT"]')!;
    exitBtn.dispatchEvent(pointerEvent('pointerdown'));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('FIRE fires onVehicleFireStart/Stop on pointerdown/up', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    bar.setCallbacks({ onVehicleFireStart: onStart, onVehicleFireStop: onStop });
    bar.setFireVisible(true);

    const fireBtn = document.querySelector('[aria-label="FIRE"]')!;
    fireBtn.dispatchEvent(pointerEvent('pointerdown'));
    expect(onStart).toHaveBeenCalledTimes(1);

    fireBtn.dispatchEvent(pointerEvent('pointerup'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('FIRE button hidden by default, shown via setFireVisible', () => {
    const fireBtn = document.querySelector('[aria-label="FIRE"]') as HTMLDivElement;
    expect(fireBtn.style.display).toBe('none');

    bar.setFireVisible(true);
    expect(fireBtn.style.display).toBe('flex');

    bar.setFireVisible(false);
    expect(fireBtn.style.display).toBe('none');
  });

  it('STAB fires onToggleAutoHover callback', () => {
    const onHover = vi.fn();
    bar.setCallbacks({ onToggleAutoHover: onHover });

    const hoverBtn = document.querySelector('[aria-label="STAB"]')!;
    hoverBtn.dispatchEvent(pointerEvent('pointerdown'));

    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('setAutoHoverActive toggles visual state', () => {
    expect(bar.isAutoHoverActive()).toBe(false);

    bar.setAutoHoverActive(true);
    expect(bar.isAutoHoverActive()).toBe(true);

    bar.setAutoHoverActive(false);
    expect(bar.isAutoHoverActive()).toBe(false);
  });

  it('LOOK fires onLookDown/onLookUp on pointerdown/up', () => {
    const onDown = vi.fn();
    const onUp = vi.fn();
    bar.setCallbacks({ onLookDown: onDown, onLookUp: onUp });

    const lookBtn = document.querySelector('[aria-label="LOOK"]')!;
    lookBtn.dispatchEvent(pointerEvent('pointerdown'));
    expect(onDown).toHaveBeenCalledTimes(1);

    lookBtn.dispatchEvent(pointerEvent('pointerup'));
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('LOOK pointercancel also fires onLookUp', () => {
    const onUp = vi.fn();
    bar.setCallbacks({ onLookUp: onUp });

    const lookBtn = document.querySelector('[aria-label="LOOK"]')!;
    lookBtn.dispatchEvent(pointerEvent('pointerdown'));
    lookBtn.dispatchEvent(pointerEvent('pointercancel'));
    expect(onUp).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the component', () => {
    bar.dispose();
    expect(document.getElementById('vehicle-action-bar')).toBeNull();
  });
});
