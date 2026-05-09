#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface BoundaryAttribution {
  traceBoundary?: {
    rendererMainLongOver50Ms?: TraceBoundaryEvent[];
    rendererMainTop?: TraceBoundaryEvent[];
  };
}

interface TraceBoundaryEvent {
  name?: string;
  durationMs?: number;
  source?: string | null;
}

interface ParsedCallsite {
  url: string;
  fileName: string;
  line: number;
  column: number;
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

const OUTPUT_NAME = 'projekt-143-bundle-callsite-resolution';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SOURCE_ANCHORS = [
  'engine.systemManager.updateSystems(deltaTime, engine.gameStarted)',
  'engine.timeScale.postDispatch()',
  'engine.freeFlyCamera?.update(deltaTime, engine.freeFlyInput)',
  'engine.systemManager.atmosphereSystem.syncDomePosition(cameraPos)',
  'engine.systemManager.atmosphereSystem.setTerrainYAtCamera',
  'performanceTelemetry.collectGPUTime()',
  'engine.renderer.beginFrameStats()',
  "performanceTelemetry.beginSystem('RenderMain')",
  'performanceTelemetry.beginGPUTimer()',
  'renderer.render(engine.renderer.scene, activeCamera)',
  "performanceTelemetry.endSystem('RenderMain')"
];
const BUNDLE_MARKERS = [
  'requestAnimationFrame',
  'updateSystems',
  'postDispatch',
  'freeFlyCamera',
  'syncDomePosition',
  'setTerrainYAtCamera',
  'collectGPUTime',
  'beginFrameStats',
  'RenderMain',
  'beginGPUTimer',
  'renderer.render'
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
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return null;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function requireArtifactDir(): string {
  const value = argValue('--artifact');
  if (!value) {
    throw new Error(`Usage: npx tsx scripts/projekt-143-bundle-callsite-resolution.ts --artifact <perf-artifact-dir>`);
  }
  const resolved = resolve(value);
  if (!existsSync(resolved)) throw new Error(`Missing artifact directory: ${value}`);
  return resolved;
}

function parseSource(source: string): ParsedCallsite | null {
  const match = /^(?<url>.+\/(?<fileName>[^/:]+\.js)):(?<line>\d+):(?<column>\d+)$/.exec(source);
  if (!match?.groups) return null;
  return {
    url: match.groups.url,
    fileName: match.groups.fileName,
    line: Number(match.groups.line),
    column: Number(match.groups.column)
  };
}

function sourceFromBoundary(boundaryPath: string): {
  event: TraceBoundaryEvent | null;
  source: string | null;
  sourceList: 'rendererMainLongOver50Ms' | 'rendererMainTop' | null;
} {
  const boundary = readJson<BoundaryAttribution>(boundaryPath);
  const longEvents = boundary.traceBoundary?.rendererMainLongOver50Ms ?? [];
  const topEvents = boundary.traceBoundary?.rendererMainTop ?? [];
  const events = longEvents.length > 0 ? longEvents : topEvents;
  const event = events.find((entry) => entry.name === 'FunctionCall' && typeof entry.source === 'string')
    ?? events.find((entry) => typeof entry.source === 'string')
    ?? null;
  return {
    event,
    source: typeof event?.source === 'string' ? event.source : null,
    sourceList: event ? (longEvents.includes(event) ? 'rendererMainLongOver50Ms' : 'rendererMainTop') : null
  };
}

function locateBundle(parsed: ParsedCallsite): string | null {
  const candidates = [
    join(process.cwd(), 'dist-perf', 'build-assets', parsed.fileName),
    join(process.cwd(), 'dist', 'build-assets', parsed.fileName)
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function bundleWindow(bundlePath: string, lineNumber: number, columnNumber: number): {
  lineText: string;
  lineLength: number;
  windowStartColumn: number;
  windowEndColumn: number;
  windowText: string;
  sourceMappingUrl: string | null;
} {
  const lines = readFileSync(bundlePath, 'utf-8').split(/\r?\n/);
  const lineText = lines[lineNumber - 1] ?? '';
  const windowStartColumn = Math.max(0, columnNumber - 800);
  const windowEndColumn = Math.min(lineText.length, columnNumber + 800);
  const mapComment = lines.find((line) => line.includes('sourceMappingURL='));
  const sourceMappingUrl = /sourceMappingURL=(.+)$/.exec(mapComment ?? '')?.[1] ?? null;
  return {
    lineText,
    lineLength: lineText.length,
    windowStartColumn,
    windowEndColumn,
    windowText: lineText.slice(windowStartColumn, windowEndColumn),
    sourceMappingUrl
  };
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(fullPath);
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
        text: lines[lineIndex].trim()
      });
    }
    if (matchedAnchors.length > 0) {
      candidates.push({
        file: rel(file) ?? file,
        score: matchedAnchors.length,
        matchedAnchors
      });
    }
  }
  return candidates.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    return a.file.localeCompare(b.file);
  });
}

