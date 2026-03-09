/**
 * SettingsModal - Full-screen settings overlay.
 *
 * Form controls: volume, sensitivity, graphics quality, shadows, FPS.
 * Reads/writes SettingsManager. Conditionally shows touch sensitivity
 * on touch devices.
 *
 * Replaces: old SettingsModal (inline styles + embedded <style> tag)
 */

import { UIComponent } from '../engine/UIComponent';
import { FocusTrap } from '../engine/FocusTrap';
import {
  SettingsManager,
  GraphicsQuality,
  ControllerPreset,
  ControllerLookCurve,
  ControllerDpadMode,
} from '../../config/SettingsManager';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { haptics } from '../controls/HapticFeedback';
import styles from './SettingsModal.module.css';

export class SettingsModal extends UIComponent {
  private visible = this.signal(false);
  private focusTrap: FocusTrap | null = null;

  protected build(): void {
    this.root.className = styles.overlay;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Settings');

    const isTouch = isTouchDevice();

    const touchSensitivityRow = isTouch
      ? `
        <div class="${styles.field}">
          <label class="${styles.label}" for="setting-touchSensitivity">Touch Sensitivity <span data-ref="touchSensLabel">5</span></label>
          <input type="range" id="setting-touchSensitivity" min="1" max="10" value="5" data-setting="touchSensitivity" class="${styles.range}">
        </div>
      `
      : '';

    const touchControlsRows = isTouch
      ? `
        <div class="${styles.field}">
          <label class="${styles.label}" for="setting-adsBehavior">ADS Mode</label>
          <select id="setting-adsBehavior" data-setting="adsBehavior" class="${styles.select}">
            <option value="toggle">Toggle (tap on/off)</option>
            <option value="hold">Hold (press and hold)</option>
          </select>
        </div>
        <div class="${styles.field}">
          <label class="${styles.check}">
            <input type="checkbox" checked data-setting="hapticFeedback"> Haptic Feedback
          </label>
        </div>
      `
      : '';

    this.root.innerHTML = `
      <div class="${styles.card}">
        <h2 class="${styles.title}">SETTINGS</h2>

        <fieldset class="${styles.fieldset}">
          <legend class="${styles.legend}">Graphics</legend>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-graphicsQuality">Graphics Quality</label>
            <select id="setting-graphicsQuality" data-setting="graphicsQuality" class="${styles.select}">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
            <p class="${styles.hint}" data-ref="graphicsHint">Moderate pixel (3x), shadows on</p>
          </div>

          <div class="${styles.field}">
            <label class="${styles.check}">
              <input type="checkbox" checked data-setting="enableShadows"> Enable Shadows
            </label>
          </div>
        </fieldset>

        <fieldset class="${styles.fieldset}">
          <legend class="${styles.legend}">Audio</legend>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-masterVolume">Master Volume <span data-ref="volumeLabel">70</span>%</label>
            <input type="range" id="setting-masterVolume" min="0" max="100" value="70" data-setting="masterVolume" class="${styles.range}">
          </div>
        </fieldset>

        <fieldset class="${styles.fieldset}">
          <legend class="${styles.legend}">Mouse &amp; Touch</legend>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-mouseSensitivity">Mouse Sensitivity <span data-ref="sensLabel">5</span></label>
            <input type="range" id="setting-mouseSensitivity" min="1" max="10" value="5" data-setting="mouseSensitivity" class="${styles.range}">
          </div>

          ${touchSensitivityRow}
          ${touchControlsRows}
        </fieldset>

        <fieldset class="${styles.fieldset}">
          <legend class="${styles.legend}">Controller</legend>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-controllerPreset">Controller Preset</label>
            <select id="setting-controllerPreset" data-setting="controllerPreset" class="${styles.select}">
              <option value="default" selected>Default Shooter</option>
              <option value="southpaw">Southpaw (sticks swapped)</option>
            </select>
          </div>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-controllerDpadMode">D-Pad Mode</label>
            <select id="setting-controllerDpadMode" data-setting="controllerDpadMode" class="${styles.select}">
              <option value="weapons" selected>Weapon Slots</option>
              <option value="quickCommands">Squad Quick Commands</option>
            </select>
          </div>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-controllerLookCurve">Controller Look Curve</label>
            <select id="setting-controllerLookCurve" data-setting="controllerLookCurve" class="${styles.select}">
              <option value="precision" selected>Precision</option>
              <option value="linear">Linear</option>
            </select>
          </div>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-controllerMoveDeadZone">Move Dead Zone <span data-ref="moveDeadZoneLabel">15</span>%</label>
            <input type="range" id="setting-controllerMoveDeadZone" min="5" max="30" value="15" data-setting="controllerMoveDeadZone" class="${styles.range}">
          </div>

          <div class="${styles.field}">
            <label class="${styles.label}" for="setting-controllerLookDeadZone">Look Dead Zone <span data-ref="lookDeadZoneLabel">15</span>%</label>
            <input type="range" id="setting-controllerLookDeadZone" min="5" max="30" value="15" data-setting="controllerLookDeadZone" class="${styles.range}">
          </div>

          <div class="${styles.field}">
            <label class="${styles.check}">
              <input type="checkbox" data-setting="controllerInvertY"> Invert Controller Look Y
            </label>
          </div>
        </fieldset>

        <div class="${styles.field}">
          <label class="${styles.check}">
            <input type="checkbox" data-setting="showFPS"> Show FPS Counter
          </label>
        </div>

        <button class="${styles.closeBtn}" data-ref="close" type="button" aria-label="Close">CLOSE</button>
      </div>
    `;
  }

