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
    bufferView?: number;
    byteOffset?: number;
    componentType?: number;
    count?: number;
    type?: string;
  }>;
  bufferViews?: Array<{
    byteOffset?: number;
    byteStride?: number;
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
  tailRotorSpinAxisInspection: TailRotorSpinAxisInspection;
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
const FLOAT_COMPONENT_TYPE = 5126;
const AXIS_NORMALIZE_NODE_NAME = 'TIJ_AxisNormalize_XForward_To_ZForward';
const X_FORWARD_TO_Z_FORWARD_QUATERNION = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];
const TAIL_ROTOR_NODE_NAME = 'Joint_tailRotor';
const QUATERNION_FLOAT_COUNT = 4;
const QUATERNION_BYTE_SIZE = QUATERNION_FLOAT_COUNT * 4;
const HELICOPTER_AIRCRAFT = new Set<AircraftSlug>(['uh1-huey', 'uh1c-gunship', 'ah1-cobra']);

type SpinAxis = 'x' | 'y' | 'z';

type TailRotorSpinAxisInspection = {
  status: 'not-applicable' | 'missing' | 'preserved' | 'corrected' | 'no-spin-axis';
  nodeName: string;
  sourceAxis: SpinAxis | null;
  importedAxis: SpinAxis | null;
  keyframes: number;
  bytesAffected: number;
  reason?: string;
};

const TAIL_ROTOR_SPIN_AXIS_CORRECTIONS: Partial<Record<AircraftSlug, SpinAxis>> = {
  'ah1-cobra': 'z',
};

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

function inferQuaternionAxis(values: number[][]): SpinAxis | null {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const value of values) {
    maxX = Math.max(maxX, Math.abs(value[0] ?? 0));
    maxY = Math.max(maxY, Math.abs(value[1] ?? 0));
    maxZ = Math.max(maxZ, Math.abs(value[2] ?? 0));
  }

  if (maxX < 0.5 && maxY < 0.5 && maxZ < 0.5) return null;
  if (maxX >= maxY && maxX >= maxZ) return 'x';
  if (maxY >= maxX && maxY >= maxZ) return 'y';
  return 'z';
}

function findNodeIndexByName(json: GlbJson, nodeName: string): number {
  return json.nodes?.findIndex((node) => node.name === nodeName) ?? -1;
}

function findRotationAccessorForNode(json: GlbJson, nodeIndex: number): number {
  for (const animation of json.animations ?? []) {
    const channels = animation.channels ?? [];
    const samplers = animation.samplers ?? [];
    for (const channel of channels) {
      if (channel.target?.node !== nodeIndex || channel.target?.path !== 'rotation') continue;
      return samplers[channel.sampler]?.output ?? -1;
    }
  }
  return -1;
}

