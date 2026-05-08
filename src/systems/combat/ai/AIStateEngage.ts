import * as THREE from 'three'
import { Combatant, CombatantState, ITargetable, Squad, isOpfor, isPlayerTarget, isTargetAlive } from '../types'
import { ISpatialQuery } from '../SpatialOctree'
import { AICoverSystem } from './AICoverSystem'
import { AIFlankingSystem } from './AIFlankingSystem'
import { Logger } from '../../../utils/Logger'
import { getFactionCombatTuning } from '../../../config/FactionCombatTuning'
import { UtilityScorer, UtilityContext } from './utility'
import { SeededRandom } from '../../../core/SeededRandom'

const _toTarget = new THREE.Vector3()
const _flankingPos = new THREE.Vector3()
const _toAttacker = new THREE.Vector3()

// ── Engagement thresholds ──
const CLOSE_RANGE_DISTANCE = 15
const CLOSE_RANGE_BURST = 8
const CLOSE_RANGE_PAUSE_MS = 200
const PANIC_HIT_WINDOW = 2.0 // seconds since last hit
const PANIC_INCREMENT = 0.3
const PANIC_BURST = 10
const PANIC_PAUSE_MS = 150
const PANIC_DECAY_RATE = 0.2
const NEARBY_ENEMY_RADIUS = 20
const NEARBY_ENEMY_BURST_THRESHOLD = 2
const NEARBY_ENEMY_BURST = 6

// ── Cover behavior ──
const COVER_BURST_LENGTH = 2
const COVER_BURST_PAUSE_MS = 1500
const UTILITY_COVER_REPATH_COOLDOWN_MS = 3000

// ── Suppression ──
const SUPPRESSION_BURST = 12
const SUPPRESSION_PAUSE_MS = 100
const SUPPRESSION_ALERT_TIMER = 5.0
const SUPPRESSION_FIRE_BURST = 8
const SUPPRESSION_FIRE_PAUSE_MS = 150
const SUPPRESSION_BASE_DURATION_MS = 3000
const SUPPRESSION_JITTER_MS = 2000
const SUPPRESSION_COOLDOWN_MS = 10000
const SUPPRESSION_VISIBILITY_RECHECK_MS = 250

// ── Squad suppression initiation ──
const SQUAD_MIN_SIZE_FOR_SUPPRESSION = 3
const SUPPRESSION_MIN_DISTANCE = 30
const SUPPRESSION_MAX_DISTANCE = 80
const SUPPRESSION_ENEMY_SCAN_RADIUS = 40
const SUPPRESSION_HEALTH_THRESHOLD = 0.4

// ── Flanking ──
const FLANK_BASE_DISTANCE = 25
const FLANK_DISTANCE_JITTER = 15

export interface CloseEngagementTelemetry {
  closeRangeFullAutoActivations: number
  nearbyEnemyBurstTriggers: number
  suppressionTransitions: number
  nearbyEnemyCountSamples: number
  nearbyEnemyCountTotal: number
  nearbyEnemyCountMax: number
  suppressionFlankDestinationComputations: number
  suppressionFlankCoverSearches: number
  suppressionFlankCoverSearchReuseSkips: number
  suppressionFlankCoverSearchCapSkips: number
  targetDistanceBuckets: {
    lt5m: number
    m5to10: number
    m10to15: number
    m15to30: number
    gte30: number
  }
}

interface SuppressionVisibilitySample {
  targetId: string
  checkedAtMs: number
  visible: boolean
}

type EngageMethodTimer = <T>(name: string, fn: () => T) => T

function createCloseEngagementTelemetry(): CloseEngagementTelemetry {
  return {
    closeRangeFullAutoActivations: 0,
    nearbyEnemyBurstTriggers: 0,
    suppressionTransitions: 0,
    nearbyEnemyCountSamples: 0,
    nearbyEnemyCountTotal: 0,
    nearbyEnemyCountMax: 0,
    suppressionFlankDestinationComputations: 0,
    suppressionFlankCoverSearches: 0,
    suppressionFlankCoverSearchReuseSkips: 0,
    suppressionFlankCoverSearchCapSkips: 0,
    targetDistanceBuckets: {
      lt5m: 0,
      m5to10: 0,
      m10to15: 0,
      m15to30: 0,
      gte30: 0
    }
  }
}

/**
 * Handles engaging and suppressing combat states
 */
