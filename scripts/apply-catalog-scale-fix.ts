// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * In-place application of CATALOG_SCALE_FIX to the already-committed war-asset
 * GLBs + the generated catalog.
 *
 * The full re-import path (import-war-catalog.ts) folds the same map in
 * automatically, but a re-import needs the Kiln staging source re-staged. This
 * one-shot instead operates directly on the committed GLBs: it finds the
 * `TIJ_AxisNormalize` wrapper node the importer already created, sets its
 * uniform scale, re-measures the on-disk world bbox, and patches the catalog
 * `dims`/`minY` to match. Idempotent: setting the wrapper scale to the same
 * value and re-measuring yields the same dims, so re-running is a no-op.
 *
 * Run: npx tsx scripts/apply-catalog-scale-fix.ts [--check]
 *   --check  measure + report only, write nothing (CI/verify).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_SCALE_FIX } from './asset-import/catalog-scale-fix';

const ROOT = join(import.meta.dirname, '..');
const MODELS = join(ROOT, 'public', 'models');
const CATALOG = join(ROOT, 'src', 'config', 'generated', 'warAssetCatalog.ts');
const AXIS_NODE_NAME = 'TIJ_AxisNormalize';
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMP_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

type Vec3 = [number, number, number];
type Mat4 = number[];

interface GlbNode {
  name?: string;
  mesh?: number;
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: number[];
}
interface Glb {
  json: any;
  bin: Buffer | null;
}

