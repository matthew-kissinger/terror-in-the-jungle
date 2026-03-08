export interface TerrainStreamMetric {
  name: string;
  budgetMs: number;
  lastMs: number;
  emaMs: number;
  workUnits: number;
  pendingUnits: number;
}

export class TerrainBudgetMetrics {
  private readonly metrics = new Map<string, TerrainStreamMetric>();
  private readonly emaAlpha = 0.2;

  record(
    name: string,
    budgetMs: number,
    durationMs: number,
    workUnits: number,
    pendingUnits: number
  ): TerrainStreamMetric {
    const previous = this.metrics.get(name);
    const metric: TerrainStreamMetric = previous
      ? {
          ...previous,
          budgetMs,
          lastMs: durationMs,
          emaMs: previous.emaMs * (1 - this.emaAlpha) + durationMs * this.emaAlpha,
          workUnits,
          pendingUnits,
        }
      : {
          name,
          budgetMs,
          lastMs: durationMs,
          emaMs: durationMs,
          workUnits,
          pendingUnits,
        };

    this.metrics.set(name, metric);
    return metric;
  }

  getSnapshot(): TerrainStreamMetric[] {
    return Array.from(this.metrics.values());
  }
}
