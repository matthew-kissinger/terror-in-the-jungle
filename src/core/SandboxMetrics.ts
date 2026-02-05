export interface SandboxMetricsSnapshot {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  combatantCount: number;
  firingCount: number;
  engagingCount: number;
}

export class SandboxMetrics {
  private readonly maxSamples = 300;
  private frameTimes: number[] = [];
  private frameCount = 0;
  private combatantCount = 0;
  private firingCount = 0;
  private engagingCount = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      // Use arrow functions to capture 'this' lexically instead of aliasing
      const getFrameCount = () => this.frameCount;
      const getAvgFrameMs = () => this.getAvgFrameMs();
      const getP95FrameMs = () => this.getP95FrameMs();
      const getCombatantCount = () => this.combatantCount;
      const getFiringCount = () => this.firingCount;
      const getEngagingCount = () => this.engagingCount;
      const getSnapshot = () => this.getSnapshot();

      (window as any).sandboxMetrics = {
        get frameCount() { return getFrameCount(); },
        get avgFrameMs() { return getAvgFrameMs(); },
        get p95FrameMs() { return getP95FrameMs(); },
        get combatantCount() { return getCombatantCount(); },
        get firingCount() { return getFiringCount(); },
        get engagingCount() { return getEngagingCount(); },
        getSnapshot
      };
    }
  }

  updateFrame(deltaTimeSeconds: number): void {
    const frameMs = deltaTimeSeconds * 1000;
    if (!Number.isFinite(frameMs)) return;

    this.frameCount += 1;
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
      combatantCount: this.combatantCount,
      firingCount: this.firingCount,
      engagingCount: this.engagingCount
    };
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
}
