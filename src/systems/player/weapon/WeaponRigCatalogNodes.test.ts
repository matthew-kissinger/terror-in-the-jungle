// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'
import { warAssetCatalog } from '../../assets/modelPaths'

/**
 * Behavior tests for the catalog-driven magazine/muzzle node discovery in the
 * first-person weapon rig (weapons-rig-cutover + weapon-mag-transform-fix).
 *
 * The user-observable contract these guard:
 *   - The reload-animation 'magazine' group contains EXACTLY the magazine
 *     meshes named in the generated warAssetCatalog for that weapon, so the
 *     reload moves the detachable magazine and nothing else. For the repaint
 *     m16, that means the MagSeg / MagFloor meshes (+decals) but NOT
 *     Mesh_Magwell — the receiver well must stay welded to the gun body.
 *   - The 'muzzle' marker rides the per-asset flash hider / muzzle device named
 *     in the catalog so the muzzle flash and shot origin sit at the bore.
 *   - Grouping the magazine meshes does NOT move them in world space. The
 *     repaint GLBs nest the body under a `TIJ_AxisNormalize` wrapper (a −90° Y
 *     quaternion); building the mag group must preserve each part's world pose
 *     so the magazine stays seated in the magwell at the right orientation
 *     (weapon-mag-transform-fix — the magazine rendered rotated ~90° and offset
 *     when the group was re-homed at the GLTF scene root, outside the wrapper).
 *
 * These are NOT mocked against the full THREE mock the legacy
 * WeaponRigManager.test.ts uses; they build real THREE groups whose node names
 * AND hierarchy mirror the shipped GLB vocabularies (axis wrapper > body node >
 * meshes, with the m16 MagSeg decals as children of their MagSeg parents),
 * drive the public init() path, and read back the resulting scene graph.
 */

// Node definitions mirroring the shipped repaint weapon GLBs (verified by
// parsing the GLB JSON chunks). `parent` names the mesh a node is a CHILD of
// (the m16 MagSeg decals hang off their MagSeg parent ~9mm out); a node with no
// `parent` sits directly under the body node. `pos`/`quat` carry real-ish local
// transforms for the magazine meshes so the world-pose-preservation assertions
// have something non-trivial to check. Includes the decoy `Mesh_Magwell` for
// m16 so we can assert it is NOT captured into the magazine group.
interface GlbNode {
  name: string
  parent?: string
  pos?: [number, number, number]
  quat?: [number, number, number, number]
}

