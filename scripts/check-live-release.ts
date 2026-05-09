#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium } from 'playwright';

interface WorkflowRun {
  conclusion?: string;
  createdAt?: string;
  databaseId?: number;
  event?: string;
  headSha?: string;
  status?: string;
  updatedAt?: string;
  url?: string;
  workflowName?: string;
}

interface HeaderSummary {
  path: string;
  status: number;
  contentType: string | null;
  cacheControl: string | null;
  coop: string | null;
  coep: string | null;
}

interface R2Summary {
  status: number;
  url: string;
  contentType: string | null;
  contentLength: string | null;
  expectedSize: number | null;
  cacheControl: string | null;
  cors: string | null;
}

interface BrowserSmokeSummary {
  currentUrl: string;
  menuText: string | null;
  modeVisible: boolean;
  deployUiVisible: boolean;
  retryVisible: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
  bodyTextExcerpt: string;
}

interface LiveReleaseProof {
  createdAt: string;
  mode: 'projekt-143-live-release-proof';
  status: 'pass' | 'fail';
  baseUrl: string;
  git: {
    head: string;
    branchLine: string;
    dirty: boolean;
    aheadOfOriginMaster: number | null;
    behindOriginMaster: number | null;
  };
  github: {
    ci: WorkflowRun | null;
    deploy: WorkflowRun | null;
  };
  manifest: {
    gitSha: string | null;
    generatedAt: string | null;
    assetBaseUrl: string | null;
  };
  pagesHeaders: HeaderSummary[];
  r2AshauDem: R2Summary | null;
  browserSmoke: BrowserSmokeSummary | null;
  checks: Array<{ id: string; status: 'pass' | 'fail'; detail: string }>;
}

const BASE_URL = 'https://terror-in-the-jungle.pages.dev';
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-live-release-proof';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitOutput(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gitAheadBehind(): { aheadOfOriginMaster: number | null; behindOriginMaster: number | null } {
  try {
    const [behindText, aheadText] = gitOutput(['rev-list', '--left-right', '--count', 'origin/master...HEAD']).split(/\s+/);
    return {
      aheadOfOriginMaster: Number.parseInt(aheadText, 10),
      behindOriginMaster: Number.parseInt(behindText, 10),
    };
  } catch {
    return { aheadOfOriginMaster: null, behindOriginMaster: null };
  }
}

function readWorkflowRuns(): WorkflowRun[] {
  const output = execFileSync('gh', [
    'run',
    'list',
    '--branch',
    'master',
    '--limit',
    '20',
    '--json',
    'databaseId,workflowName,conclusion,status,headSha,event,createdAt,updatedAt,url',
  ], { encoding: 'utf-8' });
  return JSON.parse(output) as WorkflowRun[];
}

function latestSuccessfulRun(runs: WorkflowRun[], workflowName: string, headSha: string): WorkflowRun | null {
  return runs.find((run) => run.workflowName === workflowName
    && run.headSha === headSha
    && run.status === 'completed'
    && run.conclusion === 'success') ?? null;
}

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name);
}

async function fetchPageHeaders(path: string): Promise<HeaderSummary> {
  const url = path === '/'
    ? `${BASE_URL}/?verify=${Date.now()}`
    : `${BASE_URL}${path}?verify=${Date.now()}`;
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  return {
    path,
    status: response.status,
    contentType: headerValue(response.headers, 'content-type'),
    cacheControl: headerValue(response.headers, 'cache-control'),
    coop: headerValue(response.headers, 'cross-origin-opener-policy'),
    coep: headerValue(response.headers, 'cross-origin-embedder-policy'),
  };
}

async function fetchManifest(): Promise<{
  gitSha: string | null;
  generatedAt: string | null;
  assetBaseUrl: string | null;
  ashauDemUrl: string | null;
  ashauDemSize: number | null;
}> {
  const response = await fetch(`${BASE_URL}/asset-manifest.json?verify=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    return { gitSha: null, generatedAt: null, assetBaseUrl: null, ashauDemUrl: null, ashauDemSize: null };
  }
  const manifest = await response.json() as {
    gitSha?: string;
    generatedAt?: string;
    assetBaseUrl?: string;
    assets?: Record<string, { url?: string; size?: number }>;
  };
  const ashauDem = manifest.assets?.['terrain.ashau.dem'] ?? null;
  return {
    gitSha: manifest.gitSha ?? null,
    generatedAt: manifest.generatedAt ?? null,
    assetBaseUrl: manifest.assetBaseUrl ?? null,
    ashauDemUrl: ashauDem?.url ?? null,
    ashauDemSize: ashauDem?.size ?? null,
  };
}

async function fetchR2Headers(url: string | null, expectedSize: number | null): Promise<R2Summary | null> {
  if (!url) return null;
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { Origin: BASE_URL },
    cache: 'no-store',
  });
  return {
    status: response.status,
    url,
    contentType: headerValue(response.headers, 'content-type'),
    contentLength: headerValue(response.headers, 'content-length'),
    expectedSize,
    cacheControl: headerValue(response.headers, 'cache-control'),
    cors: headerValue(response.headers, 'access-control-allow-origin'),
  };
}

async function runBrowserSmoke(): Promise<BrowserSmokeSummary> {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const requestErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.stack ?? error));
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        requestErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto(`${BASE_URL}/?verify=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => {
      const startButton = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
      const playButton = document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
      const button = startButton ?? playButton;
      if (!button) return false;
      const style = window.getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, undefined, { timeout: 120_000 });

    const startButton = await page.$('button[data-ref="start"]');
    const playButton = await page.$('button[data-ref="play"]');
    const menuButton = startButton ?? playButton;
    const menuText = menuButton ? await menuButton.textContent() : null;
    if (menuButton) await menuButton.click();

    const modeCard = page.locator('[data-mode]').first();
    await modeCard.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    const modeVisible = await modeCard.isVisible().catch(() => false);
    if (modeVisible) await modeCard.click();

    await page.waitForTimeout(15_000);
    const bodyText = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');

    return {
      currentUrl: page.url(),
      menuText,
      modeVisible,
      deployUiVisible: await page.locator('#respawn-ui').isVisible().catch(() => false),
      retryVisible: await page.locator('[data-action="retry"]').isVisible().catch(() => false),
      consoleErrors,
      pageErrors,
      requestErrors,
      bodyTextExcerpt: bodyText.slice(0, 1000),
    };
  } finally {
    await browser.close();
  }
}

