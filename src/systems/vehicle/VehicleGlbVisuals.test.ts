// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyM151JeepGlbVisual, applyM48TankGlbVisual } from './VehicleGlbVisuals';
import type { TurretRigSource, VehicleModelLoader } from './VehicleGlbVisuals';
import { buildM151JeepMesh } from './M151JeepSpawn';
import { buildM48ChassisMesh } from './M48TankSpawn';

function loaderResolving(glb: THREE.Group): VehicleModelLoader {
  return { loadModel: () => Promise.resolve(glb) };
}

const failingLoader: VehicleModelLoader = {
  loadModel: () => Promise.reject(new Error('offline')),
};

/** Quaternion the war-asset importer bakes onto the TIJ_AxisNormalize wrapper. */
const AXIS_NORMALIZE_QUAT = new THREE.Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2); // +90° Y

/**
 * Mirror the importer's output shape: the turret + gun joints live *under* a
 * `TIJ_AxisNormalize` (+90° Y) wrapper, with the barrel authored along the
 * source +X axis (which the wrapper rotates to engine-forward -Z). This is the
 * structure that broke a naive `removeFromParent` re-seat — the wrapper has to
 * be honoured, so the test asset has to carry it.
 */
function fakeM48Glb(): { glb: THREE.Group; turret: THREE.Object3D; gun: THREE.Object3D; muzzle: THREE.Object3D } {
  const glb = new THREE.Group();
  const axis = new THREE.Object3D();
  axis.name = 'TIJ_AxisNormalize';
  axis.quaternion.copy(AXIS_NORMALIZE_QUAT);
  const body = new THREE.Object3D();
  body.name = 'M48Patton';
  const hullMaterial = new THREE.MeshStandardMaterial();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMaterial);
  hull.name = 'Mesh_Hull';
  const hullSide = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMaterial);
  hullSide.name = 'Mesh_HullSide';
  hullSide.position.set(0, 0, 1.2);
  body.add(hull, hullSide);

  const turret = new THREE.Group();
  turret.name = 'Joint_Turret';
  turret.position.set(1.04, 2.22, -0.11); // source +X-forward authored offset
  const turretMaterial = new THREE.MeshStandardMaterial({ color: 0x44512f });
  const turretCheek = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.5), turretMaterial);
  turretCheek.name = 'Mesh_TurretCheek';
  turretCheek.position.set(0, 0.1, 0.2);
  const turretCupola = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), turretMaterial);
  turretCupola.name = 'Mesh_TurretCupola';
  turretCupola.position.set(0, 0.35, 0.3);
  turret.add(turretCheek, turretCupola);
  const gun = new THREE.Group();
  gun.name = 'Joint_MainGun';
  gun.position.set(3.92, 2.05, 0); // source +X-forward authored offset
  const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x22231e });
  const barrelSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1), gunMaterial);
  barrelSleeve.name = 'Mesh_BarrelSleeve';
  barrelSleeve.position.set(0.4, 0, 0);
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.35), gunMaterial);
  mantlet.name = 'Mesh_Mantlet';
  mantlet.position.set(-0.2, 0, 0);
  // Muzzle tip authored along the source +X axis (forward in source frame).
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial());
  muzzle.name = 'Mesh_MuzzleBrakeCap';
  muzzle.position.set(1.58, 0, 0);
  gun.add(barrelSleeve, mantlet, muzzle);

  body.add(turret, gun);
  axis.add(body);
  glb.add(axis);
  return { glb, turret, gun, muzzle };
}

function fakeTurretRig(): { rig: TurretRigSource; yawNode: THREE.Object3D; pitchNode: THREE.Object3D } {
  const yawNode = new THREE.Object3D();
  yawNode.position.set(0, 1.7, 0);
  const pitchNode = new THREE.Object3D();
  pitchNode.position.set(0, 0.45, -0.3);
  yawNode.add(pitchNode);
  for (const name of ['m48_turret', 'm48_turret_ring', 'm48_cupola']) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    m.name = name;
    yawNode.add(m);
  }
  for (const name of ['m48_mantlet', 'm48_barrel', 'm48_muzzle_brake']) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    m.name = name;
    pitchNode.add(m);
  }
  const rig: TurretRigSource = {
    getTurret: () => ({ getYawNode: () => yawNode, getPitchNode: () => pitchNode }),
  };
  return { rig, yawNode, pitchNode };
}

