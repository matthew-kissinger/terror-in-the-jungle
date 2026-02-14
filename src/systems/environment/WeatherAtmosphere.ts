import { WeatherState } from '../../config/gameModes';
import { IGameRenderer } from '../../types/SystemInterfaces';

export interface WeatherParams {
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

export function updateAtmosphere(
  renderer: IGameRenderer | undefined,
  isUnderwater: boolean,
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number,
  baseValues: AtmosphereBaseValues,
  isFlashing: boolean
): void {
  if (!renderer) return;

  if (isUnderwater) {
    if (renderer.fog) {
      renderer.fog.density = 0.04;
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

  if (!isFlashing) {
    if (renderer.fog) {
      renderer.fog.density = fogDensity;
      renderer.fog.color.setHex(baseValues.fogColor);
    }
    if (renderer.ambientLight) {
      renderer.ambientLight.intensity = ambientInt;
      renderer.ambientLight.color.setHex(baseValues.ambientColor);
    }
    if (renderer.moonLight) renderer.moonLight.intensity = moonInt;
    if (renderer.hemisphereLight) renderer.hemisphereLight.intensity = hemisphereInt;
  }
}

export function getWeatherParams(
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

export function getRainIntensity(state: WeatherState): number {
  switch (state) {
    case WeatherState.CLEAR: return 0.0;
    case WeatherState.LIGHT_RAIN: return 0.3;
    case WeatherState.HEAVY_RAIN: return 0.8;
    case WeatherState.STORM: return 1.0;
    default: return 0.0;
  }
}
