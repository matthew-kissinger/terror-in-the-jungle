import * as THREE from 'three';
import { GameMode } from '../../../config/gameModeTypes';

/**
 * Static per-scenario atmosphere presets. v1 never animates during a match;
 * the preset is chosen at mode boot and stays constant. Mirrors the
 * `MapSeedRegistry` pattern: one keyed lookup, human-readable defaults.
 *
 * Time-of-day choices are intentional:
 * - `ashau` (A Shau Valley): dawn patrol — iconic Vietnam War imagery and
 *   the low sun gives the Hosek-Wilkie-style gradient its strongest effect.
 * - `openfrontier`: noon. This is the perf-capture baseline scenario
 *   (`openfrontier:short`), so a neutral high sun keeps `combat120`-style
 *   deltas interpretable when perf regresses.
 * - `tdm`: dusk. Short-duration deathmatch reads well with warm low light.
 * - `zc` (zone control): golden hour — warm oblique light shows zone lines
 *   and structures with high contrast.
 * - `combat120` (ai_sandbox): noon. Perf-neutral; matches the historical
 *   `combat120-2026-04-19.png` baseline the perf harness captured under
 *   the legacy flat-blue skybox.
 */
export interface AtmospherePreset {
  /** Scenario-friendly label for logging / debug overlays. */
  label: string;
  /** Sun azimuth in radians around world Y (0 = +X, pi/2 = +Z, etc.). */
  sunAzimuthRad: number;
  /** Sun elevation in radians (0 = horizon, pi/2 = zenith). */
  sunElevationRad: number;
  /**
   * Atmospheric turbidity ~ [1, 10]. 2 is cloudless high-altitude, 4-6 is a
   * normal hazy day, 10 is thick haze. Drives Mie scattering depth.
   */
  turbidity: number;
  /** Rayleigh scattering scale [0.5, 4]. Higher = more saturated blue sky. */
  rayleigh: number;
  /** Ground albedo used for the bounce term in the lower hemisphere. */
  groundAlbedo: THREE.Color;
  /** Final linear-exposure multiplier applied to the dome output. */
  exposure: number;
}

/**
 * Build a unit vector from azimuth (around +Y) + elevation.
 * Returns a fresh vector so callers can store and mutate safely.
 */
export function sunDirectionFromPreset(preset: AtmospherePreset, out?: THREE.Vector3): THREE.Vector3 {
  const target = out ?? new THREE.Vector3();
  const cosE = Math.cos(preset.sunElevationRad);
  target.set(
    cosE * Math.cos(preset.sunAzimuthRad),
    Math.sin(preset.sunElevationRad),
    cosE * Math.sin(preset.sunAzimuthRad)
  );
  return target.normalize();
}

/** Scenario key used by `AtmosphereSystem.applyScenarioPreset`. */
export type ScenarioAtmosphereKey = 'ashau' | 'openfrontier' | 'tdm' | 'zc' | 'combat120';

/**
 * Constant preset data. Each field is read once per scenario boot; mutations
 * at runtime should go through `AtmosphereSystem`, not this table.
 */
export const SCENARIO_ATMOSPHERE_PRESETS: Record<ScenarioAtmosphereKey, AtmospherePreset> = {
  // Dawn: low sun in the east, warm amber haze, damp jungle albedo.
  ashau: {
    label: 'A Shau — dawn patrol',
    sunAzimuthRad: Math.PI * 0.15,          // ~27deg, east-southeast
    sunElevationRad: Math.PI * 0.055,       // ~10deg above horizon
    turbidity: 5.5,
    rayleigh: 2.4,
    groundAlbedo: new THREE.Color(0x2a3a22), // deep jungle green
    exposure: 0.18,
  },
  // Noon: sun near zenith, neutral turbidity, deep saturated zenith blue.
  openfrontier: {
    label: 'Open Frontier — noon',
    sunAzimuthRad: Math.PI * 0.25,          // 45deg for a little side-light
    sunElevationRad: Math.PI * 0.42,        // ~76deg, high sun
    turbidity: 3.5,
    rayleigh: 2.0,
    groundAlbedo: new THREE.Color(0x3b4c2e),
    exposure: 0.22,
  },
  // Dusk: sun very low in the west, heavy haze, strong orange extinction.
  tdm: {
    label: 'TDM — dusk',
    sunAzimuthRad: Math.PI * 1.1,           // ~198deg, west-southwest
    sunElevationRad: Math.PI * 0.035,       // ~6deg above horizon
    turbidity: 7.0,
    rayleigh: 2.6,
    groundAlbedo: new THREE.Color(0x2e2a22),
    exposure: 0.16,
  },
  // Golden hour: oblique warm light, moderate turbidity.
  zc: {
    label: 'Zone Control — golden hour',
    sunAzimuthRad: Math.PI * 0.78,          // ~140deg, south-southeast
    sunElevationRad: Math.PI * 0.12,        // ~22deg, low-oblique
    turbidity: 4.5,
    rayleigh: 2.2,
    groundAlbedo: new THREE.Color(0x34402a),
    exposure: 0.18,
  },
  // AI sandbox (perf harness): noon, perf-neutral; matches the legacy
  // combat120 framing so the baseline PNG diff stays meaningful.
  combat120: {
    label: 'combat120 — noon (perf)',
    sunAzimuthRad: Math.PI * 0.25,
    sunElevationRad: Math.PI * 0.42,
    turbidity: 3.0,
    rayleigh: 2.0,
    groundAlbedo: new THREE.Color(0x3b4c2e),
    exposure: 0.22,
  },
};

/**
 * Map a `GameMode` to its scenario preset key. Modes with no dedicated
 * preset fall back to `combat120` (noon, perf-neutral) so the dome still
 * renders something reasonable.
 */
export function scenarioKeyForMode(mode: GameMode): ScenarioAtmosphereKey {
  switch (mode) {
    case GameMode.A_SHAU_VALLEY: return 'ashau';
    case GameMode.OPEN_FRONTIER: return 'openfrontier';
    case GameMode.TEAM_DEATHMATCH: return 'tdm';
    case GameMode.ZONE_CONTROL: return 'zc';
    case GameMode.AI_SANDBOX: return 'combat120';
    default: return 'combat120';
  }
}
