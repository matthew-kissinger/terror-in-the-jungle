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
 * Minimal structural surface for the atmosphere system's fog-tint plumbing.
 * Lets the weather code forward "storm darkens fog" / "underwater override"
 * intent without directly writing `scene.fog.color` — the atmosphere
 * system is the single authority that reconciles sky-driven tint, weather
 * darken, and underwater override each frame.
 */
export interface FogTintIntentReceiver {
  setFogDarkenFactor(factor: number): void;
  setFogUnderwaterOverride(active: boolean): void;
}

// Per-weather-state fog darkening. Mirrors the constants in
// `AtmosphereSystem.WEATHER_FOG_DARKEN` so the weather code stays a pure
// "intent forwarder" without importing the concrete system.
const FOG_DARKEN_CLEAR = 1.0;
const FOG_DARKEN_LIGHT_RAIN = 0.88;
const FOG_DARKEN_HEAVY_RAIN = 0.7;
const FOG_DARKEN_STORM = 0.45;

function fogDarkenForState(state: WeatherState): number {
  switch (state) {
    case WeatherState.LIGHT_RAIN: return FOG_DARKEN_LIGHT_RAIN;
    case WeatherState.HEAVY_RAIN: return FOG_DARKEN_HEAVY_RAIN;
    case WeatherState.STORM: return FOG_DARKEN_STORM;
    case WeatherState.CLEAR:
    default: return FOG_DARKEN_CLEAR;
  }
}

export function updateAtmosphere(
  renderer: IGameRenderer | undefined,
  isUnderwater: boolean,
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number,
  baseValues: AtmosphereBaseValues,
  isFlashing: boolean,
  fogIntent?: FogTintIntentReceiver
): void {
  if (!renderer) return;

  if (isUnderwater) {
    if (renderer.fog) {
      renderer.fog.density = 0.04;
    }
    // Forward the underwater override to the atmosphere system so it
    // pins `fog.color` to `0x003344` every frame. When no intent
    // receiver is wired (older call sites / unit tests), fall back to
    // the legacy direct write so behavior stays unchanged.
    if (fogIntent) {
      fogIntent.setFogUnderwaterOverride(true);
    } else if (renderer.fog) {
      renderer.fog.color.setHex(0x003344);
    }
    if (renderer.ambientLight) {
      renderer.ambientLight.intensity = 0.5;
      renderer.ambientLight.color.setHex(0x004455);
    }
    if (renderer.moonLight) {
      renderer.moonLight.intensity = 0.0;
    }
    if (renderer.hemisphereLight) {
      renderer.hemisphereLight.intensity = 0.1;
    }
    return;
  }

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
  if (fogIntent) {
    fogIntent.setFogUnderwaterOverride(false);
    fogIntent.setFogDarkenFactor(fogDarken);
  }

  if (!isFlashing) {
    if (renderer.fog) {
      renderer.fog.density = fogDensity;
      // Legacy fallback: when no atmosphere intent receiver is wired,
      // stamp the baseline fog color so pre-atmosphere behavior is
      // preserved byte-for-byte in isolated unit tests.
      if (!fogIntent) {
        renderer.fog.color.setHex(baseValues.fogColor);
      }
    }
    if (renderer.ambientLight) {
      renderer.ambientLight.intensity = ambientInt;
      renderer.ambientLight.color.setHex(baseValues.ambientColor);
    }
    if (renderer.moonLight) renderer.moonLight.intensity = moonInt;
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
