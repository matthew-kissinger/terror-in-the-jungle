#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * War-asset repaint importer (cycle-2026-06-11-war-asset-repaint).
 *
 * Generalizes the aircraft-only `import-pixel-forge-aircraft.ts` into a
 * class-aware, idempotent pipeline for the full 108-asset pixel-forge repaint
 * package. Replaces the package's blind `copy-to-tij.ps1` (which bypasses
 * every acceptance gate). See docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md
 * for the five drop-in breaks this corrects (axis, deleted rig joints, deleted
 * animations, node-vocab drift, budget blowouts).
 *
 * What it does, per source asset:
 *   1. Parse the GLB JSON + BIN chunks; measure world bbox (buffer-decoding
 *      POSITION when accessor min/max is absent — artillery-pit), tris,
 *      materials, minY.
 *   2. Normalize the rig vocabulary to the canonical joint contract
 *      (scripts/asset-import/joint-taxonomy.json): auto-detect every Joint_*
 *      node, map its generator-native name to ONE canonical name + semantic
 *      role (Joint_Rotor -> Joint_MainRotor; Joint_Gun -> Joint_MainGun;
 *      Joint_PropLeft -> Joint_PropellerL), rename the node, record
 *      {name,type,spinAxis}, and validate each asset resolved the joints its
 *      rig profile requires (a missing rotor/turret fails the import instead of
 *      dying silently at runtime). Geometric thin-axis cross-checks spin axes.
 *   3. Axis-normalize per class (+X-forward source -> +Z on-disk for
 *      weapons/aircraft/structures/etc., +X -> -Z for ground vehicles) using
 *      the proven quaternion-wrap-node pattern.
 *   4. Budget-triage -> PASS / EXCEPTION / REJECT. REJECTs keep the prior GLB
 *      bytes on disk and get a REROLL_REQUESTS.md entry.
 *   5. Write the normalized GLB to its tijTarget, copy a provenance record,
 *      and (after the full pass) emit src/config/generated/warAssetCatalog.ts.
 *
 * Idempotent: every run transforms the immutable source package, so a second
 * run produces byte-identical targets + catalog (zero git diff).
 *
 * Usage:
 *   npx tsx scripts/import-war-catalog.ts            # full import
 *   npx tsx scripts/import-war-catalog.ts --dry-run  # measure + table, no writes
 *   npx tsx scripts/import-war-catalog.ts --source <dir>
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CATALOG_SCALE_FIX } from './asset-import/catalog-scale-fix';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ELEMENT_ARRAY_BUFFER = 34963;
const ARRAY_BUFFER = 34962;
const USHORT_MAX_VERTS = 65536;
const AXIS_NODE_NAME = 'TIJ_AxisNormalize';
// Quaternion that rotates +X forward to +Z forward (yaw -90 deg about Y).
const X_TO_Z = [0, -Math.SQRT1_2, 0, Math.SQRT1_2] as const;
// Quaternion that rotates +X forward to -Z forward (yaw +90 deg about Y).
const X_TO_NEG_Z = [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const;

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

type ForwardAxis = 'pos-z' | 'neg-z';

interface ManifestAsset {
  slug: string;
  class: string;
  status: string;
  file: string;
  bytes: number;
  tris: number;
  model: string;
  action: 'replace' | 'new';
  handEdit: string | null;
  tijTarget: string;
  generatedAt: string;
}

interface Manifest {
  batch: string;
  generatedAt: string;
  assets: ManifestAsset[];
}

interface GlbNode {
  name?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  mesh?: number;
  children?: number[];
  [k: string]: unknown;
}

interface GlbJson {
  asset?: { generator?: string; [k: string]: unknown };
  scene?: number;
  scenes?: Array<{ nodes?: number[]; [k: string]: unknown }>;
  nodes?: GlbNode[];
  meshes?: Array<{ primitives?: Array<{ indices?: number; attributes?: Record<string, number> }> }>;
  accessors?: Array<{ name?: string; bufferView?: number; byteOffset?: number; componentType?: number; count?: number; type?: string; min?: number[]; max?: number[] }>;
  bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength?: number; byteStride?: number; target?: number }>;
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  materials?: unknown[];
  animations?: unknown[];
  [k: string]: unknown;
}

/**
 * One canonical articulation role in the rig contract
 * (scripts/asset-import/joint-taxonomy.json). `aliases` are the
 * generator-native joint names that all normalize to `canonical`.
 */
interface JointRoleSpec {
  role: string;
  canonical: string;
  type?: 'mainBlades' | 'tailBlades';
  spinAxis?: 'x' | 'y' | 'z';
  aliases: string[];
  doc?: string;
}

interface WeaponNodeRules {
  magazineIncludePattern: string;
  magazineExcludePattern: string;
  muzzleIncludePattern: string;
  overrides?: Record<string, { magazineNodes?: string[]; muzzleNodes?: string[] }>;
}

/** The whole canonical rig contract, loaded from joint-taxonomy.json. */
interface JointTaxonomy {
  jointRoles: JointRoleSpec[];
  ignoreJointPattern: string;
  rigProfiles: Record<string, string[]>;
  assetRigProfiles: Record<string, string>;
  weaponNodes: WeaponNodeRules;
}

/** Compiled lookup tables derived once from a JointTaxonomy. */
interface CompiledTaxonomy {
  taxonomy: JointTaxonomy;
  aliasToRole: Map<string, JointRoleSpec>;
  roleByName: Map<string, JointRoleSpec>;
  ignore: RegExp;
}

/** A rig-normalization finding surfaced to the import report. */
interface RigIssue {
  slug: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

interface JointRecord {
  name: string;
  type?: string;
  spinAxis?: string;
  meshCount: number;
}

type BudgetStatus = 'PASS' | 'EXCEPTION' | 'REJECT';

interface CatalogEntry {
  slug: string;
  class: string;
  path: string;
  forward: ForwardAxis;
  dims: [number, number, number];
  tris: number;
  sizeKB: number;
  materials: number;
  minY: number;
  budgetStatus: BudgetStatus;
  action: 'replace' | 'new';
  joints?: JointRecord[];
  magazineNodes?: string[];
  muzzleNodes?: string[];
}

interface TriageResult {
  status: BudgetStatus;
  reasons: string[];
  rerollTargetTris?: number;
}

// ─── CLI args ───────────────────────────────────────────────────────────────

function argValue(name: string, fallback: string): string {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

// ─── GLB read/write (chunk-faithful, deterministic) ──────────────────────────

function readGlb(file: string): { json: GlbJson; bin: Buffer | null } {
  const data = readFileSync(file);
  if (data.toString('utf-8', 0, 4) !== 'glTF') throw new Error(`${file} is not a binary glTF.`);
  let off = 12;
  let json: GlbJson | null = null;
  let bin: Buffer | null = null;
  while (off < data.length) {
    const len = data.readUInt32LE(off);
    const type = data.readUInt32LE(off + 4);
    off += 8;
    const chunk = data.subarray(off, off + len);
    off += len;
    if (type === JSON_CHUNK_TYPE) json = JSON.parse(chunk.toString('utf-8').trim()) as GlbJson;
    else if (type === BIN_CHUNK_TYPE) bin = Buffer.from(chunk);
  }
  if (!json) throw new Error(`No JSON chunk in ${file}.`);
  return { json, bin };
}

function makeChunk(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(payload.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, payload], 8 + payload.length);
}

/**
 * Fail loudly if any embedded image's declared mimeType disagrees with its
 * actual byte signature. Guards against the `canonicalizeBuffers` class of bug
 * where `image.bufferView` is mis-remapped onto geometry (palette PNGs read as
 * index-buffer bytes -> "GLTFLoader: Couldn't load texture blob" at runtime).
 */
function assertImageBytesValid(file: string, json: GlbJson, bin: Buffer | null): void {
  if (!bin) return;
  const bvs = json.bufferViews ?? [];
  const images = (json.images ?? []) as Array<{ bufferView?: number; mimeType?: string; name?: string }>;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img.bufferView !== 'number') continue;
    const bv = bvs[img.bufferView];
    if (!bv) continue;
    const d = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + Math.min(16, bv.byteLength ?? 0));
    const mime = img.mimeType ?? '';
    const isPng = d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47;
    const isJpeg = d[0] === 0xff && d[1] === 0xd8;
    const isWebp = d.subarray(0, 4).toString('ascii') === 'RIFF' && d.subarray(8, 12).toString('ascii') === 'WEBP';
    const ok =
      (mime === 'image/png' && isPng) ||
      (mime === 'image/jpeg' && isJpeg) ||
      (mime === 'image/webp' && isWebp) ||
      (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp');
    if (!ok) {
      throw new Error(
        `Texture integrity check failed for ${file}: image[${i}] (${img.name ?? ''}) declares ` +
          `${mime} but bytes start 0x${d.subarray(0, 4).toString('hex')} — canonicalizeBuffers likely ` +
          `mis-remapped image.bufferView onto geometry.`,
      );
    }
  }
}

