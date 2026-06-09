// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerInput } from '../player/PlayerInput';
import { EmplacementPlayerAdapter } from './EmplacementPlayerAdapter';
import { TankGunnerAdapter } from './TankGunnerAdapter';
import { Emplacement } from './Emplacement';
import { Tank } from './Tank';
import { TankTurret } from './TankTurret';
import { Faction } from '../combat/types';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

/**
 * L3 regression: real left-mouse-button state drives seated fire intent.
 *
 * Before this slice the tank/M2HB gunner adapters probed the input object
 * for `isMouseButtonPressed` / `getMouseButton` via duck-typing — methods no
 * production input class implemented — so a left click while seated never
 * registered as fire. This wires a *real* `PlayerInput` (the production input
 * class) through real `mousedown` / `mouseup` events into real gunner
 * adapters and asserts the observable outcome: holding LMB latches a fire
 * request, releasing it stops.
 *
 * The behaviour under test is "seated fire intent follows the real mouse
 * button", not any internal probe shape — so it survives the adapters being
 * refactored to a different fire-poll path.
 */

// Mock browser globals for the node test environment (mirrors PlayerInput.test.ts).
if (typeof document === 'undefined') {
  class MockEventTarget {
    listeners: Record<string, Function[]> = {};
    addEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback);
    }
    removeEventListener(type: string, callback: Function) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(l => l !== callback);
    }
    dispatchEvent(event: any) {
      const type = event.type;
      if (this.listeners[type]) {
        this.listeners[type].forEach(callback => callback(event));
      }
      return true;
    }
  }

  const doc = new MockEventTarget() as any;
  doc.body = new MockEventTarget();
  doc.body.requestPointerLock = vi.fn();
  doc.exitPointerLock = vi.fn();
  doc.pointerLockElement = null;

  vi.stubGlobal('document', doc);
  vi.stubGlobal('Event', class {
    type: string;
    constructor(type: string) { this.type = type; }
  });
  vi.stubGlobal('MouseEvent', class {
    type: string;
    button: number;
    movementX = 0;
    movementY = 0;
    constructor(type: string, init?: any) {
      this.type = type;
      this.button = init?.button ?? 0;
    }
  });
}

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn().mockReturnValue(false),
  isTouchDevice: vi.fn().mockReturnValue(false),
  isMobileViewport: vi.fn().mockReturnValue(false),
}));

vi.mock('../../ui/controls/TouchControls', () => {
  const MockTouchControls = vi.fn(function (this: any) {
    this.setCallbacks = vi.fn();
    this.look = { setSensitivity: vi.fn() };
    this.rallyPointButton = { showButton: vi.fn() };
    this.helicopterCyclic = { getCyclicInput: vi.fn().mockReturnValue({ pitch: 0, roll: 0 }) };
    this.show = vi.fn();
    this.hide = vi.fn();
    this.consumeLookDelta = vi.fn().mockReturnValue({ x: 0, y: 0 });
    this.getMovementVector = vi.fn().mockReturnValue({ x: 0, z: 0 });
    this.dispose = vi.fn();
  });
  return { TouchControls: MockTouchControls };
});

vi.mock('../../ui/controls/GamepadManager', () => {
  const MockGamepadManager = vi.fn(function (this: any) {
    this.setCallbacks = vi.fn();
    this.poll = vi.fn();
    this.isActive = vi.fn().mockReturnValue(false);
    this.isConnected = vi.fn().mockReturnValue(false);
    this.consumeLookDelta = vi.fn().mockReturnValue({ x: 0, y: 0 });
    this.getMovementVector = vi.fn().mockReturnValue({ x: 0, z: 0 });
    this.updateSensitivity = vi.fn();
    this.dispose = vi.fn();
  });
  return { GamepadManager: MockGamepadManager };
});

const LEFT_BUTTON = 0;

