#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

type Status = 'warn' | 'fail';

interface LoafScript {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  sourceCharPosition?: number;
  durationMs?: number;
}

interface RenderPresentPacket {
  sourceSummary?: {
    captureStatus?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
    finalFrameCount?: number | null;
  };
  peakSample?: {
    sampleIndex?: number;
    frameEvent?: {
      frameCount?: number;
      frameMs?: number;
    } | null;
    longTaskMaxMs?: number | null;
    loafMaxMs?: number | null;
    rendererRenderUserTimingMaxMs?: number | null;
    webglTextureUploadMaxMs?: number | null;
    peakLoaf?: {
      scriptTotalDurationMs?: number;
      scriptDurationShare?: number | null;
      renderTailAfterScriptsMs?: number | null;
      topScripts?: LoafScript[];
    } | null;
  } | null;
}

interface SourceCandidate {
  file: string;
  score: number;
  matchedAnchors: Array<{
    anchor: string;
    line: number;
    text: string;
  }>;
}

interface MarkerHit {
  marker: string;
  present: boolean;
}

const OUTPUT_NAME = 'projekt-143-raf-callback-source-resolution';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const LOOP_MARKERS = [
  'requestAnimationFrame',
  'isLoopRunning',
  'isDisposed',
  'isInitialized',
  'gameStarted',
  'clock.update',
  'updateSystems',
  'postDispatch',
  'freeFlyCamera',
  'syncDomePosition',
  'setTerrainYAtCamera',
  'RenderMain.collectGPUTime',
  'beginFrameStats',
  'RenderMain.renderer.render',
  'RenderMain.endGPUTimer',
  'RenderOverlay.weapon',
  'RenderOverlay.grenade',
  'RenderOverlay.postProcessing.endFrame'
];
const SOURCE_ANCHORS = [
  'engine.animationFrameId = requestAnimationFrame((timestamp) => animate(engine, timestamp));',
  'export function animate(engine: GameEngine, timestamp?: number): void',
  'engine.clock.update(timestamp);',
  'engine.systemManager.updateSystems(deltaTime, engine.gameStarted);',
  'engine.timeScale.postDispatch();',
  'engine.freeFlyCamera?.update(deltaTime, engine.freeFlyInput);',
  'engine.systemManager.atmosphereSystem.syncDomePosition(cameraPos);',
  'performanceTelemetry.collectGPUTime();',
  'engine.renderer.beginFrameStats();',
  "withLoopUserTiming('RenderMain.renderer.render'",
  'renderer.render(engine.renderer.scene, activeCamera);',
  "withLoopUserTiming('RenderOverlay.weapon'",
  "withLoopUserTiming('RenderOverlay.postProcessing.endFrame'"
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 2): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function requireArtifactDir(): string {
  const value = argValue('--artifact');
  if (!value) {
    throw new Error(`Usage: npx tsx scripts/projekt-143-raf-callback-source-resolution.ts --artifact <perf-artifact-dir> [--render-present <render-present-subdivision.json>]`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function renderPresentPath(artifactDir: string): string {
  const provided = argValue('--render-present');
  if (provided) return resolve(provided);
  return join(artifactDir, 'projekt-143-render-present-subdivision', 'render-present-subdivision.json');
}

function topLoafScript(packet: RenderPresentPacket): LoafScript | null {
  return packet.peakSample?.peakLoaf?.topScripts?.[0] ?? null;
}

function locateBundle(script: LoafScript): string | null {
  if (!script.sourceURL) return null;
  const fileName = basename(new URL(script.sourceURL).pathname);
  const candidates = [
    join(process.cwd(), 'dist-perf', 'build-assets', fileName),
    join(process.cwd(), 'dist', 'build-assets', fileName)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function lineColumnFromOffset(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastLineStart = 0;
  for (let index = 0; index < Math.min(offset, text.length); index++) {
    if (text[index] === '\n') {
      line += 1;
      lastLineStart = index + 1;
    }
  }
  return { line, column: offset - lastLineStart };
}

function compactSnippet(text: string, start: number, end: number): string {
  return text.slice(start, end).replace(/\s+/g, ' ');
}

function findRafTarget(windowText: string): { param: string | null; targetFunctionName: string | null } {
  const match = /requestAnimationFrame\((?<param>[A-Za-z_$][\w$]*)\s*=>\s*(?<target>[A-Za-z_$][\w$]*)\(/.exec(windowText);
  return {
    param: match?.groups?.param ?? null,
    targetFunctionName: match?.groups?.target ?? null,
  };
}

function findFunctionStart(text: string, name: string): number | null {
  const pattern = new RegExp(`function\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
  const match = pattern.exec(text);
  return match ? match.index : null;
}

function findEnclosingFunction(text: string, offset: number): { name: string; start: number } | null {
  const pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;
  let latest: { name: string; start: number } | null = null;
  while ((match = pattern.exec(text)) !== null && match.index <= offset) {
    latest = { name: match[1] ?? 'unknown', start: match.index };
  }
  return latest;
}

function functionWindow(text: string, start: number | null, radius = 5000): { start: number | null; end: number | null; text: string } {
  if (start === null) return { start: null, end: null, text: '' };
  const next = /function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = start + 1;
  const match = next.exec(text);
  const end = match ? match.index : Math.min(text.length, start + radius);
  return {
    start,
    end,
    text: text.slice(start, Math.min(end, start + radius)),
  };
}

function markerHits(text: string): MarkerHit[] {
  return LOOP_MARKERS.map((marker) => ({
    marker,
    present: text.includes(marker),
  }));
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function scoreSources(root: string): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  for (const file of collectFiles(root)) {
    const text = readFileSync(file, 'utf-8');
    const lines = text.split(/\r?\n/);
    const matchedAnchors: SourceCandidate['matchedAnchors'] = [];
    for (const anchor of SOURCE_ANCHORS) {
      const lineIndex = lines.findIndex((line) => line.includes(anchor));
      if (lineIndex < 0) continue;
      matchedAnchors.push({
        anchor,
        line: lineIndex + 1,
        text: lines[lineIndex]?.trim() ?? '',
      });
    }
    if (matchedAnchors.length > 0) {
      candidates.push({
        file: rel(file) ?? file,
        score: matchedAnchors.length,
        matchedAnchors,
      });
    }
  }
  return candidates.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    return a.file.localeCompare(b.file);
  });
}

function hasSourceMap(bundleText: string): boolean {
  return bundleText.includes('sourceMappingURL=');
}

function makeMarkdown(report: any): string {
  return [
    '# Projekt 143 RAF Callback Source Resolution',
    '',
    `- Status: ${report.status}`,
    `- Classification: ${report.classification.owner}`,
    `- Confidence: ${report.classification.confidence}`,
    `- Source artifact: ${report.inputs.artifactDir}`,
    '',
    '## LoAF Script',
    '',
    `- Invoker: ${report.loafScript.invoker ?? 'n/a'}`,
    `- Duration: ${report.loafScript.durationMs ?? 'n/a'}ms`,
    `- Source URL: ${report.loafScript.sourceURL ?? 'n/a'}`,
    `- Source char: ${report.loafScript.sourceCharPosition ?? 'n/a'}`,
    '',
    '## Bundle Resolution',
    '',
    `- Bundle: ${report.bundle.bundlePath ?? 'n/a'}`,
    `- Offset: ${report.bundle.sourceCharPosition ?? 'n/a'}`,
    `- Line/column: ${report.bundle.line ?? 'n/a'}:${report.bundle.column ?? 'n/a'}`,
    `- Enclosing function: ${report.bundle.enclosingFunction?.name ?? 'n/a'}`,
    `- RAF target: ${report.bundle.rafTarget?.targetFunctionName ?? 'n/a'}`,
    `- Target function: ${report.bundle.targetFunction?.name ?? 'n/a'}`,
    `- Marker hits: ${report.bundle.markerSummary.present}/${report.bundle.markerSummary.total}`,
    '',
    '## Source Candidates',
    '',
    '| Score | File |',
    '|---:|---|',
    ...report.sourceCandidates.slice(0, 5).map((candidate: SourceCandidate) => `| ${candidate.score} | ${candidate.file} |`),
    '',
    '## Findings',
    '',
    ...report.findings.map((finding: string) => `- ${finding}`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action: string) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim: string) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const packetPath = renderPresentPath(artifactDir);
  if (!existsSync(packetPath)) throw new Error(`Missing render-present packet: ${rel(packetPath)}`);
  const packet = readJson<RenderPresentPacket>(packetPath);
  const script = topLoafScript(packet);
  if (!script) throw new Error('Render-present packet has no peak LoAF script attribution.');
  const bundlePath = locateBundle(script);
  if (!bundlePath) throw new Error(`Cannot locate bundle for ${script.sourceURL ?? 'unknown source URL'}`);
  const bundleText = readFileSync(bundlePath, 'utf-8');
  const sourceCharPosition = Number(script.sourceCharPosition ?? -1);
  if (!Number.isFinite(sourceCharPosition) || sourceCharPosition < 0 || sourceCharPosition >= bundleText.length) {
    throw new Error(`Invalid sourceCharPosition ${script.sourceCharPosition}`);
  }
  const position = lineColumnFromOffset(bundleText, sourceCharPosition);
  const sourceWindowStart = Math.max(0, sourceCharPosition - 600);
  const sourceWindowEnd = Math.min(bundleText.length, sourceCharPosition + 1600);
  const sourceWindow = bundleText.slice(sourceWindowStart, sourceWindowEnd);
  const rafTarget = findRafTarget(sourceWindow);
  const enclosing = findEnclosingFunction(bundleText, sourceCharPosition);
  const targetStart = rafTarget.targetFunctionName ? findFunctionStart(bundleText, rafTarget.targetFunctionName) : null;
  const target = functionWindow(bundleText, targetStart);
  const hits = markerHits(sourceWindow + target.text);
  const presentMarkers = hits.filter((hit) => hit.present);
  const sourceCandidates = scoreSources(join(process.cwd(), 'src'));
  const bestSource = sourceCandidates[0] ?? null;
  const resolvedToLoop = bestSource?.file === 'src/core/GameEngineLoop.ts'
    && bestSource.score >= 10
    && rafTarget.targetFunctionName !== null
    && presentMarkers.some((hit) => hit.marker === 'RenderMain.renderer.render');
  const outputDir = join(artifactDir, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const reportPath = join(outputDir, 'raf-callback-source-resolution.json');
  const markdownPath = join(outputDir, 'raf-callback-source-resolution.md');
  const classification = resolvedToLoop
    ? {
        owner: 'raf_callback_resolved_to_game_engine_loop_animate_render_main',
        confidence: 'high',
        acceptance: 'owner_review_only',
      }
    : {
        owner: 'raf_callback_source_owner_unresolved',
        confidence: 'low',
        acceptance: 'owner_review_only',
      };
  const status: Status = resolvedToLoop && packet.sourceSummary?.measurementTrust === 'pass' ? 'warn' : 'fail';
  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      renderPresent: rel(packetPath),
      bundle: rel(bundlePath),
    },
    sourceSummary: packet.sourceSummary ?? null,
    sourcePeak: {
      sampleIndex: packet.peakSample?.sampleIndex ?? null,
      frameCount: packet.peakSample?.frameEvent?.frameCount ?? null,
      frameMs: packet.peakSample?.frameEvent?.frameMs ?? null,
      longTaskMaxMs: packet.peakSample?.longTaskMaxMs ?? null,
      loafMaxMs: packet.peakSample?.loafMaxMs ?? null,
      rendererRenderUserTimingMaxMs: packet.peakSample?.rendererRenderUserTimingMaxMs ?? null,
      webglTextureUploadMaxMs: packet.peakSample?.webglTextureUploadMaxMs ?? null,
      scriptTotalDurationMs: packet.peakSample?.peakLoaf?.scriptTotalDurationMs ?? null,
      scriptDurationShare: packet.peakSample?.peakLoaf?.scriptDurationShare ?? null,
      renderTailAfterScriptsMs: packet.peakSample?.peakLoaf?.renderTailAfterScriptsMs ?? null,
    },
    loafScript: {
      invoker: script.invoker ?? null,
      invokerType: script.invokerType ?? null,
      sourceURL: script.sourceURL ?? null,
      sourceCharPosition,
      durationMs: round(script.durationMs),
    },
    bundle: {
      bundlePath: rel(bundlePath),
      bundleFileName: basename(bundlePath),
      bundleLength: bundleText.length,
      hasSourceMap: hasSourceMap(bundleText),
      sourceCharPosition,
      line: position.line,
      column: position.column,
      sourceWindowStart,
      sourceWindowEnd,
      sourceWindow: compactSnippet(bundleText, sourceWindowStart, sourceWindowEnd),
      enclosingFunction: enclosing,
      rafTarget,
      targetFunction: {
        name: rafTarget.targetFunctionName,
        start: target.start,
        end: target.end,
        markerHits: hits,
      },
      markerSummary: {
        present: presentMarkers.length,
        total: hits.length,
        presentMarkers: presentMarkers.map((hit) => hit.marker),
      },
    },
    sourceCandidates: sourceCandidates.slice(0, 10),
    classification,
    findings: [
      `Top LoAF script is a ${script.invoker ?? 'unknown invoker'} with duration ${round(script.durationMs) ?? 'n/a'}ms at ${script.sourceURL ?? 'unknown URL'} char ${sourceCharPosition}.`,
      `The source char falls at bundle line ${position.line}, column ${position.column}, inside enclosing function ${enclosing?.name ?? 'unknown'}.`,
      `The local bundle window contains requestAnimationFrame and points to target function ${rafTarget.targetFunctionName ?? 'unknown'}.`,
      `The target window carries ${presentMarkers.length}/${hits.length} loop markers, including ${presentMarkers.map((hit) => hit.marker).join(', ')}.`,
      bestSource ? `The top source candidate is ${bestSource.file} with ${bestSource.score}/${SOURCE_ANCHORS.length} source anchors.` : 'No source candidate matched the loop anchors.',
      `The source bundle ${basename(bundlePath)} ${hasSourceMap(bundleText) ? 'contains' : 'does not contain'} a sourceMappingURL marker.`,
      `Classification is ${classification.owner} with ${classification.confidence} confidence.`,
    ],
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until maxFrameMs clears the compare gate.',
      'Use the next packet to subdivide GameEngineLoop RenderMain.renderer.render into scene/render-category or Three.WebGLRenderer work before gameplay remediation.',
      'Do not return to suppression raycast cost unless a new trusted packet moves the LoAF owner out of the RAF render script window.',
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not prove a runtime fix.',
      'This packet does not identify a single Three.js internal function as root cause.',
      'This packet does not authorize baseline refresh.',
      'This packet does not certify visual or combat feel.',
    ],
    files: {
      summary: rel(reportPath),
      markdown: rel(markdownPath),
    },
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 RAF callback source resolution ${report.status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${classification.owner}/${classification.confidence}`);
  console.log(`source=${bestSource?.file ?? 'unresolved'} markers=${presentMarkers.length}/${hits.length}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-raf-callback-source-resolution failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
