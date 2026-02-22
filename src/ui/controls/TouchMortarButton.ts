/**
 * Contextual touch controls for mortar weapon system.
 * Shows DEPLOY when mortar is available but not deployed.
 * Shows FIRE, aim pad, and UNDEPLOY when mortar is deployed.
 * Positioned on the LEFT side of screen.
 * Uses pointer events with setPointerCapture for unified input handling.
 */

export interface TouchMortarCallbacks {
  onDeploy: () => void;
  onUndeploy: () => void;
  onFire: () => void;
  onAdjustPitch: (delta: number) => void;
  onAdjustYaw: (delta: number) => void;
  onToggleMortarCamera: () => void;
}

export class TouchMortarButton {
  private container: HTMLDivElement;

  // Deploy button (not-deployed state)
  private deployButton: HTMLDivElement;

  // Deployed controls
  private deployedContainer: HTMLDivElement;
  private fireButton: HTMLDivElement;
  private undeployButton: HTMLDivElement;
  private cameraButton: HTMLDivElement;
  private aimPad: HTMLDivElement;

  private isVisible = false;
  private deployed = false;
  private callbacks?: TouchMortarCallbacks;

  // Aim pad tracking
  private aimPointerId: number | null = null;
  private aimLastX = 0;
  private aimLastY = 0;
  private readonly AIM_SENSITIVITY = 0.3; // degrees per pixel

  // Bound handlers for cleanup
  private readonly onAimPointerDown: (e: PointerEvent) => void;
  private readonly onAimPointerMove: (e: PointerEvent) => void;
  private readonly onAimPointerUp: (e: PointerEvent) => void;

  // Button pointer handlers for cleanup
  private readonly onDeployPointerDown: (e: PointerEvent) => void;
  private readonly onDeployPointerUp: (e: PointerEvent) => void;
  private readonly onDeployPointerCancel: (e: PointerEvent) => void;
  private readonly onFirePointerDown: (e: PointerEvent) => void;
  private readonly onFirePointerUp: (e: PointerEvent) => void;
  private readonly onFirePointerCancel: (e: PointerEvent) => void;
  private readonly onUndeployPointerDown: (e: PointerEvent) => void;
  private readonly onUndeployPointerUp: (e: PointerEvent) => void;
  private readonly onUndeployPointerCancel: (e: PointerEvent) => void;
  private readonly onCameraPointerDown: (e: PointerEvent) => void;
  private readonly onCameraPointerUp: (e: PointerEvent) => void;
  private readonly onCameraPointerCancel: (e: PointerEvent) => void;

  // Active pointer tracking per button
  private deployPointerId: number | null = null;
  private firePointerId: number | null = null;
  private undeployPointerId: number | null = null;
  private cameraPointerId: number | null = null;

