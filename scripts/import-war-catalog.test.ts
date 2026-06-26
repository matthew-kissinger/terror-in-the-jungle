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

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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

const MODELS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

interface GlbJsonChunk {
  meshes?: Array<{ primitives?: Array<{ indices?: number; attributes?: Record<string, number>; targets?: Array<Record<string, number>> }> }>;
  accessors?: Array<{ bufferView?: number; componentType?: number; type?: string }>;
  bufferViews?: Array<{ byteStride?: number }>;
}

function readGlbJson(glbPath: string): GlbJsonChunk {
  const buf = readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf-8')) as GlbJsonChunk;
}

/** Count indexed vs non-indexed primitives by reading the GLB JSON chunk. */
function primitiveIndexing(glbPath: string): { indexed: number; nonIndexed: number } {
  const json = readGlbJson(glbPath);
  let indexed = 0;
  let nonIndexed = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) indexed += 1;
      else nonIndexed += 1;
    }
  }
  return { indexed, nonIndexed };
}

/**
 * Count vertex-attribute accessors whose bufferView carries a non-tight
 * `byteStride` (i.e. is interleaved). THREE r184's GLTFLoader builds an
 * `InterleavedBufferAttribute` for exactly these, and `mergeGeometries` cannot
 * merge an interleaved attribute against a packed one (gpuType mismatch). A
 * canonical import leaves zero of these.
 */
function interleavedAttributeAccessors(glbPath: string): number {
  const json = readGlbJson(glbPath);
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];
  const attributeAccessors = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      for (const a of Object.values(prim.attributes ?? {})) attributeAccessors.add(a);
      for (const target of prim.targets ?? []) for (const a of Object.values(target)) attributeAccessors.add(a);
    }
  }
  let interleaved = 0;
  for (const ai of attributeAccessors) {
    const a = accessors[ai];
    if (!a || a.bufferView === undefined) continue;
    const bv = bufferViews[a.bufferView];
    if (!bv || bv.byteStride === undefined) continue;
    const tight = (COMPONENT_BYTES[a.componentType ?? 5126] ?? 4) * (TYPE_COMPONENTS[a.type ?? 'SCALAR'] ?? 1);
    if (bv.byteStride !== tight) interleaved += 1;
  }
  return interleaved;
}

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
    // The audit memo's reject set (8 replacements + egret withheld) plus the one
    // over-budget Kiln war-export asset (burmese-python-rest: 22k tris / 582KB).
    expect(rejected).toEqual([
      'ammo-bunker',
      'barbed-wire-fence',
      'burmese-python-rest',
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

describe('imported GLBs are uniformly indexed so THREE merges are all-or-none', () => {
  // CombatantRenderer.createOptimizedWeaponRoot merges every mesh of an
  // NPC-held weapon GLB; THREE's mergeGeometries requires every geometry to be
  // uniformly indexed (all or none). The pixel-forge source ships the
  // occasional non-indexed primitive inside an otherwise-indexed model
  // (ak47's muzzle brake), which used to break the merge and spam console
  // errors. The importer now synthesizes a sequential index buffer for any
  // primitive that lacks one, so no consumer hits the mixed-index case.

  const onDiskEntries: WarAssetEntry[] = Object.values(warAssetCatalog).filter((e) =>
    existsSync(join(MODELS_ROOT, e.path)),
  );

  it('finds the catalogued GLBs on disk to assert against', () => {
    expect(onDiskEntries.length).toBeGreaterThan(0);
  });

  it.each(onDiskEntries.map((e) => [e.slug, e.path] as const))(
    '%s has zero non-indexed primitives',
    (_slug, path) => {
      const { indexed, nonIndexed } = primitiveIndexing(join(MODELS_ROOT, path));
      expect(indexed).toBeGreaterThan(0);
      expect(nonIndexed).toBe(0);
    },
  );

  it('covers the weapons whose mixed indexing broke the combat120 weapon merge', () => {
    for (const path of [WeaponModels.AK47, WeaponModels.M60, WeaponModels.M79]) {
      expect(primitiveIndexing(join(MODELS_ROOT, path)).nonIndexed).toBe(0);
    }
  });
});

describe('imported GLBs use tightly-packed (de-interleaved) attribute storage', () => {
  // THREE r184 builds an InterleavedBufferAttribute for any accessor whose
  // bufferView has a non-tight byteStride, and a plain BufferAttribute for
  // packed ones. BufferGeometryUtils.mergeGeometries cannot merge across the two
  // (InterleavedBufferAttribute lacks gpuType -> "gpuType must be consistent"
  // throw), so the pixel-forge source's MIXED interleaved/packed layout broke the
  // CombatantRenderer NPC-weapon merge and spammed the combat120 console. The
  // importer now de-interleaves every attribute accessor, so every imported GLB
  // loads as plain BufferAttributes only and merges cleanly.

  // REJECT replacements keep their prior (un-reimported) GLB bytes on disk, which
  // are outside this canonicalization contract — assert only on the imported set.
  const importedEntries: WarAssetEntry[] = Object.values(warAssetCatalog).filter(
    (e) => e.budgetStatus !== 'REJECT' && existsSync(join(MODELS_ROOT, e.path)),
  );

  it('finds imported (non-reject) GLBs on disk to assert against', () => {
    expect(importedEntries.length).toBeGreaterThan(0);
  });

  it.each(importedEntries.map((e) => [e.slug, e.path] as const))(
    '%s has zero interleaved (non-tight byteStride) attribute accessors',
    (_slug, path) => {
      expect(interleavedAttributeAccessors(join(MODELS_ROOT, path))).toBe(0);
    },
  );

  it('de-interleaves the weapons whose mixed storage threw the gpuType merge error', () => {
    for (const path of [WeaponModels.M16A1, WeaponModels.AK47, WeaponModels.M60]) {
      expect(interleavedAttributeAccessors(join(MODELS_ROOT, path))).toBe(0);
    }
  });
});