function viteSourcemapConfig(): string | null {
  const viteConfigPath = join(process.cwd(), 'vite.config.js');
  if (!existsSync(viteConfigPath)) return null;
  const config = readFileSync(viteConfigPath, 'utf-8');
  const match = /sourcemap:\s*([^,\n]+)/.exec(config);
  return match?.[1]?.trim() ?? null;
}

function makeMarkdown(report: {
  status: Status;
  classification: { owner: string; confidence: string; acceptance: string };
  inputs: Record<string, string | null>;
  callsite: Record<string, unknown>;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
}): string {
  const lines = [
    '# Projekt Objekt-143 Bundle Callsite Resolution',
    '',
    `- status: ${report.status}`,
    `- classification: ${report.classification.owner}`,
    `- confidence: ${report.classification.confidence}`,
    `- acceptance: ${report.classification.acceptance}`,
    `- source artifact: ${report.inputs.artifactDir}`,
    '',
    '## Callsite',
    `- source: ${report.callsite.source ?? 'unknown'}`,
    `- bundle: ${report.callsite.bundlePath ?? 'unknown'}`,
    `- resolved source: ${report.callsite.bestSourceFile ?? 'unresolved'}`,
    '',
    '## Findings',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    ''
  ];
  return lines.join('\n');
}

