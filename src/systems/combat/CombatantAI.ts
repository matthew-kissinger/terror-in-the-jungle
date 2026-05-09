import * as THREE from 'three'
import { Combatant, CombatantState, Faction, ITargetable, Squad, SquadCommand, isBlufor } from './types'
import type { ITerrainRuntime } from '../../types/SystemInterfaces'
import { SandbagSystem } from '../weapons/SandbagSystem'
import { SmokeCloudSystem } from '../effects/SmokeCloudSystem'
import { ISpatialQuery } from './SpatialOctree'
import type { IZoneQuery } from '../../types/SystemInterfaces'
import { TicketSystem } from '../world/TicketSystem'
import { AIStatePatrol } from './ai/AIStatePatrol'
import { AIStateEngage, type CloseEngagementTelemetry } from './ai/AIStateEngage'
import { AIStateMovement } from './ai/AIStateMovement'
import { AIStateDefend } from './ai/AIStateDefend'
import { AIStateRetreat } from './ai/AIStateRetreat'
import { AITargeting } from './ai/AITargeting'
import type { TargetAcquisitionTelemetry } from './ai/AITargetAcquisition'
import { AICoverSystem } from './ai/AICoverSystem'
import { AIFlankingSystem } from './ai/AIFlankingSystem'
import { UtilityScorer, DEFAULT_UTILITY_ACTIONS } from './ai/utility'

export type LosCallsiteName =
  | 'patrolDetection'
  | 'alertConfirmation'
  | 'engageSuppressionCheck'
  | 'advancingDetection'
  | 'seekingCoverValidation'
  | 'defendDetection'

export interface LosCallsiteTelemetryBucket {
  calls: number
  visible: number
  blocked: number
}

export type LosCallsiteTelemetry = Record<LosCallsiteName, LosCallsiteTelemetryBucket>

export interface AiUpdateBreakdown {
  combatantId: string
  stateAtStart: string
  stateAtEnd: string
  lodLevel: 'high' | 'medium'
  totalMs: number
  methodMs: Record<string, number>
  methodCounts: Record<string, number>
}

function createLosCallsiteTelemetry(): LosCallsiteTelemetry {
  return {
    patrolDetection: { calls: 0, visible: 0, blocked: 0 },
    alertConfirmation: { calls: 0, visible: 0, blocked: 0 },
    engageSuppressionCheck: { calls: 0, visible: 0, blocked: 0 },
    advancingDetection: { calls: 0, visible: 0, blocked: 0 },
    seekingCoverValidation: { calls: 0, visible: 0, blocked: 0 },
    defendDetection: { calls: 0, visible: 0, blocked: 0 }
  }
}

/**
 * Thin orchestrator for AI state machine - delegates to focused state handler modules
 */
export class CombatantAI {
  private MAX_ENGAGEMENT_RANGE = 150

  // State handler modules
  private patrolHandler: AIStatePatrol
  private engageHandler: AIStateEngage
  private movementHandler: AIStateMovement
  private defendHandler: AIStateDefend
  private retreatHandler: AIStateRetreat
  private targeting: AITargeting

  // Tactical systems
  private coverSystem: AICoverSystem
  private flankingSystem: AIFlankingSystem
  private ticketSystem?: TicketSystem
  private flankingUpdatedSquadsThisFrame: Set<string> = new Set()
  private losCallsiteTelemetry: LosCallsiteTelemetry = createLosCallsiteTelemetry()

  private readonly canSeeTargetForPatrolDetection = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('patrolDetection', combatant, target, playerPosition)

  private readonly canSeeTargetForAlertConfirmation = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('alertConfirmation', combatant, target, playerPosition)

  private readonly canSeeTargetForEngageSuppressionCheck = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('engageSuppressionCheck', combatant, target, playerPosition)

  private readonly canSeeTargetForAdvancingDetection = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('advancingDetection', combatant, target, playerPosition)

  private readonly canSeeTargetForSeekingCoverValidation = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('seekingCoverValidation', combatant, target, playerPosition)