export class AIStateEngage {
  private readonly MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2
  private readonly FLANK_DESTINATION_REUSE_RADIUS_SQ = 12 * 12
  private squads: Map<string, Squad> = new Map()
  private squadSuppressionCooldown: Map<string, number> = new Map()
  private coverSystem?: AICoverSystem
  private flankingSystem?: AIFlankingSystem
  private utilityScorer?: UtilityScorer
  // Caller-supplied: does terrain afford cover in `bearingRad` (radians)
  // within `radius` of `origin`? Left undefined when no terrain query is
  // wired — utility actions that depend on it will simply score 0.
  private hasCoverInBearing?: (origin: THREE.Vector3, bearingRad: number, radius: number) => boolean
  // Scratch UtilityContext reused across every handleEngaging() call. The
  // scorer reads fields synchronously and does not retain references, so a
  // single instance is safe. Writable fields are reassigned per tick below;
  // unused optional fields are reset to undefined so stale values from a
  // previous combatant cannot leak.
  private readonly scratchContext: {
    self: Combatant | null
    threatPosition: THREE.Vector3
    squad: Squad | undefined
    squadSuppression: number | undefined
    hasCoverInBearing: ((bearingRad: number, radius: number) => boolean) | undefined
    supportAvailable: boolean | undefined
    ammoReserve: number | undefined
    squadCohesion: number | undefined
    coverQualityHere: number | undefined
    objectiveProximity: number | undefined
  } = {
    self: null,
    threatPosition: new THREE.Vector3(),
    squad: undefined,
    squadSuppression: undefined,
    hasCoverInBearing: undefined,
    supportAvailable: undefined,
    ammoReserve: undefined,
    squadCohesion: undefined,
    coverQualityHere: undefined,
    objectiveProximity: undefined,
  }
  // The combatant whose position the cached scratchCoverProbe is currently
  // bound to. When it changes, we rebuild the closure; otherwise the closure
  // is reused across ticks so utility actions don't allocate when they
  // consult ctx.hasCoverInBearing.
  private scratchProbeBoundTo: Combatant | null = null
  private scratchCoverProbe: ((bearingRad: number, radius: number) => boolean) | undefined
  private telemetry: CloseEngagementTelemetry = createCloseEngagementTelemetry()
  private suppressionVisibilityByCombatant = new WeakMap<Combatant, SuppressionVisibilitySample>()
  private methodTimer?: EngageMethodTimer

  setSquads(squads: Map<string, Squad>): void {
    this.squads = squads
  }

  setCoverSystem(coverSystem: AICoverSystem): void {
    this.coverSystem = coverSystem
  }

  setFlankingSystem(flankingSystem: AIFlankingSystem): void {
    this.flankingSystem = flankingSystem
  }

  /**
   * Opt-in utility-AI scorer. When set, factions with useUtilityAI=true get
   * a pre-pass each tick that may route them into SEEKING_COVER (fire-and-fade)
   * before the default engage ladder runs. Leaving this unset makes the
   * behavior a pure no-op for all factions.
   */
  setUtilityScorer(scorer: UtilityScorer): void {
    this.utilityScorer = scorer
  }

  /**
   * Opt-in terrain predicate for utility actions that need directional
   * cover queries. When unset, fire-and-fade cannot score > 0.
   */
  setCoverBearingProbe(
    probe: (origin: THREE.Vector3, bearingRad: number, radius: number) => boolean
  ): void {
    this.hasCoverInBearing = probe
  }

  getCloseEngagementTelemetry(): CloseEngagementTelemetry {
    return {
      ...this.telemetry,
      targetDistanceBuckets: { ...this.telemetry.targetDistanceBuckets }
    }
  }

  resetCloseEngagementTelemetry(): void {
    this.telemetry = createCloseEngagementTelemetry()
  }

  setMethodTimer(timer: EngageMethodTimer | undefined): void {
    this.methodTimer = timer
  }

