import * as THREE from 'three'
import { Combatant, CombatantState, Faction, Squad, SquadCommand } from './types'
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager'
import { SandbagSystem } from '../weapons/SandbagSystem'
import { SmokeCloudSystem } from '../effects/SmokeCloudSystem'
import { SpatialOctree } from './SpatialOctree'
import { ZoneManager } from '../world/ZoneManager'
import { TicketSystem } from '../world/TicketSystem'
import { AIStatePatrol } from './ai/AIStatePatrol'
import { AIStateEngage } from './ai/AIStateEngage'
import { AIStateMovement } from './ai/AIStateMovement'
import { AIStateDefend } from './ai/AIStateDefend'
import { AITargeting } from './ai/AITargeting'
import { AICoverSystem } from './ai/AICoverSystem'
import { AIFlankingSystem } from './ai/AIFlankingSystem'
import { VoiceCalloutSystem, CalloutType } from '../audio/VoiceCalloutSystem'

/**
 * Thin orchestrator for AI state machine - delegates to focused state handler modules
 */
export class CombatantAI {
  private readonly FRIENDLY_FIRE_ENABLED = false
  private MAX_ENGAGEMENT_RANGE = 150

  // State handler modules
  private patrolHandler: AIStatePatrol
  private engageHandler: AIStateEngage
  private movementHandler: AIStateMovement
  private defendHandler: AIStateDefend
  private targeting: AITargeting

  // Tactical systems
  private coverSystem: AICoverSystem
  private flankingSystem: AIFlankingSystem
  private voiceCalloutSystem?: VoiceCalloutSystem
  private ticketSystem?: TicketSystem
  private lastStateById: Map<string, CombatantState> = new Map()
  private flankingUpdatedSquadsThisFrame: Set<string> = new Set()

  private squads: Map<string, Squad> = new Map()
  private aiStateMs: Record<string, number> = {
    patrolling: 0,
    alert: 0,
    engaging: 0,
    suppressing: 0,
    advancing: 0,
    seeking_cover: 0,
    defending: 0
  }