const GLB_NODES: Record<string, GlbNode[]> = {
  'weapons/m16a1.glb': [
    { name: 'Mesh_UpperReceiver' }, { name: 'Mesh_LowerReceiver' }, { name: 'Mesh_Magwell' },
    { name: 'Mesh_PistolGrip' }, { name: 'Mesh_HandguardBody' }, { name: 'Mesh_DeltaRing' },
    { name: 'Mesh_Barrel' },
    { name: 'Mesh_FlashHiderBase' }, { name: 'Mesh_FlashHiderBirdcage' }, { name: 'Mesh_FlashHiderBore' },
    // The well-seated mag sits forward + low of the body origin with a slight
    // forward cant. Decals are CHILDREN of the MagSeg they letter, ~9mm out.
    { name: 'Mesh_MagSeg1', pos: [0.043, 0.147, 0], quat: [0.06, 0, 0, 0.998] },
    { name: 'Mesh_MagSeg2', pos: [0.04, 0.09, 0], quat: [0.06, 0, 0, 0.998] },
    { name: 'Mesh_MagSeg2DecalL', parent: 'Mesh_MagSeg2', pos: [0, 0, 0.009] },
    { name: 'Mesh_MagSeg2DecalR', parent: 'Mesh_MagSeg2', pos: [0, 0, -0.009] },
    { name: 'Mesh_MagSeg3', pos: [0.037, 0.033, 0], quat: [0.06, 0, 0, 0.998] },
    { name: 'Mesh_MagSeg3DecalL', parent: 'Mesh_MagSeg3', pos: [0, 0, 0.009] },
    { name: 'Mesh_MagSeg3DecalR', parent: 'Mesh_MagSeg3', pos: [0, 0, -0.009] },
    { name: 'Mesh_MagFloor', pos: [0.034, -0.01, 0], quat: [0.06, 0, 0, 0.998] },
    { name: 'Mesh_Stock' }, { name: 'Mesh_Buttplate' },
  ],
  'weapons/ak47.glb': [
    { name: 'Mesh_ReceiverMain' }, { name: 'Mesh_PistolGrip' },
    { name: 'Mesh_LowerHandguard' }, { name: 'Mesh_UpperHandguard' },
    { name: 'Mesh_Barrel' }, { name: 'Mesh_MuzzleBrake' }, { name: 'Mesh_FrontSightPost' },
    { name: 'Mesh_MagSeg1', pos: [0.05, 0.13, 0], quat: [0.12, 0, 0, 0.993] },
    { name: 'Mesh_MagSeg2', pos: [0.045, 0.07, 0], quat: [0.12, 0, 0, 0.993] },
    { name: 'Mesh_MagSeg3', pos: [0.04, 0.01, 0], quat: [0.12, 0, 0, 0.993] },
    { name: 'Mesh_MagFloor', pos: [0.036, -0.04, 0], quat: [0.12, 0, 0, 0.993] },
    { name: 'Mesh_StockMain' }, { name: 'Mesh_Buttplate' },
  ],
  'weapons/ithaca37.glb': [
    { name: 'Mesh_ReceiverBody' }, { name: 'Mesh_Barrel' }, { name: 'Mesh_BeadSight' }, { name: 'Mesh_MagTube' },
  ],
  'weapons/m3-grease-gun.glb': [
    { name: 'Mesh_Receiver' }, { name: 'Mesh_Barrel' }, { name: 'Mesh_MuzzleBore' },
    { name: 'Mesh_Magazine' }, { name: 'Mesh_MagWell' },
  ],
  'weapons/m1911.glb': [
    { name: 'Mesh_SlideBase' }, { name: 'Mesh_BarrelTip' }, { name: 'Mesh_Bushing' },
    { name: 'Mesh_MagBase' }, { name: 'Mesh_Barrel' },
  ],
  'weapons/m60.glb': [
    { name: 'Mesh_Receiver' }, { name: 'Mesh_Barrel' }, { name: 'Mesh_FlashHiderBase' }, { name: 'Mesh_FlashHiderFlare' },
  ],
  'weapons/m79.glb': [
    { name: 'Mesh_HollowBarrel' }, { name: 'Mesh_ShellRim' }, { name: 'Mesh_Receiver' }, { name: 'Mesh_Barrel' },
  ],
}

// The body-node name inside the axis wrapper, per weapon (mirrors the GLB).
const BODY_NODE: Record<string, string> = {
  'weapons/m16a1.glb': 'M16A1',
  'weapons/ak47.glb': 'AK47',
  'weapons/ithaca37.glb': 'Ithaca37',
  'weapons/m3-grease-gun.glb': 'M3GreaseGun',
  'weapons/m1911.glb': 'M1911',
  'weapons/m60.glb': 'M60',
  'weapons/m79.glb': 'M79',
}

// The importer's axis-normalize quaternion (−90° about Y), verified by direct
// GLB JSON-chunk inspection of the repaint weapon assets.
const AXIS_NORMALIZE_QUAT: [number, number, number, number] = [0, -0.70710678, 0, 0.70710678]

/**
 * Build a fake loaded GLB scene whose hierarchy mirrors the shipped repaint
 * assets: GLTF scene root > TIJ_AxisNormalize (quaternion wrapper) > body node
 * (identity) > meshes, with decal nodes nested under their MagSeg parents.
 */
function buildGlbScene(path: string): THREE.Group {
  const root = new THREE.Group()
  const wrapper = new THREE.Group()
  wrapper.name = 'TIJ_AxisNormalize'
  wrapper.quaternion.set(...AXIS_NORMALIZE_QUAT)
  root.add(wrapper)
  const body = new THREE.Group()
  body.name = BODY_NODE[path] ?? 'Body'
  wrapper.add(body)

  const byName = new Map<string, THREE.Object3D>()
  for (const node of GLB_NODES[path] ?? []) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 0.05),
      new THREE.MeshStandardMaterial(),
    )
    mesh.name = node.name
    if (node.pos) mesh.position.set(...node.pos)
    if (node.quat) mesh.quaternion.set(...node.quat)
    byName.set(node.name, mesh)
    const parent = node.parent ? byName.get(node.parent) ?? body : body
    parent.add(mesh)
  }
  return root
}

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../assets/ModelLoader', () => {
  return {
    modelLoader: {
      loadModel: vi.fn(async (path: string) => buildGlbScene(path)),
    },
  }
})

