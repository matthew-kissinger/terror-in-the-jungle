import { appendFileSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

type ValidationReport = {
  overall?: string;
  checks?: Array<{
    id?: string;
    status?: string;
    value?: unknown;
    message?: string;
  }>;
};

type CaptureSummary = {
  startedAt?: string;
  status?: string;
  failureReason?: string;
  finalFrameCount?: number;
  durationSeconds?: number;
  requestedNpcs?: number;
  validation?: ValidationReport;
  scenario?: {
    mode?: string;
    requestedMode?: string;
  };
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

function parseArgs(): { scenario?: string } {
  const args = process.argv.slice(2);
  const result: { scenario?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      result.scenario = args[++i];
    }
  }
  return result;
}

function latestCaptureDir(): string | null {
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const dirs = readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => existsSync(join(ARTIFACT_ROOT, name, 'summary.json')))
    .sort();
  return dirs.at(-1) ?? null;
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeStepSummary(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(summaryPath, `${markdown}\n`, 'utf-8');
}

function annotationValue(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function main(): void {
  const { scenario } = parseArgs();
  const latestDir = latestCaptureDir();

  if (!latestDir) {
    const message = 'No perf capture artifact was found under artifacts/perf.';
    console.log(`::warning title=Perf advisory::${annotationValue(message)}`);
    writeStepSummary(`## Perf advisory\n\n- Scenario: ${scenario ?? 'unknown'}\n- Status: missing artifact\n- Note: ${message}`);
    return;
  }

  const artifactPath = join(ARTIFACT_ROOT, latestDir);
  const summary = loadJson<CaptureSummary>(join(artifactPath, 'summary.json'));
  const validation = loadJson<ValidationReport>(join(artifactPath, 'validation.json')) ?? summary?.validation ?? null;

  if (!summary) {
    const message = `Could not parse summary.json for ${latestDir}.`;
    console.log(`::warning title=Perf advisory::${annotationValue(message)}`);
    writeStepSummary(`## Perf advisory\n\n- Scenario: ${scenario ?? 'unknown'}\n- Artifact: \`${latestDir}\`\n- Status: invalid summary\n- Note: ${message}`);
    return;
  }

  const validationOverall = validation?.overall ?? 'unknown';
  const failureReason = summary.failureReason ?? validation?.checks?.find(check => check.status === 'fail')?.message ?? '';
  const requestedMode = summary.scenario?.requestedMode ?? summary.scenario?.mode ?? 'unknown';
  const statusLine = [
    `artifact=${latestDir}`,
    `capture=${summary.status ?? 'unknown'}`,
    `validation=${validationOverall}`,
    `frames=${summary.finalFrameCount ?? 0}`,
    `mode=${requestedMode}`
  ].join(' ');

  if (summary.status === 'failed' || validationOverall === 'fail') {
    const message = `${statusLine}${failureReason ? ` reason=${failureReason}` : ''}`;
    console.log(`::warning title=Perf advisory capture failed::${annotationValue(message)}`);
  } else if (validationOverall === 'warn') {
    console.log(`::warning title=Perf advisory warning::${annotationValue(statusLine)}`);
  } else {
    console.log(`Perf advisory: ${statusLine}`);
  }

  writeStepSummary([
    '## Perf advisory',
    '',
    `- Scenario: ${scenario ?? requestedMode}`,
    `- Artifact: \`${latestDir}\``,
    `- Capture status: ${summary.status ?? 'unknown'}`,
    `- Validation: ${validationOverall}`,
    `- Final frames: ${summary.finalFrameCount ?? 0}`,
    failureReason ? `- Reason: ${failureReason}` : undefined,
    '',
    'This job is advisory. A green CI workflow does not refresh perf baselines or close STABILIZAT-1.'
  ].filter(Boolean).join('\n'));
}

main();
