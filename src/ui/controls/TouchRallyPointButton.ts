/**
 * Contextual touch button for rally point placement (V key).
 * Visible when player is alive and on foot.
 * Uses pointer events with setPointerCapture for unified input handling.
 */
export class TouchRallyPointButton {
  private button: HTMLDivElement;
  private isVisible = false;
  private activePointerId: number | null = null;

  private onPlaceRallyPoint?: () => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-rally-point-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: '30px',
      bottom: '250px',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      background: 'rgba(100, 255, 100, 0.3)',
      border: '2px solid rgba(150, 255, 150, 0.5)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '13px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.9)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
      textTransform: 'uppercase',
    } as Partial<CSSStyleDeclaration>);
    this.button.textContent = 'V';

    document.body.appendChild(this.button);

    this.button.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.button.addEventListener('pointerup', this.onPointerUp, { passive: false });
    this.button.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
  }

  setCallback(onPlaceRallyPoint: () => void): void {
    this.onPlaceRallyPoint = onPlaceRallyPoint;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    if (typeof this.button.setPointerCapture === 'function') {
      this.button.setPointerCapture(e.pointerId);
    }
    this.button.style.background = 'rgba(100, 255, 100, 0.6)';
    this.button.style.transform = 'scale(0.9)';
    this.onPlaceRallyPoint?.();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    this.activePointerId = null;
    this.button.style.background = 'rgba(100, 255, 100, 0.3)';
    this.button.style.transform = 'scale(1)';
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.button.style.background = 'rgba(100, 255, 100, 0.3)';
    this.button.style.transform = 'scale(1)';
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
  };

  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.button.style.display = 'flex';
  }

  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.button.style.display = 'none';
  }

  show(): void {
    // Don't auto-show - only shown when player can place rally points
  }

  hide(): void {
    this.hideButton();
  }

  dispose(): void {
    this.button.removeEventListener('pointerdown', this.onPointerDown);
    this.button.removeEventListener('pointerup', this.onPointerUp);
    this.button.removeEventListener('pointercancel', this.onPointerCancel);
    this.button.remove();
  }
}
