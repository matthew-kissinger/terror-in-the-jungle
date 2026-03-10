import { TerrainBudgetMetrics, type TerrainStreamMetric } from './TerrainBudgetMetrics';

interface TerrainStreamResult {
  workUnits: number;
  pendingUnits: number;
}

export class TerrainStreamingScheduler {
  private readonly metrics = new TerrainBudgetMetrics();

  runStream(
    name: string,
    budgetMs: number,
    work: (budgetMs: number) => TerrainStreamResult
  ): TerrainStreamMetric {
    const startedAt = performance.now();
    const result = work(budgetMs);
    const durationMs = performance.now() - startedAt;
    return this.metrics.record(name, budgetMs, durationMs, result.workUnits, result.pendingUnits);
  }

  getMetrics(): TerrainStreamMetric[] {
    return this.metrics.getSnapshot();
  }
}
