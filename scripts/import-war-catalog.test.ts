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
import { classForward, emitCatalog, mergeCatalogEntries, normalizeAxis, stripRedundantRootYaw, type GlbJson } from './import-war-catalog';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_ROOT = join(REPO_ROOT, 'public', 'models');

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// The yaw the structure class normalizes to (+X forward -> +Z forward).
const Z_YAW = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];

interface GlbNode {
  name?: string;
  rotation?: number[];
  matrix?: number[];
  children?: number[];
}

interface GlbJsonChunk {
  nodes?: GlbNode[];
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  meshes?: Array<{ primitives?: Array<{ indices?: number; attributes?: Record<string, number>; targets?: Array<Record<string, number>> }> }>;
  accessors?: Array<{ bufferView?: number; componentType?: number; type?: string }>;
  bufferViews?: Array<{ byteStride?: number }>;
}

function readGlbJson(glbPath: string): GlbJsonChunk {
  const buf = readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf-8')) as GlbJsonChunk;
}

interface FullGlb {
  nodes: Array<Record<string, unknown>>;
  meshes: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
  accessors: Array<{ bufferView?: number; byteOffset?: number; componentType?: number; type?: string; count?: number; min?: number[]; max?: number[] }>;
  bufferViews: Array<{ byteOffset?: number; byteStride?: number }>;
  scenes: Array<{ nodes?: number[] }>;
  scene?: number;
  bin: Buffer;
}

/** Read both GLB chunks (no deps) for a full geometry-space world-bbox measure. */
function readFullGlb(glbPath: string): FullGlb {
  const data = readFileSync(glbPath);
  let off = 12;
  let json: Record<string, unknown> = {};
  let bin = Buffer.alloc(0);
  while (off < data.length) {
    const len = data.readUInt32LE(off);
    const type = data.readUInt32LE(off + 4);
    off += 8;
    const chunk = data.subarray(off, off + len);
    off += len;
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf-8').trim());
    else if (type === 0x004e4942) bin = Buffer.from(chunk);
  }
  return { nodes: [], meshes: [], accessors: [], bufferViews: [], scenes: [], ...json, bin } as FullGlb;
}

type V3 = [number, number, number];
type M4 = number[];

function trs(t?: number[], q?: number[], s?: number[]): M4 {
  const [tx, ty, tz] = t ?? [0, 0, 0];
  const [x, y, z, w] = q ?? [0, 0, 0, 1];
  const [sx, sy, sz] = s ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * sx, (xy - wz) * sy, (xz + wy) * sz, tx, (xy + wz) * sx, (1 - (xx + zz)) * sy, (yz - wx) * sz, ty, (xz - wy) * sx, (yz + wx) * sy, (1 - (xx + yy)) * sz, tz, 0, 0, 0, 1];
}

function nodeMatrix(n: Record<string, unknown>): M4 {
  const m = n.matrix as number[] | undefined;
  if (m) return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
  return trs(n.translation as number[], n.rotation as number[], n.scale as number[]);
}

function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0) as M4;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}

function applyPoint(m: M4, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3], m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7], m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11]];
}

