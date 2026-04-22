/**
 * TimeScale — central knob for the simulation loop's effective deltaTime.
 *
 * The main loop multiplies its raw delta by `get()` before dispatching to
 * systems. Pausing drives `get()` to 0 except for a single-frame escape hatch
 * via `stepOneFrame()`. Changing the scale tier is a plain multiply — any
 * system that reads `performance.now()` instead of the dispatched delta will
 * bypass this control (flagged in the task PR body).
 */
export const TIME_SCALE_TIERS = [0.1, 0.25, 0.5, 1, 2, 4] as const;
export type TimeScaleValue = typeof TIME_SCALE_TIERS[number];

export class TimeScale {
  private scale: TimeScaleValue = 1;
  private paused = false;
  private stepRequested = false;

  /**
   * Effective multiplier for the next dispatch. Returns 0 while paused unless
   * a step has been requested this frame.
   */
  get(): number {
    if (this.paused && !this.stepRequested) return 0;
    return this.scale;
  }

  set(value: TimeScaleValue): void { this.scale = value; }
  getScale(): TimeScaleValue { return this.scale; }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  togglePause(): boolean { this.paused = !this.paused; return this.paused; }

  /**
   * Request that the next dispatch run a full (non-zero) frame even while
   * paused. No-op if not paused, and only one step per real-time frame —
   * repeated calls before `postDispatch()` collapse to a single step.
   */
  stepOneFrame(): void {
    if (this.paused) this.stepRequested = true;
  }

  /**
   * Called by the loop immediately after the scaled dispatch so a requested
   * step consumes exactly one frame.
   */
  postDispatch(): void {
    if (this.paused && this.stepRequested) {
      this.stepRequested = false;
    }
  }

  isPaused(): boolean { return this.paused; }
  isScaled(): boolean { return this.scale !== 1; }
  wasStepRequested(): boolean { return this.stepRequested; }

  /**
   * Step one tier faster (towards 4x). Clamps at the top. Returns the new scale.
   */
  faster(): TimeScaleValue {
    const idx = TIME_SCALE_TIERS.indexOf(this.scale);
    const next = Math.min(idx + 1, TIME_SCALE_TIERS.length - 1);
    this.scale = TIME_SCALE_TIERS[next];
    return this.scale;
  }

  /**
   * Step one tier slower (towards 0.1x). Clamps at the bottom. Returns the new scale.
   */
  slower(): TimeScaleValue {
    const idx = TIME_SCALE_TIERS.indexOf(this.scale);
    const next = Math.max(idx - 1, 0);
    this.scale = TIME_SCALE_TIERS[next];
    return this.scale;
  }

  reset(): void {
    this.scale = 1;
    this.paused = false;
    this.stepRequested = false;
  }
}
