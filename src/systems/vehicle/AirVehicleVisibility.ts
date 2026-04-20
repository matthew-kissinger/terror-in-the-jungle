import * as THREE from 'three';

const DEFAULT_CULL_DISTANCE = 450;
const FOG_TRANSMITTANCE_THRESHOLD = 0.02;
const AIRBORNE_DISTANCE_MULTIPLIER = 1.2;
const VISIBLE_HYSTERESIS_MULTIPLIER = 1.12;

export function shouldRenderAirVehicle(params: {
  camera: THREE.Camera | null;
  scene: THREE.Scene;
  vehiclePosition: THREE.Vector3;
  isAirborne: boolean;
  isPiloted: boolean;
  currentlyVisible: boolean;
}): boolean {
  if (params.isPiloted) {
    return true;
  }

  const camera = params.camera;
  if (!camera) {
    return true;
  }

  const maxDistance = getAirVehicleCullDistance(params.scene, camera, params.isAirborne)
    * (params.currentlyVisible ? VISIBLE_HYSTERESIS_MULTIPLIER : 1.0);
  const maxDistanceSq = maxDistance * maxDistance;

  return camera.position.distanceToSquared(params.vehiclePosition) <= maxDistanceSq;
}

/**
 * Decide whether an air vehicle's physics simulation should step this frame.
 *
 * Simulation cull is strictly a superset of render cull: we always simulate a
 * piloted aircraft (the player's inputs must not be dropped) and we always
 * simulate a mid-mission airborne NPC aircraft (pilot state is fragile and
 * mission progression must continue even when the player is not looking).
 *
 * For parked / idle unpiloted aircraft we reuse the same distance + airborne
 * boost the render cull uses, plus the same 1.12x hysteresis multiplier when
 * already culled to keep boundary flicker out of the perf path. Callers are
 * expected to freeze physics state (zero velocity) on the transition into
 * the culled region so the airframe does not resume with stale momentum.
 */
export function shouldSimulateAirVehicle(params: {
  camera: THREE.Camera | null;
  scene: THREE.Scene;
  vehiclePosition: THREE.Vector3;
  isAirborne: boolean;
  isPiloted: boolean;
  hasActiveNPCPilot: boolean;
  currentlySimulating: boolean;
}): boolean {
  if (params.isPiloted) {
    return true;
  }

  // Airborne NPC aircraft mid-mission are never culled in v1: their internal
  // waypoint/phase state is not safe to freeze mid-flight and resume on the
  // other side of the player's attention window.
  if (params.hasActiveNPCPilot && params.isAirborne) {
    return true;
  }

  const camera = params.camera;
  if (!camera) {
    return true;
  }

  const baseDistance = getAirVehicleCullDistance(params.scene, camera, params.isAirborne);
  // Mirror the render-cull hysteresis: while currently simulating, require the
  // camera to move past `base * 1.12` before we drop sim. While currently
  // culled, require the camera to come within `base` before we resume.
  const maxDistance = baseDistance * (params.currentlySimulating ? VISIBLE_HYSTERESIS_MULTIPLIER : 1.0);
  const maxDistanceSq = maxDistance * maxDistance;

  return camera.position.distanceToSquared(params.vehiclePosition) <= maxDistanceSq;
}

function getAirVehicleCullDistance(
  scene: THREE.Scene,
  camera: THREE.Camera,
  isAirborne: boolean,
): number {
  const cameraFar = camera instanceof THREE.PerspectiveCamera
    ? camera.far
    : DEFAULT_CULL_DISTANCE * 2;
  const fogDistance = getFogVisibilityDistance(scene.fog);
  const baseDistance = Math.min(fogDistance, cameraFar * 0.95);
  const adjustedDistance = isAirborne ? baseDistance * AIRBORNE_DISTANCE_MULTIPLIER : baseDistance;
  return THREE.MathUtils.clamp(adjustedDistance, 180, cameraFar * 0.98);
}

function getFogVisibilityDistance(fog: THREE.Fog | THREE.FogExp2 | null): number {
  if (fog instanceof THREE.FogExp2 && fog.density > 0.00001) {
    return Math.sqrt(-Math.log(FOG_TRANSMITTANCE_THRESHOLD)) / fog.density;
  }

  if (fog instanceof THREE.Fog) {
    return fog.far;
  }

  return DEFAULT_CULL_DISTANCE;
}