function writeGlb(file: string, json: GlbJson, bin: Buffer | null): void {
  assertImageBytesValid(file, json, bin);
  const jsonText = JSON.stringify(json);
  const jsonPad = (4 - (Buffer.byteLength(jsonText) % 4)) % 4;
  const jsonBuf = Buffer.from(`${jsonText}${' '.repeat(jsonPad)}`, 'utf-8');
  const chunks = [makeChunk(JSON_CHUNK_TYPE, jsonBuf)];
  if (bin) {
    const binPad = (4 - (bin.length % 4)) % 4;
    chunks.push(makeChunk(BIN_CHUNK_TYPE, binPad ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : bin));
  }
  const total = 12 + chunks.reduce((s, c) => s + c.length, 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'utf-8');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  writeFileSync(file, Buffer.concat([header, ...chunks], total));
}

// ─── Index synthesis (make every primitive indexed) ──────────────────────────

/**
 * THREE's BufferGeometryUtils.mergeGeometries requires every merged geometry to
 * be uniformly indexed (all-or-none). The pixel-forge source ships the
 * occasional non-indexed primitive inside an otherwise-indexed model (e.g.
 * ak47's Mesh_MuzzleBrake), so any runtime consumer that merges a model's
 * meshes (CombatantRenderer.createOptimizedWeaponRoot) fails to merge and falls
 * back to unmerged multi-mesh geometry, spamming console errors and inflating
 * draw calls.
 *
 * Fix at import time: synthesize a sequential index buffer (0..count-1) for
 * every primitive that lacks an `indices` accessor, appending the bytes to the
 * BIN chunk and bookkeeping a new bufferView + accessor consistent with how the
 * source already encodes its existing index buffers. After this pass every
 * primitive in every imported GLB is indexed, so merges are all-or-none.
 *
 * Idempotent: a primitive that already has `indices` is skipped, so re-running
 * over already-indexed output appends nothing and produces zero byte diffs.
 *
 * Returns the (possibly extended) BIN buffer; `bin` is unchanged when no
 * primitive needed indices.
 */
function synthesizeIndices(json: GlbJson, bin: Buffer | null): Buffer | null {
  const appended: Buffer[] = [];
  let cursor = bin ? bin.length : 0;
  const baseLen = cursor;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) continue;

      const posIdx = prim.attributes?.POSITION;
      if (posIdx === undefined) continue; // nothing to index against
      const count = json.accessors?.[posIdx]?.count ?? 0;
      if (count <= 0) continue;

      const useUint = count >= USHORT_MAX_VERTS;
      const componentType = useUint ? UNSIGNED_INT : UNSIGNED_SHORT;
      const compBytes = useUint ? 4 : 2;

      // glTF requires a bufferView's byteOffset to be a multiple of the
      // component size; pad the running cursor up to that boundary.
      const pad = (compBytes - (cursor % compBytes)) % compBytes;
      if (pad > 0) {
        appended.push(Buffer.alloc(pad, 0));
        cursor += pad;
      }

      const idxBuf = Buffer.alloc(count * compBytes);
      for (let i = 0; i < count; i++) {
        if (useUint) idxBuf.writeUInt32LE(i, i * 4);
        else idxBuf.writeUInt16LE(i, i * 2);
      }

      json.bufferViews ??= [];
      const bufferViewIdx = json.bufferViews.length;
      json.bufferViews.push({
        buffer: 0,
        byteOffset: cursor,
        byteLength: idxBuf.length,
        target: ELEMENT_ARRAY_BUFFER,
      });

      json.accessors ??= [];
      const accessorIdx = json.accessors.length;
      const accName = json.accessors[posIdx]?.name;
      json.accessors.push({
        ...(accName ? { name: `${accName.replace(/_pos$/, '')}_synthidx` } : {}),
        type: 'SCALAR',
        componentType,
        count,
        bufferView: bufferViewIdx,
        byteOffset: 0,
      });

      prim.indices = accessorIdx;
      appended.push(idxBuf);
      cursor += idxBuf.length;
    }
  }

  if (appended.length === 0) return bin;

  const extended = bin ? Buffer.concat([bin, ...appended]) : Buffer.concat(appended);
  json.buffers ??= [{ byteLength: 0 }];
  json.buffers[0] = { ...(json.buffers[0] ?? {}), byteLength: baseLen + appended.reduce((s, b) => s + b.length, 0) };
  return extended;
}

// ─── Canonical buffer storage (de-interleave + compact BIN rebuild) ──────────

/**
 * THREE r184's GLTFLoader builds an `InterleavedBufferAttribute` for any accessor
 * whose bufferView carries a non-tight `byteStride`, and a plain `BufferAttribute`
 * for tightly-packed ones. `BufferGeometryUtils.mergeGeometries` cannot merge
 * across the two — `InterleavedBufferAttribute` has no `gpuType`, so the gpuType
 * consistency check throws ("mergeAttributes() failed. BufferAttribute.gpuType
 * must be consistent"). The pixel-forge source ships a MIXED layout: 98 of 99
 * GLBs interleave some primitives and tightly-pack others within the same file
 * (m16a1: 38 strided + 37 tight accessors). The runtime weapon merge in
 * CombatantRenderer.createOptimizedWeaponRoot then fails to merge, falls back to
 * unmerged meshes, and spams the console while inflating draw calls.
 *
 * This pass canonicalizes buffer storage so every accessor lands in its own
 * tightly-packed bufferView (no interleaving, no shared strided blocks). The BIN
 * chunk is rebuilt from scratch so dead interleaved bytes do not linger as
 * zombies. After this pass three's GLTFLoader yields only plain
 * `BufferAttribute`s and mergeGeometries succeeds over any subset.
 *
 * What it preserves byte-exact: it copies each accessor's logical values element
 * by element (read with the source stride + byteOffset, write tight) — these are
 * lossless copies of the same Float32/UINT8/… bytes, with NO requantization and
 * NO precision change. Any bufferView NOT referenced by an accessor (embedded
 * texture image data lives in BIN this way) is copied byte-for-byte and its
 * references (images[].bufferView) remapped, so pixel data is never touched.
 *
 * Alignment: every emitted bufferView starts on a 4-byte boundary (the strictest
 * glTF component-size requirement here), and each accessor's byteOffset is 0
 * because it owns its bufferView — so accessor byteOffsets are trivially valid
 * multiples of the component size.
 *
 * Idempotency: packing walks accessors then non-accessor bufferViews in index
 * order and emits tight, deterministic bytes. Re-running over already-canonical
 * output reads the same tight values and re-emits the identical layout — zero
 * byte diffs.
 */
