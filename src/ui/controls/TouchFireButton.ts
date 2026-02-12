/**
 * Large fire button for mobile touch controls.
 * Positioned in the bottom-right corner.
 */
export class TouchFireButton {
  private button: HTMLDivElement;
  private isTouched = false;

  private onFireStart?: () => void;
  private onFireStop?: () => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-fire-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: '30px',
      bottom: '30px',
      width: '80px',
      height: '80px',
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
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.8)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    } as Partial<CSSStyleDeclaration>);
    this.button.textContent = 'FIRE';

    document.body.appendChild(this.button);

    this.button.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.button.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.button.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  setCallbacks(onStart: () => void, onStop: () => void): void {
    this.onFireStart = onStart;
    this.onFireStop = onStop;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.isTouched) return;
    this.isTouched = true;
    this.button.style.background = 'rgba(255, 60, 60, 0.7)';
    this.button.style.transform = 'scale(0.92)';
    this.onFireStart?.();
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!this.isTouched) return;
    this.isTouched = false;
    this.button.style.background = 'rgba(255, 60, 60, 0.4)';
    this.button.style.transform = 'scale(1)';
    this.onFireStop?.();
  };

  show(): void {
    this.button.style.display = 'flex';
  }

  hide(): void {
    this.button.style.display = 'none';
    if (this.isTouched) {
      this.isTouched = false;
      this.onFireStop?.();
    }
  }

  dispose(): void {
    this.button.removeEventListener('touchstart', this.onTouchStart);
    this.button.removeEventListener('touchend', this.onTouchEnd);
    this.button.removeEventListener('touchcancel', this.onTouchEnd);
    this.button.remove();
  }
}