/** World-space bbox over the scene graph, buffer-decoding POSITION min/max. */
function worldBboxFromGlb(glbPath: string): { min: V3; max: V3 } {
  const g = readFullGlb(glbPath);
  const wmin: V3 = [Infinity, Infinity, Infinity];
  const wmax: V3 = [-Infinity, -Infinity, -Infinity];
  const accMinMax = (idx: number): { min: V3; max: V3 } | null => {
    const a = g.accessors[idx];
    if (!a) return null;
    if (a.min && a.max) return { min: a.min.slice(0, 3) as V3, max: a.max.slice(0, 3) as V3 };
    const bv = a.bufferView !== undefined ? g.bufferViews[a.bufferView] : undefined;
    if (!bv) return null;
    const comp = COMPONENT_BYTES[a.componentType ?? 5126] ?? 4;
    const nc = TYPE_COMPONENTS[a.type ?? 'VEC3'] ?? 3;
    const stride = bv.byteStride ?? comp * nc;
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < (a.count ?? 0); i++) {
      const o = base + i * stride;
      for (let c = 0; c < 3; c++) {
        const v = g.bin.readFloatLE(o + c * 4);
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    return Number.isFinite(min[0]) ? { min, max } : null;
  };
  const recur = (idx: number, parent: M4): void => {
    const n = g.nodes[idx];
    if (!n) return;
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of g.meshes[n.mesh as number]?.primitives ?? []) {
        const pos = p.attributes?.POSITION;
        if (pos === undefined) continue;
        const mm = accMinMax(pos);
        if (!mm) continue;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const w = applyPoint(m, [xi ? mm.max[0] : mm.min[0], yi ? mm.max[1] : mm.min[1], zi ? mm.max[2] : mm.min[2]]);
          for (let c = 0; c < 3; c++) {
            if (w[c] < wmin[c]) wmin[c] = w[c];
            if (w[c] > wmax[c]) wmax[c] = w[c];
          }
        }
      }
    }
    for (const c of (n.children as number[] | undefined) ?? []) recur(c, m);
  };
  for (const r of g.scenes[g.scene ?? 0]?.nodes ?? []) recur(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { min: wmin, max: wmax };
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
    expect(PropModels.FIELD_RADIO_VIEWMODEL).toBe('props/kiln-radio-2026-07/field-radio-viewmodel.glb');
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

describe('single-asset catalog append imports', () => {
  function catalogEntry(overrides: Record<string, unknown>) {
    return {
      slug: 'supply-crate',
      class: 'structures',
      path: 'structures/supply-crate.glb',
      forward: 'pos-z',
      dims: [1, 1, 1],
      tris: 1,
      sizeKB: 1,
      materials: 1,
      minY: 0,
      budgetStatus: 'PASS',
      action: 'replace',
      ...overrides,
    };
  }

  it('merges an imported prop without dropping existing catalog entries', () => {
    const merged = mergeCatalogEntries(
      [catalogEntry({ slug: 'supply-crate' })] as any,
      [catalogEntry({
        slug: 'field-radio-viewmodel',
        class: 'props',
        path: 'props/kiln-radio-2026-07/field-radio-viewmodel.glb',
        action: 'new',
      })] as any,
    );
    expect(merged.map((e) => e.slug).sort()).toEqual(['field-radio-viewmodel', 'supply-crate']);

    const emitted = emitCatalog(merged as any, 'kiln radio viewmodel 2026-07');
    expect(emitted).toContain("SUPPLY_CRATE: 'structures/supply-crate.glb'");
    expect(emitted).toContain("FIELD_RADIO_VIEWMODEL: 'props/kiln-radio-2026-07/field-radio-viewmodel.glb'");
    expect(emitted).toContain('Source batch: kiln radio viewmodel 2026-07.');
  });

  it('records the imported Kiln radio as a prop with Kiln 2026-07 provenance', () => {
    const radio = entry('field-radio-viewmodel');
    expect(radio.class).toBe('props');
    expect(radio.path).toBe('props/kiln-radio-2026-07/field-radio-viewmodel.glb');
    expect(radio.budgetStatus).toBe('PASS');
    expect(entry('supply-crate').path).toBe('structures/supply-crate.glb');

    const provenance = JSON.parse(
      readFileSync(join(REPO_ROOT, 'docs', 'asset-provenance', 'kiln-radio-2026-07', 'field-radio-viewmodel.provenance.json'), 'utf-8'),
    ) as { sourceBatch: string; model: string; handEdit: string };
    expect(provenance.sourceBatch).toBe('kiln radio viewmodel 2026-07');
    expect(provenance.sourceBatch).not.toContain('repaint');
    expect(provenance.model).toBe('google:gemini-3.5-flash');
    expect(provenance.handEdit).toContain('TIJ Radio Viewmodel Drab');
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

describe('axis normalization does not double-rotate a pre-yawed source', () => {
  // Some sources ship with the class normalization yaw already hand-baked into
  // their single scene root ("whole tent yawed -90deg ... matching old TIJ asset
  // orientation"). normalizeAxis then wrapped that root under another copy of the
  // same yaw, so the model rendered net-180deg-rotated (ridge crosswise, entrance
  // reversed) — the aid-station / command-tent "corruption" the owner playtest
  // hit. The importer now cancels the redundant baked yaw before wrapping, so a
  // pre-yawed source ends up identical to an un-yawed one. This guards that class.

  function buildSource(rootRotation?: number[]): GlbJson {
    return {
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'Tent', ...(rootRotation ? { rotation: rootRotation } : {}), children: [1] }, { name: 'Mesh_Body', mesh: 0 }],
    } as unknown as GlbJson;
  }

  function appliedRotations(json: GlbJson): number[][] {
    const out: number[][] = [];
    for (const n of json.nodes ?? []) if (n.rotation) out.push(n.rotation);
    return out;
  }

  it('cancels a baked root yaw equal to the class normalization (single net rotation)', () => {
    const { quat } = classForward('structures');
    const json = buildSource([...Z_YAW]);
    const stripped = stripRedundantRootYaw(json, quat);
    normalizeAxis(json, quat, 'test');
    expect(stripped).toBe(true);
    // Exactly one rotating node (the wrapper) — the baked root yaw was removed,
    // so the two -90deg yaws don't stack into a 180deg flip.
    expect(appliedRotations(json)).toEqual([[...Z_YAW]]);
  });

  it('leaves an un-yawed source untouched (only the wrapper rotates)', () => {
    const { quat } = classForward('structures');
    const json = buildSource(); // no baked root rotation (e.g. barracks-tent)
    const stripped = stripRedundantRootYaw(json, quat);
    normalizeAxis(json, quat, 'test');
    expect(stripped).toBe(false);
    expect(appliedRotations(json)).toEqual([[...Z_YAW]]);
  });

  it('does not strip a baked root rotation that is NOT the normalization yaw', () => {
    const { quat } = classForward('structures');
    const tilt = [0.1, 0, 0, 0.995];
    const json = buildSource([...tilt]);
    expect(stripRedundantRootYaw(json, quat)).toBe(false);
    expect(json.nodes?.[0].rotation).toEqual(tilt);
  });
});

describe('corrupted structures re-imported with a single, correct normalization', () => {
  // The 2026-06-28 owner playtest flagged aid-station + barracks-tent as reading
  // corrupted in-world. Root cause for aid-station was the double-yaw above; the
  // re-import puts its ridge back along Z (+Z forward) with both roof halves.
  // barracks-tent's source carries no baked yaw, so it was already correct — this
  // pins that it stays correct.

  function readStructure(slug: string): { json: GlbJsonChunk; roots: number[]; root: GlbNode } {
    const path = warAssetCatalog[slug].path;
    const json = readGlbJson(join(MODELS_ROOT, path));
    const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
    return { json, roots, root: json.nodes?.[roots[0]] ?? {} };
  }

  it.each(['aid-station', 'barracks-tent'])(
    '%s has a single axis-normalize wrapper with no redundant double-yaw underneath',
    (slug) => {
      const { roots, root, json } = readStructure(slug);
      expect(roots).toHaveLength(1);
      expect(root.name).toBe('TIJ_AxisNormalize');
      // The original model root sits directly under the wrapper and must NOT carry
      // its own copy of the class yaw (that is the double-transform bug). If it
      // did, stripRedundantRootYaw would find it removable.
      const childIdx = root.children?.[0] ?? -1;
      const probe = { scene: 0, scenes: [{ nodes: [childIdx] }], nodes: json.nodes } as unknown as GlbJson;
      expect(stripRedundantRootYaw(probe, Z_YAW), `${slug} model root carries a redundant class yaw`).toBe(false);
    },
  );

  it('keeps both aid-station roof halves (the "missing left roof" symptom was a mis-rotation)', () => {
    const { json } = readStructure('aid-station');
    const names = (json.nodes ?? []).map((n) => n.name);
    expect(names).toContain('Mesh_RoofLeftMesh');
    expect(names).toContain('Mesh_RoofRightMesh');
  });

  it('orients both tents +Z-forward (ridge along the long on-disk Z axis)', () => {
    for (const slug of ['aid-station', 'barracks-tent']) {
      expect(warAssetCatalog[slug].forward).toBe('pos-z');
      // Measure the real on-disk geometry (not the catalog metadata): the world
      // bbox after the single normalization wrap must be Z-long. Pre-fix the
      // aid-station was X-long, contradicting its pos-z forward — the corruption.
      const b = worldBboxFromGlb(join(MODELS_ROOT, warAssetCatalog[slug].path));
      const dx = b.max[0] - b.min[0];
      const dz = b.max[2] - b.min[2];
      expect(dz, `${slug} should be Z-long (dz ${dz} > dx ${dx})`).toBeGreaterThan(dx);
    }
  });
});
