/**
 * Touch cyclic control pad for helicopter pitch/roll on mobile.
 * A drag pad that maps finger position to cyclicPitch (vertical) and cyclicRoll (horizontal).
 * Auto-centers when not dragging. Positioned on the LEFT side of screen above the joystick.
 */

export class TouchHelicopterCyclic {
  private container: HTMLDivElement;
  private indicator: HTMLDivElement;

  private isVisible = false;
  private pointerId: number | null = null;
  private padCenterX = 0;
  private padCenterY = 0;

  /** Current normalized cyclic values: pitch [-1,1] (up=forward), roll [-1,1] (right=bank right) */
  private cyclicPitch = 0;
  private cyclicRoll = 0;

  private readonly PAD_SIZE = 120;
  private readonly HALF_PAD = 60;
  private readonly INDICATOR_SIZE = 20;

  // Bound handlers for cleanup
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'touch-helicopter-cyclic';
    Object.assign(this.container.style, {
      position: 'fixed',
      left: `calc(var(--tc-edge-inset, 20px) + env(safe-area-inset-left, 0px))`,
      bottom: `calc(200px + env(safe-area-inset-bottom, 0px))`,
      width: `${this.PAD_SIZE}px`,
      height: `${this.PAD_SIZE}px`,
      borderRadius: '12px',
      background: 'rgba(30, 60, 30, 0.35)',
      border: '2px solid rgba(80, 200, 80, 0.4)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
      userSelect: 'none',
      webkitUserSelect: 'none',
    } as Partial<CSSStyleDeclaration>);

    // Crosshair lines (static background)
    const crosshair = document.createElement('div');
    Object.assign(crosshair.style, {
      position: 'absolute',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);

    // Horizontal line
    const hLine = document.createElement('div');
    Object.assign(hLine.style, {
      position: 'absolute',
      top: '50%',
      left: '10%',
      width: '80%',
      height: '1px',
      background: 'rgba(80, 200, 80, 0.25)',
    } as Partial<CSSStyleDeclaration>);

    // Vertical line
    const vLine = document.createElement('div');
    Object.assign(vLine.style, {
      position: 'absolute',
      left: '50%',
      top: '10%',
      height: '80%',
      width: '1px',
      background: 'rgba(80, 200, 80, 0.25)',
    } as Partial<CSSStyleDeclaration>);

    crosshair.appendChild(hLine);
    crosshair.appendChild(vLine);
    this.container.appendChild(crosshair);

    // Label
    const label = document.createElement('div');
    Object.assign(label.style, {
      position: 'absolute',
      top: '4px',
      left: '0',
      width: '100%',
      textAlign: 'center',
      fontSize: '9px',
      fontWeight: 'bold',
      color: 'rgba(80, 200, 80, 0.5)',
      letterSpacing: '1px',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    label.textContent = 'CYCLIC';
    this.container.appendChild(label);

    // Movable indicator dot
    this.indicator = document.createElement('div');
    Object.assign(this.indicator.style, {
      position: 'absolute',
      width: `${this.INDICATOR_SIZE}px`,
      height: `${this.INDICATOR_SIZE}px`,
      borderRadius: '50%',
      background: 'rgba(80, 200, 80, 0.6)',
      border: '2px solid rgba(120, 255, 120, 0.7)',
      pointerEvents: 'none',
      left: `${this.HALF_PAD - this.INDICATOR_SIZE / 2}px`,
      top: `${this.HALF_PAD - this.INDICATOR_SIZE / 2}px`,
      transition: 'none',
    } as Partial<CSSStyleDeclaration>);
    this.container.appendChild(this.indicator);

    // Pointer events
    this.onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.container.setPointerCapture(e.pointerId);

      const rect = this.container.getBoundingClientRect();
      this.padCenterX = rect.left + this.HALF_PAD;
      this.padCenterY = rect.top + this.HALF_PAD;

      this.updateFromPointer(e.clientX, e.clientY);
      this.container.style.background = 'rgba(30, 60, 30, 0.5)';
    };

    this.onPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.pointerId) return;
      this.updateFromPointer(e.clientX, e.clientY);
    };

    this.onPointerUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.cyclicPitch = 0;
      this.cyclicRoll = 0;
      this.updateIndicatorPosition(0, 0);
      this.container.style.background = 'rgba(30, 60, 30, 0.35)';
    };

    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);

    document.body.appendChild(this.container);
  }

  private updateFromPointer(clientX: number, clientY: number): void {
    const dx = clientX - this.padCenterX;
    const dy = clientY - this.padCenterY;

    // Normalize to [-1, 1] and clamp
    this.cyclicRoll = Math.max(-1, Math.min(1, dx / this.HALF_PAD));
    // Invert Y: dragging up (negative dy) = positive pitch (forward)
    this.cyclicPitch = Math.max(-1, Math.min(1, -dy / this.HALF_PAD));

    this.updateIndicatorPosition(this.cyclicRoll, this.cyclicPitch);
  }

  private updateIndicatorPosition(rollNorm: number, pitchNorm: number): void {
    const halfIndicator = this.INDICATOR_SIZE / 2;
    const maxOffset = this.HALF_PAD - halfIndicator;
    const px = this.HALF_PAD + rollNorm * maxOffset - halfIndicator;
    // Invert pitch for screen coords: positive pitch = upward on screen
    const py = this.HALF_PAD - pitchNorm * maxOffset - halfIndicator;
    this.indicator.style.left = `${px}px`;
    this.indicator.style.top = `${py}px`;
  }

  /** Get current cyclic input. pitch: [-1,1] (positive=forward), roll: [-1,1] (positive=right bank) */
  getCyclicInput(): { pitch: number; roll: number } {
    return { pitch: this.cyclicPitch, roll: this.cyclicRoll };
  }

  show(): void {
    if (this.isVisible) return;
    this.isVisible = true;
    this.container.style.display = 'flex';
  }

  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.container.style.display = 'none';
    // Reset state
    this.pointerId = null;
    this.cyclicPitch = 0;
    this.cyclicRoll = 0;
    this.updateIndicatorPosition(0, 0);
  }

  dispose(): void {
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.container.remove();
  }
}
