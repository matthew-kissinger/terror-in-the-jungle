#!/usr/bin/env tsx

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';

type AircraftSlug =
  | 'uh1-huey'
  | 'uh1c-gunship'
  | 'ah1-cobra'
  | 'ac47-spooky'
  | 'f4-phantom'
  | 'a1-skyraider';

type GlbJson = {
  asset?: {
    generator?: string;
    [key: string]: unknown;
  };
  scenes?: Array<{
    nodes?: number[];
    [key: string]: unknown;
  }>;
  scene?: number;
  nodes?: Array<{
    name?: string;
    rotation?: number[];
    children?: number[];
    [key: string]: unknown;
  }>;
  meshes?: Array<{
    primitives?: Array<{
      indices?: number;
      attributes?: Record<string, number>;
    }>;
  }>;
  accessors?: Array<{
    count?: number;
  }>;
  animations?: Array<{
    name?: string;
    channels?: Array<{
      target?: {
        node?: number;
        path?: string;
      };
    }>;
  }>;
  materials?: unknown[];
  [key: string]: unknown;
};

type Provenance = {
  asset?: string;
  provider?: string;
  model?: string;
  pipeline?: string;
  ts?: string;
  extras?: {
    slug?: string;
    tris?: number;
    structuralWarnings?: string[];
    [key: string]: unknown;
  };
};

type ImportRecord = {
  slug: AircraftSlug;
  sourceGlb: string;
  targetGlb: string;
  provenanceSource: string;
  provenanceTarget: string;
  sourceBytes: number;
  targetBytes: number;
  sourceTriangles: number;
  provenanceTriangles: number | null;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  animationNames: string[];
  animatedNodes: string[];
  appliedAxisNormalization: string;
  structuralWarnings: string[];
};

const AIRCRAFT: AircraftSlug[] = [
  'uh1-huey',
  'uh1c-gunship',
  'ah1-cobra',
  'ac47-spooky',
  'f4-phantom',
  'a1-skyraider',
];

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const AXIS_NORMALIZE_NODE_NAME = 'TIJ_AxisNormalize_XForward_To_ZForward';
const X_FORWARD_TO_Z_FORWARD_QUATERNION = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];

function argValue(name: string, fallback: string): string {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readGlb(file: string): { json: GlbJson; binChunk: Buffer | null } {
  const data = readFileSync(file);
  if (data.toString('utf-8', 0, 4) !== 'glTF') {
    throw new Error(`${file} is not a binary glTF file.`);
  }

  let offset = 12;
  let json: GlbJson | null = null;
  let binChunk: Buffer | null = null;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    offset += length;

    if (type === JSON_CHUNK_TYPE) {
      json = JSON.parse(chunk.toString('utf-8').trim()) as GlbJson;
    } else if (type === BIN_CHUNK_TYPE) {
      binChunk = Buffer.from(chunk);
    }
  }

  if (!json) {
    throw new Error(`No JSON chunk found in ${file}.`);
  }
  return { json, binChunk };
}

function writeGlb(file: string, json: GlbJson, binChunk: Buffer | null): void {
  const jsonText = JSON.stringify(json);
  const jsonPadding = (4 - (Buffer.byteLength(jsonText) % 4)) % 4;
  const jsonBuffer = Buffer.from(`${jsonText}${' '.repeat(jsonPadding)}`, 'utf-8');
  const chunks: Buffer[] = [makeChunk(JSON_CHUNK_TYPE, jsonBuffer)];
  if (binChunk) {
    chunks.push(makeChunk(BIN_CHUNK_TYPE, padChunk(binChunk, 0)));
  }

  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'utf-8');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  writeFileSync(file, Buffer.concat([header, ...chunks], totalLength));
}

function makeChunk(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(payload.length, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, payload], 8 + payload.length);
}

function padChunk(chunk: Buffer, padByte: number): Buffer {
  const padding = (4 - (chunk.length % 4)) % 4;
  if (padding === 0) return chunk;
  return Buffer.concat([chunk, Buffer.alloc(padding, padByte)], chunk.length + padding);
}

function normalizeAxis(json: GlbJson): void {
  json.nodes ??= [];
  json.scenes ??= [{ nodes: [] }];
  const activeSceneIndex = json.scene ?? 0;
  const scenesToNormalize = json.scenes.length > 0 ? json.scenes : [{ nodes: [] }];
  json.scenes = scenesToNormalize;

  for (let sceneIndex = 0; sceneIndex < scenesToNormalize.length; sceneIndex++) {
    const scene = scenesToNormalize[sceneIndex];
    const existingRoots = scene.nodes ?? [];
    if (
      existingRoots.length === 1
      && json.nodes[existingRoots[0]]?.name === AXIS_NORMALIZE_NODE_NAME
    ) {
      continue;
    }

    const wrapperIndex = json.nodes.length;
    json.nodes.push({
      name: AXIS_NORMALIZE_NODE_NAME,
      rotation: X_FORWARD_TO_Z_FORWARD_QUATERNION,
      children: [...existingRoots],
    });
    scene.nodes = [wrapperIndex];
  }

  json.scene = activeSceneIndex;
  json.asset ??= {};
  const generator = json.asset.generator ? `${json.asset.generator}; ` : '';
  json.asset.generator = `${generator}TIJ Pixel Forge aircraft import axis-normalized +X to +Z`;
}

