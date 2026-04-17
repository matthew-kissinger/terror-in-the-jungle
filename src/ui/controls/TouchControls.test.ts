/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputContextManager } from '../../systems/input/InputContextManager';

/**
 * Behavior-focused tests for TouchControls.
 *
 * TouchControls is a thin orchestrator; most of its fan-out to sub-components
 * is implementation. We assert on the public contract instead:
 *   - setCallbacks routes action buttons to the right callback.
 *   - Entering/exiting vehicle modes toggles the shared action bar.
 *   - Context changes away from gameplay cancel pending touch gestures.
 *   - Modal overlays suppress pointer events on the touch layer.
 */

const joystickInstances: any[] = [];
const lookInstances: any[] = [];
const fireInstances: any[] = [];
const actionInstances: any[] = [];
const vehicleActionBarInstances: any[] = [];

vi.mock('./VirtualJoystick', () => ({
  VirtualJoystick: class {
    element = document.createElement('div');
    output = { x: 0.5, z: -0.25 };
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setSprintCallbacks = vi.fn();
    setHelicopterMode = vi.fn();
    cancelActiveTouch = vi.fn();

    constructor() {
      joystickInstances.push(this);
    }
  },
}));

vi.mock('./TouchLook', () => ({
  TouchLook: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    consumeDelta = vi.fn().mockReturnValue({ x: 1.2, y: -0.4 });
    setADS = vi.fn();
    cancelActiveLook = vi.fn();

    constructor() {
      lookInstances.push(this);
    }
  },
}));

vi.mock('./TouchFireButton', () => ({
  TouchFireButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setCallbacks = vi.fn();
    cancelActivePress = vi.fn();

    constructor() {
      fireInstances.push(this);
    }
  },
}));

vi.mock('./TouchActionButtons', () => ({
  TouchActionButtons: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setOnAction = vi.fn();
    setOnWeaponSelect = vi.fn();
    setActiveSlot = vi.fn();
    cancelActiveGesture = vi.fn();

    constructor() {
      actionInstances.push(this);
    }
  },
}));

vi.mock('./TouchADSButton', () => ({
  TouchADSButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setOnADSToggle = vi.fn();
    resetADS = vi.fn();
    cancelActivePress = vi.fn();
  },
}));

vi.mock('./TouchInteractionButton', () => ({
  TouchInteractionButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    showButton = vi.fn();
    hideButton = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setCallback = vi.fn();
    setLabel = vi.fn();
  },
}));

vi.mock('./TouchSandbagButtons', () => ({
  TouchSandbagButtons: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setCallbacks = vi.fn();
  },
}));

vi.mock('./TouchRallyPointButton', () => ({
  TouchRallyPointButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    hideButton = vi.fn();
    showButton = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setCallback = vi.fn();
    setSquadCommandCallback = vi.fn();
    cancelActivePress = vi.fn();
  },
}));

vi.mock('./TouchMenuButton', () => ({
  TouchMenuButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setOpenCallback = vi.fn();
  },
}));

vi.mock('./TouchMortarButton', () => ({
  TouchMortarButton: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
  },
}));

vi.mock('./TouchHelicopterCyclic', () => ({
  TouchHelicopterCyclic: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
  },
}));

vi.mock('./VehicleActionBar', () => ({
  VehicleActionBar: class {
    element = document.createElement('div');
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    mount = vi.fn();
    setCallbacks = vi.fn();
    setVehicleContext = vi.fn();
    setFireVisible = vi.fn();
    setWeaponCycleVisible = vi.fn();
    setAutoHoverActive = vi.fn();

    constructor() {
      vehicleActionBarInstances.push(this);
    }
  },
}));

import { TouchControls } from './TouchControls';

