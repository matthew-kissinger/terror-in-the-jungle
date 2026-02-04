import { WeatherState } from '../../config/gameModes';
import { IAudioManager, ISandboxRenderer } from '../../types/SystemInterfaces';

export interface LightningState {
  isFlashing: boolean;
  flashTimer: number;
  thunderDelay: number;
}

const FLASH_DURATION = 0.15;

export function updateLightning(
  deltaTime: number,
  state: LightningState,
  currentState: WeatherState,
  targetState: WeatherState,
  transitionProgress: number,
  sandboxRenderer?: ISandboxRenderer,
  audioManager?: IAudioManager,
  onFlashEnd?: () => void
): void {
  if (state.isFlashing) {
    state.flashTimer -= deltaTime;
    if (state.flashTimer <= 0) {
      state.isFlashing = false;
      if (onFlashEnd) {
        onFlashEnd();
      }
    }
  } else {
    if (state.thunderDelay > 0) {
      state.thunderDelay -= deltaTime;
      if (state.thunderDelay <= 0) {
        playThunderSound(audioManager);
      }
    }

    if (currentState === WeatherState.STORM || targetState === WeatherState.STORM) {
      const stormIntensity = transitionProgress;
      if (Math.random() < 0.005 * stormIntensity) {
        triggerLightning(state, sandboxRenderer);
      }
    }
  }
}

function triggerLightning(
  state: LightningState,
  sandboxRenderer?: ISandboxRenderer
): void {
  state.isFlashing = true;
  state.flashTimer = FLASH_DURATION;

  if (sandboxRenderer?.moonLight && sandboxRenderer?.ambientLight) {
    sandboxRenderer.moonLight.intensity = 2.0;
    sandboxRenderer.ambientLight.intensity = 1.0;
    if (sandboxRenderer.fog) {
      sandboxRenderer.fog.color.setHex(0x4a6b8a);
    }
  }

  const distance = 500 + Math.random() * 1000;
  state.thunderDelay = distance / 343;
}

function playThunderSound(audioManager?: IAudioManager): void {
  if (audioManager) {
    // Play thunder sound - assuming 'thunder' asset exists or fallback
    // Since we don't know if asset exists, we might need to check or add it
    // For now, logging
    // console.log('⚡ Thunderclap!');
    // this.audioManager.play('thunder');
  }
}
