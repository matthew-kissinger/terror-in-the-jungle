/**
 * Touch-based camera look control.
 * Uses the right half of the screen (excluding button areas) for drag-to-look.
 * Produces camera delta {x, y} each frame similar to mouse movement.
 */
export class TouchLook {
  private container: HTMLDivElement;
  private activeTouchId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  /** Accumulated delta since last read – consumed by PlayerInput */
  readonly delta = { x: 0, y: 0 };

  private sensitivity = 0.004;

  constructor() {
    // Touch zone covers right 60% of screen, upper 70% to avoid fire button area
    this.container = document.createElement('div');
    this.container.id = 'touch-look-zone';
    Object.assign(this.container.style, {
      position: 'fixed',
      right: '0',
      top: '0',
      width: '60%',
      height: '70%',
      zIndex: '999',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    document.body.appendChild(this.container);

    this.container.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.container.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  setSensitivity(s: number): void {
    this.sensitivity = s;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.activeTouchId !== null) return;

    const touch = e.changedTouches[0];
    this.activeTouchId = touch.identifier;
    this.lastX = touch.clientX;
    this.lastY = touch.clientY;
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = this.findActiveTouch(e.changedTouches);
    if (!touch) return;

    const dx = touch.clientX - this.lastX;
    const dy = touch.clientY - this.lastY;

    // Accumulate deltas (will be consumed by PlayerInput)
    this.delta.x += dx * this.sensitivity;
    this.delta.y += dy * this.sensitivity;

    this.lastX = touch.clientX;
    this.lastY = touch.clientY;
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = this.findActiveTouch(e.changedTouches);
    if (!touch) return;
    this.activeTouchId = null;
  };

  private findActiveTouch(touches: TouchList): Touch | null {
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this.activeTouchId) return touches[i];
    }
    return null;
  }

  /** Read and clear accumulated delta */
  consumeDelta(): { x: number; y: number } {
    const x = this.delta.x;
    const y = this.delta.y;
    this.delta.x = 0;
    this.delta.y = 0;
    return { x, y };
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
    this.activeTouchId = null;
    this.delta.x = 0;
    this.delta.y = 0;
  }

  dispose(): void {
    this.container.removeEventListener('touchstart', this.onTouchStart);
    this.container.removeEventListener('touchmove', this.onTouchMove);
    this.container.removeEventListener('touchend', this.onTouchEnd);
    this.container.removeEventListener('touchcancel', this.onTouchEnd);
    this.container.remove();
  }
}
