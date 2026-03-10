export class FixedStepRunner {
  private accumulator = 0;
  private readonly stepSeconds: number;
  private readonly maxAccumulatedSeconds: number;

  constructor(stepSeconds = 1 / 60, maxAccumulatedSeconds = 0.15) {
    this.stepSeconds = stepSeconds;
    this.maxAccumulatedSeconds = maxAccumulatedSeconds;
  }

  step(deltaTime: number, callback: (fixedDeltaTime: number) => void): number {
    const clampedDelta = Math.min(Math.max(deltaTime, 0), this.maxAccumulatedSeconds);
    this.accumulator = Math.min(this.accumulator + clampedDelta, this.maxAccumulatedSeconds);

    while (this.accumulator >= this.stepSeconds) {
      callback(this.stepSeconds);
      this.accumulator -= this.stepSeconds;
    }

    return this.getInterpolationAlpha();
  }

  reset(): void {
    this.accumulator = 0;
  }

  getInterpolationAlpha(): number {
    return this.accumulator / this.stepSeconds;
  }
}
