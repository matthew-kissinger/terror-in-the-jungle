/**
 * ADS (Aim Down Sights) button for mobile touch controls.
 * Hold to aim, release to stop aiming. Uses pointer events.
 */
export class TouchADSButton {
  private button: HTMLDivElement;
  private isActive = false;
  private activePointerId: number | null = null;

  private onADSToggle?: (active: boolean) => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-ads-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: `calc(var(--tc-fire-size, 80px) + max(var(--tc-edge-inset, 30px), env(safe-area-inset-right, 0px)) + 12px)`,
      bottom: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-bottom, 0px))`,
      width: 'var(--tc-ads-size, 56px)',
      height: 'var(--tc-ads-size, 56px)',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
      userSelect: 'none',
      webkitUserSelect: 'none',
      fontSize: 'var(--tc-font-size, 11px)',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.8)',
      letterSpacing: '0.5px',
    } as Partial<CSSStyleDeclaration>);
    this.button.textContent = 'ADS';

    document.body.appendChild(this.button);

    this.button.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.button.addEventListener('pointerup', this.onPointerUp, { passive: false });
    this.button.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
  }

  setOnADSToggle(callback: (active: boolean) => void): void {
    this.onADSToggle = callback;
  }

  /** Reset ADS state (e.g. on weapon switch) */
  resetADS(): void {
    if (this.isActive) {
      this.isActive = false;
      this.activePointerId = null;
      this.updateVisual();
      this.onADSToggle?.(false);
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.isActive) return;
    this.activePointerId = e.pointerId;
    if (typeof this.button.setPointerCapture === 'function') {
      this.button.setPointerCapture(e.pointerId);
    }
    this.isActive = true;
    this.updateVisual();
    this.onADSToggle?.(true);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (!this.isActive) return;
    this.activePointerId = null;
    this.isActive = false;
    this.updateVisual();
    this.onADSToggle?.(false);
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    if (!this.isActive) return;
    this.activePointerId = null;
    this.isActive = false;
    this.updateVisual();
    this.onADSToggle?.(false);
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
  };

  private updateVisual(): void {
    if (this.isActive) {
      this.button.style.background = 'rgba(100,180,255,0.45)';
      this.button.style.borderColor = 'rgba(100,180,255,0.8)';
      this.button.style.color = 'rgba(255,255,255,1)';
    } else {
      this.button.style.background = 'rgba(255,255,255,0.15)';
      this.button.style.borderColor = 'rgba(255,255,255,0.3)';
      this.button.style.color = 'rgba(255,255,255,0.8)';
    }
  }

  /** Re-parent into a grid slot. */
  mountTo(parent: HTMLElement): void {
    this.button.style.position = '';
    this.button.style.right = '';
    this.button.style.bottom = '';
    this.button.style.zIndex = '';
    if (this.button.parentNode) this.button.parentNode.removeChild(this.button);
    parent.appendChild(this.button);
  }

  show(): void {
    this.button.style.display = 'flex';
  }

  hide(): void {
    this.button.style.display = 'none';
    this.resetADS();
  }

  dispose(): void {
    this.button.removeEventListener('pointerdown', this.onPointerDown);
    this.button.removeEventListener('pointerup', this.onPointerUp);
    this.button.removeEventListener('pointercancel', this.onPointerCancel);
    this.button.remove();
  }
}
