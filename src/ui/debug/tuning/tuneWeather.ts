import type { GameEngine } from '../../../core/GameEngine';
import { WeatherState } from '../../../config/gameModeTypes';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Weather folder: dropdown that writes `WeatherSystem.setWeatherState(s, true)`
 * for an instant override. Repeated applies debounce on an equality check
 * so unrelated knob edits don't keep restarting weather transitions.
 */

const WEATHER_STATE_KEY = 'weather.state';

const OPTIONS = {
  CLEAR: WeatherState.CLEAR,
  'LIGHT RAIN': WeatherState.LIGHT_RAIN,
  'HEAVY RAIN': WeatherState.HEAVY_RAIN,
  STORM: WeatherState.STORM,
};

interface WeatherFacade {
  setWeatherState(state: WeatherState, instant?: boolean): void;
  getCurrentState?(): WeatherState;
}

let lastAppliedState: string | null = null;

export function captureWeatherDefaults(engine: GameEngine): TuningState {
  lastAppliedState = null;
  return {
    [WEATHER_STATE_KEY]: tryGetWeather(engine)?.getCurrentState?.() ?? WeatherState.CLEAR,
  };
}

export function applyWeatherState(engine: GameEngine, state: TuningState): void {
  const weather = tryGetWeather(engine);
  const target = state[WEATHER_STATE_KEY];
  if (!weather || typeof target !== 'string' || target === lastAppliedState) return;
  if (!Object.values(WeatherState).includes(target as WeatherState)) return;
  weather.setWeatherState(target as WeatherState, /* instant */ true);
  lastAppliedState = target;
}

export function bindWeatherKnobs(
  pane: PaneLike,
  _engine: GameEngine,
  state: TuningState,
  onChange: () => void,
): void {
  const folder = pane.addFolder({ title: 'Weather', expanded: false });
  folder.addBinding(state, WEATHER_STATE_KEY, { label: 'state', options: OPTIONS }).on('change', onChange);
}

function tryGetWeather(engine: GameEngine): WeatherFacade | null {
  try { return engine.systemManager.weatherSystem as unknown as WeatherFacade; }
  catch { return null; }
}