  handleEngaging(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: ISpatialQuery | undefined,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean,
    shouldSeekCover: (combatant: Combatant) => boolean,
    findNearestCover: (combatant: Combatant, threatPosition: THREE.Vector3) => THREE.Vector3 | null,
    countNearbyEnemies: (
      combatant: Combatant,
      radius: number,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => number,
    isCoverFlanked: (combatant: Combatant, threatPos: THREE.Vector3) => boolean
  ): void {
    const target = combatant.target
    if (!target || !isTargetAlive(target)) {
      combatant.state = combatant.previousState === CombatantState.DEFENDING ?
        CombatantState.DEFENDING : CombatantState.PATROLLING
      combatant.target = null
      combatant.isFullAuto = false
      combatant.previousState = undefined
      combatant.inCover = false
      // Release cover when disengaging
      if (this.coverSystem) {
        this.coverSystem.releaseCover(combatant.id)
      }
      return
    }

    const targetPos = isPlayerTarget(target) ? playerPosition : target.position
    const toTargetDir = _toTarget.subVectors(targetPos, combatant.position).normalize()
    combatant.rotation = Math.atan2(toTargetDir.z, toTargetDir.x)

    const targetDistance = combatant.position.distanceTo(targetPos)
    combatant.isFullAuto = false
    this.recordTargetDistance(targetDistance)

    // Peek-and-fire behavior when in cover
    if (combatant.inCover) {
      combatant.skillProfile.burstLength = COVER_BURST_LENGTH
      combatant.skillProfile.burstPauseMs = COVER_BURST_PAUSE_MS

      // Use improved cover evaluation
      if (this.coverSystem && combatant.coverPosition) {
        const coverEval = this.measureEngageMethod('engage.cover.evaluateCurrentCover', () =>
          this.coverSystem!.evaluateCurrentCover(combatant, targetPos)
        )
        if (!coverEval.effective) {
          Logger.warn('combat-ai', ` ${combatant.faction} unit's cover is compromised, repositioning`)
          this.coverSystem.releaseCover(combatant.id)
          combatant.inCover = false
          combatant.coverPosition = undefined

          // Immediately seek new cover if should reposition
          if (coverEval.shouldReposition && targetDistance >= CLOSE_RANGE_DISTANCE) {
            const newCover = this.measureEngageMethod('engage.cover.findBestCover', () =>
              this.coverSystem!.findBestCover(combatant, targetPos, allCombatants)
            )
            if (newCover) {
              combatant.state = CombatantState.SEEKING_COVER
              combatant.coverPosition = newCover.position.clone()
              combatant.destinationPoint = newCover.position.clone()
              combatant.lastCoverSeekTime = Date.now()
              this.coverSystem.claimCover(combatant, newCover.position)
              return
            }
          }
        }
      } else if (this.measureEngageMethod('engage.cover.isFlanked', () => isCoverFlanked(combatant, targetPos))) {
        // Fallback to old method if no cover system
        Logger.warn('combat-ai', ` ${combatant.faction} unit's cover is flanked, repositioning`)
        combatant.inCover = false
        combatant.coverPosition = undefined
      }
    } else {
      // Normal engagement behavior when not in cover
      if (targetDistance < CLOSE_RANGE_DISTANCE) {
        this.telemetry.closeRangeFullAutoActivations++
        combatant.isFullAuto = true
        combatant.skillProfile.burstLength = CLOSE_RANGE_BURST
        combatant.skillProfile.burstPauseMs = CLOSE_RANGE_PAUSE_MS
      }

      const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000
      if (timeSinceHit < PANIC_HIT_WINDOW) {
        combatant.panicLevel = Math.min(1.0, combatant.panicLevel + PANIC_INCREMENT)
        if (combatant.panicLevel > getFactionCombatTuning(combatant.faction).panicThreshold) {
          combatant.isFullAuto = true
          combatant.skillProfile.burstLength = PANIC_BURST
          combatant.skillProfile.burstPauseMs = PANIC_PAUSE_MS
        }
      } else {
        combatant.panicLevel = Math.max(0, combatant.panicLevel - deltaTime * PANIC_DECAY_RATE)
      }

      // Opt-in utility-AI pre-pass. Factions with useUtilityAI=true consult
      // the scorer before the default engage/seek-cover ladder. Known intents
      // route the unit into the matching state; unknown intents (or none)
      // fall through to the legacy ladder.
      if (
        targetDistance >= CLOSE_RANGE_DISTANCE &&
        this.utilityScorer &&
        getFactionCombatTuning(combatant.faction).useUtilityAI
      ) {
        const ctx = this.buildUtilityContext(combatant, targetPos)
        const pick = this.measureEngageMethod('engage.utility.pick', () =>
          this.utilityScorer!.pick(ctx)
        )
        const intent = pick.intent
        if (intent && intent.kind === 'seekCoverInBearing') {
          const now = Date.now()
          const coverSeekAgeMs = combatant.lastCoverSeekTime ? now - combatant.lastCoverSeekTime : Number.POSITIVE_INFINITY
          if (coverSeekAgeMs >= UTILITY_COVER_REPATH_COOLDOWN_MS) {
            // Scratch Vector3 inside fireAndFadeAction.apply() is shared across
            // invocations — clone into combatant so subsequent picks can't
            // mutate the stored destination out from under us. Reuse the
            // combatant's existing Vector3 fields when present to avoid
            // per-tick allocations on re-entry.
            combatant.state = CombatantState.SEEKING_COVER
            if (combatant.coverPosition) {
              combatant.coverPosition.copy(intent.coverPosition)
            } else {
              combatant.coverPosition = intent.coverPosition.clone()
            }
            if (combatant.destinationPoint) {
              combatant.destinationPoint.copy(intent.coverPosition)
            } else {
              combatant.destinationPoint = intent.coverPosition.clone()
            }
            combatant.lastCoverSeekTime = now
            combatant.inCover = false
            return
          }
          // Otherwise fall through to the legacy engage ladder during the same
          // cooldown window used by AICoverFinding.shouldSeekCover().
        }
        if (intent && intent.kind === 'reposition') {
          // Fallback point is a pooled scratch on the action singleton —
          // clone before persisting so subsequent ticks don't mutate the
          // combatant's stored destination under us.
          combatant.state = CombatantState.RETREATING
          combatant.destinationPoint = intent.fallbackPosition.clone()
          combatant.inCover = false
          combatant.isFlankingMove = false
          return
        }
        if (intent && intent.kind === 'holdPosition') {
          // Stay in ENGAGING; suppress the default engage-ladder
          // repositioning by not seeking cover. Leave burst parameters to
          // the existing engage logic further down.
          // (Intentional no-op: existing in-cover / peek-and-fire code
          // below already handles the "stay put and fire" behavior.)
        }
      }

      // Check if should seek cover - use improved cover system if available
      const shouldRunCoverSearch = targetDistance >= CLOSE_RANGE_DISTANCE &&
        this.measureEngageMethod('engage.cover.shouldSeekCover', () => shouldSeekCover(combatant))
      if (shouldRunCoverSearch) {
        let coverPosition: THREE.Vector3 | null = null

        if (this.coverSystem) {
          // Use advanced cover system with occupation tracking
          const coverSpot = this.measureEngageMethod('engage.cover.findBestCover', () =>
            this.coverSystem!.findBestCover(combatant, targetPos, allCombatants)
          )
          if (coverSpot) {
            coverPosition = coverSpot.position.clone()
            this.coverSystem.claimCover(combatant, coverPosition)
          }
        } else {
          // Fallback to basic cover finding
          coverPosition = this.measureEngageMethod('engage.cover.findNearestCover', () =>
            findNearestCover(combatant, targetPos)
          )
        }

        if (coverPosition) {
          combatant.state = CombatantState.SEEKING_COVER
          combatant.coverPosition = coverPosition
          combatant.destinationPoint = coverPosition
          combatant.lastCoverSeekTime = Date.now()
          combatant.inCover = false
          return
        }
      }

      const nearbyEnemyCount = this.measureEngageMethod('engage.nearbyEnemyCount', () =>
        countNearbyEnemies(combatant, NEARBY_ENEMY_RADIUS, playerPosition, allCombatants, spatialGrid)
      )
      this.recordNearbyEnemyCount(nearbyEnemyCount)
      if (nearbyEnemyCount > NEARBY_ENEMY_BURST_THRESHOLD) {
        this.telemetry.nearbyEnemyBurstTriggers++
        combatant.isFullAuto = true
        combatant.skillProfile.burstLength = NEARBY_ENEMY_BURST
      }

      // Check if squad should initiate flanking maneuver (uses new flanking system)
      if (combatant.squadId && this.flankingSystem) {
        const squad = this.squads.get(combatant.squadId)
        if (squad && !this.measureEngageMethod('engage.flank.hasActive', () => this.flankingSystem!.hasActiveFlank(squad.id))) {
          if (this.measureEngageMethod('engage.flank.shouldInitiate', () => this.flankingSystem!.shouldInitiateFlank(squad, allCombatants, targetPos))) {
            const operation = this.measureEngageMethod('engage.flank.initiate', () =>
              this.flankingSystem!.initiateFlank(squad, allCombatants, targetPos)
            )
            if (operation) {
              // Operation started - combatant behavior will be controlled by flanking system
              return
            }
          }
        }
      }

      // Fallback: Check if squad should initiate basic suppression
      if (this.measureEngageMethod('engage.suppression.shouldInitiate', () =>
        this.shouldInitiateSquadSuppression(combatant, targetPos, allCombatants, countNearbyEnemies, playerPosition, spatialGrid)
      )) {
        this.measureEngageMethod('engage.suppression.initiate', () => {
          this.initiateSquadSuppression(combatant, targetPos, allCombatants, findNearestCover)
        })
        return
      }

      // Reset burst params if not full auto
      if (!combatant.isFullAuto) {
        const isLeader = combatant.squadRole === 'leader'
        if (isOpfor(combatant.faction)) {
          combatant.skillProfile.burstLength = isLeader ? 4 : 3
          combatant.skillProfile.burstPauseMs = isLeader ? 800 : 1000
        } else {
          combatant.skillProfile.burstLength = 3
          combatant.skillProfile.burstPauseMs = isLeader ? 900 : 1100
        }
      }
    }

    if (!this.measureEngageMethod('engage.suppression.lineOfSight', () =>
      this.hasSuppressionLineOfSight(combatant, target, playerPosition, canSeeTarget)
    )) {
      this.telemetry.suppressionTransitions++
      combatant.lastKnownTargetPos = target.position.clone()
      combatant.state = CombatantState.SUPPRESSING
      combatant.isFullAuto = true
      combatant.skillProfile.burstLength = SUPPRESSION_BURST
      combatant.skillProfile.burstPauseMs = SUPPRESSION_PAUSE_MS
      combatant.inCover = false
      return
    }

    combatant.lastKnownTargetPos = target.position.clone()
  }

  handleSuppressing(combatant: Combatant, deltaTime: number): void {
    // Check if suppression time expired
    if (combatant.suppressionEndTime && Date.now() > combatant.suppressionEndTime) {
      combatant.state = CombatantState.ENGAGING
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
      return
    }

    combatant.alertTimer -= deltaTime

    if (combatant.alertTimer <= 0) {
      combatant.state = CombatantState.PATROLLING
      combatant.target = null
      combatant.lastKnownTargetPos = undefined
      combatant.suppressionTarget = undefined
      combatant.suppressionEndTime = undefined
    }
  }

  handleAlert(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    combatant.alertTimer -= deltaTime
    combatant.reactionTimer -= deltaTime

    if (combatant.reactionTimer <= 0 && combatant.target) {
      const target = combatant.target
      if (!target) {
        return
      }
      const targetPos = isPlayerTarget(target) ? playerPosition : target.position
      const toTarget = _toTarget.subVectors(targetPos, combatant.position).normalize()
      combatant.rotation = Math.atan2(toTarget.z, toTarget.x)

      if (canSeeTarget(combatant, target, playerPosition)) {
        combatant.state = CombatantState.ENGAGING
        combatant.currentBurst = 0
      } else {
        combatant.state = combatant.previousState === CombatantState.DEFENDING ?
          CombatantState.DEFENDING : CombatantState.PATROLLING
        combatant.target = null
        combatant.previousState = undefined
      }
    }
  }

  private buildUtilityContext(combatant: Combatant, targetPos: THREE.Vector3): UtilityContext {
    const squad = combatant.squadId ? this.squads.get(combatant.squadId) : undefined
    const probe = this.hasCoverInBearing
    // Rebind the scratch cover-probe closure only when the combatant changes
    // (or when the probe is newly-wired / removed). The scorer is called
    // synchronously per tick; a single cached closure per AIStateEngage
    // instance is safe, and avoids allocating a fresh lambda every tick for
    // every combatant when utility AI is on for all factions.
    if (!probe) {
      this.scratchCoverProbe = undefined
      this.scratchProbeBoundTo = null
    } else if (this.scratchProbeBoundTo !== combatant || !this.scratchCoverProbe) {
      const currentCombatant = combatant
      this.scratchCoverProbe = (bearingRad: number, radius: number): boolean =>
        probe(currentCombatant.position, bearingRad, radius)
      this.scratchProbeBoundTo = combatant
    }

    const ctx = this.scratchContext
    ctx.self = combatant
    ctx.threatPosition = targetPos
    ctx.squad = squad
    // C1 proxy: own panicLevel stands in for squad-wide pressure. A real
    // cross-NPC aggregate (average panic, low-health-member count) is a
    // CombatantAI-tier responsibility and is queued for the follow-up.
    // Using per-unit panic keeps the fire-and-fade gate active for the
    // VC canary without requiring a new tick pass.
    ctx.squadSuppression = combatant.panicLevel
    ctx.hasCoverInBearing = this.scratchCoverProbe
    // Reset optional fields so a stale value from a prior combatant can't
    // leak into this tick's scoring. Keeping them explicitly-undefined also
    // documents what the context offers to actions.
    ctx.supportAvailable = undefined
    ctx.ammoReserve = undefined
    ctx.squadCohesion = undefined
    ctx.coverQualityHere = undefined
    ctx.objectiveProximity = undefined
    return ctx as UtilityContext
  }

  private recordTargetDistance(distance: number): void {
    if (!Number.isFinite(distance)) return
    if (distance < 5) {
      this.telemetry.targetDistanceBuckets.lt5m++
    } else if (distance < 10) {
      this.telemetry.targetDistanceBuckets.m5to10++
    } else if (distance < CLOSE_RANGE_DISTANCE) {
      this.telemetry.targetDistanceBuckets.m10to15++
    } else if (distance < 30) {
      this.telemetry.targetDistanceBuckets.m15to30++
    } else {
      this.telemetry.targetDistanceBuckets.gte30++
    }
  }

  private recordNearbyEnemyCount(count: number): void {
    if (!Number.isFinite(count)) return
    this.telemetry.nearbyEnemyCountSamples++
    this.telemetry.nearbyEnemyCountTotal += count
    this.telemetry.nearbyEnemyCountMax = Math.max(this.telemetry.nearbyEnemyCountMax, count)
  }

  private measureEngageMethod<T>(name: string, fn: () => T): T {
    return this.methodTimer ? this.methodTimer(name, fn) : fn()
  }

  private hasSuppressionLineOfSight(
    combatant: Combatant,
    target: ITargetable,
    playerPosition: THREE.Vector3,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): boolean {
    const now = Date.now()
    const sample = this.suppressionVisibilityByCombatant.get(combatant)
    if (
      sample &&
      sample.targetId === target.id &&
      sample.visible &&
      now - sample.checkedAtMs < SUPPRESSION_VISIBILITY_RECHECK_MS
    ) {
      return true
    }

    const visible = canSeeTarget(combatant, target, playerPosition)
    this.suppressionVisibilityByCombatant.set(combatant, {
      targetId: target.id,
      checkedAtMs: now,
      visible,
    })
    return visible
  }

  private shouldInitiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    countNearbyEnemies: (
      combatant: Combatant,
      radius: number,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => number,
    playerPosition: THREE.Vector3,
    spatialGrid?: ISpatialQuery
  ): boolean {
    if (!combatant.squadId) return false

    const squad = this.squads.get(combatant.squadId)
    if (!squad || squad.members.length < SQUAD_MIN_SIZE_FOR_SUPPRESSION) return false

    const lastSuppression = this.squadSuppressionCooldown.get(combatant.squadId) || 0
    if (Date.now() - lastSuppression < SUPPRESSION_COOLDOWN_MS) return false

    const distanceSq = combatant.position.distanceToSquared(targetPos)
    if (distanceSq < SUPPRESSION_MIN_DISTANCE * SUPPRESSION_MIN_DISTANCE || distanceSq > SUPPRESSION_MAX_DISTANCE * SUPPRESSION_MAX_DISTANCE) return false

    const nearbyEnemies = countNearbyEnemies(combatant, SUPPRESSION_ENEMY_SCAN_RADIUS, targetPos, allCombatants, spatialGrid)

    for (const memberId of squad.members) {
      const member = allCombatants.get(memberId)
      if (member && member.health < member.maxHealth * SUPPRESSION_HEALTH_THRESHOLD) {
        return true
      }
    }

    return nearbyEnemies >= 2
  }

  initiateSquadSuppression(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    findNearestCover: (combatant: Combatant, threatPosition: THREE.Vector3) => THREE.Vector3 | null
  ): void {
    if (!combatant.squadId) return

    const squad = this.squads.get(combatant.squadId)
    if (!squad) return

    const now = Date.now()
    this.squadSuppressionCooldown.set(combatant.squadId, now)

    const flankCoverProbe = { position: new THREE.Vector3() } as Combatant
    let flankCoverSearches = 0

    squad.members.forEach((memberId, index) => {
      const member = allCombatants.get(memberId)
      if (!member || member.state === CombatantState.DEAD) return

      if (member.squadRole === 'leader' || index === 1) {
        this.measureEngageMethod('engage.suppression.initiate.assignSuppressor', () => {
          member.state = CombatantState.SUPPRESSING
          if (member.suppressionTarget) {
            member.suppressionTarget.copy(targetPos)
          } else {
            member.suppressionTarget = targetPos.clone()
          }
          member.suppressionEndTime = now + SUPPRESSION_BASE_DURATION_MS + SeededRandom.random() * SUPPRESSION_JITTER_MS
          if (member.lastKnownTargetPos) {
            member.lastKnownTargetPos.copy(targetPos)
          } else {
            member.lastKnownTargetPos = targetPos.clone()
          }
          member.alertTimer = SUPPRESSION_ALERT_TIMER
          member.isFullAuto = true
          member.skillProfile.burstLength = SUPPRESSION_FIRE_BURST
          member.skillProfile.burstPauseMs = SUPPRESSION_FIRE_PAUSE_MS
        })
      } else {
        member.state = CombatantState.ADVANCING

        const flankDestination = this.measureEngageMethod('engage.suppression.initiate.computeFlankDestination', () => {
          const flankLeft = index % 2 === 0
          const flankingAngle = this.calculateFlankingAngle(member.position, targetPos, flankLeft)
          const flankingDistance = FLANK_BASE_DISTANCE + Math.random() * FLANK_DISTANCE_JITTER

          return _flankingPos.set(
            targetPos.x + Math.cos(flankingAngle) * flankingDistance,
            member.position.y,
            targetPos.z + Math.sin(flankingAngle) * flankingDistance
          )
        })

        const existingDestination = member.destinationPoint
        const hasReusableFlankDestination = !!existingDestination
          && existingDestination.distanceToSquared(flankDestination) <= this.FLANK_DESTINATION_REUSE_RADIUS_SQ
        this.telemetry.suppressionFlankDestinationComputations++

        let coverNearFlank: THREE.Vector3 | null = null
        if (hasReusableFlankDestination) {
          this.telemetry.suppressionFlankCoverSearchReuseSkips++
        } else if (flankCoverSearches >= this.MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION) {
          this.telemetry.suppressionFlankCoverSearchCapSkips++
        } else {
          coverNearFlank = this.measureEngageMethod('engage.suppression.initiate.coverSearch', () => {
            flankCoverProbe.position.copy(flankDestination)
            flankCoverSearches++
            this.telemetry.suppressionFlankCoverSearches++
            return findNearestCover(flankCoverProbe, targetPos)
          })
        }

        this.measureEngageMethod('engage.suppression.initiate.assignFlanker', () => {
          if (coverNearFlank) {
            if (existingDestination) {
              existingDestination.copy(coverNearFlank)
            } else {
              member.destinationPoint = coverNearFlank
            }
          } else if (!hasReusableFlankDestination && existingDestination) {
            existingDestination.copy(flankDestination)
          } else if (!existingDestination) {
            member.destinationPoint = flankDestination.clone()
          }
          member.isFlankingMove = true
        })
      }
    })

    this.measureEngageMethod('engage.suppression.initiate.log', () => {
      Logger.info('combat-ai', ` Squad ${combatant.squadId} initiating coordinated suppression & flank on target at (${Math.floor(targetPos.x)}, ${Math.floor(targetPos.z)})`)
    })
  }

  private calculateFlankingAngle(
    attackerPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    flankLeft: boolean
  ): number {
    const toAttacker = _toAttacker.subVectors(attackerPos, targetPos)
    const currentAngle = Math.atan2(toAttacker.z, toAttacker.x)
    const flankingOffset = flankLeft ? Math.PI / 2 : -Math.PI / 2
    return currentAngle + flankingOffset
  }
}
