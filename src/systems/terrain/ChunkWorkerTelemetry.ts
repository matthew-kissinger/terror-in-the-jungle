/**
 * Telemetry tracking for ChunkWorkerPool
 * Tracks performance metrics and worker statistics
 */

/**
 * Telemetry data structure
 */
export interface ChunkWorkerTelemetryData {
  chunksGenerated: number;
  totalGenerationTimeMs: number;
  avgGenerationTimeMs: number;
  workersReady: number;
  duplicatesAvoided: number;
}

/**
 * Manages telemetry tracking for chunk worker pool
 */
export class ChunkWorkerTelemetry {
  private telemetry: ChunkWorkerTelemetryData = {
    chunksGenerated: 0,
    totalGenerationTimeMs: 0,
    avgGenerationTimeMs: 0,
    workersReady: 0,
    duplicatesAvoided: 0
  };

  /**
   * Record worker ready event
   */
  recordWorkerReady(): void {
    this.telemetry.workersReady++;
  }

  /**
   * Record chunk generation completion
   */
  recordChunkGenerated(generationTimeMs: number): void {
    this.telemetry.chunksGenerated++;
    this.telemetry.totalGenerationTimeMs += generationTimeMs;
    this.telemetry.avgGenerationTimeMs = 
      this.telemetry.totalGenerationTimeMs / this.telemetry.chunksGenerated;
  }

  /**
   * Record duplicate avoidance
   */
  recordDuplicateAvoided(): void {
    this.telemetry.duplicatesAvoided++;
  }

  /**
   * Get current telemetry data
   */
  getTelemetry(): ChunkWorkerTelemetryData {
    return { ...this.telemetry };
  }

  /**
   * Reset all telemetry
   */
  reset(): void {
    this.telemetry = {
      chunksGenerated: 0,
      totalGenerationTimeMs: 0,
      avgGenerationTimeMs: 0,
      workersReady: 0,
      duplicatesAvoided: 0
    };
  }
}
