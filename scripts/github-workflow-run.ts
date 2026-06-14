#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { spawnSync } from 'node:child_process';

import {
  branchNameFromRef,
  selectExistingWorkflowRun,
  workflowMayReuseExistingRun,
  type ExistingWorkflowRunDecision,
  type WorkflowRunSummary,
} from './github-workflow-run-utils';

type Options = {
  workflow: string;
  ref: string;
  watch: boolean;
  reuseExisting: boolean;
  reuseWaitSeconds: number;
  passthrough: string[];
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const workflow = args.shift();
  if (!workflow) {
    throw new Error(
      'Usage: github-workflow-run.ts <workflow.yml> [--ref <ref>] [--watch] [--no-reuse-existing] [--reuse-wait-seconds <n>] [-- <gh args>]',
    );
  }

  let ref = 'master';
  let watch = false;
  let reuseExisting = true;
  let reuseWaitSeconds = 30;
  const passthrough: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      passthrough.push(...args.slice(index + 1));
      break;
    }
    if (arg === '--ref') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('Missing value for --ref');
      }
      ref = next;
      index += 1;
      continue;
    }
    if (arg.startsWith('--ref=')) {
      ref = arg.slice('--ref='.length);
      continue;
    }
    if (arg === '--watch') {
      watch = true;
      continue;
    }
    if (arg === '--no-reuse-existing') {
      reuseExisting = false;
      continue;
    }
    if (arg === '--reuse-wait-seconds') {
      const next = args[index + 1];
      if (!next) {
        throw new Error('Missing value for --reuse-wait-seconds');
      }
      reuseWaitSeconds = parsePositiveNumber(next, '--reuse-wait-seconds');
      index += 1;
      continue;
    }
    if (arg.startsWith('--reuse-wait-seconds=')) {
      reuseWaitSeconds = parsePositiveNumber(arg.slice('--reuse-wait-seconds='.length), '--reuse-wait-seconds');
      continue;
    }
    passthrough.push(arg);
  }

  return { workflow, ref, watch, reuseExisting, reuseWaitSeconds, passthrough };
}

function ghEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  return env;
}

function runGh(args: string[], inherit = false): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('gh', args, {
    cwd: process.cwd(),
    env: ghEnv(),
    encoding: 'utf-8',
    shell: false,
    stdio: inherit ? 'inherit' : 'pipe',
  });

  return {
    stdout: inherit ? '' : result.stdout ?? '',
    stderr: inherit ? '' : result.stderr ?? '',
    status: result.status ?? 1,
  };
}

function runGit(args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
    shell: false,
    stdio: 'pipe',
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

function extractRunId(output: string): string | null {
  return /\/actions\/runs\/(\d+)/.exec(output)?.[1] ?? null;
}

function parsePositiveNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number`);
  }
  return parsed;
}

function resolveRefHeadSha(ref: string): string | null {
  const result = runGit(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    return null;
  }
  return result.stdout.trim() || null;
}

function parseWorkflowRuns(rawOutput: string): WorkflowRunSummary[] {
  const parsed: unknown = JSON.parse(rawOutput);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as Record<string, unknown>;
    if (
      typeof record.databaseId !== 'number' ||
      typeof record.status !== 'string' ||
      typeof record.headSha !== 'string' ||
      typeof record.event !== 'string' ||
      typeof record.createdAt !== 'string' ||
      typeof record.url !== 'string'
    ) {
      return [];
    }

    return [
      {
        databaseId: record.databaseId,
        status: record.status,
        conclusion: typeof record.conclusion === 'string' ? record.conclusion : null,
        headSha: record.headSha,
        event: record.event,
        createdAt: record.createdAt,
        url: record.url,
      },
    ];
  });
}

function listWorkflowRuns(workflow: string, branch: string): WorkflowRunSummary[] | null {
  const result = runGh([
    'run',
    'list',
    '--workflow',
    workflow,
    '--branch',
    branch,
    '--limit',
    '20',
    '--json',
    'databaseId,status,conclusion,headSha,event,createdAt,url',
  ]);

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    return null;
  }

  try {
    return parseWorkflowRuns(result.stdout);
  } catch (error) {
    console.error(`Unable to parse gh run list output: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findExistingWorkflowRun(options: Options): Promise<ExistingWorkflowRunDecision | null> {
  if (!options.reuseExisting || !workflowMayReuseExistingRun(options.workflow, options.watch)) {
    return null;
  }

  const branch = branchNameFromRef(options.ref);
  if (!branch) {
    console.log(`Skipping same-head CI reuse because ${options.ref} is not a branch ref.`);
    return null;
  }

  const headSha = resolveRefHeadSha(options.ref);
  if (!headSha) {
    console.log(`Skipping same-head CI reuse because ${options.ref} could not be resolved locally.`);
    return null;
  }

  const deadline = Date.now() + options.reuseWaitSeconds * 1000;
  console.log(`Checking for existing ${options.workflow} runs on ${branch} at ${headSha}.`);

  do {
    const runs = listWorkflowRuns(options.workflow, branch);
    if (runs) {
      const decision = selectExistingWorkflowRun(runs, headSha);
      if (decision) {
        return decision;
      }
    }

    if (Date.now() >= deadline) {
      break;
    }
    await delay(3000);
  } while (true);

  console.log(`No existing exact-head ${options.workflow} run found after ${options.reuseWaitSeconds}s.`);
  return null;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const existingRun = await findExistingWorkflowRun(options);
  if (existingRun) {
    console.log(
      `Found existing exact-head ${options.workflow} run ${existingRun.run.databaseId}: ${existingRun.reason}.`,
    );
    console.log(existingRun.run.url);

    if (existingRun.action === 'succeed') {
      return;
    }

    if (existingRun.action === 'fail') {
      process.exit(1);
    }

    const watch = runGh(['run', 'watch', String(existingRun.run.databaseId), '--exit-status'], true);
    process.exit(watch.status);
  }

  const args = ['workflow', 'run', options.workflow, '--ref', options.ref, ...options.passthrough];
  console.log(`Dispatching ${options.workflow} on ${options.ref} with GH token env cleared.`);
  const dispatch = runGh(args);
  process.stdout.write(dispatch.stdout);
  process.stderr.write(dispatch.stderr);

  if (dispatch.status !== 0) {
    process.exit(dispatch.status);
  }

  if (!options.watch) {
    return;
  }

  const runId = extractRunId(`${dispatch.stdout}\n${dispatch.stderr}`);
  if (!runId) {
    throw new Error('Workflow dispatched, but gh did not return an Actions run URL to watch.');
  }

  const watch = runGh(['run', 'watch', runId, '--exit-status'], true);
  process.exit(watch.status);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
