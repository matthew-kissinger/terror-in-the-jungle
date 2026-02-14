/**
 * ADS (Aim Down Sights) toggle button for mobile touch controls.
 * Positioned above/left of the fire button. Tap to toggle ADS on/off.
 */
export class TouchADSButton {
  private button: HTMLDivElement;
  private isActive = false;

  private onADSToggle?: (active: boolean) => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-ads-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: '120px',
      bottom: '40px',
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

    this.button.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.button.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.button.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  setOnADSToggle(callback: (active: boolean) => void): void {
    this.onADSToggle = callback;
  }

  /** Reset ADS state (e.g. on weapon switch) */
  resetADS(): void {
    if (this.isActive) {
      this.isActive = false;
      this.updateVisual();
      this.onADSToggle?.(false);
    }
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.isActive = !this.isActive;
    this.updateVisual();
    this.onADSToggle?.(this.isActive);
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
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

  show(): void {
    this.button.style.display = 'flex';
  }

  hide(): void {
    this.button.style.display = 'none';
    this.resetADS();
  }

  dispose(): void {
    this.button.removeEventListener('touchstart', this.onTouchStart);
    this.button.removeEventListener('touchend', this.onTouchEnd);
    this.button.removeEventListener('touchcancel', this.onTouchEnd);
    this.button.remove();
  }
}
