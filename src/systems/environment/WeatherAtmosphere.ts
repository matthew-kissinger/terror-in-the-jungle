// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { WeatherState } from '../../config/gameModeTypes';
import { IGameRenderer } from '../../types/SystemInterfaces';

interface WeatherParams {
  fogDensity: number;
  ambientIntensity: number;
  moonIntensity: number;
  hemisphereIntensity: number;
}

export interface AtmosphereBaseValues {
  fogDensity: number;
  ambientIntensity: number;
  moonIntensity: number;
  hemisphereIntensity: number;
  fogColor: number;
  ambientColor: number;
}

/**
 * Apply weather modulation to renderer lights/fog.
 *
 * Ordering (post-cycle-2026-04-20):
 *   atmosphere model → sun direction + sun color + hemisphere sky/ground
 *     colors are owned by AtmosphereSystem (applied each frame before this
 *     function runs); fog color is also sky-driven via `FogTintIntentReceiver`.
 *   weather multiplier (THIS FUNCTION) → scales light *intensities* and fog
 *     density; forwards a fog-darken multiplier to AtmosphereSystem; does
 *     NOT overwrite light colors.
 *   lightning flash → briefly boosts intensities and tints fog (handled in
 *     WeatherLightning.ts).
 *
 * Keeping color mutations out of the per-state path lets the atmosphere-driven
 * sun/hemisphere palette stay visible during clear/rain/storm weather while
 * lightning still does its visible override.
 */
export interface FogTintIntentReceiver {
  setFogDarkenFactor(factor: number): void;
  /**
   * Weather-driven cloud coverage intent. Mirrors fog darken: STORM /
   * HEAVY_RAIN raise coverage toward overcast, CLEAR releases back to the
   * scenario preset baseline. Optional so older callers / test stubs that
   * only satisfy the fog surface keep compiling.
   */
  setCloudCoverageIntent?(active: boolean, target: number): void;
}

// Per-weather-state fog darkening. Forwarded to AtmosphereSystem via the
// FogTintIntentReceiver so the weather code stays a pure "intent forwarder"
// without importing the concrete system.
const FOG_DARKEN_CLEAR = 1.0;
const FOG_DARKEN_LIGHT_RAIN = 0.88;
const FOG_DARKEN_HEAVY_RAIN = 0.7;
const FOG_DARKEN_STORM = 0.45;

// Per-weather-state cloud coverage targets. STORM fills the sky; CLEAR
// releases to the scenario preset default. Mirror of fog darken so the
// two skies-vs-storm signals evolve together.
const CLOUD_COVERAGE_CLEAR = 0.0;
const CLOUD_COVERAGE_LIGHT_RAIN = 0.6;
const CLOUD_COVERAGE_HEAVY_RAIN = 0.85;
const CLOUD_COVERAGE_STORM = 1.0;

function fogDarkenForState(state: WeatherState): number {
  switch (state) {
    case WeatherState.LIGHT_RAIN: return FOG_DARKEN_LIGHT_RAIN;
    case WeatherState.HEAVY_RAIN: return FOG_DARKEN_HEAVY_RAIN;
    case WeatherState.STORM: return FOG_DARKEN_STORM;
    case WeatherState.CLEAR:
    default: return FOG_DARKEN_CLEAR;
  }
}

function cloudCoverageForState(state: WeatherState): number {
  switch (state) {
    case WeatherState.LIGHT_RAIN: return CLOUD_COVERAGE_LIGHT_RAIN;
    case WeatherState.HEAVY_RAIN: return CLOUD_COVERAGE_HEAVY_RAIN;
    case WeatherState.STORM: return CLOUD_COVERAGE_STORM;
    case WeatherState.CLEAR:
    default: return CLOUD_COVERAGE_CLEAR;
  }
}

