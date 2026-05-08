import { isPerfDiagnosticsEnabled, isDiagEnabled } from './PerfDiagnostics';

export interface RuntimeFrameEvent {
  frameCount: number;
  frameMs: number;
  atMs: number;
  previousMaxFrameMs: number;
  newMax: boolean;
  hitch33: boolean;
  hitch50: boolean;
  hitch100: boolean;
}

interface RuntimeMetricsSnapshot {
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
  frameEvents: RuntimeFrameEvent[];
}

export class RuntimeMetrics {
  private readonly maxSamples = 300;
  private readonly maxFrameEvents = 64;
  // Ring buffer for O(1) push instead of Array.shift() O(n)
  private readonly ringBuffer = new Float64Array(300);
  private readonly frameEventRing: Array<RuntimeFrameEvent | undefined> = new Array(this.maxFrameEvents);
  private ringHead = 0;
  private ringCount = 0;
  private frameEventHead = 0;
  private frameEventCount = 0;
  // Cache for percentile calculations - invalidated on each push
  private percentileCacheDirty = true;
  private cachedP95 = 0;
  private cachedP99 = 0;
  private sortScratch: Float64Array | null = null;
  private lastPercentileComputeTime = 0;
  private readonly PERCENTILE_RECOMPUTE_INTERVAL_MS = 500;
  private frameCount = 0;
  private maxFrameMs = 0;
  private hitch33Count = 0;
  private hitch50Count = 0;
  private hitch100Count = 0;
  private combatantCount = 0;
  private firingCount = 0;
  private engagingCount = 0;

  constructor() {
    if (typeof window !== 'undefined' && (
      ((import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfDiagnosticsEnabled())
      || isDiagEnabled()
    )) {
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
      const getFrameEvents = () => this.getFrameEvents();
      const getSnapshot = () => this.getSnapshot();
      const reset = () => this.reset();

      (window as any).__metrics = {
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
        get frameEvents() { return getFrameEvents(); },
        getFrameEvents,
        getSnapshot,
        reset
      };
    }
  }

  updateFrame(deltaTimeSeconds: number): void {
    const frameMs = deltaTimeSeconds * 1000;
    if (!Number.isFinite(frameMs)) return;

    const previousMaxFrameMs = this.maxFrameMs;
    this.frameCount += 1;
    const newMax = frameMs > previousMaxFrameMs;
    const hitch33 = frameMs > 33.33;
    const hitch50 = frameMs > 50;
    const hitch100 = frameMs > 100;

    if (newMax) this.maxFrameMs = frameMs;
    if (hitch33) this.hitch33Count += 1;
    if (hitch50) this.hitch50Count += 1;
    if (hitch100) this.hitch100Count += 1;
    if (hitch33 || (newMax && frameMs >= 25)) {
      this.recordFrameEvent(frameMs, previousMaxFrameMs, newMax, hitch33, hitch50, hitch100);
    }

    // Ring buffer: O(1) insert, no shift needed
    this.ringBuffer[this.ringHead] = frameMs;
    this.ringHead = (this.ringHead + 1) % this.maxSamples;
    if (this.ringCount < this.maxSamples) this.ringCount++;
    this.percentileCacheDirty = true;
  }

  updateCombatStats(stats: { combatantCount: number; firingCount: number; engagingCount: number }): void {
    this.combatantCount = stats.combatantCount;
    this.firingCount = stats.firingCount;
    this.engagingCount = stats.engagingCount;
  }

  getSnapshot(): RuntimeMetricsSnapshot {
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
      engagingCount: this.engagingCount,
      frameEvents: this.getFrameEvents()
    };
  }

  reset(): void {
    this.ringHead = 0;
    this.ringCount = 0;
    this.frameEventHead = 0;
    this.frameEventCount = 0;
    this.percentileCacheDirty = true;
    this.cachedP95 = 0;
    this.cachedP99 = 0;
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
    if (this.ringCount === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.ringCount; i++) {
      sum += this.ringBuffer[i];
    }
    return sum / this.ringCount;
  }

  private recordFrameEvent(
    frameMs: number,
    previousMaxFrameMs: number,
    newMax: boolean,
    hitch33: boolean,
    hitch50: boolean,
    hitch100: boolean
  ): void {
    this.frameEventRing[this.frameEventHead] = {
      frameCount: this.frameCount,
      frameMs,
      atMs: RuntimeMetrics.nowMs(),
      previousMaxFrameMs,
      newMax,
      hitch33,
      hitch50,
      hitch100
    };
    this.frameEventHead = (this.frameEventHead + 1) % this.maxFrameEvents;
    if (this.frameEventCount < this.maxFrameEvents) this.frameEventCount++;
  }

  private getFrameEvents(): RuntimeFrameEvent[] {
    const events: RuntimeFrameEvent[] = [];
    for (let i = 0; i < this.frameEventCount; i++) {
      const index = (this.frameEventHead - this.frameEventCount + i + this.maxFrameEvents) % this.maxFrameEvents;
      const event = this.frameEventRing[index];
      if (event) events.push(event);
    }
    return events;
  }

  private static nowMs(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  private computePercentiles(): void {
    if (!this.percentileCacheDirty) return;

    // Throttle: sorting 300 floats is cheap but not free. Display metrics
    // don't need sub-frame freshness - 500ms is more than enough.
    const now = performance.now();
    if (now - this.lastPercentileComputeTime < this.PERCENTILE_RECOMPUTE_INTERVAL_MS) return;
    this.lastPercentileComputeTime = now;
    this.percentileCacheDirty = false;

    if (this.ringCount === 0) {
      this.cachedP95 = 0;
      this.cachedP99 = 0;
      return;
    }

    // Reuse a single scratch buffer to avoid per-frame allocation + GC pressure.
    // Only reallocate if the ring grew (happens once during warmup, then never).
    if (!this.sortScratch || this.sortScratch.length < this.ringCount) {
      this.sortScratch = new Float64Array(this.maxSamples);
    }
    for (let i = 0; i < this.ringCount; i++) {
      this.sortScratch[i] = this.ringBuffer[i];
    }
    // Sort only the active portion via a subarray view (no allocation)
    const active = this.sortScratch.subarray(0, this.ringCount);
    active.sort();

    this.cachedP95 = active[Math.floor((this.ringCount - 1) * 0.95)];
    this.cachedP99 = active[Math.floor((this.ringCount - 1) * 0.99)];
  }

  private getP95FrameMs(): number {
    this.computePercentiles();
    return this.cachedP95;
  }

  private getP99FrameMs(): number {
    this.computePercentiles();
    return this.cachedP99;
  }
}
