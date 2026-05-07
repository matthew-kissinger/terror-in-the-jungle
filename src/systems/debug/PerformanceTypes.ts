import { GPUTelemetry } from './GPUTimingTelemetry'

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

export type MovementIntentTelemetryKey =
  | 'route_follow'
  | 'direct_push'
  | 'contour'
  | 'flank_arc'
  | 'cover_hop'
  | 'backtrack'
  | 'hold'

export interface PlayerMovementTelemetry {
  samples: number
  groundedSamples: number
  uphillSamples: number
  downhillSamples: number
  blockedByTerrain: number
  slideSamples: number
  walkabilityTransitions: number
  pinnedAreaEvents: number
  pinnedSamples: number
  avgPinnedSeconds: number
  maxPinnedSeconds: number
  avgPinnedRadius: number
  avgSupportNormalY: number
  avgSupportNormalDelta: number
  avgRequestedSpeed: number
  avgActualSpeed: number
}

export interface NPCMovementTelemetry {
  samples: number
  contourActivations: number
  backtrackActivations: number
  arrivalCount: number
  lowProgressEvents: number
  pinnedAreaEvents: number
  pinnedSamples: number
  avgPinnedSeconds: number
  maxPinnedSeconds: number
  avgPinnedRadius: number
  avgProgressPerSample: number
  byIntent: Record<MovementIntentTelemetryKey, number>
  samplesByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
  lowProgressByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
  pinnedByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
}

export interface MovementTelemetry {
  player: PlayerMovementTelemetry
  npc: NPCMovementTelemetry
}

export type MovementArtifactEventKind =
  | 'player_pinned'
  | 'terrain_blocked'
  | 'npc_pinned'
  | 'npc_backtrack'
  | 'npc_contour'

export interface MovementArtifactCell {
  x: number
  z: number
  count: number
}

export interface MovementArtifactEvent {
  kind: MovementArtifactEventKind
  x: number
  z: number
  count: number
}

export interface MovementArtifactTrackPoint {
  x: number
  z: number
  tMs: number
  intent?: MovementIntentTelemetryKey
  requestedSpeed?: number
  actualSpeed?: number
  wantsMovement?: boolean
  blockedByTerrain?: boolean
}

export interface MovementArtifactTrack {
  id: string
  subject: 'player' | 'npc'
  lodLevel?: 'high' | 'medium' | 'low' | 'culled'
  points: MovementArtifactTrackPoint[]
}

export interface MovementArtifactReport {
  cellSize: number
  playerOccupancy: MovementArtifactCell[]
  npcOccupancy: MovementArtifactCell[]
  hotspots: MovementArtifactEvent[]
  tracks: MovementArtifactTrack[]
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
  movement: MovementTelemetry
  terrainMerger?: TerrainMergerTelemetry
}

export type { GPUTelemetry }
