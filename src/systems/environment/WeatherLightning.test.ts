import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateLightning, LightningState } from './WeatherLightning';
import { WeatherState } from '../../config/gameModeTypes';
import { IAudioManager, IGameRenderer } from '../../types/SystemInterfaces';

function createState(overrides: Partial<LightningState> = {}): LightningState {
  return {
    isFlashing: false,
    flashTimer: 0,
    thunderDelay: 0,
    ...overrides,
  };
}

function createRenderer(): IGameRenderer {
  return {
    moonLight: { intensity: 0.1 } as any,
    ambientLight: { intensity: 0.2 } as any,
    fog: { color: { setHex: vi.fn() } } as any,
    renderer: {} as any,
    scene: {} as any,
    camera: {} as any,
    getPerformanceStats: vi.fn(),
    showSpawnLoadingIndicator: vi.fn(),
    hideSpawnLoadingIndicator: vi.fn(),
    showRenderer: vi.fn(),
    showCrosshair: vi.fn(),
    hideCrosshair: vi.fn(),
    showCrosshairAgain: vi.fn(),
    setCrosshairMode: vi.fn(),
    setCrosshairSpread: vi.fn(),
    onWindowResize: vi.fn(),
  };
}

function createAudioManager(): IAudioManager {
  return {
    getListener: vi.fn() as any,
    play: vi.fn(),
    playDistantCombat: vi.fn(),
    playThunder: vi.fn(),
    playWeaponSwitchSound: vi.fn(),
  };
}

