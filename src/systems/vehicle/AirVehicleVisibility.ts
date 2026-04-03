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
