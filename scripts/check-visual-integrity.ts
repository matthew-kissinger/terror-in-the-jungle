#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';

type Status = 'pass' | 'warn' | 'fail';
type Axis = 'x' | 'y' | 'z';

interface SourceAnchor {
  file: string;
  line: number;
  text: string;
}

interface Check {
  id: string;
  status: Status;
  detail: string;
  anchors?: SourceAnchor[];
}

interface TailRotorAxisRead {
  file: string;
  nodeName: string;
  animationName: string;
  axis: Axis | null;
  keyframes: number;
}

interface AircraftAxisRecord {
  slug: string;
  public: TailRotorAxisRead;
  source: TailRotorAxisRead | null;
  matchesSource: boolean | null;
  expectedAxis: Axis;
  matchesExpected: boolean;
  correction: string | null;
}

interface GlbJson {
  asset?: { generator?: string; [key: string]: unknown };
  nodes?: Array<{ name?: string }>;
  animations?: Array<{
    name?: string;
    channels?: Array<{ sampler: number; target?: { node?: number; path?: string } }>;
    samplers?: Array<{ output: number }>;
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
}

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;
const TAIL_ROTOR_NODE_NAME = 'Joint_tailRotor';
const ROTARY_AIRCRAFT = ['uh1-huey', 'uh1c-gunship', 'ah1-cobra'] as const;
const AIRCRAFT_SOURCE_DIR = join(process.cwd(), '..', 'pixel-forge', 'war-assets', 'vehicles', 'aircraft');
const EXPECTED_TAIL_ROTOR_AXIS: Record<(typeof ROTARY_AIRCRAFT)[number], Axis> = {
  'uh1-huey': 'z',
  'uh1c-gunship': 'z',
  'ah1-cobra': 'z',
};
const TAIL_ROTOR_CORRECTIONS: Partial<Record<(typeof ROTARY_AIRCRAFT)[number], string>> = {
  'ah1-cobra': 'source-x-to-runtime-z',
};

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function repoRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function latestArtifactPath(suffix: string): string | null {
  const root = join(process.cwd(), 'artifacts', 'perf');
  if (!existsSync(root)) return null;
  const candidates: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, suffix);
    if (existsSync(candidate)) candidates.push(candidate);
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function findAnchor(file: string, pattern: RegExp): SourceAnchor | null {
  const fullPath = join(process.cwd(), file);
  if (!existsSync(fullPath)) return null;
  const lines = readFileSync(fullPath, 'utf-8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return { file, line: i + 1, text: lines[i].trim() };
    }
  }
  return null;
}

function requireAnchor(file: string, pattern: RegExp): SourceAnchor {
  const anchor = findAnchor(file, pattern);
  if (!anchor) {
    return { file, line: 0, text: `missing:${pattern.source}` };
  }
  return anchor;
}

function readGlb(file: string): { json: GlbJson; binChunk: Buffer } {
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
    if (type === JSON_CHUNK_TYPE) json = JSON.parse(chunk.toString('utf-8').trim()) as GlbJson;
    if (type === BIN_CHUNK_TYPE) binChunk = Buffer.from(chunk);
  }

  if (!json || !binChunk) {
    throw new Error(`${file} is missing JSON or BIN data.`);
  }
  return { json, binChunk };
}

function readQuaternionValues(json: GlbJson, binChunk: Buffer, accessorIndex: number): number[][] {
  const accessor = json.accessors?.[accessorIndex];
  if (
    !accessor
    || accessor.componentType !== FLOAT_COMPONENT_TYPE
    || accessor.type !== 'VEC4'
    || accessor.bufferView === undefined
  ) {
    return [];
  }
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return [];
  const count = accessor.count ?? 0;
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? 16;
  const values: number[][] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + i * stride;
    values.push([
      binChunk.readFloatLE(at),
      binChunk.readFloatLE(at + 4),
      binChunk.readFloatLE(at + 8),
      binChunk.readFloatLE(at + 12),
    ]);
  }
  return values;
}

