/**
 * Contextual touch controls for mortar weapon system.
 * Shows DEPLOY when mortar is available but not deployed.
 * Shows FIRE, aim pad, and UNDEPLOY when mortar is deployed.
 * Positioned on the LEFT side of screen.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export interface TouchMortarCallbacks {
  onDeploy: () => void;
  onUndeploy: () => void;
  onFire: () => void;
  onAdjustPitch: (delta: number) => void;
  onAdjustYaw: (delta: number) => void;
  onToggleMortarCamera: () => void;
}

export class TouchMortarButton extends UIComponent {
  // Sub-elements
  private deployButton!: HTMLDivElement;
  private deployedContainer!: HTMLDivElement;
  private fireButton!: HTMLDivElement;
  private undeployButton!: HTMLDivElement;
  private cameraButton!: HTMLDivElement;
  private aimPad!: HTMLDivElement;

  private isVisible = false;
  private deployed = false;
  private callbacks?: TouchMortarCallbacks;

  // Aim pad tracking
  private aimPointerId: number | null = null;
  private aimLastX = 0;
  private aimLastY = 0;
  private readonly AIM_SENSITIVITY = 0.3;

  // Active pointer tracking per button
  private deployPointerId: number | null = null;
  private firePointerId: number | null = null;
  private undeployPointerId: number | null = null;
  private cameraPointerId: number | null = null;

  protected build(): void {
    this.root.className = styles.mortarContainer;
    this.root.id = 'touch-mortar-controls';

    // Deploy button (not-deployed state)
    this.deployButton = document.createElement('div');
    this.deployButton.className = styles.mortarDeployBtn;
    this.deployButton.id = 'mortar-deploy';
    this.deployButton.textContent = 'DEPLOY';
    this.root.appendChild(this.deployButton);

    // Deployed controls container
    this.deployedContainer = document.createElement('div');
    this.deployedContainer.className = styles.mortarDeployed;

    // Aim pad
    this.aimPad = document.createElement('div');
    this.aimPad.className = styles.mortarAimPad;
    this.aimPad.id = 'mortar-aim-pad';
    this.aimPad.textContent = 'AIM';
    this.deployedContainer.appendChild(this.aimPad);

    // Button row
    const buttonRow = document.createElement('div');
    buttonRow.className = styles.mortarBtnRow;

    this.fireButton = document.createElement('div');
    this.fireButton.className = styles.mortarFireBtn;
    this.fireButton.id = 'mortar-fire';
    this.fireButton.textContent = 'FIRE';

    this.undeployButton = document.createElement('div');
    this.undeployButton.className = styles.mortarPackBtn;
    this.undeployButton.id = 'mortar-undeploy';
    this.undeployButton.textContent = 'PACK';

    this.cameraButton = document.createElement('div');
    this.cameraButton.className = styles.mortarCamBtn;
    this.cameraButton.id = 'mortar-camera';
    this.cameraButton.textContent = 'CAM';

    buttonRow.appendChild(this.fireButton);
    buttonRow.appendChild(this.undeployButton);
    buttonRow.appendChild(this.cameraButton);
    this.deployedContainer.appendChild(buttonRow);
    this.root.appendChild(this.deployedContainer);
  }

  protected onMount(): void {
    // Deploy button
    this.bindPressButton(this.deployButton, 'deploy');

    // Fire button
    this.bindPressButton(this.fireButton, 'fire');

    // Undeploy button
    this.bindPressButton(this.undeployButton, 'undeploy');

    // Camera button
    this.bindPressButton(this.cameraButton, 'camera');

    // Aim pad
    this.listen(this.aimPad, 'pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.aimPointerId !== null) return;
      this.aimPointerId = e.pointerId;
      this.aimLastX = e.clientX;
      this.aimLastY = e.clientY;
      if (typeof this.aimPad.setPointerCapture === 'function') {
        this.aimPad.setPointerCapture(e.pointerId);
      }
      this.aimPad.classList.add(styles.pressed);
    }, { passive: false });

    this.listen(this.aimPad, 'pointermove', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.aimPointerId) return;
      const dx = e.clientX - this.aimLastX;
      const dy = e.clientY - this.aimLastY;
      this.aimLastX = e.clientX;
      this.aimLastY = e.clientY;
      if (Math.abs(dx) > 0) this.callbacks?.onAdjustYaw(dx * this.AIM_SENSITIVITY);
      if (Math.abs(dy) > 0) this.callbacks?.onAdjustPitch(-dy * this.AIM_SENSITIVITY);
    }, { passive: false });

    this.listen(this.aimPad, 'pointerup', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.aimPointerId) return;
      this.aimPointerId = null;
      this.aimPad.classList.remove(styles.pressed);
      if (typeof this.aimPad.releasePointerCapture === 'function' && this.aimPad.hasPointerCapture(e.pointerId)) {
        this.aimPad.releasePointerCapture(e.pointerId);
      }
    }, { passive: false });

    this.listen(this.aimPad, 'pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.aimPointerId) return;
      this.aimPointerId = null;
      this.aimPad.classList.remove(styles.pressed);
      if (typeof this.aimPad.releasePointerCapture === 'function' && this.aimPad.hasPointerCapture(e.pointerId)) {
        this.aimPad.releasePointerCapture(e.pointerId);
      }
    }, { passive: false });
  }

  private bindPressButton(btn: HTMLDivElement, action: string): void {
    this.listen(btn, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const pid = this.getPointerId(action);
      if (pid !== null) return;
      this.setPointerId(action, e.pointerId);
      if (typeof btn.setPointerCapture === 'function') btn.setPointerCapture(e.pointerId);
      btn.classList.add(styles.pressed);
      this.invokeCallback(action);
    }, { passive: false });

    this.listen(btn, 'pointerup', (e: PointerEvent) => {
      if (e.pointerId !== this.getPointerId(action)) return;
      e.preventDefault();
      e.stopPropagation();
      this.setPointerId(action, null);
      btn.classList.remove(styles.pressed);
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    }, { passive: false });

    this.listen(btn, 'pointercancel', (e: PointerEvent) => {
      if (e.pointerId !== this.getPointerId(action)) return;
      e.preventDefault();
      this.setPointerId(action, null);
      btn.classList.remove(styles.pressed);
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    }, { passive: false });
  }

  private getPointerId(action: string): number | null {
    switch (action) {
      case 'deploy': return this.deployPointerId;
      case 'fire': return this.firePointerId;
      case 'undeploy': return this.undeployPointerId;
      case 'camera': return this.cameraPointerId;
      default: return null;
    }
  }

  private setPointerId(action: string, id: number | null): void {
    switch (action) {
      case 'deploy': this.deployPointerId = id; break;
      case 'fire': this.firePointerId = id; break;
      case 'undeploy': this.undeployPointerId = id; break;
      case 'camera': this.cameraPointerId = id; break;
    }
  }

  private invokeCallback(action: string): void {
    switch (action) {
      case 'deploy': this.callbacks?.onDeploy(); break;
      case 'fire': this.callbacks?.onFire(); break;
      case 'undeploy': this.callbacks?.onUndeploy(); break;
      case 'camera': this.callbacks?.onToggleMortarCamera(); break;
    }
  }

  setCallbacks(callbacks: TouchMortarCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Switch between deploy button and deployed controls */
  setDeployed(deployed: boolean): void {
    this.deployed = deployed;
    if (deployed) {
      this.deployButton.style.display = 'none';
      this.deployedContainer.classList.add(styles.visible);
    } else {
      this.deployButton.style.display = 'flex';
      this.deployedContainer.classList.remove(styles.visible);
      this.aimPointerId = null;
    }
  }

  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.root.style.display = 'flex';
  }

  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
    this.aimPointerId = null;
  }

  show(): void {
    this.showButton();
  }

  hide(): void {
    this.hideButton();
  }
}