function canonicalizeBuffers(json: GlbJson, bin: Buffer | null): Buffer | null {
  if (!bin) return bin;
  const accessors = json.accessors ?? [];
  const bufferViews = json.bufferViews ?? [];
  if (accessors.length === 0 && bufferViews.length === 0) return bin;

  // Classify which bufferViews hold index data vs vertex-attribute data so the
  // rebuilt views carry the correct ARRAY_BUFFER / ELEMENT_ARRAY_BUFFER target,
  // consistent with how the source (and synthesizeIndices) tag their views.
  const indexAccessors = new Set<number>();
  const attributeAccessors = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) indexAccessors.add(prim.indices);
      for (const a of Object.values(prim.attributes ?? {})) attributeAccessors.add(a);
      for (const target of (prim as { targets?: Array<Record<string, number>> }).targets ?? []) {
        for (const a of Object.values(target)) attributeAccessors.add(a);
      }
    }
  }

  const out: Buffer[] = [];
  let cursor = 0;
  const newBufferViews: NonNullable<GlbJson['bufferViews']> = [];

  const pushAligned = (payload: Buffer, target: number | undefined): number => {
    const pad = (4 - (cursor % 4)) % 4;
    if (pad > 0) {
      out.push(Buffer.alloc(pad, 0));
      cursor += pad;
    }
    const bvIdx = newBufferViews.length;
    newBufferViews.push({
      buffer: 0,
      byteOffset: cursor,
      byteLength: payload.length,
      ...(target !== undefined ? { target } : {}),
    });
    out.push(payload);
    cursor += payload.length;
    return bvIdx;
  };

  // Snapshot which bufferViews the accessors reference BEFORE step 1 reassigns
  // `accessor.bufferView` to its new tight index. Step 2 needs the ORIGINAL index
  // space to tell geometry views (now repacked) apart from image views (copied
  // verbatim + remapped). Building this set AFTER step 1 compared pre-repack
  // bufferView indices against post-repack ones, mis-skipped the texture views,
  // and left `image.bufferView` aimed at geometry — palette PNGs were read as
  // index-buffer bytes, surfacing at runtime as
  // "THREE.GLTFLoader: Couldn't load texture blob:...".
  const accessorBufferViews = new Set<number>();
  for (const a of accessors) if (a.bufferView !== undefined) accessorBufferViews.add(a.bufferView);

  // 1. Repack every accessor that references a bufferView into its own tight view.
  for (let ai = 0; ai < accessors.length; ai++) {
    const a = accessors[ai];
    if (a.bufferView === undefined) continue; // sparse-only / generated accessor
    const srcBv = bufferViews[a.bufferView];
    if (!srcBv) continue;
    const comp = COMPONENT_BYTES[a.componentType ?? FLOAT] ?? 4;
    const nc = TYPE_COMPONENTS[a.type ?? 'SCALAR'] ?? 1;
    const itemBytes = comp * nc;
    const stride = srcBv.byteStride ?? itemBytes;
    const base = (srcBv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const count = a.count ?? 0;

    const tight = Buffer.alloc(count * itemBytes);
    for (let i = 0; i < count; i++) {
      bin.copy(tight, i * itemBytes, base + i * stride, base + i * stride + itemBytes);
    }

    const target = indexAccessors.has(ai)
      ? ELEMENT_ARRAY_BUFFER
      : attributeAccessors.has(ai)
        ? ARRAY_BUFFER
        : srcBv.target;
    const bvIdx = pushAligned(tight, target);
    a.bufferView = bvIdx;
    a.byteOffset = 0;
  }

  // 2. Copy any bufferView not referenced by an accessor byte-exact (embedded
  //    texture image data), remapping the references that point at it. Uses the
  //    pre-repack snapshot so image views are never mistaken for geometry.
  const referenced = accessorBufferViews;
  const remap = new Map<number, number>();
  for (let bv = 0; bv < bufferViews.length; bv++) {
    if (referenced.has(bv)) continue;
    const src = bufferViews[bv];
    const start = src.byteOffset ?? 0;
    const slice = Buffer.from(bin.subarray(start, start + (src.byteLength ?? 0)));
    const bvIdx = pushAligned(slice, src.target);
    if (src.byteStride !== undefined) newBufferViews[bvIdx].byteStride = src.byteStride;
    remap.set(bv, bvIdx);
  }
  if (remap.size > 0) {
    for (const img of (json.images ?? []) as Array<{ bufferView?: number }>) {
      if (img.bufferView !== undefined && remap.has(img.bufferView)) img.bufferView = remap.get(img.bufferView)!;
    }
  }

  json.bufferViews = newBufferViews;
  const rebuilt = Buffer.concat(out);
  json.buffers ??= [{ byteLength: 0 }];
  json.buffers[0] = { ...(json.buffers[0] ?? {}), byteLength: rebuilt.length };
  return rebuilt;
}

// ─── Matrix / transform helpers (row-major 4x4) ──────────────────────────────

type Mat4 = number[];
type Vec3 = [number, number, number];

function ident(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}

function trs(t?: number[], q?: number[], s?: number[]): Mat4 {
  const [tx, ty, tz] = t ?? [0, 0, 0];
  const [x, y, z, w] = q ?? [0, 0, 0, 1];
  const [sx, sy, sz] = s ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy - wz) * sy, (xz + wy) * sz, tx,
    (xy + wz) * sx, (1 - (xx + zz)) * sy, (yz - wx) * sz, ty,
    (xz - wy) * sx, (yz + wx) * sy, (1 - (xx + yy)) * sz, tz,
    0, 0, 0, 1,
  ];
}

function nodeLocalMatrix(n: GlbNode): Mat4 {
  if (n.matrix) {
    const m = n.matrix; // glTF stores column-major; transpose to row-major
    return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
  }
  return trs(n.translation, n.rotation, n.scale);
}

function applyPoint(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
  ];
}

// ─── Measurement ─────────────────────────────────────────────────────────────

function accessorCount(json: GlbJson, idx: number | undefined): number {
  return idx === undefined ? 0 : json.accessors?.[idx]?.count ?? 0;
}

function meshTriangles(json: GlbJson, meshIdx: number): number {
  let tris = 0;
  for (const p of json.meshes?.[meshIdx]?.primitives ?? []) {
    tris += p.indices !== undefined
      ? Math.floor(accessorCount(json, p.indices) / 3)
      : Math.floor(accessorCount(json, p.attributes?.POSITION) / 3);
  }
  return tris;
}

/**
 * Rendered triangle count: sum over every NODE that references a mesh, so a
 * mesh reused by N instance nodes (createInstance — sandbag-wall, helipad)
 * costs N times. This matches the draw-cost the package manifest and the
 * acceptance budgets are written against; counting unique mesh definitions
 * undercounts mass-placed assets by 15-100x.
 */
function triangleCount(json: GlbJson): number {
  let tris = 0;
  for (const n of json.nodes ?? []) {
    if (n.mesh !== undefined) tris += meshTriangles(json, n.mesh);
  }
  return tris;
}

