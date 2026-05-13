import {
  SCENARIO_ATMOSPHERE_PRESETS,
  type ScenarioAtmosphereKey,
} from '../../../systems/environment/atmosphere/ScenarioAtmospherePresets';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Per-scenario cloud coverage + feature-scale knobs. Mutates the preset
 * objects in place — AtmosphereSystem reads these on the next scenario
 * swap. For the currently-active scenario, `tuneAtmosphere.apply` pushes
 * coverage straight into the live sky-dome cloud pass so edits are visible now.
 *
 * Wind speed/direction are tracked in state for completeness but only
 * direction is actually exposed as a shader uniform today; speed is baked
 * at 10 m/s. We keep both in state so `getState()` round-trips cleanly.
 */

const SCENARIOS: ScenarioAtmosphereKey[] = ['openfrontier', 'combat120', 'ashau', 'zc', 'tdm'];

const coverageKey = (s: ScenarioAtmosphereKey): string => `cloud.${s}.coverage`;
const scaleKey = (s: ScenarioAtmosphereKey): string => `cloud.${s}.scaleMetersPerFeature`;
const CLOUD_WIND_SPEED_KEY = 'cloud.wind.speedMs';
const CLOUD_WIND_DIR_KEY = 'cloud.wind.directionDeg';

export function captureCloudDefaults(): TuningState {
  const out: TuningState = {};
  for (const key of SCENARIOS) {
    const p = SCENARIO_ATMOSPHERE_PRESETS[key];
    out[coverageKey(key)] = p?.cloudCoverageDefault ?? 0;
    out[scaleKey(key)] = p?.cloudScaleMetersPerFeature ?? 900;
  }
  out[CLOUD_WIND_SPEED_KEY] = 10;
  out[CLOUD_WIND_DIR_KEY] = 45;
  return out;
}

export function applyCloudState(state: TuningState): void {
  for (const key of SCENARIOS) {
    const p = SCENARIO_ATMOSPHERE_PRESETS[key];
    if (!p) continue;
    const cov = state[coverageKey(key)];
    if (typeof cov === 'number' && Number.isFinite(cov)) p.cloudCoverageDefault = cov;
    const scale = state[scaleKey(key)];
    if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) {
      p.cloudScaleMetersPerFeature = scale;
    }
  }
}

export function bindCloudKnobs(pane: PaneLike, state: TuningState, onChange: () => void): void {
  const folder = pane.addFolder({ title: 'Clouds', expanded: false });
  for (const key of SCENARIOS) {
    if (!SCENARIO_ATMOSPHERE_PRESETS[key]) continue;
    folder.addBinding(state, coverageKey(key), { label: `${key} coverage`, min: 0, max: 1, step: 0.01 })
      .on('change', onChange);
    folder.addBinding(state, scaleKey(key), { label: `${key} scale m/feat`, min: 400, max: 2000, step: 50 })
      .on('change', onChange);
  }
  folder.addBinding(state, CLOUD_WIND_SPEED_KEY, { label: 'wind speed m/s', min: 0, max: 30, step: 1 })
    .on('change', onChange);
  folder.addBinding(state, CLOUD_WIND_DIR_KEY, { label: 'wind dir deg', min: 0, max: 359, step: 1 })
    .on('change', onChange);
}
