#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface RenderSubmissionExample {
  nameChain?: string;
  type?: string;
  modelPath?: string | null;
  materialType?: string | null;
  triangles?: number;
  instances?: number;
}

interface RenderSubmissionCategory {
  category?: string;
  drawSubmissions?: number;
  drawShare?: number | null;
  triangles?: number;
  triangleShare?: number | null;
  instances?: number;
  instanceShare?: number | null;
  examples?: RenderSubmissionExample[];
}

interface RenderSubmissionReport {
  sourceSummary?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    runtimeSamples?: number;
    runtimeRenderSubmissionSamples?: number;
  };
  peakSample?: {
    sampleIndex?: number;
    frameEvent?: {
      frameCount?: number;
      frameMs?: number;
    } | null;
    rendererRenderUserTimingMaxMs?: number | null;
  } | null;
  frameSelection?: {
    frameCount?: number | null;
    exactPeakFrame?: boolean;
    totalDrawSubmissions?: number;
    totalTriangles?: number;
    totalInstances?: number;
    topByDrawSubmissions?: RenderSubmissionCategory | null;
    topByTriangles?: RenderSubmissionCategory | null;
    topByInstances?: RenderSubmissionCategory | null;
    categories?: RenderSubmissionCategory[];
    unattributedDrawShare?: number | null;
  };
  rendererReconciliation?: {
    drawSubmissionsToRendererDrawCalls?: number | null;
    selectedFrameTrianglesToRendererTriangles?: number | null;
  };
  classification?: {
    owner?: string;
    confidence?: string;
  };
}

