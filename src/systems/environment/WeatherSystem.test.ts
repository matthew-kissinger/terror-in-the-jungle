// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { WeatherSystem } from './WeatherSystem';
import { WeatherState, WeatherConfig } from '../../config/gameModeTypes';
import type { ITerrainRuntime, IGameRenderer } from '../../types/SystemInterfaces';
import { updateLightning } from './WeatherLightning';
import { updateAtmosphere, getBlendedRainIntensity } from './WeatherAtmosphere';
import { Logger } from '../../utils/Logger';

vi.mock('../../utils/Logger');
vi.mock('./WeatherLightning');
vi.mock('./WeatherAtmosphere');
vi.mock('../../utils/DeviceDetector', () => ({
  estimateGPUTier: () => 'high',
  isMobileGPU: () => false
}));

type WeatherSystemAny = WeatherSystem & {
  currentState: WeatherState;
  targetState: WeatherState;
  transitionProgress: number;
  transitionDuration: number;
  transitionTimer: number;
  cycleTimer: number;
  rainCount: number;
  activeRainCount: number;
  rainVelocities: Float32Array;
  rainPositions: Float32Array;
  lastSurfaceWetness: number;
  rainInactive: boolean;
  rainMesh?: THREE.InstancedMesh;
  baseFogDensity: number;
  baseAmbientIntensity: number;
  baseMoonIntensity: number;
  baseHemisphereIntensity: number;
  baseFogColor: number;
  baseAmbientColor: number;
  updateTransition: (deltaTime: number) => void;
  updateCycle: (deltaTime: number) => void;
  triggerRandomWeatherChange: () => void;
  getRandomCycleDuration: () => number;
  updateRain: (deltaTime: number) => void;
};

function createMockRenderer(): IGameRenderer {
  return {
    fog: {
      color: new THREE.Color(0x123456),
      density: 0.02
    } as THREE.FogExp2,
    ambientLight: {
      intensity: 0.7,
      color: new THREE.Color(0xabcdef)
    } as THREE.AmbientLight,
    moonLight: {
      intensity: 1.1
    } as THREE.DirectionalLight,
    hemisphereLight: {
      intensity: 0.5
    } as THREE.HemisphereLight
  } as IGameRenderer;
}

function createSystem(): {
  system: WeatherSystem;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrainRuntime: ITerrainRuntime;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const terrainRuntime = {
    getPlayableWorldSize: vi.fn(() => 2000),
    setSurfaceWetness: vi.fn(),
  } as unknown as ITerrainRuntime;
  const system = new WeatherSystem(scene, camera, terrainRuntime);
  return { system, scene, camera, terrainRuntime };
}

function createSystemWithRainCount(rainCount: number): {
  system: WeatherSystem;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrainRuntime: ITerrainRuntime;
} {
  const { system, scene, camera, terrainRuntime } = createSystem();
  const systemAny = system as WeatherSystemAny;
  systemAny.rainCount = rainCount;
  systemAny.rainVelocities = new Float32Array(rainCount);
  systemAny.rainPositions = new Float32Array(rainCount * 3);
  return { system, scene, camera, terrainRuntime };
}

function createWeatherConfig(overrides: Partial<WeatherConfig> = {}): WeatherConfig {
  return {
    enabled: true,
    initialState: WeatherState.CLEAR,
    transitionChance: 0.5,
    cycleDuration: { min: 1, max: 2 },
    ...overrides
  };
}

