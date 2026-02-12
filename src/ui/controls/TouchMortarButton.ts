/**
 * Contextual touch controls for mortar weapon system.
 * Shows DEPLOY when mortar is available but not deployed.
 * Shows FIRE, aim pad, and UNDEPLOY when mortar is deployed.
 * Positioned on the LEFT side of screen.
 */

export interface TouchMortarCallbacks {
  onDeploy: () => void;
  onUndeploy: () => void;
  onFire: () => void;
  onAdjustPitch: (delta: number) => void;
  onAdjustYaw: (delta: number) => void;
}

export class TouchMortarButton {
  private container: HTMLDivElement;

  // Deploy button (not-deployed state)
  private deployButton: HTMLDivElement;

  // Deployed controls
  private deployedContainer: HTMLDivElement;
  private fireButton: HTMLDivElement;
  private undeployButton: HTMLDivElement;
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
      width: '70px',
      height: '70px',
      background: 'rgba(255, 180, 60, 0.3)',
      border: '2px solid rgba(255, 200, 100, 0.5)',
      fontSize: '11px',
    });
    this.deployButton.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.6)';
      this.deployButton.style.transform = 'scale(0.9)';
      this.callbacks?.onDeploy();
    }, { passive: false });
    this.deployButton.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.deployButton.style.transform = 'scale(1)';
    }, { passive: false });
    this.deployButton.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      this.deployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.deployButton.style.transform = 'scale(1)';
    }, { passive: false });
    this.container.appendChild(this.deployButton);

    // -- Deployed controls container --
    this.deployedContainer = document.createElement('div');
    Object.assign(this.deployedContainer.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '10px',
      alignItems: 'center',
    } as Partial<CSSStyleDeclaration>);

    // Aim pad (drag zone for pitch/yaw)
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
      this.aimPad.setPointerCapture(e.pointerId);
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
    };

    this.aimPad.addEventListener('pointerdown', this.onAimPointerDown);
    this.aimPad.addEventListener('pointermove', this.onAimPointerMove);
    this.aimPad.addEventListener('pointerup', this.onAimPointerUp);
    this.aimPad.addEventListener('pointercancel', this.onAimPointerUp);
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
      width: '70px',
      height: '70px',
      background: 'rgba(255, 60, 60, 0.4)',
      border: '3px solid rgba(255, 100, 100, 0.6)',
      fontSize: '12px',
    });
    this.fireButton.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.7)';
      this.fireButton.style.transform = 'scale(0.9)';
      this.callbacks?.onFire();
    }, { passive: false });
    this.fireButton.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.4)';
      this.fireButton.style.transform = 'scale(1)';
    }, { passive: false });
    this.fireButton.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      this.fireButton.style.background = 'rgba(255, 60, 60, 0.4)';
      this.fireButton.style.transform = 'scale(1)';
    }, { passive: false });

    // Undeploy button
    this.undeployButton = this.createButton('PACK', 'mortar-undeploy', {
      width: '52px',
      height: '52px',
      background: 'rgba(255, 180, 60, 0.3)',
      border: '2px solid rgba(255, 200, 100, 0.5)',
      fontSize: '10px',
    });
    this.undeployButton.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.6)';
      this.undeployButton.style.transform = 'scale(0.9)';
      this.callbacks?.onUndeploy();
    }, { passive: false });
    this.undeployButton.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.undeployButton.style.transform = 'scale(1)';
    }, { passive: false });
    this.undeployButton.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      this.undeployButton.style.background = 'rgba(255, 180, 60, 0.3)';
      this.undeployButton.style.transform = 'scale(1)';
    }, { passive: false });

    buttonRow.appendChild(this.fireButton);
    buttonRow.appendChild(this.undeployButton);
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
    this.aimPad.removeEventListener('pointerdown', this.onAimPointerDown);
    this.aimPad.removeEventListener('pointermove', this.onAimPointerMove);
    this.aimPad.removeEventListener('pointerup', this.onAimPointerUp);
    this.aimPad.removeEventListener('pointercancel', this.onAimPointerUp);
    this.container.remove();
  }
}