  protected onMount(): void {
    this.focusTrap = new FocusTrap(this.root);

    // Visibility toggle
    this.effect(() => {
      const vis = this.visible.value;
      this.toggleClass(styles.visible, vis);
      if (vis) {
        this.focusTrap?.activate();
      } else {
        this.focusTrap?.deactivate();
      }
    });

    // Close button
    const closeBtn = this.$('[data-ref="close"]');
    if (closeBtn) {
      this.listen(closeBtn, 'pointerdown', () => this.hide());
      this.listen(closeBtn, 'click', (e) => e.preventDefault());
    }

    // Escape key to close
    this.listen(this.root, 'keydown', (e) => {
      if (e.key === 'Escape' && this.visible.value) {
        this.hide();
      }
    });

    // Click backdrop to close
    this.listen(this.root, 'pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.listen(this.root, 'click', (e) => e.preventDefault());

    // Bind settings controls
    this.bindControls();
  }

  protected onUnmount(): void {
    this.focusTrap?.dispose();
    this.focusTrap = null;
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  // --- Settings binding ---

  private bindControls(): void {
    const settings = SettingsManager.getInstance();

    const volumeSlider = this.$('[data-setting="masterVolume"]') as HTMLInputElement | null;
    const sensSlider = this.$('[data-setting="mouseSensitivity"]') as HTMLInputElement | null;
    const touchSensSlider = this.$('[data-setting="touchSensitivity"]') as HTMLInputElement | null;
    const controllerMoveDeadZoneSlider = this.$('[data-setting="controllerMoveDeadZone"]') as HTMLInputElement | null;
    const controllerLookDeadZoneSlider = this.$('[data-setting="controllerLookDeadZone"]') as HTMLInputElement | null;
    const fpsCheck = this.$('[data-setting="showFPS"]') as HTMLInputElement | null;
    const shadowsCheck = this.$('[data-setting="enableShadows"]') as HTMLInputElement | null;
    const qualitySelect = this.$('[data-setting="graphicsQuality"]') as HTMLSelectElement | null;
    const controllerPresetSelect = this.$('[data-setting="controllerPreset"]') as HTMLSelectElement | null;
    const controllerLookCurveSelect = this.$('[data-setting="controllerLookCurve"]') as HTMLSelectElement | null;
    const controllerDpadModeSelect = this.$('[data-setting="controllerDpadMode"]') as HTMLSelectElement | null;
    const controllerInvertYCheck = this.$('[data-setting="controllerInvertY"]') as HTMLInputElement | null;

    const volumeLabel = this.$('[data-ref="volumeLabel"]');
    const sensLabel = this.$('[data-ref="sensLabel"]');
    const touchSensLabel = this.$('[data-ref="touchSensLabel"]');
    const moveDeadZoneLabel = this.$('[data-ref="moveDeadZoneLabel"]');
    const lookDeadZoneLabel = this.$('[data-ref="lookDeadZoneLabel"]');

    // Load current values
    const current = settings.getAll();

    if (volumeSlider) {
      volumeSlider.value = String(current.masterVolume);
      if (volumeLabel) volumeLabel.textContent = String(current.masterVolume);
      this.listen(volumeSlider, 'input', () => {
        const val = Number(volumeSlider.value);
        if (volumeLabel) volumeLabel.textContent = String(val);
        settings.set('masterVolume', val);
      });
    }

    if (sensSlider) {
      sensSlider.value = String(current.mouseSensitivity);
      if (sensLabel) sensLabel.textContent = String(current.mouseSensitivity);
      this.listen(sensSlider, 'input', () => {
        const val = Number(sensSlider.value);
        if (sensLabel) sensLabel.textContent = String(val);
        settings.set('mouseSensitivity', val);
      });
    }

    if (touchSensSlider) {
      touchSensSlider.value = String(current.touchSensitivity);
      if (touchSensLabel) touchSensLabel.textContent = String(current.touchSensitivity);
      this.listen(touchSensSlider, 'input', () => {
        const val = Number(touchSensSlider.value);
        if (touchSensLabel) touchSensLabel.textContent = String(val);
        settings.set('touchSensitivity', val);
      });
    }

    if (controllerMoveDeadZoneSlider) {
      controllerMoveDeadZoneSlider.value = String(current.controllerMoveDeadZone);
      if (moveDeadZoneLabel) moveDeadZoneLabel.textContent = String(current.controllerMoveDeadZone);
      this.listen(controllerMoveDeadZoneSlider, 'input', () => {
        const val = Number(controllerMoveDeadZoneSlider.value);
        if (moveDeadZoneLabel) moveDeadZoneLabel.textContent = String(val);
        settings.set('controllerMoveDeadZone', val);
      });
    }

    if (controllerLookDeadZoneSlider) {
      controllerLookDeadZoneSlider.value = String(current.controllerLookDeadZone);
      if (lookDeadZoneLabel) lookDeadZoneLabel.textContent = String(current.controllerLookDeadZone);
      this.listen(controllerLookDeadZoneSlider, 'input', () => {
        const val = Number(controllerLookDeadZoneSlider.value);
        if (lookDeadZoneLabel) lookDeadZoneLabel.textContent = String(val);
        settings.set('controllerLookDeadZone', val);
      });
    }

    if (fpsCheck) {
      fpsCheck.checked = current.showFPS;
      this.listen(fpsCheck, 'change', () => {
        settings.set('showFPS', fpsCheck.checked);
      });
    }

    if (shadowsCheck) {
      shadowsCheck.checked = current.enableShadows;
      this.listen(shadowsCheck, 'change', () => {
        settings.set('enableShadows', shadowsCheck.checked);
      });
    }

    const graphicsHint = this.$('[data-ref="graphicsHint"]');

    if (qualitySelect) {
      qualitySelect.value = current.graphicsQuality;
      if (graphicsHint) graphicsHint.textContent = graphicsHintText(current.graphicsQuality);
      this.listen(qualitySelect, 'change', () => {
        const val = qualitySelect.value as GraphicsQuality;
        settings.set('graphicsQuality', val);
        if (graphicsHint) graphicsHint.textContent = graphicsHintText(val);
      });
    }

    if (controllerPresetSelect) {
      controllerPresetSelect.value = current.controllerPreset;
      this.listen(controllerPresetSelect, 'change', () => {
        settings.set('controllerPreset', controllerPresetSelect.value as ControllerPreset);
      });
    }

    if (controllerLookCurveSelect) {
      controllerLookCurveSelect.value = current.controllerLookCurve;
      this.listen(controllerLookCurveSelect, 'change', () => {
        settings.set('controllerLookCurve', controllerLookCurveSelect.value as ControllerLookCurve);
      });
    }

    if (controllerDpadModeSelect) {
      controllerDpadModeSelect.value = current.controllerDpadMode;
      this.listen(controllerDpadModeSelect, 'change', () => {
        settings.set('controllerDpadMode', controllerDpadModeSelect.value as ControllerDpadMode);
      });
    }

    if (controllerInvertYCheck) {
      controllerInvertYCheck.checked = current.controllerInvertY;
      this.listen(controllerInvertYCheck, 'change', () => {
        settings.set('controllerInvertY', controllerInvertYCheck.checked);
      });
    }

    // ADS behavior (touch only - stored separately from SettingsManager)
    const adsBehaviorSelect = this.$('[data-setting="adsBehavior"]') as HTMLSelectElement | null;
    if (adsBehaviorSelect) {
      try {
        const stored = localStorage.getItem('terror_ads_mode');
        if (stored === 'hold' || stored === 'toggle') {
          adsBehaviorSelect.value = stored;
        }
      } catch { /* ignore */ }
      this.listen(adsBehaviorSelect, 'change', () => {
        try {
          localStorage.setItem('terror_ads_mode', adsBehaviorSelect.value);
        } catch { /* ignore */ }
        this.onADSBehaviorChange?.(adsBehaviorSelect.value as 'hold' | 'toggle');
      });
    }

    // Haptic feedback toggle (touch only)
    const hapticCheck = this.$('[data-setting="hapticFeedback"]') as HTMLInputElement | null;
    if (hapticCheck) {
      hapticCheck.checked = haptics.enabled;
      this.listen(hapticCheck, 'change', () => {
        haptics.setEnabled(hapticCheck.checked);
      });
    }
  }

  private onADSBehaviorChange?: (behavior: 'hold' | 'toggle') => void;

  /** Register a callback for ADS behavior changes. Used by TouchControls to propagate to TouchADSButton. */
  setOnADSBehaviorChange(callback: (behavior: 'hold' | 'toggle') => void): void {
    this.onADSBehaviorChange = callback;
  }
}

const GRAPHICS_HINTS: Record<string, string> = {
  low: 'Pixelated (4x), no shadows',
  medium: 'Moderate pixel (3x), shadows on',
  high: 'Sharp (1.5x), shadows on',
  ultra: 'Full resolution, shadows on',
};

function graphicsHintText(quality: string): string {
  return GRAPHICS_HINTS[quality] ?? '';
}
