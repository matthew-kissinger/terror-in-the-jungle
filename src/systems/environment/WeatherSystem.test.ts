import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { WeatherSystem } from './WeatherSystem';
import { WeatherState, WeatherConfig } from '../../config/gameModes';
import type { IChunkManager, ISandboxRenderer } from '../../types/SystemInterfaces';
import { updateLightning } from './WeatherLightning';
import { updateAtmosphere, getBlendedRainIntensity } from './WeatherAtmosphere';
import { Logger } from '../../utils/Logger';

vi.mock('../../utils/Logger');
vi.mock('./WeatherLightning');
vi.mock('./WeatherAtmosphere');

type WeatherSystemAny = WeatherSystem & {
  currentState: WeatherState;
  targetState: WeatherState;
  transitionProgress: number;
  transitionDuration: number;
  transitionTimer: number;
  cycleTimer: number;
  rainCount: number;
  rainVelocities: Float32Array;
  rainPositions: Float32Array;
  rainMesh?: THREE.InstancedMesh;
  baseFogDensity: number;
  baseAmbientIntensity: number;
  baseMoonIntensity: number;
  baseJungleIntensity: number;
  baseFogColor: number;
  baseAmbientColor: number;
  isUnderwater: boolean;
  updateTransition: (deltaTime: number) => void;
  updateCycle: (deltaTime: number) => void;
  triggerRandomWeatherChange: () => void;
  getRandomCycleDuration: () => number;
  updateRain: (deltaTime: number) => void;
};

function createMockRenderer(): ISandboxRenderer {
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
    jungleLight: {
      intensity: 0.5
    } as THREE.HemisphereLight
  } as ISandboxRenderer;
}

function createSystem(): {
  system: WeatherSystem;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const chunkManager = {} as IChunkManager;
  const system = new WeatherSystem(scene, camera, chunkManager);
  return { system, scene, camera };
}

function createSystemWithRainCount(rainCount: number): {
  system: WeatherSystem;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const { system, scene, camera } = createSystem();
  const systemAny = system as WeatherSystemAny;
  systemAny.rainCount = rainCount;
  systemAny.rainVelocities = new Float32Array(rainCount);
  systemAny.rainPositions = new Float32Array(rainCount * 3);
  return { system, scene, camera };
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
  });

  describe('setSandboxRenderer', () => {
    it('caches fog values from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setSandboxRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseFogDensity).toBe(renderer.fog!.density);
      expect(systemAny.baseFogColor).toBe(renderer.fog!.color.getHex());
    });

    it('caches ambient light values from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setSandboxRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseAmbientIntensity).toBe(renderer.ambientLight!.intensity);
      expect(systemAny.baseAmbientColor).toBe(renderer.ambientLight!.color.getHex());
    });

    it('caches moon and jungle intensities from renderer', () => {
      const { system } = createSystem();
      const renderer = createMockRenderer();
      system.setSandboxRenderer(renderer);
      const systemAny = system as WeatherSystemAny;
      expect(systemAny.baseMoonIntensity).toBe(renderer.moonLight!.intensity);
      expect(systemAny.baseJungleIntensity).toBe(renderer.jungleLight!.intensity);
    });

    it('handles missing renderer fields without throwing', () => {
      const { system } = createSystem();
      const renderer = { fog: undefined, ambientLight: undefined } as ISandboxRenderer;
      expect(() => system.setSandboxRenderer(renderer)).not.toThrow();
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

  describe('setUnderwater', () => {
    it('triggers atmosphere update when toggled', () => {
      const { system } = createSystem();
      system.setUnderwater(true);
      expect(updateAtmosphere).toHaveBeenCalledTimes(1);
      const call = vi.mocked(updateAtmosphere).mock.calls[0];
      expect(call[1]).toBe(true);
    });

    it('does not trigger atmosphere update when unchanged', () => {
      const { system } = createSystem();
      system.setUnderwater(false);
      expect(updateAtmosphere).not.toHaveBeenCalled();
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
      const { system } = createSystemWithRainCount(3);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0);
      const systemAny = system as WeatherSystemAny;
      systemAny.updateRain(1);
      expect(systemAny.rainMesh?.visible).toBe(false);
    });

    it('shows rain and sets opacity based on intensity', async () => {
      const { system } = createSystemWithRainCount(3);
      await system.init();
      vi.mocked(getBlendedRainIntensity).mockReturnValue(0.5);
      const systemAny = system as WeatherSystemAny;
      systemAny.updateRain(1);
      expect(systemAny.rainMesh?.visible).toBe(true);
      expect((systemAny.rainMesh?.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.3, 5);
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
      systemAny.updateRain(1);
      expect(systemAny.rainPositions[0]).toBeCloseTo(5, 5);
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
  });

  describe('update', () => {
    it('early-returns when weather is disabled', () => {
      const { system } = createSystem();
      system.setWeatherConfig(createWeatherConfig({ enabled: false }));
      vi.clearAllMocks();
      system.update(1);
      expect(updateLightning).not.toHaveBeenCalled();
      expect(updateAtmosphere).not.toHaveBeenCalled();
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
});
