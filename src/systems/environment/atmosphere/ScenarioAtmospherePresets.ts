// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
   * sky-dome cloud pass stays clear. Weather state (STORM, HEAVY_RAIN, ...)
   * layers a higher coverage target on top of this baseline via
   * `setCloudCoverageIntent`; the effective coverage is `max(preset,
   * weather)` so a heavily-clouded preset never unfills under weather.
   */
  cloudCoverageDefault?: number;
  /**
   * Optional per-scenario cloud-feature scale in meters-per-first-octave.
   * Larger = larger, sparser puffs (fair-weather cumulus); smaller =
   * denser, tighter puffs (overcast). Omitted preserves the sky-dome cloud
   * default (~900m).
   */
  cloudScaleMetersPerFeature?: number;
}

/** Clamp lower bound for sun elevation (radians). Matches ~-10deg by default. */
const DEFAULT_MIN_SUN_ELEVATION_DEG = -10;
/** Clamp upper bound for sun elevation (radians). ~+70deg keeps sun from true zenith. */
const DEFAULT_MAX_SUN_ELEVATION_DEG = 70;
const HOURS_PER_DAY = 24;
const SUNRISE_HOUR = 6;

function normalizeUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function normalizeHour(hour: number): number {
  return ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

function clockElevationAtHour(hour: number, minElevRad: number, maxElevRad: number): number {
  const hourPhase = normalizeHour(hour) / HOURS_PER_DAY;
  const daylightSine = Math.sin(2 * Math.PI * (hourPhase - SUNRISE_HOUR / HOURS_PER_DAY));
  return daylightSine >= 0
    ? daylightSine * maxElevRad
    : -daylightSine * minElevRad;
}

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
  const elapsedDayFraction = normalizeUnit(simulationTimeSeconds / dayLen);
  const startHour = normalizeHour(cycle.startHour);
  const currentHour = startHour + elapsedDayFraction * HOURS_PER_DAY;
  const startClockElevation = clockElevationAtHour(startHour, minElevRad, maxElevRad);
  const currentClockElevation = clockElevationAtHour(currentHour, minElevRad, maxElevRad);
  const authoredMinElevation = Math.min(minElevRad, preset.sunElevationRad);
  const authoredMaxElevation = Math.max(maxElevRad, preset.sunElevationRad);
  const elevation = THREE.MathUtils.clamp(
    preset.sunElevationRad + currentClockElevation - startClockElevation,
    authoredMinElevation,
    authoredMaxElevation
  );

  const azimuth = preset.sunAzimuthRad + 2 * Math.PI * elapsedDayFraction;

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
    // AGX has a softer rolloff than ACES (especially in mids/highs).
    // cycle-sun-and-atmosphere-overhaul bumped this from 0.18 → 0.234
    // (+30%, mid of the 20-50% range called out in the spike) so the
    // dawn-patrol sky retains its perceived brightness post-tonemap-swap
    // without over-driving the warm haze band into clipped white. See
    // docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md Section 4.
    exposure: 0.234,
    fogDensity: 0.0003,
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
    // AGX vs ACES rolloff: openfrontier was already at the high end of
    // the pre-AGX range (0.22). cycle-sun-and-atmosphere-overhaul bumped
    // this 0.22 → 0.264 (+20%, low end of the 20-50% range) — noon with
    // a high sun and turbidity 3.5 is the easiest scene to over-expose
    // under AGX's softer shoulder, so a conservative bump preserves the
    // cobalt-saturated zenith target (HSL ~210°,70%,50%) without washing
    // the horizon ring to white. See SUN_AND_ATMOSPHERE_VISION Section 4.
    exposure: 0.264,
    fogDensity: 0.00055,
    todCycle: { dayLengthSeconds: 600, startHour: 12 },
    // Scattered fair-weather cumulus over the frontier. Coverage stays below
    // overcast but must be high enough to remain visible in ordinary ground
    // screenshots, not only in A Shau.
    cloudCoverageDefault: 0.62,
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
    // AGX vs ACES rolloff: tdm sat at the low end of the pre-AGX range
    // (0.16) because dusk's heavy turbidity already cranks the warm band
    // hot. cycle-sun-and-atmosphere-overhaul bumped this 0.16 → 0.208
    // (+30%, mid of 20-50%) so the blood-orange / vermillion horizon
    // target (HSL ~15-25°,75%,50%) reads cleanly under AGX without the
    // distant ridges silhouetting against an under-exposed muddy band.
    // See SUN_AND_ATMOSPHERE_VISION Section 4 dusk acceptance.
    exposure: 0.208,
    fogDensity: 0.0012,
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
    // AGX vs ACES rolloff: zone control's golden-hour preset matched
    // ashau's pre-AGX 0.18. cycle-sun-and-atmosphere-overhaul bumped
    // this 0.18 → 0.234 (+30%, mid of 20-50%) so the warm-cool
    // stratification target (orange/amber band 15-30° above horizon,
    // teal at zenith) retains the brightness needed for backlit rim
    // light to read on combatants/vegetation toward the low-oblique sun.
    // See SUN_AND_ATMOSPHERE_VISION Section 4 golden-hour acceptance.
    exposure: 0.234,
    fogDensity: 0.0009,
    todCycle: { dayLengthSeconds: 600, startHour: 16 },
    // Broken golden-hour clouds. Rebalanced up from 0.3 to 0.55 so the
    // warm oblique light has clouds to catch; the large-scale modulator
    // keeps the gaps open enough to read as "broken" rather than "overcast".
    cloudCoverageDefault: 0.55,
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
    // AGX vs ACES rolloff: combat120 mirrors openfrontier's noon framing
    // for perf-baseline interpretability. cycle-sun-and-atmosphere-overhaul
    // bumped this 0.22 → 0.264 (+20%, low end of 20-50%) in lock-step with
    // openfrontier so the combat120 baseline PNG diff stays meaningful
    // post-tonemap-swap (drifting this exposure independently would
    // invalidate the historical combat120-2026-04-19.png comparison).
    // See SUN_AND_ATMOSPHERE_VISION Section 4 noon acceptance.
    exposure: 0.264,
    fogDensity: 0.00055,
    // Light scattered — perf-lean baseline, but rebalanced from 0.2 to 0.48
    // so combat120 actually reads as "noon with some clouds" instead of
    // the effectively-empty sky the 3-octave threshold produced at 0.2.
    cloudCoverageDefault: 0.56,
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
