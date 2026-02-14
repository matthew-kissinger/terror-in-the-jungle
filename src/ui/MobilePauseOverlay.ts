/**
 * Mobile-only overlay: when the user switches apps or the tab is hidden,
 * we show "Tap to resume" and mute audio. Tapping resumes.
 * Desktop flow is unchanged (pointer lock "Click to play" remains).
 */

import { shouldUseTouchControls } from '../utils/DeviceDetector';
import { SettingsManager } from '../config/SettingsManager';
import type { GameEngine } from '../core/GameEngine';
import { colors, zIndex } from './design/tokens';

export class MobilePauseOverlay {
  private overlay: HTMLDivElement | null = null;
  private engine: GameEngine;
  private boundVisibilityChange: () => void;
  private boundResumeTap: (e: Event) => void;
  private needsResume = false;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.boundVisibilityChange = this.onVisibilityChange.bind(this);
    this.boundResumeTap = this.onResumeTap.bind(this);
  }

  setup(): void {
    if (!shouldUseTouchControls()) return;

    this.overlay = document.createElement('div');
    this.overlay.setAttribute('role', 'button');
    this.overlay.tabIndex = 0;
    this.overlay.innerHTML = `
      <div class="mobile-pause-message">Tap to resume</div>
    `;
    this.overlay.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.75);
      z-index: ${zIndex.modal};
      align-items: center;
      justify-content: center;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    `;
    const msg = this.overlay.querySelector('.mobile-pause-message') as HTMLElement;
    if (msg) {
      msg.style.cssText = `
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 1.5rem;
        color: ${colors.primary};
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 1rem 2rem;
        border: 2px solid rgba(127, 180, 217, 0.5);
        border-radius: 12px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
    }
    this.overlay.style.display = 'none';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.justifyContent = 'center';
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('pointerdown', this.boundResumeTap, { passive: false });
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  private onVisibilityChange(): void {
    if (!this.engine.gameStarted || !this.overlay) return;

    if (document.visibilityState === 'hidden') {
      this.pause();
    } else {
      if (this.needsResume) {
        this.showOverlay();
      }
    }
  }

  private pause(): void {
    this.needsResume = true;
    const audio = this.engine.systemManager?.audioManager;
    if (audio) {
      audio.setMasterVolume(0);
    }
  }

  private showOverlay(): void {
    if (this.overlay) {
      this.overlay.style.display = 'flex';
    }
  }

  private onResumeTap(e: Event): void {
    const pe = e as PointerEvent;
    if (pe.pointerType === 'mouse' && pe.button !== 0) return;
    e.preventDefault();
    if (!this.needsResume || !this.overlay) return;

    this.needsResume = false;
    this.overlay.style.display = 'none';

    const settings = SettingsManager.getInstance();
    const volume = settings.getMasterVolumeNormalized();
    const audio = this.engine.systemManager?.audioManager;
    if (audio) {
      audio.setMasterVolume(volume);
    }
  }

  dispose(): void {
    if (this.overlay) {
      this.overlay.removeEventListener('pointerdown', this.boundResumeTap);
      this.overlay.remove();
      this.overlay = null;
    }
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);
  }
}
