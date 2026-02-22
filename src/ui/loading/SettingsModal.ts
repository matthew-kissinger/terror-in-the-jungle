/**
 * SettingsModal - extracted from LoadingPanels. Settings overlay
 * for volume, sensitivity, graphics quality, shadows.
 */

import { SettingsManager, GraphicsQuality } from '../../config/SettingsManager';
import { colors, zIndex, borderRadius, fontStack } from '../design/tokens';
import { isTouchDevice } from '../../utils/DeviceDetector';

export class SettingsModal {
  private panel: HTMLDivElement;
  private settingsCleanup?: () => void;

  private handleClose = () => this.hide();
  private handleBgClick = (e: PointerEvent) => {
    if (e.target === this.panel) this.hide();
  };

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'settings-modal';
    Object.assign(this.panel.style, {
      display: 'none',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: String(zIndex.modalOverlay),
      justifyContent: 'center',
      alignItems: 'center',
      touchAction: 'manipulation',
    } as Partial<CSSStyleDeclaration>);

    const isTouch = isTouchDevice();

    // Touch sensitivity row only shown on touch devices
    const touchSensitivityRow = isTouch
      ? `
        <div class="settings-field">
          <label class="settings-label">Touch Sensitivity <span data-touch-sensitivity-label>5</span></label>
          <input type="range" min="1" max="10" value="5" data-setting="touchSensitivity" class="settings-range">
        </div>
      `
      : '';

    this.panel.innerHTML = `
      <div class="settings-modal-inner" style="
        background: rgba(8, 16, 24, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid ${colors.glassBorderBright};
        border-radius: ${borderRadius.xl};
        padding: 1.5rem 2rem;
        max-width: min(460px, 90vw);
        width: 100%;
        box-sizing: border-box;
        color: ${colors.textPrimary};
        font-family: 'Rajdhani', ${fontStack.ui};
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      ">
        <h2 style="
          color: ${colors.textPrimary};
          margin: 0 0 1.25rem;
          font-weight: 600;
          font-size: 1.2rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0.9;
        ">SETTINGS</h2>

        <div class="settings-field">
          <label class="settings-label">Graphics Quality</label>
          <select data-setting="graphicsQuality" class="settings-select">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
        </div>

        <div class="settings-field">
          <label class="settings-label">Master Volume <span data-volume-label>70</span>%</label>
          <input type="range" min="0" max="100" value="70" data-setting="masterVolume" class="settings-range">
        </div>

        <div class="settings-field">
          <label class="settings-label">Mouse Sensitivity <span data-sensitivity-label>5</span></label>
          <input type="range" min="1" max="10" value="5" data-setting="mouseSensitivity" class="settings-range">
        </div>

        ${touchSensitivityRow}

        <div class="settings-field">
          <label class="settings-check">
            <input type="checkbox" data-setting="showFPS"> Show FPS Counter
          </label>
        </div>

        <div class="settings-field">
          <label class="settings-check">
            <input type="checkbox" checked data-setting="enableShadows"> Enable Shadows
          </label>
        </div>

        <button class="close-settings settings-close-btn" type="button">CLOSE</button>
      </div>

      <style>
        .settings-field {
          margin: 0.75rem 0;
        }
        .settings-label {
          display: block;
          margin-bottom: 0.35rem;
          color: ${colors.textSecondary};
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 500;
        }
        .settings-select {
          width: 100%;
          padding: 0.6rem;
          background: rgba(255, 255, 255, 0.04);
          color: ${colors.textPrimary};
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: ${borderRadius.md};
          font-family: inherit;
          font-size: 0.85rem;
        }
        .settings-range {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          height: 4px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 2px;
          outline: none;
        }
        .settings-range::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${colors.primary};
          cursor: pointer;
        }
        .settings-check {
          color: ${colors.textSecondary};
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
        }
        .settings-close-btn {
          margin-top: 1.25rem;
          width: 100%;
          padding: 0.65rem;
          min-height: 44px;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
          color: white;
          border: 1px solid ${colors.glassBorderBright};
          border-radius: ${borderRadius.pill};
          cursor: pointer;
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.2s;
        }
        .settings-close-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(90, 143, 181, 0.3);
        }
      </style>
    `;

    document.body.appendChild(this.panel);

    const closeBtn = this.panel.querySelector('.close-settings');
    closeBtn?.addEventListener('pointerdown', this.handleClose);
    closeBtn?.addEventListener('click', (e) => e.preventDefault());

    this.panel.addEventListener('pointerdown', this.handleBgClick);
    this.panel.addEventListener('click', (e) => e.preventDefault());

