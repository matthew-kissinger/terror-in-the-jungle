import { GPUTelemetry } from './GPUTimingTelemetry'
import { BenchmarkResult } from './PerformanceBenchmark'

export interface SystemTiming {
  name: string
  budgetMs: number
  lastMs: number
  emaMs: number
  peakMs: number
}

export interface FrameData {
  timestamp: number
  duration: number
  overBudget: boolean
  systems: Record<string, number>
}

export interface SpatialGridTelemetry {
  initialized: boolean
  entityCount: number
  queriesThisFrame: number
  avgQueryTimeMs: number
  fallbackCount: number
  lastSyncMs: number
}

export interface TerrainMergerTelemetry {
  activeRings: number
  totalChunks: number
  pendingMerge: boolean
  estimatedDrawCallSavings: number
  enabled: boolean
}

export interface TelemetryReport {
  fps: number
  avgFrameMs: number
  overBudgetPercent: number
  systemBreakdown: SystemTiming[]
  spatialGrid: SpatialGridTelemetry
  hitDetection: {
    shotsThisSession: number
    hitsThisSession: number
    hitRate: number
  }
  gpu: GPUTelemetry
  terrainMerger?: TerrainMergerTelemetry
}

export type { GPUTelemetry, BenchmarkResult }
