#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type EvidenceTrust = 'diagnostic_source_bound' | 'blocked';

interface VisualIntegrityAudit {
  status?: 'pass' | 'warn' | 'fail';
  classification?: string;
  aircraftAxes?: Array<{
    slug: string;
    public?: { axis?: string | null; animationName?: string };
    source?: { axis?: string | null; animationName?: string } | null;
    matchesSource?: boolean | null;
    expectedAxis?: string;
    matchesExpected?: boolean;
    correction?: string | null;
  }>;
  checks?: Array<{ id: string; status: string; detail: string }>;
  nonClaims?: string[];
}

interface ImportSummary {
  createdAt?: string;
  records?: Array<{
    slug: string;
    targetGlb: string;
    appliedAxisNormalization?: string;
    tailRotorSpinAxisInspection?: {
      status: string;
      sourceAxis: string | null;
      importedAxis: string | null;
      keyframes: number;
      bytesAffected: number;
    };
  }>;
}

interface ReviewPacket {
  createdAt: string;
  sourceGitSha: string;
  directiveId: 'DEFEKT-5';
  requestingBureaus: string[];
  status: 'needs_human_decision';
  artifactPath: string;
  captureType: string[];
  evidenceTrust: EvidenceTrust;
  visualAudit: string | null;
  aircraftImportSummary: string | null;
  reviewerDecisionOptions: string[];
  visualClaimsUnderReview: string[];
  findings: string[];
  rotorAxisRecords: Array<{
    slug: string;
    sourceAxis: string | null;
    publicAxis: string | null;
    expectedAxis: string | null;
    matchesSource: boolean | null;
    matchesExpected: boolean | null;
    correction: string | null;
  }>;
  nonClaims: string[];
  nextRequiredAction: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-defekt5-human-review';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function repoRelative(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function outputRelative(outputDir: string, path: string | null): string | null {
  return path ? relative(outputDir, path).replaceAll('\\', '/') : null;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function latestArtifactPath(suffix: string): string | null {
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const candidates: string[] = [];
  for (const entry of readdirSync(ARTIFACT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(ARTIFACT_ROOT, entry.name, suffix);
    if (existsSync(candidate)) candidates.push(candidate);
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function writeMarkdown(packet: ReviewPacket, path: string): void {
  const lines = [
    '# KB-DIZAYN / KB-DEFEKT Review Request',
    '',
    `Directive ID: ${packet.directiveId}`,
    `Requesting bureau: ${packet.requestingBureaus.join(', ')}`,
    `Artifact path: ${packet.artifactPath}`,
    `Capture type: ${packet.captureType.join(', ')}`,
    `Evidence trust: ${packet.evidenceTrust}`,
    `Visual audit: ${packet.visualAudit ?? 'missing'}`,
    `Aircraft import summary: ${packet.aircraftImportSummary ?? 'missing'}`,
    'Reviewer decision requested: signed | returned_with_notes | blocked',
    '',
    '## Visual Claims Under Review',
    ...packet.visualClaimsUnderReview.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Findings',
    ...packet.findings.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Rotor Axis Records',
    ...packet.rotorAxisRecords.map((record, index) =>
      `${index + 1}. ${record.slug}: source=${record.sourceAxis ?? 'missing'}, public=${record.publicAxis ?? 'missing'}, expected=${record.expectedAxis ?? 'missing'}, matchesExpected=${record.matchesExpected ?? 'unknown'}, correction=${record.correction ?? 'none'}`
    ),
    '',
    '## Non-Claims',
    ...packet.nonClaims.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Next Required Action',
    ...packet.nextRequiredAction.map((item, index) => `${index + 1}. ${item}`),
    '',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf-8');
}

function writeHtml(packet: ReviewPacket, outputDir: string, path: string): void {
  const visualAuditHref = outputRelative(outputDir, packet.visualAudit ? join(process.cwd(), packet.visualAudit) : null);
  const importSummaryHref = outputRelative(outputDir, packet.aircraftImportSummary ? join(process.cwd(), packet.aircraftImportSummary) : null);
  const itemList = (items: string[]) => items.map((item) => `      <li>${escapeHtml(item)}</li>`).join('\n');
  const rotorRows = packet.rotorAxisRecords.map((record) => [
    '      <tr>',
    `        <td>${escapeHtml(record.slug)}</td>`,
    `        <td>${escapeHtml(record.sourceAxis ?? 'missing')}</td>`,
    `        <td>${escapeHtml(record.publicAxis ?? 'missing')}</td>`,
    `        <td>${escapeHtml(String(record.matchesExpected ?? 'unknown'))}</td>`,
    '      </tr>',
  ].join('\n')).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Projekt 143 DEFEKT-5 Human Review Packet</title>',
    '  <style>',
    '    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #111; color: #eee; }',
    '    body { margin: 0; padding: 32px; }',
    '    main { max-width: 1040px; margin: 0 auto; }',
    '    section { border: 1px solid #333; background: #181818; padding: 18px; margin: 18px 0; }',
    '    h1, h2 { margin: 0 0 14px; }',
    '    code { background: #262626; padding: 2px 5px; border-radius: 4px; }',
    '    a { color: #8bd3ff; }',
    '    table { width: 100%; border-collapse: collapse; }',
    '    th, td { border-bottom: 1px solid #333; padding: 8px; text-align: left; }',
    '    .status { color: #ffcf6e; font-weight: 700; text-transform: uppercase; }',
    '  </style>',
    '</head>',
    '<body>',
    '<main>',
    '  <h1>Projekt 143 DEFEKT-5 Human Review Packet</h1>',
    `  <p class="status">${escapeHtml(packet.status.replaceAll('_', ' '))}</p>`,
    '  <section>',
    '    <h2>Evidence</h2>',
    `    <p><strong>Trust:</strong> <code>${escapeHtml(packet.evidenceTrust)}</code></p>`,
    '    <ul>',
    visualAuditHref ? `      <li>Visual audit: <a href="${escapeHtml(visualAuditHref)}">${escapeHtml(packet.visualAudit ?? '')}</a></li>` : '      <li>Visual audit: missing</li>',
    importSummaryHref ? `      <li>Aircraft import summary: <a href="${escapeHtml(importSummaryHref)}">${escapeHtml(packet.aircraftImportSummary ?? '')}</a></li>` : '      <li>Aircraft import summary: missing</li>',
    '    </ul>',
    '  </section>',
    '  <section>',
    '    <h2>Claims Under Review</h2>',
    '    <ol>',
    itemList(packet.visualClaimsUnderReview),
    '    </ol>',
    '  </section>',
    '  <section>',
    '    <h2>Findings</h2>',
    '    <ol>',
    itemList(packet.findings),
    '    </ol>',
    '  </section>',
    '  <section>',
    '    <h2>Rotor Axis Records</h2>',
    '    <table>',
    '      <thead><tr><th>Aircraft</th><th>Source Axis</th><th>Public Axis</th><th>Matches Expected</th></tr></thead>',
    '      <tbody>',
    rotorRows,
    '      </tbody>',
    '    </table>',
    '  </section>',
    '  <section>',
    '    <h2>Non-Claims</h2>',
    '    <ol>',
    itemList(packet.nonClaims),
    '    </ol>',
    '  </section>',
    '  <section>',
    '    <h2>Decision Required</h2>',
    '    <p>Reviewer decision requested: <code>signed</code>, <code>returned_with_notes</code>, or <code>blocked</code>.</p>',
    '    <ol>',
    itemList(packet.nextRequiredAction),
    '    </ol>',
    '  </section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
  writeFileSync(path, `${html}\n`, 'utf-8');
}

function main(): void {
  const outputDir = argValue('--out-dir') ?? join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  const visualAuditPath = argValue('--visual-audit')
    ?? latestArtifactPath(join('projekt-143-visual-integrity-audit', 'visual-integrity-audit.json'));
  const importSummaryPath = argValue('--aircraft-import-summary')
    ?? latestArtifactPath(join('pixel-forge-aircraft-import', 'summary.json'));
  mkdirSync(outputDir, { recursive: true });

  const visualAudit = readJson<VisualIntegrityAudit>(visualAuditPath);
  const importSummary = readJson<ImportSummary>(importSummaryPath);
  const artifactPath = repoRelative(outputDir) ?? outputDir;
  const reviewJson = join(outputDir, 'review-summary.json');
  const reviewMd = join(outputDir, 'review-record.md');
  const reviewHtml = join(outputDir, 'index.html');

  const rotorAxisRecords = (visualAudit?.aircraftAxes ?? []).map((record) => ({
    slug: record.slug,
    sourceAxis: record.source?.axis ?? null,
    publicAxis: record.public?.axis ?? null,
    expectedAxis: record.expectedAxis ?? null,
    matchesSource: record.matchesSource ?? null,
    matchesExpected: record.matchesExpected ?? null,
    correction: record.correction ?? null,
  }));

  const importRotorRecords = (importSummary?.records ?? [])
    .filter((record) =>
      record.tailRotorSpinAxisInspection
      && record.tailRotorSpinAxisInspection.status !== 'not-applicable'
    )
    .map((record) =>
      `${record.slug} ${record.tailRotorSpinAxisInspection?.status} source=${record.tailRotorSpinAxisInspection?.sourceAxis ?? 'missing'} imported=${record.tailRotorSpinAxisInspection?.importedAxis ?? 'missing'} bytes=${record.tailRotorSpinAxisInspection?.bytesAffected ?? 0}`
    )
    .join('; ');

  const evidenceTrust: EvidenceTrust = visualAudit?.status === 'pass' ? 'diagnostic_source_bound' : 'blocked';
  const packet: ReviewPacket = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    directiveId: 'DEFEKT-5',
    requestingBureaus: ['KB-DEFEKT', 'KB-DIZAYN', 'KB-AVIATSIYA'],
    status: 'needs_human_decision',
    artifactPath,
    captureType: ['source audit', 'asset import summary', 'test proof references'],
    evidenceTrust,
    visualAudit: repoRelative(visualAuditPath),
    aircraftImportSummary: repoRelative(importSummaryPath),
    reviewerDecisionOptions: ['signed', 'returned_with_notes', 'blocked'],
    visualClaimsUnderReview: [
      'Pixel Forge NPC death impostors use death_fall_back without the legacy procedural shrink transform.',
      'Close-radius NPC impostors are explicit cap, pool-loading, pool-empty, or perf-isolation fallback records, not hidden distance-rule drift.',
      'Explosion visuals use the current pooled unlit billboard flash, point particles, debris particles, and shockwave ring with legacyFallback=false.',
      'UH-1 Huey, UH-1C Gunship, and AH-1 Cobra rotor naming and tail-rotor spin axes match the side-mounted runtime contract; AH-1 Cobra carries an explicit source-x to runtime-z correction.',
    ],
    findings: [
      `Visual-integrity audit status is ${visualAudit?.status ?? 'missing'} with classification ${visualAudit?.classification ?? 'missing'}.`,
      importRotorRecords
        ? `Aircraft import summary records tail-rotor spin-axis policy: ${importRotorRecords}.`
        : 'Aircraft import summary does not expose tail-rotor inspection records.',
      'The packet requests human visual decision because source evidence cannot certify the viewed death animation, close-NPC LOD feel, explosion appearance, or rotor appearance.',
    ],
    rotorAxisRecords,
    nonClaims: [
      'This packet does not certify human visual acceptance.',
      'This packet does not provide screenshot or video evidence of the current player view.',
      'This packet does not retire the close-model cap policy.',
      'This packet does not certify combat120, grenade stress performance, deployment, or live production parity.',
    ],
    nextRequiredAction: [
      'Politburo or KB-DIZAYN reviews the current game or a screenshot/video capture and records signed, returned_with_notes, or blocked.',
      'If signed, DEFEKT-5 may cite this packet plus the visual-integrity audit as visual decision evidence.',
      'If returned_with_notes or blocked, the next bureau slice must address the named visual defect before status promotion.',
    ],
  };

  writeFileSync(reviewJson, `${JSON.stringify(packet, null, 2)}\n`, 'utf-8');
  writeMarkdown(packet, reviewMd);
  writeHtml(packet, outputDir, reviewHtml);
  console.log(`Projekt 143 DEFEKT-5 human review packet ${packet.status.toUpperCase()}: ${repoRelative(reviewJson)}`);
}

main();