function accessorCount(json: GlbJson, index: number | undefined): number {
  return index === undefined ? 0 : json.accessors?.[index]?.count ?? 0;
}

function primitiveTriangles(json: GlbJson, primitive: NonNullable<NonNullable<GlbJson['meshes']>[number]['primitives']>[number]): number {
  if (primitive.indices !== undefined) {
    return Math.floor(accessorCount(json, primitive.indices) / 3);
  }
  return Math.floor(accessorCount(json, primitive.attributes?.POSITION) / 3);
}

function analyzeGlb(json: GlbJson): {
  triangles: number;
  meshCount: number;
  primitiveCount: number;
  materialCount: number;
  animationNames: string[];
  animatedNodes: string[];
} {
  let triangles = 0;
  let primitiveCount = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount++;
      triangles += primitiveTriangles(json, primitive);
    }
  }

  const animatedNodes = new Set<string>();
  for (const animation of json.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      const node = channel.target?.node;
      const name = node === undefined ? null : json.nodes?.[node]?.name;
      if (name) animatedNodes.add(name);
    }
  }

  return {
    triangles,
    meshCount: json.meshes?.length ?? 0,
    primitiveCount,
    materialCount: json.materials?.length ?? 0,
    animationNames: (json.animations ?? []).map((animation) => animation.name ?? '(unnamed)'),
    animatedNodes: [...animatedNodes].sort(),
  };
}

function readProvenance(file: string): Provenance {
  return JSON.parse(readFileSync(file, 'utf-8')) as Provenance;
}

function main(): void {
  const sourceDir = argValue('--source-dir', join(process.cwd(), '..', 'pixel-forge', 'war-assets', 'vehicles', 'aircraft'));
  const targetDir = argValue('--target-dir', join(process.cwd(), 'public', 'models', 'vehicles', 'aircraft'));
  const provenanceTargetDir = argValue(
    '--provenance-target-dir',
    join(process.cwd(), 'docs', 'asset-provenance', 'pixel-forge-aircraft-2026-05-02'),
  );
  const summaryPath = argValue(
    '--summary',
    join(process.cwd(), 'artifacts', 'perf', timestampSlug(), 'pixel-forge-aircraft-import', 'summary.json'),
  );
  const dryRun = process.argv.includes('--dry-run');

  mkdirSync(targetDir, { recursive: true });
  mkdirSync(provenanceTargetDir, { recursive: true });
  mkdirSync(dirname(summaryPath), { recursive: true });

  const records: ImportRecord[] = [];
  for (const slug of AIRCRAFT) {
    const fileName = `${slug}.glb`;
    const sourceGlb = join(sourceDir, fileName);
    const targetGlb = join(targetDir, fileName);
    const provenanceSource = `${sourceGlb}.provenance.json`;
    const provenanceTarget = join(provenanceTargetDir, `${fileName}.provenance.json`);
    if (!existsSync(sourceGlb)) {
      throw new Error(`Missing source GLB: ${sourceGlb}`);
    }
    if (!existsSync(provenanceSource)) {
      throw new Error(`Missing provenance sidecar: ${provenanceSource}`);
    }

    const provenance = readProvenance(provenanceSource);
    const { json, binChunk } = readGlb(sourceGlb);
    const sourceStats = analyzeGlb(json);
    normalizeAxis(json);

    if (!dryRun) {
      writeGlb(targetGlb, json, binChunk);
      copyFileSync(provenanceSource, provenanceTarget);
    }

    records.push({
      slug,
      sourceGlb,
      targetGlb,
      provenanceSource,
      provenanceTarget,
      sourceBytes: statSync(sourceGlb).size,
      targetBytes: dryRun && !existsSync(targetGlb) ? 0 : statSync(targetGlb).size,
      sourceTriangles: sourceStats.triangles,
      provenanceTriangles: provenance.extras?.tris ?? null,
      meshCount: sourceStats.meshCount,
      primitiveCount: sourceStats.primitiveCount,
      materialCount: sourceStats.materialCount,
      animationNames: sourceStats.animationNames,
      animatedNodes: sourceStats.animatedNodes,
      appliedAxisNormalization: '+X forward source wrapped to +Z forward TIJ runtime storage contract',
      structuralWarnings: provenance.extras?.structuralWarnings ?? [],
    });
  }

  const summary = {
    createdAt: new Date().toISOString(),
    dryRun,
    sourceDir,
    targetDir,
    provenanceTargetDir,
    records: records.map((record) => ({
      ...record,
      sourceGlb: repoRelative(record.sourceGlb),
      targetGlb: repoRelative(record.targetGlb),
      provenanceSource: record.provenanceSource,
      provenanceTarget: repoRelative(record.provenanceTarget),
    })),
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(`Pixel Forge aircraft import ${dryRun ? 'dry-run ' : ''}complete: ${repoRelative(summaryPath)}`);
  for (const record of records) {
    console.log(
      `- ${basename(record.targetGlb)}: ${record.sourceTriangles} tris, ${record.meshCount} meshes, ${record.materialCount} materials, animations=${record.animationNames.join(',') || 'none'}`,
    );
  }
}

main();
