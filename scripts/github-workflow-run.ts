#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';

type Options = {
  workflow: string;
  ref: string;
  watch: boolean;
  passthrough: string[];
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const workflow = args.shift();
  if (!workflow) {
    throw new Error('Usage: github-workflow-run.ts <workflow.yml> [--ref <ref>] [--watch] [-- <gh args>]');
  }

  let ref = 'master';
  let watch = false;
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
    passthrough.push(arg);
  }

  return { workflow, ref, watch, passthrough };
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

function extractRunId(output: string): string | null {
  return /\/actions\/runs\/(\d+)/.exec(output)?.[1] ?? null;
}

function main(): void {
  const options = parseArgs();
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
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