    this.bindControls();
  }

  private bindControls(): void {
    const settings = SettingsManager.getInstance();
    const panel = this.panel;

    const volumeSlider = panel.querySelector('[data-setting="masterVolume"]') as HTMLInputElement | null;
    const sensitivitySlider = panel.querySelector('[data-setting="mouseSensitivity"]') as HTMLInputElement | null;
    const touchSensitivitySlider = panel.querySelector('[data-setting="touchSensitivity"]') as HTMLInputElement | null;
    const fpsCheckbox = panel.querySelector('[data-setting="showFPS"]') as HTMLInputElement | null;
    const shadowsCheckbox = panel.querySelector('[data-setting="enableShadows"]') as HTMLInputElement | null;
    const qualitySelect = panel.querySelector('[data-setting="graphicsQuality"]') as HTMLSelectElement | null;
    const volumeLabel = panel.querySelector('[data-volume-label]') as HTMLSpanElement | null;
    const sensitivityLabel = panel.querySelector('[data-sensitivity-label]') as HTMLSpanElement | null;
    const touchSensitivityLabel = panel.querySelector('[data-touch-sensitivity-label]') as HTMLSpanElement | null;

    const current = settings.getAll();

    if (volumeSlider) {
      volumeSlider.value = String(current.masterVolume);
      if (volumeLabel) volumeLabel.textContent = String(current.masterVolume);
    }
    if (sensitivitySlider) {
      sensitivitySlider.value = String(current.mouseSensitivity);
      if (sensitivityLabel) sensitivityLabel.textContent = String(current.mouseSensitivity);
    }
    if (touchSensitivitySlider) {
      touchSensitivitySlider.value = String(current.touchSensitivity);
      if (touchSensitivityLabel) touchSensitivityLabel.textContent = String(current.touchSensitivity);
    }
    if (fpsCheckbox) fpsCheckbox.checked = current.showFPS;
    if (shadowsCheckbox) shadowsCheckbox.checked = current.enableShadows;
    if (qualitySelect) qualitySelect.value = current.graphicsQuality;

    const onVolumeChange = () => {
      if (!volumeSlider) return;
      const val = Number(volumeSlider.value);
      if (volumeLabel) volumeLabel.textContent = String(val);
      settings.set('masterVolume', val);
    };
    const onSensitivityChange = () => {
      if (!sensitivitySlider) return;
      const val = Number(sensitivitySlider.value);
      if (sensitivityLabel) sensitivityLabel.textContent = String(val);
      settings.set('mouseSensitivity', val);
    };
    const onTouchSensitivityChange = () => {
      if (!touchSensitivitySlider) return;
      const val = Number(touchSensitivitySlider.value);
      if (touchSensitivityLabel) touchSensitivityLabel.textContent = String(val);
      settings.set('touchSensitivity', val);
    };
    const onFPSChange = () => {
      if (!fpsCheckbox) return;
      settings.set('showFPS', fpsCheckbox.checked);
    };
    const onShadowsChange = () => {
      if (!shadowsCheckbox) return;
      settings.set('enableShadows', shadowsCheckbox.checked);
    };
    const onQualityChange = () => {
      if (!qualitySelect) return;
      settings.set('graphicsQuality', qualitySelect.value as GraphicsQuality);
    };

    volumeSlider?.addEventListener('input', onVolumeChange);
    sensitivitySlider?.addEventListener('input', onSensitivityChange);
    touchSensitivitySlider?.addEventListener('input', onTouchSensitivityChange);
    fpsCheckbox?.addEventListener('change', onFPSChange);
    shadowsCheckbox?.addEventListener('change', onShadowsChange);
    qualitySelect?.addEventListener('change', onQualityChange);

    this.settingsCleanup = () => {
      volumeSlider?.removeEventListener('input', onVolumeChange);
      sensitivitySlider?.removeEventListener('input', onSensitivityChange);
      touchSensitivitySlider?.removeEventListener('input', onTouchSensitivityChange);
      fpsCheckbox?.removeEventListener('change', onFPSChange);
      shadowsCheckbox?.removeEventListener('change', onShadowsChange);
      qualitySelect?.removeEventListener('change', onQualityChange);
    };
  }

  show(): void {
    this.panel.style.display = 'flex';
  }

  hide(): void {
    this.panel.style.display = 'none';
  }

  dispose(): void {
    this.settingsCleanup?.();
    const closeBtn = this.panel.querySelector('.close-settings');
    closeBtn?.removeEventListener('pointerdown', this.handleClose);
    this.panel.removeEventListener('pointerdown', this.handleBgClick);
    this.panel.remove();
  }
}
