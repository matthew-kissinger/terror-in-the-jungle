#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';
type Severity = 'info' | 'warning' | 'error';

interface Finding {
  id: string;
  severity: Severity;
  file: string;
  line: number;
  kind: 'future_date' | 'missing_artifact' | 'missing_package_script';
  message: string;
  evidence: string;
}

interface CommandRef {
  command: string;
  file: string;
  line: number;
}

interface ArtifactRef {
  path: string;
  file: string;
  line: number;
  exists: boolean;
}

interface DocDriftReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-doc-drift';
  status: Status;
  asOfDate: string;
  inputs: {
    docs: string[];
    packageJson: string;
  };
  summary: {
    docsScanned: number;
    futureDateFindings: number;
    missingArtifactRefs: number;
    missingPackageScripts: number;
    artifactRefsChecked: number;
    packageCommandRefsChecked: number;
  };
  findings: Finding[];
  artifactRefs: ArtifactRef[];
  packageCommandRefs: CommandRef[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const DEFAULT_DOCS = [
  'docs/PROJEKT_OBJEKT_143.md',
  'docs/STATE_OF_REPO.md',
  'docs/PERFORMANCE.md',
];
const OUTPUT_NAME = 'projekt-143-doc-drift';
const ARTIFACT_REF_PATTERN = /artifacts\/perf\/[A-Za-z0-9._/<>:-]+/g;
const NPM_RUN_PATTERN = /npm run ([a-z0-9:_-]+)/g;
const DATE_PATTERN = /\b(20\d{2}-\d{2}-\d{2})\b/g;

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function argValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg?.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else if (arg === name && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1] ?? '');
      i += 1;
    }
  }
  return values.filter(Boolean);
}

function defaultTimestamp(): string {
  return new Date().toISOString().replaceAll(':', '-');
}

function asOfDate(): string {
  return argValue('--as-of') ?? new Date().toISOString().slice(0, 10);
}

function docsToScan(): string[] {
  const docs = argValues('--doc');
  return docs.length > 0 ? docs : DEFAULT_DOCS;
}

function outputDir(): string {
  const explicit = argValue('--out-dir');
  if (explicit) return resolve(explicit);
  return join(process.cwd(), 'artifacts', 'perf', defaultTimestamp(), OUTPUT_NAME);
}

