import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingPlayerAdapter } from './FixedWingPlayerAdapter';
import type { VehicleTransitionContext, VehicleUpdateContext } from './PlayerVehicleAdapter';
import type { PlayerState } from '../../types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function createMockFixedWingModel(options?: {
  configKey?: string;
  displayName?: string;
  flightData?: Record<string, unknown>;
}) {
  const configKey = options?.configKey ?? 'A1_SKYRAIDER';
  return {
    getDisplayInfo: vi.fn(() => ({ autoLevelDefault: true, displayName: options?.displayName ?? 'A-1 Skyraider' })),
    getConfigKey: vi.fn(() => configKey),
    getFlightData: vi.fn(() => ({
      airspeed: 60,
      heading: 180,
      verticalSpeed: 5,
      altitude: 200,
      altitudeAGL: 150,
      controlPhase: 'flight' as const,
      operationState: 'cruise' as const,
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
      orbitHoldEnabled: false,
      configKey,
      ...options?.flightData,
    })),
    getAircraftPositionTo: vi.fn((_aircraftId: string, target: THREE.Vector3) => {
      target.set(500, 140, 600);
      return true;
    }),
    setPilotedAircraft: vi.fn(),
    setFixedWingPilotIntent: vi.fn(),
    setFixedWingCommand: vi.fn(),
    getPlayerExitPlan: vi.fn((_aircraftId: string, _options: unknown) => ({
      canExit: true,
      mode: 'normal' as const,
      position: new THREE.Vector3(510, 35, 610),
    })),
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
    setFixedWingPhase: vi.fn(),
    setFixedWingOperationState: vi.fn(),
    setFixedWingFlightAssist: vi.fn(),
    setFixedWingAutoLevel: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  };
}

