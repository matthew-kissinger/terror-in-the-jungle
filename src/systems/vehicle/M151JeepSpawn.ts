// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../combat/types';
import { GroundVehicle, M151_PHYSICS_CONFIG } from './GroundVehicle';
import { applyM151JeepGlbVisual } from './VehicleGlbVisuals';
import type { VehicleManager } from './VehicleManager';

/**
 * M151 scenario spawn. The spawn itself stays synchronous (stable-id
 * IVehicle present as soon as the scenario starts, procedural placeholder
 * mesh); `applyM151JeepGlbVisual` then swaps in `m151-jeep.glb` when the
 * model resolves, keeping the procedural mesh only as a load-failure
 * fallback.
 */

const M151_HULL = {
  length: 3.4,
  width: 1.6,
  bodyHeight: 0.65,
  hoodHeight: 0.45,
  wheelRadius: 0.36,
  wheelWidth: 0.18,
} as const;

const oliveDrab = new THREE.MeshStandardMaterial({ color: 0x3f4a2f, roughness: 0.82, metalness: 0.08, flatShading: true });
const darkRubber = new THREE.MeshStandardMaterial({ color: 0x151512, roughness: 0.9, metalness: 0.02, flatShading: true });
const canvasGreen = new THREE.MeshStandardMaterial({ color: 0x2f3825, roughness: 0.9, metalness: 0.03, flatShading: true });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb0ad, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.45 });

export function buildM151JeepMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'm151_jeep_root';
  root.userData.perfCategory = 'ground_vehicles';

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(M151_HULL.width, M151_HULL.bodyHeight, M151_HULL.length),
    oliveDrab,
  );
  chassis.position.y = 0.65;
  chassis.name = 'm151_chassis';
  root.add(chassis);

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(M151_HULL.width * 0.88, M151_HULL.hoodHeight, M151_HULL.length * 0.34),
    oliveDrab,
  );
  hood.position.set(0, 1.05, -0.85);
  hood.name = 'm151_hood';
  root.add(hood);

  const rearTub = new THREE.Mesh(
    new THREE.BoxGeometry(M151_HULL.width * 0.9, 0.42, M151_HULL.length * 0.42),
    canvasGreen,
  );
  rearTub.position.set(0, 1.04, 0.55);
  rearTub.name = 'm151_rear_tub';
  root.add(rearTub);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(M151_HULL.width * 0.82, 0.55, 0.05),
    glassMat,
  );
  windshield.position.set(0, 1.45, -0.2);
  windshield.rotation.x = -0.18;
  windshield.name = 'm151_windshield';
  root.add(windshield);

  const seatGeom = new THREE.BoxGeometry(0.46, 0.24, 0.42);
  for (const [x, z] of [[-0.32, 0.18], [0.32, 0.18], [-0.32, 0.82], [0.32, 0.82]] as const) {
    const seat = new THREE.Mesh(seatGeom, canvasGreen);
    seat.position.set(x, 1.28, z);
    seat.name = 'm151_seat';
    root.add(seat);
  }

  const wheelGeom = new THREE.CylinderGeometry(M151_HULL.wheelRadius, M151_HULL.wheelRadius, M151_HULL.wheelWidth, 14);
  wheelGeom.rotateZ(Math.PI * 0.5);
  for (const [x, z] of [[-0.88, -0.95], [0.88, -0.95], [-0.88, 1.0], [0.88, 1.0]] as const) {
    const wheel = new THREE.Mesh(wheelGeom, darkRubber);
    wheel.position.set(x, 0.42, z);
    wheel.name = 'm151_wheel';
    root.add(wheel);
  }

  const spare = new THREE.Mesh(wheelGeom, darkRubber);
  spare.position.set(0, 0.88, 1.82);
  spare.rotation.y = Math.PI * 0.5;
  spare.name = 'm151_spare_tire';
  root.add(spare);

  return root;
}

export interface M151ScenarioSpawnDefinition {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}

export const M151_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', M151ScenarioSpawnDefinition> = {
  open_frontier: {
    vehicleId: 'm151_jeep_open_frontier_motor_pool',
    position: new THREE.Vector3(176, 0, -1188),
    faction: Faction.US,
    initialYaw: Math.PI * 0.73,
  },
  a_shau_valley: {
    vehicleId: 'm151_jeep_ashau_tabat_motor_pool',
    position: new THREE.Vector3(-702.4, 0, -5033.5),
    faction: Faction.US,
    initialYaw: Math.PI * 0.47,
  },
};

export type M151ScenarioMode = keyof typeof M151_SCENARIO_SPAWNS;

export function createM151Jeep(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  options: M151ScenarioSpawnDefinition,
): { jeep: GroundVehicle; root: THREE.Group } {
  const root = buildM151JeepMesh();
  root.position.copy(options.position);
  root.rotation.y = options.initialYaw;
  scene.add(root);

  const jeep = new GroundVehicle(options.vehicleId, root, options.faction, undefined, M151_PHYSICS_CONFIG);
  vehicleManager.register(jeep);
  // Fire-and-forget visual upgrade; the procedural mesh stays on failure.
  void applyM151JeepGlbVisual(root);
  return { jeep, root };
}

export function spawnScenarioM151Jeeps(args: {
  modes: M151ScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  resolvePosition?: (mode: M151ScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; jeep: GroundVehicle; root: THREE.Group }> {
  const spawned: Array<{ vehicleId: string; jeep: GroundVehicle; root: THREE.Group }> = [];
  for (const mode of args.modes) {
    const def = M151_SCENARIO_SPAWNS[mode];
    const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position.clone();
    const parts = createM151Jeep(args.scene, args.vehicleManager, {
      ...def,
      position,
    });
    spawned.push({ vehicleId: def.vehicleId, ...parts });
  }
  return spawned;
}
