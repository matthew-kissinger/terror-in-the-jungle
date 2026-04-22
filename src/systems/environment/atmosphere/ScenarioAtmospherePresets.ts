import * as THREE from 'three';
import { GameMode } from '../../../config/gameModeTypes';

/**
 * Per-scenario atmosphere presets. Each preset chooses a starting sun
 * direction, turbidity, ground albedo, and exposure; an optional
 * `todCycle` lets the scenario animate the sun across a simulated day
 * (see `AtmosphereTodCycle` / `computeSunDirectionAtTime`). Mirrors the
 * `MapSeedRegistry` pattern: one keyed lookup, human-readable defaults.
 *
 * Time-of-day choices are intentional:
 * - `ashau` (A Shau Valley): dawn patrol — iconic Vietnam War imagery and
 *   the low sun gives the Hosek-Wilkie-style gradient its strongest effect.
 * - `openfrontier`: noon. Perf-capture baseline scenario; neutral high sun.
 * - `tdm`: dusk. Short-duration deathmatch reads well with warm low light.
 * - `zc` (zone control): golden hour — warm oblique light shows zones well.
 * - `combat120` (ai_sandbox): noon, STATIC (no todCycle). Perf-neutral;
 *   matches the historical `combat120-2026-04-19.png` baseline so perf
 *   deltas stay interpretable.
 */
/**
 * Optional time-of-day animation. When present, `AtmosphereSystem` advances
 * `simulationTimeSeconds` every frame and recomputes the sun direction from
 * the simulated hour. When absent, the sun stays fixed at
 * (`sunAzimuthRad`, `sunElevationRad`) — the v1 behaviour.
 *
 * Semantics:
 * - `dayLengthSeconds`: real-time seconds for a full 24h simulated cycle.
 * - `startHour`: initial simulated hour in [0, 24). 6 = sunrise, 12 = noon,
 *   18 = sunset, 0 = midnight.
 * - `minSunElevationDeg` / `maxSunElevationDeg`: clamp bounds on the
 *   elevation swing. Defaults (-10, +70) keep the sun slightly below the
 *   horizon at "night" (no NaN / black-sky fallout from the analytic
 *   Hosek/Preetham formulas) and near-zenith at "noon".
 * - The azimuth sweeps linearly with simulated time; east at sunrise,
 *   south at noon, west at sunset.
 */
export interface AtmosphereTodCycle {
  dayLengthSeconds: number;
  startHour: number;
  minSunElevationDeg?: number;
  maxSunElevationDeg?: number;
}

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
  /**
   * Base `THREE.FogExp2` density (per-meter) for this scenario. Applied by
   * `AtmosphereSystem.applyScenarioPreset` onto the bound renderer's fog.
   * Tuned alongside `turbidity` now that fog color tracks the sky horizon
   * (`atmosphere-fog-tinted-by-sky`, cycle-2026-04-20): the legacy flat
   * 0.004 density saturated distant terrain to near-white once the fog
   * tint switched from dim grey-green to bright horizon white. Lower
   * densities let distant terrain read through the haze without bringing
   * back the seam the horizon-match kills. Weather modulates this base up
   * (x1.5 rain, x3.5 storm) and `WaterSystem` overrides to 0.04 while
   * submerged.
   */
  fogDensity: number;
  /**
   * Optional day/night cycle. When undefined the sun is static at
   * (`sunAzimuthRad`, `sunElevationRad`). When set, `AtmosphereSystem`
   * animates the sun across simulated time. See `AtmosphereTodCycle`.
   */
  todCycle?: AtmosphereTodCycle;
  /**
   * Baseline cloud coverage for this scenario in [0, 1]. Omitted means
   * "no clouds at boot" — `AtmosphereSystem` treats it as 0 and the
   * cloud layer stays hidden. Weather state (STORM, HEAVY_RAIN, ...)
   * layers a higher coverage target on top of this baseline via
   * `setCloudCoverageIntent`; the effective coverage is `max(preset,
   * weather)` so a heavily-clouded preset never unfills under weather.
   */
  cloudCoverageDefault?: number;
  /**
   * Optional per-scenario cloud-feature scale in meters-per-first-octave.
   * Larger = larger, sparser puffs (fair-weather cumulus); smaller =
   * denser, tighter puffs (overcast). Omitted preserves the cloud-layer
   * default (~900m). Applied at preset swap via
   * `CloudLayer.setFeatureScaleMeters`.
   */
  cloudScaleMetersPerFeature?: number;
}

/** Clamp lower bound for sun elevation (radians). Matches ~-10deg by default. */
const DEFAULT_MIN_SUN_ELEVATION_DEG = -10;
/** Clamp upper bound for sun elevation (radians). ~+70deg keeps sun from true zenith. */
const DEFAULT_MAX_SUN_ELEVATION_DEG = 70;

/**
 * Compute the animated sun direction for a preset at a given simulated-time
 * offset (in seconds since match start). If the preset has no `todCycle`,
 * returns the static direction (equivalent to `sunDirectionFromPreset`).
 */
