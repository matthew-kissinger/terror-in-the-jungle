#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

type ReviewStatus =
  | 'needs_human_decision'
  | 'accepted_exception'
  | 'rejected_needs_crop_scale_pass'
  | 'invalid_runtime_comparison'
  | 'needs_runtime_equivalent_review';

type ComparisonBasis =
  | 'separate_transparent_crops'
  | 'runtime_equivalent_same_scene'
  | 'owner_explicit_exception';

interface PreviousReview {
  status?: ReviewStatus;
  comparisonBasis?: ComparisonBasis;
  html?: string;
  decision?: string;
  ownerDecision?: string;
}

interface RuntimeProbeSummary {
  activeCloseModelCount?: number;
  closeModelPoolLoads?: number;
  closeModelPoolTargets?: Record<string, number>;
  closeModelPoolAvailable?: Record<string, number>;
  failures?: string[];
}

interface HumanReviewInvalidation {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-optik-human-review';
  status: 'invalid_runtime_comparison';
  comparisonBasis: 'separate_transparent_crops';
  html: string;
  invalidates: string | null;
  invalidatedHtml: string | null;
  runtimeProbe: string | null;
  runtimeProbeScreenshot: string | null;
  ownerDecision: string;
  decision: string;
  rejectionReasons: string[];
  requiredReplacementEvidence: string[];
  runtimeProbeDigest: RuntimeProbeSummary | null;
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-optik-human-review';
const RUNTIME_PROBE_SUMMARY = join(process.cwd(), 'artifacts', 'pixel-forge-npc-probe', 'summary.json');
const RUNTIME_PROBE_SCREENSHOT = join(process.cwd(), 'artifacts', 'pixel-forge-npc-probe', 'latest.png');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(root: string, predicate: (path: string) => boolean): string | null {
  const matches = walkFiles(root, predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function relFromOutput(outputDir: string, path: string | null): string | null {
  return path ? relative(outputDir, path).replaceAll('\\', '/') : null;
}

function pathFromRepoRelative(path: string | null | undefined): string | null {
  return path ? join(process.cwd(), path) : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function writeHtml(report: HumanReviewInvalidation, outputDir: string, path: string): void {
  const previousSummaryHref = relFromOutput(outputDir, pathFromRepoRelative(report.invalidates));
  const previousHtmlHref = relFromOutput(outputDir, pathFromRepoRelative(report.invalidatedHtml));
  const runtimeProbeHref = relFromOutput(outputDir, pathFromRepoRelative(report.runtimeProbe));
  const runtimeProbeScreenshotHref = relFromOutput(outputDir, pathFromRepoRelative(report.runtimeProbeScreenshot));

  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Projekt 143 KB-OPTIK Human Review</title>',
    '  <style>',
    '    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111; color: #eee; }',
    '    body { margin: 0; padding: 32px; }',
    '    main { max-width: 980px; margin: 0 auto; }',
    '    h1, h2 { margin: 0 0 14px; }',
    '    section { border: 1px solid #333; padding: 18px; margin: 18px 0; background: #181818; }',
    '    code { background: #242424; padding: 2px 5px; border-radius: 4px; }',
    '    a { color: #8bd3ff; }',
    '    ul { padding-left: 22px; }',
    '    img { max-width: 100%; border: 1px solid #333; background: #090909; }',
    '    .status { color: #ffb86b; font-weight: 700; text-transform: uppercase; }',
    '    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }',
    '  </style>',
    '</head>',
    '<body>',
    '<main>',
    '  <h1>Projekt 143 KB-OPTIK Human Review</h1>',
    `  <p class="status">${escapeHtml(report.status.replaceAll('_', ' '))}</p>`,
    '  <section>',
    '    <h2>Decision</h2>',
    `    <p>${escapeHtml(report.decision)}</p>`,
    `    <p><strong>Comparison basis:</strong> <code>${escapeHtml(report.comparisonBasis)}</code></p>`,
    '  </section>',
    '  <section>',
    '    <h2>Why This Packet Is Rejected</h2>',
    '    <ul>',
    ...report.rejectionReasons.map((reason) => `      <li>${escapeHtml(reason)}</li>`),
    '    </ul>',
    '  </section>',
    '  <section>',
    '    <h2>Required Replacement Evidence</h2>',
    '    <ul>',
    ...report.requiredReplacementEvidence.map((requirement) => `      <li>${escapeHtml(requirement)}</li>`),
    '    </ul>',
    '  </section>',
    '  <section>',
    '    <h2>Referenced Evidence</h2>',
    '    <ul>',
    previousSummaryHref ? `      <li>Invalidated summary: <a href="${escapeHtml(previousSummaryHref)}">${escapeHtml(report.invalidates ?? '')}</a></li>` : '',
    previousHtmlHref ? `      <li>Invalidated HTML: <a href="${escapeHtml(previousHtmlHref)}">${escapeHtml(report.invalidatedHtml ?? '')}</a></li>` : '',
    runtimeProbeHref ? `      <li>Runtime probe summary: <a href="${escapeHtml(runtimeProbeHref)}">${escapeHtml(report.runtimeProbe ?? '')}</a></li>` : '',
    '    </ul>',
    '  </section>',
    runtimeProbeScreenshotHref
      ? [
        '  <section>',
        '    <h2>Runtime Probe Screenshot</h2>',
        `    <img src="${escapeHtml(runtimeProbeScreenshotHref)}" alt="Runtime probe screenshot showing close GLB NPCs in game">`,
        '  </section>',
      ].join('\n')
      : '',
    '  <section>',
    '    <h2>Runtime Probe Digest</h2>',
    `    <pre>${escapeHtml(JSON.stringify(report.runtimeProbeDigest, null, 2))}</pre>`,
    '  </section>',
    '</main>',
    '</body>',
    '</html>',
  ].filter(Boolean);

  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function main(): void {
  const force = process.argv.includes('--force');
  const previousReviewPath = latestFile(ARTIFACT_ROOT, (path) =>
    path.endsWith(join(OUTPUT_NAME, 'review-summary.json'))
  );
  const previousReview = readJson<PreviousReview>(previousReviewPath);
  const latestReviewAlreadyInvalid =
    previousReview?.status === 'invalid_runtime_comparison'
    && previousReview.comparisonBasis === 'separate_transparent_crops';
  const latestReviewAccepted =
    previousReview?.status === 'accepted_exception'
    && (previousReview.comparisonBasis === 'runtime_equivalent_same_scene'
      || previousReview.comparisonBasis === 'owner_explicit_exception');
  const latestReviewNeedsOwnerDecision =
    previousReview?.status === 'needs_human_decision'
    && previousReview.comparisonBasis === 'runtime_equivalent_same_scene';

  if (!force && latestReviewAlreadyInvalid) {
    console.log(`Projekt 143 KB-OPTIK human review already INVALID_RUNTIME_COMPARISON: ${rel(previousReviewPath)}`);
    return;
  }

  if (!force && latestReviewAccepted) {
    console.log(`Projekt 143 KB-OPTIK human review already accepted with an acceptable comparison basis: ${rel(previousReviewPath)}`);
    console.log('Use --force only if the accepted review must be explicitly invalidated.');
    return;
  }

  if (!force && latestReviewNeedsOwnerDecision) {
    console.log(`Projekt 143 KB-OPTIK runtime-equivalent human review is pending owner decision: ${rel(previousReviewPath)}`);
    console.log('Use --force only if this runtime-equivalent packet must be explicitly invalidated.');
    return;
  }

  const previousHtmlPath = pathFromRepoRelative(previousReview?.html);
  const runtimeProbe = readJson<RuntimeProbeSummary>(RUNTIME_PROBE_SUMMARY);

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'review-summary.json');
  const htmlFile = join(outputDir, 'index.html');

  const report: HumanReviewInvalidation = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-optik-human-review',
    status: 'invalid_runtime_comparison',
    comparisonBasis: 'separate_transparent_crops',
    html: rel(htmlFile) ?? '',
    invalidates: rel(previousReviewPath),
    invalidatedHtml: existsSync(previousHtmlPath ?? '') ? rel(previousHtmlPath) : previousReview?.html ?? null,
    runtimeProbe: existsSync(RUNTIME_PROBE_SUMMARY) ? rel(RUNTIME_PROBE_SUMMARY) : null,
    runtimeProbeScreenshot: existsSync(RUNTIME_PROBE_SCREENSHOT) ? rel(RUNTIME_PROBE_SCREENSHOT) : null,
    ownerDecision: 'Owner rejected the current packet because the GLB side shows a T-pose/weaponless close model while the impostor side shows a posed atlas frame with the top of the head and a weapon.',
    decision: 'Current packet rejected as a wrong comparison; regenerate runtime-equivalent same-scene close GLB/impostor comparison before KB-OPTIK closeout.',
    rejectionReasons: [
      'The close GLB crop in the packet is a static T-pose and does not include the weapon or runtime animation pose.',
      'The impostor crop is an atlas/runtime pose view with weapon visibility and different camera framing.',
      'The packet compares separate transparent crops, not the same in-game scene, pose, camera, lighting, and LOD transition.',
      'The runtime probe shows close GLB NPCs can load with weapons in game, so the rejected packet is an evidence-generation mismatch rather than proof that the in-game GLB is weaponless.',
    ],
    requiredReplacementEvidence: [
      'Capture close GLB and impostor examples from equivalent runtime scenes or an explicitly matched review harness.',
      'Use the same faction, clip/pose, weapon visibility, camera profile, lighting, target height, and crop policy on both sides.',
      'Keep the rejected packet as historical evidence only; do not use it for visual acceptance or exception closeout.',
    ],
    runtimeProbeDigest: runtimeProbe
      ? {
        activeCloseModelCount: runtimeProbe.activeCloseModelCount,
        closeModelPoolLoads: runtimeProbe.closeModelPoolLoads,
        closeModelPoolTargets: runtimeProbe.closeModelPoolTargets,
        closeModelPoolAvailable: runtimeProbe.closeModelPoolAvailable,
        failures: runtimeProbe.failures,
      }
      : null,
  };

  writeHtml(report, outputDir, htmlFile);
  writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(`Projekt 143 KB-OPTIK human review ${report.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  console.log(report.decision);
}

main();
