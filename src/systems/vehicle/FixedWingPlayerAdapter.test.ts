import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingPlayerAdapter } from './FixedWingPlayerAdapter';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function createMockFixedWingModel() {
  return {
    getDisplayInfo: vi.fn(() => ({ autoLevelDefault: true, displayName: 'A-1 Skyraider' })),
    getFlightData: vi.fn(() => ({
      airspeed: 60,
      heading: 180,
      verticalSpeed: 5,
      altitude: 200,
      altitudeAGL: 150,
      phase: 'airborne' as const,
      aoaDeg: 4,
      sideslipDeg: 0,
      throttle: 0.8,
      brake: 0,
      weightOnWheels: false,
      isStalled: false,
      flightState: 'airborne' as const,
      stallSpeed: 40,
      pitch: 5,
      roll: 0,
    })),
    setPilotedAircraft: vi.fn(),
    setFixedWingCommand: vi.fn(),
    exitAircraft: vi.fn(),
    tryEnterAircraft: vi.fn(),
  };
}

function createPlayerState(): PlayerState {
  return {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(5, 10, 15),
    speed: 10,
    runSpeed: 20,
    isRunning: true,
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

function createMockHudSystem() {
  return {
    showFixedWingInstruments: vi.fn(),
    hideFixedWingInstruments: vi.fn(),
    showFixedWingMouseIndicator: vi.fn(),
    hideFixedWingMouseIndicator: vi.fn(),
    updateFixedWingMouseMode: vi.fn(),
    setVehicleContext: vi.fn(),
    setFixedWingStallSpeed: vi.fn(),
    updateFixedWingFlightData: vi.fn(),
    updateFixedWingThrottle: vi.fn(),
    setFixedWingStallWarning: vi.fn(),
    setFixedWingAutoLevel: vi.fn(),
    updateElevation: vi.fn(),
  };
}

function createTransitionContext(playerState: PlayerState, vehicleId = 'fw_1'): VehicleTransitionContext {
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(500, 30, 600),
    setPosition: vi.fn(),
    input: {
      setInHelicopter: vi.fn(),
      setFlightVehicleMode: vi.fn(),
      setInputContext: vi.fn(),
      isKeyPressed: vi.fn(() => false),
      getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
      clearMouseMovement: vi.fn(),
      getIsPointerLocked: vi.fn(() => false),
      getTouchControls: vi.fn(() => null),
      getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
      getTouchCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      getTouchFlightCyclicInput: vi.fn(() => ({ pitch: 0, roll: 0 })),
      getGamepadManager: vi.fn(() => null),
    } as any,
    cameraController: {
      saveInfantryAngles: vi.fn(),
      restoreInfantryAngles: vi.fn(),
      getFlightMouseControlEnabled: vi.fn(() => false),
      getHelicopterMouseControlEnabled: vi.fn(() => false),
    } as any,
    hudSystem: createMockHudSystem() as any,
  };
}

describe('FixedWingPlayerAdapter', () => {
  let adapter: FixedWingPlayerAdapter;
  let fwModel: ReturnType<typeof createMockFixedWingModel>;

  beforeEach(() => {
    fwModel = createMockFixedWingModel();
    adapter = new FixedWingPlayerAdapter(fwModel as any);
  });

  describe('properties', () => {
    it('has correct vehicleType and inputContext', () => {
      expect(adapter.vehicleType).toBe('fixed_wing');
      expect(adapter.inputContext).toBe('fixed_wing');
    });
  });

  describe('onEnter', () => {
    it('clears player velocity and running state', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
    });

    it('sets player position to aircraft position', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'fixedwing.enter');
    });

    it('initializes stability assist from aircraft config', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // autoLevelDefault is true in mock
      expect(adapter.isAutoLevelEnabled()).toBe(true);
    });

    it('sets input mode to plane', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('plane');
    });

    it('tells FixedWingModel this aircraft is piloted', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'fw_abc');
      adapter.onEnter(ctx);

      expect(fwModel.setPilotedAircraft).toHaveBeenCalledWith('fw_abc');
    });

    it('shows fixed-wing HUD elements', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      const hud = ctx.hudSystem as ReturnType<typeof createMockHudSystem>;
      expect(hud.showFixedWingInstruments).toHaveBeenCalled();
      expect(hud.showFixedWingMouseIndicator).toHaveBeenCalled();
      expect(hud.setVehicleContext).toHaveBeenCalled();
    });
  });

  describe('onExit', () => {
    it('restores camera angles', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
    });

    it('hides fixed-wing HUD elements', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      const hud = ctx.hudSystem as ReturnType<typeof createMockHudSystem>;
      expect(hud.hideFixedWingInstruments).toHaveBeenCalled();
      expect(hud.hideFixedWingMouseIndicator).toHaveBeenCalled();
    });

    it('clears piloted aircraft', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(fwModel.setPilotedAircraft).toHaveBeenCalledWith(null);
    });

    it('resets input mode to none', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
    });
  });

  describe('resetControlState', () => {
    it('zeros all control fields', () => {
      adapter.toggleAutoLevel(); // flip from default

      adapter.resetControlState();

      expect(adapter.isAutoLevelEnabled()).toBe(false);
    });
  });

  describe('toggleAutoLevel', () => {
    it('toggles stability assist on and off', () => {
      // Default is false (resetControlState sets it)
      adapter.resetControlState();
      expect(adapter.isAutoLevelEnabled()).toBe(false);
      adapter.toggleAutoLevel();
      expect(adapter.isAutoLevelEnabled()).toBe(true);
      adapter.toggleAutoLevel();
      expect(adapter.isAutoLevelEnabled()).toBe(false);
    });
  });

  describe('update', () => {
    it('sends command to fixed-wing model when active', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'fw_1');
      adapter.onEnter(ctx);

      const updateCtx: VehicleUpdateContext = {
        deltaTime: 0.016,
        input: ctx.input,
        cameraController: ctx.cameraController,
        hudSystem: ctx.hudSystem,
      };
      adapter.update(updateCtx);

      expect(fwModel.setFixedWingCommand).toHaveBeenCalled();
      const cmd = fwModel.setFixedWingCommand.mock.calls[0][0];
      expect(cmd.throttleTarget).toBe(0); // no W key pressed
      expect(cmd.pitchCommand).toBe(0);
      expect(cmd.rollCommand).toBe(0);
    });

    it('does not send command when not active', () => {
      const updateCtx: VehicleUpdateContext = {
        deltaTime: 0.016,
        input: { getTouchControls: vi.fn(() => null) } as any,
        cameraController: {} as any,
      };
      adapter.update(updateCtx);

      expect(fwModel.setFixedWingCommand).not.toHaveBeenCalled();
    });
  });
});
