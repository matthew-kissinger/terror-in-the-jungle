import { WeatherState } from '../../config/gameModes';
import { ISandboxRenderer } from '../../types/SystemInterfaces';

export interface WeatherParams {
  fogDensity: number;
  ambientIntensity: number;
  moonIntensity: number;
  jungleIntensity: number;
}

export interface AtmosphereBaseValues {
  fogDensity: number;
  ambientIntensity: number;
  moonIntensity: number;
  jungleIntensity: number;
  fogColor: number;
  ambientColor: number;
}

export function updateAtmosphere(
  sandboxRenderer: ISandboxRenderer | undefined,
  isUnderwater: boolean,
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number,
  baseValues: AtmosphereBaseValues,
  isFlashing: boolean
): void {
  if (!sandboxRenderer) return;

  if (isUnderwater) {
    if (sandboxRenderer.fog) {
      sandboxRenderer.fog.density = 0.04;
      sandboxRenderer.fog.color.setHex(0x003344);
    }
    if (sandboxRenderer.ambientLight) {
      sandboxRenderer.ambientLight.intensity = 0.5;
      sandboxRenderer.ambientLight.color.setHex(0x004455);
    }
    if (sandboxRenderer.moonLight) {
      sandboxRenderer.moonLight.intensity = 0.0;
    }
    if (sandboxRenderer.jungleLight) {
      sandboxRenderer.jungleLight.intensity = 0.1;
    }
    return;
  }

  const currentParams = getWeatherParams(currentState, baseValues);
  const targetParams = getWeatherParams(targetState, baseValues);
  const t = transitionProgress;

  const fogDensity = currentParams.fogDensity * (1 - t) + targetParams.fogDensity * t;
  const ambientInt = currentParams.ambientIntensity * (1 - t) + targetParams.ambientIntensity * t;
  const moonInt = currentParams.moonIntensity * (1 - t) + targetParams.moonIntensity * t;
  const jungleInt = currentParams.jungleIntensity * (1 - t) + targetParams.jungleIntensity * t;

  if (!isFlashing) {
    if (sandboxRenderer.fog) {
      sandboxRenderer.fog.density = fogDensity;
      sandboxRenderer.fog.color.setHex(baseValues.fogColor);
    }
    if (sandboxRenderer.ambientLight) {
      sandboxRenderer.ambientLight.intensity = ambientInt;
      sandboxRenderer.ambientLight.color.setHex(baseValues.ambientColor);
    }
    if (sandboxRenderer.moonLight) sandboxRenderer.moonLight.intensity = moonInt;
    if (sandboxRenderer.jungleLight) sandboxRenderer.jungleLight.intensity = jungleInt;
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
        jungleIntensity: baseValues.jungleIntensity
      };
    case WeatherState.LIGHT_RAIN:
      return {
        fogDensity: baseValues.fogDensity * 1.5,
        ambientIntensity: baseValues.ambientIntensity * 0.8,
        moonIntensity: baseValues.moonIntensity * 0.7,
        jungleIntensity: baseValues.jungleIntensity * 0.8
      };
    case WeatherState.HEAVY_RAIN:
      return {
        fogDensity: baseValues.fogDensity * 2.5,
        ambientIntensity: baseValues.ambientIntensity * 0.6,
        moonIntensity: baseValues.moonIntensity * 0.5,
        jungleIntensity: baseValues.jungleIntensity * 0.6
      };
    case WeatherState.STORM:
      return {
        fogDensity: baseValues.fogDensity * 3.5,
        ambientIntensity: baseValues.ambientIntensity * 0.4,
        moonIntensity: baseValues.moonIntensity * 0.3,
        jungleIntensity: baseValues.jungleIntensity * 0.4
      };
    default:
      return {
        fogDensity: baseValues.fogDensity,
        ambientIntensity: baseValues.ambientIntensity,
        moonIntensity: baseValues.moonIntensity,
        jungleIntensity: baseValues.jungleIntensity
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
