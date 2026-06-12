// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'
import { warAssetCatalog } from '../../assets/modelPaths'

/**
 * Behavior tests for the catalog-driven magazine/muzzle node discovery in the
 * first-person weapon rig (weapons-rig-cutover).
 *
 * The user-observable contract these guard:
 *   - The reload-animation 'magazine' group contains EXACTLY the magazine
 *     meshes named in the generated warAssetCatalog for that weapon, so the
 *     reload moves the detachable magazine and nothing else. For the repaint
 *     m16, that means the MagSeg / MagFloor meshes (+decals) but NOT
 *     Mesh_Magwell — the receiver well must stay welded to the gun body.
 *   - The 'muzzle' marker rides the per-asset flash hider / muzzle device named
 *     in the catalog so the muzzle flash and shot origin sit at the bore.
 *
 * These are NOT mocked against the full THREE mock the legacy
 * WeaponRigManager.test.ts uses; they build real THREE groups whose node names
 * mirror the shipped GLB vocabularies, drive the public init() path, and read
 * back the resulting scene graph.
 */

// Node names mirroring the shipped repaint weapon GLBs (verified by parsing the
// GLB JSON chunks). Each weapon's mesh names drive the catalog lookups under
// test. Includes the decoy `Mesh_Magwell` for m16 so we can assert it is NOT
// captured into the magazine group.
const GLB_NODES: Record<string, string[]> = {
  'weapons/m16a1.glb': [
    'Mesh_UpperReceiver', 'Mesh_LowerReceiver', 'Mesh_Magwell', 'Mesh_PistolGrip',
    'Mesh_HandguardBody', 'Mesh_DeltaRing', 'Mesh_Barrel',
    'Mesh_FlashHiderBase', 'Mesh_FlashHiderBirdcage', 'Mesh_FlashHiderBore',
    'Mesh_MagSeg1', 'Mesh_MagSeg2', 'Mesh_MagSeg2DecalL', 'Mesh_MagSeg2DecalR',
    'Mesh_MagSeg3', 'Mesh_MagSeg3DecalL', 'Mesh_MagSeg3DecalR', 'Mesh_MagFloor',
    'Mesh_Stock', 'Mesh_Buttplate',
  ],
  'weapons/ak47.glb': [
    'Mesh_ReceiverMain', 'Mesh_PistolGrip', 'Mesh_LowerHandguard', 'Mesh_UpperHandguard',
    'Mesh_Barrel', 'Mesh_MuzzleBrake', 'Mesh_FrontSightPost',
    'Mesh_MagSeg1', 'Mesh_MagSeg2', 'Mesh_MagSeg3', 'Mesh_MagFloor',
    'Mesh_StockMain', 'Mesh_Buttplate',
  ],
  'weapons/ithaca37.glb': ['Mesh_ReceiverBody', 'Mesh_Barrel', 'Mesh_BeadSight', 'Mesh_MagTube'],
  'weapons/m3-grease-gun.glb': ['Mesh_Receiver', 'Mesh_Barrel', 'Mesh_MuzzleBore', 'Mesh_Magazine', 'Mesh_MagWell'],
  'weapons/m1911.glb': ['Mesh_SlideBase', 'Mesh_BarrelTip', 'Mesh_Bushing', 'Mesh_MagBase', 'Mesh_Barrel'],
  'weapons/m60.glb': ['Mesh_Receiver', 'Mesh_Barrel', 'Mesh_FlashHiderBase', 'Mesh_FlashHiderFlare'],
  'weapons/m79.glb': ['Mesh_HollowBarrel', 'Mesh_ShellRim', 'Mesh_Receiver', 'Mesh_Barrel'],
}

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../assets/ModelLoader', () => {
  return {
    modelLoader: {
      loadModel: vi.fn(async (path: string) => {
        const group = new THREE.Group()
        for (const name of GLB_NODES[path] ?? []) {
          // Each node is a small mesh so the bbox/muzzle-tip logic has geometry.
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.02, 0.05),
            new THREE.MeshStandardMaterial(),
          )
          mesh.name = name
          group.add(mesh)
        }
        return group
      }),
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
