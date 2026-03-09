/**
 * HowToPlayModal - Device-aware controls reference overlay.
 *
 * Shows KBM or touch controls based on device, with optional
 * gamepad section on desktop. Includes gameplay tips.
 *
 * Replaces: old HowToPlayModal (inline styles + embedded <style> tag)
 */

import { UIComponent } from '../engine/UIComponent';
import { FocusTrap } from '../engine/FocusTrap';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './HowToPlayModal.module.css';

export class HowToPlayModal extends UIComponent {
  private visible = this.signal(false);
  private focusTrap: FocusTrap | null = null;

  protected build(): void {
    this.root.className = styles.overlay;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'How To Play');

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
      <li>D-Pad -- Weapon slots (or squad quick commands from Settings)</li>
      <li>L3 -- Sprint toggle</li>
      <li>R3 -- Squad command wheel</li>
      <li>Start -- Menu</li>
      <li>Back -- Scoreboard</li>
    `;

    const heliDesktopControls = `
      <li>W/S -- Collective (altitude)</li>
      <li>A/D -- Yaw (rotation)</li>
      <li>Arrows -- Cyclic (pitch/roll)</li>
      <li>Shift -- Engine boost</li>
      <li>Space -- Auto-hover toggle</li>
      <li>E -- Enter/Exit</li>
      <li>G -- Deploy squad (low hover)</li>
      <li>RCtrl -- Camera mode</li>
    `;

    const heliMobileControls = `
      <li>Left Joystick -- Collective + Yaw</li>
      <li>Right Joystick -- Cyclic (pitch/roll)</li>
    `;

    const primaryControls = isTouch ? touchControls : kbmControls;
    const heliControls = isTouch ? heliMobileControls : heliDesktopControls;

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

        <h3 class="${styles.heading}">HELICOPTER CONTROLS</h3>
        <ul class="${styles.list}">${heliControls}</ul>

        <h3 class="${styles.heading}">OBJECTIVE</h3>
        <p class="${styles.text}">Capture and hold zones to drain enemy tickets. The team that runs out of tickets first loses.</p>

        <h3 class="${styles.heading}">COMBAT</h3>
        <ul class="${styles.list}">
          <li>Headshots deal 70% more damage</li>
          <li>Use vegetation for cover</li>
          <li>Listen for enemy gunfire to locate threats</li>
          <li>Stay mobile to avoid being targeted</li>
        </ul>

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
}