  private readonly canSeeTargetForDefendDetection = (
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean => this.canSeeTargetForCallsite('defendDetection', combatant, target, playerPosition)

  private squads: Map<string, Squad> = new Map()
  private aiStateMs: Record<string, number> = {
    patrolling: 0,
    alert: 0,
    engaging: 0,
    suppressing: 0,
    advancing: 0,
    seeking_cover: 0,
    defending: 0,
    retreating: 0
  }
  private aiMethodMs: Record<string, number> = {}
  private aiMethodCounts: Record<string, number> = {}
  private aiMethodTotalCounts: Record<string, number> = {}
  private activeUpdateMethodMs: Record<string, number> | null = null
  private activeUpdateMethodCounts: Record<string, number> | null = null
  private lastUpdateBreakdown: AiUpdateBreakdown | null = null
  private slowestUpdateBreakdown: AiUpdateBreakdown | null = null

  // Proxy combatant reused by the utility-AI cover-bearing probe. Mutated in
  // place so the probe allocates nothing on the hot path.
  private _coverProbe: { position: THREE.Vector3 } = { position: new THREE.Vector3() }

  constructor() {
    this.patrolHandler = new AIStatePatrol()
    this.engageHandler = new AIStateEngage()
    this.movementHandler = new AIStateMovement()
    this.defendHandler = new AIStateDefend()
    this.retreatHandler = new AIStateRetreat()
    this.targeting = new AITargeting()
    this.coverSystem = new AICoverSystem()
    this.flankingSystem = new AIFlankingSystem()

    this.targeting.setMethodTimer((name, fn) => this.withAiMethodTiming(name, fn))

    // Wire tactical systems to engage handler
    this.engageHandler.setCoverSystem(this.coverSystem)
    this.engageHandler.setFlankingSystem(this.flankingSystem)
    this.engageHandler.setMethodTimer((name, fn) => this.withAiMethodTiming(name, fn))

    // Wire C1 utility-AI prototype. Factions opt in via
    // FACTION_COMBAT_TUNING[faction].useUtilityAI — currently only VC.
    // Leaving the probe unwired keeps fire-and-fade disabled for all
    // factions regardless of the flag (graceful no-op).
    this.engageHandler.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    this.engageHandler.setCoverBearingProbe((origin, bearingRad, radius) => {
      // Cheap directional cover check: ask AICoverSystem for the best cover
      // near a probe-tip in the away-from-threat bearing, capped to `radius`.
      // Returns true when a usable spot exists within that search radius.
      this._coverProbe.position.set(
        origin.x + Math.cos(bearingRad) * radius,
        origin.y,
        origin.z + Math.sin(bearingRad) * radius
      )
      const spot = this.coverSystem.findBestCover(
        this._coverProbe as Combatant,
        origin,
        new Map(),
        radius
      )
      return spot != null
    })
  }

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads
    this.patrolHandler.setSquads(squads)
    this.engageHandler.setSquads(squads)
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem
  }

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery,
    lodLevel: 'high' | 'medium' = 'high'
  ): void {
    // Stop AI updates if game is not active
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      return
    }

    const updateStart = performance.now()
    const stateAtStart = combatant.state
    const methodMs: Record<string, number> = {}
    const methodCounts: Record<string, number> = {}
    const previousActiveUpdateMethodMs = this.activeUpdateMethodMs
    const previousActiveUpdateMethodCounts = this.activeUpdateMethodCounts
    this.activeUpdateMethodMs = methodMs
    this.activeUpdateMethodCounts = methodCounts

    try {
    const isMediumLOD = lodLevel === 'medium'

    // Apply squad command overrides before state machine processing
    // At MEDIUM LOD, skip for non-player-controlled squads
    if (!isMediumLOD || this.isPlayerControlledSquad(combatant)) {
      this.withAiMethodTiming('squadCommandOverride', () => {
        this.applySquadCommandOverride(combatant, playerPosition)
      })
    }

    // Decay suppression effects over time
    this.withAiMethodTiming('suppressionDecay', () => {
      this.decaySuppressionEffects(combatant, deltaTime)
    })

    // Update flanking operations for squad members (skip at MEDIUM LOD)
    if (!isMediumLOD && combatant.squadId) {
      const operation = this.flankingSystem.getActiveOperation(combatant.squadId)
      if (operation && !this.flankingUpdatedSquadsThisFrame.has(combatant.squadId)) {
        const squad = this.squads.get(combatant.squadId)
        if (squad) {
          this.withAiMethodTiming('flankingOperation', () => {
            this.flankingSystem.updateFlankingOperation(operation, squad, allCombatants)
          })
          this.flankingUpdatedSquadsThisFrame.add(combatant.squadId)
        }
      }
    }

    const stateStart = performance.now()
    // Delegate to appropriate state handler
    switch (combatant.state) {
      case CombatantState.PATROLLING:
        this.withAiMethodTiming('state.patrolling', () => {
          this.patrolHandler.handlePatrolling(
            combatant,
            deltaTime,
            playerPosition,
            allCombatants,
            spatialGrid,
            (unit, playerPos, combatants, grid) =>
              this.withAiMethodTiming('patrol.findNearestEnemy', () =>
                this.findNearestEnemy(unit, playerPos, combatants, grid)
              ),
            (unit, target, playerPos) =>
              this.withAiMethodTiming('patrol.canSeeTarget', () =>
                this.canSeeTargetForPatrolDetection(unit, target, playerPos)
              ),
            (unit, distance) =>
              this.withAiMethodTiming('patrol.shouldEngage', () =>
                this.shouldEngage(unit, distance)
              ),
            (unit, combatants, grid) =>
              this.withAiMethodTiming('patrol.getClusterDensity', () =>
                this.getClusterDensity(unit, combatants, grid)
              )
          )
        })
        break

      case CombatantState.ALERT:
        this.withAiMethodTiming('state.alert', () => {
          this.engageHandler.handleAlert(
            combatant,
            deltaTime,
            playerPosition,
            this.canSeeTargetForAlertConfirmation
          )
        })
        break

      case CombatantState.ENGAGING:
        if (isMediumLOD) {
          // Simplified engagement: skip countNearbyEnemies, isCoverFlanked, suppression initiation
          this.withAiMethodTiming('state.engaging', () => {
            this.engageHandler.handleEngaging(
              combatant,
              deltaTime,
              playerPosition,
              allCombatants,
              spatialGrid,
              this.canSeeTargetForEngageSuppressionCheck,
              this.shouldSeekCoverMediumLOD.bind(this),
              this.findNearestCover.bind(this),
              this.countNearbyEnemiesNoop,
              this.isCoverFlankedNoop
            )
          })
        } else {
          this.withAiMethodTiming('state.engaging', () => {
            this.engageHandler.handleEngaging(
              combatant,
              deltaTime,
              playerPosition,
              allCombatants,
              spatialGrid,
              this.canSeeTargetForEngageSuppressionCheck,
              this.shouldSeekCover.bind(this),
              this.findNearestCover.bind(this),
              this.countNearbyEnemies.bind(this),
              this.isCoverFlanked.bind(this)
            )
          })
        }
        break

      case CombatantState.SUPPRESSING:
        this.withAiMethodTiming('state.suppressing', () => {
          this.engageHandler.handleSuppressing(combatant, deltaTime)
        })
        break

      case CombatantState.ADVANCING:
        this.withAiMethodTiming('state.advancing', () => {
          this.movementHandler.handleAdvancing(
            combatant,
            deltaTime,
            playerPosition,
            allCombatants,
            spatialGrid,
            this.findNearestEnemy.bind(this),
            this.canSeeTargetForAdvancingDetection
          )
        })
        break

      case CombatantState.SEEKING_COVER:
        this.withAiMethodTiming('state.seeking_cover', () => {
          this.movementHandler.handleSeekingCover(
            combatant,
            deltaTime,
            playerPosition,
            allCombatants,
            this.canSeeTargetForSeekingCoverValidation
          )
        })
        break

      case CombatantState.DEFENDING:
        this.withAiMethodTiming('state.defending', () => {
          this.defendHandler.handleDefending(
            combatant,
            deltaTime,
            playerPosition,
            allCombatants,
            spatialGrid,
            this.findNearestEnemy.bind(this),
            this.canSeeTargetForDefendDetection,
            this.getClusterDensity.bind(this)
          )
        })
        break

      case CombatantState.RETREATING: {
        // Threat anchor: prefer current target, fall back to the last-known
        // target position so the bearing-flip guard still fires if the
        // target was lost mid-retreat. If neither is known, fall back to
        // the player position (worst case, produces a stable bearing).
        const threatPos = combatant.target
          ? (combatant.target.id === 'PLAYER' ? playerPosition : combatant.target.position)
          : (combatant.lastKnownTargetPos ?? playerPosition)
        this.withAiMethodTiming('state.retreating', () => {
          this.retreatHandler.handleRetreating(combatant, deltaTime, threatPos)
        })
        break
      }
    }
    const stateDuration = performance.now() - stateStart
    const key = this.getStateTimingKey(stateAtStart)
    this.aiStateMs[key] = (this.aiStateMs[key] || 0) + stateDuration
    } finally {
      const totalMs = performance.now() - updateStart
      this.activeUpdateMethodMs = previousActiveUpdateMethodMs
      this.activeUpdateMethodCounts = previousActiveUpdateMethodCounts
      const breakdown: AiUpdateBreakdown = {
        combatantId: combatant.id,
        stateAtStart,
        stateAtEnd: combatant.state,
        lodLevel,
        totalMs,
        methodMs: { ...methodMs },
        methodCounts: { ...methodCounts }
      }
      this.lastUpdateBreakdown = breakdown
      if (!this.slowestUpdateBreakdown || totalMs > this.slowestUpdateBreakdown.totalMs) {
        this.slowestUpdateBreakdown = breakdown
      }
    }
  }

  beginFrame(): void {
    this.targeting.beginFrame()
    for (const key of Object.keys(this.aiStateMs)) {
      this.aiStateMs[key] = 0
    }
    this.aiMethodMs = {}
    this.aiMethodCounts = {}
    this.lastUpdateBreakdown = null
    this.slowestUpdateBreakdown = null
  }

  getFrameStateProfile(): Record<string, number> {
    return { ...this.aiStateMs }
  }

  getFrameMethodProfile(): Record<string, number> {
    return { ...this.aiMethodMs }
  }

  getFrameMethodCountProfile(): Record<string, number> {
    return { ...this.aiMethodCounts }
  }

  getMethodTotalCountProfile(): Record<string, number> {
    return { ...this.aiMethodTotalCounts }
  }

  getLastUpdateBreakdown(): AiUpdateBreakdown | null {
    return this.lastUpdateBreakdown
      ? {
          ...this.lastUpdateBreakdown,
          methodMs: { ...this.lastUpdateBreakdown.methodMs },
          methodCounts: { ...this.lastUpdateBreakdown.methodCounts }
        }
      : null
  }

  getSlowestUpdateBreakdown(): AiUpdateBreakdown | null {
    return this.slowestUpdateBreakdown
      ? {
          ...this.slowestUpdateBreakdown,
          methodMs: { ...this.slowestUpdateBreakdown.methodMs },
          methodCounts: { ...this.slowestUpdateBreakdown.methodCounts }
        }
      : null
  }

  getCloseEngagementTelemetry(): CloseEngagementTelemetry {
    return this.engageHandler.getCloseEngagementTelemetry()
  }

  getLosCallsiteTelemetry(): LosCallsiteTelemetry {
    return {
      patrolDetection: { ...this.losCallsiteTelemetry.patrolDetection },
      alertConfirmation: { ...this.losCallsiteTelemetry.alertConfirmation },
      engageSuppressionCheck: { ...this.losCallsiteTelemetry.engageSuppressionCheck },
      advancingDetection: { ...this.losCallsiteTelemetry.advancingDetection },
      seekingCoverValidation: { ...this.losCallsiteTelemetry.seekingCoverValidation },
      defendDetection: { ...this.losCallsiteTelemetry.defendDetection }
    }
  }

  resetLosCallsiteTelemetry(): void {
    this.losCallsiteTelemetry = createLosCallsiteTelemetry()
  }

  getTargetAcquisitionTelemetry(): TargetAcquisitionTelemetry {
    return this.targeting.getTargetAcquisitionTelemetry()
  }

  private getStateTimingKey(state: CombatantState): string {
    switch (state) {
      case CombatantState.PATROLLING: return 'patrolling'
      case CombatantState.ALERT: return 'alert'
      case CombatantState.ENGAGING: return 'engaging'
      case CombatantState.SUPPRESSING: return 'suppressing'
      case CombatantState.ADVANCING: return 'advancing'
      case CombatantState.SEEKING_COVER: return 'seeking_cover'
      case CombatantState.DEFENDING: return 'defending'
      case CombatantState.RETREATING: return 'retreating'
      default: return 'patrolling'
    }
  }

  private withAiMethodTiming<T>(name: string, fn: () => T): T {
    const start = performance.now()
    try {
      return fn()
    } finally {
      const duration = performance.now() - start
      this.aiMethodMs[name] = (this.aiMethodMs[name] || 0) + duration
      this.aiMethodCounts[name] = (this.aiMethodCounts[name] || 0) + 1
      this.aiMethodTotalCounts[name] = (this.aiMethodTotalCounts[name] || 0) + 1
      if (this.activeUpdateMethodMs) {
        this.activeUpdateMethodMs[name] = (this.activeUpdateMethodMs[name] || 0) + duration
      }
      if (this.activeUpdateMethodCounts) {
        this.activeUpdateMethodCounts[name] = (this.activeUpdateMethodCounts[name] || 0) + 1
      }
    }
  }

  /**
   * Check if a player-controlled squad's currentCommand should override the combatant's
   * current AI state. Only affects US faction combatants in player squads.
   *
   * - FOLLOW_ME / RETREAT: interrupt combat states (ENGAGING, SUPPRESSING, ALERT, SEEKING_COVER)
   * - HOLD_POSITION: transition non-combat states to DEFENDING (does NOT override active combat)
   * - PATROL_HERE / ATTACK_HERE: ensure non-combat states stay in PATROLLING (does NOT override active combat)
   * - FREE_ROAM / NONE: clear command-driven overrides, return to normal AI
   */
  private applySquadCommandOverride(combatant: Combatant, _playerPosition: THREE.Vector3): void {
    if (!isBlufor(combatant.faction)) return
    if (!combatant.squadId) return

    const squad = this.squads.get(combatant.squadId)
    if (!squad || !squad.isPlayerControlled) return

    const command = squad.currentCommand
    if (!command || command === SquadCommand.NONE) return

    // FREE_ROAM: clear any command-driven state overrides and let normal AI take over
    if (command === SquadCommand.FREE_ROAM) {
      // If combatant was forced into DEFENDING by HOLD_POSITION (no zone assignment),
      // transition back to PATROLLING so normal AI resumes
      if (combatant.state === CombatantState.DEFENDING && !combatant.defendingZoneId) {
        combatant.state = CombatantState.PATROLLING
        combatant.defensePosition = undefined
        combatant.destinationPoint = undefined
      }
      return
    }

    const isInCombat =
      combatant.state === CombatantState.ENGAGING ||
      combatant.state === CombatantState.SUPPRESSING ||
      combatant.state === CombatantState.ALERT ||
      combatant.state === CombatantState.SEEKING_COVER

    switch (command) {
      case SquadCommand.FOLLOW_ME:
      case SquadCommand.RETREAT:
        // These commands interrupt active combat - pull the combatant out
        if (isInCombat) {
          combatant.state = CombatantState.PATROLLING
          combatant.target = null
          combatant.inCover = false
          combatant.isFullAuto = false
          combatant.previousState = undefined
          combatant.suppressionTarget = undefined
          combatant.suppressionEndTime = undefined
        }
        // Also pull out of DEFENDING (e.g. from a prior HOLD_POSITION)
        if (combatant.state === CombatantState.DEFENDING) {
          combatant.state = CombatantState.PATROLLING
          combatant.defensePosition = undefined
          combatant.defendingZoneId = undefined
        }
        break

      case SquadCommand.HOLD_POSITION:
        // Does NOT interrupt active combat - only redirect non-combat states
        if (!isInCombat && combatant.state !== CombatantState.DEFENDING) {
          combatant.state = CombatantState.DEFENDING
          combatant.defensePosition = squad.commandPosition?.clone() ?? combatant.position.clone()
          combatant.destinationPoint = combatant.defensePosition.clone()
          // Clear zone-based defense ID so FREE_ROAM can unset this later
          combatant.defendingZoneId = undefined
        }
        break

      case SquadCommand.PATROL_HERE:
      case SquadCommand.ATTACK_HERE:
        // Does NOT interrupt active combat - ensure non-combat states are PATROLLING
        if (!isInCombat && combatant.state === CombatantState.DEFENDING) {
          combatant.state = CombatantState.PATROLLING
          combatant.defensePosition = undefined
          combatant.defendingZoneId = undefined
        }
        break
    }
  }

  private isPlayerControlledSquad(combatant: Combatant): boolean {
    if (!combatant.squadId) return false
    const squad = this.squads.get(combatant.squadId)
    return !!squad?.isPlayerControlled
  }

  /**
   * Simplified cover check for MEDIUM LOD: only seek cover if health is low.
   * Avoids expensive spatial queries and flanking evaluation.
   */
  private shouldSeekCoverMediumLOD(combatant: Combatant): boolean {
    if (combatant.inCover) return false
    return combatant.health < combatant.maxHealth * 0.4
  }

  // Noop stubs for MEDIUM LOD to avoid spatial grid queries
  private countNearbyEnemiesNoop = (): number => 0
  private isCoverFlankedNoop = (): boolean => false

  private decaySuppressionEffects(combatant: Combatant, deltaTime: number): void {
    if (combatant.lastSuppressedTime) {
      const timeSinceSuppressed = (Date.now() - combatant.lastSuppressedTime) / 1000
      if (timeSinceSuppressed > 3.0) {
        combatant.nearMissCount = Math.max(0, (combatant.nearMissCount || 0) - deltaTime * 0.5)
        if (combatant.nearMissCount <= 0) {
          combatant.nearMissCount = 0
          combatant.lastSuppressedTime = undefined
        }
      }
    }

    combatant.suppressionLevel = Math.max(0, combatant.suppressionLevel - deltaTime * 0.3)
  }

  // Public API methods delegated to targeting module
  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): ITargetable | null {
    return this.targeting.findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid)
  }

  canSeeTarget(
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean {
    return this.targeting.canSeeTarget(combatant, target, playerPosition)
  }

  private canSeeTargetForCallsite(
    callsite: LosCallsiteName,
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3
  ): boolean {
    const visible = this.canSeeTarget(combatant, target, playerPosition)
    const bucket = this.losCallsiteTelemetry[callsite]
    bucket.calls++
    if (visible) {
      bucket.visible++
    } else {
      bucket.blocked++
    }
    return visible
  }

  private shouldEngage(combatant: Combatant, distance: number): boolean {
    return this.targeting.shouldEngage(combatant, distance)
  }

  private countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    return this.targeting.countNearbyEnemies(combatant, radius, playerPosition, allCombatants, spatialGrid)
  }

  private shouldSeekCover(combatant: Combatant): boolean {
    return this.targeting.shouldSeekCover(combatant)
  }

  private getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    return this.targeting.getClusterDensity(combatant, allCombatants, spatialGrid)
  }

  private findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    return this.targeting.findNearestCover(combatant, threatPosition)
  }

  private isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    return this.targeting.isCoverFlanked(combatant, threatPos)
  }

  // Public squad suppression initiator (called from CombatantSystem)
  initiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>
  ): void {
    this.engageHandler.initiateSquadSuppression(
      combatant,
      targetPos,
      allCombatants,
      this.findNearestCover.bind(this)
    )
  }

  // Dependency injection
  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.targeting.setTerrainSystem(terrainSystem)
    this.coverSystem.setTerrainSystem(terrainSystem)
    this.flankingSystem.setTerrainSystem(terrainSystem)
  }

  setEngagementRange(range: number): void {
    this.MAX_ENGAGEMENT_RANGE = range
  }

  setPlayerFaction(faction: Faction): void {
    this.targeting.setPlayerFaction(faction)
  }

  getEngagementRange(): number {
    return this.MAX_ENGAGEMENT_RANGE
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.targeting.setSandbagSystem(sandbagSystem)
    this.coverSystem.setSandbagSystem(sandbagSystem)
  }

  setZoneManager(zoneQuery: IZoneQuery): void {
    this.patrolHandler.setZoneManager(zoneQuery)
    this.defendHandler.setZoneManager(zoneQuery)
  }

  setSmokeCloudSystem(smokeCloudSystem: SmokeCloudSystem): void {
    this.targeting.setSmokeCloudSystem(smokeCloudSystem)
  }

  // Expose tactical systems for state handlers
  getCoverSystem(): AICoverSystem {
    return this.coverSystem
  }

  getFlankingSystem(): AIFlankingSystem {
    return this.flankingSystem
  }

  // Periodic cleanup of tactical system caches
  updateTacticalSystems(allCombatants: Map<string, Combatant>): void {
    this.coverSystem.cleanupOccupation(allCombatants)
    this.flankingSystem.cleanupOperations(this.squads, allCombatants)
  }

  /**
   * Clear the LOS result cache. Call once per frame from the LOD manager.
   */
  clearLOSCache(): void {
    this.targeting.clearLOSCache()
    this.flankingUpdatedSquadsThisFrame.clear()
    this.coverSystem.beginFrame()
  }
}
