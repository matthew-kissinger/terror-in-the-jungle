import type { GameEngine } from '../../../core/GameEngine';
import { SCENARIO_ATMOSPHERE_PRESETS } from '../../../systems/environment/atmosphere/ScenarioAtmospherePresets';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Atmosphere folder: fog-density multiplier (relative to the shipping
 * preset value), TOD hour, and live-push of the current scenario's cloud
 * coverage into the live layer so tuneCloud edits are visible immediately.
 *
 * TOD hour maps to `AtmosphereSystem.setSimulationTimeSeconds` via the
 * active preset's `todCycle.dayLengthSeconds`. Scenarios without a cycle
 * (combat120) silently ignore the knob.
 */

const FOG_DENSITY_MUL_KEY = 'atmosphere.fogDensityMultiplier';
const TOD_HOUR_KEY = 'atmosphere.todHour';

// Baseline fog density per scenario, captured at panel construction so the
// multiplier stays idempotent across repeated apply() calls.
const fogBaseline = new Map<string, number>();

export function captureAtmosphereDefaults(_engine: GameEngine): TuningState {
  fogBaseline.clear();
  for (const [key, preset] of Object.entries(SCENARIO_ATMOSPHERE_PRESETS)) {
    fogBaseline.set(key, preset.fogDensity);
  }
  return { [FOG_DENSITY_MUL_KEY]: 1.0, [TOD_HOUR_KEY]: 12.0 };
}

export function applyAtmosphereState(engine: GameEngine, state: TuningState): void {
  const atmosphere = tryGetAtmosphere(engine);
  const renderer = engine.renderer;
  const mul = num(state[FOG_DENSITY_MUL_KEY], 1);
  const hour = num(state[TOD_HOUR_KEY], 12);

  const scenarioKey = atmosphere?.getCurrentScenario?.();
  if (renderer?.fog && scenarioKey) {
    const base = fogBaseline.get(scenarioKey) ?? renderer.fog.density;
    renderer.fog.density = base * mul;
  }

  const preset = atmosphere?.getCurrentPreset?.();
  if (atmosphere && preset?.todCycle?.dayLengthSeconds) {
    const frac = ((hour / 24) % 1 + 1) % 1;
    atmosphere.setSimulationTimeSeconds(frac * preset.todCycle.dayLengthSeconds);
  }

  // Live-push the active scenario's cloud coverage so tuneCloud edits on
  // the currently-playing scenario are visible right now.
  if (atmosphere && scenarioKey) {
    const cov = state[`cloud.${scenarioKey}.coverage`];
    if (typeof cov === 'number' && Number.isFinite(cov)) atmosphere.setCoverage(cov);
  }
}

export function bindAtmosphereKnobs(
  pane: PaneLike,
  _engine: GameEngine,
  state: TuningState,
  onChange: () => void,
): void {
  const folder = pane.addFolder({ title: 'Atmosphere', expanded: false });
  folder.addBinding(state, FOG_DENSITY_MUL_KEY, { label: 'fog density ×', min: 0, max: 3, step: 0.05 })
    .on('change', onChange);
  folder.addBinding(state, TOD_HOUR_KEY, { label: 'TOD hour', min: 0, max: 24, step: 0.25 })
    .on('change', onChange);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

interface AtmosphereFacade {
  getCurrentScenario(): string | undefined;
  getCurrentPreset(): { todCycle?: { dayLengthSeconds: number } } | undefined;
  setSimulationTimeSeconds(s: number): void;
  setCoverage(v: number): void;
}

/** Safe accessor: SystemManager getter throws when atmosphere isn't registered. */
function tryGetAtmosphere(engine: GameEngine): AtmosphereFacade | null {
  try { return engine.systemManager.atmosphereSystem as unknown as AtmosphereFacade; }
  catch { return null; }
}