export function computeSunDirectionAtTime(
  preset: AtmospherePreset,
  simulationTimeSeconds: number,
  out?: THREE.Vector3
): THREE.Vector3 {
  const target = out ?? new THREE.Vector3();
  const cycle = preset.todCycle;
  if (!cycle) {
    return sunDirectionFromPreset(preset, target);
  }

  const minElevDeg = cycle.minSunElevationDeg ?? DEFAULT_MIN_SUN_ELEVATION_DEG;
  const maxElevDeg = cycle.maxSunElevationDeg ?? DEFAULT_MAX_SUN_ELEVATION_DEG;
  const minElevRad = (minElevDeg * Math.PI) / 180;
  const maxElevRad = (maxElevDeg * Math.PI) / 180;

  const dayLen = Math.max(1e-3, cycle.dayLengthSeconds);
  const phase = (((simulationTimeSeconds / dayLen) % 1) + 1) % 1;

  const elevSine = Math.sin(2 * Math.PI * phase);
  const baseElev = preset.sunElevationRad;
  const elevation = elevSine >= 0
    ? baseElev + elevSine * (maxElevRad - baseElev)
    : baseElev + elevSine * (baseElev - minElevRad);

  const azimuth = preset.sunAzimuthRad + 2 * Math.PI * phase;

  const cosE = Math.cos(elevation);
  target.set(
    cosE * Math.cos(azimuth),
    Math.sin(elevation),
    cosE * Math.sin(azimuth)
  );
  return target.normalize();
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
  // Lowest density of the set — A Shau DEM reaches >21km on the X axis with
  // a 4km draw distance; the mountains have to stay legible through the
  // horizon haze or the frame reads as flat grey (cycle-2026-04-20
  // after-round-3 baseline: ground saturates to uniform off-white).
  ashau: {
    label: 'A Shau — dawn patrol',
    sunAzimuthRad: Math.PI * 0.15,          // ~27deg, east-southeast
    sunElevationRad: Math.PI * 0.055,       // ~10deg above horizon
    turbidity: 5.5,
    rayleigh: 2.4,
    groundAlbedo: new THREE.Color(0x2a3a22), // deep jungle green
    exposure: 0.18,
    fogDensity: 0.00055,
    // Start at dawn (6am); 10-minute real-time cycle so playtests see the
    // sun sweep across the sky without waiting forever.
    todCycle: { dayLengthSeconds: 600, startHour: 6 },
    // Morning overcast over the jungle valley. Rebalanced up from 0.4 to
    // 0.55 so the 5-octave field reads as a stronger overcast; tighter
    // feature scale (700m) gives denser puffs over the narrow valley.
    cloudCoverageDefault: 0.55,
    cloudScaleMetersPerFeature: 700,
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
    fogDensity: 0.0022,
    todCycle: { dayLengthSeconds: 600, startHour: 12 },
    // Scattered fair-weather cumulus over the frontier. Rebalanced up from
    // 0.1 (which read as dead-empty under the 3-octave threshold) to 0.25;
    // larger feature scale (1400m) gives broader, sparser puffs fitting
    // the clear desert look.
    cloudCoverageDefault: 0.25,
    cloudScaleMetersPerFeature: 1400,
  },
  // Dusk: sun very low in the west, heavy haze, strong orange extinction.
  // Highest fog density — dusk reads as "can see nearby, distance fades"
  // rather than dawn's "mountains visible through thin mist".
  tdm: {
    label: 'TDM — dusk',
    sunAzimuthRad: Math.PI * 1.1,           // ~198deg, west-southwest
    sunElevationRad: Math.PI * 0.035,       // ~6deg above horizon
    turbidity: 7.0,
    rayleigh: 2.6,
    groundAlbedo: new THREE.Color(0x2e2a22),
    exposure: 0.16,
    fogDensity: 0.0028,
    todCycle: { dayLengthSeconds: 600, startHour: 18 },
    // Overcast dusk, broken layers. Rebalanced up slightly from 0.6 to 0.7
    // so the thicker field still reads as broken layers rather than a
    // uniform grey sheet once the 5-octave modulator gates large-scale gaps.
    cloudCoverageDefault: 0.7,
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
    fogDensity: 0.0024,
    todCycle: { dayLengthSeconds: 600, startHour: 16 },
    // Broken golden-hour clouds. Rebalanced up from 0.3 to 0.45 so the
    // warm oblique light has clouds to catch; the large-scale modulator
    // keeps the gaps open enough to read as "broken" rather than "overcast".
    cloudCoverageDefault: 0.45,
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
    fogDensity: 0.0022,
    // Light scattered — perf-lean baseline, but rebalanced from 0.2 to 0.30
    // so combat120 actually reads as "noon with some clouds" instead of
    // the effectively-empty sky the 3-octave threshold produced at 0.2.
    cloudCoverageDefault: 0.30,
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