/** Decode an accessor's component-wise min/max, buffer-decoding when absent. */
function accessorMinMax(json: GlbJson, bin: Buffer | null, idx: number): { min: Vec3; max: Vec3 } | null {
  const a = json.accessors?.[idx];
  if (!a) return null;
  if (a.min && a.max && a.min.length >= 3 && a.max.length >= 3) {
    return { min: [a.min[0], a.min[1], a.min[2]], max: [a.max[0], a.max[1], a.max[2]] };
  }
  if (!bin || a.bufferView === undefined) return null;
  const bv = json.bufferViews?.[a.bufferView];
  if (!bv) return null;
  const comp = COMPONENT_BYTES[a.componentType ?? FLOAT] ?? 4;
  const nc = TYPE_COMPONENTS[a.type ?? 'VEC3'] ?? 3;
  const stride = bv.byteStride ?? comp * nc;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < (a.count ?? 0); i++) {
    const o = base + i * stride;
    for (let c = 0; c < 3; c++) {
      const v = bin.readFloatLE(o + c * 4);
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** World-space bbox over the scene graph (8 transformed corners per primitive). */
function worldBbox(json: GlbJson, bin: Buffer | null): { min: Vec3; max: Vec3 } {
  const wmin: Vec3 = [Infinity, Infinity, Infinity];
  const wmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  const scene = json.scenes?.[json.scene ?? 0];
  const recur = (idx: number, parent: Mat4): void => {
    const n = json.nodes?.[idx];
    if (!n) return;
    const m = mul(parent, nodeLocalMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of json.meshes?.[n.mesh]?.primitives ?? []) {
        const pos = p.attributes?.POSITION;
        if (pos === undefined) continue;
        const mm = accessorMinMax(json, bin, pos);
        if (!mm) continue;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const corner: Vec3 = [xi ? mm.max[0] : mm.min[0], yi ? mm.max[1] : mm.min[1], zi ? mm.max[2] : mm.min[2]];
          const w = applyPoint(m, corner);
          for (let c = 0; c < 3; c++) {
            if (w[c] < wmin[c]) wmin[c] = w[c];
            if (w[c] > wmax[c]) wmax[c] = w[c];
          }
        }
      }
    }
    for (const c of n.children ?? []) recur(c, m);
  };
  for (const r of scene?.nodes ?? []) recur(r, ident());
  if (!Number.isFinite(wmin[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: wmin, max: wmax };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── Rig normalization (canonical joint contract) ────────────────────────────

/** Classes that use Joint_* nodes as modeling groups, not articulation pivots. */
const STATIC_RIG_CLASSES = new Set(['buildings', 'structures', 'animals', 'props']);

function findNode(json: GlbJson, name: string): number {
  return json.nodes?.findIndex((n) => n.name === name) ?? -1;
}

/** Compile the taxonomy's alias/role/ignore lookups once. */
function compileTaxonomy(t: JointTaxonomy): CompiledTaxonomy {
  const aliasToRole = new Map<string, JointRoleSpec>();
  const roleByName = new Map<string, JointRoleSpec>();
  for (const r of t.jointRoles) {
    if (roleByName.has(r.role)) throw new Error(`joint-taxonomy: duplicate role "${r.role}"`);
    roleByName.set(r.role, r);
    for (const a of r.aliases) {
      const prior = aliasToRole.get(a);
      if (prior && prior !== r) {
        throw new Error(`joint-taxonomy: alias "${a}" claimed by both "${prior.role}" and "${r.role}"`);
      }
      aliasToRole.set(a, r);
    }
  }
  return { taxonomy: t, aliasToRole, roleByName, ignore: new RegExp(t.ignoreJointPattern) };
}

/** Count mesh-bearing nodes in a node's subtree (reported as meshCount). */
function countSubtreeMeshes(json: GlbJson, idx: number): number {
  let n = 0;
  const node = json.nodes?.[idx];
  if (!node) return 0;
  if (node.mesh !== undefined) n += 1;
  for (const c of node.children ?? []) n += countSubtreeMeshes(json, c);
  return n;
}

/**
 * Local-frame thin axis of a joint's mesh subtree. A rotor/propeller disc is
 * wide in two axes and thin along its spin axis, so the axis of minimal extent
 * (in the joint's own local frame, which the axis-normalize wrapper leaves
 * invariant) is the geometric spin axis. Returns null when the subtree is not
 * clearly disc-like (no confident reading) so the caller only warns on a real
 * disagreement.
 */
function jointThinAxis(json: GlbJson, bin: Buffer | null, jointIdx: number): 'x' | 'y' | 'z' | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const recur = (idx: number, m: Mat4): void => {
    const n = json.nodes?.[idx];
    if (!n) return;
    if (n.mesh !== undefined) {
      for (const p of json.meshes?.[n.mesh]?.primitives ?? []) {
        const pos = p.attributes?.POSITION;
        if (pos === undefined) continue;
        const mm = accessorMinMax(json, bin, pos);
        if (!mm) continue;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const corner: Vec3 = [xi ? mm.max[0] : mm.min[0], yi ? mm.max[1] : mm.min[1], zi ? mm.max[2] : mm.min[2]];
          const w = applyPoint(m, corner);
          for (let c = 0; c < 3; c++) {
            if (w[c] < min[c]) min[c] = w[c];
            if (w[c] > max[c]) max[c] = w[c];
          }
        }
      }
    }
    for (const c of n.children ?? []) recur(c, mul(m, nodeLocalMatrix(json.nodes![c])));
  };
  // Walk the joint's children in the joint's own local frame (joint = identity).
  for (const c of json.nodes?.[jointIdx]?.children ?? []) recur(c, nodeLocalMatrix(json.nodes![c]));
  if (!Number.isFinite(min[0])) return null;
  const ext: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const order = [0, 1, 2].sort((a, b) => ext[a] - ext[b]);
  // Confident only when the thinnest axis is clearly thinner than the next.
  if (ext[order[0]] >= ext[order[1]] * 0.6) return null;
  return (['x', 'y', 'z'] as const)[order[0]];
}

/**
 * Normalize an asset's rig vocabulary to the canonical contract: auto-detect
 * every `Joint_*` node, map its generator-native name to the canonical role
 * via the taxonomy, rename the GLB node, and record {name,type,spinAxis} for
 * the catalog. Unknown (non-ignored) joints and spin-axis disagreements are
 * surfaced as issues. Runs in pre-wrap source space; the joint-local spin axis
 * is wrapper-invariant, so the geometric cross-check holds either side of the
 * axis-normalize wrap.
 */
function normalizeRig(
  json: GlbJson,
  slug: string,
  cls: string,
  ct: CompiledTaxonomy,
  bin: Buffer | null,
): { joints: JointRecord[]; issues: RigIssue[] } {
  const joints: JointRecord[] = [];
  const issues: RigIssue[] = [];
  const nodes = json.nodes ?? [];
  const seen = new Set<string>();
  // Static classes use Joint_* as a modeling-group convention (window groups,
  // columns, walls, table pivots), not articulation, so an unrecognized joint
  // there is expected. Only articulating classes get the unclassified warning.
  const articulating = !STATIC_RIG_CLASSES.has(cls);
  const unclassified = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const name = nodes[i].name;
    if (!name) continue;
    const role = ct.aliasToRole.get(name);
    if (!role) {
      if (articulating && /^Joint_/i.test(name) && !ct.ignore.test(name)) {
        // Collapse indexed/coordinate-suffixed instances to one base name
        // (Joint_PlankPivot_0_1_R -> Joint_PlankPivot) for a single summary line.
        unclassified.add(name.replace(/_(?=[-\d]).*$/, ''));
      }
      continue;
    }

    // Canonicalize the node name in place (rename only when it differs).
    if (name !== role.canonical) {
      const collision = findNode(json, role.canonical);
      if (collision >= 0 && collision !== i) {
        issues.push({
          slug,
          severity: 'error',
          message: `cannot rename "${name}" -> "${role.canonical}": that canonical name already exists`,
        });
      } else {
        nodes[i].name = role.canonical;
      }
    }
    if (seen.has(role.canonical)) {
      issues.push({ slug, severity: 'warn', message: `duplicate joint "${role.canonical}"` });
    }
    seen.add(role.canonical);

    // Geometric spin-axis cross-check for spinning blade joints.
    if (role.spinAxis && (role.type === 'mainBlades' || role.type === 'tailBlades')) {
      const thin = jointThinAxis(json, bin, i);
      if (thin && thin !== role.spinAxis) {
        issues.push({
          slug,
          severity: 'warn',
          message: `joint "${role.canonical}" declares spinAxis=${role.spinAxis} but its geometric thin-axis is ${thin}`,
        });
      }
    }

    joints.push({
      name: role.canonical,
      type: role.type,
      spinAxis: role.spinAxis,
      meshCount: countSubtreeMeshes(json, i),
    });
  }

  // One summary line per asset for un-wired articulation the GLB exposes but no
  // consumer reads yet (e.g. C-130 props, PBR gun turret). Informational: add a
  // rig profile + role aliases when the asset becomes a consumer.
  if (unclassified.size > 0) {
    issues.push({
      slug,
      severity: 'info',
      message: `${unclassified.size} un-wired articulation joint group(s): ${[...unclassified].sort().join(', ')}`,
    });
  }
  return { joints, issues };
}

