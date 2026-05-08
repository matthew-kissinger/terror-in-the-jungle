import * as THREE from 'three'
import { Combatant, CombatantState, ITargetable, isPlayerTarget } from '../types'
import { ISpatialQuery } from '../SpatialOctree'
import { Logger } from '../../../utils/Logger'
const _toDestination = new THREE.Vector3()
const _toTarget = new THREE.Vector3()
const _toCover = new THREE.Vector3()
const SEEKING_COVER_VISIBILITY_RECHECK_MS = 250

interface SeekingCoverVisibilitySample {
  targetId: string
  checkedAtMs: number
  visible: boolean
}

/**
 * Handles movement-related AI states (advancing, seeking cover)
 */
export class AIStateMovement {
  private seekingCoverVisibilityByCombatant = new WeakMap<Combatant, SeekingCoverVisibilitySample>()

  handleAdvancing(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: ISpatialQuery | undefined,
    findNearestEnemy: (
      combatant: Combatant,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: ISpatialQuery
    ) => ITargetable | null,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    if (!combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING;
      return;
    }

    const distanceToDestination = combatant.position.distanceTo(combatant.destinationPoint);
    if (distanceToDestination < 3.0) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      return;
    }

    const toDestination = _toDestination.subVectors(combatant.destinationPoint, combatant.position).normalize();
    combatant.rotation = Math.atan2(toDestination.z, toDestination.x);

    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy) {
      const targetPos = isPlayerTarget(enemy) ? playerPosition : enemy.position;
      const distance = combatant.position.distanceTo(targetPos);

      // At very close range, ALWAYS react - can't ignore enemy right next to you
      const veryCloseRange = distance < 15;

      if (distance < 30) {
        // Turn toward enemy before LOS check
        const toTarget = _toTarget.subVectors(targetPos, combatant.position).normalize();
        const savedRotation = combatant.rotation;
        combatant.rotation = Math.atan2(toTarget.z, toTarget.x);

        if (veryCloseRange || canSeeTarget(combatant, enemy, playerPosition)) {
          combatant.state = CombatantState.ENGAGING;
          combatant.target = enemy;
          combatant.destinationPoint = undefined;
          combatant.isFlankingMove = false;
        } else {
          // Restore rotation if didn't engage
          combatant.rotation = savedRotation;
        }
      }
    }
  }

  handleSeekingCover(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    canSeeTarget: (
      combatant: Combatant,
      target: ITargetable,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    if (!combatant.coverPosition || !combatant.destinationPoint) {
      combatant.state = CombatantState.ENGAGING;
      combatant.inCover = false;
      return;
    }

    const distanceToCover = combatant.position.distanceTo(combatant.coverPosition);
    if (distanceToCover < 1.5) {
      combatant.inCover = true;
      combatant.state = CombatantState.ENGAGING;
      Logger.info('combat-ai', ` ${combatant.faction} unit reached cover, switching to peek-and-fire`);

    }

    const toCover = _toCover.subVectors(combatant.coverPosition, combatant.position).normalize();
    combatant.rotation = Math.atan2(toCover.z, toCover.x);

    if (
      combatant.target &&
      !this.hasSeekingCoverLineOfSight(combatant, combatant.target, playerPosition, canSeeTarget)
    ) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      combatant.inCover = false;
    }
  }

  private hasSeekingCoverLineOfSight(
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
    const sample = this.seekingCoverVisibilityByCombatant.get(combatant)
    if (
      sample &&
      sample.visible &&
      sample.targetId === target.id &&
      now - sample.checkedAtMs < SEEKING_COVER_VISIBILITY_RECHECK_MS
    ) {
      return true
    }

    const visible = canSeeTarget(combatant, target, playerPosition)
    this.seekingCoverVisibilityByCombatant.set(combatant, {
      targetId: target.id,
      checkedAtMs: now,
      visible,
    })
    return visible
  }

}
