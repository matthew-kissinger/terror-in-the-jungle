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

function fakeM48Glb(): THREE.Group {
  const glb = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  hull.name = 'Mesh_Hull';
  glb.add(hull);
  const turret = new THREE.Group();
  turret.name = 'Joint_Turret';
  turret.position.set(0, 1.79, -0.3);
  const gun = new THREE.Group();
  gun.name = 'Joint_MainGun';
  gun.position.set(0, 0.35, -1.55); // authored offset relative to the turret ring
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshStandardMaterial());
  barrel.name = 'glb_barrel';
  gun.add(barrel);
  turret.add(gun);
  glb.add(turret);
  return glb;
}

function fakeTurretRig(): { rig: TurretRigSource; yawNode: THREE.Object3D; pitchNode: THREE.Object3D } {
  const yawNode = new THREE.Object3D();
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

describe('applyM151JeepGlbVisual', () => {
  it('replaces the procedural meshes with the GLB and enables shadows', async () => {
    const root = buildM151JeepMesh();
    const glb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 3), new THREE.MeshStandardMaterial());
    glb.add(body);

    const ok = await applyM151JeepGlbVisual(root, loaderResolving(glb));

    expect(ok).toBe(true);
    expect(root.children).toContain(glb);
    // No procedural Mesh children remain on the chassis root.
    expect(root.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(0);
    expect(body.castShadow).toBe(true);
    expect(body.receiveShadow).toBe(true);
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
    const glb = fakeM48Glb();
    const turret = glb.getObjectByName('Joint_Turret')!;
    const gun = glb.getObjectByName('Joint_MainGun')!;

    const ok = await applyM48TankGlbVisual(root, rig, loaderResolving(glb));

    expect(ok).toBe(true);
    // Hull content stays on the chassis root; procedural hull boxes removed.
    expect(root.children).toContain(glb);
    expect(root.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(0);
    // Turret traverses with the rig yaw node, centred on the ring pivot.
    expect(turret.parent).toBe(yawNode);
    expect(turret.position.length()).toBe(0);
    // Gun elevates with the rig pitch node, keeping the authored offset
    // relative to the turret ring minus the pitch node's own offset.
    expect(gun.parent).toBe(pitchNode);
    expect(gun.position.x).toBeCloseTo(0, 5);
    expect(gun.position.y).toBeCloseTo(0.35 - 0.45, 5);
    expect(gun.position.z).toBeCloseTo(-1.55 - -0.3, 5);
    // Procedural turret + gun parts removed from the rig.
    expect(yawNode.getObjectByName('m48_turret')).toBeUndefined();
    expect(pitchNode.getObjectByName('m48_barrel')).toBeUndefined();
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
