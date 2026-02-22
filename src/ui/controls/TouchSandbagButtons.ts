/**
 * Contextual touch buttons for sandbag rotation (R/T keys).
 * Only visible when sandbag weapon is selected.
 * Uses pointer events with setPointerCapture for unified input handling.
 */
export class TouchSandbagButtons {
  private container: HTMLDivElement;
  private leftButton: HTMLDivElement;
  private rightButton: HTMLDivElement;
  private isVisible = false;

  private onRotateLeft?: () => void;
  private onRotateRight?: () => void;

  // Track active pointers per button for proper release
  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;

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
      width: 'var(--tc-action-size, 60px)',
      height: 'var(--tc-action-size, 60px)',
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

    const isLeft = id === 'rotate-left';

    btn.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) {
        if (this.leftPointerId !== null) return;
        this.leftPointerId = e.pointerId;
      } else {
        if (this.rightPointerId !== null) return;
        this.rightPointerId = e.pointerId;
      }
      if (typeof btn.setPointerCapture === 'function') {
        btn.setPointerCapture(e.pointerId);
      }
      btn.style.background = 'rgba(255, 200, 100, 0.6)';
      btn.style.transform = 'scale(0.9)';
      if (isLeft) {
        this.onRotateLeft?.();
      } else {
        this.onRotateRight?.();
      }
    }, { passive: false });

    btn.addEventListener('pointerup', (e: PointerEvent) => {
      const activeId = isLeft ? this.leftPointerId : this.rightPointerId;
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      e.stopPropagation();
      if (isLeft) this.leftPointerId = null;
      else this.rightPointerId = null;
      btn.style.background = 'rgba(255, 200, 100, 0.3)';
      btn.style.transform = 'scale(1)';
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) {
        btn.releasePointerCapture(e.pointerId);
      }
    }, { passive: false });

    btn.addEventListener('pointercancel', (e: PointerEvent) => {
      const activeId = isLeft ? this.leftPointerId : this.rightPointerId;
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      if (isLeft) this.leftPointerId = null;
      else this.rightPointerId = null;
      btn.style.background = 'rgba(255, 200, 100, 0.3)';
      btn.style.transform = 'scale(1)';
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) {
        btn.releasePointerCapture(e.pointerId);
      }
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
