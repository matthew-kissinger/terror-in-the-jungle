import * as THREE from 'three';
import {
  ACTOR_EYE_Y_OFFSET,
  NPC_CENTER_MASS_Y_OFFSET,
  NPC_PIXEL_FORGE_VISUAL_HEIGHT,
  NPC_MUZZLE_Y_OFFSET,
  NPC_Y_OFFSET,
  PLAYER_CENTER_MASS_Y_OFFSET,
} from '../../config/CombatantConfig';
import type { Combatant } from './types';

export type CombatantHitProxyPositionMode = 'logical' | 'visual';

export type CombatantHitProxy =
  | {
      kind: 'sphere';
      label: 'head' | 'pelvis';
      isHead: boolean;
      center: THREE.Vector3;
      radius: number;
    }
  | {
      kind: 'capsule';
      label: 'chest' | 'leftLeg' | 'rightLeg';
      isHead: false;
      start: THREE.Vector3;
      end: THREE.Vector3;
      radius: number;
    };

export const COMBATANT_HIT_PROXY_COUNT = 5;
export const COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER = 1.16;
export const COMBATANT_HIT_PROXY_HEAD_CENTER_RATIO = 0.84;
export const COMBATANT_HIT_PROXY_HEAD_RADIUS_RATIO = 0.115;
export const COMBATANT_HIT_PROXY_CHEST_START_RATIO = 0.46;
export const COMBATANT_HIT_PROXY_CHEST_END_RATIO = 0.72;
export const COMBATANT_HIT_PROXY_CHEST_RADIUS_RATIO = 0.18;
export const COMBATANT_HIT_PROXY_PELVIS_CENTER_RATIO = 0.34;
export const COMBATANT_HIT_PROXY_PELVIS_RADIUS_RATIO = 0.17;
export const COMBATANT_HIT_PROXY_LEG_START_RATIO = 0.08;
export const COMBATANT_HIT_PROXY_LEG_END_RATIO = 0.34;
export const COMBATANT_HIT_PROXY_LEG_RADIUS_RATIO = 0.075;
export const COMBATANT_HIT_PROXY_LEG_OFFSET_RATIO = 0.045;

export interface CharacterHitProxyInput {
  anchor: THREE.Vector3;
  scaleY?: number;
  visualRotation?: number;
}

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

export function createCombatantHitProxyScratch(): CombatantHitProxy[] {
  return [
    { kind: 'sphere', label: 'head', isHead: true, center: new THREE.Vector3(), radius: 0 },
    { kind: 'capsule', label: 'chest', isHead: false, start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0 },
    { kind: 'sphere', label: 'pelvis', isHead: false, center: new THREE.Vector3(), radius: 0 },
    { kind: 'capsule', label: 'leftLeg', isHead: false, start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0 },
    { kind: 'capsule', label: 'rightLeg', isHead: false, start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0 },
  ];
}

export function writeCombatantHitProxies(
  out: CombatantHitProxy[],
  combatant: Combatant,
  positionMode: CombatantHitProxyPositionMode = 'logical',
): CombatantHitProxy[] {
  const anchor = positionMode === 'visual'
    ? combatant.renderedPosition ?? combatant.position
    : combatant.position;
  return writeCharacterHitProxies(out, {
    anchor,
    scaleY: combatant.scale.y,
    visualRotation: combatant.visualRotation,
  });
}

export function writeCharacterHitProxies(
  out: CombatantHitProxy[],
  input: CharacterHitProxyInput,
): CombatantHitProxy[] {
  if (out.length < COMBATANT_HIT_PROXY_COUNT) {
    throw new Error(`Expected ${COMBATANT_HIT_PROXY_COUNT} combatant hit proxies, got ${out.length}`);
  }

  const scaleY = input.scaleY ?? 1;
  const visualRotation = input.visualRotation ?? 0;
  const visualHeight =
    NPC_PIXEL_FORGE_VISUAL_HEIGHT
    * COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER
    * scaleY;
  const groundY = input.anchor.y - NPC_Y_OFFSET;
  const centerX = input.anchor.x;
  const centerZ = input.anchor.z;
  const rightX = Math.cos(visualRotation);
  const rightZ = -Math.sin(visualRotation);
  const legOffset = visualHeight * COMBATANT_HIT_PROXY_LEG_OFFSET_RATIO;

  writeSphereProxy(
    out[0],
    'head',
    true,
    centerX,
    groundY + visualHeight * COMBATANT_HIT_PROXY_HEAD_CENTER_RATIO,
    centerZ,
    visualHeight * COMBATANT_HIT_PROXY_HEAD_RADIUS_RATIO,
  );
  writeCapsuleProxy(
    out[1],
    'chest',
    centerX,
    groundY + visualHeight * COMBATANT_HIT_PROXY_CHEST_START_RATIO,
    centerZ,
    centerX,
    groundY + visualHeight * COMBATANT_HIT_PROXY_CHEST_END_RATIO,
    centerZ,
    visualHeight * COMBATANT_HIT_PROXY_CHEST_RADIUS_RATIO,
  );
  writeSphereProxy(
    out[2],
    'pelvis',
    false,
    centerX,
    groundY + visualHeight * COMBATANT_HIT_PROXY_PELVIS_CENTER_RATIO,
    centerZ,
    visualHeight * COMBATANT_HIT_PROXY_PELVIS_RADIUS_RATIO,
  );
  writeCapsuleProxy(
    out[3],
    'leftLeg',
    centerX - rightX * legOffset,
    groundY + visualHeight * COMBATANT_HIT_PROXY_LEG_START_RATIO,
    centerZ - rightZ * legOffset,
    centerX - rightX * legOffset,
    groundY + visualHeight * COMBATANT_HIT_PROXY_LEG_END_RATIO,
    centerZ - rightZ * legOffset,
    visualHeight * COMBATANT_HIT_PROXY_LEG_RADIUS_RATIO,
  );
  writeCapsuleProxy(
    out[4],
    'rightLeg',
    centerX + rightX * legOffset,
    groundY + visualHeight * COMBATANT_HIT_PROXY_LEG_START_RATIO,
    centerZ + rightZ * legOffset,
    centerX + rightX * legOffset,
    groundY + visualHeight * COMBATANT_HIT_PROXY_LEG_END_RATIO,
    centerZ + rightZ * legOffset,
    visualHeight * COMBATANT_HIT_PROXY_LEG_RADIUS_RATIO,
  );
  return out;
}

function writeSphereProxy(
  proxy: CombatantHitProxy,
  label: 'head' | 'pelvis',
  isHead: boolean,
  x: number,
  y: number,
  z: number,
  radius: number,
): void {
  if (proxy.kind !== 'sphere') return;
  proxy.label = label;
  proxy.isHead = isHead;
  proxy.center.set(x, y, z);
  proxy.radius = radius;
}

function writeCapsuleProxy(
  proxy: CombatantHitProxy,
  label: 'chest' | 'leftLeg' | 'rightLeg',
  startX: number,
  startY: number,
  startZ: number,
  endX: number,
  endY: number,
  endZ: number,
  radius: number,
): void {
  if (proxy.kind !== 'capsule') return;
  proxy.label = label;
  proxy.start.set(startX, startY, startZ);
  proxy.end.set(endX, endY, endZ);
  proxy.radius = radius;
}
