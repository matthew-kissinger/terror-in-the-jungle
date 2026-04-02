import type { CDPSession } from 'playwright';

type TouchPoint = {
  x: number;  // CSS viewport pixels
  y: number;
  id: number; // unique finger identifier
};

/**
 * Sends trusted multi-touch events via Chrome DevTools Protocol.
 * CDP Input.dispatchTouchEvent produces trusted PointerEvents in the browser,
 * which means setPointerCapture() works correctly.
 *
 * Coordinates are CSS pixels relative to the viewport.
 */
export class TouchInjector {
  constructor(private cdp: CDPSession) {}

  // ---- Atomic touch actions ----

  async touchStart(points: TouchPoint[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points.map(p => ({
        x: p.x,
        y: p.y,
        id: p.id,
        radiusX: 10,
        radiusY: 10,
        force: 1.0,
      })),
    });
  }

  async touchMove(points: TouchPoint[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points.map(p => ({
        x: p.x,
        y: p.y,
        id: p.id,
        radiusX: 10,
        radiusY: 10,
        force: 1.0,
      })),
    });
  }

  async touchEnd(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  }

  // ---- Single gesture helpers ----

  async tap(x: number, y: number, id: number = 0): Promise<void> {
    await this.touchStart([{ x, y, id }]);
    await sleep(50);
    await this.touchEnd();
  }

  async hold(x: number, y: number, durationMs: number, id: number = 0): Promise<void> {
    await this.touchStart([{ x, y, id }]);
    await sleep(durationMs);
    await this.touchEnd();
  }

  /**
   * Single-finger drag from start to end over durationMs.
   */
  async drag(
    start: { x: number; y: number },
    end: { x: number; y: number },
    durationMs: number,
    id: number = 0,
    steps: number = 20,
  ): Promise<void> {
    await this.touchStart([{ ...start, id }]);
    await sleep(50);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.touchMove([{
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        id,
      }]);
      await sleep(durationMs / steps);
    }
    await this.touchEnd();
  }

  // ---- Multi-touch gesture helpers ----

  /**
   * Two simultaneous drags (e.g., joystick + look).
   * Each finger moves independently from its start to end position.
   */
  async dualDrag(
    finger0: { start: { x: number; y: number }; end: { x: number; y: number } },
    finger1: { start: { x: number; y: number }; end: { x: number; y: number } },
    durationMs: number,
    steps: number = 30,
  ): Promise<void> {
    await this.touchStart([
      { ...finger0.start, id: 0 },
      { ...finger1.start, id: 1 },
    ]);
    await sleep(50);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.touchMove([
        {
          x: finger0.start.x + (finger0.end.x - finger0.start.x) * t,
          y: finger0.start.y + (finger0.end.y - finger0.start.y) * t,
          id: 0,
        },
        {
          x: finger1.start.x + (finger1.end.x - finger1.start.x) * t,
          y: finger1.start.y + (finger1.end.y - finger1.start.y) * t,
          id: 1,
        },
      ]);
      await sleep(durationMs / steps);
    }
    await this.touchEnd();
  }

  /**
   * Triple touch: two drags + one hold (e.g., joystick + look + fire).
   */
  async tripleTouchDragHold(
    drag0: { start: { x: number; y: number }; end: { x: number; y: number } },
    drag1: { start: { x: number; y: number }; end: { x: number; y: number } },
    holdPoint: { x: number; y: number },
    durationMs: number,
    steps: number = 30,
  ): Promise<void> {
    // Start all three fingers
    await this.touchStart([
      { ...drag0.start, id: 0 },
      { ...drag1.start, id: 1 },
      { ...holdPoint, id: 2 },
    ]);
    await sleep(50);

    // Move the two drag fingers while hold stays stationary
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.touchMove([
        {
          x: drag0.start.x + (drag0.end.x - drag0.start.x) * t,
          y: drag0.start.y + (drag0.end.y - drag0.start.y) * t,
          id: 0,
        },
        {
          x: drag1.start.x + (drag1.end.x - drag1.start.x) * t,
          y: drag1.start.y + (drag1.end.y - drag1.start.y) * t,
          id: 1,
        },
        { ...holdPoint, id: 2 }, // held stationary
      ]);
      await sleep(durationMs / steps);
    }
    await this.touchEnd();
  }

  /**
   * Hold multiple points simultaneously for a duration.
   */
  async multiHold(points: TouchPoint[], durationMs: number): Promise<void> {
    await this.touchStart(points);
    await sleep(durationMs);
    await this.touchEnd();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