export function updateAtmosphere(
  renderer: IGameRenderer | undefined,
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number,
  baseValues: AtmosphereBaseValues,
  isFlashing: boolean,
  fogIntent?: FogTintIntentReceiver
): void {
  if (!renderer) return;

  const currentParams = getWeatherParams(currentState, baseValues);
  const targetParams = getWeatherParams(targetState, baseValues);
  const t = transitionProgress;

  const fogDensity = currentParams.fogDensity * (1 - t) + targetParams.fogDensity * t;
  const ambientInt = currentParams.ambientIntensity * (1 - t) + targetParams.ambientIntensity * t;
  const moonInt = currentParams.moonIntensity * (1 - t) + targetParams.moonIntensity * t;
  const hemisphereInt = currentParams.hemisphereIntensity * (1 - t) + targetParams.hemisphereIntensity * t;

  // Fog color is now sampled from the analytic sky horizon by
  // `AtmosphereSystem.applyFogColor()` every frame. Weather forwards
  // only the "darken" multiplier (storm => ~0.45) so the sky-driven
  // tint still reads as "same horizon, dimmer" rather than losing the
  // sun-color signature.
  const fogDarken = fogDarkenForState(currentState) * (1 - t) + fogDarkenForState(targetState) * t;
  const cloudCoverage =
    cloudCoverageForState(currentState) * (1 - t) + cloudCoverageForState(targetState) * t;
  if (fogIntent) {
    fogIntent.setFogDarkenFactor(fogDarken);
    // A non-CLEAR state (now or the target) means weather is actively
    // tinting the sky; keep the intent active until we're fully back in
    // CLEAR. Releasing early would snap coverage to the preset baseline
    // mid-transition.
    const active =
      currentState !== WeatherState.CLEAR || targetState !== WeatherState.CLEAR;
    fogIntent.setCloudCoverageIntent?.(active, cloudCoverage);
  }

  if (!isFlashing) {
    if (renderer.fog) {
      renderer.fog.density = fogDensity;
      // Legacy fallback: when no atmosphere intent receiver is wired,
      // stamp the baseline fog color so pre-atmosphere behavior (and
      // lightning-flash unwind) is preserved byte-for-byte in isolated
      // unit tests.
      if (!fogIntent) {
        renderer.fog.color.setHex(baseValues.fogColor);
      }
    }
    if (renderer.ambientLight) {
      renderer.ambientLight.intensity = ambientInt;
      // AtmosphereSystem reapplies the effective ambient color after weather
      // updates each frame; weather owns only the intensity multiplier here.
      renderer.ambientLight.color.setHex(baseValues.ambientColor);
    }
    // moonLight.intensity is weather-multiplied here; moonLight.color +
    // moonLight.position are driven by `AtmosphereSystem.applyToRenderer`
    // AFTER this function runs each frame (see SystemUpdater World group:
    // weatherSystem.update → atmosphereSystem.update). The atmosphere
    // colors are therefore final even when weather recomputes intensity.
    if (renderer.moonLight) renderer.moonLight.intensity = moonInt;
    // hemisphereLight.intensity is weather-multiplied here; hemisphere
    // sky + ground colors are driven by `AtmosphereSystem.applyToRenderer`
    // after this function runs.
    if (renderer.hemisphereLight) renderer.hemisphereLight.intensity = hemisphereInt;
  }
}

function getWeatherParams(
  state: WeatherState,
  baseValues: AtmosphereBaseValues
): WeatherParams {
  switch (state) {
    case WeatherState.CLEAR:
      return {
        fogDensity: baseValues.fogDensity,
        ambientIntensity: baseValues.ambientIntensity,
        moonIntensity: baseValues.moonIntensity,
        hemisphereIntensity: baseValues.hemisphereIntensity
      };
    case WeatherState.LIGHT_RAIN:
      return {
        fogDensity: baseValues.fogDensity * 1.5,
        ambientIntensity: baseValues.ambientIntensity * 0.8,
        moonIntensity: baseValues.moonIntensity * 0.7,
        hemisphereIntensity: baseValues.hemisphereIntensity * 0.8
      };
    case WeatherState.HEAVY_RAIN:
      return {
        fogDensity: baseValues.fogDensity * 2.5,
        ambientIntensity: baseValues.ambientIntensity * 0.6,
        moonIntensity: baseValues.moonIntensity * 0.5,
        hemisphereIntensity: baseValues.hemisphereIntensity * 0.6
      };
    case WeatherState.STORM:
      return {
        fogDensity: baseValues.fogDensity * 3.5,
        ambientIntensity: baseValues.ambientIntensity * 0.4,
        moonIntensity: baseValues.moonIntensity * 0.3,
        hemisphereIntensity: baseValues.hemisphereIntensity * 0.4
      };
    default:
      return {
        fogDensity: baseValues.fogDensity,
        ambientIntensity: baseValues.ambientIntensity,
        moonIntensity: baseValues.moonIntensity,
        hemisphereIntensity: baseValues.hemisphereIntensity
      };
  }
}

export function getBlendedRainIntensity(
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number
): number {
  const current = getRainIntensity(currentState);
  const target = getRainIntensity(targetState);
  return current * (1 - transitionProgress) + target * transitionProgress;
}

function getRainIntensity(state: WeatherState): number {
  switch (state) {
    case WeatherState.CLEAR: return 0.0;
    case WeatherState.LIGHT_RAIN: return 0.3;
    case WeatherState.HEAVY_RAIN: return 0.8;
    case WeatherState.STORM: return 1.0;
    default: return 0.0;
  }
}
