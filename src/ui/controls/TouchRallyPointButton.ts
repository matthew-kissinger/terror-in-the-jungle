/**
 * Contextual touch button for rally point placement (V key).
 * Visible when player is alive and on foot.
 */
export class TouchRallyPointButton {
  private button: HTMLDivElement;
  private isVisible = false;

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

    this.button.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.button.style.background = 'rgba(100, 255, 100, 0.6)';
      this.button.style.transform = 'scale(0.9)';
      this.onPlaceRallyPoint?.();
    }, { passive: false });

    this.button.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.button.style.background = 'rgba(100, 255, 100, 0.3)';
      this.button.style.transform = 'scale(1)';
    }, { passive: false });

    this.button.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      this.button.style.background = 'rgba(100, 255, 100, 0.3)';
      this.button.style.transform = 'scale(1)';
    }, { passive: false });
  }

  setCallback(onPlaceRallyPoint: () => void): void {
    this.onPlaceRallyPoint = onPlaceRallyPoint;
  }

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
    this.button.remove();
  }
}
