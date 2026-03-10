/**
 * Contextual touch controls for mortar weapon system.
 * Shows DEPLOY when mortar is available but not deployed.
 * Shows FIRE, aim pad, and UNDEPLOY when mortar is deployed.
 * Positioned on the LEFT side of screen.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

import { BaseTouchButton } from './BaseTouchButton';
import styles from './TouchControls.module.css';

interface TouchMortarCallbacks {
  onDeploy: () => void;
  onUndeploy: () => void;
  onFire: () => void;
  onAdjustPitch: (delta: number) => void;
  onAdjustYaw: (delta: number) => void;
  onToggleMortarCamera: () => void;
}

export class TouchMortarButton extends BaseTouchButton {
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

  // Aim pad tracking (drag, not press - handled manually)
  private aimPointerId: number | null = null;
  private aimLastX = 0;
  private aimLastY = 0;
  private readonly AIM_SENSITIVITY = 0.3;

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
    this.bindPress(this.deployButton, {
      onDown: () => this.callbacks?.onDeploy(),
    });
    this.bindPress(this.fireButton, {
      onDown: () => this.callbacks?.onFire(),
    });
    this.bindPress(this.undeployButton, {
      onDown: () => this.callbacks?.onUndeploy(),
    });
    this.bindPress(this.cameraButton, {
      onDown: () => this.callbacks?.onToggleMortarCamera(),
    });

    // Aim pad uses drag (pointermove), not simple press
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
