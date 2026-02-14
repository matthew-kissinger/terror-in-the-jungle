/**
 * Virtual joystick overlay for mobile movement control.
 * Renders on the left side of the screen.
 * Outputs a normalised {x, z} vector in [-1, 1] range.
 */
export class VirtualJoystick {
  private container: HTMLDivElement;
  private base: HTMLDivElement;
  private thumb: HTMLDivElement;

  private activeTouchId: number | null = null;
  private baseX = 0;
  private baseY = 0;

  /** Normalised output – read every frame */
  readonly output = { x: 0, z: 0 };

  // Geometry
  private readonly BASE_SIZE = 120;
  private readonly THUMB_SIZE = 50;
  private readonly MAX_DISTANCE: number;

  // Callbacks for sprint
  private onSprintStart?: () => void;
  private onSprintStop?: () => void;
  private isSprinting = false;
  private readonly SPRINT_THRESHOLD = 0.9;

  constructor() {
    this.MAX_DISTANCE = this.BASE_SIZE / 2;

    // Container – covers left 40% of the screen as touch zone
    this.container = document.createElement('div');
    this.container.id = 'touch-joystick-zone';
    Object.assign(this.container.style, {
      position: 'fixed',
      left: '0',
      bottom: '0',
      width: '40%',
      height: '60%',
      zIndex: '1000',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // Base circle
    this.base = document.createElement('div');
    Object.assign(this.base.style, {
      position: 'absolute',
      left: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-left, 0px))`,
      bottom: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-bottom, 0px))`,
      width: `${this.BASE_SIZE}px`,
      height: `${this.BASE_SIZE}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
    } as Partial<CSSStyleDeclaration>);

    // Thumb
    this.thumb = document.createElement('div');
    Object.assign(this.thumb.style, {
      width: `${this.THUMB_SIZE}px`,
      height: `${this.THUMB_SIZE}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.5)',
      position: 'absolute',
      left: `${(this.BASE_SIZE - this.THUMB_SIZE) / 2}px`,
      top: `${(this.BASE_SIZE - this.THUMB_SIZE) / 2}px`,
      transition: 'none',
    } as Partial<CSSStyleDeclaration>);

    this.base.appendChild(this.thumb);
    this.container.appendChild(this.base);
    document.body.appendChild(this.container);

    // Bind touch events
    this.container.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd, { passive: false });
    this.container.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  setSprintCallbacks(onStart: () => void, onStop: () => void): void {
    this.onSprintStart = onStart;
    this.onSprintStop = onStop;
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.activeTouchId !== null) return; // already tracking a touch

    const touch = e.changedTouches[0];
    this.activeTouchId = touch.identifier;

    // Record base centre
    const rect = this.base.getBoundingClientRect();
    this.baseX = rect.left + rect.width / 2;
    this.baseY = rect.top + rect.height / 2;

    this.updateThumb(touch.clientX, touch.clientY);
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = this.findActiveTouch(e.changedTouches);
    if (!touch) return;
    this.updateThumb(touch.clientX, touch.clientY);
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    const touch = this.findActiveTouch(e.changedTouches);
    if (!touch) return;
    this.activeTouchId = null;
    this.resetThumb();
  };

  private findActiveTouch(touches: TouchList): Touch | null {
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this.activeTouchId) return touches[i];
    }
    return null;
  }

  private updateThumb(clientX: number, clientY: number): void {
    let dx = clientX - this.baseX;
    let dy = clientY - this.baseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(distance, this.MAX_DISTANCE);

    if (distance > 0) {
      dx = (dx / distance) * clamped;
      dy = (dy / distance) * clamped;
    }

    // Position thumb relative to base centre
    this.thumb.style.left = `${(this.BASE_SIZE - this.THUMB_SIZE) / 2 + dx}px`;
    this.thumb.style.top = `${(this.BASE_SIZE - this.THUMB_SIZE) / 2 + dy}px`;

    // Normalise output: x = left/right, z = forward/back (up = forward = -z in game)
    const normX = dx / this.MAX_DISTANCE;
    const normY = dy / this.MAX_DISTANCE;
    this.output.x = normX;   // right = positive
    this.output.z = normY;   // down on screen = positive (backward in game)

    // Sprint detection
    const magnitude = Math.sqrt(normX * normX + normY * normY);
    if (magnitude >= this.SPRINT_THRESHOLD && !this.isSprinting) {
      this.isSprinting = true;
      this.onSprintStart?.();
    } else if (magnitude < this.SPRINT_THRESHOLD && this.isSprinting) {
      this.isSprinting = false;
      this.onSprintStop?.();
    }
  }

  private resetThumb(): void {
    this.thumb.style.left = `${(this.BASE_SIZE - this.THUMB_SIZE) / 2}px`;
    this.thumb.style.top = `${(this.BASE_SIZE - this.THUMB_SIZE) / 2}px`;
    this.output.x = 0;
    this.output.z = 0;

    if (this.isSprinting) {
      this.isSprinting = false;
      this.onSprintStop?.();
    }
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
    this.resetThumb();
    this.activeTouchId = null;
  }

  dispose(): void {
    this.container.removeEventListener('touchstart', this.onTouchStart);
    this.container.removeEventListener('touchmove', this.onTouchMove);
    this.container.removeEventListener('touchend', this.onTouchEnd);
    this.container.removeEventListener('touchcancel', this.onTouchEnd);
    this.container.remove();
  }
}