/**
 * Classify a weapon's magazine + muzzle anchor meshes from the taxonomy rules
 * (regex include/exclude over Mesh_* node names), with per-slug overrides for
 * the few the rules cannot decide. Magazine = the detachable body that drops on
 * reload (well + release catch excluded); muzzle = the forward muzzle device
 * (bare barrel omitted — WeaponRigManager already falls back to Mesh_Barrel).
 */
function classifyWeaponNodes(
  json: GlbJson,
  slug: string,
  t: JointTaxonomy,
): { magazineNodes?: string[]; muzzleNodes?: string[]; issues: RigIssue[] } {
  const rules = t.weaponNodes;
  const override = rules.overrides?.[slug];
  const meshNames = (json.nodes ?? [])
    .map((n) => n.name)
    .filter((n): n is string => !!n && /^Mesh_/i.test(n));

  const magInc = new RegExp(rules.magazineIncludePattern, 'i');
  const magExc = new RegExp(rules.magazineExcludePattern, 'i');
  const muzInc = new RegExp(rules.muzzleIncludePattern, 'i');

  const magazineNodes = override?.magazineNodes ?? meshNames.filter((n) => magInc.test(n) && !magExc.test(n));
  const muzzleNodes = override?.muzzleNodes ?? meshNames.filter((n) => muzInc.test(n));

  const issues: RigIssue[] = [];
  return {
    magazineNodes: magazineNodes.length > 0 ? magazineNodes : undefined,
    muzzleNodes: muzzleNodes.length > 0 ? muzzleNodes : undefined,
    issues,
  };
}

/**
 * Assert an articulated asset resolved every joint its rig profile requires.
 * This turns a silent runtime regression (dead rotor / un-traversing turret)
 * into a loud import-time failure when a future batch renames a part outside
 * the taxonomy's alias coverage.
 */
function validateRig(slug: string, joints: JointRecord[], ct: CompiledTaxonomy): RigIssue[] {
  const profileName = ct.taxonomy.assetRigProfiles[slug];
  if (!profileName) return [];
  const required = ct.taxonomy.rigProfiles[profileName] ?? [];
  const present = new Set(joints.map((j) => j.name));
  const issues: RigIssue[] = [];
  for (const role of required) {
    const spec = ct.roleByName.get(role);
    if (!spec) {
      issues.push({ slug, severity: 'error', message: `rig profile "${profileName}" references unknown role "${role}"` });
      continue;
    }
    if (!present.has(spec.canonical)) {
      issues.push({
        slug,
        severity: 'error',
        message: `missing required joint "${spec.canonical}" (role ${role}, profile ${profileName})`,
      });
    }
  }
  return issues;
}

// ─── Axis normalization (wrap the scene roots under a rotation node) ─────────

function classForward(cls: string): { forward: ForwardAxis; quat: readonly number[]; label: string } {
  // Ground vehicles are -Z forward on disk (VehicleGlbVisuals applies no yaw).
  if (cls === 'ground') return { forward: 'neg-z', quat: X_TO_NEG_Z, label: '+X forward -> -Z forward (ground vehicle)' };
  // Everything else (weapons, aircraft, structures, buildings, animals, props,
  // boats) stores +Z forward; loaders apply the documented per-class yaw.
  return { forward: 'pos-z', quat: X_TO_Z, label: '+X forward -> +Z forward' };
}

/**
 * True when two unit quaternions describe the same rotation (q and -q are the
 * same rotation, so compare both signs) within a generous float epsilon.
 */
function sameRotation(a: readonly number[], b: readonly number[]): boolean {
  if (a.length < 4 || b.length < 4) return false;
  const eps = 1e-4;
  const same = (s: number) =>
    Math.abs(a[0] - s * b[0]) < eps && Math.abs(a[1] - s * b[1]) < eps && Math.abs(a[2] - s * b[2]) < eps && Math.abs(a[3] - s * b[3]) < eps;
  return same(1) || same(-1);
}

/**
 * Strip a redundant class-normalization yaw an artist baked into a single scene
 * root before the importer wraps the scene in its own normalization node.
 *
 * Some sources arrive with the orientation correction already hand-applied
 * ("whole tent yawed -90deg ... matching old TIJ asset orientation, placements
 * assume it"). The importer's normalizeAxis then wraps the root under ANOTHER
 * copy of the same class yaw, so the model is double-rotated (net 180deg ->
 * ridge crosswise, entrance reversed) — the class of break that surfaced
 * aid-station / command-tent as "corrupted" in-world. Removing the baked root
 * rotation here lets the wrapper apply the canonical normalization exactly once,
 * leaving the asset identical to a properly-authored (un-pre-yawed) source.
 *
 * Returns true when a redundant yaw was removed (so the caller can re-measure /
 * report). Idempotent: the immutable source always re-presents the baked yaw, so
 * every run strips it and the wrapper re-applies one — byte-stable output.
 */
function stripRedundantRootYaw(json: GlbJson, quat: readonly number[]): boolean {
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? [];
  if (roots.length !== 1) return false;
  const root = json.nodes?.[roots[0]];
  if (!root || root.name === AXIS_NODE_NAME || root.matrix) return false;
  if (!sameRotation(root.rotation ?? [], quat)) return false;
  delete root.rotation;
  return true;
}

function normalizeAxis(json: GlbJson, quat: readonly number[], note: string, scale = 1): void {
  json.nodes ??= [];
  json.scenes ??= [{ nodes: [] }];
  for (const scene of json.scenes) {
    const roots = scene.nodes ?? [];
    if (roots.length === 1 && json.nodes[roots[0]]?.name === AXIS_NODE_NAME) continue;
    const wrapperIdx = json.nodes.length;
    const wrapper: GlbNode = { name: AXIS_NODE_NAME, rotation: [...quat], children: [...roots] };
    // Uniform scale correction for slugs whose Kiln source is scale-defective
    // (CATALOG_SCALE_FIX). Applied at the wrapper so the whole model scales
    // about its ground-anchored origin; the measured dims/minY are scaled to
    // match at the call site, keeping the catalog truthful.
    if (scale !== 1) wrapper.scale = [scale, scale, scale];
    json.nodes.push(wrapper);
    scene.nodes = [wrapperIdx];
  }
  json.asset ??= {};
  const gen = json.asset.generator ? `${json.asset.generator}; ` : '';
  json.asset.generator = `${gen}TIJ war-asset import: ${note}`;
}

// ─── Budget triage ───────────────────────────────────────────────────────────

const MASS_PLACED = new Set(['sandbag-wall', 'sandbag-bunker', 'barbed-wire-fence', 'concertina-wire']);
const STRUCTURE_CLASSES = new Set(['structures', 'buildings']);

function triage(
  asset: ManifestAsset,
  tris: number,
  sizeKB: number,
  bbox: { min: Vec3; max: Vec3 },
): TriageResult {
  const reasons: string[] = [];
  let reject = false;
  let exception = false;

  // Hard reject bars (audit policy): tris > 20k OR KB > 300.
  if (tris > 20000) {
    reject = true;
    reasons.push(`${tris} tris > 20k hard cap`);
  }
  if (sizeKB > 300) {
    reject = true;
    reasons.push(`${sizeKB}KB > 300KB hard cap`);
  }
  // Mass-placed fence-line assets reject above 6k tris.
  if (MASS_PLACED.has(asset.slug) && tris > 6000) {
    reject = true;
    reasons.push(`mass-placed ${tris} tris > 6k cap`);
  }
  // Placement-contract breaks.
  if (asset.slug === 'helipad') {
    const footprint = Math.max(bbox.max[0] - bbox.min[0], bbox.max[2] - bbox.min[2]);
    const height = bbox.max[1] - bbox.min[1];
    if (footprint > 16 || height > 1.5) {
      reject = true;
      reasons.push(`helipad footprint ${round2(footprint)}m / height ${round2(height)}m breaks 14m flat-pad landing contract`);
    }
  }
  if (asset.slug === 'toc-bunker' && bbox.min[1] < -1.0) {
    reject = true;
    reasons.push(`minY ${round2(bbox.min[1])}m: bounds-snap would beach the buried bunker as a monolith`);
  }

  if (reject) {
    // Reroll target: structure budget for structures, else half the tris.
    const target = STRUCTURE_CLASSES.has(asset.class) ? 2500 : Math.min(6000, Math.floor(tris / 4));
    return { status: 'REJECT', reasons, rerollTargetTris: target };
  }

  // Exceptions: structures/buildings over 2,500 tris, or weapons over 1,500.
  if (STRUCTURE_CLASSES.has(asset.class) && tris > 2500) {
    exception = true;
    reasons.push(`${tris} tris over 2,500 structure budget`);
  }
  if (asset.class === 'weapons' && tris > 1500) {
    exception = true;
    reasons.push(`${tris} tris over 1,500 weapon budget`);
  }

  return { status: exception ? 'EXCEPTION' : 'PASS', reasons };
}

