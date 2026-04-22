import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingModel } from './FixedWingModel';
import { AircraftModels } from '../assets/modelPaths';
import type { FixedWingSpawnMetadata } from './FixedWingOperations';

// Mock ModelLoader
vi.mock('../assets/ModelLoader', () => ({
  ModelLoader: class {
    async loadModel(_path: string): Promise<THREE.Group> {
      const group = new THREE.Group();
      group.name = 'mock-aircraft';
      // Add a propeller node for animation testing
      const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      prop.name = 'propeller';
      group.add(prop);
      return group;
    }
  },
}));

function createScene(): THREE.Scene {
  return new THREE.Scene();
}

function createMockTerrain() {
  return {
    getEffectiveHeightAt: vi.fn().mockReturnValue(10),
    getHeightAt: vi.fn().mockReturnValue(10),
    getSlopeAt: vi.fn().mockReturnValue(0),
    getNormalAt: vi.fn().mockReturnValue(new THREE.Vector3(0, 1, 0)),
    getPlayableWorldSize: vi.fn().mockReturnValue(3200),
    getVisualWorldSize: vi.fn().mockReturnValue(3200),
    getWorldSize: vi.fn().mockReturnValue(3200),
    isTerrainReady: vi.fn().mockReturnValue(true),
    hasTerrainAt: vi.fn().mockReturnValue(true),
    getActiveTerrainTileCount: vi.fn().mockReturnValue(1),
    setSurfaceWetness: vi.fn(),
    updatePlayerPosition: vi.fn(),
    registerCollisionObject: vi.fn(),
    unregisterCollisionObject: vi.fn(),
    raycastTerrain: vi.fn().mockReturnValue({ hit: false }),
  };
}

function createSpawnMetadata(): FixedWingSpawnMetadata {
  return {
    standId: 'stand_a1',
    taxiRoute: [
      new THREE.Vector3(100, 0, -200),
      new THREE.Vector3(60, 0, -200),
      new THREE.Vector3(20, 0, -230),
    ],
    runwayStart: {
      id: 'south_departure',
      position: new THREE.Vector3(0, 0, -260),
      heading: Math.PI,
      holdShortPosition: new THREE.Vector3(20, 0, -230),
      shortFinalDistance: 140,
      shortFinalAltitude: 32,
    },
  };
}