  constructor() {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'touch-mortar-controls';
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '20px',
      bottom: '140px',
      display: 'none',
      flexDirection: 'column',
      gap: '10px',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // -- Deploy button (shown when not deployed) --
    this.deployButton = this.createButton('DEPLOY', 'mortar-deploy', {
      width: 'var(--tc-fire-size, 70px)',
      height: 'var(--tc-fire-size, 70px)',
      background: 'rgba(255, 180, 60, 0.3)',
      border: '2px solid rgba(255, 200, 100, 0.5)',
      fontSize: 'var(--tc-font-size, 11px)',
    });

    this.onDeployPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.deployPointerId !== null) return;
      this.deployPointerId = e.pointerId;
      if (typeof this.deployButton.setPointerCapture === 'function') {
        this.deployButton.setPointerCapture(e.pointerId);
      }
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.6)';
      this.deployButton.style.transform = 'scale(0.9)';
      this.callbacks?.onDeploy();
    };
    this.onDeployPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.deployPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.deployPointerId = null;
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.deployButton.style.transform = 'scale(1)';
      if (typeof this.deployButton.releasePointerCapture === 'function' && this.deployButton.hasPointerCapture(e.pointerId)) {
        this.deployButton.releasePointerCapture(e.pointerId);
      }
    };
    this.onDeployPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== this.deployPointerId) return;
      e.preventDefault();
      this.deployPointerId = null;
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.deployButton.style.transform = 'scale(1)';
      if (typeof this.deployButton.releasePointerCapture === 'function' && this.deployButton.hasPointerCapture(e.pointerId)) {
        this.deployButton.releasePointerCapture(e.pointerId);
      }
    };

    this.deployButton.addEventListener('pointerdown', this.onDeployPointerDown, { passive: false });
    this.deployButton.addEventListener('pointerup', this.onDeployPointerUp, { passive: false });
    this.deployButton.addEventListener('pointercancel', this.onDeployPointerCancel, { passive: false });
    this.container.appendChild(this.deployButton);

    // -- Deployed controls container --
    this.deployedContainer = document.createElement('div');
    Object.assign(this.deployedContainer.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '10px',
      alignItems: 'center',
    } as Partial<CSSStyleDeclaration>);

    // Aim pad (drag zone for pitch/yaw) - already uses pointer events
    this.aimPad = document.createElement('div');
    this.aimPad.id = 'mortar-aim-pad';
    Object.assign(this.aimPad.style, {
      width: '120px',
      height: '120px',
      borderRadius: '12px',
      background: 'rgba(100, 150, 255, 0.2)',
      border: '2px solid rgba(130, 170, 255, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.6)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);
    this.aimPad.textContent = 'AIM';

    // Aim pad pointer events
    this.onAimPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.aimPointerId !== null) return;
      this.aimPointerId = e.pointerId;
      this.aimLastX = e.clientX;
      this.aimLastY = e.clientY;
      if (typeof this.aimPad.setPointerCapture === 'function') {
        this.aimPad.setPointerCapture(e.pointerId);
      }
      this.aimPad.style.background = 'rgba(100, 150, 255, 0.4)';
    };

    this.onAimPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.aimPointerId) return;
      const dx = e.clientX - this.aimLastX;
      const dy = e.clientY - this.aimLastY;
      this.aimLastX = e.clientX;
      this.aimLastY = e.clientY;

      // Horizontal drag = yaw, vertical drag = pitch
      if (Math.abs(dx) > 0) this.callbacks?.onAdjustYaw(dx * this.AIM_SENSITIVITY);
      if (Math.abs(dy) > 0) this.callbacks?.onAdjustPitch(-dy * this.AIM_SENSITIVITY);
    };

    this.onAimPointerUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.aimPointerId) return;
      this.aimPointerId = null;
      this.aimPad.style.background = 'rgba(100, 150, 255, 0.2)';
      if (typeof this.aimPad.releasePointerCapture === 'function' && this.aimPad.hasPointerCapture(e.pointerId)) {
        this.aimPad.releasePointerCapture(e.pointerId);
      }
    };

    this.aimPad.addEventListener('pointerdown', this.onAimPointerDown, { passive: false });
    this.aimPad.addEventListener('pointermove', this.onAimPointerMove, { passive: false });
    this.aimPad.addEventListener('pointerup', this.onAimPointerUp, { passive: false });
    this.aimPad.addEventListener('pointercancel', this.onAimPointerUp, { passive: false });
    this.deployedContainer.appendChild(this.aimPad);

    // Fire and undeploy row
    const buttonRow = document.createElement('div');
    Object.assign(buttonRow.style, {
      display: 'flex',
      flexDirection: 'row',
      gap: '10px',
    } as Partial<CSSStyleDeclaration>);

    // Fire button (prominent)
    this.fireButton = this.createButton('FIRE', 'mortar-fire', {
      width: 'var(--tc-fire-size, 70px)',
      height: 'var(--tc-fire-size, 70px)',
      background: 'rgba(255, 60, 60, 0.4)',
      border: '3px solid rgba(255, 100, 100, 0.6)',
      fontSize: 'var(--tc-font-size, 12px)',
    });

    this.onFirePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.firePointerId !== null) return;
      this.firePointerId = e.pointerId;
      if (typeof this.fireButton.setPointerCapture === 'function') {
        this.fireButton.setPointerCapture(e.pointerId);
      }
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.7)';
      this.fireButton.style.transform = 'scale(0.9)';
      this.callbacks?.onFire();
    };
    this.onFirePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.firePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.firePointerId = null;
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.4)';
      this.fireButton.style.transform = 'scale(1)';
      if (typeof this.fireButton.releasePointerCapture === 'function' && this.fireButton.hasPointerCapture(e.pointerId)) {
        this.fireButton.releasePointerCapture(e.pointerId);
      }
    };
    this.onFirePointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== this.firePointerId) return;
      e.preventDefault();
      this.firePointerId = null;
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.4)';
      this.fireButton.style.transform = 'scale(1)';
      if (typeof this.fireButton.releasePointerCapture === 'function' && this.fireButton.hasPointerCapture(e.pointerId)) {
        this.fireButton.releasePointerCapture(e.pointerId);
      }
    };

    this.fireButton.addEventListener('pointerdown', this.onFirePointerDown, { passive: false });
    this.fireButton.addEventListener('pointerup', this.onFirePointerUp, { passive: false });
    this.fireButton.addEventListener('pointercancel', this.onFirePointerCancel, { passive: false });

    // Undeploy button
    this.undeployButton = this.createButton('PACK', 'mortar-undeploy', {
      width: 'var(--tc-action-size, 52px)',
      height: 'var(--tc-action-size, 52px)',
      background: 'rgba(255, 180, 60, 0.3)',
      border: '2px solid rgba(255, 200, 100, 0.5)',
      fontSize: 'var(--tc-font-size, 10px)',
    });

    this.onUndeployPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.undeployPointerId !== null) return;
      this.undeployPointerId = e.pointerId;
      if (typeof this.undeployButton.setPointerCapture === 'function') {
        this.undeployButton.setPointerCapture(e.pointerId);
      }
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.6)';
      this.undeployButton.style.transform = 'scale(0.9)';
      this.callbacks?.onUndeploy();
    };
    this.onUndeployPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.undeployPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.undeployPointerId = null;
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.undeployButton.style.transform = 'scale(1)';
      if (typeof this.undeployButton.releasePointerCapture === 'function' && this.undeployButton.hasPointerCapture(e.pointerId)) {
        this.undeployButton.releasePointerCapture(e.pointerId);
      }
    };
    this.onUndeployPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== this.undeployPointerId) return;
      e.preventDefault();
      this.undeployPointerId = null;
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.undeployButton.style.transform = 'scale(1)';
      if (typeof this.undeployButton.releasePointerCapture === 'function' && this.undeployButton.hasPointerCapture(e.pointerId)) {
        this.undeployButton.releasePointerCapture(e.pointerId);
      }
    };

    this.undeployButton.addEventListener('pointerdown', this.onUndeployPointerDown, { passive: false });
    this.undeployButton.addEventListener('pointerup', this.onUndeployPointerUp, { passive: false });
    this.undeployButton.addEventListener('pointercancel', this.onUndeployPointerCancel, { passive: false });

    // Camera toggle button
    this.cameraButton = this.createButton('CAM', 'mortar-camera', {
      width: 'var(--tc-action-size, 50px)',
      height: 'var(--tc-action-size, 50px)',
      background: 'rgba(60, 150, 255, 0.3)',
      border: '2px solid rgba(100, 170, 255, 0.5)',
      fontSize: 'var(--tc-font-size, 10px)',
    });

    this.onCameraPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.cameraPointerId !== null) return;
      this.cameraPointerId = e.pointerId;
      if (typeof this.cameraButton.setPointerCapture === 'function') {
        this.cameraButton.setPointerCapture(e.pointerId);
      }
      this.cameraButton.style.background = 'rgba(60, 150, 255, 0.6)';
      this.cameraButton.style.transform = 'scale(0.9)';
      this.callbacks?.onToggleMortarCamera();
    };
    this.onCameraPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== this.cameraPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this.cameraPointerId = null;
      this.cameraButton.style.background = 'rgba(60, 150, 255, 0.3)';
      this.cameraButton.style.transform = 'scale(1)';
      if (typeof this.cameraButton.releasePointerCapture === 'function' && this.cameraButton.hasPointerCapture(e.pointerId)) {
        this.cameraButton.releasePointerCapture(e.pointerId);
      }
    };
    this.onCameraPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== this.cameraPointerId) return;
      e.preventDefault();
      this.cameraPointerId = null;
      this.cameraButton.style.background = 'rgba(60, 150, 255, 0.3)';
      this.cameraButton.style.transform = 'scale(1)';
      if (typeof this.cameraButton.releasePointerCapture === 'function' && this.cameraButton.hasPointerCapture(e.pointerId)) {
        this.cameraButton.releasePointerCapture(e.pointerId);
      }
    };

    this.cameraButton.addEventListener('pointerdown', this.onCameraPointerDown, { passive: false });
    this.cameraButton.addEventListener('pointerup', this.onCameraPointerUp, { passive: false });
    this.cameraButton.addEventListener('pointercancel', this.onCameraPointerCancel, { passive: false });

    buttonRow.appendChild(this.fireButton);
    buttonRow.appendChild(this.undeployButton);
    buttonRow.appendChild(this.cameraButton);
    this.deployedContainer.appendChild(buttonRow);
    this.container.appendChild(this.deployedContainer);

    document.body.appendChild(this.container);
  }

  private createButton(label: string, id: string, styles: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const btn = document.createElement('div');
    btn.id = id;
    Object.assign(btn.style, {
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.9)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      ...styles,
    } as Partial<CSSStyleDeclaration>);
    btn.textContent = label;
    return btn;
  }

  setCallbacks(callbacks: TouchMortarCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Switch between deploy button and deployed controls */
  setDeployed(deployed: boolean): void {
    this.deployed = deployed;
    if (deployed) {
      this.deployButton.style.display = 'none';
      this.deployedContainer.style.display = 'flex';
    } else {
      this.deployButton.style.display = 'flex';
      this.deployedContainer.style.display = 'none';
      // Reset aim tracking
      this.aimPointerId = null;
    }
  }

  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.container.style.display = 'flex';
  }

  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.container.style.display = 'none';
    this.aimPointerId = null;
  }

  show(): void {
    this.showButton();
  }

  hide(): void {
    this.hideButton();
  }

  dispose(): void {
    this.deployButton.removeEventListener('pointerdown', this.onDeployPointerDown);
    this.deployButton.removeEventListener('pointerup', this.onDeployPointerUp);
    this.deployButton.removeEventListener('pointercancel', this.onDeployPointerCancel);
    this.fireButton.removeEventListener('pointerdown', this.onFirePointerDown);
    this.fireButton.removeEventListener('pointerup', this.onFirePointerUp);
    this.fireButton.removeEventListener('pointercancel', this.onFirePointerCancel);
    this.undeployButton.removeEventListener('pointerdown', this.onUndeployPointerDown);
    this.undeployButton.removeEventListener('pointerup', this.onUndeployPointerUp);
    this.undeployButton.removeEventListener('pointercancel', this.onUndeployPointerCancel);
    this.cameraButton.removeEventListener('pointerdown', this.onCameraPointerDown);
    this.cameraButton.removeEventListener('pointerup', this.onCameraPointerUp);
    this.cameraButton.removeEventListener('pointercancel', this.onCameraPointerCancel);
    this.aimPad.removeEventListener('pointerdown', this.onAimPointerDown);
    this.aimPad.removeEventListener('pointermove', this.onAimPointerMove);
    this.aimPad.removeEventListener('pointerup', this.onAimPointerUp);
    this.aimPad.removeEventListener('pointercancel', this.onAimPointerUp);
    this.container.remove();
  }
}