function inferAxis(values: number[][]): Axis | null {
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

function readTailRotorAxisFromFile(file: string): TailRotorAxisRead {
  const { json, binChunk } = readGlb(file);
  const nodeIndex = json.nodes?.findIndex((node) => node.name === TAIL_ROTOR_NODE_NAME) ?? -1;
  for (const animation of json.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      if (channel.target?.node !== nodeIndex || channel.target?.path !== 'rotation') continue;
      const accessorIndex = animation.samplers?.[channel.sampler]?.output;
      const values = accessorIndex === undefined ? [] : readQuaternionValues(json, binChunk, accessorIndex);
      return {
        file: repoRelative(file),
        nodeName: TAIL_ROTOR_NODE_NAME,
        animationName: animation.name ?? '(unnamed)',
        axis: inferAxis(values),
        keyframes: values.length,
      };
    }
  }
  return {
    file: repoRelative(file),
    nodeName: TAIL_ROTOR_NODE_NAME,
    animationName: '(missing)',
    axis: null,
    keyframes: 0,
  };
}

function readTailRotorAxis(slug: (typeof ROTARY_AIRCRAFT)[number]): AircraftAxisRecord {
  const publicFile = join(process.cwd(), 'public', 'models', 'vehicles', 'aircraft', `${slug}.glb`);
  const sourceFile = join(AIRCRAFT_SOURCE_DIR, `${slug}.glb`);
  const publicAxis = readTailRotorAxisFromFile(publicFile);
  const sourceAxis = existsSync(sourceFile) ? readTailRotorAxisFromFile(sourceFile) : null;
  const expectedAxis = EXPECTED_TAIL_ROTOR_AXIS[slug];
  return {
    slug,
    public: publicAxis,
    source: sourceAxis,
    matchesSource: sourceAxis ? publicAxis.axis === sourceAxis.axis : null,
    expectedAxis,
    matchesExpected: publicAxis.axis === expectedAxis,
    correction: TAIL_ROTOR_CORRECTIONS[slug] ?? null,
  };
}

function check(id: string, status: Status, detail: string, anchors: Array<SourceAnchor | null> = []): Check {
  return {
    id,
    status,
    detail,
    anchors: anchors.filter((anchor): anchor is SourceAnchor => Boolean(anchor)),
  };
}

function worstStatus(checks: Check[]): Status {
  if (checks.some((item) => item.status === 'fail')) return 'fail';
  if (checks.some((item) => item.status === 'warn')) return 'warn';
  return 'pass';
}

