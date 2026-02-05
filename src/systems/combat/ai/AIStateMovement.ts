import * as THREE from 'three'
import { Combatant, CombatantState } from '../types'
import { SpatialOctree } from '../SpatialOctree'
import { Logger } from '../../../utils/Logger'
import { VoiceCalloutSystem, CalloutType } from '../../audio/VoiceCalloutSystem'

const _toDestination = new THREE.Vector3()
const _toTarget = new THREE.Vector3()
const _toCover = new THREE.Vector3()

/**
 * Handles movement-related AI states (advancing, seeking cover)
 */
export class AIStateMovement {
  private voiceCalloutSystem?: VoiceCalloutSystem
  handleAdvancing(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree | undefined,
    findNearestEnemy: (
      combatant: Combatant,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: SpatialOctree
    ) => Combatant | null,
    canSeeTarget: (
      combatant: Combatant,
      target: Combatant,
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
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position;
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
      target: Combatant,
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
      const wasInCover = combatant.inCover;
      combatant.inCover = true;
      combatant.state = CombatantState.ENGAGING;
      Logger.info('combat-ai', ` ${combatant.faction} unit reached cover, switching to peek-and-fire`);
      
      // Voice callout: In cover (trigger when first reaching cover)
      if (!wasInCover && this.voiceCalloutSystem && Math.random() < 0.25) {
        this.voiceCalloutSystem.triggerCallout(combatant, CalloutType.IN_COVER, combatant.position);
      }
    }

    const toCover = _toCover.subVectors(combatant.coverPosition, combatant.position).normalize();
    combatant.rotation = Math.atan2(toCover.z, toCover.x);

    if (combatant.target && !canSeeTarget(combatant, combatant.target, playerPosition)) {
      combatant.state = CombatantState.ENGAGING;
      combatant.destinationPoint = undefined;
      combatant.inCover = false;
    }
  }

  setVoiceCalloutSystem(system: VoiceCalloutSystem): void {
    this.voiceCalloutSystem = system;
  }
}
