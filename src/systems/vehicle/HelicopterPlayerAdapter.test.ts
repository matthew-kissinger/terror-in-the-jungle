import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterPlayerAdapter } from './HelicopterPlayerAdapter';
import type { VehicleTransitionContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: () => false,
}));

function createMockHelicopterModel() {
  return {
    setHelicopterControls: vi.fn(),
    getHelicopterState: vi.fn(() => ({ engineRPM: 0.5 })),
    getFlightData: vi.fn(() => ({ airspeed: 30, heading: 90, verticalSpeed: 2 })),
    getAircraftRole: vi.fn(() => 'transport' as const),
    exitHelicopter: vi.fn(),
    tryEnterHelicopter: vi.fn(),
    startFiring: vi.fn(),
    stopFiring: vi.fn(),
    switchHelicopterWeapon: vi.fn(),
    getWeaponStatus: vi.fn(),
    getHelicopterPositionTo: vi.fn(),
    getHelicopterQuaternionTo: vi.fn(),
    setTerrainManager: vi.fn(),
    setHelipadSystem: vi.fn(),
    setPlayerController: vi.fn(),
    setHUDSystem: vi.fn(),
    setAudioListener: vi.fn(),
    setCombatantSystem: vi.fn(),
    setGrenadeSystem: vi.fn(),
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
    showHelicopterMouseIndicator: vi.fn(),
    updateHelicopterMouseMode: vi.fn(),
    showHelicopterInstruments: vi.fn(),
    hideHelicopterMouseIndicator: vi.fn(),
    hideHelicopterInstruments: vi.fn(),
    setVehicleContext: vi.fn(),
    setHelicopterAircraftRole: vi.fn(),
    updateHelicopterFlightData: vi.fn(),
    updateHelicopterInstruments: vi.fn(),
    updateElevation: vi.fn(),
  };
}

function createTransitionContext(playerState: PlayerState, vehicleId = 'heli_1'): VehicleTransitionContext {
  let flightMouseControlEnabled = false;
  return {
    playerState,
    vehicleId,
    position: new THREE.Vector3(100, 50, 200),
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
      setFlightMouseControlEnabled: vi.fn((enabled: boolean) => {
        flightMouseControlEnabled = enabled;
      }),
      getFlightMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
      getHelicopterMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
    } as any,
    hudSystem: createMockHudSystem() as any,
    gameRenderer: { setCrosshairMode: vi.fn() } as any,
  };
}

describe('HelicopterPlayerAdapter', () => {
  let adapter: HelicopterPlayerAdapter;
  let heliModel: ReturnType<typeof createMockHelicopterModel>;

  beforeEach(() => {
    heliModel = createMockHelicopterModel();
    adapter = new HelicopterPlayerAdapter(heliModel as any);
  });

  it('identifies itself as a helicopter adapter with helicopter input context', () => {
    expect(adapter.vehicleType).toBe('helicopter');
    expect(adapter.inputContext).toBe('helicopter');
  });

  describe('entering the helicopter', () => {
    it('takes the player off their feet and into the cockpit', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);

      // Player no longer running around on foot.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Snapped to the helicopter.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'helicopter.enter');
      // Input is in helicopter mode.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('helicopter');
      // Camera remembers the infantry angles so we can restore them on exit.
      expect(ctx.cameraController.saveInfantryAngles).toHaveBeenCalled();
      // Flight mouse control starts from direct-control mode on every entry.
      expect(ctx.cameraController.setFlightMouseControlEnabled).toHaveBeenCalledWith(true);
      expect(ctx.hudSystem!.updateHelicopterMouseMode).toHaveBeenCalledWith(true);
    });

    it('adjusts the crosshair for the helicopter role on entry', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenCalledWith('helicopter_transport');
    });
  });

  describe('exiting the helicopter', () => {
    it('puts the player back on their feet (restores camera, infantry crosshair, clears flight mode)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(ctx.gameRenderer!.setCrosshairMode).toHaveBeenCalledWith('infantry');
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
    });
  });

  describe('control state', () => {
    it('resetControlState zeroes stick inputs and keeps autoHover enabled by default', () => {
      adapter.setEngineBoost(true);
      adapter.toggleAutoHover();
      adapter.toggleAltitudeLock();

      adapter.resetControlState();

      const controls = adapter.getHelicopterControls();
      expect(controls.collective).toBe(0);
      expect(controls.cyclicPitch).toBe(0);
      expect(controls.cyclicRoll).toBe(0);
      expect(controls.yaw).toBe(0);
      expect(controls.engineBoost).toBe(false);
      expect(controls.autoHover).toBe(true);
    });

    it('toggleAutoHover flips the assist state', () => {
      expect(adapter.getHelicopterControls().autoHover).toBe(true);
      adapter.toggleAutoHover();
      expect(adapter.getHelicopterControls().autoHover).toBe(false);
      adapter.toggleAutoHover();
      expect(adapter.getHelicopterControls().autoHover).toBe(true);
    });
  });
});