  constructor() {
    this.patrolHandler = new AIStatePatrol()
    this.engageHandler = new AIStateEngage()
    this.movementHandler = new AIStateMovement()
    this.defendHandler = new AIStateDefend()
    this.targeting = new AITargeting()
    this.coverSystem = new AICoverSystem()
    this.flankingSystem = new AIFlankingSystem()

    // Wire tactical systems to engage handler
    this.engageHandler.setCoverSystem(this.coverSystem)
    this.engageHandler.setFlankingSystem(this.flankingSystem)
  }

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads
    this.patrolHandler.setSquads(squads)
    this.engageHandler.setSquads(squads)
  }

  setVoiceCalloutSystem(system: VoiceCalloutSystem): void {
    this.voiceCalloutSystem = system
    this.movementHandler.setVoiceCalloutSystem(system)
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem
  }

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    // Stop AI updates if game is not active
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) {
      return
    }

    const lastState = this.lastStateById.get(combatant.id) ?? combatant.state

    // Apply squad command overrides before state machine processing
    this.applySquadCommandOverride(combatant, playerPosition)

    // Decay suppression effects over time
    this.decaySuppressionEffects(combatant, deltaTime)

    // Update flanking operations for squad members
    if (combatant.squadId) {
      const operation = this.flankingSystem.getActiveOperation(combatant.squadId)
      if (operation && !this.flankingUpdatedSquadsThisFrame.has(combatant.squadId)) {
        const squad = this.squads.get(combatant.squadId)
        if (squad) {
          this.flankingSystem.updateFlankingOperation(operation, squad, allCombatants)
          this.flankingUpdatedSquadsThisFrame.add(combatant.squadId)
        }
      }
    }

    const stateAtStart = combatant.state
    const stateStart = performance.now()
    // Delegate to appropriate state handler
    switch (combatant.state) {
      case CombatantState.PATROLLING:
        this.patrolHandler.handlePatrolling(
          combatant,
          deltaTime,
          playerPosition,
          allCombatants,
          spatialGrid,
          this.findNearestEnemy.bind(this),
          this.canSeeTarget.bind(this),
          this.shouldEngage.bind(this)
        )
        break

      case CombatantState.ALERT:
        this.engageHandler.handleAlert(
          combatant,
          deltaTime,
          playerPosition,
          this.canSeeTarget.bind(this)
        )
        break

      case CombatantState.ENGAGING:
        this.engageHandler.handleEngaging(
          combatant,
          deltaTime,
          playerPosition,
          allCombatants,
          spatialGrid,
          this.canSeeTarget.bind(this),
          this.shouldSeekCover.bind(this),
          this.findNearestCover.bind(this),
          this.countNearbyEnemies.bind(this),
          this.isCoverFlanked.bind(this)
        )
        break

      case CombatantState.SUPPRESSING:
        this.engageHandler.handleSuppressing(combatant, deltaTime)
        break

      case CombatantState.ADVANCING:
        this.movementHandler.handleAdvancing(
          combatant,
          deltaTime,
          playerPosition,
          allCombatants,
          spatialGrid,
          this.findNearestEnemy.bind(this),
          this.canSeeTarget.bind(this)
        )
        break

      case CombatantState.SEEKING_COVER:
        this.movementHandler.handleSeekingCover(
          combatant,
          deltaTime,
          playerPosition,
          allCombatants,
          this.canSeeTarget.bind(this)
        )
        break

      case CombatantState.DEFENDING:
        this.defendHandler.handleDefending(
          combatant,
          deltaTime,
          playerPosition,
          allCombatants,
          spatialGrid,
          this.findNearestEnemy.bind(this),
          this.canSeeTarget.bind(this)
        )
        break
    }
    const stateDuration = performance.now() - stateStart
    const key = this.getStateTimingKey(stateAtStart)
    this.aiStateMs[key] = (this.aiStateMs[key] || 0) + stateDuration

    this.maybeTriggerMovementCallout(combatant, lastState)
    this.lastStateById.set(combatant.id, combatant.state)
  }

  beginFrame(): void {
    for (const key of Object.keys(this.aiStateMs)) {
      this.aiStateMs[key] = 0
    }
  }

  getFrameStateProfile(): Record<string, number> {
    return { ...this.aiStateMs }
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
      default: return 'patrolling'
    }
  }

  /**
   * Check if a player-controlled squad's currentCommand should override the combatant's
   * current AI state. Only affects US faction combatants in player squads.
   *
   * - FOLLOW_ME / RETREAT: interrupt combat states (ENGAGING, SUPPRESSING, ALERT, SEEKING_COVER)
   * - HOLD_POSITION: transition non-combat states to DEFENDING (does NOT override active combat)
   * - PATROL_HERE: ensure non-combat states stay in PATROLLING (does NOT override active combat)
   * - FREE_ROAM / NONE: clear command-driven overrides, return to normal AI
   */
  private applySquadCommandOverride(combatant: Combatant, _playerPosition: THREE.Vector3): void {
    // Only affect US faction (player's team)
    if (combatant.faction !== Faction.US) return
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
        // Does NOT interrupt active combat - ensure non-combat states are PATROLLING
        if (!isInCombat && combatant.state === CombatantState.DEFENDING) {
          combatant.state = CombatantState.PATROLLING
          combatant.defensePosition = undefined
          combatant.defendingZoneId = undefined
        }
        break
    }
  }

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
    spatialGrid?: SpatialOctree
  ): Combatant | null {
    return this.targeting.findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid)
  }

  canSeeTarget(
    combatant: Combatant,
    target: Combatant,
    playerPosition: THREE.Vector3
  ): boolean {
    return this.targeting.canSeeTarget(combatant, target, playerPosition)
  }

  private shouldEngage(combatant: Combatant, distance: number): boolean {
    return this.targeting.shouldEngage(combatant, distance)
  }

  private countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): number {
    return this.targeting.countNearbyEnemies(combatant, radius, playerPosition, allCombatants, spatialGrid)
  }

  private shouldSeekCover(combatant: Combatant): boolean {
    return this.targeting.shouldSeekCover(combatant)
  }

  private findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    return this.targeting.findNearestCover(combatant, threatPosition)
  }

  private isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    return this.targeting.isCoverFlanked(combatant, threatPos)
  }

  private maybeTriggerMovementCallout(combatant: Combatant, previousState: CombatantState): void {
    if (!this.voiceCalloutSystem) return
    if (combatant.state === CombatantState.DEAD) return
    if (combatant.state !== CombatantState.ADVANCING && combatant.state !== CombatantState.RETREATING) return
    if (combatant.state === previousState) return
    if (Math.random() >= 0.2) return

    this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.MOVING, combatant.position)
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
  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.targeting.setChunkManager(chunkManager)
    this.coverSystem.setChunkManager(chunkManager)
    this.flankingSystem.setChunkManager(chunkManager)
  }

  setEngagementRange(range: number): void {
    this.MAX_ENGAGEMENT_RANGE = range
  }

  getEngagementRange(): number {
    return this.MAX_ENGAGEMENT_RANGE
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.targeting.setSandbagSystem(sandbagSystem)
    this.coverSystem.setSandbagSystem(sandbagSystem)
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.patrolHandler.setZoneManager(zoneManager)
    this.defendHandler.setZoneManager(zoneManager)
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