/** Forward direction of the barrel (gun pivot -> muzzle) in chassis frame. */
function barrelForward(chassisRoot: THREE.Object3D, gun: THREE.Object3D, muzzle: THREE.Object3D): THREE.Vector3 {
  chassisRoot.updateWorldMatrix(false, true);
  const pivot = gun.getWorldPosition(new THREE.Vector3());
  const tip = muzzle.getWorldPosition(new THREE.Vector3());
  return tip.sub(pivot).normalize();
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });
  return meshes;
}

describe('applyM151JeepGlbVisual', () => {
  it('replaces the procedural meshes with the GLB and enables shadows', async () => {
    const root = buildM151JeepMesh();
    const glb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), new THREE.MeshStandardMaterial());
    glb.add(body);

    const ok = await applyM151JeepGlbVisual(root, loaderResolving(glb));

    expect(ok).toBe(true);
    expect(root.children).toContain(glb);
    expect(glb.scale.x).toBeCloseTo(1.15);
    // No procedural Mesh children remain on the chassis root.
    expect(root.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(0);
    expect(body.castShadow).toBe(true);
    expect(body.receiveShadow).toBe(true);
    expect(body.userData.perfCategory).toBe('ground_vehicles');
  });

  it('merges compatible static M151 body meshes without removing vehicle identity', async () => {
    const root = buildM151JeepMesh();
    const glb = new THREE.Group();
    const sharedMaterial = new THREE.MeshStandardMaterial();
    glb.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sharedMaterial),
    );

    const ok = await applyM151JeepGlbVisual(root, loaderResolving(glb));

    expect(ok).toBe(true);
    expect(root.children).toContain(glb);
    expect(glb.userData.perfCategory).toBe('ground_vehicles');
    expect(glb.userData.m151BodyDrawCallOptimization).toMatchObject({
      sourceMeshCount: 2,
      mergedMeshCount: 1,
    });
    const meshes = collectMeshes(glb);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.generatedOptimizedMesh).toBe(true);
    expect(meshes[0].userData.perfCategory).toBe('ground_vehicles');
    expect(meshes[0].castShadow).toBe(true);
    expect(meshes[0].receiveShadow).toBe(true);
  });

  it('keeps the procedural mesh when the load fails', async () => {
    const root = buildM151JeepMesh();
    const before = root.children.length;

    const ok = await applyM151JeepGlbVisual(root, failingLoader);

    expect(ok).toBe(false);
    expect(root.children).toHaveLength(before);
  });
});