vi.mock('../../weapons/GunplayCore', () => ({
  GunplayCore: class {
    constructor(public spec: unknown) {}
  },
}))

function collectMagazineLeafNames(rig: THREE.Object3D): string[] {
  const mag = rig.getObjectByName('magazine')
  if (!mag) return []
  const names: string[] = []
  mag.traverse((child) => {
    if (child !== mag && child.name) names.push(child.name)
  })
  return names
}

describe('WeaponRigManager catalog-driven node discovery', () => {
  let manager: WeaponRigManager

  beforeEach(async () => {
    const scene = new THREE.Scene()
    manager = new WeaponRigManager(scene)
    await manager.init()
  })

  it('groups exactly the catalog magazine nodes for the m16a1 (and excludes the magwell)', () => {
    const rig = (manager as unknown as { m16RifleRig: THREE.Group }).m16RifleRig
    const grouped = collectMagazineLeafNames(rig).sort()
    const expected = [...(warAssetCatalog.m16a1.magazineNodes ?? [])].sort()

    expect(grouped).toEqual(expected)
    // The receiver magazine well is part of the gun body, not the detachable
    // magazine, and must never ride the reload group.
    expect(grouped).not.toContain('Mesh_Magwell')
  })

  it('groups exactly the catalog magazine nodes for the ak47', () => {
    const rig = (manager as unknown as { akRifleRig: THREE.Group }).akRifleRig
    const grouped = collectMagazineLeafNames(rig).sort()
    const expected = [...(warAssetCatalog.ak47.magazineNodes ?? [])].sort()

    expect(grouped).toEqual(expected)
  })

  it('builds a muzzle marker for every first-person weapon', () => {
    const rigFields = ['m16RifleRig', 'akRifleRig', 'shotgunRig', 'smgRig', 'pistolRig', 'm60Rig', 'm79Rig']
    for (const field of rigFields) {
      const rig = (manager as unknown as Record<string, THREE.Group>)[field]
      expect(rig.getObjectByName('muzzle'), `${field} muzzle`).toBeDefined()
    }
  })

  it('does not create a detachable magazine group for belt-fed / break-action / shotgun weapons', () => {
    // m60 (belt), m79 (break-action), ithaca37 (fixed tube) have no catalog
    // magazineNodes — the reload must not move any GLB mesh for them.
    for (const field of ['m60Rig', 'm79Rig', 'shotgunRig']) {
      const rig = (manager as unknown as Record<string, THREE.Group>)[field]
      expect(rig.getObjectByName('magazine'), `${field} magazine`).toBeUndefined()
    }
  })

  it('seats the m16 muzzle marker on a catalog muzzle node', () => {
    const rig = (manager as unknown as { m16RifleRig: THREE.Group }).m16RifleRig
    const muzzle = rig.getObjectByName('muzzle')
    expect(muzzle).toBeDefined()
    // The marker is parented to one of the flash-hider meshes named in the
    // catalog (first match wins), not floated free in rig space.
    const parentName = muzzle?.parent?.name ?? ''
    expect(warAssetCatalog.m16a1.muzzleNodes).toContain(parentName)
  })
})

/**
 * weapon-mag-transform-fix regression guard.
 *
 * Grouping the magazine meshes for the reload animation must NOT change where
 * any magazine mesh renders. The repaint weapon GLBs nest the gun body under a
 * `TIJ_AxisNormalize` wrapper (−90° about Y); the previous implementation
 * re-homed the mag group at the GLTF scene ROOT (outside that wrapper) and
 * applied a body-local pivot as if it were a scene-root offset — leaving the
 * viewmodel magazine rotated ~90° and shifted off the magwell from rig load.
 * These tests reproduce the real hierarchy (wrapper > body > mag meshes with
 * decal children + non-zero local transforms) and assert every magazine mesh's
 * WORLD pose is identical to a reference rig built the same way but never
 * grouped. That is exactly the m48 turret lesson (commit 38d98f7d): a test
 * whose fixture lacked the wrapper passed straight over this defect.
 */
