/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputContextManager } from '../../systems/input/InputContextManager';

const joystickInstances: any[] = [];
const lookInstances: any[] = [];
const fireInstances: any[] = [];
const actionInstances: any[] = [];

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

const vehicleActionBarInstances: any[] = [];

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

  it('constructor creates all sub-components', () => {
    const controls = new TouchControls();
    expect(controls.joystick).toBeTruthy();
    expect(controls.look).toBeTruthy();
    expect(controls.fireButton).toBeTruthy();
    expect(controls.actionButtons).toBeTruthy();
    expect(joystickInstances).toHaveLength(1);
    expect(lookInstances).toHaveLength(1);
    expect(fireInstances).toHaveLength(1);
    expect(actionInstances).toHaveLength(1);
  });

  it('show() calls show on all sub-components', () => {
    const controls = new TouchControls();

    controls.show();

    expect(controls.isVisible()).toBe(true);
    expect(joystickInstances[0].show).toHaveBeenCalledTimes(1);
    expect(lookInstances[0].show).toHaveBeenCalledTimes(1);
    expect(fireInstances[0].show).toHaveBeenCalledTimes(1);
    expect(actionInstances[0].show).toHaveBeenCalledTimes(1);
  });

  it('hide() calls hide on all sub-components', () => {
    const controls = new TouchControls();
    controls.show();

    controls.hide();

    expect(controls.isVisible()).toBe(false);
    expect(joystickInstances[0].hide).toHaveBeenCalledTimes(1);
    expect(lookInstances[0].hide).toHaveBeenCalledTimes(1);
    expect(fireInstances[0].hide).toHaveBeenCalledTimes(1);
    expect(actionInstances[0].hide).toHaveBeenCalledTimes(1);
  });

  it('dispose() disposes all sub-components', () => {
    const controls = new TouchControls();

    controls.dispose();

    expect(joystickInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(lookInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(fireInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(actionInstances[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('getMovementVector() returns joystick output', () => {
    const controls = new TouchControls();

    expect(controls.getMovementVector()).toBe(joystickInstances[0].output);
    expect(controls.getMovementVector()).toEqual({ x: 0.5, z: -0.25 });
  });

  it('consumeLookDelta() returns look delta', () => {
    const controls = new TouchControls();

    expect(controls.consumeLookDelta()).toEqual({ x: 1.2, y: -0.4 });
    expect(lookInstances[0].consumeDelta).toHaveBeenCalledTimes(1);
  });

  it('setCallbacks() wires fire, sprint, action, and weapon select callbacks', () => {
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

    expect(fireInstances[0].setCallbacks).toHaveBeenCalledWith(callbacks.onFireStart, callbacks.onFireStop);
    expect(joystickInstances[0].setSprintCallbacks).toHaveBeenCalledWith(callbacks.onSprintStart, callbacks.onSprintStop);
    expect(actionInstances[0].setOnAction).toHaveBeenCalledTimes(1);
    expect(actionInstances[0].setOnWeaponSelect).toHaveBeenCalledTimes(1);

    const actionRouter = actionInstances[0].setOnAction.mock.calls[0][0] as (action: string) => void;
    actionRouter('jump');
    actionRouter('reload');
    actionRouter('command');
    actionRouter('map');

    expect(callbacks.onJump).toHaveBeenCalledTimes(1);
    expect(callbacks.onReload).toHaveBeenCalledTimes(1);
    expect(callbacks.onRallyPointPlace).not.toHaveBeenCalled();
    expect(callbacks.onMapToggle).toHaveBeenCalledTimes(1);

    // Weapon select is wired through setOnWeaponSelect, not through action router
    const weaponRouter = actionInstances[0].setOnWeaponSelect.mock.calls[0][0] as (slot: number) => void;
    weaponRouter(3);
    expect(callbacks.onWeaponSelect).toHaveBeenCalledWith(3);
  });

  it('enterHelicopterMode() shows vehicleActionBar', () => {
    const controls = new TouchControls();
    controls.show();

    controls.enterHelicopterMode();

    expect(vehicleActionBarInstances[0].show).toHaveBeenCalledTimes(1);
  });

  it('exitHelicopterMode() hides vehicleActionBar', () => {
    const controls = new TouchControls();
    controls.show();
    controls.enterHelicopterMode();

    controls.exitHelicopterMode();

    expect(vehicleActionBarInstances[0].hide).toHaveBeenCalled();
  });

  it('flight-mode aliases route through the same vehicle layout', () => {
    const controls = new TouchControls();
    controls.show();

    controls.enterFlightVehicleMode();

    expect(controls.isInFlightMode()).toBe(true);
    expect(vehicleActionBarInstances[0].show).toHaveBeenCalled();

    controls.exitFlightVehicleMode();

    expect(controls.isInFlightMode()).toBe(false);
    expect(vehicleActionBarInstances[0].hide).toHaveBeenCalled();
  });

  it('dispose() disposes vehicleActionBar', () => {
    const controls = new TouchControls();

    controls.dispose();

    expect(vehicleActionBarInstances[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('cancels active touch interactions when input context leaves gameplay', () => {
    new TouchControls();
    const contextManager = InputContextManager.getInstance();

    contextManager.setContext('menu');

    expect(joystickInstances[0].cancelActiveTouch).toHaveBeenCalledTimes(1);
    expect(lookInstances[0].cancelActiveLook).toHaveBeenCalledTimes(1);
    expect(fireInstances[0].cancelActivePress).toHaveBeenCalledTimes(1);
    expect(actionInstances[0].cancelActiveGesture).toHaveBeenCalledTimes(1);
  });

  it('beginModalOverlays / endModalOverlays sets pointer-events on touch roots (ref-counted)', () => {
    const controls = new TouchControls();

    controls.beginModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('none');
    expect(vehicleActionBarInstances[0].element.style.pointerEvents).toBe('none');

    controls.beginModalOverlays();
    controls.endModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('none');

    controls.endModalOverlays();
    expect(joystickInstances[0].element.style.pointerEvents).toBe('');
    expect(vehicleActionBarInstances[0].element.style.pointerEvents).toBe('');
  });
});