describe('WeatherSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBlendedRainIntensity).mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with CLEAR current state', () => {
      const { system } = createSystem();
      expect((system as WeatherSystemAny).currentState).toBe(WeatherState.CLEAR);
    });

    it('initializes with CLEAR target state', () => {
      const { system } = createSystem();
      expect((system as WeatherSystemAny).targetState).toBe(WeatherState.CLEAR);
    });

    it('initializes with transition progress at 1.0', () => {
      const { system } = createSystem();
      expect((system as WeatherSystemAny).transitionProgress).toBe(1.0);
    });

    it('initializes with default transition duration', () => {
      const { system } = createSystem();
      expect((system as WeatherSystemAny).transitionDuration).toBe(10.0);
    });

    it('initializes rain buffers to full size', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.rainVelocities.length).toBe(8000);
      expect(systemAny.rainPositions.length).toBe(24000);
    });

    it('tags the rain mesh for render attribution', async () => {
      const { system } = createSystemWithRainCount(3);
      await system.init();
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.rainMesh?.name).toBe('WeatherRain');
      expect(systemAny.rainMesh?.userData.perfCategory).toBe('weather_rain');
    });
  });

  describe('setRenderer', () => {
    it('caches fog values from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseFogDensity).toBe(renderer.fog!.density);
      expect(systemAny.baseFogColor).toBe(renderer.fog!.color.getHex());
    });

    it('caches ambient light values from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseAmbientIntensity).toBe(renderer.ambientLight!.intensity);
      expect(systemAny.baseAmbientColor).toBe(renderer.ambientLight!.color.getHex());
    });

    it('caches moon and hemisphere intensities from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseMoonIntensity).toBe(renderer.moonLight!.intensity);
      expect(systemAny.baseHemisphereIntensity).toBe(renderer.hemisphereLight!.intensity);
    });

    it('handles missing renderer fields without throwing', () => {
      const { system } = createSystem();
      const renderer = { fog: undefined, ambientLight: undefined } as IGameRenderer;
      expect(() => system.setRenderer(renderer)).not.toThrow();
    });
  });

  describe('refreshAtmosphereBaseline', () => {
    it('re-reads fog density from the bound renderer after it changes', () => {
      // Supports `fog-density-rebalance`: after AtmosphereSystem applies a
      // scenario preset that stamps a new fog density onto the renderer,
      // WeatherSystem must pick up the new baseline so its multipliers
      // (x1.5 rain, x3.5 storm) scale from the correct density rather
      // than the stale default captured at composer wire-up.
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseFogDensity).toBe(0.02);

      renderer.fog!.density = 0.0022;
      system.refreshAtmosphereBaseline();

      expect(systemAny.baseFogDensity).toBe(0.0022);
    });

    it('is a no-op when no renderer has been wired', () => {
      const { system } = createSystem();
      expect(() => system.refreshAtmosphereBaseline()).not.toThrow();
    });
  });

  describe('setWeatherConfig', () => {
    it('sets initial weather state instantly', () => {
      const { system } = createSystem();
      const config = createWeatherConfig({ initialState: WeatherState.LIGHT_RAIN });
      system.setWeatherConfig(config);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.currentState).toBe(WeatherState.LIGHT_RAIN);
      expect(systemAny.targetState).toBe(WeatherState.LIGHT_RAIN);
      expect(systemAny.transitionProgress).toBe(1.0);
    });

    it('initializes cycle timer within range', () => {
      const { system } = createSystem();
      const config = createWeatherConfig({ cycleDuration: { min: 1, max: 2 } });
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      system.setWeatherConfig(config);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.cycleTimer).toBe(90);
    });
  });

  describe('setWeatherState', () => {
    it('sets target state and resets progress for non-instant transition', () => {
      const { system } = createSystem();
      system.setWeatherState(WeatherState.LIGHT_RAIN, false);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.targetState).toBe(WeatherState.LIGHT_RAIN);
      expect(systemAny.transitionProgress).toBe(0.0);
      expect(systemAny.currentState).toBe(WeatherState.CLEAR);
    });

    it('immediately applies state when instant', () => {
      const { system } = createSystem();
      system.setWeatherState(WeatherState.HEAVY_RAIN, true);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.currentState).toBe(WeatherState.HEAVY_RAIN);
      expect(systemAny.transitionProgress).toBe(1.0);
    });

    it('calls updateAtmosphere on instant transition', () => {
      const { system } = createSystem();
      system.setWeatherState(WeatherState.STORM, true);
      expect(updateAtmosphere).toHaveBeenCalled();
    });

    it('logs weather change', () => {
      const { system } = createSystem();
      system.setWeatherState(WeatherState.LIGHT_RAIN, false);
      expect(Logger.info).toHaveBeenCalled();
    });
  });

  describe('updateTransition', () => {
    it('increments transition progress based on delta time', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      systemAny.transitionProgress = 0;
      systemAny.transitionDuration = 10;
      systemAny.updateTransition(2);
      expect(systemAny.transitionProgress).toBeCloseTo(0.2, 5);
    });

    it('clamps transition progress at 1.0', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      systemAny.transitionProgress = 0.9;
      systemAny.transitionDuration = 10;
      systemAny.updateTransition(2);
      expect(systemAny.transitionProgress).toBe(1.0);
    });

    it('updates current state when transition completes', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.CLEAR;
      systemAny.targetState = WeatherState.HEAVY_RAIN;
      systemAny.transitionProgress = 0.95;
      systemAny.transitionDuration = 10;
      systemAny.updateTransition(1);
      expect(systemAny.currentState).toBe(WeatherState.HEAVY_RAIN);
      expect(systemAny.transitionProgress).toBe(1.0);
    });

    it('does nothing when already complete', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      systemAny.transitionProgress = 1.0;
      systemAny.updateTransition(5);
      expect(systemAny.transitionProgress).toBe(1.0);
    });
  });

  describe('updateCycle', () => {
    it('decrements cycle timer with delta time', () => {
      const { system } = createSystem();
      const systemAny = system as WeatherSystemAny;
      systemAny.cycleTimer = 5;
      systemAny.updateCycle(2);
      expect(systemAny.cycleTimer).toBe(3);
    });

    it('triggers weather change and resets cycle timer', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig({ cycleDuration: { min: 1, max: 2 } }));
      const systemAny = system as WeatherSystemAny;
      systemAny.cycleTimer = 0.1;
      const triggerSpy = vi.spyOn(systemAny, 'triggerRandomWeatherChange');
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      systemAny.updateCycle(0.2);
      expect(triggerSpy).toHaveBeenCalled();
      expect(systemAny.cycleTimer).toBe(90);
    });
  });

  describe('triggerRandomWeatherChange', () => {
    it('transitions CLEAR -> LIGHT_RAIN when roll is below chance', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig({ transitionChance: 0.8 }));
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.CLEAR;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.2);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.LIGHT_RAIN);
    });

    it('stays CLEAR when roll is above chance', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig({ transitionChance: 0.2 }));
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.CLEAR;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.8);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('transitions LIGHT_RAIN -> HEAVY_RAIN when roll < 0.4', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.LIGHT_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.2);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.HEAVY_RAIN);
    });

    it('transitions LIGHT_RAIN -> CLEAR when roll > 0.8', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.LIGHT_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.9);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.CLEAR);
    });

    it('stays LIGHT_RAIN when roll between 0.4 and 0.8', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.LIGHT_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.6);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('transitions HEAVY_RAIN -> STORM when roll < 0.3', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.HEAVY_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.1);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.STORM);
    });

    it('transitions HEAVY_RAIN -> LIGHT_RAIN when roll > 0.7', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.HEAVY_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.9);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.LIGHT_RAIN);
    });

    it('stays HEAVY_RAIN when roll between 0.3 and 0.7', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.HEAVY_RAIN;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('always transitions STORM -> HEAVY_RAIN', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig());
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.STORM;
      const setSpy = vi.spyOn(systemAny, 'setWeatherState');
      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      systemAny.triggerRandomWeatherChange();
      expect(setSpy).toHaveBeenCalledWith(WeatherState.HEAVY_RAIN);
    });
  });

  describe('updateRain', () => {
    it('hides rain when intensity is near zero', async () => {
      const { system, terrainRuntime } = createSystemWithRainCount(3);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0);
      const systemAny = system as WeatherSystemAny;
      systemAny.rainInactive = false;
      systemAny.updateRain(1);
      expect(systemAny.rainMesh?.visible).toBe(false);
      expect(terrainRuntime.setSurfaceWetness).toHaveBeenCalledWith(0);
    });

    it('skips redundant dry rain mesh and wetness writes while already inactive', async () => {
      const { system, terrainRuntime } = createSystemWithRainCount(3);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0);
      const systemAny = system as WeatherSystemAny;

      systemAny.updateRain(1);
      vi.clearAllMocks();
      systemAny.updateRain(1);

      expect(terrainRuntime.setSurfaceWetness).not.toHaveBeenCalled();
      expect(systemAny.rainMesh?.visible).toBe(false);
      expect(systemAny.rainMesh?.count).toBe(0);
      expect(systemAny.activeRainCount).toBe(0);
    });

    it('scales active rain count while preserving aggregate intensity', async () => {
      const { system, terrainRuntime } = createSystemWithRainCount(10);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0.3);
      const systemAny = system as WeatherSystemAny;
      systemAny.updateRain(1);
      expect(systemAny.rainMesh?.visible).toBe(true);
      expect(systemAny.rainMesh?.count).toBe(5);
      expect((systemAny.rainMesh?.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.36, 5);
      expect(systemAny.rainMesh!.count * (systemAny.rainMesh?.material as THREE.MeshBasicMaterial).opacity)
        .toBeCloseTo(10 * 0.6 * 0.3, 5);
      expect(terrainRuntime.setSurfaceWetness).toHaveBeenCalledWith(0.3);
    });

    it('applies storm wind strength', async () => {
      const { system } = createSystemWithRainCount(1);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(1);
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.STORM;
      systemAny.rainPositions[0] = 0;
      systemAny.rainPositions[1] = 10;
      systemAny.rainPositions[2] = 0;
      systemAny.rainVelocities[0] = 0;
      systemAny.activeRainCount = 1;
      systemAny.updateRain(1);
      expect(systemAny.rainPositions[0]).toBeCloseTo(5, 5);
    });

    it('writes updated rain translations into the instance matrix buffer', async () => {
      const { system } = createSystemWithRainCount(1);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(1);
      const systemAny = system as WeatherSystemAny;
      systemAny.currentState = WeatherState.STORM;
      systemAny.rainPositions[0] = 0;
      systemAny.rainPositions[1] = 10;
      systemAny.rainPositions[2] = 0;
      systemAny.rainVelocities[0] = 0;

      systemAny.updateRain(1);

      const matrixArray = systemAny.rainMesh!.instanceMatrix.array;
      expect(matrixArray[12]).toBeCloseTo(systemAny.rainPositions[0], 5);
      expect(matrixArray[13]).toBeCloseTo(systemAny.rainPositions[1], 5);
      expect(matrixArray[14]).toBeCloseTo(systemAny.rainPositions[2], 5);
    });

    it('wraps raindrops below the camera', async () => {
      const { system, camera } = createSystemWithRainCount(1);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(1);
      const systemAny = system as WeatherSystemAny;
      camera.position.set(0, 0, 0);
      systemAny.rainPositions[0] = 0;
      systemAny.rainPositions[1] = -20;
      systemAny.rainPositions[2] = 0;
      systemAny.rainVelocities[0] = 0;
      systemAny.activeRainCount = 1;
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      systemAny.updateRain(1);
      expect(systemAny.rainPositions[1]).toBe(20);
      expect(systemAny.rainPositions[0]).toBe(0);
      expect(systemAny.rainPositions[2]).toBe(0);
    });

    it('clamps raindrops that drift too far from camera', async () => {
      const { system, camera } = createSystemWithRainCount(1);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(1);
      const systemAny = system as WeatherSystemAny;
      camera.position.set(0, 0, 0);
      systemAny.rainPositions[0] = 30;
      systemAny.rainPositions[1] = 10;
      systemAny.rainPositions[2] = -30;
      systemAny.rainVelocities[0] = 0;
      systemAny.activeRainCount = 1;
      systemAny.updateRain(1);
      expect(systemAny.rainPositions[0]).toBeCloseTo(-19.9, 4);
      expect(systemAny.rainPositions[2]).toBeCloseTo(19.9, 4);
    });

    it('marks instance matrix for update when visible', async () => {
      const { system } = createSystemWithRainCount(1);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(1);
      const systemAny = system as WeatherSystemAny;
      const initialVersion = systemAny.rainMesh?.instanceMatrix.version ?? 0;
      systemAny.updateRain(1);
      expect(systemAny.rainMesh?.instanceMatrix.version).toBeGreaterThan(initialVersion);
    });

    it('limits instance matrix update ranges to the active rain prefix', async () => {
      const { system } = createSystemWithRainCount(10);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0.3);
      const systemAny = system as WeatherSystemAny;

      systemAny.updateRain(1);

      expect(systemAny.rainMesh?.count).toBe(5);
      expect(systemAny.rainMesh?.instanceMatrix.updateRanges.at(-1)).toEqual({
        start: 0,
        count: 5 * systemAny.rainMesh!.instanceMatrix.itemSize,
      });
    });

    it('replaces rain matrix update ranges instead of accumulating one per frame', async () => {
      const { system } = createSystemWithRainCount(10);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0.3);
      const systemAny = system as WeatherSystemAny;

      systemAny.updateRain(1);
      systemAny.updateRain(1);

      expect(systemAny.rainMesh?.instanceMatrix.updateRanges).toEqual([{
        start: 0,
        count: 5 * systemAny.rainMesh!.instanceMatrix.itemSize,
      }]);
    });
  });

  describe('update', () => {
    it('early-returns when weather is disabled', () => {
      const { system, terrainRuntime } = createSystem();
      system.setWeatherConfig(createWeatherConfig({ enabled: false }));
      vi.clearAllMocks();
      system.update(1);
      expect(updateLightning).not.toHaveBeenCalled();
      expect(updateAtmosphere).not.toHaveBeenCalled();
      expect(terrainRuntime.setSurfaceWetness).not.toHaveBeenCalled();
    });

    it('writes dry terrain wetness once when disabled before config initializes it', () => {
      const { system, terrainRuntime } = createSystem();
      system.update(1);
      system.update(1);
      expect(terrainRuntime.setSurfaceWetness).toHaveBeenCalledTimes(1);
      expect(terrainRuntime.setSurfaceWetness).toHaveBeenCalledWith(0);
    });

    it('updates lightning and atmosphere when enabled', async () => {
      const { system } = createSystemWithRainCount(2);
      await system.init();
      system.setWeatherConfig(createWeatherConfig({ enabled: true }));
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0.5);
      system.update(1);
      expect(updateLightning).toHaveBeenCalled();
      expect(updateAtmosphere).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('does nothing safely when rain mesh is not created', () => {
      const { system } = createSystem();
      expect(() => system.dispose()).not.toThrow();
    });

    it('removes rain mesh and disposes resources', async () => {
      const { system, scene } = createSystemWithRainCount(2);
      await system.init();
      const systemAny = system as WeatherSystemAny;
      const removeSpy = vi.spyOn(scene, 'remove');
      const geometryDisposeSpy = vi.spyOn(systemAny.rainMesh!.geometry, 'dispose');
      const materialDisposeSpy = vi.spyOn(systemAny.rainMesh!.material as THREE.Material, 'dispose');
      system.dispose();
      expect(removeSpy).toHaveBeenCalledWith(systemAny.rainMesh);
      expect(geometryDisposeSpy).toHaveBeenCalled();
      expect(materialDisposeSpy).toHaveBeenCalled();
    });
  });

  describe('resetState', () => {
    it('clears terrain wetness when weather resets', () => {
      const { system, terrainRuntime } = createSystem();
      system.resetState();
      expect(terrainRuntime.setSurfaceWetness).toHaveBeenCalledWith(0);
    });
  });
});
