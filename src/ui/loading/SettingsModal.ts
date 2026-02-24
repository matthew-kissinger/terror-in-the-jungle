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
import {
  SettingsManager,
  GraphicsQuality,
  ControllerPreset,
  ControllerLookCurve,
  ControllerDpadMode,
} from '../../config/SettingsManager';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './SettingsModal.module.css';

export class SettingsModal extends UIComponent {
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.overlay;

    const isTouch = isTouchDevice();

    const touchSensitivityRow = isTouch
      ? `
        <div class="${styles.field}">
          <label class="${styles.label}">Touch Sensitivity <span data-ref="touchSensLabel">5</span></label>
          <input type="range" min="1" max="10" value="5" data-setting="touchSensitivity" class="${styles.range}">
        </div>
      `
      : '';

    this.root.innerHTML = `
      <div class="${styles.card}">
        <h2 class="${styles.title}">SETTINGS</h2>

        <div class="${styles.field}">
          <label class="${styles.label}">Graphics Quality</label>
          <select data-setting="graphicsQuality" class="${styles.select}">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="ultra">Ultra</option>
          </select>
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">Master Volume <span data-ref="volumeLabel">70</span>%</label>
          <input type="range" min="0" max="100" value="70" data-setting="masterVolume" class="${styles.range}">
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">Mouse Sensitivity <span data-ref="sensLabel">5</span></label>
          <input type="range" min="1" max="10" value="5" data-setting="mouseSensitivity" class="${styles.range}">
        </div>

        ${touchSensitivityRow}

        <h3 class="${styles.sectionTitle}">Controller</h3>

        <div class="${styles.field}">
          <label class="${styles.label}">Controller Preset</label>
          <select data-setting="controllerPreset" class="${styles.select}">
            <option value="default" selected>Default Shooter</option>
            <option value="southpaw">Southpaw (sticks swapped)</option>
          </select>
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">D-Pad Mode</label>
          <select data-setting="controllerDpadMode" class="${styles.select}">
            <option value="weapons" selected>Weapon Slots</option>
            <option value="quickCommands">Squad Quick Commands</option>
          </select>
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">Controller Look Curve</label>
          <select data-setting="controllerLookCurve" class="${styles.select}">
            <option value="precision" selected>Precision</option>
            <option value="linear">Linear</option>
          </select>
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">Move Dead Zone <span data-ref="moveDeadZoneLabel">15</span>%</label>
          <input type="range" min="5" max="30" value="15" data-setting="controllerMoveDeadZone" class="${styles.range}">
        </div>

        <div class="${styles.field}">
          <label class="${styles.label}">Look Dead Zone <span data-ref="lookDeadZoneLabel">15</span>%</label>
          <input type="range" min="5" max="30" value="15" data-setting="controllerLookDeadZone" class="${styles.range}">
        </div>

        <div class="${styles.field}">
          <label class="${styles.check}">
            <input type="checkbox" data-setting="controllerInvertY"> Invert Controller Look Y
          </label>
        </div>

        <div class="${styles.field}">
          <label class="${styles.check}">
            <input type="checkbox" data-setting="showFPS"> Show FPS Counter
          </label>
        </div>

        <div class="${styles.field}">
          <label class="${styles.check}">
            <input type="checkbox" checked data-setting="enableShadows"> Enable Shadows
          </label>
        </div>

        <button class="${styles.closeBtn}" data-ref="close" type="button">CLOSE</button>
      </div>
    `;
  }

  protected onMount(): void {
    // Visibility toggle
    this.effect(() => {
      this.toggleClass(styles.visible, this.visible.value);
    });

    // Close button
    const closeBtn = this.$('[data-ref="close"]');
    if (closeBtn) {
      this.listen(closeBtn, 'pointerdown', () => this.hide());
      this.listen(closeBtn, 'click', (e) => e.preventDefault());
    }

    // Click backdrop to close
    this.listen(this.root, 'pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.listen(this.root, 'click', (e) => e.preventDefault());

    // Bind settings controls
    this.bindControls();
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

    if (qualitySelect) {
      qualitySelect.value = current.graphicsQuality;
      this.listen(qualitySelect, 'change', () => {
        settings.set('graphicsQuality', qualitySelect.value as GraphicsQuality);
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
  }
}
