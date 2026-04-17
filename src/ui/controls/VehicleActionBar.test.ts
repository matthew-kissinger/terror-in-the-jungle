/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleActionBar } from './VehicleActionBar';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn(() => true),
}));

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
    vi.mocked(shouldUseTouchControls).mockReturnValue(true);
    bar = new VehicleActionBar();
    bar.mount(document.body);
  });

  it('mounts into the document and starts hidden', () => {
    const root = document.getElementById('vehicle-action-bar')!;
    expect(root).toBeTruthy();
    expect(root.style.display).toBe('none');
  });

  it('show / hide toggle visibility', () => {
    const root = document.getElementById('vehicle-action-bar')!;
    bar.show();
    expect(root.style.display).not.toBe('none');
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

  it('WPN toggles helicopter weapon index when visible', () => {
    const onCycle = vi.fn();
    bar.setCallbacks({ onHelicopterWeaponCycle: onCycle });
    bar.setWeaponCycleVisible(true);

    const wpnBtn = document.querySelector('[aria-label="WPN"]')!;
    wpnBtn.dispatchEvent(pointerEvent('pointerdown'));
    expect(onCycle).toHaveBeenCalledWith(1);

    wpnBtn.dispatchEvent(pointerEvent('pointerdown'));
    expect(onCycle).toHaveBeenCalledWith(0);

    bar.setWeaponCycleVisible(false);
    expect((wpnBtn as HTMLDivElement).style.display).toBe('none');
  });

  it('MAP and CMD fire callbacks', () => {
    const onMap = vi.fn();
    const onCmd = vi.fn();
    bar.setCallbacks({ onMapToggle: onMap, onSquadCommand: onCmd });

    document.querySelector('[aria-label="MAP"]')!.dispatchEvent(pointerEvent('pointerdown'));
    document.querySelector('[aria-label="CMD"]')!.dispatchEvent(pointerEvent('pointerdown'));

    expect(onMap).toHaveBeenCalledTimes(1);
    expect(onCmd).toHaveBeenCalledTimes(1);
  });

  it('setVehicleContext toggles buttons from capabilities', () => {
    bar.setVehicleContext({
      kind: 'helicopter',
      role: 'transport',
      hudVariant: 'flight',
      weaponCount: 0,
      capabilities: {
        canExit: true,
        canFirePrimary: false,
        canCycleWeapons: false,
        canFreeLook: true,
        canStabilize: true,
        canDeploySquad: true,
        canOpenMap: true,
        canOpenCommand: true,
      },
    });

    expect((document.querySelector('[aria-label="EXIT"]') as HTMLDivElement).style.display).toBe('flex');
    expect((document.querySelector('[aria-label="FIRE"]') as HTMLDivElement).style.display).toBe('none');
    expect((document.querySelector('[aria-label="WPN"]') as HTMLDivElement).style.display).toBe('none');
    expect((document.querySelector('[aria-label="MAP"]') as HTMLDivElement).style.display).toBe('flex');
    expect((document.querySelector('[aria-label="CMD"]') as HTMLDivElement).style.display).toBe('flex');
    expect((document.querySelector('[aria-label="STAB"]') as HTMLDivElement).style.display).toBe('flex');
    expect((document.querySelector('[aria-label="STAB"]') as HTMLDivElement).textContent).toBe('STAB');
    // LOOK is hidden when touch controls are active; free-look is handled by the cyclic joystick
    expect((document.querySelector('[aria-label="LOOK"]') as HTMLDivElement).style.display).toBe('none');
  });

  it('shows LOOK when touch controls are not active', async () => {
    vi.mocked(shouldUseTouchControls).mockReturnValue(false);

    bar.setVehicleContext({
      kind: 'plane',
      role: 'attack',
      hudVariant: 'flight',
      weaponCount: 0,
      capabilities: {
        canExit: true,
        canFirePrimary: false,
        canCycleWeapons: false,
        canFreeLook: true,
        canStabilize: true,
        canDeploySquad: false,
        canOpenMap: true,
        canOpenCommand: true,
      },
    });

    expect((document.querySelector('[aria-label="LOOK"]') as HTMLDivElement).style.display).toBe('flex');
  });

  it('relabels the stabilizer button for plane and gunship contexts', () => {
    bar.setVehicleContext({
      kind: 'plane',
      role: 'attack',
      hudVariant: 'flight',
      weaponCount: 0,
      capabilities: {
        canExit: true,
        canFirePrimary: false,
        canCycleWeapons: false,
        canFreeLook: true,
        canStabilize: true,
        canDeploySquad: false,
        canOpenMap: true,
        canOpenCommand: true,
      },
    });
    expect((document.querySelector('[aria-label="LEVEL"]') as HTMLDivElement).textContent).toBe('LEVEL');

    bar.setVehicleContext({
      kind: 'plane',
      role: 'gunship',
      hudVariant: 'flight',
      weaponCount: 0,
      capabilities: {
        canExit: true,
        canFirePrimary: false,
        canCycleWeapons: false,
        canFreeLook: true,
        canStabilize: true,
        canDeploySquad: false,
        canOpenMap: true,
        canOpenCommand: true,
      },
    });
    expect((document.querySelector('[aria-label="ORBIT"]') as HTMLDivElement).textContent).toBe('ORBIT');
  });

  it('cycles weapons using the configured vehicle weapon count', () => {
    const onCycle = vi.fn();
    bar.setCallbacks({ onHelicopterWeaponCycle: onCycle });
    bar.setVehicleContext({
      kind: 'plane',
      role: 'strike',
      hudVariant: 'flight',
      weaponCount: 3,
      capabilities: {
        canExit: true,
        canFirePrimary: true,
        canCycleWeapons: true,
        canFreeLook: true,
        canStabilize: false,
        canDeploySquad: false,
        canOpenMap: true,
        canOpenCommand: false,
      },
    });

    const wpnBtn = document.querySelector('[aria-label="WPN"]')!;
    wpnBtn.dispatchEvent(pointerEvent('pointerdown'));
    wpnBtn.dispatchEvent(pointerEvent('pointerdown'));
    wpnBtn.dispatchEvent(pointerEvent('pointerdown'));

    expect(onCycle).toHaveBeenNthCalledWith(1, 1);
    expect(onCycle).toHaveBeenNthCalledWith(2, 2);
    expect(onCycle).toHaveBeenNthCalledWith(3, 0);
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
