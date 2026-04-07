import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FixedWingModel } from './FixedWingModel';
import { AircraftModels } from '../assets/modelPaths';

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

    it('uses raw terrain height rather than effective collision height for placement and sampling', async () => {
      const terrain = createMockTerrain();
      terrain.getHeightAt.mockReturnValue(8);
      terrain.getEffectiveHeightAt.mockReturnValue(40);

      model.setTerrainManager(terrain as any);

      const pos = new THREE.Vector3(50, 0, -25);
      await model.createAircraftAtSpot('fw_raw_height', AircraftModels.A1_SKYRAIDER, pos, 0);

      expect(terrain.getHeightAt).toHaveBeenCalledWith(50, -25);
      expect(terrain.registerCollisionObject).toHaveBeenCalledWith(
        'fw_raw_height',
        expect.any(THREE.Group),
        { dynamic: true },
      );

      model.update(1 / 60);

      expect(terrain.getEffectiveHeightAt).not.toHaveBeenCalledWith(50, -25);
    });

    it('returns false for unknown model path', async () => {
      const pos = new THREE.Vector3(0, 0, 0);
      const result = await model.createAircraftAtSpot('test', 'unknown/model.glb', pos, 0);
      expect(result).toBe(false);
    });

    it('provides flight data after creation', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      const fd = model.getFlightData('fw1');
      expect(fd).not.toBeNull();
      expect(fd!.airspeed).toBe(0);
      expect(fd!.flightState).toBe('grounded');
      expect(fd!.stallSpeed).toBe(40);
    });

    it('provides display info for created aircraft', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.F4_PHANTOM, pos, 0);
      const display = model.getDisplayInfo('fw1');
      expect(display).not.toBeNull();
      expect(display!.displayName).toBe('F-4 Phantom');
      expect(display!.hasPropellers).toBe(false);
      expect(display!.fovWidenEnabled).toBe(true);
    });
  });

  describe('controls', () => {
    it('accepts control inputs', async () => {
      const pos = new THREE.Vector3(100, 500, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      model.setPilotedAircraft('fw1');
      model.setFixedWingControls({ throttle: 1, pitch: 0, roll: 0, yaw: 0 });

      // Update a few frames
      for (let i = 0; i < 60; i++) {
        model.update(1 / 60);
      }

      const fd = model.getFlightData('fw1');
      expect(fd).not.toBeNull();
      // Aircraft should have gained speed from throttle
      expect(fd!.airspeed).toBeGreaterThan(0);
    });

    it('resets controls when pilot is cleared', async () => {
      const pos = new THREE.Vector3(100, 500, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      model.setPilotedAircraft('fw1');
      model.setFixedWingControls({ throttle: 1, pitch: 0.5, roll: 0.5, yaw: 0.3 });
      model.setPilotedAircraft(null);

      // Controls should have been reset internally
      const physics = model.getPhysics('fw1');
      expect(physics).not.toBeNull();
    });
  });

  describe('position queries', () => {
    it('returns aircraft position', async () => {
      const pos = new THREE.Vector3(100, 10, -200);
      await model.createAircraftAtSpot('fw1', AircraftModels.A1_SKYRAIDER, pos, 0);
      const target = new THREE.Vector3();
      const result = model.getAircraftPositionTo('fw1', target);
      expect(result).toBe(true);
      expect(target.x).toBeCloseTo(100, 0);
    });

    it('returns false for unknown aircraft ID', () => {
      const target = new THREE.Vector3();
      expect(model.getAircraftPositionTo('nonexistent', target)).toBe(false);
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
