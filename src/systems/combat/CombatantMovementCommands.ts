import * as THREE from 'three';
import { Combatant, Squad, SquadCommand } from './types';
import { objectPool } from '../../utils/ObjectPoolManager';

export function handleRejoiningMovement(
  combatant: Combatant,
  squad: Squad,
  combatants: Map<string, Combatant>
): void {
  const squadCentroid = getSquadCentroid(squad, combatants);
  if (!squadCentroid) {
    combatant.isRejoiningSquad = false;
    return;
  }

  const distanceToSquad = combatant.position.distanceTo(squadCentroid);

  if (distanceToSquad < 15) {
    combatant.isRejoiningSquad = false;
    combatant.velocity.set(0, 0, 0);
    objectPool.releaseVector3(squadCentroid);
  } else {
    const toSquad = objectPool.getVector3();
    toSquad.subVectors(squadCentroid, combatant.position);
    toSquad.normalize();
    const speed = Math.min(7, distanceToSquad / 3);
    combatant.velocity.set(toSquad.x * speed, 0, toSquad.z * speed);
    combatant.rotation = Math.atan2(toSquad.z, toSquad.x);
    objectPool.releaseVector3(toSquad);
    objectPool.releaseVector3(squadCentroid);
  }
}

export function getSquadCentroid(squad: Squad, combatants: Map<string, Combatant>): THREE.Vector3 | undefined {
  const squadMembers = squad.members
    .map(id => combatants.get(id))
    .filter(c => c && !c.isRejoiningSquad);

  if (squadMembers.length === 0) return undefined;

  const centroid = objectPool.getVector3();
  squadMembers.forEach(member => {
    if (member) centroid.add(member.position);
  });
  centroid.divideScalar(squadMembers.length);

  return centroid;
}

export function handlePlayerCommand(
  combatant: Combatant,
  squad: Squad,
  combatants: Map<string, Combatant>,
  deltaTime: number
): void {
  const command = squad.currentCommand;
  const commandPos = squad.commandPosition;

  switch (command) {
    case SquadCommand.FOLLOW_ME:
      if (combatant.destinationPoint) {
        const toDestination = objectPool.getVector3();
        toDestination.subVectors(combatant.destinationPoint, combatant.position);
        const distance = toDestination.length();
        if (distance > 2) {
          toDestination.normalize();
          const speed = Math.min(6, distance / 2);
          combatant.velocity.set(toDestination.x * speed, 0, toDestination.z * speed);
          combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        objectPool.releaseVector3(toDestination);
      } else {
        combatant.velocity.set(0, 0, 0);
      }
      break;

    case SquadCommand.HOLD_POSITION:
      if (combatant.destinationPoint) {
        const toDestination = objectPool.getVector3();
        toDestination.subVectors(combatant.destinationPoint, combatant.position);
        const distance = toDestination.length();
        if (distance > 2) {
          toDestination.normalize();
          combatant.velocity.set(toDestination.x * 4, 0, toDestination.z * 4);
          combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        objectPool.releaseVector3(toDestination);
      } else {
        combatant.velocity.set(0, 0, 0);
      }
      break;

    case SquadCommand.PATROL_HERE:
      if (combatant.destinationPoint) {
        const toDestination = objectPool.getVector3();
        toDestination.subVectors(combatant.destinationPoint, combatant.position);
        const distance = toDestination.length();
        if (distance > 3) {
          toDestination.normalize();
          combatant.velocity.set(toDestination.x * 3, 0, toDestination.z * 3);
          combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        objectPool.releaseVector3(toDestination);
      } else {
        combatant.velocity.set(0, 0, 0);
      }
      break;

    case SquadCommand.RETREAT:
      if (combatant.destinationPoint) {
        const toDestination = objectPool.getVector3();
        toDestination.subVectors(combatant.destinationPoint, combatant.position);
        const distance = toDestination.length();
        if (distance > 5) {
          toDestination.normalize();
          combatant.velocity.set(toDestination.x * 8, 0, toDestination.z * 8);
          combatant.rotation = Math.atan2(toDestination.z, toDestination.x);
        } else {
          combatant.velocity.set(0, 0, 0);
        }
        objectPool.releaseVector3(toDestination);
      } else {
        combatant.velocity.set(0, 0, 0);
      }
      break;

    default:
      break;
  }
}
