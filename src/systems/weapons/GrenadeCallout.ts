import * as THREE from 'three';
import { CombatantSystem } from '../combat/CombatantSystem';
import { CombatantState } from '../combat/types';
import { VoiceCalloutSystem, CalloutType } from '../audio/VoiceCalloutSystem';

export function triggerGrenadeCallout(
  position: THREE.Vector3,
  voiceCalloutSystem: VoiceCalloutSystem | undefined,
  combatantSystem: CombatantSystem | undefined
): void {
  if (!voiceCalloutSystem || !combatantSystem) return;
  if (Math.random() >= 0.4) return;

  const DETECTION_RADIUS = 30;
  const detectionRadiusSq = DETECTION_RADIUS * DETECTION_RADIUS;
  const nearbyCombatants = combatantSystem.getAllCombatants().filter(combatant => {
    if (combatant.state === CombatantState.DEAD) return false;
    if (combatant.isPlayerProxy) return false;
    return combatant.position.distanceToSquared(position) <= detectionRadiusSq;
  });

  if (nearbyCombatants.length === 0) return;

  const caller = nearbyCombatants[Math.floor(Math.random() * nearbyCombatants.length)];
  voiceCalloutSystem.triggerCallout(caller, CalloutType.GRENADE, caller.position);
}
