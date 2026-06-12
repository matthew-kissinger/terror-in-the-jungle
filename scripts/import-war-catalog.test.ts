// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior contract for the generated war-asset catalog and the modelPaths
 * re-export it backs. These assert what consumers of the import pipeline can
 * rely on — the legacy path constants keep resolving, rejected assets are
 * marked and excluded from normalization, weapons/vehicles end up forward on
 * their on-disk axis, and the rig joints the runtime articulation contracts
 * need are recorded — rather than mirroring the importer's internals.
 */

import { describe, expect, it } from 'vitest';
import {
  WeaponModels,
  AircraftModels,
  GroundVehicleModels,
  StructureModels,
  BuildingModels,
  PropModels,
  warAssetCatalog,
  type WarAssetEntry,
} from '../src/systems/assets/modelPaths';

function entry(slug: string): WarAssetEntry {
  const e = warAssetCatalog[slug];
  if (!e) throw new Error(`catalog missing slug ${slug}`);
  return e;
}

describe('modelPaths re-export keeps the legacy registry contract', () => {
  it('preserves the pre-cycle weapon/aircraft/ground/structure/building/prop paths', () => {
    expect(WeaponModels.M16A1).toBe('weapons/m16a1.glb');
    expect(WeaponModels.AK47).toBe('weapons/ak47.glb');
    expect(WeaponModels.M2_BROWNING).toBe('weapons/m2-browning.glb');
    expect(AircraftModels.UH1C_GUNSHIP).toBe('vehicles/aircraft/uh1c-gunship.glb');
    expect(GroundVehicleModels.M48_PATTON).toBe('vehicles/ground/m48-patton.glb');
    expect(StructureModels.HELIPAD).toBe('structures/helipad.glb');
    expect(StructureModels.BARBED_WIRE).toBe('structures/barbed-wire-fence.glb');
    expect(BuildingModels.FRENCH_VILLA).toBe('buildings/french-villa.glb');
    expect(PropModels.WOODEN_BARREL).toBe('props/wooden-barrel.glb');
  });

  it('exposes every catalogued path constant as an existing catalog slug', () => {
    for (const group of [WeaponModels, AircraftModels, GroundVehicleModels, StructureModels, BuildingModels, PropModels]) {
      for (const path of Object.values(group)) {
        const match = Object.values(warAssetCatalog).find((e) => e.path === path);
        expect(match, `no catalog entry for path ${path}`).toBeTruthy();
      }
    }
  });
});

describe('budget triage', () => {
  it('rejects the audited mass-placed / contract-breaking assets', () => {
    const rejected = Object.values(warAssetCatalog)
      .filter((e) => e.budgetStatus === 'REJECT')
      .map((e) => e.slug)
      .sort();
    // The audit memo's expected reject set (8 replacements + egret withheld).
    expect(rejected).toEqual([
      'ammo-bunker',
      'barbed-wire-fence',
      'concertina-wire',
      'egret',
      'helipad',
      'rice-dike',
      'sandbag-bunker',
      'sandbag-wall',
      'toc-bunker',
    ]);
  });

  it('marks a clearly-over-budget structure as an exception, a small prop as pass', () => {
    expect(entry('french-villa').budgetStatus).toBe('EXCEPTION');
    expect(entry('supply-crate').budgetStatus).toBe('PASS');
  });
});

describe('on-disk orientation', () => {
  it('stores weapons and aircraft forward along +Z (long axis is Z)', () => {
    const m16 = entry('m16a1');
    expect(m16.forward).toBe('pos-z');
    expect(m16.dims[2]).toBeGreaterThan(m16.dims[0]); // length > width

    const uh1c = entry('uh1c-gunship');
    expect(uh1c.forward).toBe('pos-z');
    expect(uh1c.dims[2]).toBeGreaterThan(uh1c.dims[0]);
  });

  it('stores ground vehicles forward along -Z (long axis still Z, no loader yaw)', () => {
    const m48 = entry('m48-patton');
    expect(m48.forward).toBe('neg-z');
    expect(m48.dims[2]).toBeGreaterThan(m48.dims[0]);
  });
});

describe('rig grafts recorded for runtime articulation', () => {
  it('records the m48 turret + main-gun joints with their meshes', () => {
    const joints = entry('m48-patton').joints ?? [];
    const turret = joints.find((j) => j.name === 'Joint_Turret');
    const gun = joints.find((j) => j.name === 'Joint_MainGun');
    expect(turret?.meshCount).toBeGreaterThan(0);
    expect(gun?.meshCount).toBeGreaterThan(0);
  });

  it('records canonical rotor joints on the gunship with a spin axis', () => {
    const joints = entry('uh1c-gunship').joints ?? [];
    const main = joints.find((j) => j.name === 'Joint_MainRotor');
    const tail = joints.find((j) => j.name === 'Joint_TailRotor');
    expect(main?.spinAxis).toBe('y');
    expect(tail?.spinAxis).toBe('z');
  });

  it('records explicit magazine + muzzle node anchors for the M16 (substring search drifted)', () => {
    const m16 = entry('m16a1');
    expect(m16.magazineNodes).toContain('Mesh_MagSeg1');
    expect(m16.magazineNodes).toContain('Mesh_MagFloor');
    expect(m16.muzzleNodes).toContain('Mesh_FlashHiderBore');
  });
});
