/**
 * Contextual touch buttons for sandbag rotation (R/T keys).
 * Only visible when sandbag weapon is selected.
 */
export class TouchSandbagButtons {
  private container: HTMLDivElement;
  private leftButton: HTMLDivElement;
  private rightButton: HTMLDivElement;
  private isVisible = false;

  private onRotateLeft?: () => void;
  private onRotateRight?: () => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'touch-sandbag-buttons';
    Object.assign(this.container.style, {
      position: 'fixed',
      right: '140px',
      bottom: '30px',
      display: 'none',
      flexDirection: 'row',
      gap: '12px',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    this.leftButton = this.createButton('◄', 'rotate-left');
    this.rightButton = this.createButton('►', 'rotate-right');

    this.container.appendChild(this.leftButton);
    this.container.appendChild(this.rightButton);
    document.body.appendChild(this.container);
  }

  private createButton(label: string, id: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.id = `sandbag-${id}`;
    Object.assign(btn.style, {
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      background: 'rgba(255, 200, 100, 0.3)',
      border: '2px solid rgba(255, 220, 150, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '24px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.9)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);
    btn.textContent = label;

    btn.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 200, 100, 0.6)';
      btn.style.transform = 'scale(0.9)';
      if (id === 'rotate-left') {
        this.onRotateLeft?.();
      } else {
        this.onRotateRight?.();
      }
    }, { passive: false });

    btn.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 200, 100, 0.3)';
      btn.style.transform = 'scale(1)';
    }, { passive: false });

    btn.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      btn.style.background = 'rgba(255, 200, 100, 0.3)';
      btn.style.transform = 'scale(1)';
    }, { passive: false });

    return btn;
  }

  setCallbacks(onRotateLeft: () => void, onRotateRight: () => void): void {
    this.onRotateLeft = onRotateLeft;
    this.onRotateRight = onRotateRight;
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
  }

  show(): void {
    // Don't auto-show - only shown when sandbag is active
  }

  hide(): void {
    this.hideButton();
  }

  dispose(): void {
    this.container.remove();
  }
}
