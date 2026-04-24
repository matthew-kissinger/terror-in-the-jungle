import * as THREE from 'three';
import {
  ACTOR_EYE_Y_OFFSET,
  NPC_CENTER_MASS_Y_OFFSET,
  NPC_MUZZLE_Y_OFFSET,
  PLAYER_CENTER_MASS_Y_OFFSET,
} from '../../config/CombatantConfig';

export function copyActorEyePosition(out: THREE.Vector3, actorAnchor: THREE.Vector3): THREE.Vector3 {
  out.copy(actorAnchor);
  out.y += ACTOR_EYE_Y_OFFSET;
  return out;
}

export function copyNpcMuzzlePosition(out: THREE.Vector3, npcAnchor: THREE.Vector3): THREE.Vector3 {
  out.copy(npcAnchor);
  out.y += NPC_MUZZLE_Y_OFFSET;
  return out;
}

export function copyNpcCenterMassPosition(out: THREE.Vector3, npcAnchor: THREE.Vector3): THREE.Vector3 {
  out.copy(npcAnchor);
  out.y += NPC_CENTER_MASS_Y_OFFSET;
  return out;
}

export function copyPlayerCenterMassPosition(out: THREE.Vector3, playerEyeAnchor: THREE.Vector3): THREE.Vector3 {
  out.copy(playerEyeAnchor);
  out.y += PLAYER_CENTER_MASS_Y_OFFSET;
  return out;
}
