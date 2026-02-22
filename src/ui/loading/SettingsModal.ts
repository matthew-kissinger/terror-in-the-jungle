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
import { SettingsManager, GraphicsQuality } from '../../config/SettingsManager';
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
    const fpsCheck = this.$('[data-setting="showFPS"]') as HTMLInputElement | null;
    const shadowsCheck = this.$('[data-setting="enableShadows"]') as HTMLInputElement | null;
    const qualitySelect = this.$('[data-setting="graphicsQuality"]') as HTMLSelectElement | null;

    const volumeLabel = this.$('[data-ref="volumeLabel"]');
    const sensLabel = this.$('[data-ref="sensLabel"]');
    const touchSensLabel = this.$('[data-ref="touchSensLabel"]');

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
  }
}