// ─── Catalog emit ────────────────────────────────────────────────────────────

const PUBLIC_PREFIX = 'public/models/';

function runtimePath(tijTarget: string): string {
  const norm = tijTarget.replaceAll('\\', '/');
  return norm.startsWith(PUBLIC_PREFIX) ? norm.slice(PUBLIC_PREFIX.length) : norm;
}

function constKey(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase().replace(/^(\d)/, '_$1');
}

/** Build the class-grouped path constants, preserving legacy modelPaths names. */
const LEGACY_KEY_OVERRIDES: Record<string, string> = {
  'm16a1': 'M16A1', 'ak47': 'AK47', 'm60': 'M60', 'm2-browning': 'M2_BROWNING',
  'm1911': 'M1911', 'm79': 'M79', 'rpg7': 'RPG7', 'ithaca37': 'ITHACA37',
  'm3-grease-gun': 'M3_GREASE_GUN',
  'uh1-huey': 'UH1_HUEY', 'uh1c-gunship': 'UH1C_GUNSHIP', 'ah1-cobra': 'AH1_COBRA',
  'ac47-spooky': 'AC47_SPOOKY', 'f4-phantom': 'F4_PHANTOM', 'a1-skyraider': 'A1_SKYRAIDER',
  'm151-jeep': 'M151_JEEP', 'm35-truck': 'M35_TRUCK', 'm113-apc': 'M113_APC',
  'm48-patton': 'M48_PATTON', 'pt76': 'PT76',
  'shophouse': 'SHOPHOUSE', 'shophouse-damaged': 'SHOPHOUSE_DAMAGED', 'french-villa': 'FRENCH_VILLA',
  'concrete-building': 'CONCRETE_BUILDING', 'market-stall': 'MARKET_STALL', 'church': 'CHURCH',
  'pagoda': 'PAGODA', 'warehouse': 'WAREHOUSE', 'farmhouse': 'FARMHOUSE', 'rice-barn': 'RICE_BARN',
  'bridge-stone': 'BRIDGE_STONE', 'bunker-nva': 'BUNKER_NVA',
  'helipad': 'HELIPAD', 'sandbag-wall': 'SANDBAG_WALL', 'sandbag-bunker': 'SANDBAG_BUNKER',
  'mortar-pit': 'MORTAR_PIT', 'ammo-crate': 'AMMO_CRATE', 'foxhole': 'FOXHOLE',
  'guard-tower': 'GUARD_TOWER', 'command-tent': 'COMMAND_TENT', 'barbed-wire-fence': 'BARBED_WIRE',
  'concertina-wire': 'CONCERTINA_WIRE', 'claymore-mine': 'CLAYMORE', 'footbridge': 'FOOTBRIDGE',
  '37mm-aa': 'AA_37MM', 'firebase-gate': 'FIREBASE_GATE', 'village-hut': 'VILLAGE_HUT',
  'village-hut-damaged': 'VILLAGE_HUT_DAMAGED', 'rice-dike': 'RICE_DIKE', 'fuel-drum': 'FUEL_DRUM',
  'supply-crate': 'SUPPLY_CRATE', 'zpu4-aa': 'ZPU4_AA', 'punji-trap': 'PUNJI_TRAP',
  'tunnel-entrance': 'TUNNEL_ENTRANCE', 'sa2-sam': 'SA2_SAM', 'radio-stack': 'RADIO_STACK',
  'toc-bunker': 'TOC_BUNKER', 'artillery-pit': 'ARTILLERY_PIT', 'barracks-tent': 'BARRACKS_TENT',
  'aid-station': 'AID_STATION', 'ammo-bunker': 'AMMO_BUNKER', 'comms-tower': 'COMMS_TOWER',
  'generator-shed': 'GENERATOR_SHED', 'water-tower': 'WATER_TOWER', 'perimeter-berm': 'PERIMETER_BERM',
  'latrine': 'LATRINE', 'wooden-barrel': 'WOODEN_BARREL',
};

/** Map manifest class -> catalog path-group name (matches modelPaths exports). */
function pathGroup(cls: string): string {
  switch (cls) {
    case 'weapons': return 'WeaponModels';
    case 'aircraft': return 'AircraftModels';
    case 'ground': return 'GroundVehicleModels';
    case 'boats': return 'WatercraftModels';
    case 'buildings': return 'BuildingModels';
    case 'animals': return 'AnimalModels';
    case 'props': return 'PropModels';
    case 'structures': return 'StructureModels';
    default: return 'StructureModels';
  }
}

/**
 * Some slugs are classed `buildings` upstream but live under structures/ in TIJ
 * (village-hut*), and their legacy constant lives on StructureModels. Resolve
 * the path-group from the on-disk target dir, not the manifest class, so the
 * re-export keeps the exact legacy member set.
 */
function resolvedGroup(asset: ManifestAsset): string {
  const path = runtimePath(asset.tijTarget);
  if (path.startsWith('weapons/')) return 'WeaponModels';
  if (path.startsWith('vehicles/aircraft/')) return 'AircraftModels';
  if (path.startsWith('vehicles/ground/')) return 'GroundVehicleModels';
  if (path.startsWith('vehicles/watercraft/')) return 'WatercraftModels';
  if (path.startsWith('buildings/')) return 'BuildingModels';
  if (path.startsWith('animals/')) return 'AnimalModels';
  if (path.startsWith('props/')) return 'PropModels';
  if (path.startsWith('structures/')) return 'StructureModels';
  return pathGroup(asset.class);
}

function tsString(v: string): string {
  return `'${v.replace(/'/g, "\\'")}'`;
}