/** Put the real PlayerInput in a state where mousedown/up record button state. */
function makeLockedInput(): PlayerInput {
  const input = new PlayerInput();
  input.setControlsEnabled(true);
  // Report pointer-locked so onMouseDown/onMouseUp accept the events.
  Object.defineProperty(document, 'pointerLockElement', {
    value: (document as any).body,
    configurable: true,
  });
  document.dispatchEvent(new Event('pointerlockchange'));
  return input;
}

function pressLeftButton(): void {
  document.dispatchEvent(new MouseEvent('mousedown', { button: LEFT_BUTTON }));
}

function releaseLeftButton(): void {
  document.dispatchEvent(new MouseEvent('mouseup', { button: LEFT_BUTTON }));
}

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 10,
    runSpeed: 20,
    isRunning: false,
    isGrounded: true,
    isJumping: false,
    jumpForce: 12,
    gravity: -25,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
  };
}

function makeCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
    setVehicleFollowCamera: vi.fn(),
  } as any;
}

function makeHud() {
  return { setVehicleContext: vi.fn(), updateElevation: vi.fn(), showMessage: vi.fn() } as any;
}

function makeTransitionContext(input: PlayerInput): VehicleTransitionContext {
  return {
    playerState: createPlayerState(),
    vehicleId: 'veh_1',
    position: new THREE.Vector3(0, 1, 0),
    setPosition: vi.fn(),
    input,
    cameraController: makeCameraController(),
    hudSystem: makeHud(),
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

function makeUpdateContext(input: PlayerInput): VehicleUpdateContext {
  return {
    deltaTime: 1 / 60,
    input,
    cameraController: makeCameraController(),
    hudSystem: makeHud(),
  };
}

function makeEmplacement(): Emplacement {
  const scene = new THREE.Scene();
  const tripod = new THREE.Object3D();
  tripod.position.set(20, 1.2, 30);
  scene.add(tripod);
  return new Emplacement('m2hb_1', tripod, Faction.US);
}

function makeTankWithTurret(): { tank: Tank; turret: TankTurret } {
  const scene = new THREE.Scene();
  const object = new THREE.Object3D();
  object.position.set(0, 1, 0);
  scene.add(object);
  const tank = new Tank('m48_1', object, Faction.US);
  return { tank, turret: tank.getTurret() };
}

describe('seated fire intent follows the real mouse button', () => {
  let input: PlayerInput;

  beforeEach(() => {
    input = makeLockedInput();
  });

  afterEach(() => {
    input.dispose();
    vi.clearAllMocks();
  });

  describe('M2HB emplacement gunner', () => {
    it('latches a fire request while LMB is held, and stops once released', () => {
      const adapter = new EmplacementPlayerAdapter(makeEmplacement());
      adapter.onEnter(makeTransitionContext(input));

      // No button held → no fire intent.
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(false);

      // Hold left mouse button → fire intent true.
      pressLeftButton();
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(true);

      // Still held next frame → still firing.
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(true);

      // Release → fire intent stops.
      releaseLeftButton();
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(false);
    });
  });

  describe('tank gunner', () => {
    it('latches a fire request while LMB is held, and stops once released', () => {
      const { tank, turret } = makeTankWithTurret();
      const adapter = new TankGunnerAdapter(tank, turret);
      adapter.onEnter(makeTransitionContext(input));

      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(false);

      pressLeftButton();
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(true);

      releaseLeftButton();
      adapter.update(makeUpdateContext(input));
      expect(adapter.consumeFireRequest()).toBe(false);
    });
  });

  it('does not register seated fire from a held button once the player dismounts', () => {
    const adapter = new EmplacementPlayerAdapter(makeEmplacement());
    const ctx = makeTransitionContext(input);
    adapter.onEnter(ctx);

    pressLeftButton();
    adapter.onExit(ctx);

    // After dismount the adapter ignores input entirely (not mounted).
    adapter.update(makeUpdateContext(input));
    expect(adapter.consumeFireRequest()).toBe(false);
  });
});
