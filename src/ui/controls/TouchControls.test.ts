/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const joystickInstances: any[] = [];
const lookInstances: any[] = [];
const fireInstances: any[] = [];
const actionInstances: any[] = [];

vi.mock('./VirtualJoystick', () => ({
  VirtualJoystick: class {
    output = { x: 0.5, z: -0.25 };
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    setSprintCallbacks = vi.fn();

    constructor() {
      joystickInstances.push(this);
    }
  },
}));

vi.mock('./TouchLook', () => ({
  TouchLook: class {
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    consumeDelta = vi.fn().mockReturnValue({ x: 1.2, y: -0.4 });

    constructor() {
      lookInstances.push(this);
    }
  },
}));

vi.mock('./TouchFireButton', () => ({
  TouchFireButton: class {
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    setCallbacks = vi.fn();

    constructor() {
      fireInstances.push(this);
    }
  },
}));

vi.mock('./TouchActionButtons', () => ({
  TouchActionButtons: class {
    show = vi.fn();
    hide = vi.fn();
    dispose = vi.fn();
    setOnAction = vi.fn();

    constructor() {
      actionInstances.push(this);
    }
  },
}));

import { TouchControls } from './TouchControls';

describe('TouchControls', () => {
  beforeEach(() => {
    joystickInstances.length = 0;
    lookInstances.length = 0;
    fireInstances.length = 0;
    actionInstances.length = 0;
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

  it('setCallbacks() wires fire, sprint, and action callbacks', () => {
    const controls = new TouchControls();
    const callbacks = {
      onFireStart: vi.fn(),
      onFireStop: vi.fn(),
      onJump: vi.fn(),
      onReload: vi.fn(),
      onGrenade: vi.fn(),
      onSprintStart: vi.fn(),
      onSprintStop: vi.fn(),
    };

    controls.setCallbacks(callbacks);

    expect(fireInstances[0].setCallbacks).toHaveBeenCalledWith(callbacks.onFireStart, callbacks.onFireStop);
    expect(joystickInstances[0].setSprintCallbacks).toHaveBeenCalledWith(callbacks.onSprintStart, callbacks.onSprintStop);
    expect(actionInstances[0].setOnAction).toHaveBeenCalledTimes(1);

    const actionRouter = actionInstances[0].setOnAction.mock.calls[0][0] as (action: string) => void;
    actionRouter('jump');
    actionRouter('reload');
    actionRouter('grenade');

    expect(callbacks.onJump).toHaveBeenCalledTimes(1);
    expect(callbacks.onReload).toHaveBeenCalledTimes(1);
    expect(callbacks.onGrenade).toHaveBeenCalledTimes(1);
  });
});