function cleanArtifactRef(raw: string): string {
  return raw
    .replace(/[.,;)]+$/g, '')
    .replace(/`+$/g, '')
    .replace(/\/$/, '');
}

function shouldIgnoreFutureDate(line: string): boolean {
  const lower = line.toLowerCase();
  return lower.includes('due no later')
    || lower.includes('next codex audit due')
    || lower.includes('cycle slug convention')
    || lower.includes('yyyy-mm-dd')
    || lower.includes('artifact path lives under');
}

function readPackageScripts(packagePath: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(packagePath, 'utf-8')) as { scripts?: Record<string, string> };
  return parsed.scripts ?? {};
}

function scanDocs(docPaths: string[], currentDate: string, scripts: Record<string, string>): {
  findings: Finding[];
  artifactRefs: ArtifactRef[];
  packageCommandRefs: CommandRef[];
} {
  const findings: Finding[] = [];
  const artifactRefs: ArtifactRef[] = [];
  const packageCommandRefs: CommandRef[] = [];

  for (const docPath of docPaths) {
    const absolute = resolve(docPath);
    if (!existsSync(absolute)) {
      findings.push({
        id: `missing-doc:${docPath}`,
        severity: 'error',
        file: docPath,
        line: 0,
        kind: 'missing_artifact',
        message: `Required doc path is missing: ${docPath}`,
        evidence: docPath,
      });
      continue;
    }

    const lines = readFileSync(absolute, 'utf-8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const dates = [...line.matchAll(DATE_PATTERN)].map((match) => match[1]).filter(Boolean);
      for (const date of dates) {
        if (date > currentDate && !shouldIgnoreFutureDate(line)) {
          findings.push({
            id: `future-date:${docPath}:${lineNumber}:${date}`,
            severity: 'error',
            file: docPath,
            line: lineNumber,
            kind: 'future_date',
            message: `Line carries future date ${date} relative to ${currentDate}.`,
            evidence: line.trim(),
          });
        }
      }

      for (const match of line.matchAll(ARTIFACT_REF_PATTERN)) {
        const raw = match[0] ?? '';
        const path = cleanArtifactRef(raw);
        if (path.includes('<') || path.includes('>') || path.includes('...')) continue;
        const exists = existsSync(resolve(path));
        artifactRefs.push({ path, file: docPath, line: lineNumber, exists });
        if (!exists) {
          findings.push({
            id: `missing-artifact:${docPath}:${lineNumber}:${path}`,
            severity: 'error',
            file: docPath,
            line: lineNumber,
            kind: 'missing_artifact',
            message: `Document references missing artifact path: ${path}`,
            evidence: line.trim(),
          });
        }
      }

      for (const match of line.matchAll(NPM_RUN_PATTERN)) {
        const command = match[1] ?? '';
        packageCommandRefs.push({ command, file: docPath, line: lineNumber });
        if (!scripts[command]) {
          const severity: Severity = docPath === 'docs/PROJEKT_OBJEKT_143.md' ? 'error' : 'warning';
          findings.push({
            id: `missing-package-script:${docPath}:${lineNumber}:${command}`,
            severity,
            file: docPath,
            line: lineNumber,
            kind: 'missing_package_script',
            message: `Document references npm script ${command}, but package.json does not define it.`,
            evidence: line.trim(),
          });
        }
      }
    });
  }

  return { findings, artifactRefs, packageCommandRefs };
}

function statusFromFindings(findings: Finding[]): Status {
  if (findings.some((finding) => finding.severity === 'error')) return 'fail';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warn';
  return 'pass';
}

function buildReport(outDir: string): DocDriftReport {
  const docs = docsToScan();
  const currentDate = asOfDate();
  const packageJsonPath = resolve('package.json');
  const scripts = readPackageScripts(packageJsonPath);
  const { findings, artifactRefs, packageCommandRefs } = scanDocs(docs, currentDate, scripts);
  const outputJson = join(outDir, 'doc-drift.json');
  const outputMd = join(outDir, 'doc-drift.md');

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-doc-drift',
    status: statusFromFindings(findings),
    asOfDate: currentDate,
    inputs: {
      docs,
      packageJson: 'package.json',
    },
    summary: {
      docsScanned: docs.length,
      futureDateFindings: findings.filter((finding) => finding.kind === 'future_date').length,
      missingArtifactRefs: findings.filter((finding) => finding.kind === 'missing_artifact').length,
      missingPackageScripts: findings.filter((finding) => finding.kind === 'missing_package_script').length,
      artifactRefsChecked: artifactRefs.length,
      packageCommandRefsChecked: packageCommandRefs.length,
    },
    findings,
    artifactRefs,
    packageCommandRefs,
    nextActions: findings.length === 0
      ? ['Keep check:doc-drift in the pre-close evidence chain for DEFEKT-2 and release docs.']
      : [
          'Reissue future-dated status claims with a date no later than the current engagement date or mark them as scheduled future work.',
          'Keep check:doc-drift failing while release-facing docs contain time-inconsistent status claims.',
          'Run check:doc-drift before claiming docs, code, and artifact paths are aligned.',
        ],
    nonClaims: [
      'This packet does not validate runtime behavior.',
      'This packet does not prove production deployment state.',
      statusFromFindings(findings) === 'pass'
        ? 'This packet does not satisfy the Article VII 14-day live drift watch.'
        : 'This packet does not complete DEFEKT-2 until the reported drift is corrected and the check passes.',
    ],
    files: {
      summary: rel(outputJson),
      markdown: rel(outputMd),
    },
  };
}

function makeMarkdown(report: DocDriftReport): string {
  return [
    '# Projekt 143 Doc Drift Check',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `As of: ${report.asOfDate}`,
    `Docs scanned: ${report.summary.docsScanned}`,
    `Artifact refs checked: ${report.summary.artifactRefsChecked}`,
    `NPM command refs checked: ${report.summary.packageCommandRefsChecked}`,
    '',
    '## Findings',
    ...(report.findings.length > 0
      ? report.findings.map((finding) => `- ${finding.kind} ${finding.file}:${finding.line} ${finding.message}`)
      : ['- None.']),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const report = buildReport(outDir);
  writeFileSync(join(outDir, 'doc-drift.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'doc-drift.md'), makeMarkdown(report), 'utf-8');
  console.log(`Projekt 143 doc drift ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(`futureDates=${report.summary.futureDateFindings} missingArtifacts=${report.summary.missingArtifactRefs} missingScripts=${report.summary.missingPackageScripts}`);
  if (report.status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-doc-drift failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
