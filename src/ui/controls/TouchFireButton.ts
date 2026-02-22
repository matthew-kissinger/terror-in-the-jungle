/**
 * Large fire button for mobile touch controls.
 * Uses pointer events for unified mouse/touch/pen handling.
 */
export class TouchFireButton {
  private button: HTMLDivElement;
  private activePointerId: number | null = null;

  private onFireStart?: () => void;
  private onFireStop?: () => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-fire-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-right, 0px))`,
      bottom: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-bottom, 0px))`,
      width: 'var(--tc-fire-size, 80px)',
      height: 'var(--tc-fire-size, 80px)',
      borderRadius: '50%',
      background: 'rgba(255, 60, 60, 0.4)',
      border: '3px solid rgba(255, 100, 100, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
      userSelect: 'none',
      webkitUserSelect: 'none',
      fontSize: 'var(--tc-font-size, 12px)',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.8)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    } as Partial<CSSStyleDeclaration>);
    this.button.textContent = 'FIRE';

    document.body.appendChild(this.button);

    this.button.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    this.button.addEventListener('pointerup', this.onPointerUp, { passive: false });
    this.button.addEventListener('pointercancel', this.onPointerCancel, { passive: false });
  }

  setCallbacks(onStart: () => void, onStop: () => void): void {
    this.onFireStart = onStart;
    this.onFireStop = onStop;
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
    this.button.style.background = 'rgba(255, 60, 60, 0.7)';
    this.button.style.transform = 'scale(0.92)';
    this.onFireStart?.();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    this.activePointerId = null;
    this.button.style.background = 'rgba(255, 60, 60, 0.4)';
    this.button.style.transform = 'scale(1)';
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
    this.onFireStop?.();
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    e.preventDefault();
    this.activePointerId = null;
    this.button.style.background = 'rgba(255, 60, 60, 0.4)';
    this.button.style.transform = 'scale(1)';
    if (typeof this.button.releasePointerCapture === 'function' && this.button.hasPointerCapture(e.pointerId)) {
      this.button.releasePointerCapture(e.pointerId);
    }
    this.onFireStop?.();
  };

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
    if (this.activePointerId !== null) {
      this.activePointerId = null;
      this.button.style.background = 'rgba(255, 60, 60, 0.4)';
      this.button.style.transform = 'scale(1)';
      this.onFireStop?.();
    }
  }

  dispose(): void {
    this.button.removeEventListener('pointerdown', this.onPointerDown);
    this.button.removeEventListener('pointerup', this.onPointerUp);
    this.button.removeEventListener('pointercancel', this.onPointerCancel);
    this.button.remove();
  }
}
