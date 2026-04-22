/**
 * @vitest-environment jsdom
 *
 * Behavior tests for LiveTuningPanel. Per docs/TESTING.md, these assert
 * observable runtime effects of knob changes — not Tweakpane DOM layout,
 * specific knob labels, or internal state-key strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveTuningPanel, type TuningState } from './LiveTuningPanel';
import { DebugHudRegistry } from './DebugHudRegistry';
import { FIXED_WING_CONFIGS } from '../../systems/vehicle/FixedWingConfigs';
import { SCENARIO_ATMOSPHERE_PRESETS } from '../../systems/environment/atmosphere/ScenarioAtmospherePresets';
import { WeatherState } from '../../config/gameModeTypes';
import { applyAirframeState } from './tuning/tuneAirframe';
import { applyCloudState } from './tuning/tuneCloud';
import { applyAtmosphereState, captureAtmosphereDefaults } from './tuning/tuneAtmosphere';
import { applyCombatState } from './tuning/tuneCombat';
import { applyWeatherState } from './tuning/tuneWeather';

function makeMockEngine() {
  const warSim = {
    enabled: true,
    setEnabled: vi.fn(function (this: any, v: boolean) { this.enabled = v; }),
    isEnabled() { return this.enabled; },
    getAliveCount: vi.fn(() => 0),
  };
  const atmosphere = {
    scenario: 'openfrontier',
    simSeconds: 0,
    coverage: 0,
    getCurrentScenario() { return this.scenario; },
    getCurrentPreset() { return SCENARIO_ATMOSPHERE_PRESETS[this.scenario as keyof typeof SCENARIO_ATMOSPHERE_PRESETS]; },
    setSimulationTimeSeconds: vi.fn(function (this: any, s: number) { this.simSeconds = s; }),
    setCoverage: vi.fn(function (this: any, v: number) { this.coverage = v; }),
  };
  const weather = { setWeatherState: vi.fn() };
  const fog = { density: 0.0022 };
  const engine = {
    systemManager: {
      get warSimulator() { return warSim; },
      get atmosphereSystem() { return atmosphere; },
      get weatherSystem() { return weather; },
    },
    renderer: { fog },
  };
  return { engine: engine as any, warSim, atmosphere, weather, fog };
}

let registry: DebugHudRegistry;
let originalA1Clamp: number | undefined;
let originalCoverage: number | undefined;
let originalFogDensity: number | undefined;

beforeEach(() => {
  registry = new DebugHudRegistry();
  originalA1Clamp = FIXED_WING_CONFIGS.A1_SKYRAIDER?.physics.altitudeHoldElevatorClamp;
  originalCoverage = SCENARIO_ATMOSPHERE_PRESETS.openfrontier.cloudCoverageDefault;
  originalFogDensity = SCENARIO_ATMOSPHERE_PRESETS.openfrontier.fogDensity;
  localStorage.clear();
});

afterEach(() => {
  registry.dispose();
  if (FIXED_WING_CONFIGS.A1_SKYRAIDER && originalA1Clamp !== undefined) {
    FIXED_WING_CONFIGS.A1_SKYRAIDER.physics.altitudeHoldElevatorClamp = originalA1Clamp;
  }
  SCENARIO_ATMOSPHERE_PRESETS.openfrontier.cloudCoverageDefault = originalCoverage;
  SCENARIO_ATMOSPHERE_PRESETS.openfrontier.fogDensity = originalFogDensity ?? 0.0022;
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('LiveTuningPanel tuning binders', () => {
  it('airframe state write updates the A-1 altitude-hold elevator clamp config', () => {
    applyAirframeState({ 'flight.a1.altitudeHoldElevatorClamp': 0.33 });
    expect(FIXED_WING_CONFIGS.A1_SKYRAIDER?.physics.altitudeHoldElevatorClamp).toBe(0.33);
  });

  it('cloud state write updates a scenario preset coverage and feature scale', () => {
    applyCloudState({
      'cloud.openfrontier.coverage': 0.7,
      'cloud.openfrontier.scaleMetersPerFeature': 1100,
    });
    expect(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.cloudCoverageDefault).toBe(0.7);
    expect(SCENARIO_ATMOSPHERE_PRESETS.openfrontier.cloudScaleMetersPerFeature).toBe(1100);
  });

  it('atmosphere fog-density multiplier scales the renderer fog density', () => {
    const { engine, fog } = makeMockEngine();
    fog.density = 0.0022;
    SCENARIO_ATMOSPHERE_PRESETS.openfrontier.fogDensity = 0.0022;
    const defaults = captureAtmosphereDefaults(engine);
    expect(defaults['atmosphere.fogDensityMultiplier']).toBe(1.0);

    applyAtmosphereState(engine, { 'atmosphere.fogDensityMultiplier': 2.0 });
    expect(fog.density).toBeCloseTo(0.0044, 6);

    applyAtmosphereState(engine, { 'atmosphere.fogDensityMultiplier': 0.5 });
    expect(fog.density).toBeCloseTo(0.0011, 6);
  });

  it('atmosphere TOD hour maps to simulation-time seconds via active preset dayLength', () => {
    const { engine, atmosphere } = makeMockEngine();
    const dayLen = SCENARIO_ATMOSPHERE_PRESETS.openfrontier.todCycle?.dayLengthSeconds ?? 600;

    applyAtmosphereState(engine, { 'atmosphere.todHour': 6, 'atmosphere.fogDensityMultiplier': 1 });
    expect(atmosphere.setSimulationTimeSeconds.mock.calls.at(-1)?.[0]).toBeCloseTo(dayLen * 0.25, 3);

    applyAtmosphereState(engine, { 'atmosphere.todHour': 18, 'atmosphere.fogDensityMultiplier': 1 });
    expect(atmosphere.setSimulationTimeSeconds.mock.calls.at(-1)?.[0]).toBeCloseTo(dayLen * 0.75, 3);
  });

  it('combat mute toggle disables the war simulator', () => {
    const { engine, warSim } = makeMockEngine();
    warSim.enabled = true;

    applyCombatState(engine, { 'combat.muted': true });
    expect(warSim.setEnabled).toHaveBeenCalledWith(false);
    expect(warSim.enabled).toBe(false);

    applyCombatState(engine, { 'combat.muted': false });
    expect(warSim.setEnabled).toHaveBeenLastCalledWith(true);
    expect(warSim.enabled).toBe(true);
  });

  it('weather state write calls setWeatherState with the selected state and instant flag', () => {
    const { engine, weather } = makeMockEngine();

    applyWeatherState(engine, { 'weather.state': WeatherState.HEAVY_RAIN });
    expect(weather.setWeatherState).toHaveBeenCalledWith(WeatherState.HEAVY_RAIN, true);

    // Redundant apply with same state must NOT re-trigger.
    applyWeatherState(engine, { 'weather.state': WeatherState.HEAVY_RAIN });
    expect(weather.setWeatherState).toHaveBeenCalledTimes(1);

    applyWeatherState(engine, { 'weather.state': WeatherState.STORM });
    expect(weather.setWeatherState).toHaveBeenLastCalledWith(WeatherState.STORM, true);
  });
});

describe('LiveTuningPanel lifecycle', () => {
  it('registers with the debug hud registry and starts hidden by default', async () => {
    const { engine } = makeMockEngine();
    const panel = new LiveTuningPanel(engine);
    await panel.register(registry);
    expect(registry.getPanel('live-tuning')).toBe(panel);
    expect(panel.isVisible()).toBe(false);
    panel.dispose();
  });

  it('backslash key reveals the panel (and master hud when hidden)', async () => {
    const { engine } = makeMockEngine();
    const panel = new LiveTuningPanel(engine);
    await panel.register(registry);
    registry.setMasterVisible(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\' }));
    expect(panel.isVisible()).toBe(true);
    expect(registry.isMasterVisible()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\' }));
    expect(panel.isVisible()).toBe(false);
    panel.dispose();
  });

  it('getState returns a JSON-serializable dictionary covering at least one domain', async () => {
    const { engine } = makeMockEngine();
    const panel = new LiveTuningPanel(engine);
    await panel.register(registry);
    const state = panel.getState();
    expect(() => JSON.stringify(state)).not.toThrow();
    expect(Object.keys(state).some((k) => k.startsWith('flight.'))).toBe(true);
    panel.dispose();
  });

  it('applyState pushes a patch to runtime targets', async () => {
    const { engine } = makeMockEngine();
    const panel = new LiveTuningPanel(engine);
    await panel.register(registry);
    panel.applyState({ 'flight.a1.altitudeHoldElevatorClamp': 0.28 });
    expect(FIXED_WING_CONFIGS.A1_SKYRAIDER?.physics.altitudeHoldElevatorClamp).toBe(0.28);
    panel.dispose();
  });

  it('hydrates from localStorage on construction', async () => {
    const { engine } = makeMockEngine();
    localStorage.setItem(
      'liveTuningPanel.state',
      JSON.stringify({ 'flight.a1.altitudeHoldElevatorClamp': 0.31 }),
    );
    const panel = new LiveTuningPanel(engine);
    await panel.register(registry);
    expect(panel.getState()['flight.a1.altitudeHoldElevatorClamp']).toBe(0.31);
    expect(FIXED_WING_CONFIGS.A1_SKYRAIDER?.physics.altitudeHoldElevatorClamp).toBe(0.31);
    panel.dispose();
  });

  it('persists state to localStorage after a knob change (debounced)', async () => {
    vi.useFakeTimers();
    try {
      const { engine } = makeMockEngine();
      const panel = new LiveTuningPanel(engine);
      await panel.register(registry);
      // schedulePersist is private; simulate by calling the public applyState
      // then advancing timers past the debounce window.
      (panel as unknown as { schedulePersist(): void }).schedulePersist?.();
      // applyState updates state but doesn't schedule; invoke via the
      // private method surface for this debounce-behavior check.
      (panel as any).state['flight.a1.altitudeHoldElevatorClamp'] = 0.37;
      (panel as any).schedulePersist();
      vi.advanceTimersByTime(600);
      const raw = localStorage.getItem('liveTuningPanel.state');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as TuningState;
      expect(parsed['flight.a1.altitudeHoldElevatorClamp']).toBe(0.37);
      panel.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
