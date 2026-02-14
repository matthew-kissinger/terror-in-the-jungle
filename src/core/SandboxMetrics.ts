export interface SandboxMetricsSnapshot {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch33Count: number;
  hitch50Count: number;
  hitch100Count: number;
  combatantCount: number;
  firingCount: number;
  engagingCount: number;
}

export class SandboxMetrics {
  private readonly maxSamples = 300;
  private frameTimes: number[] = [];
  private frameCount = 0;
  private maxFrameMs = 0;
  private hitch33Count = 0;
  private hitch50Count = 0;
  private hitch100Count = 0;
  private combatantCount = 0;
  private firingCount = 0;
  private engagingCount = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      // Use arrow functions to capture 'this' lexically instead of aliasing
      const getFrameCount = () => this.frameCount;
      const getAvgFrameMs = () => this.getAvgFrameMs();
      const getP95FrameMs = () => this.getP95FrameMs();
      const getP99FrameMs = () => this.getP99FrameMs();
      const getMaxFrameMs = () => this.maxFrameMs;
      const getHitch33Count = () => this.hitch33Count;
      const getHitch50Count = () => this.hitch50Count;
      const getHitch100Count = () => this.hitch100Count;
      const getCombatantCount = () => this.combatantCount;
      const getFiringCount = () => this.firingCount;
      const getEngagingCount = () => this.engagingCount;
      const getSnapshot = () => this.getSnapshot();
      const reset = () => this.reset();

      (window as any).sandboxMetrics = {
        get frameCount() { return getFrameCount(); },
        get avgFrameMs() { return getAvgFrameMs(); },
        get p95FrameMs() { return getP95FrameMs(); },
        get p99FrameMs() { return getP99FrameMs(); },
        get maxFrameMs() { return getMaxFrameMs(); },
        get hitch33Count() { return getHitch33Count(); },
        get hitch50Count() { return getHitch50Count(); },
        get hitch100Count() { return getHitch100Count(); },
        get combatantCount() { return getCombatantCount(); },
        get firingCount() { return getFiringCount(); },
        get engagingCount() { return getEngagingCount(); },
        getSnapshot,
        reset
      };
    }
  }

  updateFrame(deltaTimeSeconds: number): void {
    const frameMs = deltaTimeSeconds * 1000;
    if (!Number.isFinite(frameMs)) return;

    this.frameCount += 1;
    if (frameMs > this.maxFrameMs) this.maxFrameMs = frameMs;
    if (frameMs > 33.33) this.hitch33Count += 1;
    if (frameMs > 50) this.hitch50Count += 1;
    if (frameMs > 100) this.hitch100Count += 1;
    this.frameTimes.push(frameMs);

    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift();
    }
  }

  updateCombatStats(stats: { combatantCount: number; firingCount: number; engagingCount: number }): void {
    this.combatantCount = stats.combatantCount;
    this.firingCount = stats.firingCount;
    this.engagingCount = stats.engagingCount;
  }

  getSnapshot(): SandboxMetricsSnapshot {
    return {
      frameCount: this.frameCount,
      avgFrameMs: this.getAvgFrameMs(),
      p95FrameMs: this.getP95FrameMs(),
      p99FrameMs: this.getP99FrameMs(),
      maxFrameMs: this.maxFrameMs,
      hitch33Count: this.hitch33Count,
      hitch50Count: this.hitch50Count,
      hitch100Count: this.hitch100Count,
      combatantCount: this.combatantCount,
      firingCount: this.firingCount,
      engagingCount: this.engagingCount
    };
  }

  reset(): void {
    this.frameTimes = [];
    this.frameCount = 0;
    this.maxFrameMs = 0;
    this.hitch33Count = 0;
    this.hitch50Count = 0;
    this.hitch100Count = 0;
    this.combatantCount = 0;
    this.firingCount = 0;
    this.engagingCount = 0;
  }

  private getAvgFrameMs(): number {
    if (this.frameTimes.length === 0) return 0;
    const sum = this.frameTimes.reduce((acc, value) => acc + value, 0);
    return sum / this.frameTimes.length;
  }

  private getP95FrameMs(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const index = Math.floor((sorted.length - 1) * 0.95);
    return sorted[index];
  }

  private getP99FrameMs(): number {
    if (this.frameTimes.length === 0) return 0;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const index = Math.floor((sorted.length - 1) * 0.99);
    return sorted[index];
  }
}
