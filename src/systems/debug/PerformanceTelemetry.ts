import * as THREE from 'three'
import { GPUTimingTelemetry, GPUTelemetry } from './GPUTimingTelemetry'
import { PerformanceBenchmark, BenchmarkResult, BenchmarkDependencies } from './PerformanceBenchmark'
import { FrameTimingTracker } from './FrameTimingTracker'
import { Logger } from '../../utils/Logger'
import { isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics'
import {
  MovementArtifactEvent,
  MovementArtifactEventKind,
  MovementArtifactReport,
  MovementArtifactTrack,
  MovementArtifactTrackPoint,
  MovementIntentTelemetryKey,
  MovementTelemetry,
  SystemTiming,
  SpatialGridTelemetry,
  TelemetryReport,
  TerrainMergerTelemetry
} from './PerformanceTypes'

interface PlayerMovementAccumulator {
  samples: number
  groundedSamples: number
  uphillSamples: number
  downhillSamples: number
  blockedByTerrain: number
  slideSamples: number
  walkabilityTransitions: number
  pinnedAreaEvents: number
  pinnedSamples: number
  pinnedDurationSumMs: number
  maxPinnedDurationMs: number
  pinnedRadiusSum: number
  supportNormalYSum: number
  supportNormalDeltaSum: number
  requestedSpeedSum: number
  actualSpeedSum: number
}

interface NPCMovementAccumulator {
  samples: number
  contourActivations: number
  backtrackActivations: number
  arrivalCount: number
  lowProgressEvents: number
  pinnedAreaEvents: number
  pinnedSamples: number
  pinnedDurationSumMs: number
  maxPinnedDurationMs: number
  pinnedRadiusSum: number
  progressSum: number
  byIntent: Record<MovementIntentTelemetryKey, number>
  samplesByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
  lowProgressByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
  pinnedByLod: Record<'high' | 'medium' | 'low' | 'culled', number>
}

interface LocalAreaTracker {
  originX: number
  originZ: number
  lastX: number
  lastZ: number
  dwellMs: number
  maxRadiusSq: number
  pinned: boolean
}

interface SparseArtifactCell {
  x: number
  z: number
  count: number
}

interface TrackedNPCArtifactState {
  id: string
  lodLevel: 'high' | 'medium' | 'low' | 'culled'
  points: MovementArtifactTrackPoint[]
  occupancyCooldownMs: number
  trackCooldownMs: number
}

const PLAYER_PIN_RADIUS_SQ = 1.44
const PLAYER_PIN_RELEASE_RADIUS_SQ = 4.0
const NPC_PIN_RADIUS_SQ = 2.25
const NPC_PIN_RELEASE_RADIUS_SQ = 6.25
const PINNED_AREA_EVENT_MS = 1200
const MOVEMENT_ARTIFACT_CELL_SIZE = 24
const PLAYER_OCCUPANCY_SAMPLE_MS = 180
const PLAYER_TRACK_SAMPLE_MS = 220
const MAX_PLAYER_TRACK_POINTS = 1024
const MAX_TRACKED_NPCS = 12
const MAX_TRACKED_NPC_TRACK_POINTS = 96
const NPC_OCCUPANCY_SAMPLE_MS_BY_LOD: Record<'high' | 'medium' | 'low' | 'culled', number> = {
  high: 450,
  medium: 800,
  low: 1350,
  culled: 2000
}
const NPC_TRACK_SAMPLE_MS_BY_LOD: Record<'high' | 'medium' | 'low' | 'culled', number> = {
  high: 900,
  medium: 1400,
  low: 2200,
  culled: 2800
}

function createEmptyPlayerMovementAccumulator(): PlayerMovementAccumulator {
  return {
    samples: 0,
    groundedSamples: 0,
    uphillSamples: 0,
    downhillSamples: 0,
    blockedByTerrain: 0,
    slideSamples: 0,
    walkabilityTransitions: 0,
    pinnedAreaEvents: 0,
    pinnedSamples: 0,
    pinnedDurationSumMs: 0,
    maxPinnedDurationMs: 0,
    pinnedRadiusSum: 0,
    supportNormalYSum: 0,
    supportNormalDeltaSum: 0,
    requestedSpeedSum: 0,
    actualSpeedSum: 0
  }
}

function createEmptyNPCMovementAccumulator(): NPCMovementAccumulator {
  return {
    samples: 0,
    contourActivations: 0,
    backtrackActivations: 0,
    arrivalCount: 0,
    lowProgressEvents: 0,
    pinnedAreaEvents: 0,
    pinnedSamples: 0,
    pinnedDurationSumMs: 0,
    maxPinnedDurationMs: 0,
    pinnedRadiusSum: 0,
    progressSum: 0,
    byIntent: {
      route_follow: 0,
      direct_push: 0,
      contour: 0,
      flank_arc: 0,
      cover_hop: 0,
      backtrack: 0,
      hold: 0
    },
    samplesByLod: {
      high: 0,
      medium: 0,
      low: 0,
      culled: 0
    },
    lowProgressByLod: {
      high: 0,
      medium: 0,
      low: 0,
      culled: 0
    },
    pinnedByLod: {
      high: 0,
      medium: 0,
      low: 0,
      culled: 0
    }
  }
}

export class PerformanceTelemetry {
  private static instance: PerformanceTelemetry | null = null

  // Spatial grid telemetry (updated by SpatialGridManager)
  private spatialGridTelemetry: SpatialGridTelemetry = {
    initialized: false,
    entityCount: 0,
    queriesThisFrame: 0,
    avgQueryTimeMs: 0,
    fallbackCount: 0,
    lastSyncMs: 0
  }

  // Hit detection stats
  private hitDetectionStats = {
    shotsThisSession: 0,
    hitsThisSession: 0
  }

  // Terrain runtime telemetry (updated externally by terrain runtime integration)
  private terrainMergerTelemetry: TerrainMergerTelemetry | null = null

  private playerMovementTelemetry = createEmptyPlayerMovementAccumulator()
  private npcMovementTelemetry = createEmptyNPCMovementAccumulator()
  private playerAreaTracker: LocalAreaTracker | null = null
  private npcAreaTrackers = new Map<string, LocalAreaTracker>()
  private playerOccupancy = new Map<string, SparseArtifactCell>()
  private npcOccupancy = new Map<string, SparseArtifactCell>()
  private movementHotspots = new Map<string, MovementArtifactEvent>()
  private playerTrack: MovementArtifactTrackPoint[] = []
  private playerOccupancyCooldownMs = 0
  private playerTrackCooldownMs = 0
  private playerTerrainBlockedActive = false
  private npcOccupancyCooldowns = new Map<string, number>()
  private trackedNPCArtifacts = new Map<string, TrackedNPCArtifactState>()

  // Sub-modules
  private gpuTiming = new GPUTimingTelemetry()
  private benchmark = new PerformanceBenchmark()
  private frameTiming = new FrameTimingTracker()
  private enabled = this.resolveInitialEnabledState()

  private constructor() {
    // Expose to window only for harness/dev diagnostics.
    if (import.meta.env.DEV && typeof window !== 'undefined' && isPerfDiagnosticsEnabled()) {
      (window as any).perf = {
        report: () => this.getReport(),
        getMovement: () => this.getMovementTelemetry(),
        getMovementArtifacts: () => this.getMovementArtifacts(),
        validate: () => this.validate(),
        benchmark: (iterations: number = 1000) => this.runBenchmark(iterations),
        reset: () => this.reset()
      }
    }
  }

  static getInstance(): PerformanceTelemetry {
    if (!PerformanceTelemetry.instance) {
      PerformanceTelemetry.instance = new PerformanceTelemetry()
    }
    return PerformanceTelemetry.instance
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Inject dependencies required for benchmarking
   */
  injectBenchmarkDependencies(deps: BenchmarkDependencies): void {
    this.benchmark.injectDependencies(deps)
  }

  /**
   * Initialize GPU timing (call once with renderer)
   */
  initGPUTiming(renderer: THREE.WebGLRenderer): void {
    this.gpuTiming.init(renderer)
  }

  /**
   * Begin GPU timing measurement (call before renderer.render())
   */
  beginGPUTimer(): void {
    this.gpuTiming.beginTimer()
  }

  /**
   * End GPU timing measurement (call after renderer.render())
   */
  endGPUTimer(): void {
    this.gpuTiming.endTimer()
  }

  /**
   * Collect GPU timing result from previous frame (async, non-blocking)
   * Call once per frame after endGPUTimer()
   */
  collectGPUTime(): void {
    this.gpuTiming.collectTime()
  }

  /**
   * Get current GPU telemetry
   */
  getGPUTelemetry(): GPUTelemetry {
    return this.gpuTiming.getTelemetry()
  }

  /**
   * Call at the start of each frame
   */
  beginFrame(): void {
    if (!this.enabled) return
    this.frameTiming.beginFrame()
    // Reset per-frame counters
    this.spatialGridTelemetry.queriesThisFrame = 0
  }

  /**
   * Call before updating a system
   */
  beginSystem(name: string): void {
    if (!this.enabled) return
    this.frameTiming.beginSystem(name)
  }

  /**
   * Call after updating a system
   */
  endSystem(name: string): void {
    if (!this.enabled) return
    this.frameTiming.endSystem(name)
  }

  /**
   * Call at the end of each frame
   */
  endFrame(): void {
    if (!this.enabled) return
    this.frameTiming.endFrame()
  }

  /**
   * Set the budget for a specific system
   */
  setSystemBudget(name: string, budgetMs: number): void {
    if (!this.enabled) return
    this.frameTiming.setSystemBudget(name, budgetMs)
  }

  /**
   * Update spatial grid telemetry (called by SpatialGridManager)
   */
  updateSpatialGridTelemetry(telemetry: Partial<SpatialGridTelemetry>): void {
    Object.assign(this.spatialGridTelemetry, telemetry)
  }

  /**
   * Record a shot for hit detection stats
   */
  recordShot(hit: boolean): void {
    this.hitDetectionStats.shotsThisSession++
    if (hit) {
      this.hitDetectionStats.hitsThisSession++
    }
  }

  /**
   * Increment fallback counter (for when spatial grid can't be used)
   */
  recordFallback(): void {
    this.spatialGridTelemetry.fallbackCount++
  }

  /**
   * Update terrain merger telemetry (called by terrain runtime integration)
   */
  updateTerrainMergerTelemetry(telemetry: TerrainMergerTelemetry | null): void {
    this.terrainMergerTelemetry = telemetry
  }

  recordPlayerMovementSample(
    grounded: boolean,
    supportNormalY: number,
    supportNormalDelta: number,
    requestedSpeed: number,
    actualSpeed: number,
    grade: number,
    sliding: boolean,
    blockedByTerrain: boolean,
    walkabilityTransition: boolean,
    deltaTime: number,
    positionX: number,
    positionZ: number
  ): void {
    if (!this.enabled) return

    const player = this.playerMovementTelemetry
    player.samples++
    if (grounded) player.groundedSamples++
    if (grade > 0.02) player.uphillSamples++
    if (grade < -0.02) player.downhillSamples++
    if (sliding) player.slideSamples++
    if (blockedByTerrain) player.blockedByTerrain++
    if (walkabilityTransition) player.walkabilityTransitions++
    player.supportNormalYSum += supportNormalY
    player.supportNormalDeltaSum += supportNormalDelta
    player.requestedSpeedSum += requestedSpeed
    player.actualSpeedSum += actualSpeed

    const dwellUpdate = this.updateLocalAreaTracker(
      this.playerAreaTracker,
      deltaTime,
      positionX,
      positionZ,
      requestedSpeed > 0.1,
      PLAYER_PIN_RADIUS_SQ,
      PLAYER_PIN_RELEASE_RADIUS_SQ,
      player,
    )
    this.playerAreaTracker = dwellUpdate.tracker
    if (dwellUpdate.pinned) {
      player.pinnedSamples++
    }

    this.recordPlayerArtifacts(
      deltaTime,
      positionX,
      positionZ,
      requestedSpeed > 0.1 || actualSpeed > 0.15,
      blockedByTerrain,
      dwellUpdate.pinnedStarted,
    )
  }

  recordNPCMovementSample(
    id: string,
    lodLevel: 'high' | 'medium' | 'low' | 'culled',
    intent: MovementIntentTelemetryKey,
    progressDelta: number,
    lowProgress: boolean,
    contourActivated: boolean,
    backtrackActivated: boolean,
    arrived: boolean,
    deltaTime: number,
    positionX: number,
    positionZ: number,
    wantsMovement: boolean
  ): void {
    if (!this.enabled) return

    const npc = this.npcMovementTelemetry
    npc.samples++
    npc.progressSum += progressDelta
    npc.byIntent[intent] += 1
    npc.samplesByLod[lodLevel] += 1
    if (lowProgress) {
      npc.lowProgressEvents++
      npc.lowProgressByLod[lodLevel] += 1
    }
    if (contourActivated) npc.contourActivations++
    if (backtrackActivated) npc.backtrackActivations++
    if (arrived) npc.arrivalCount++

    const existingTracker = this.npcAreaTrackers.get(id) ?? null
    const dwellUpdate = this.updateLocalAreaTracker(
      existingTracker,
      deltaTime,
      positionX,
      positionZ,
      wantsMovement,
      NPC_PIN_RADIUS_SQ,
      NPC_PIN_RELEASE_RADIUS_SQ,
      npc,
    )
    if (dwellUpdate.tracker) {
      this.npcAreaTrackers.set(id, dwellUpdate.tracker)
    } else {
      this.npcAreaTrackers.delete(id)
    }
    if (dwellUpdate.pinned) {
      npc.pinnedSamples++
      npc.pinnedByLod[lodLevel] += 1
    }

    this.recordNPCArtifacts(
      id,
      lodLevel,
      intent,
      deltaTime,
      positionX,
      positionZ,
      wantsMovement,
      contourActivated,
      backtrackActivated,
      dwellUpdate.pinnedStarted,
      lowProgress,
    )
  }

  removeNPCMovementTracker(id: string): void {
    const tracker = this.npcAreaTrackers.get(id)
    if (tracker) {
      this.commitPinnedTracker(this.npcMovementTelemetry, tracker)
      this.npcAreaTrackers.delete(id)
    }
    this.npcOccupancyCooldowns.delete(id)
    this.trackedNPCArtifacts.delete(id)
  }

  /**
   * Get average frame time over history
   */
  getAvgFrameTime(): number {
    if (!this.enabled) return 16.67
    return this.frameTiming.getAvgFrameTime()
  }

  /**
   * Get percentage of frames over budget
   */
  getOverBudgetPercent(): number {
    if (!this.enabled) return 0
    return this.frameTiming.getOverBudgetPercent()
  }

  /**
   * Get system breakdown for display
   */
  getSystemBreakdown(): SystemTiming[] {
    if (!this.enabled) return []
    return this.frameTiming.getSystemBreakdown()
  }

  /**
   * Get full telemetry report
   */
  getReport(): TelemetryReport {
    const avgFrameMs = this.getAvgFrameTime()
    const report: TelemetryReport = {
      fps: avgFrameMs > 0 ? 1000 / avgFrameMs : 0,
      avgFrameMs,
      overBudgetPercent: this.getOverBudgetPercent(),
      systemBreakdown: this.getSystemBreakdown(),
      spatialGrid: { ...this.spatialGridTelemetry },
      hitDetection: {
        shotsThisSession: this.hitDetectionStats.shotsThisSession,
        hitsThisSession: this.hitDetectionStats.hitsThisSession,
        hitRate:
          this.hitDetectionStats.shotsThisSession > 0
            ? this.hitDetectionStats.hitsThisSession / this.hitDetectionStats.shotsThisSession
            : 0
      },
      gpu: this.getGPUTelemetry(),
      movement: this.getMovementTelemetry()
    }

    // Add terrain merger telemetry if available
    if (this.terrainMergerTelemetry) {
      report.terrainMerger = { ...this.terrainMergerTelemetry }
    }

    return report
  }

  /**
   * Validation check for debugging
   */
  validate(): {
    spatialGrid: { initialized: boolean; entityCount: number; fallbackCount: number }
    hitDetection: { shotsThisSession: number; hitsThisSession: number; hitRate: number }
    frameBudget: { avgMs: number; overBudgetPercent: number }
  } {
    return {
      spatialGrid: {
        initialized: this.spatialGridTelemetry.initialized,
        entityCount: this.spatialGridTelemetry.entityCount,
        fallbackCount: this.spatialGridTelemetry.fallbackCount
      },
      hitDetection: {
        shotsThisSession: this.hitDetectionStats.shotsThisSession,
        hitsThisSession: this.hitDetectionStats.hitsThisSession,
        hitRate:
          this.hitDetectionStats.shotsThisSession > 0
            ? this.hitDetectionStats.hitsThisSession / this.hitDetectionStats.shotsThisSession
            : 0
      },
      frameBudget: {
        avgMs: this.getAvgFrameTime(),
        overBudgetPercent: this.getOverBudgetPercent()
      }
    }
  }

  /**
   * Run a comprehensive benchmark for raycasting and hit detection
   */
  runBenchmark(iterations: number): BenchmarkResult {
    return this.benchmark.run(iterations)
  }

  getMovementTelemetry(): MovementTelemetry {
    const player = this.playerMovementTelemetry
    const npc = this.npcMovementTelemetry
    const playerPinnedSummary = this.getPinnedSummary(player, this.playerAreaTracker)
    const npcPinnedSummary = this.getPinnedSummary(npc, ...Array.from(this.npcAreaTrackers.values()))
    return {
      player: {
        samples: player.samples,
        groundedSamples: player.groundedSamples,
        uphillSamples: player.uphillSamples,
        downhillSamples: player.downhillSamples,
        blockedByTerrain: player.blockedByTerrain,
        slideSamples: player.slideSamples,
        walkabilityTransitions: player.walkabilityTransitions,
        pinnedAreaEvents: playerPinnedSummary.events,
        pinnedSamples: player.pinnedSamples,
        avgPinnedSeconds: playerPinnedSummary.avgSeconds,
        maxPinnedSeconds: playerPinnedSummary.maxSeconds,
        avgPinnedRadius: playerPinnedSummary.avgRadius,
        avgSupportNormalY: player.samples > 0 ? player.supportNormalYSum / player.samples : 1,
        avgSupportNormalDelta: player.samples > 0 ? player.supportNormalDeltaSum / player.samples : 0,
        avgRequestedSpeed: player.samples > 0 ? player.requestedSpeedSum / player.samples : 0,
        avgActualSpeed: player.samples > 0 ? player.actualSpeedSum / player.samples : 0
      },
      npc: {
        samples: npc.samples,
        contourActivations: npc.contourActivations,
        backtrackActivations: npc.backtrackActivations,
        arrivalCount: npc.arrivalCount,
        lowProgressEvents: npc.lowProgressEvents,
        pinnedAreaEvents: npcPinnedSummary.events,
        pinnedSamples: npc.pinnedSamples,
        avgPinnedSeconds: npcPinnedSummary.avgSeconds,
        maxPinnedSeconds: npcPinnedSummary.maxSeconds,
        avgPinnedRadius: npcPinnedSummary.avgRadius,
        avgProgressPerSample: npc.samples > 0 ? npc.progressSum / npc.samples : 0,
        byIntent: { ...npc.byIntent },
        samplesByLod: { ...npc.samplesByLod },
        lowProgressByLod: { ...npc.lowProgressByLod },
        pinnedByLod: { ...npc.pinnedByLod }
      }
    }
  }

  getMovementArtifacts(): MovementArtifactReport {
    return {
      cellSize: MOVEMENT_ARTIFACT_CELL_SIZE,
      playerOccupancy: Array.from(this.playerOccupancy.values())
        .sort((a, b) => b.count - a.count || a.x - b.x || a.z - b.z),
      npcOccupancy: Array.from(this.npcOccupancy.values())
        .sort((a, b) => b.count - a.count || a.x - b.x || a.z - b.z),
      hotspots: Array.from(this.movementHotspots.values())
        .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind) || a.x - b.x || a.z - b.z),
      tracks: [
        {
          id: 'player',
          subject: 'player',
          points: this.playerTrack.slice(),
        },
        ...Array.from(this.trackedNPCArtifacts.values())
          .filter((track) => track.points.length > 0)
          .map((track): MovementArtifactTrack => ({
            id: track.id,
            subject: 'npc',
            lodLevel: track.lodLevel,
            points: track.points.slice(),
          })),
      ],
    }
  }

  /**
   * Reset all telemetry data
   */
  reset(): void {
    this.frameTiming.reset()
    this.hitDetectionStats = { shotsThisSession: 0, hitsThisSession: 0 }
    this.spatialGridTelemetry = {
      initialized: false,
      entityCount: 0,
      queriesThisFrame: 0,
      avgQueryTimeMs: 0,
      fallbackCount: 0,
      lastSyncMs: 0
    }
    this.playerMovementTelemetry = createEmptyPlayerMovementAccumulator()
    this.npcMovementTelemetry = createEmptyNPCMovementAccumulator()
    this.playerAreaTracker = null
    this.npcAreaTrackers.clear()
    this.playerOccupancy.clear()
    this.npcOccupancy.clear()
    this.movementHotspots.clear()
    this.playerTrack = []
    this.playerOccupancyCooldownMs = 0
    this.playerTrackCooldownMs = 0
    this.playerTerrainBlockedActive = false
    this.npcOccupancyCooldowns.clear()
    this.trackedNPCArtifacts.clear()
    Logger.info('performance', '[Perf] Telemetry reset')
  }

  private updateLocalAreaTracker(
    tracker: LocalAreaTracker | null,
    deltaTime: number,
    positionX: number,
    positionZ: number,
    wantsMovement: boolean,
    pinRadiusSq: number,
    releaseRadiusSq: number,
    accumulator: PlayerMovementAccumulator | NPCMovementAccumulator,
  ): { tracker: LocalAreaTracker | null; pinned: boolean; pinnedStarted: boolean } {
    if (!wantsMovement || deltaTime <= 0) {
      if (tracker) {
        this.commitPinnedTracker(accumulator, tracker)
      }
      return { tracker: null, pinned: false, pinnedStarted: false }
    }

    const nextTracker = tracker ?? {
      originX: positionX,
      originZ: positionZ,
      lastX: positionX,
      lastZ: positionZ,
      dwellMs: 0,
      maxRadiusSq: 0,
      pinned: false,
    }

    const dxFromOrigin = positionX - nextTracker.originX
    const dzFromOrigin = positionZ - nextTracker.originZ
    const radiusSq = dxFromOrigin * dxFromOrigin + dzFromOrigin * dzFromOrigin

    if (radiusSq > releaseRadiusSq) {
      this.commitPinnedTracker(accumulator, nextTracker)
      nextTracker.originX = positionX
      nextTracker.originZ = positionZ
      nextTracker.lastX = positionX
      nextTracker.lastZ = positionZ
      nextTracker.dwellMs = 0
      nextTracker.maxRadiusSq = 0
      nextTracker.pinned = false
      return { tracker: nextTracker, pinned: false, pinnedStarted: false }
    }

    nextTracker.dwellMs += deltaTime * 1000
    nextTracker.maxRadiusSq = Math.max(nextTracker.maxRadiusSq, radiusSq)
    nextTracker.lastX = positionX
    nextTracker.lastZ = positionZ

    let pinnedStarted = false
    if (!nextTracker.pinned && nextTracker.dwellMs >= PINNED_AREA_EVENT_MS && radiusSq <= pinRadiusSq) {
      nextTracker.pinned = true
      pinnedStarted = true
      accumulator.pinnedAreaEvents++
    }

    return { tracker: nextTracker, pinned: nextTracker.pinned, pinnedStarted }
  }

  private recordPlayerArtifacts(
    deltaTime: number,
    x: number,
    z: number,
    wantsMovement: boolean,
    blockedByTerrain: boolean,
    pinnedStarted: boolean,
  ): void {
    if (pinnedStarted) {
      this.bumpHotspot('player_pinned', x, z)
    }
    if (blockedByTerrain && !this.playerTerrainBlockedActive) {
      this.bumpHotspot('terrain_blocked', x, z)
    }
    this.playerTerrainBlockedActive = blockedByTerrain

    if (!wantsMovement) {
      return
    }

    this.playerOccupancyCooldownMs -= deltaTime * 1000
    if (this.playerOccupancyCooldownMs <= 0) {
      this.bumpOccupancy(this.playerOccupancy, x, z)
      this.playerOccupancyCooldownMs = PLAYER_OCCUPANCY_SAMPLE_MS
    }

    this.playerTrackCooldownMs -= deltaTime * 1000
    if (this.playerTrackCooldownMs <= 0) {
      this.appendTrackPoint(this.playerTrack, x, z)
      this.playerTrackCooldownMs = PLAYER_TRACK_SAMPLE_MS
      if (this.playerTrack.length > MAX_PLAYER_TRACK_POINTS) {
        this.playerTrack.shift()
      }
    }
  }

  private recordNPCArtifacts(
    id: string,
    lodLevel: 'high' | 'medium' | 'low' | 'culled',
    intent: MovementIntentTelemetryKey,
    deltaTime: number,
    x: number,
    z: number,
    wantsMovement: boolean,
    contourActivated: boolean,
    backtrackActivated: boolean,
    pinnedStarted: boolean,
    lowProgress: boolean,
  ): void {
    if (pinnedStarted) {
      this.bumpHotspot('npc_pinned', x, z)
    }
    if (contourActivated) {
      this.bumpHotspot('npc_contour', x, z)
    }
    if (backtrackActivated) {
      this.bumpHotspot('npc_backtrack', x, z)
    }

    if (!wantsMovement) {
      return
    }

    const existing = this.trackedNPCArtifacts.get(id)
    if (existing) {
      existing.lodLevel = lodLevel
    }

    const trackState = existing ?? this.maybeTrackNPC(id, lodLevel, backtrackActivated || lowProgress || contourActivated)

    const occupancyCooldown = trackState
      ? trackState.occupancyCooldownMs
      : (this.npcOccupancyCooldowns.get(id) ?? 0)
    const nextOccupancyCooldown = occupancyCooldown - deltaTime * 1000
    if (nextOccupancyCooldown <= 0) {
      this.bumpOccupancy(this.npcOccupancy, x, z)
      if (trackState) {
        trackState.occupancyCooldownMs = NPC_OCCUPANCY_SAMPLE_MS_BY_LOD[lodLevel]
      } else {
        this.npcOccupancyCooldowns.set(id, NPC_OCCUPANCY_SAMPLE_MS_BY_LOD[lodLevel])
      }
    } else if (trackState) {
      trackState.occupancyCooldownMs = nextOccupancyCooldown
    } else {
      this.npcOccupancyCooldowns.set(id, nextOccupancyCooldown)
    }

    if (!trackState) {
      return
    }

    trackState.trackCooldownMs -= deltaTime * 1000
    if (trackState.trackCooldownMs <= 0) {
      this.appendTrackPoint(trackState.points, x, z, intent)
      trackState.trackCooldownMs = NPC_TRACK_SAMPLE_MS_BY_LOD[lodLevel]
      if (trackState.points.length > MAX_TRACKED_NPC_TRACK_POINTS) {
        trackState.points.shift()
      }
    }
  }

  private maybeTrackNPC(
    id: string,
    lodLevel: 'high' | 'medium' | 'low' | 'culled',
    forceTrack: boolean,
  ): TrackedNPCArtifactState | null {
    if (!forceTrack && lodLevel !== 'high' && lodLevel !== 'medium') {
      return null
    }
    if (this.trackedNPCArtifacts.size >= MAX_TRACKED_NPCS) {
      return null
    }

    const track: TrackedNPCArtifactState = {
      id,
      lodLevel,
      points: [],
      occupancyCooldownMs: 0,
      trackCooldownMs: 0,
    }
    this.trackedNPCArtifacts.set(id, track)
    return track
  }

  private bumpOccupancy(map: Map<string, SparseArtifactCell>, x: number, z: number): void {
    const cellX = Math.floor(x / MOVEMENT_ARTIFACT_CELL_SIZE)
    const cellZ = Math.floor(z / MOVEMENT_ARTIFACT_CELL_SIZE)
    const key = `${cellX}:${cellZ}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
      return
    }
    map.set(key, {
      x: (cellX + 0.5) * MOVEMENT_ARTIFACT_CELL_SIZE,
      z: (cellZ + 0.5) * MOVEMENT_ARTIFACT_CELL_SIZE,
      count: 1,
    })
  }

  private bumpHotspot(kind: MovementArtifactEventKind, x: number, z: number): void {
    const cellX = Math.floor(x / MOVEMENT_ARTIFACT_CELL_SIZE)
    const cellZ = Math.floor(z / MOVEMENT_ARTIFACT_CELL_SIZE)
    const key = `${kind}:${cellX}:${cellZ}`
    const existing = this.movementHotspots.get(key)
    if (existing) {
      existing.count++
      return
    }
    this.movementHotspots.set(key, {
      kind,
      x: (cellX + 0.5) * MOVEMENT_ARTIFACT_CELL_SIZE,
      z: (cellZ + 0.5) * MOVEMENT_ARTIFACT_CELL_SIZE,
      count: 1,
    })
  }

  private appendTrackPoint(
    points: MovementArtifactTrackPoint[],
    x: number,
    z: number,
    intent?: MovementIntentTelemetryKey,
  ): void {
    const previous = points[points.length - 1]
    if (previous) {
      const dx = x - previous.x
      const dz = z - previous.z
      if (dx * dx + dz * dz < 1) {
        return
      }
    }
    points.push({
      x,
      z,
      tMs: Math.round(performance.now()),
      intent,
    })
  }

  private commitPinnedTracker(
    accumulator: PlayerMovementAccumulator | NPCMovementAccumulator,
    tracker: LocalAreaTracker,
  ): void {
    if (!tracker.pinned) {
      return
    }
    accumulator.pinnedDurationSumMs += tracker.dwellMs
    accumulator.maxPinnedDurationMs = Math.max(accumulator.maxPinnedDurationMs, tracker.dwellMs)
    accumulator.pinnedRadiusSum += Math.sqrt(tracker.maxRadiusSq)
  }

  private getPinnedSummary(
    accumulator: PlayerMovementAccumulator | NPCMovementAccumulator,
    ...activeTrackers: Array<LocalAreaTracker | null | undefined>
  ): { events: number; avgSeconds: number; maxSeconds: number; avgRadius: number } {
    let durationSumMs = accumulator.pinnedDurationSumMs
    let maxDurationMs = accumulator.maxPinnedDurationMs
    let radiusSum = accumulator.pinnedRadiusSum

    for (const tracker of activeTrackers) {
      if (!tracker?.pinned) {
        continue
      }
      durationSumMs += tracker.dwellMs
      maxDurationMs = Math.max(maxDurationMs, tracker.dwellMs)
      radiusSum += Math.sqrt(tracker.maxRadiusSq)
    }

    const events = accumulator.pinnedAreaEvents
    return {
      events,
      avgSeconds: events > 0 ? durationSumMs / events / 1000 : 0,
      maxSeconds: maxDurationMs / 1000,
      avgRadius: events > 0 ? radiusSum / events : 0,
    }
  }

  private resolveInitialEnabledState(): boolean {
    if (!import.meta.env.DEV) {
      return false
    }
    return isPerfDiagnosticsEnabled()
  }

  /**
   * Get formatted string for debug overlay
   */
  getDebugString(): string {
    const report = this.getReport()
    const lines = [
      `FPS: ${report.fps.toFixed(0)} | Frame: ${report.avgFrameMs.toFixed(1)}ms | Over: ${report.overBudgetPercent.toFixed(1)}%`,
      `Grid: ${this.spatialGridTelemetry.initialized ? 'OK' : 'UNINIT'} | Entities: ${this.spatialGridTelemetry.entityCount} | Fallbacks: ${this.spatialGridTelemetry.fallbackCount}`,
      `Shots: ${this.hitDetectionStats.shotsThisSession} | Hits: ${this.hitDetectionStats.hitsThisSession} | Rate: ${(report.hitDetection.hitRate * 100).toFixed(0)}%`
    ]

    // Add top 3 heaviest systems
    const topSystems = report.systemBreakdown.slice(0, 3)
    if (topSystems.length > 0) {
      const sysStr = topSystems.map(s => `${s.name}: ${s.emaMs.toFixed(1)}ms`).join(' | ')
      lines.push(sysStr)
    }

    return lines.join('\n')
  }
}

// Export singleton getter
export const performanceTelemetry = PerformanceTelemetry.getInstance()
