#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type ConsoleMessage } from 'playwright';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type CheckStatus = 'pass' | 'fail';

interface ProofSummary {
  createdAt: string;
  status: CheckStatus;
  url: string;
  headed: boolean;
  artifactDir: string;
  profile: unknown;
  gate: unknown;
  checks: Array<{
    id: string;
    status: CheckStatus;
    detail: string;
  }>;
  browserWarnings: string[];
  browserErrors: string[];
}

const PORT = 9237;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'proofs', 'sky-cloud-post');
const PROOF_QUERY = [
  'perf=1',
  'diag=1',
  'renderer=webgpu-strict',
  'worldProof=sky-cloud-post',
  'cloudShadows=1',
  'uiTransitions=0',
  'logLevel=warn',
].join('&');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function gateField(gate: unknown, key: string): unknown {
  return typeof gate === 'object' && gate !== null
    ? (gate as Record<string, unknown>)[key]
    : undefined;
}

function nestedStatus(gate: unknown, key: string): unknown {
  const value = gateField(gate, key);
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>).status
    : undefined;
}

function makeCheck(id: string, pass: boolean, detail: string): ProofSummary['checks'][number] {
  return {
    id,
    status: pass ? 'pass' : 'fail',
    detail,
  };
}

async function main(): Promise<void> {
  const headed = !hasFlag('--headless');
  const outputDir = join(ARTIFACT_ROOT, timestampSlug());
  mkdirSync(outputDir, { recursive: true });
  const browserWarnings: string[] = [];
  const browserErrors: string[] = [];
  let server: ServerHandle | undefined;
  let browser: Browser | undefined;
  let summary: ProofSummary | undefined;
  const url = `http://127.0.0.1:${PORT}/?${PROOF_QUERY}`;

  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      forceBuild: hasFlag('--force-build'),
      log: (message) => console.log(`[sky-cloud-post-proof] ${message}`),
    });

    browser = await chromium.launch({
      headless: !headed,
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan,WebGPU,WebGPUDeveloperFeatures',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (message: ConsoleMessage) => {
      const text = message.text();
      if (message.type() === 'warning') browserWarnings.push(text);
      if (message.type() === 'error') browserErrors.push(text);
    });
    page.on('pageerror', (error) => browserErrors.push(error.message));

    console.log(`[sky-cloud-post-proof] Navigate -> ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(
      () => typeof (window as unknown as { __skyCloudPostProofGate?: unknown }).__skyCloudPostProofGate === 'function',
      undefined,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const win = window as unknown as {
        __rendererFeatureProfile?: () => unknown;
        __skyCloudPostProofGate?: () => unknown;
      };
      return {
        profile: win.__rendererFeatureProfile?.() ?? null,
        gate: win.__skyCloudPostProofGate?.() ?? null,
      };
    });

    await browser.close();
    browser = undefined;

    const profile = result.profile;
    const gate = result.gate;
    const checks = [
      makeCheck(
        'gate.enabled',
        gateField(gate, 'enabled') === true,
        `enabled=${String(gateField(gate, 'enabled'))}`,
      ),
      makeCheck(
        'gate.state',
        gateField(gate, 'state') === 'webgpu-proof',
        `state=${String(gateField(gate, 'state'))}`,
      ),
      makeCheck(
        'gate.webgpuOnly',
        gateField(gate, 'webgpuOnly') === true,
        `webgpuOnly=${String(gateField(gate, 'webgpuOnly'))}`,
      ),
      makeCheck(
        'gate.lightingAuthority',
        gateField(gate, 'lightingAuthority') === 'AtmosphereSystem/LightingRig',
        `lightingAuthority=${String(gateField(gate, 'lightingAuthority'))}`,
      ),
      makeCheck(
        'gate.renderPipelinePost',
        nestedStatus(gate, 'renderPipelinePost') === 'enabled',
        `renderPipelinePost=${String(nestedStatus(gate, 'renderPipelinePost'))}`,
      ),
      makeCheck(
        'gate.volumetricCloudPrototype',
        nestedStatus(gate, 'volumetricCloudPrototype') === 'enabled',
        `volumetricCloudPrototype=${String(nestedStatus(gate, 'volumetricCloudPrototype'))}`,
      ),
      makeCheck(
        'gate.cloudShadowProbe',
        nestedStatus(gate, 'cloudShadowProbe') === 'enabled',
        `cloudShadowProbe=${String(nestedStatus(gate, 'cloudShadowProbe'))}`,
      ),
    ];
    const status: CheckStatus = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
    summary = {
      createdAt: new Date().toISOString(),
      status,
      url,
      headed,
      artifactDir: outputDir,
      profile,
      gate,
      checks,
      browserWarnings,
      browserErrors,
    };
    const summaryPath = join(outputDir, 'summary.json');
    writeJson(summaryPath, summary);
    console.log(`status=${status}`);
    console.log(`artifact=${rel(outputDir)}`);
    console.log(`gateEnabled=${String(gateField(gate, 'enabled'))}`);
    console.log(`gateState=${String(gateField(gate, 'state'))}`);
    if (status !== 'pass') {
      process.exitCode = 1;
    }
  } catch (error) {
    const summaryPath = join(outputDir, 'summary.json');
    summary = {
      createdAt: new Date().toISOString(),
      status: 'fail',
      url,
      headed,
      artifactDir: outputDir,
      profile: null,
      gate: null,
      checks: [
        makeCheck('script.completed', false, error instanceof Error ? error.message : String(error)),
      ],
      browserWarnings,
      browserErrors,
    };
    writeJson(summaryPath, summary);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await stopServer(server).catch(() => {});
    }
    if (summary && !existsSync(join(outputDir, 'summary.json'))) {
      writeJson(join(outputDir, 'summary.json'), summary);
    }
  }
}

void main();
