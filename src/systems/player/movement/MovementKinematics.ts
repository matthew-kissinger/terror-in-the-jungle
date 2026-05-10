import * as THREE from 'three';
import type { PlayerInput } from '../PlayerInput';

type MovementAgentIntent = { forward: number; strafe: number };
type MovementAgentWorldIntent = { x: number; z: number };

interface ResolveMovementIntentOptions {
  input: PlayerInput; camera: THREE.Camera; baseSpeed: number;
  agentMovementIntent: MovementAgentIntent | null;
  agentWorldMovementIntent: MovementAgentWorldIntent | null;
  moveVector: THREE.Vector3; cameraDirection: THREE.Vector3; cameraRight: THREE.Vector3;
  worldMoveVector: THREE.Vector3; upVector: THREE.Vector3;
}

const AGENT_INTENT_DEADZONE = 0.01;
const TOUCH_DEADZONE = 0.1;

export function resolveMovementIntent({
  input,
  camera,
  baseSpeed,
  agentMovementIntent,
  agentWorldMovementIntent,
  moveVector,
  cameraDirection,
  cameraRight,
  worldMoveVector,
  upVector,
}: ResolveMovementIntentOptions) {
  let requestedSpeed = 0;
  let requestedMoveX = 0;
  let requestedMoveZ = 0;
  let hasWorldMovementIntent = false;

  if (agentWorldMovementIntent) {
    const worldLen = Math.hypot(agentWorldMovementIntent.x, agentWorldMovementIntent.z);
    if (worldLen > AGENT_INTENT_DEADZONE) {
      requestedMoveX = agentWorldMovementIntent.x / worldLen;
      requestedMoveZ = agentWorldMovementIntent.z / worldLen;
      requestedSpeed = baseSpeed;
      hasWorldMovementIntent = true;
    }
  }

  if (!hasWorldMovementIntent && agentMovementIntent && (
    Math.abs(agentMovementIntent.forward) > AGENT_INTENT_DEADZONE ||
    Math.abs(agentMovementIntent.strafe) > AGENT_INTENT_DEADZONE
  )) {
    moveVector.x = agentMovementIntent.strafe;
    moveVector.z = -agentMovementIntent.forward;
  } else if (!hasWorldMovementIntent) {
    const touchMove = input.getTouchMovementVector();
    if (Math.abs(touchMove.x) > TOUCH_DEADZONE || Math.abs(touchMove.z) > TOUCH_DEADZONE) {
      moveVector.x = touchMove.x;
      moveVector.z = touchMove.z;
    } else {
      if (input.isKeyPressed('keyw')) moveVector.z -= 1;
      if (input.isKeyPressed('keys')) moveVector.z += 1;
      if (input.isKeyPressed('keya')) moveVector.x -= 1;
      if (input.isKeyPressed('keyd')) moveVector.x += 1;
    }
  }

  if (!hasWorldMovementIntent && moveVector.length() > 0) {
    moveVector.normalize();

    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    cameraRight.crossVectors(cameraDirection, upVector);

    worldMoveVector.set(0, 0, 0);
    worldMoveVector.addScaledVector(cameraDirection, -moveVector.z);
    worldMoveVector.addScaledVector(cameraRight, moveVector.x);
    requestedMoveX = worldMoveVector.x;
    requestedMoveZ = worldMoveVector.z;
    requestedSpeed = baseSpeed;
  }

  return { requestedSpeed, requestedMoveX, requestedMoveZ, hasWorldMovementIntent };
}

export function enforceWorldBoundary(position: THREE.Vector3, velocity: THREE.Vector3, halfExtent: number, bounceFactor: number): void {
  if (position.x > halfExtent) {
    position.x = halfExtent;
    velocity.x = -Math.abs(velocity.x) * bounceFactor;
  } else if (position.x < -halfExtent) {
    position.x = -halfExtent;
    velocity.x = Math.abs(velocity.x) * bounceFactor;
  }
  if (position.z > halfExtent) {
    position.z = halfExtent;
    velocity.z = -Math.abs(velocity.z) * bounceFactor;
  } else if (position.z < -halfExtent) {
    position.z = -halfExtent;
    velocity.z = Math.abs(velocity.z) * bounceFactor;
  }
}
