/**
 * HowToPlayModal - Device-aware controls reference overlay.
 *
 * Shows KBM or touch controls based on device, with optional
 * gamepad section on desktop. Includes gameplay tips.
 *
 * Replaces: old HowToPlayModal (inline styles + embedded <style> tag)
 */

import { UIComponent } from '../engine/UIComponent';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './HowToPlayModal.module.css';

export class HowToPlayModal extends UIComponent {
  private visible = this.signal(false);

  protected build(): void {
    this.root.className = styles.overlay;

    const isTouch = isTouchDevice();

    const touchControls = `
      <li>Left Joystick -- Move</li>
      <li>Sprint Button -- Sprint</li>
      <li>Drag Screen -- Look around</li>
      <li>Fire Button -- Fire weapon</li>
      <li>Aim Button -- Aim down sights</li>
      <li>Jump Button -- Jump</li>
    `;

    const kbmControls = `
      <li>WASD -- Move</li>
      <li>SHIFT -- Sprint</li>
      <li>SPACE -- Jump</li>
      <li>Mouse -- Look around</li>
      <li>Left Click -- Fire</li>
      <li>Right Click -- Aim down sights</li>
      <li>R -- Reload</li>
      <li>G -- Grenade</li>
      <li>1-6 -- Switch weapon</li>
      <li>TAB -- Scoreboard</li>
      <li>ESC -- Release mouse</li>
    `;

    const gamepadControls = `
      <li>Left Stick -- Move</li>
      <li>Right Stick -- Look around</li>
      <li>RT / R2 -- Fire weapon</li>
      <li>LT / L2 -- Aim down sights</li>
      <li>A / Cross -- Jump</li>
      <li>B / Circle -- Reload</li>
      <li>X / Square -- Interact</li>
      <li>Y / Triangle -- Switch weapon</li>
      <li>LB / L1 -- Grenade</li>
      <li>RB / R1 -- Sprint (hold)</li>
      <li>D-Pad -- Weapon slots</li>
      <li>Start -- Menu</li>
      <li>Back -- Scoreboard</li>
    `;

    const primaryControls = isTouch ? touchControls : kbmControls;
    const secondarySection = isTouch
      ? ''
      : `
        <h3 class="${styles.heading}">GAMEPAD</h3>
        <ul class="${styles.list}">${gamepadControls}</ul>
      `;

    this.root.innerHTML = `
      <div class="${styles.card}">
        <h2 class="${styles.title}">HOW TO PLAY</h2>

        <h3 class="${styles.heading}">${isTouch ? 'TOUCH CONTROLS' : 'KEYBOARD & MOUSE'}</h3>
        <ul class="${styles.list}">${primaryControls}</ul>

        ${secondarySection}

        <h3 class="${styles.heading}">OBJECTIVE</h3>
        <p class="${styles.text}">Capture and hold zones to drain enemy tickets. The team that runs out of tickets first loses.</p>

        <h3 class="${styles.heading}">COMBAT</h3>
        <ul class="${styles.list}">
          <li>Headshots deal 70% more damage</li>
          <li>Use vegetation for cover</li>
          <li>Listen for enemy gunfire to locate threats</li>
          <li>Stay mobile to avoid being targeted</li>
        </ul>

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
  }

  // --- Public API ---

  show(): void {
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }
}