describe('WeatherLightning', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  describe('flash decay', () => {
    it('decrements flashTimer by deltaTime when flashing', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.15 });
      updateLightning(0.05, state, WeatherState.CLEAR, WeatherState.CLEAR, 0);
      expect(state.flashTimer).toBeCloseTo(0.10);
    });

    it('keeps isFlashing true while flashTimer is positive', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.15 });
      updateLightning(0.05, state, WeatherState.CLEAR, WeatherState.CLEAR, 0);
      expect(state.isFlashing).toBe(true);
    });
  });

  describe('flash end', () => {
    it('sets isFlashing to false when flashTimer reaches 0', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.10 });
      updateLightning(0.10, state, WeatherState.CLEAR, WeatherState.CLEAR, 0);
      expect(state.isFlashing).toBe(false);
    });

    it('sets isFlashing to false when flashTimer goes negative', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.05 });
      updateLightning(0.10, state, WeatherState.CLEAR, WeatherState.CLEAR, 0);
      expect(state.isFlashing).toBe(false);
    });
  });

  describe('onFlashEnd callback', () => {
    it('calls onFlashEnd when flash ends', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.05 });
      const onFlashEnd = vi.fn();
      updateLightning(0.10, state, WeatherState.CLEAR, WeatherState.CLEAR, 0, undefined, undefined, onFlashEnd);
      expect(onFlashEnd).toHaveBeenCalledOnce();
    });

    it('does not call onFlashEnd when flash is still active', () => {
      const state = createState({ isFlashing: true, flashTimer: 0.15 });
      const onFlashEnd = vi.fn();
      updateLightning(0.05, state, WeatherState.CLEAR, WeatherState.CLEAR, 0, undefined, undefined, onFlashEnd);
      expect(onFlashEnd).not.toHaveBeenCalled();
    });
  });

  describe('thunder delay', () => {
    it('decrements thunderDelay when not flashing and delay > 0', () => {
      const state = createState({ thunderDelay: 2.0 });
      updateLightning(0.5, state, WeatherState.CLEAR, WeatherState.CLEAR, 0);
      expect(state.thunderDelay).toBeCloseTo(1.5);
    });

    it('calls playThunder when thunderDelay crosses 0', () => {
      const audio = createAudioManager();
      const state = createState({ thunderDelay: 0.3 });
      updateLightning(0.5, state, WeatherState.CLEAR, WeatherState.CLEAR, 0, undefined, audio);
      expect(audio.playThunder).toHaveBeenCalledWith(0.4);
    });
  });

  describe('weather state filtering', () => {
    it('does not trigger lightning during CLEAR weather', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001); // below any threshold
      for (let i = 0; i < 100; i++) {
        updateLightning(0.016, state, WeatherState.CLEAR, WeatherState.CLEAR, 1.0);
      }
      expect(state.isFlashing).toBe(false);
    });

    it('does not trigger lightning during LIGHT_RAIN only', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001);
      for (let i = 0; i < 100; i++) {
        updateLightning(0.016, state, WeatherState.LIGHT_RAIN, WeatherState.LIGHT_RAIN, 1.0);
      }
      expect(state.isFlashing).toBe(false);
    });

    it('does not trigger lightning during HEAVY_RAIN only', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001);
      for (let i = 0; i < 100; i++) {
        updateLightning(0.016, state, WeatherState.HEAVY_RAIN, WeatherState.HEAVY_RAIN, 1.0);
      }
      expect(state.isFlashing).toBe(false);
    });
  });

  describe('storm triggers lightning', () => {
    it('triggers lightning when STORM is currentState and random is below threshold', () => {
      const state = createState();
      // Threshold is 0.005 * stormIntensity; with transitionProgress=1.0 -> 0.005
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.CLEAR, 1.0);
      expect(state.isFlashing).toBe(true);
    });

    it('triggers lightning when STORM is targetState and random is below threshold', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.CLEAR, WeatherState.STORM, 1.0);
      expect(state.isFlashing).toBe(true);
    });

    it('sets flashTimer to 0.15 when triggered', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0);
      expect(state.flashTimer).toBe(0.15);
    });
  });

  describe('thunder delay based on distance', () => {
    it('sets thunderDelay to distance / 343', () => {
      const state = createState();
      // Math.random is used for the trigger check (0.001) then for distance (0.5 -> 500 + 0.5*1000 = 1000)
      randomSpy.mockReturnValueOnce(0.001).mockReturnValueOnce(0.5);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0);
      expect(state.thunderDelay).toBeCloseTo(1000 / 343);
    });
  });

  describe('renderer effects', () => {
    it('sets moonLight intensity to 2.0 on lightning strike', () => {
      const state = createState();
      const renderer = createRenderer();
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0, renderer);
      expect(renderer.moonLight!.intensity).toBe(2.0);
    });

    it('sets ambientLight intensity to 1.0 on lightning strike', () => {
      const state = createState();
      const renderer = createRenderer();
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0, renderer);
      expect(renderer.ambientLight!.intensity).toBe(1.0);
    });

    it('sets fog color on lightning strike', () => {
      const state = createState();
      const renderer = createRenderer();
      randomSpy.mockReturnValue(0.001);
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0, renderer);
      expect(renderer.fog!.color.setHex).toHaveBeenCalledWith(0x4a6b8a);
    });
  });

  describe('graceful handling of missing dependencies', () => {
    it('does not crash without renderer', () => {
      const state = createState();
      randomSpy.mockReturnValue(0.001);
      expect(() => {
        updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0, undefined);
      }).not.toThrow();
      expect(state.isFlashing).toBe(true);
    });

    it('does not crash without audioManager when thunder fires', () => {
      const state = createState({ thunderDelay: 0.1 });
      expect(() => {
        updateLightning(0.5, state, WeatherState.CLEAR, WeatherState.CLEAR, 0, undefined, undefined);
      }).not.toThrow();
    });
  });

  describe('multiple update cycles', () => {
    it('completes full flash -> decay -> thunder cycle', () => {
      const audio = createAudioManager();
      const state = createState();
      randomSpy.mockReturnValueOnce(0.001).mockReturnValueOnce(0.0); // trigger: random < threshold, distance = 500+0*1000=500

      // Trigger lightning
      updateLightning(0.016, state, WeatherState.STORM, WeatherState.STORM, 1.0, undefined, audio);
      expect(state.isFlashing).toBe(true);
      expect(state.thunderDelay).toBeCloseTo(500 / 343);

      // Decay flash
      randomSpy.mockReturnValue(0.99); // prevent re-trigger
      updateLightning(0.10, state, WeatherState.STORM, WeatherState.STORM, 1.0, undefined, audio);
      expect(state.isFlashing).toBe(true);
      expect(state.flashTimer).toBeCloseTo(0.05);

      // Flash ends
      updateLightning(0.06, state, WeatherState.STORM, WeatherState.STORM, 1.0, undefined, audio);
      expect(state.isFlashing).toBe(false);

      // Thunder delay counting down
      const remainingDelay = state.thunderDelay;
      expect(remainingDelay).toBeGreaterThan(0);
      updateLightning(remainingDelay + 0.01, state, WeatherState.CLEAR, WeatherState.CLEAR, 0, undefined, audio);
      expect(audio.playThunder).toHaveBeenCalledWith(0.4);
    });
  });

  describe('transition progress affects probability', () => {
    it('higher transitionProgress increases trigger probability', () => {
      // At transitionProgress=0.5, threshold = 0.005 * 0.5 = 0.0025
      // random=0.002 is below 0.0025 -> triggers
      const state1 = createState();
      randomSpy.mockReturnValue(0.002);
      updateLightning(0.016, state1, WeatherState.STORM, WeatherState.STORM, 0.5);
      expect(state1.isFlashing).toBe(true);

      // At transitionProgress=0.1, threshold = 0.005 * 0.1 = 0.0005
      // random=0.002 is above 0.0005 -> does not trigger
      const state2 = createState();
      randomSpy.mockReturnValue(0.002);
      updateLightning(0.016, state2, WeatherState.STORM, WeatherState.STORM, 0.1);
      expect(state2.isFlashing).toBe(false);
    });
  });
});