describe('WeaponRigManager magazine grouping preserves world pose (weapon-mag-transform-fix)', () => {
  const EPS = 1e-6

  // Mirror prepareWeaponRig's rig-frame transforms (scene.rotation.y = π/2 +
  // rig.scale = 1.5) WITHOUT building a magazine group, so we have a ground
  // truth for where each mag mesh should render. Anything the grouping does is
  // pure scene-graph plumbing and must not perturb these world poses.
  function buildReferenceRig(path: string): THREE.Group {
    const rig = new THREE.Group()
    const scene = buildGlbScene(path)
    scene.rotation.y = Math.PI / 2
    rig.add(scene)
    rig.scale.set(1.5, 1.5, 1.5)
    rig.position.set(0.5, -0.6, -0.82)
    rig.updateMatrixWorld(true)
    return rig
  }

  function assertWorldPosePreserved(rig: THREE.Group, reference: THREE.Group, magNodeNames: string[]): void {
    rig.updateMatrixWorld(true)
    const refPos = new THREE.Vector3()
    const refQuat = new THREE.Quaternion()
    const gotPos = new THREE.Vector3()
    const gotQuat = new THREE.Quaternion()

    for (const name of magNodeNames) {
      const refNode = reference.getObjectByName(name)
      const gotNode = rig.getObjectByName(name)
      expect(refNode, `reference ${name}`).toBeDefined()
      expect(gotNode, `grouped ${name}`).toBeDefined()
      refNode!.getWorldPosition(refPos)
      refNode!.getWorldQuaternion(refQuat)
      gotNode!.getWorldPosition(gotPos)
      gotNode!.getWorldQuaternion(gotQuat)

      expect(gotPos.distanceTo(refPos), `${name} world position drift`).toBeLessThan(EPS)
      // angleTo is the geodesic angle between orientations; 0 means identical.
      expect(gotQuat.angleTo(refQuat), `${name} world orientation drift`).toBeLessThan(EPS)
    }
  }

  let manager: WeaponRigManager

  beforeEach(async () => {
    const scene = new THREE.Scene()
    manager = new WeaponRigManager(scene)
    await manager.init()
  })

  it('keeps every m16a1 magazine mesh (and nested decals) at its pre-grouping world pose', () => {
    const rig = (manager as unknown as { m16RifleRig: THREE.Group }).m16RifleRig
    const reference = buildReferenceRig('weapons/m16a1.glb')
    // Includes the decal children, which must ride with their MagSeg parent and
    // therefore stay put even though they are catalog entries.
    const magNodes = warAssetCatalog.m16a1.magazineNodes ?? []
    assertWorldPosePreserved(rig, reference, magNodes)
  })

  it('keeps every ak47 magazine mesh at its pre-grouping world pose', () => {
    const rig = (manager as unknown as { akRifleRig: THREE.Group }).akRifleRig
    const reference = buildReferenceRig('weapons/ak47.glb')
    const magNodes = warAssetCatalog.ak47.magazineNodes ?? []
    assertWorldPosePreserved(rig, reference, magNodes)
  })

  it('builds the magazine group under the gun body, inside the axis wrapper', () => {
    // The fix hinges on the group living INSIDE the TIJ_AxisNormalize wrapper.
    // Walk the magazine group's ancestry and confirm the wrapper is above it,
    // i.e. the group is NOT re-homed at the GLTF scene root (the old bug).
    const rig = (manager as unknown as { m16RifleRig: THREE.Group }).m16RifleRig
    const mag = rig.getObjectByName('magazine')
    expect(mag).toBeDefined()
    let sawWrapper = false
    for (let p = mag?.parent; p; p = p.parent) {
      if (p.name === 'TIJ_AxisNormalize') sawWrapper = true
    }
    expect(sawWrapper, 'magazine group sits under the axis wrapper').toBe(true)
  })
})
