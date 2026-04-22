import * as THREE from 'three';
import type { IPlayerController } from '../../../types/SystemInterfaces';

const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();

export function inspectPlayer(pc: IPlayerController): Record<string, unknown> {
  const pos = pc.getPosition(_pos);
  const vel = pc.getVelocity(_vel);
  let vehicle = 'on-foot';
  if (pc.isInHelicopter()) vehicle = `helicopter ${pc.getHelicopterId() ?? '?'}`;
  else if (pc.isInFixedWing()) vehicle = `fixed_wing ${pc.getFixedWingId() ?? '?'}`;
  return {
    id: 'player',
    position: `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`,
    velocity: `${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)}`,
    speed: vel.length().toFixed(2),
    vehicle,
  };
}