interface SourceAnchor {
  id: string;
  path: string;
  present: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface MeshBasicMaterialSite {
  path: string;
  line: number;
  text: string;
  hasInstancedMesh: boolean;
  hasPerfCategoryTag: boolean;
  hasNameAssignment: boolean;
  geometryLines: string[];
  estimatedTrianglesPerInstance: number | null;
  windowStartLine: number;
  windowEndLine: number;
}

interface CandidateRank {
  owner: string;
  path: string;
  line: number;
  score: number;
  estimatedTrianglesPerInstance: number | null;
  hasInstancedMesh: boolean;
  hasPerfCategoryTag: boolean;
  hasNameAssignment: boolean;
  rationale: string;
  requiredNextEvidence: string;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-unattributed-render-source-audit';
  status: Status;
  inputs: {
    artifactDir: string;
    renderSubmissionPacket: string;
    combatantMeshFactory: string;
    combatantRenderer: string;
  };
  artifactFacts: {
    captureStatus: string | null;
    validation: string | null;
    measurementTrust: string | null;
    peakSampleIndex: number | null;
    peakFrameCount: number | null;
    peakFrameMs: number | null;
    selectedSubmissionFrame: number | null;
    exactPeakFrame: boolean;
    totalDrawSubmissions: number;
    totalTriangles: number;
    totalInstances: number;
    topDrawCategory: string | null;
    topDrawShare: number | null;
    topTriangleCategory: string | null;
    topTriangleShare: number | null;
    topInstanceCategory: string | null;
    topInstanceShare: number | null;
    rendererRenderUserTimingMaxMs: number | null;
    drawReconciliation: number | null;
    triangleReconciliation: number | null;
    unattributedExamples: Array<RenderSubmissionExample & { trianglesPerInstance: number | null }>;
    observedTrianglesPerInstance: number[];
  };
  sourceFacts: {
    markerRingGeometryLine: number | null;
    markerMaterialLine: number | null;
    markerInstancedMeshLine: number | null;
    markerSceneAddLine: number | null;
    markerCountWriteLine: number | null;
    markerMatrixWriteLine: number | null;
    markerRingTrianglesPerInstance: number | null;
    markerHasPerfCategoryTag: boolean;
    markerHasNameAssignment: boolean;
    runtimeMeshBasicMaterialSites: MeshBasicMaterialSite[];
  };
  sourceAnchors: SourceAnchor[];
  candidateRank: CandidateRank[];
  classification: {
    owner:
      | 'combatant_ground_marker_attribution_gap'
      | 'combatant_ground_marker_tagging_present_source'
      | 'unattributed_meshbasic_source_inconclusive'
      | 'unattributed_source_packet_missing_examples';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'diagnostic_only';
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-unattributed-render-source-audit';
const DEFAULT_ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'perf', '2026-05-07T16-32-55-557Z');
const RENDER_PACKET_RELATIVE = join(
  'projekt-143-render-submission-category-attribution',
  'render-submission-category-attribution.json',
);
const COMBATANT_MESH_FACTORY = 'src/systems/combat/CombatantMeshFactory.ts';
const COMBATANT_RENDERER = 'src/systems/combat/CombatantRenderer.ts';

const SOURCE_ANCHORS = [
  {
    id: 'combatant_ground_marker_constructor',
    path: COMBATANT_MESH_FACTORY,
    patterns: [
      'const markerGeometry = new THREE.RingGeometry(1.8, 3.0, 16);',
      'const markerMaterial = new THREE.MeshBasicMaterial({',
      'const marker = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);',
      'this.scene.add(marker);',
    ],
  },
  {
    id: 'combatant_ground_marker_runtime_writes',
    path: COMBATANT_RENDERER,
    patterns: [
      'const markerMesh = this.factionGroundMarkers.get(key);',
      'markerMesh.setMatrixAt(index, this.scratchMarkerMatrix);',
      'markerMesh.count = written;',
      'markerMesh.instanceMatrix.needsUpdate = true;',
    ],
  },
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function requireArtifactDir(): string {
  const raw = argValue('--artifact') ?? DEFAULT_ARTIFACT_DIR;
  const resolved = resolve(raw);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${raw}`);
  return resolved;
}

function lineOf(lines: string[], pattern: string): { line: number | null; text: string | null } {
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index < 0) return { line: null, text: null };
  return { line: index + 1, text: lines[index].trim() };
}

function anchorSource(spec: typeof SOURCE_ANCHORS[number]): SourceAnchor {
  const absolute = join(process.cwd(), spec.path);
  if (!existsSync(absolute)) {
    return {
      id: spec.id,
      path: spec.path,
      present: false,
      anchors: spec.patterns.map((pattern) => ({ pattern, line: null, text: null })),
    };
  }
  const lines = readFileSync(absolute, 'utf-8').split(/\r?\n/);
  const anchors = spec.patterns.map((pattern) => ({ pattern, ...lineOf(lines, pattern) }));
  return {
    id: spec.id,
    path: spec.path,
    present: anchors.every((anchor) => anchor.line !== null),
    anchors,
  };
}

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(absolute));
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx') || entry.endsWith('.d.ts')) continue;
    files.push(absolute);
  }
  return files;
}

function estimateGeometryTriangles(line: string): number | null {
  const ring = line.match(/new THREE\.RingGeometry\(([^)]*)\)/);
  if (ring) {
    const args = ring[1].split(',').map((arg) => Number(arg.trim()));
    const thetaSegments = Number.isFinite(args[2]) ? args[2] : 32;
    const phiSegments = Number.isFinite(args[3]) ? args[3] : 1;
    return thetaSegments * phiSegments * 2;
  }
  const plane = line.match(/new THREE\.PlaneGeometry\(([^)]*)\)/);
  if (plane) {
    const args = plane[1].split(',').map((arg) => Number(arg.trim()));
    const widthSegments = Number.isFinite(args[2]) ? args[2] : 1;
    const heightSegments = Number.isFinite(args[3]) ? args[3] : 1;
    return widthSegments * heightSegments * 2;
  }
  const box = line.match(/new THREE\.BoxGeometry\(/);
  if (box) return 12;
  const circle = line.match(/new THREE\.CircleGeometry\(([^)]*)\)/);
  if (circle) {
    const args = circle[1].split(',').map((arg) => Number(arg.trim()));
    return Number.isFinite(args[1]) ? args[1] : 32;
  }
  return null;
}

function scanMeshBasicMaterialSites(): MeshBasicMaterialSite[] {
  const sourceRoot = join(process.cwd(), 'src');
  return walkSourceFiles(sourceRoot).flatMap((absolute) => {
    const lines = readFileSync(absolute, 'utf-8').split(/\r?\n/);
    const sites: MeshBasicMaterialSite[] = [];
    lines.forEach((line, index) => {
      if (!line.includes('new THREE.MeshBasicMaterial')) return;
      const start = Math.max(0, index - 14);
      const end = Math.min(lines.length, index + 15);
      const windowLines = lines.slice(start, end);
      const geometryLines = windowLines
        .map((windowLine) => windowLine.trim())
        .filter((windowLine) => /new THREE\.\w+Geometry\(/.test(windowLine));
      const estimatedTriangles = geometryLines
        .map(estimateGeometryTriangles)
        .find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
      sites.push({
        path: rel(absolute),
        line: index + 1,
        text: line.trim(),
        hasInstancedMesh: windowLines.some((windowLine) => windowLine.includes('new THREE.InstancedMesh')),
        hasPerfCategoryTag: windowLines.some((windowLine) => windowLine.includes('userData.perfCategory')),
        hasNameAssignment: windowLines.some((windowLine) => /\.name\s*=/.test(windowLine)),
        geometryLines,
        estimatedTrianglesPerInstance: estimatedTriangles,
        windowStartLine: start + 1,
        windowEndLine: end,
      });
    });
    return sites;
  });
}

function observedUnattributedExamples(packet: RenderSubmissionReport): Array<RenderSubmissionExample & { trianglesPerInstance: number | null }> {
  const category = packet.frameSelection?.categories?.find((entry) => entry.category === 'unattributed');
  return (category?.examples ?? []).map((example) => {
    const instances = num(example.instances);
    const trianglesPerInstance = instances > 0 ? round(num(example.triangles) / instances, 4) : null;
    return { ...example, trianglesPerInstance };
  });
}

function rankCandidates(
  sites: MeshBasicMaterialSite[],
  observedTrianglesPerInstance: number[],
): CandidateRank[] {
  const hasObserved32 = observedTrianglesPerInstance.some((value) => Math.abs(value - 32) < 0.001);
  return sites.map((site): CandidateRank => {
    let score = 0;
    const reasons: string[] = [];
    if (site.hasInstancedMesh) {
      score += 35;
      reasons.push('InstancedMesh appears in the local construction window');
    }
    if (site.estimatedTrianglesPerInstance === 32) {
      score += 35;
      reasons.push('estimated geometry cost is 32 triangles per instance');
    }
    if (hasObserved32) {
      score += 15;
      reasons.push('artifact examples include 32 triangles per instance');
    }
    if (!site.hasPerfCategoryTag) {
      score += 10;
      reasons.push('no local perfCategory tag appears');
    }
    if (!site.hasNameAssignment) {
      score += 5;
      reasons.push('no local name assignment appears');
    }
    if (site.path === COMBATANT_MESH_FACTORY) {
      score += 20;
      reasons.push('site is the combatant impostor bucket factory');
    }
    return {
      owner: site.path === COMBATANT_MESH_FACTORY
        ? 'combatant_ground_marker_instanced_ring'
        : 'runtime_meshbasic_material_site',
      path: site.path,
      line: site.line,
      score,
      estimatedTrianglesPerInstance: site.estimatedTrianglesPerInstance,
      hasInstancedMesh: site.hasInstancedMesh,
      hasPerfCategoryTag: site.hasPerfCategoryTag,
      hasNameAssignment: site.hasNameAssignment,
      rationale: reasons.join('; ') || 'no strong match',
      requiredNextEvidence: site.path === COMBATANT_MESH_FACTORY
        ? 'Tag or subdivide the combatant ground marker, rerun runtime render-submission attribution, and verify unattributed draw share moves.'
        : 'Instrument runtime identity if this site remains visible in a follow-up exact-frame packet.',
    };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function markerBlockFacts(): AuditReport['sourceFacts'] {
  const factoryPath = join(process.cwd(), COMBATANT_MESH_FACTORY);
  const rendererPath = join(process.cwd(), COMBATANT_RENDERER);
  const factoryLines = readFileSync(factoryPath, 'utf-8').split(/\r?\n/);
  const rendererLines = readFileSync(rendererPath, 'utf-8').split(/\r?\n/);
  const markerGeometry = lineOf(factoryLines, 'const markerGeometry = new THREE.RingGeometry(1.8, 3.0, 16);');
  const markerMaterial = lineOf(factoryLines, 'const markerMaterial = new THREE.MeshBasicMaterial({');
  const markerMesh = lineOf(factoryLines, 'const marker = new THREE.InstancedMesh(markerGeometry, markerMaterial, maxInstances);');
  const sceneAdd = lineOf(factoryLines, 'this.scene.add(marker);');
  const markerMatrixWrite = lineOf(rendererLines, 'markerMesh.setMatrixAt(index, this.scratchMarkerMatrix);');
  const markerCountWrite = lineOf(rendererLines, 'markerMesh.count = written;');
  const start = Math.max(0, (markerGeometry.line ?? 1) - 1);
  const end = Math.min(factoryLines.length, sceneAdd.line ?? start + 1);
  const block = factoryLines.slice(start, end).join('\n');
  return {
    markerRingGeometryLine: markerGeometry.line,
    markerMaterialLine: markerMaterial.line,
    markerInstancedMeshLine: markerMesh.line,
    markerSceneAddLine: sceneAdd.line,
    markerCountWriteLine: markerCountWrite.line,
    markerMatrixWriteLine: markerMatrixWrite.line,
    markerRingTrianglesPerInstance: markerGeometry.text ? estimateGeometryTriangles(markerGeometry.text) : null,
    markerHasPerfCategoryTag: block.includes('userData.perfCategory'),
    markerHasNameAssignment: /\.name\s*=/.test(block),
    runtimeMeshBasicMaterialSites: scanMeshBasicMaterialSites(),
  };
}

function makeMarkdown(report: AuditReport): string {
  const topRows = report.candidateRank.slice(0, 8).map((candidate) =>
    `| ${candidate.owner} | ${candidate.path}:${candidate.line} | ${candidate.score} | ${candidate.estimatedTrianglesPerInstance ?? 'n/a'} | ${candidate.hasInstancedMesh} | ${candidate.hasPerfCategoryTag} |`);
  return [
    '# Projekt 143 Unattributed Render Source Audit',
    '',
    `- Status: ${report.status}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    '',
    '## Artifact Facts',
    '',
    `- Capture validation: ${report.artifactFacts.validation}`,
    `- Measurement trust: ${report.artifactFacts.measurementTrust}`,
    `- Peak frame: ${report.artifactFacts.peakFrameCount ?? 'n/a'} at ${report.artifactFacts.peakFrameMs ?? 'n/a'}ms`,
    `- Selected submission frame: ${report.artifactFacts.selectedSubmissionFrame ?? 'n/a'}`,
    `- Exact peak frame: ${report.artifactFacts.exactPeakFrame}`,
    `- Top draw category: ${report.artifactFacts.topDrawCategory ?? 'n/a'} @ ${report.artifactFacts.topDrawShare ?? 'n/a'}`,
    `- Unattributed example triangles per instance: ${report.artifactFacts.observedTrianglesPerInstance.join(', ') || 'n/a'}`,
    '',
    '## Source Candidate Rank',
    '',
    '| Owner | Anchor | Score | Triangles/instance | Instanced | Tagged |',
    '|---|---|---:|---:|---|---|',
    ...topRows,
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function buildReport(artifactDir: string, outputDir: string): AuditReport {
  const packetPath = join(artifactDir, RENDER_PACKET_RELATIVE);
  if (!existsSync(packetPath)) throw new Error(`Missing render submission packet: ${rel(packetPath)}`);
  const packet = readJson<RenderSubmissionReport>(packetPath);
  const outputJson = join(outputDir, 'unattributed-render-source-audit.json');
  const outputMd = join(outputDir, 'unattributed-render-source-audit.md');
  const examples = observedUnattributedExamples(packet);
  const observedTrianglesPerInstance = examples
    .map((example) => example.trianglesPerInstance)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const sourceFacts = markerBlockFacts();
  const sourceAnchors = SOURCE_ANCHORS.map(anchorSource);
  const candidateRank = rankCandidates(sourceFacts.runtimeMeshBasicMaterialSites, observedTrianglesPerInstance);
  const topCandidate = candidateRank[0] ?? null;
  const exactPeak = packet.frameSelection?.exactPeakFrame === true;
  const sourceShapePresent = examples.length > 0;
  const markerMatched = topCandidate?.owner === 'combatant_ground_marker_instanced_ring'
    && topCandidate.score >= 100
    && sourceFacts.markerRingTrianglesPerInstance === 32;
  const markerTagged = sourceFacts.markerHasPerfCategoryTag && sourceFacts.markerHasNameAssignment;
  const owner = !sourceShapePresent
    ? 'unattributed_source_packet_missing_examples'
    : markerMatched && markerTagged
      ? 'combatant_ground_marker_tagging_present_source'
    : markerMatched
      ? 'combatant_ground_marker_attribution_gap'
      : 'unattributed_meshbasic_source_inconclusive';
  const confidence: AuditReport['classification']['confidence'] = markerMatched && exactPeak
    ? packet.sourceSummary?.measurementTrust === 'pass'
      ? 'high'
      : 'medium'
    : sourceShapePresent
      ? 'low'
      : 'low';
  const status: Status = owner === 'combatant_ground_marker_attribution_gap' || owner === 'combatant_ground_marker_tagging_present_source'
    ? packet.sourceSummary?.measurementTrust === 'pass'
      ? 'pass'
      : 'warn'
    : 'fail';

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      renderSubmissionPacket: rel(packetPath),
      combatantMeshFactory: COMBATANT_MESH_FACTORY,
      combatantRenderer: COMBATANT_RENDERER,
    },
    artifactFacts: {
      captureStatus: packet.sourceSummary?.captureStatus ?? null,
      validation: packet.sourceSummary?.validation ?? null,
      measurementTrust: packet.sourceSummary?.measurementTrust ?? null,
      peakSampleIndex: typeof packet.peakSample?.sampleIndex === 'number' ? packet.peakSample.sampleIndex : null,
      peakFrameCount: typeof packet.peakSample?.frameEvent?.frameCount === 'number' ? packet.peakSample.frameEvent.frameCount : null,
      peakFrameMs: round(packet.peakSample?.frameEvent?.frameMs, 2),
      selectedSubmissionFrame: typeof packet.frameSelection?.frameCount === 'number' ? packet.frameSelection.frameCount : null,
      exactPeakFrame: exactPeak,
      totalDrawSubmissions: num(packet.frameSelection?.totalDrawSubmissions),
      totalTriangles: num(packet.frameSelection?.totalTriangles),
      totalInstances: num(packet.frameSelection?.totalInstances),
      topDrawCategory: packet.frameSelection?.topByDrawSubmissions?.category ?? null,
      topDrawShare: round(packet.frameSelection?.topByDrawSubmissions?.drawShare, 4),
      topTriangleCategory: packet.frameSelection?.topByTriangles?.category ?? null,
      topTriangleShare: round(packet.frameSelection?.topByTriangles?.triangleShare, 4),
      topInstanceCategory: packet.frameSelection?.topByInstances?.category ?? null,
      topInstanceShare: round(packet.frameSelection?.topByInstances?.instanceShare, 4),
      rendererRenderUserTimingMaxMs: round(packet.peakSample?.rendererRenderUserTimingMaxMs, 2),
      drawReconciliation: round(packet.rendererReconciliation?.drawSubmissionsToRendererDrawCalls, 4),
      triangleReconciliation: round(packet.rendererReconciliation?.selectedFrameTrianglesToRendererTriangles, 4),
      unattributedExamples: examples,
      observedTrianglesPerInstance,
    },
    sourceFacts,
    sourceAnchors,
    candidateRank,
    classification: {
      owner,
      confidence,
      acceptance: 'diagnostic_only',
    },
    findings: [
      `The source-shape packet records exact submission frame ${packet.frameSelection?.frameCount ?? 'n/a'} with top draw category ${packet.frameSelection?.topByDrawSubmissions?.category ?? 'n/a'} at share ${packet.frameSelection?.topByDrawSubmissions?.drawShare ?? 'n/a'} and measurement trust ${packet.sourceSummary?.measurementTrust ?? 'unknown'}.`,
      `The unattributed examples carry material MeshBasicMaterial, no modelPath, and observed triangles-per-instance values ${observedTrianglesPerInstance.join(', ') || 'none'}.`,
      `CombatantMeshFactory constructs a ground marker as RingGeometry(1.8, 3.0, 16), MeshBasicMaterial, and InstancedMesh at lines ${sourceFacts.markerRingGeometryLine ?? 'n/a'}, ${sourceFacts.markerMaterialLine ?? 'n/a'}, and ${sourceFacts.markerInstancedMeshLine ?? 'n/a'}; that ring geometry computes to ${sourceFacts.markerRingTrianglesPerInstance ?? 'n/a'} triangles per instance.`,
      `The marker construction block has perfCategory tag ${sourceFacts.markerHasPerfCategoryTag} and name assignment ${sourceFacts.markerHasNameAssignment}; the runtime renderer writes marker matrices at line ${sourceFacts.markerMatrixWriteLine ?? 'n/a'} and marker counts at line ${sourceFacts.markerCountWriteLine ?? 'n/a'}.`,
      topCandidate
        ? `Top source candidate is ${topCandidate.owner} at ${topCandidate.path}:${topCandidate.line} with score ${topCandidate.score}.`
        : 'No source candidate ranked from runtime MeshBasicMaterial sites.',
      `Classification is ${owner} with ${confidence} confidence and diagnostic-only acceptance.`,
    ],
    nextActions: [
      'Tag or subdivide the combatant ground marker with a runtime perf category and stable name, then rerun render-submission category attribution.',
      'Keep DEFEKT-3 open until a trusted exact-frame packet proves the unattributed draw share moved and the remaining renderer gap has an owner.',
      'Do not refresh the combat120 baseline while p99/max-frame comparison remains outside gate.',
    ],
    nonClaims: [
      'This source audit does not complete DEFEKT-3.',
      'This source audit does not prove a runtime performance fix.',
      'This source audit does not assign the full renderer.render stall to combatant markers.',
      'This source audit does not certify visual or combat feel.',
      'This source audit does not authorize a perf baseline refresh.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const report = buildReport(artifactDir, outputDir);
  writeFileSync(join(outputDir, 'unattributed-render-source-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outputDir, 'unattributed-render-source-audit.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 unattributed render source audit ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`classification=${report.classification.owner}/${report.classification.confidence}`);
  console.log(`topCandidate=${report.candidateRank[0]?.owner ?? 'n/a'} score=${report.candidateRank[0]?.score ?? 'n/a'} source=${report.candidateRank[0]?.path ?? 'n/a'}:${report.candidateRank[0]?.line ?? 'n/a'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-unattributed-render-source-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