function getQuaternionAccessorLayout(json: GlbJson, accessorIndex: number): {
  offset: number;
  stride: number;
  count: number;
} | null {
  const accessor = json.accessors?.[accessorIndex];
  if (
    !accessor
    || accessor.bufferView === undefined
    || accessor.componentType !== FLOAT_COMPONENT_TYPE
    || accessor.type !== 'VEC4'
  ) {
    return null;
  }
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return null;
  return {
    offset: (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
    stride: bufferView.byteStride ?? QUATERNION_BYTE_SIZE,
    count: accessor.count ?? 0,
  };
}

function readQuaternions(binChunk: Buffer, layout: { offset: number; stride: number; count: number }): number[][] {
  const values: number[][] = [];
  for (let i = 0; i < layout.count; i++) {
    const offset = layout.offset + i * layout.stride;
    values.push([
      binChunk.readFloatLE(offset),
      binChunk.readFloatLE(offset + 4),
      binChunk.readFloatLE(offset + 8),
      binChunk.readFloatLE(offset + 12),
    ]);
  }
  return values;
}

function writeQuaternionAxis(
  binChunk: Buffer,
  layout: { offset: number; stride: number; count: number },
  sourceAxis: SpinAxis,
  targetAxis: SpinAxis,
): number {
  if (sourceAxis === targetAxis) return 0;
  const axisIndex: Record<SpinAxis, number> = { x: 0, y: 1, z: 2 };
  for (let i = 0; i < layout.count; i++) {
    const offset = layout.offset + i * layout.stride;
    const values = [
      binChunk.readFloatLE(offset),
      binChunk.readFloatLE(offset + 4),
      binChunk.readFloatLE(offset + 8),
      binChunk.readFloatLE(offset + 12),
    ];
    values[axisIndex[targetAxis]] = values[axisIndex[sourceAxis]];
    values[axisIndex[sourceAxis]] = 0;
    binChunk.writeFloatLE(values[0], offset);
    binChunk.writeFloatLE(values[1], offset + 4);
    binChunk.writeFloatLE(values[2], offset + 8);
    binChunk.writeFloatLE(values[3], offset + 12);
  }
  return layout.count * QUATERNION_BYTE_SIZE;
}

function inspectHelicopterTailRotorSpinAxis(
  slug: AircraftSlug,
  json: GlbJson,
  binChunk: Buffer | null,
): TailRotorSpinAxisInspection {
  const notApplicable = {
    status: 'not-applicable' as const,
    nodeName: TAIL_ROTOR_NODE_NAME,
    sourceAxis: null,
    importedAxis: null,
    keyframes: 0,
    bytesAffected: 0,
  };
  if (!HELICOPTER_AIRCRAFT.has(slug)) return notApplicable;
  if (!binChunk) {
    return { ...notApplicable, status: 'missing', reason: 'GLB has no BIN chunk.' };
  }

  const nodeIndex = findNodeIndexByName(json, TAIL_ROTOR_NODE_NAME);
  if (nodeIndex < 0) {
    return { ...notApplicable, status: 'missing', reason: `${TAIL_ROTOR_NODE_NAME} node is absent.` };
  }

  const accessorIndex = findRotationAccessorForNode(json, nodeIndex);
  if (accessorIndex < 0) {
    return { ...notApplicable, status: 'missing', reason: `${TAIL_ROTOR_NODE_NAME} rotation channel is absent.` };
  }

  const layout = getQuaternionAccessorLayout(json, accessorIndex);
  if (!layout) {
    return { ...notApplicable, status: 'missing', reason: `${TAIL_ROTOR_NODE_NAME} rotation accessor is not FLOAT VEC4.` };
  }

  const quaternions = readQuaternions(binChunk, layout);
  const axis = inferQuaternionAxis(quaternions);
  if (!axis) {
    return {
      status: 'no-spin-axis',
      nodeName: TAIL_ROTOR_NODE_NAME,
      sourceAxis: null,
      importedAxis: null,
      keyframes: layout.count,
      bytesAffected: 0,
      reason: `${TAIL_ROTOR_NODE_NAME} rotation channel does not expose a dominant spin axis.`,
    };
  }
  const correctedAxis = TAIL_ROTOR_SPIN_AXIS_CORRECTIONS[slug];
  if (correctedAxis && correctedAxis !== axis) {
    const bytesAffected = writeQuaternionAxis(binChunk, layout, axis, correctedAxis);
    return {
      status: 'corrected',
      nodeName: TAIL_ROTOR_NODE_NAME,
      sourceAxis: axis,
      importedAxis: correctedAxis,
      keyframes: layout.count,
      bytesAffected,
      reason: `${slug} source ${TAIL_ROTOR_NODE_NAME} rotates around ${axis}; TIJ side-mounted tail-rotor contract requires ${correctedAxis}.`,
    };
  }
  return {
    status: 'preserved',
    nodeName: TAIL_ROTOR_NODE_NAME,
    sourceAxis: axis,
    importedAxis: axis,
    keyframes: layout.count,
    bytesAffected: 0,
  };
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
    const tailRotorSpinAxisInspection = inspectHelicopterTailRotorSpinAxis(slug, json, binChunk);

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
      tailRotorSpinAxisInspection,
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
    if (record.tailRotorSpinAxisInspection.status !== 'not-applicable') {
      console.log(
        `  tailRotor=${record.tailRotorSpinAxisInspection.status} `
          + `axis=${record.tailRotorSpinAxisInspection.importedAxis ?? 'none'}`,
      );
    }
  }
}

main();