function pass(id: string, ok: boolean, detail: string): { id: string; status: 'pass' | 'fail'; detail: string } {
  return { id, status: ok ? 'pass' : 'fail', detail };
}

async function buildProof(): Promise<LiveReleaseProof> {
  const head = gitOutput(['rev-parse', 'HEAD']);
  const statusLines = gitOutput(['status', '--short', '--branch']).split(/\r?\n/).filter(Boolean);
  const gitRemoteState = gitAheadBehind();
  const workflowRuns = readWorkflowRuns();
  const ci = latestSuccessfulRun(workflowRuns, 'CI', head);
  const deploy = latestSuccessfulRun(workflowRuns, 'Deploy', head);
  const manifest = await fetchManifest();
  const pagesHeaders = await Promise.all([
    fetchPageHeaders('/'),
    fetchPageHeaders('/asset-manifest.json'),
    fetchPageHeaders('/sw.js'),
  ]);
  const r2AshauDem = await fetchR2Headers(manifest.ashauDemUrl, manifest.ashauDemSize);
  const browserSmoke = await runBrowserSmoke();

  const checks = [
    pass(
      'local-head-pushed',
      gitRemoteState.aheadOfOriginMaster === 0 && gitRemoteState.behindOriginMaster === 0,
      `ahead=${gitRemoteState.aheadOfOriginMaster ?? 'unknown'} behind=${gitRemoteState.behindOriginMaster ?? 'unknown'}`,
    ),
    pass('ci-success-for-head', Boolean(ci), ci?.url ?? 'No successful CI run found for HEAD.'),
    pass('deploy-success-for-head', Boolean(deploy), deploy?.url ?? 'No successful Deploy run found for HEAD.'),
    pass('live-manifest-sha', manifest.gitSha === head, `live=${manifest.gitSha ?? 'missing'} head=${head}`),
    pass(
      'pages-headers',
      pagesHeaders.every((entry) => entry.status === 200 && entry.coop === 'same-origin' && entry.coep === 'credentialless'),
      JSON.stringify(pagesHeaders),
    ),
    pass(
      'r2-ashau-dem',
      Boolean(r2AshauDem
        && r2AshauDem.status === 200
        && r2AshauDem.contentType === 'application/octet-stream'
        && r2AshauDem.contentLength === String(r2AshauDem.expectedSize)
        && r2AshauDem.cacheControl === 'public, max-age=31536000, immutable'
        && r2AshauDem.cors === '*'),
      JSON.stringify(r2AshauDem),
    ),
    pass(
      'live-browser-smoke',
      browserSmoke.modeVisible
        && browserSmoke.deployUiVisible
        && !browserSmoke.retryVisible
        && browserSmoke.consoleErrors.length === 0
        && browserSmoke.pageErrors.length === 0
        && browserSmoke.requestErrors.length === 0,
      JSON.stringify({
        menuText: browserSmoke.menuText,
        modeVisible: browserSmoke.modeVisible,
        deployUiVisible: browserSmoke.deployUiVisible,
        retryVisible: browserSmoke.retryVisible,
        consoleErrors: browserSmoke.consoleErrors.length,
        pageErrors: browserSmoke.pageErrors.length,
        requestErrors: browserSmoke.requestErrors.length,
      }),
    ),
  ];

  return {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-live-release-proof',
    status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
    baseUrl: BASE_URL,
    git: {
      head,
      branchLine: statusLines[0] ?? '',
      dirty: statusLines.slice(1).length > 0,
      aheadOfOriginMaster: gitRemoteState.aheadOfOriginMaster,
      behindOriginMaster: gitRemoteState.behindOriginMaster,
    },
    github: { ci, deploy },
    manifest: {
      gitSha: manifest.gitSha,
      generatedAt: manifest.generatedAt,
      assetBaseUrl: manifest.assetBaseUrl,
    },
    pagesHeaders,
    r2AshauDem,
    browserSmoke,
    checks,
  };
}

async function main(): Promise<void> {
  const proof = await buildProof();
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'release-proof.json');
  writeFileSync(jsonFile, `${JSON.stringify(proof, null, 2)}\n`, 'utf-8');
  console.log(`Projekt 143 live release proof ${proof.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const check of proof.checks) {
    console.log(`- ${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
  }
  if (proof.status !== 'pass') {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