describe('applyM48TankGlbVisual', () => {
  it('splits the GLB across chassis root + turret rig nodes', async () => {
    const root = buildM48ChassisMesh();
    const { rig, yawNode, pitchNode } = fakeTurretRig();
    const { glb, turret, gun } = fakeM48Glb();

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(glb));

    expect(ok).toBe(true);
    // Hull content stays on the chassis root; procedural hull boxes removed.
    expect(root.children).toContain(glb);
    expect(root.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(0);
    // Turret rides the yaw node so crew aim traverses it; gun rides the pitch
    // node so it elevates with the barrel.
    expect(turret.parent).toBe(yawNode);
    expect(gun.parent).toBe(pitchNode);
    // Procedural turret + gun parts removed from the rig.
    expect(yawNode.getObjectByName('m48_turret')).toBeUndefined();
    expect(pitchNode.getObjectByName('m48_barrel')).toBeUndefined();
    expect(root.userData.perfCategory).toBe('ground_vehicles');
    expect(turret.userData.perfCategory).toBe('ground_vehicles');
    expect(gun.userData.perfCategory).toBe('ground_vehicles');
  });

  it('merges only the static M48 hull meshes after articulated joints are re-seated', async () => {
    const root = buildM48ChassisMesh();
    const { rig, yawNode, pitchNode } = fakeTurretRig();
    const { glb, turret, gun } = fakeM48Glb();

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(glb));

    expect(ok).toBe(true);
    expect(turret.parent).toBe(yawNode);
    expect(gun.parent).toBe(pitchNode);
    expect(glb.userData.m48HullDrawCallOptimization).toMatchObject({
      sourceMeshCount: 2,
      mergedMeshCount: 1,
    });
    const hullMeshes = collectMeshes(glb);
    expect(hullMeshes).toHaveLength(1);
    expect(hullMeshes[0].userData.generatedOptimizedMesh).toBe(true);
    expect(hullMeshes[0].userData.perfCategory).toBe('ground_vehicles');
    expect(hullMeshes[0].castShadow).toBe(true);
    expect(hullMeshes[0].receiveShadow).toBe(true);
  });

  it('merges rigid M48 turret and gun subtrees without crossing articulation joints', async () => {
    const root = buildM48ChassisMesh();
    const { rig, yawNode, pitchNode } = fakeTurretRig();
    const { glb, turret, gun, muzzle } = fakeM48Glb();

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(glb));

    expect(ok).toBe(true);
    expect(turret.parent).toBe(yawNode);
    expect(gun.parent).toBe(pitchNode);
    expect(turret.userData.m48TurretDrawCallOptimization).toMatchObject({
      sourceMeshCount: 2,
      mergedMeshCount: 1,
    });
    expect(gun.userData.m48GunDrawCallOptimization).toMatchObject({
      sourceMeshCount: 2,
      mergedMeshCount: 1,
    });
    expect(collectMeshes(turret)).toHaveLength(1);
    const gunMeshes = collectMeshes(gun);
    expect(gunMeshes).toHaveLength(2);
    expect(gunMeshes).toContain(muzzle);
    expect(gunMeshes.some((mesh) => mesh.userData.m48GunOptimizedGeneratedResource === true)).toBe(true);
    expect(gun.getObjectByName('Mesh_MuzzleBrakeCap')).toBe(muzzle);
  });

  it('keeps the barrel pointing down-bore after re-seating past the axis wrapper', async () => {
    // The importer wraps the +X-forward source in a +90° Y axis-normalize
    // node. A naive detach would drop that rotation and leave the barrel
    // pointing out the tank's side; the re-seat must preserve engine-forward.
    const root = buildM48ChassisMesh();
    const { rig } = fakeTurretRig();
    const { glb, gun, muzzle } = fakeM48Glb();

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(glb));

    expect(ok).toBe(true);
    const forward = barrelForward(root, gun, muzzle);
    // Engine-forward is chassis-local -Z; the barrel must point down it.
    expect(forward.dot(new THREE.Vector3(0, 0, -1))).toBeGreaterThan(0.99);
  });

  it('traverses + elevates the re-seated turret with the rig', async () => {
    const root = buildM48ChassisMesh();
    const { rig, yawNode, pitchNode } = fakeTurretRig();
    const { glb, gun, muzzle } = fakeM48Glb();

    await applyM48TankGlbVisual(root, rig, loaderResolving(glb));
    const restMuzzle = muzzle.getWorldPosition(new THREE.Vector3());

    // Yaw the turret 90° and elevate the gun — the muzzle must move, proving
    // the GLB parts ride the articulation rig rather than sitting static.
    yawNode.rotation.y = Math.PI / 2;
    pitchNode.rotation.x = 0.3; // +X pitch lifts chassis-local -Z toward +Y
    const aimedForward = barrelForward(root, gun, muzzle);
    const aimedMuzzle = muzzle.getWorldPosition(new THREE.Vector3());

    expect(aimedMuzzle.distanceTo(restMuzzle)).toBeGreaterThan(0.5);
    // After a 90° yaw the barrel swings off chassis -Z toward the side.
    expect(Math.abs(aimedForward.z)).toBeLessThan(0.9);
    // Elevation lifts the muzzle tip above the rest pose.
    expect(aimedForward.y).toBeGreaterThan(0);
  });

  it('keeps every procedural mesh when the GLB lacks the turret joints', async () => {
    const root = buildM48ChassisMesh();
    const { rig, yawNode, pitchNode } = fakeTurretRig();
    const before = root.children.length;
    const bareGlb = new THREE.Group(); // no Joint_Turret / Joint_MainGun

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(bareGlb));

    expect(ok).toBe(false);
    expect(root.children).toHaveLength(before);
    expect(yawNode.getObjectByName('m48_turret')).toBeDefined();
    expect(pitchNode.getObjectByName('m48_barrel')).toBeDefined();
  });

  it('keeps the procedural mesh when the load fails', async () => {
    const root = buildM48ChassisMesh();
    const { rig } = fakeTurretRig();
    const before = root.children.length;

    const ok = await applyM48TankGlbVisual(root, rig, failingLoader);

    expect(ok).toBe(false);
    expect(root.children).toHaveLength(before);
  });
});
