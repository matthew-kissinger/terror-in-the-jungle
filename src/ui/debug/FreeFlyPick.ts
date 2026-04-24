import * as THREE from 'three';
import type { GameEngine } from '../../core/GameEngine';

interface FreeFlyPickResult {
  kind: 'combatant' | 'vehicle' | 'prop';
  id: string;
}

const _ndc = new THREE.Vector2();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toEntity = new THREE.Vector3();
const _project = new THREE.Vector3();

const MAX_PICK_DISTANCE = 1500;
const COMBATANT_RADIUS = 1.5;
const VEHICLE_RADIUS = 4;

/**
 * Raycast-and-proximity pick for the free-fly entity inspector.
 *
 * Rather than traversing every mesh in the scene (expensive, and scene
 * meshes don't map cleanly to entity ids), we project each candidate
 * position onto the view ray and keep the one whose perpendicular
 * distance is within a tolerance that grows with range. Priority order
 * per brief: combatant > vehicle > prop.
 */
export function pickEntityFromClick(engine: GameEngine, event: MouseEvent): FreeFlyPickResult | null {
  const canvas = engine.renderer.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  _ndc.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

  const camera = engine.renderer.getActiveCamera();
  _origin.copy(camera.position);
  _dir.set(_ndc.x, _ndc.y, 0.5).unproject(camera).sub(_origin).normalize();

  const combatantHit = closestAlongRay(
    engine.systemManager.combatantSystem.getAllCombatants()
      .map(c => ({ id: c.id, pos: c.position })),
    COMBATANT_RADIUS, 0.002,
  );
  if (combatantHit) return { kind: 'combatant', id: combatantHit };

  const vm = engine.systemManager.vehicleManager;
  if (vm) {
    const vehicleHit = closestAlongRay(
      vm.getAllVehicles().map(v => ({ id: v.vehicleId, pos: v.getPosition() })),
      VEHICLE_RADIUS, 0.003,
    );
    if (vehicleHit) return { kind: 'vehicle', id: vehicleHit };
  }
  return null;
}

function closestAlongRay(
  candidates: Array<{ id: string; pos: THREE.Vector3 }>,
  baseRadius: number,
  rangeGrowth: number,
): string | null {
  let bestId: string | null = null;
  let bestT = Infinity;
  for (const c of candidates) {
    const dx = c.pos.x - _origin.x;
    const dy = c.pos.y - _origin.y;
    const dz = c.pos.z - _origin.z;
    const t = dx * _dir.x + dy * _dir.y + dz * _dir.z;
    if (t < 0 || t > MAX_PICK_DISTANCE) continue;
    _project.copy(_origin).addScaledVector(_dir, t);
    _toEntity.copy(c.pos).sub(_project);
    const radius = baseRadius + t * rangeGrowth;
    if (_toEntity.lengthSq() > radius * radius) continue;
    if (t < bestT) { bestT = t; bestId = c.id; }
  }
  return bestId;
}
