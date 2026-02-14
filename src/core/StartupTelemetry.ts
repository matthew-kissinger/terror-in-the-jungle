export interface StartupMark {
  name: string;
  atMs: number;
  sinceStartMs: number;
}

class StartupTelemetry {
  private startedAtMs = 0;
  private marks: StartupMark[] = [];

  reset(): void {
    this.startedAtMs = performance.now();
    this.marks = [];
    this.mark('startup.reset');
  }

  mark(name: string): void {
    const now = performance.now();
    if (this.startedAtMs === 0) {
      this.startedAtMs = now;
    }
    this.marks.push({
      name,
      atMs: now,
      sinceStartMs: now - this.startedAtMs
    });
  }

  getSnapshot(): { startedAtMs: number; totalElapsedMs: number; marks: StartupMark[] } {
    const now = performance.now();
    return {
      startedAtMs: this.startedAtMs,
      totalElapsedMs: this.startedAtMs > 0 ? now - this.startedAtMs : 0,
      marks: [...this.marks]
    };
  }
}

const telemetry = new StartupTelemetry();

if (typeof window !== 'undefined') {
  (window as any).__startupTelemetry = {
    getSnapshot: () => telemetry.getSnapshot()
  };
}

export function resetStartupTelemetry(): void {
  telemetry.reset();
}

export function markStartup(name: string): void {
  telemetry.mark(name);
}

