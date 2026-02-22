/**
 * Touch button for contextual interactions (e.g., helicopter entry/exit).
 * Appears in the center-right area when an interaction is available.
 * Only visible on touch devices when interaction prompt is active.
 */
export class TouchInteractionButton {
  private button: HTMLDivElement;
  private isTouched = false;
  private isVisible = false;

  private onInteract?: () => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-interaction-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      right: `calc(var(--tc-fire-size, 80px) + max(var(--tc-edge-inset, 30px), env(safe-area-inset-right, 0px)) + 16px)`,
      bottom: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-bottom, 0px))`,
      width: 'var(--tc-fire-size, 70px)',
      height: 'var(--tc-fire-size, 70px)',
      borderRadius: '50%',
      background: 'rgba(100, 200, 255, 0.4)',
      border: '3px solid rgba(150, 220, 255, 0.6)',
      display: 'none', // Start hidden
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
      userSelect: 'none',
      webkitUserSelect: 'none',
      fontSize: 'var(--tc-font-size, 28px)',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.9)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
    } as Partial<CSSStyleDeclaration>);
    this.button.textContent = 'E';

    document.body.appendChild(this.button);

    this.button.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.button.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.button.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  setCallback(onInteract: () => void): void {
    this.onInteract = onInteract;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.isTouched) return;
    this.isTouched = true;
    this.button.style.background = 'rgba(100, 200, 255, 0.7)';
    this.button.style.transform = 'scale(0.92)';
    this.onInteract?.();
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!this.isTouched) return;
    this.isTouched = false;
    this.button.style.background = 'rgba(100, 200, 255, 0.4)';
    this.button.style.transform = 'scale(1)';
  };

  /**
   * Show the button (called when interaction becomes available).
   */
  showButton(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.button.style.display = 'flex';
  }

  /**
   * Hide the button (called when interaction is no longer available).
   */
  hideButton(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.button.style.display = 'none';
    if (this.isTouched) {
      this.isTouched = false;
    }
  }

  /**
   * Show the button if touch controls are visible, otherwise hide it.
   * This is called from TouchControls.show()/hide().
   */
  show(): void {
    // Don't auto-show - button is only shown when interaction is available
    // This method exists for consistency with other touch controls
  }

  hide(): void {
    this.hideButton();
  }

  dispose(): void {
    this.button.removeEventListener('touchstart', this.onTouchStart);
    this.button.removeEventListener('touchend', this.onTouchEnd);
    this.button.removeEventListener('touchcancel', this.onTouchEnd);
    this.button.remove();
  }
}
