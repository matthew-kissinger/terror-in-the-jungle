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
   * Optional day/night cycle. When undefined the sun is static at
   * (`sunAzimuthRad`, `sunElevationRad`). When set, `AtmosphereSystem`
   * animates the sun across simulated time. See `AtmosphereTodCycle`.
   */
  todCycle?: AtmosphereTodCycle;
}

/** Clamp lower bound for sun elevation (radians). Matches ~-10deg by default. */
const DEFAULT_MIN_SUN_ELEVATION_DEG = -10;
/** Clamp upper bound for sun elevation (radians). ~+70deg keeps sun from true zenith. */
const DEFAULT_MAX_SUN_ELEVATION_DEG = 70;

/**
 * Compute the animated sun direction for a preset at a given simulated-time
 * offset (in seconds since match start). If the preset has no `todCycle`,
 * returns the static direction (equivalent to `sunDirectionFromPreset`).
 *
 * Model: at `simulationTimeSeconds === 0` the sun sits exactly at the
 * preset's configured `(sunAzimuthRad, sunElevationRad)` — the same value a
 * fully-static preset would produce, so cycle-enabled presets stay
 * backwards-compatible with boot-time tests and screenshots.
 *
 * As time advances, the sun rotates around Y (azimuth sweep of one full
 * revolution per `dayLengthSeconds`) and its elevation is modulated by a
 * sine centered on the configured `startHour`. The elevation swing clamps
 * to `[minSunElevationDeg, maxSunElevationDeg]` so the analytic Preetham /
 * Hosek formulas never see a sun well below the horizon (where they go
 * unstable / NaN). The configured elevation is preserved at `startHour`
 * and the same elevation recurs 24h later.
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
  // Normalized cycle phase: 0 at simTime=0 (== preset's startHour), wrapping
  // at dayLengthSeconds. Keep phase in [0, 1).
  const phase = (((simulationTimeSeconds / dayLen) % 1) + 1) % 1;

  // Elevation sine: peaks 6 hours (1/4 cycle) after start, troughs 18 hours
  // (3/4 cycle) after start. sin(2*pi*phase) at phase=0 is 0, so the raw
  // sine-modulated elevation at simTime=0 is the preset's configured
  // elevation (no offset). Moving forward tilts it up toward max; moving
  // past the peak swings down toward min.
  const elevSine = Math.sin(2 * Math.PI * phase);
  const baseElev = preset.sunElevationRad;
  // Interpolate between baseElev and min/max following the sine. When
  // sine > 0 we head toward maxElev; when < 0 toward minElev. This
  // preserves baseElev at phase=0 (simTime=0) and at phase=0.5 (12h later).
  const elevation = elevSine >= 0
    ? baseElev + elevSine * (maxElevRad - baseElev)
    : baseElev + elevSine * (baseElev - minElevRad);

  // Azimuth sweep: one full revolution over the simulated day. At phase=0
  // the azimuth equals the preset's configured value.
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
  ashau: {
    label: 'A Shau — dawn patrol',
    sunAzimuthRad: Math.PI * 0.15,          // ~27deg, east-southeast
    sunElevationRad: Math.PI * 0.055,       // ~10deg above horizon
    turbidity: 5.5,
    rayleigh: 2.4,
    groundAlbedo: new THREE.Color(0x2a3a22), // deep jungle green
    exposure: 0.18,
    // Start at dawn (6am); 10-minute real-time cycle so playtests see the
    // sun sweep across the sky without waiting forever.
    todCycle: { dayLengthSeconds: 600, startHour: 6 },
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
    todCycle: { dayLengthSeconds: 600, startHour: 12 },
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
    todCycle: { dayLengthSeconds: 600, startHour: 18 },
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
    todCycle: { dayLengthSeconds: 600, startHour: 16 },
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
