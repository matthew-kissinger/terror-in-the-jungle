import * as THREE from 'three'
import { Combatant, CombatantState, Squad } from './types'
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager'
import { SandbagSystem } from '../weapons/SandbagSystem'
import { SpatialOctree } from './SpatialOctree'
import { ZoneManager } from '../world/ZoneManager'
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
  private readonly MAX_ENGAGEMENT_RANGE = 150

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
  private lastStateById: Map<string, CombatantState> = new Map()

  private squads: Map<string, Squad> = new Map()

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

  updateAI(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): void {
    const lastState = this.lastStateById.get(combatant.id) ?? combatant.state

    // Decay suppression effects over time
    this.decaySuppressionEffects(combatant, deltaTime)

    // Update flanking operations for squad members
    if (combatant.squadId) {
      const operation = this.flankingSystem.getActiveOperation(combatant.squadId)
      if (operation) {
        const squad = this.squads.get(combatant.squadId)
        if (squad) {
          this.flankingSystem.updateFlankingOperation(operation, squad, allCombatants)
        }
      }
    }

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

    this.maybeTriggerMovementCallout(combatant, lastState)
    this.lastStateById.set(combatant.id, combatant.state)
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

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.targeting.setSandbagSystem(sandbagSystem)
    this.coverSystem.setSandbagSystem(sandbagSystem)
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.patrolHandler.setZoneManager(zoneManager)
    this.defendHandler.setZoneManager(zoneManager)
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
}