function createTransitionContext(playerState: PlayerState, vehicleId = 'fw_1'): VehicleTransitionContext {
  let flightMouseControlEnabled = false;
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
      setFlightMouseControlEnabled: vi.fn((enabled: boolean) => {
        flightMouseControlEnabled = enabled;
      }),
      getFlightMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
      getHelicopterMouseControlEnabled: vi.fn(() => flightMouseControlEnabled),
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

  it('identifies itself as a fixed-wing adapter with fixed-wing input context', () => {
    expect(adapter.vehicleType).toBe('fixed_wing');
    expect(adapter.inputContext).toBe('fixed_wing');
  });

  describe('entering the aircraft', () => {
    it('puts the player into the cockpit (zeros velocity, snaps position, sets flight mode)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'fw_abc');
      adapter.onEnter(ctx);

      // Player is no longer running around on foot.
      expect(ps.velocity.x).toBe(0);
      expect(ps.velocity.y).toBe(0);
      expect(ps.velocity.z).toBe(0);
      expect(ps.isRunning).toBe(false);
      // Player is snapped to the aircraft position.
      expect(ctx.setPosition).toHaveBeenCalledWith(ctx.position, 'fixedwing.enter');
      // Input subsystem is told we are flying a plane.
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('plane');
      // Model is told this aircraft is now piloted.
      expect(fwModel.setPilotedAircraft).toHaveBeenCalledWith('fw_abc');
      // Flight mouse control starts from direct-control mode on every entry.
      expect(ctx.cameraController.setFlightMouseControlEnabled).toHaveBeenCalledWith(true);
      expect(ctx.hudSystem!.updateFixedWingMouseMode).toHaveBeenCalledWith(true);
      // Stability assist inherits the aircraft default.
      expect(adapter.isAutoLevelEnabled()).toBe(true);
    });
  });

  describe('exiting the aircraft', () => {
    it('releases the cockpit (restores camera, clears piloted aircraft, clears flight mode)', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps);
      adapter.onEnter(ctx);
      adapter.onExit(ctx);

      expect(ctx.cameraController.restoreInfantryAngles).toHaveBeenCalled();
      expect(fwModel.setPilotedAircraft).toHaveBeenCalledWith(null);
      expect(ctx.input.setFlightVehicleMode).toHaveBeenCalledWith('none');
    });

    it('delegates exit planning to the fixed-wing model with the request options', () => {
      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'fw_abc');
      const plannedPosition = new THREE.Vector3(520, 40, 630);
      const plannedExit = {
        canExit: true,
        mode: 'emergency_eject' as const,
        position: plannedPosition,
      };
      fwModel.getPlayerExitPlan.mockReturnValueOnce(plannedExit);

      const result = adapter.getExitPlan(ctx, { allowEject: true, reason: 'input' });

      expect(fwModel.getPlayerExitPlan).toHaveBeenCalledWith('fw_abc', {
        allowEject: true,
        reason: 'input',
      });
      expect(result).toBe(plannedExit);
    });
  });

  describe('stability assist (auto-level)', () => {
    it('resetControlState turns auto-level off', () => {
      adapter.toggleAutoLevel();
      adapter.resetControlState();
      expect(adapter.isAutoLevelEnabled()).toBe(false);
    });

    it('toggleAutoLevel flips the assist state', () => {
      adapter.resetControlState();
      expect(adapter.isAutoLevelEnabled()).toBe(false);
      adapter.toggleAutoLevel();
      expect(adapter.isAutoLevelEnabled()).toBe(true);
      adapter.toggleAutoLevel();
      expect(adapter.isAutoLevelEnabled()).toBe(false);
    });
  });

  describe('per-frame update', () => {
    it('drives the aircraft model with pilot intent while active', () => {
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

      expect(fwModel.setFixedWingPilotIntent).toHaveBeenCalled();
      const intent = fwModel.setFixedWingPilotIntent.mock.calls[0][0];
      // Idle stick: no throttle, no stick deflection.
      expect(intent.throttleTarget).toBe(0);
      expect(intent.pitchIntent).toBe(0);
      expect(intent.bankIntent).toBe(0);
    });

    it('does nothing when the adapter is not active', () => {
      const updateCtx: VehicleUpdateContext = {
        deltaTime: 0.016,
        input: { getTouchControls: vi.fn(() => null) } as any,
        cameraController: {} as any,
      };
      adapter.update(updateCtx);
      expect(fwModel.setFixedWingPilotIntent).not.toHaveBeenCalled();
    });

    it('sends an orbit-hold intent for a gunship when flight assist is engaged airborne', () => {
      fwModel = createMockFixedWingModel({
        configKey: 'AC47_SPOOKY',
        displayName: 'AC-47 Spooky',
        flightData: {
          altitudeAGL: 160,
          weightOnWheels: false,
          operationState: 'cruise',
        },
      });
      adapter = new FixedWingPlayerAdapter(fwModel as any);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'ac47_1');
      adapter.onEnter(ctx);
      adapter.toggleFlightAssist();

      const updateCtx: VehicleUpdateContext = {
        deltaTime: 0.016,
        input: ctx.input,
        cameraController: ctx.cameraController,
        hudSystem: ctx.hudSystem,
      };
      adapter.update(updateCtx);

      expect(fwModel.setFixedWingPilotIntent).toHaveBeenCalled();
      const intent = fwModel.setFixedWingPilotIntent.mock.calls.at(-1)?.[0];
      expect(intent.orbitHoldEnabled).toBe(true);
      expect(intent.assistEnabled).toBe(true);
      expect(Math.hypot(intent.orbitCenterX, intent.orbitCenterZ)).toBeGreaterThan(0);
    });

    it('keeps gunship orbit hold through a small terrain-relative altitude dip', () => {
      const flightData = {
        altitudeAGL: 160,
        weightOnWheels: false,
        operationState: 'cruise',
      };
      fwModel = createMockFixedWingModel({
        configKey: 'AC47_SPOOKY',
        displayName: 'AC-47 Spooky',
        flightData,
      });
      adapter = new FixedWingPlayerAdapter(fwModel as any);

      const ps = createPlayerState();
      const ctx = createTransitionContext(ps, 'ac47_1');
      adapter.onEnter(ctx);
      adapter.toggleFlightAssist();

      const updateCtx: VehicleUpdateContext = {
        deltaTime: 0.016,
        input: ctx.input,
        cameraController: ctx.cameraController,
        hudSystem: ctx.hudSystem,
      };

      flightData.altitudeAGL = 42;
      adapter.update(updateCtx);
      let intent = fwModel.setFixedWingPilotIntent.mock.calls.at(-1)?.[0];
      expect(intent.orbitHoldEnabled).toBe(true);

      flightData.altitudeAGL = 24;
      adapter.update(updateCtx);
      intent = fwModel.setFixedWingPilotIntent.mock.calls.at(-1)?.[0];
      expect(intent.orbitHoldEnabled).toBe(false);
    });
  });
});