function readGlb(file: string): Glb {
  const data = readFileSync(file);
  if (data.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not glTF: ${file}`);
  let off = 12;
  let json: any = null;
  let bin: Buffer | null = null;
  while (off < data.length) {
    const len = data.readUInt32LE(off);
    const type = data.readUInt32LE(off + 4);
    off += 8;
    const chunk = data.subarray(off, off + len);
    off += len;
    if (type === JSON_CHUNK) json = JSON.parse(chunk.toString('utf8').trim());
    else if (type === BIN_CHUNK) bin = Buffer.from(chunk);
  }
  return { json, bin };
}

function writeGlb(file: string, json: any, bin: Buffer | null): void {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  let binBuf = bin ?? Buffer.alloc(0);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binBuf.length && binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0x00)]);
  const total = 12 + 8 + jsonBuf.length + (binBuf.length ? 8 + binBuf.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const parts = [header, jsonHeader, jsonBuf];
  if (binBuf.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binBuf.length, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(binHeader, binBuf);
  }
  writeFileSync(file, Buffer.concat(parts));
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
function ident(): Mat4 { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}
function nodeMat(n: GlbNode): Mat4 {
  if (n.matrix) { const m = n.matrix; return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]; }
  return trs(n.translation, n.rotation, n.scale);
}
function applyPt(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
  ];
}
function accMinMax(json: any, bin: Buffer | null, idx: number): { min: Vec3; max: Vec3 } | null {
  const a = json.accessors?.[idx];
  if (!a) return null;
  if (a.min && a.max && a.min.length >= 3) return { min: a.min.slice(0, 3), max: a.max.slice(0, 3) };
  if (!bin || a.bufferView === undefined) return null;
  const bv = json.bufferViews[a.bufferView];
  const comp = COMP_BYTES[a.componentType ?? 5126] ?? 4;
  const nc = TYPE_COMP[a.type ?? 'VEC3'] ?? 3;
  const stride = bv.byteStride ?? comp * nc;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < (a.count ?? 0); i++) {
    const o = base + i * stride;
    for (let c = 0; c < 3; c++) { const v = bin.readFloatLE(o + c * 4); if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}
function worldBbox(json: any, bin: Buffer | null): { min: Vec3; max: Vec3 } {
  const wmin: Vec3 = [Infinity, Infinity, Infinity];
  const wmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  const scene = json.scenes?.[json.scene ?? 0];
  const recur = (idx: number, parent: Mat4): void => {
    const n: GlbNode | undefined = json.nodes?.[idx];
    if (!n) return;
    const m = mul(parent, nodeMat(n));
    if (n.mesh !== undefined) {
      for (const p of json.meshes?.[n.mesh]?.primitives ?? []) {
        const pos = p.attributes?.POSITION;
        if (pos === undefined) continue;
        const mm = accMinMax(json, bin, pos);
        if (!mm) continue;
        for (let xi = 0; xi < 2; xi++) for (let yi = 0; yi < 2; yi++) for (let zi = 0; zi < 2; zi++) {
          const w = applyPt(m, [xi ? mm.max[0] : mm.min[0], yi ? mm.max[1] : mm.min[1], zi ? mm.max[2] : mm.min[2]]);
          for (let c = 0; c < 3; c++) { if (w[c] < wmin[c]) wmin[c] = w[c]; if (w[c] > wmax[c]) wmax[c] = w[c]; }
        }
      }
    }
    for (const c of n.children ?? []) recur(c, m);
  };
  for (const r of scene?.nodes ?? []) recur(r, ident());
  return { min: wmin, max: wmax };
}
const r2 = (v: number): number => Math.round(v * 100) / 100;

function catalogPathForSlug(catalogText: string, slug: string): string | null {
  const line = catalogText.split('\n').find((l) => l.includes(`'${slug}':`));
  if (!line) return null;
  const m = line.match(/path:\s*'([^']+)'/);
  return m ? m[1] : null;
}

const checkOnly = process.argv.includes('--check');
let catalogText = readFileSync(CATALOG, 'utf8');
let changed = false;
let failed = false;

for (const [slug, scale] of Object.entries(CATALOG_SCALE_FIX)) {
  const rel = catalogPathForSlug(catalogText, slug);
  if (!rel) { console.error(`  MISSING catalog entry for ${slug}`); failed = true; continue; }
  const file = join(MODELS, ...rel.split('/'));
  const { json, bin } = readGlb(file);
  const node: GlbNode | undefined = (json.nodes ?? []).find((n: GlbNode) => n.name === AXIS_NODE_NAME);
  if (!node) { console.error(`  ${slug}: no ${AXIS_NODE_NAME} node — cannot scale in place`); failed = true; continue; }

  const before = worldBbox(json, bin);
  const beforeDims: Vec3 = [r2(before.max[0] - before.min[0]), r2(before.max[1] - before.min[1]), r2(before.max[2] - before.min[2])];

  // Set (not multiply) the wrapper scale, so the op is idempotent regardless of
  // how many times it runs. The importer creates the wrapper with rotation only.
  const cur = node.scale ?? [1, 1, 1];
  const alreadyScaled = Math.abs(cur[0] - scale) < 1e-4;
  if (!checkOnly) node.scale = [scale, scale, scale];

  // Re-measure with the new scale applied (apply locally even in --check).
  const measureNode = { ...node, scale: [scale, scale, scale] };
  const measureJson = { ...json, nodes: json.nodes.map((n: GlbNode) => (n === node ? measureNode : n)) };
  const after = worldBbox(measureJson, bin);
  const dims: Vec3 = [r2(after.max[0] - after.min[0]), r2(after.max[1] - after.min[1]), r2(after.max[2] - after.min[2])];
  const minY = r2(after.min[1]);

  console.log(`${slug}: x${scale}  ${beforeDims.join(' x ')}  ->  ${dims.join(' x ')}  (minY ${minY})${alreadyScaled ? '  [already scaled]' : ''}`);

  if (checkOnly) continue;

  writeGlb(file, json, bin);

  // Patch the slug's catalog line: dims + minY.
  const lines = catalogText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(`'${slug}':`)) continue;
    lines[i] = lines[i]
      .replace(/dims:\s*\[[^\]]*\]/, `dims: [${dims[0]}, ${dims[1]}, ${dims[2]}]`)
      .replace(/minY:\s*-?[0-9.]+/, `minY: ${minY}`);
    changed = true;
  }
  catalogText = lines.join('\n');
}

if (!checkOnly && changed) {
  writeFileSync(CATALOG, catalogText);
  console.log('patched src/config/generated/warAssetCatalog.ts');
}
if (failed) process.exit(1);