function main(): void {
  const artifactDir = requireArtifactDir();
  const boundaryPath = join(artifactDir, 'projekt-143-trace-boundary-attribution', 'boundary-attribution.json');
  if (!existsSync(boundaryPath)) throw new Error(`Missing boundary attribution packet: ${rel(boundaryPath)}`);

  const outputRoot = argValue('--output-root')
    ? resolve(argValue('--output-root') as string)
    : join(process.cwd(), 'artifacts', 'perf', timestampSlug());
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });

  const boundarySource = sourceFromBoundary(boundaryPath);
  const parsed = boundarySource.source ? parseSource(boundarySource.source) : null;
  const bundlePath = parsed ? locateBundle(parsed) : null;
  const bundle = bundlePath && parsed ? bundleWindow(bundlePath, parsed.line, parsed.column) : null;
  const mapPath = bundlePath ? `${bundlePath}.map` : null;
  const mapExists = mapPath ? existsSync(mapPath) : false;
  const candidates = scoreSources(join(process.cwd(), 'src'));
  const best = candidates[0] ?? null;
  const sourcemapConfig = viteSourcemapConfig();
  const bundleMarkers = bundle
    ? BUNDLE_MARKERS.filter((marker) => bundle.windowText.includes(marker))
    : [];
  const hasStrongLoopEvidence = best?.file === 'src/core/GameEngineLoop.ts' && best.score >= 8;
  const status: Status = parsed && bundlePath && hasStrongLoopEvidence ? 'warn' : 'fail';
  const owner = hasStrongLoopEvidence
    ? 'bundle_callsite_resolved_to_game_engine_loop_render_boundary'
    : parsed && bundlePath
      ? 'bundle_callsite_static_resolution_incomplete'
      : 'bundle_callsite_unresolved';

  const findings = [
    `Boundary packet source is ${boundarySource.source ?? 'missing'} from ${boundarySource.sourceList ?? 'no source-bearing renderer-main event'}.`,
    parsed
      ? `Parsed bundle callsite ${parsed.fileName}:${parsed.line}:${parsed.column}.`
      : 'Boundary source could not be parsed as a bundle line/column callsite.',
    bundlePath
      ? `Matched bundle file ${rel(bundlePath)} with size ${statSync(bundlePath).size} bytes.`
      : 'No matching bundle file exists under dist-perf/build-assets or dist/build-assets.',
    `Vite build sourcemap config is ${sourcemapConfig ?? 'not found'}; bundle sourceMappingURL is ${bundle?.sourceMappingUrl ?? 'absent'}; adjacent .map file is ${mapExists ? 'present' : 'absent'}.`,
    bundle
      ? `Bundle window around the callsite includes ${bundleMarkers.length}/${BUNDLE_MARKERS.length} readable minified-loop markers: ${bundleMarkers.join(', ') || 'none'}.`
      : 'No bundle window was extracted.',
    best
      ? `Best repository source candidate is ${best.file} with ${best.score}/${SOURCE_ANCHORS.length} loop anchors: ${best.matchedAnchors.map((anchor) => `${basename(best.file)}:${anchor.line}`).join(', ')}.`
      : 'No source candidate matched the loop anchors.',
    hasStrongLoopEvidence
      ? 'The renderer-main FunctionCall maps to the GameEngineLoop animate/render boundary, not directly to Combat AI state code.'
      : 'Static anchors do not prove a source owner for this bundle callsite.'
  ];

  const report = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: OUTPUT_NAME,
    status,
    inputs: {
      artifactDir: rel(artifactDir),
      boundaryAttribution: rel(boundaryPath),
      distPerfBundle: rel(bundlePath),
      viteConfig: existsSync(join(process.cwd(), 'vite.config.js')) ? 'vite.config.js' : null
    },
    callsite: {
      source: boundarySource.source,
      event: boundarySource.event,
      parsed,
      bundlePath: rel(bundlePath),
      bundleFileSizeBytes: bundlePath ? statSync(bundlePath).size : null,
      bundleLineLength: bundle?.lineLength ?? null,
      windowStartColumn: bundle?.windowStartColumn ?? null,
      windowEndColumn: bundle?.windowEndColumn ?? null,
      windowText: bundle?.windowText ?? null,
      bundleMarkers,
      sourceMap: {
        viteConfig: sourcemapConfig,
        sourceMappingUrl: bundle?.sourceMappingUrl ?? null,
        adjacentMapPath: rel(mapPath),
        adjacentMapExists: mapExists
      },
      bestSourceFile: best?.file ?? null,
      bestSourceScore: best?.score ?? null,
      topSourceCandidates: candidates.slice(0, 8)
    },
    classification: {
      owner,
      confidence: hasStrongLoopEvidence ? 'medium' : 'low',
      acceptance: 'owner_review_only'
    },
    findings,
    nextActions: [
      'Keep STABILIZAT-1 baseline refresh blocked until a standard combat120 capture and perf:compare are clean.',
      'Treat the traced renderer-main FunctionCall as the GameEngineLoop render boundary; use runtime frame and console evidence for Combat AI source ownership.',
      'Add source-level user timing around Combat AI hot paths before changing behavior, because this packet resolves the bundle boundary but does not assign the remaining runtime Combat timing to a TypeScript callsite.',
      'Use a source-map-enabled diagnostic build only if another trace packet must resolve minified bundle offsets directly.'
    ],
    nonClaims: [
      'This packet does not complete DEFEKT-3.',
      'This packet does not authorize a combat120 baseline refresh.',
      'This packet does not prove a runtime fix.',
      'This packet does not assign the first game-side Combat spike to a specific CombatantAI method.'
    ],
    files: {
      summary: rel(join(outputDir, 'callsite-resolution.json')),
      markdown: rel(join(outputDir, 'callsite-resolution.md'))
    }
  };

  const reportPath = join(outputDir, 'callsite-resolution.json');
  const markdownPath = join(outputDir, 'callsite-resolution.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');

  console.log(`Projekt 143 bundle callsite resolution ${status.toUpperCase()}: ${rel(reportPath)}`);
  console.log(`classification=${owner}/${report.classification.confidence}`);
  console.log(`source=${best?.file ?? 'unresolved'} sourcemap=${mapExists ? 'present' : 'absent'}`);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-bundle-callsite-resolution failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