describe('TouchControls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (InputContextManager as any).instance = null;
    joystickInstances.length = 0;
    lookInstances.length = 0;
    fireInstances.length = 0;
    actionInstances.length = 0;
    vehicleActionBarInstances.length = 0;
  });

  it('reports visibility state after show / hide', () => {
    const controls = new TouchControls();

    controls.show();
    expect(controls.isVisible()).toBe(true);

    controls.hide();
    expect(controls.isVisible()).toBe(false);
  });

  it('routes jump / reload / map actions to the caller callbacks', () => {
    const controls = new TouchControls();
    const callbacks = {
      onFireStart: vi.fn(),
      onFireStop: vi.fn(),
      onJump: vi.fn(),
      onReload: vi.fn(),
      onGrenade: vi.fn(),
      onSprintStart: vi.fn(),
      onSprintStop: vi.fn(),
      onWeaponSelect: vi.fn(),
      onADSToggle: vi.fn(),
      onEnterExitHelicopter: vi.fn(),
      onSandbagRotateLeft: vi.fn(),
      onSandbagRotateRight: vi.fn(),
      onRallyPointPlace: vi.fn(),
      onMapToggle: vi.fn(),
      onMenuOpen: vi.fn(),
    };

    controls.setCallbacks(callbacks);

    const actionRouter = actionInstances[0].setOnAction.mock.calls[0][0] as (action: string) => void;
    actionRouter('jump');
    actionRouter('reload');
    actionRouter('map');

    expect(callbacks.onJump).toHaveBeenCalledTimes(1);
    expect(callbacks.onReload).toHaveBeenCalledTimes(1);
    expect(callbacks.onMapToggle).toHaveBeenCalledTimes(1);
  });

  it('routes weapon selection through the weapon-select handler', () => {
    const controls = new TouchControls();
    const onWeaponSelect = vi.fn();
    controls.setCallbacks({
      onFireStart: vi.fn(),
      onFireStop: vi.fn(),
      onJump: vi.fn(),
      onReload: vi.fn(),
      onGrenade: vi.fn(),
      onSprintStart: vi.fn(),
      onSprintStop: vi.fn(),
      onWeaponSelect,
      onADSToggle: vi.fn(),
      onSandbagRotateLeft: vi.fn(),
      onSandbagRotateRight: vi.fn(),
      onRallyPointPlace: vi.fn(),
    });

    const weaponRouter = actionInstances[0].setOnWeaponSelect.mock.calls[0][0] as (slot: number) => void;
    weaponRouter(3);
    expect(onWeaponSelect).toHaveBeenCalledWith(3);
  });

  it('enterHelicopterMode / exitHelicopterMode toggles the vehicle action bar', () => {
    const controls = new TouchControls();
    controls.show();

    controls.enterHelicopterMode();
    expect(vehicleActionBarInstances[0].show).toHaveBeenCalled();

    controls.exitHelicopterMode();
    expect(vehicleActionBarInstances[0].hide).toHaveBeenCalled();
  });

  it('flight-mode aliases route through the same vehicle layout', () => {
    const controls = new TouchControls();
    controls.show();

    controls.enterFlightVehicleMode();
    expect(controls.isInFlightMode()).toBe(true);

    controls.exitFlightVehicleMode();
    expect(controls.isInFlightMode()).toBe(false);
  });

  it('leaving the gameplay input context cancels active touch gestures', () => {
    new TouchControls();
    const contextManager = InputContextManager.getInstance();

    contextManager.setContext('menu');

    expect(joystickInstances[0].cancelActiveTouch).toHaveBeenCalled();
    expect(lookInstances[0].cancelActiveLook).toHaveBeenCalled();
    expect(fireInstances[0].cancelActivePress).toHaveBeenCalled();
    expect(actionInstances[0].cancelActiveGesture).toHaveBeenCalled();
  });

  it('ref-counts modal overlays when suppressing touch pointer events', () => {
    const controls = new TouchControls();

    controls.beginModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('none');

    controls.beginModalOverlays();
    controls.endModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('none');

    controls.endModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('');
  });

  it('dispose cleans up cleanly without throwing', () => {
    const controls = new TouchControls();
    expect(() => controls.dispose()).not.toThrow();
  });
});