describe('FixedWingModel', () => {
  let model: FixedWingModel;
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = createScene();
    model = new FixedWingModel(scene);
    model.setTerrainManager(createMockTerrain() as any);
  });

  describe('static helpers', () => {
    it('identifies fixed-wing model paths', () => {
      expect(FixedWingModel.isFixedWingModelPath(AircraftModels.A1_SKYRAIDER)).toBe(true);
      expect(FixedWingModel.isFixedWingModelPath(AircraftModels.F4_PHANTOM)).toBe(true);
      expect(FixedWingModel.isFixedWingModelPath(AircraftModels.AC47_SPOOKY)).toBe(true);
      expect(FixedWingModel.isFixedWingModelPath(AircraftModels.UH1_HUEY)).toBe(false);
      expect(FixedWingModel.isFixedWingModelPath('random/model.glb')).toBe(false);
    });
  });

  describe('aircraft creation', () => {
    it('creates an A-1 Skyraider at a parking spot', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      const result = await model.createAircraftAtSpot('test_fw_0', AircraftModels.A1_SKYRAIDER, pos, 0);
      expect(result).toBe(true);
      expect(model.hasAircraft()).toBe(true);
    });

    it('returns false for unknown model path', async () => {
      const pos = new THREE.Vector3(0, 0, 0);
      const result = await model.createAircraftAtSpot('test', 'unknown/model.glb', pos, 0);
      expect(result).toBe(false);
    });

    it('provides flight data reflecting a parked aircraft after creation', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      const fd = model.getFlightData('fw1');
      expect(fd).not.toBeNull();
      expect(fd!.airspeed).toBe(0);
      expect(fd!.flightState).toBe('grounded');
      expect(fd!.stallSpeed).toBeGreaterThan(0);
    });

    it('provides display info that distinguishes propeller aircraft from jets', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.F4_PHANTOM, pos, 0);
      const display = model.getDisplayInfo('fw1');
      expect(display).not.toBeNull();
      expect(display!.displayName).toBe('F-4 Phantom');
      expect(display!.hasPropellers).toBe(false);
    });

    it('stores cloned fixed-wing spawn metadata for runway helpers', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      const metadata = createSpawnMetadata();
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0, metadata);

      const stored = model.getSpawnMetadata('fw1');
      expect(stored).not.toBeNull();
      expect(stored).not.toBe(metadata);
      expect(stored?.standId).toBe('stand_a1');
      expect(stored?.taxiRoute).toHaveLength(3);
      expect(stored?.runwayStart?.id).toBe('south_departure');
      expect(stored?.runwayStart?.position).not.toBe(metadata.runwayStart?.position);
    });
  });

  describe('controls', () => {
    it('accelerates from standstill when the pilot applies throttle', async () => {
      const pos = new THREE.Vector3(100, 500, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      model.setPilotedAircraft('fw1');
      model.setFixedWingControls({ throttle: 1, pitch: 0, roll: 0, yaw: 0 });

      for (let i = 0; i < 60; i++) {
        model.update(1 / 60);
      }

      const fd = model.getFlightData('fw1');
      expect(fd).not.toBeNull();
      expect(fd!.airspeed).toBeGreaterThan(0);
    });
  });

  describe('position queries', () => {
    it('returns aircraft position and rejects unknown IDs', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      const target = new THREE.Vector3();
      expect(model.getAircraftPositionTo('fw1', target)).toBe(true);
      expect(target.x).toBeCloseTo(100, 0);
      expect(model.getAircraftPositionTo('nonexistent', target)).toBe(false);
    });

    it('repositions an aircraft to its runway lineup point when spawn metadata exists', async () => {
      const metadata = createSpawnMetadata();
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, new THREE.Vector3(100, 10, -200), 0, metadata);

      expect(model.positionAircraftAtRunwayStart('fw1')).toBe(true);

      const target = new THREE.Vector3();
      expect(model.getAircraftPositionTo('fw1', target)).toBe(true);
      expect(target.x).toBeCloseTo(metadata.runwayStart!.position.x, 4);
      expect(target.z).toBeCloseTo(metadata.runwayStart!.position.z, 4);
      expect(target.y).toBeCloseTo(10.5, 4);
      expect(model.getFlightData('fw1')?.operationState).toBe('lineup');
    });

    it('repositions an aircraft onto approach using runway metadata', async () => {
      const metadata = createSpawnMetadata();
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, new THREE.Vector3(100, 10, -200), 0, metadata);

      expect(model.positionAircraftOnApproach('fw1')).toBe(true);

      const flightData = model.getFlightData('fw1');
      expect(flightData).not.toBeNull();
      expect(flightData?.weightOnWheels).toBe(false);
      expect(flightData?.controlPhase).toBe('approach');
      expect(flightData?.operationState).toBe('approach');
      expect(flightData?.verticalSpeed).toBeLessThan(-4);
    });
  });

  describe('exit gating', () => {
    it('refuses exit while the aircraft is airborne and shows a HUD message', async () => {
      const metadata = createSpawnMetadata();
      const hud = { showMessage: vi.fn() };
      const playerController = {
        isInHelicopter: () => false,
        isInFixedWing: () => true,
        getFixedWingId: () => 'fw1',
        exitFixedWing: vi.fn(),
      };
      model.setHUDSystem(hud as any);
      model.setPlayerController(playerController as any);

      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, new THREE.Vector3(100, 10, -200), 0, metadata);
      model.setPilotedAircraft('fw1');
      model.positionAircraftOnApproach('fw1');

      model.exitAircraft();

      expect(hud.showMessage).toHaveBeenCalledWith('Aircraft must be on the ground before exit.', 2000);
      expect(playerController.exitFixedWing).not.toHaveBeenCalled();
    });
  });

  describe('simulation culling', () => {
    function makeCamera(x: number, y: number, z: number): THREE.PerspectiveCamera {
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
      camera.position.set(x, y, z);
      return camera;
    }

    function makePlayerController(camera: THREE.PerspectiveCamera) {
      return {
        isInHelicopter: () => false,
        isInFixedWing: () => false,
        getFixedWingId: () => null,
        exitFixedWing: vi.fn(),
        updatePlayerPosition: vi.fn(),
        getCamera: () => camera,
      };
    }

    it('skips physics for an unpiloted parked aircraft far from the camera', async () => {
      const camera = makeCamera(10_000, 20, 10_000); // well beyond any cull distance
      scene.fog = new THREE.Fog(0x888888, 50, 450);
      model.setPlayerController(makePlayerController(camera) as any);

      const parkingPos = new THREE.Vector3(0, 10, 0);
      await model.createAircraftAtSpot('fw_far', AircraftModels.A1_SKYRAIDER, parkingPos, 0);

      const beforePos = new THREE.Vector3();
      const beforeQuat = new THREE.Quaternion();
      model.getAircraftPositionTo('fw_far', beforePos);
      model.getAircraftQuaternionTo('fw_far', beforeQuat);

      // Drive many simulation ticks; a parked aircraft should not move anyway,
      // but the point here is that step() is not called — we verify that by
      // checking the position/orientation remain bit-identical and velocity
      // stays at zero after the cull transition.
      for (let i = 0; i < 30; i++) {
        model.update(1 / 60);
      }

      const afterPos = new THREE.Vector3();
      const afterQuat = new THREE.Quaternion();
      const afterVel = new THREE.Vector3();
      model.getAircraftPositionTo('fw_far', afterPos);
      model.getAircraftQuaternionTo('fw_far', afterQuat);
      model.getAircraftVelocityTo('fw_far', afterVel);

      expect(afterPos.x).toBe(beforePos.x);
      expect(afterPos.y).toBe(beforePos.y);
      expect(afterPos.z).toBe(beforePos.z);
      expect(afterQuat.x).toBe(beforeQuat.x);
      expect(afterQuat.y).toBe(beforeQuat.y);
      expect(afterQuat.z).toBe(beforeQuat.z);
      expect(afterQuat.w).toBe(beforeQuat.w);
      expect(afterVel.length()).toBe(0);
    });

    it('resumes physics for an unpiloted parked aircraft when the camera is near', async () => {
      const camera = makeCamera(50, 10, 50); // well within cull distance
      scene.fog = new THREE.Fog(0x888888, 50, 450);
      model.setPlayerController(makePlayerController(camera) as any);

      const parkingPos = new THREE.Vector3(0, 10, 0);
      await model.createAircraftAtSpot('fw_near', AircraftModels.A1_SKYRAIDER, parkingPos, 0);

      // With the camera in range, the aircraft is simulated. A parked aircraft
      // with no command still has its physics tick run, so flight data remains
      // well-formed (grounded, zero airspeed).
      for (let i = 0; i < 5; i++) {
        model.update(1 / 60);
      }

      const fd = model.getFlightData('fw_near');
      expect(fd).not.toBeNull();
      expect(fd!.flightState).toBe('grounded');
      expect(fd!.airspeed).toBe(0);
    });
  });

  describe('piloted pose feed', () => {
    // Regression: PlayerController used to receive the raw physics pose while
    // the camera and render mesh consumed the interpolated pose, producing a
    // tick-back-and-forth sawtooth at high render rates. The contract is that
    // every external consumer reads the same interpolated visual pose.
    it('feeds the same interpolated pose to PlayerController that the render mesh uses', async () => {
      const pos = new THREE.Vector3(0, 500, 0);
      const updatePlayerPosition = vi.fn();
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
      camera.position.set(0, 500, 0);
      const playerController = {
        isInHelicopter: () => false,
        isInFixedWing: () => true,
        getFixedWingId: () => 'fw1',
        exitFixedWing: vi.fn(),
        updatePlayerPosition,
        getCamera: () => camera,
      };
      model.setPlayerController(playerController as any);

      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      model.setPilotedAircraft('fw1');
      model.setFixedWingControls({ throttle: 1, pitch: 0, roll: 0, yaw: 0 });

      // Step forward with a render dt faster than the 1/60 fixed step so the
      // accumulator spends most frames between physics boundaries. If the feed
      // were raw-physics, the PlayerController receive would see a zero-delta
      // step whenever the accumulator did not cross a boundary.
      const RENDER_DT = 1 / 144;
      for (let i = 0; i < 60; i++) {
        model.update(RENDER_DT);
      }

      // Final call to updatePlayerPosition must match the group position, which
      // is the interpolated visual pose.
      const groupPos = new THREE.Vector3();
      model.getAircraftPositionTo('fw1', groupPos);
      const lastCall = updatePlayerPosition.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const fedPos = lastCall![0] as THREE.Vector3;
      expect(fedPos.x).toBeCloseTo(groupPos.x, 5);
      expect(fedPos.y).toBeCloseTo(groupPos.y, 5);
      expect(fedPos.z).toBeCloseTo(groupPos.z, 5);
    });
  });

  describe('dispose', () => {
    it('cleans up all aircraft on dispose', async () => {
      const pos = new THREE.Vector3(0, 10, 0);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      await model.createAircraftAtSpot('fw2', AircraftModels.F4_PHANTOM, pos, 0);
      expect(model.hasAircraft()).toBe(true);

      model.dispose();
      expect(model.hasAircraft()).toBe(false);
    });
  });
});