function emitCatalog(entries: CatalogEntry[]): string {
  const groups = ['WeaponModels', 'AircraftModels', 'GroundVehicleModels', 'WatercraftModels', 'StructureModels', 'BuildingModels', 'AnimalModels', 'PropModels'];
  const byGroup = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    // A REPLACEMENT reject keeps its prior GLB on disk, so its path constant is
    // still emitted (existing consumers depend on the legacy key). A NET-NEW
    // reject (egret) was never written and has no prior bytes, so emitting a
    // path constant would dangle — skip it from the path groups. It stays in
    // the warAssetCatalog map (with budgetStatus REJECT) for the reroll record.
    if (e.budgetStatus === 'REJECT' && e.action === 'new') continue;
    const key = groupForEntry(e);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(e);
  }

  const lines: string[] = [];
  lines.push('// Generated by scripts/import-war-catalog.ts. Do not edit manually.');
  lines.push('// Source batch: pixel-forge war-assets/_repaint-2026-06 (see');
  lines.push('// docs/asset-provenance/repaint-2026-06/ and');
  lines.push('// docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md).');
  lines.push('//');
  lines.push('// Class-grouped GLB path constants (re-exported by');
  lines.push('// src/systems/assets/modelPaths.ts) plus per-slug import metadata: measured');
  lines.push('// world dims, tris, on-disk forward axis, budget triage status, and grafted');
  lines.push('// rig joints / weapon node anchors. Paths are relative to public/models/.');
  lines.push('');
  lines.push("export type WarAssetForward = 'pos-z' | 'neg-z';");
  lines.push("export type WarAssetBudgetStatus = 'PASS' | 'EXCEPTION' | 'REJECT';");
  lines.push('');
  lines.push('export interface WarAssetJoint {');
  lines.push('  readonly name: string;');
  lines.push("  readonly type?: 'mainBlades' | 'tailBlades';");
  lines.push("  readonly spinAxis?: 'x' | 'y' | 'z';");
  lines.push('  readonly meshCount: number;');
  lines.push('}');
  lines.push('');
  lines.push('export interface WarAssetEntry {');
  lines.push('  readonly slug: string;');
  lines.push('  readonly class: string;');
  lines.push('  readonly path: string;');
  lines.push('  readonly forward: WarAssetForward;');
  lines.push('  readonly dims: readonly [number, number, number];');
  lines.push('  readonly tris: number;');
  lines.push('  readonly sizeKB: number;');
  lines.push('  readonly materials: number;');
  lines.push('  readonly minY: number;');
  lines.push('  readonly budgetStatus: WarAssetBudgetStatus;');
  lines.push("  readonly action: 'replace' | 'new';");
  lines.push('  readonly joints?: readonly WarAssetJoint[];');
  lines.push('  readonly magazineNodes?: readonly string[];');
  lines.push('  readonly muzzleNodes?: readonly string[];');
  lines.push('}');
  lines.push('');

  // Path-constant groups.
  for (const group of groups) {
    const members = (byGroup.get(group) ?? []).slice().sort((a, b) => keyFor(a).localeCompare(keyFor(b)));
    lines.push(`export const ${group} = {`);
    for (const e of members) {
      lines.push(`  ${keyFor(e)}: ${tsString(e.path)},`);
    }
    lines.push('} as const;');
    lines.push('');
  }

  // Full catalog map.
  lines.push('export const warAssetCatalog: Record<string, WarAssetEntry> = {');
  for (const e of entries.slice().sort((a, b) => a.slug.localeCompare(b.slug))) {
    const parts: string[] = [];
    parts.push(`slug: ${tsString(e.slug)}`);
    parts.push(`class: ${tsString(e.class)}`);
    parts.push(`path: ${tsString(e.path)}`);
    parts.push(`forward: ${tsString(e.forward)}`);
    parts.push(`dims: [${e.dims[0]}, ${e.dims[1]}, ${e.dims[2]}]`);
    parts.push(`tris: ${e.tris}`);
    parts.push(`sizeKB: ${e.sizeKB}`);
    parts.push(`materials: ${e.materials}`);
    parts.push(`minY: ${e.minY}`);
    parts.push(`budgetStatus: ${tsString(e.budgetStatus)}`);
    parts.push(`action: ${tsString(e.action)}`);
    if (e.joints && e.joints.length > 0) {
      const js = e.joints.map((j) => {
        const jp = [`name: ${tsString(j.name)}`];
        if (j.type) jp.push(`type: ${tsString(j.type)}`);
        if (j.spinAxis) jp.push(`spinAxis: ${tsString(j.spinAxis)}`);
        jp.push(`meshCount: ${j.meshCount}`);
        return `{ ${jp.join(', ')} }`;
      });
      parts.push(`joints: [${js.join(', ')}]`);
    }
    if (e.magazineNodes && e.magazineNodes.length > 0) {
      parts.push(`magazineNodes: [${e.magazineNodes.map(tsString).join(', ')}]`);
    }
    if (e.muzzleNodes && e.muzzleNodes.length > 0) {
      parts.push(`muzzleNodes: [${e.muzzleNodes.map(tsString).join(', ')}]`);
    }
    lines.push(`  ${tsString(e.slug)}: { ${parts.join(', ')} },`);
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

const GROUP_OF = new WeakMap<CatalogEntry, string>();
const KEY_OF = new WeakMap<CatalogEntry, string>();
function groupForEntry(e: CatalogEntry): string {
  return GROUP_OF.get(e) ?? 'StructureModels';
}
function keyFor(e: CatalogEntry): string {
  return KEY_OF.get(e) ?? constKey(e.slug);
}

// ─── Provenance ──────────────────────────────────────────────────────────────

function writeProvenanceRecord(
  dir: string,
  asset: ManifestAsset,
  sourceProvenance: Record<string, unknown> | null,
  axisLabel: string,
  joints: JointRecord[],
  triageResult: TriageResult,
): void {
  const record = {
    slug: asset.slug,
    class: asset.class,
    action: asset.action,
    tijTarget: runtimePath(asset.tijTarget),
    provider: (sourceProvenance?.provider as string) ?? null,
    model: (sourceProvenance?.model as string) ?? asset.model,
    sourceTimestamp: (sourceProvenance?.ts as string) ?? asset.generatedAt,
    sourcePrompt: (sourceProvenance?.prompt as string) ?? null,
    handEdit: asset.handEdit,
    appliedNormalization: axisLabel,
    graftedJoints: joints,
    budgetStatus: triageResult.status,
    budgetReasons: triageResult.reasons,
    sourceBatch: 'pixel-forge war-assets/_repaint-2026-06',
  };
  writeFileSync(join(dir, `${asset.slug}.provenance.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface AssetReport {
  slug: string;
  cls: string;
  axis: string;
  dims: Vec3;
  tris: number;
  status: BudgetStatus;
  written: boolean;
}

function main(): void {
  const root = process.cwd();
  const sourceDir = argValue(
    '--source',
    join(root, '..', 'pixel-forge', 'war-assets', '_repaint-2026-06'),
  );
  const dryRun = process.argv.includes('--dry-run');
  const strict = process.argv.includes('--strict');
  const provenanceDir = join(root, 'docs', 'asset-provenance', 'repaint-2026-06');
  const catalogPath = join(root, 'src', 'config', 'generated', 'warAssetCatalog.ts');

  const manifest = JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf-8')) as Manifest;
  const taxonomy = JSON.parse(
    readFileSync(join(root, 'scripts', 'asset-import', 'joint-taxonomy.json'), 'utf-8'),
  ) as JointTaxonomy;
  const ct = compileTaxonomy(taxonomy);

  if (!dryRun) {
    mkdirSync(provenanceDir, { recursive: true });
    mkdirSync(dirname(catalogPath), { recursive: true });
  }

  const entries: CatalogEntry[] = [];
  const reports: AssetReport[] = [];
  const rigIssues: RigIssue[] = [];
  const rejects: Array<{ asset: ManifestAsset; triage: TriageResult; tris: number; sizeKB: number }> = [];

  for (const asset of manifest.assets) {
    if (asset.status !== 'ready') continue;
    const sourceGlb = join(sourceDir, asset.file);
    if (!existsSync(sourceGlb)) throw new Error(`Missing source GLB: ${sourceGlb}`);

    const { json, bin } = readGlb(sourceGlb);
    const tris = triangleCount(json);
    const sizeKB = Math.round((statSync(sourceGlb).size / 1024) * 10) / 10;
    const materials = json.materials?.length ?? 0;

    // Rig normalization happens in pre-wrap source space (joint-local spin
    // axes are wrapper-invariant, so the geometric cross-check still holds).
    const rig = normalizeRig(json, asset.slug, asset.class, ct, bin);
    const joints = rig.joints;
    rigIssues.push(...rig.issues, ...validateRig(asset.slug, joints, ct));
    const { forward, quat, label } = classForward(asset.class);

    // Cancel an artist-baked normalization yaw before measuring, so a pre-yawed
    // source measures like an un-yawed one (X-long) and the on-disk swap below
    // reports the true post-wrap dims. Prevents the aid-station / command-tent
    // double-rotation (and its X-long catalog dims) from recurring.
    stripRedundantRootYaw(json, quat);

    // Measure AFTER grafts (node graph changed) but BEFORE the axis wrap, then
    // swap the long axis to reflect the on-disk forward for clarity.
    const bbox = worldBbox(json, bin);
    // Uniform scale correction for scale-defective Kiln sources (single source
    // of truth: scripts/asset-import/catalog-scale-fix.ts). Applied to the
    // measured dims/minY here AND to the axis wrapper below, so the generated
    // catalog reports the same true-scale geometry that loads at runtime.
    const scaleFix = CATALOG_SCALE_FIX[asset.slug] ?? 1;
    const dims: Vec3 = [
      round2((bbox.max[0] - bbox.min[0]) * scaleFix),
      round2((bbox.max[1] - bbox.min[1]) * scaleFix),
      round2((bbox.max[2] - bbox.min[2]) * scaleFix),
    ];
    const minY = round2(bbox.min[1] * scaleFix);

    const triageResult = triage(asset, tris, sizeKB, bbox);

    normalizeAxis(json, quat, label, scaleFix);

    const targetGlb = join(root, runtimePath(asset.tijTarget).split('/').reduce((p, s) => join(p, s), join('public', 'models')));
    const weaponNodes = asset.class === 'weapons' ? classifyWeaponNodes(json, asset.slug, taxonomy) : undefined;
    if (weaponNodes) rigIssues.push(...weaponNodes.issues);

    // On-disk dims after wrap: +X<->+Z (or -Z) swap means the source X extent
    // becomes the Z extent. Report on-disk dims so "Z-long" reads true.
    const onDiskDims: Vec3 = [dims[2], dims[1], dims[0]];

    let written = false;
    if (triageResult.status === 'REJECT') {
      // Keep the prior GLB bytes on disk; record a reroll request. The catalog
      // still lists the slug (with prior path) so consumers compile.
      rejects.push({ asset, triage: triageResult, tris, sizeKB });
    } else if (!dryRun) {
      // Make every primitive indexed so THREE merges are all-or-none
      // (CombatantRenderer's weapon merge fails on mixed-index models).
      const indexedBin = synthesizeIndices(json, bin);
      // De-interleave every attribute accessor and compact the BIN, so three's
      // GLTFLoader yields only plain BufferAttributes and mergeGeometries does
      // not throw on mixed interleaved/packed gpuType.
      const outBin = canonicalizeBuffers(json, indexedBin);
      mkdirSync(dirname(targetGlb), { recursive: true });
      writeGlb(targetGlb, json, outBin);
      written = true;
    }

    const entry: CatalogEntry = {
      slug: asset.slug,
      class: asset.class,
      path: runtimePath(asset.tijTarget),
      forward,
      dims: onDiskDims,
      tris,
      sizeKB,
      materials,
      minY,
      budgetStatus: triageResult.status,
      action: asset.action,
      joints: joints.length > 0 ? joints : undefined,
      magazineNodes: weaponNodes?.magazineNodes && weaponNodes.magazineNodes.length > 0 ? weaponNodes.magazineNodes : undefined,
      muzzleNodes: weaponNodes?.muzzleNodes && weaponNodes.muzzleNodes.length > 0 ? weaponNodes.muzzleNodes : undefined,
    };
    GROUP_OF.set(entry, resolvedGroup(asset));
    KEY_OF.set(entry, LEGACY_KEY_OVERRIDES[asset.slug] ?? constKey(asset.slug));
    entries.push(entry);

    if (!dryRun && triageResult.status !== 'REJECT') {
      const provSource = `${sourceGlb}.provenance.json`;
      const sourceProv = existsSync(provSource)
        ? (JSON.parse(readFileSync(provSource, 'utf-8')) as Record<string, unknown>)
        : null;
      writeProvenanceRecord(provenanceDir, asset, sourceProv, label, joints, triageResult);
    }

    reports.push({ slug: asset.slug, cls: asset.class, axis: forward === 'neg-z' ? '-Z' : '+Z', dims: onDiskDims, tris, status: triageResult.status, written });
  }

  // Rig contract report (canonical-joint normalization + validation).
  printRigIssues(rigIssues);
  const errors = rigIssues.filter((i) => i.severity === 'error');
  if (errors.length > 0 && (strict || !dryRun)) {
    console.error(
      `\nRig contract: ${errors.length} error(s). ${dryRun ? '' : 'Refusing to write a catalog with a broken rig contract.\n'}` +
        'Fix joint-taxonomy.json (add the new generator name to the role aliases) and re-run.',
    );
    process.exit(1);
  }

  // Emit catalog.
  if (!dryRun) {
    writeFileSync(catalogPath, emitCatalog(entries), 'utf-8');
    writeRerollRequests(provenanceDir, rejects);
  }

  printReport(reports, entries, rejects);
}

/** Print the rig-normalization findings grouped by severity. */
function printRigIssues(issues: RigIssue[]): void {
  if (issues.length === 0) {
    console.log('\nRig contract: all articulated assets resolved their canonical joints (0 issues).');
    return;
  }
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const infos = issues.filter((i) => i.severity === 'info');
  console.log(`\nRig contract: ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info.`);
  for (const i of errors) console.log(`  ERROR  ${i.slug}: ${i.message}`);
  for (const i of warns) console.log(`  warn   ${i.slug}: ${i.message}`);
  for (const i of infos) console.log(`  info   ${i.slug}: ${i.message}`);
}

function writeRerollRequests(
  dir: string,
  rejects: Array<{ asset: ManifestAsset; triage: TriageResult; tris: number; sizeKB: number }>,
): void {
  const lines: string[] = [];
  lines.push('# Repaint 2026-06 — re-roll requests');
  lines.push('');
  lines.push('Assets REJECTED by `scripts/import-war-catalog.ts` budget triage. The prior');
  lines.push('TIJ GLB is kept on disk unchanged; the pixel-forge side owns the re-roll.');
  lines.push('Re-rolled assets re-enter through the same importer (idempotent).');
  lines.push('');
  lines.push('| slug | class | measured tris | measured KB | reason | target tris |');
  lines.push('|---|---|---:|---:|---|---:|');
  for (const r of rejects.slice().sort((a, b) => a.asset.slug.localeCompare(b.asset.slug))) {
    lines.push(`| ${r.asset.slug} | ${r.asset.class} | ${r.tris} | ${r.sizeKB} | ${r.triage.reasons.join('; ')} | ${r.triage.rerollTargetTris ?? '—'} |`);
  }
  lines.push('');
  writeFileSync(join(dir, 'REROLL_REQUESTS.md'), `${lines.join('\n')}`, 'utf-8');
}

function printReport(reports: AssetReport[], entries: CatalogEntry[], rejects: unknown[]): void {
  const pass = entries.filter((e) => e.budgetStatus === 'PASS').length;
  const exc = entries.filter((e) => e.budgetStatus === 'EXCEPTION').length;
  const rej = entries.filter((e) => e.budgetStatus === 'REJECT').length;
  console.log('slug                       | class      | axis | dims (on-disk)        | tris  | status');
  console.log('---------------------------|------------|------|-----------------------|-------|--------');
  for (const r of reports) {
    const dims = `${r.dims[0]}x${r.dims[1]}x${r.dims[2]}`;
    console.log(
      `${r.slug.padEnd(26)} | ${r.cls.padEnd(10)} | ${(r.axis ?? '').padEnd(4)} | ${dims.padEnd(21)} | ${String(r.tris).padEnd(5)} | ${r.status}`,
    );
  }
  console.log('');
  console.log(`Imported ${reports.filter((r) => r.written).length} GLBs; triage: ${pass} PASS, ${exc} EXCEPTION, ${rej} REJECT (rejects keep prior bytes).`);
  console.log(`Reject slugs: ${(rejects as Array<{ asset: { slug: string } }>).map((r) => r.asset.slug).sort().join(', ') || '(none)'}`);
}

// Run only as a CLI entrypoint. When imported (tests, the scoped re-import in
// docs/tasks/structure-import-corruption-fix.md), the pipeline functions are
// reused without triggering a full catalog rebuild.
const invokedDirectly = process.argv[1] ? process.argv[1].replace(/\\/g, '/').endsWith('import-war-catalog.ts') : false;
if (invokedDirectly) main();

export { readGlb, writeGlb, normalizeAxis, normalizeRig, synthesizeIndices, canonicalizeBuffers, classForward, compileTaxonomy, sameRotation, stripRedundantRootYaw };
export type { GlbJson, JointTaxonomy };