function main(): void {
  const outputDir = argValue('--out-dir') ?? join(
    process.cwd(),
    'artifacts',
    'perf',
    timestampSlug(),
    'projekt-143-visual-integrity-audit',
  );
  const importSummaryPath = argValue('--aircraft-import-summary')
    ?? latestArtifactPath(join('pixel-forge-aircraft-import', 'summary.json'));
  mkdirSync(outputDir, { recursive: true });

  const npcClipAnchor = requireAnchor(
    'src/systems/combat/PixelForgeNpcRuntime.ts',
    /return combatant\.isDying \? 'death_fall_back' : 'dead_pose'/,
  );
  const legacyGuardAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /shouldApplyLegacyImpostorDeathTransform/,
  );
  const legacyBlockAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /shouldApplyLegacyImpostorDeathTransform\(clipId\)/,
  );
  const shaderOneShotAnchor = requireAnchor(
    'src/systems/combat/CombatantMeshFactory.ts',
    /animationMode: \{ value: clipId === 'death_fall_back' \? 1 : 0 \}/,
  );
  const closeDistanceAnchor = requireAnchor(
    'src/systems/combat/PixelForgeNpcRuntime.ts',
    /PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS = 64/,
  );
  const closeCapAnchor = requireAnchor(
    'src/systems/combat/PixelForgeNpcRuntime.ts',
    /PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP = 8/,
  );
  const closeFallbackAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /using impostor fallback/,
  );
  const closeRuntimeStatsAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /getCloseModelRuntimeStats/,
  );
  const closeFallbackRecordsAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /getCloseModelFallbackRecords/,
  );
  const closeFallbackReasonAnchor = requireAnchor(
    'src/systems/combat/CombatantRenderer.ts',
    /recordCloseModelFallback/,
  );
  const cutoverAnchor = requireAnchor(
    'scripts/validate-pixel-forge-cutover.ts',
    /legacy soldier source assets must not ship/,
  );
  const explosionSpriteAnchor = requireAnchor(
    'src/systems/effects/ExplosionEffectFactory.ts',
    /new THREE\.Sprite/,
  );
  const explosionRepresentationAnchor = requireAnchor(
    'src/systems/effects/ExplosionEffectFactory.ts',
    /EXPLOSION_EFFECT_REPRESENTATION/,
  );
  const explosionNoLightAnchor = requireAnchor(
    'src/systems/effects/ExplosionEffectFactory.ts',
    /dynamicLights: false/,
  );
  const explosionNoLegacyAnchor = requireAnchor(
    'src/systems/effects/ExplosionEffectFactory.ts',
    /legacyFallback: false/,
  );
  const explosionPoolAnchor = requireAnchor(
    'src/systems/effects/ExplosionEffectsPool.ts',
    /Pooled explosion effects system/,
  );
  const explosionSource = readFileSync(join(process.cwd(), 'src/systems/effects/ExplosionEffectFactory.ts'), 'utf-8')
    + '\n'
    + readFileSync(join(process.cwd(), 'src/systems/effects/ExplosionEffectsPool.ts'), 'utf-8');
  const explosionUsesDynamicLight = /new THREE\.PointLight/.test(explosionSource);
  const importTailAnchor = requireAnchor(
    'scripts/import-pixel-forge-aircraft.ts',
    /inspectHelicopterTailRotorSpinAxis/,
  );
  const importCorrectionAnchor = requireAnchor(
    'scripts/import-pixel-forge-aircraft.ts',
    /TAIL_ROTOR_SPIN_AXIS_CORRECTIONS/,
  );
  const geometryAxisAnchor = requireAnchor(
    'src/systems/helicopter/HelicopterGeometry.ts',
    /inferSpinAxesFromAnimationClips/,
  );
  const animationAxisAnchor = requireAnchor(
    'src/systems/helicopter/HelicopterAnimation.ts',
    /function resolveRotorSpinAxis/,
  );
  const terminologyAnchor = requireAnchor(
    'src/systems/helicopter/HelicopterGeometry.ts',
    /AH1_COBRA:.*AH-1 Cobra/,
  );

  const aircraftAxes = ROTARY_AIRCRAFT.map(readTailRotorAxis);
  const aircraftAxisFailures = aircraftAxes.filter((record) => !record.matchesExpected);
  const aircraftAxisSummary = aircraftAxes
    .map((record) => `${record.slug}:source=${record.source?.axis ?? 'missing'},public=${record.public.axis ?? 'missing'},expected=${record.expectedAxis},correction=${record.correction ?? 'none'}`)
    .join('; ');
  const importSummary = importSummaryPath && existsSync(importSummaryPath)
    ? JSON.parse(readFileSync(importSummaryPath, 'utf-8')) as unknown
    : null;

  const checks: Check[] = [
    check(
      'npc_death_clip_contract',
      npcClipAnchor.line > 0 && shaderOneShotAnchor.line > 0 ? 'pass' : 'fail',
      'Dying Pixel Forge NPCs select death_fall_back and the shader treats that clip as one-shot frame progress.',
      [npcClipAnchor, shaderOneShotAnchor],
    ),
    check(
      'npc_legacy_death_shrink_removed',
      legacyGuardAnchor.line > 0 && legacyBlockAnchor.line > 0 ? 'pass' : 'fail',
      'The procedural billboard death transform is gated away from the Pixel Forge one-shot death clip.',
      [legacyGuardAnchor, legacyBlockAnchor],
    ),
    check(
      'close_impostor_exception_instrumented',
      closeRuntimeStatsAnchor.line > 0 && closeFallbackRecordsAnchor.line > 0 && closeFallbackReasonAnchor.line > 0
        ? 'pass'
        : 'fail',
      'Close NPCs remain distance-gated at 64m with a bounded cap policy, and runtime telemetry records fallback reason counts, distance bounds, pool loads, pool targets, and pool availability.',
      [
        closeDistanceAnchor,
        closeCapAnchor,
        closeFallbackAnchor,
        closeRuntimeStatsAnchor,
        closeFallbackRecordsAnchor,
        closeFallbackReasonAnchor,
      ],
    ),
    check(
      'legacy_npc_sprite_cutover_gate_present',
      cutoverAnchor.line > 0 ? 'pass' : 'fail',
      'The Pixel Forge cutover gate blocks old source-soldier paths and legacy public sprite filenames from shipped output.',
      [cutoverAnchor],
    ),
    check(
      'explosion_sprite_path_classified',
      explosionRepresentationAnchor.line > 0
        && explosionNoLightAnchor.line > 0
        && explosionNoLegacyAnchor.line > 0
        && !explosionUsesDynamicLight
        ? 'pass'
        : 'fail',
      'Explosion visuals are classified as the current optimized pooled unlit billboard flash plus particles and shockwave ring. The source contract marks dynamic lights and legacy fallback false.',
      [explosionSpriteAnchor, explosionRepresentationAnchor, explosionNoLightAnchor, explosionNoLegacyAnchor, explosionPoolAnchor],
    ),
    check(
      'helicopter_tail_rotor_axes_runtime_aligned',
      aircraftAxisFailures.length > 0 ? 'fail' : 'pass',
      aircraftAxisFailures.length === 0
        ? `Public helicopter tail-rotor spin axes match the TIJ side-mounted runtime contract: ${aircraftAxisSummary}.`
        : `Tail rotor runtime-axis mismatch: ${aircraftAxisFailures.map((record) => `${record.slug}:source=${record.source?.axis ?? 'missing'},public=${record.public.axis ?? 'missing'},expected=${record.expectedAxis}`).join(', ')}.`,
      [importTailAnchor, importCorrectionAnchor, geometryAxisAnchor, animationAxisAnchor],
    ),
    check(
      'aircraft_terms_have_explicit_roster_names',
      terminologyAnchor.line > 0 ? 'pass' : 'fail',
      'Rotary aircraft roster terms distinguish UH-1 Huey transport, UH-1C Gunship, and AH-1 Cobra in the runtime model registry.',
      [terminologyAnchor],
    ),
  ];

  const status = worstStatus(checks);
  const report = {
    source: 'projekt-143-visual-integrity-audit',
    createdAt: new Date().toISOString(),
    status,
    classification: status === 'fail'
      ? 'visual_integrity_blocked'
      : status === 'pass'
        ? 'visual_integrity_source_bound_human_review_pending'
        : 'visual_integrity_source_bound_with_open_owner_decisions',
    aircraftAxes,
    importSummaryPath: importSummaryPath ? repoRelative(importSummaryPath) : null,
    importSummary,
    checks,
    nonClaims: [
      'This packet does not certify human visual acceptance of death animation, close-NPC LOD feel, or rotor appearance.',
      'This packet does not retire close-impostor overflow behavior; it instruments the explicit cap and pool-loading exception.',
      'This packet does not replace explosion FX; it classifies the current unlit pooled billboard flash as the active optimized representation, not hidden fallback.',
      'This packet does not certify combat120 or stress-scene grenade performance.',
    ],
  };

  const jsonPath = join(outputDir, 'visual-integrity-audit.json');
  const mdPath = join(outputDir, 'visual-integrity-audit.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(mdPath, [
    '# Projekt 143 Visual Integrity Audit',
    '',
    `Status: ${status.toUpperCase()}`,
    `Classification: ${report.classification}`,
    `Aircraft import summary: ${report.importSummaryPath ?? 'not found'}`,
    '',
    '## Aircraft Tail Rotor Axes',
    ...aircraftAxes.map((record) => `- ${record.slug}: source=${record.source?.axis ?? 'missing'} public=${record.public.axis ?? 'missing'} expected=${record.expectedAxis} correction=${record.correction ?? 'none'} sourceClip=${record.source?.animationName ?? 'missing'} publicClip=${record.public.animationName} matchesExpected=${record.matchesExpected}`),
    '',
    '## Checks',
    ...checks.map((item) => `- ${item.status.toUpperCase()} ${item.id}: ${item.detail}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((item) => `- ${item}`),
    '',
  ].join('\n'), 'utf-8');

  console.log(`Projekt 143 visual integrity audit ${status.toUpperCase()}: ${repoRelative(jsonPath)}`);
}

main();
