/**
 * Fenced-interface pre-flight check.
 *
 * Enforces the rule from `docs/INTERFACE_FENCE.md` and the 2026-05-09 Phase 0
 * realignment plan: any modification to `src/types/SystemInterfaces.ts`
 * requires `[interface-change]` in:
 *   1. The PR title.
 *   2. The latest commit message subject (when running locally before push).
 *
 * Modes:
 *   --staged           Check the latest commit (HEAD) and warn if title is
 *                      missing the marker. Default mode.
 *   --pr-title <text>  Verify the marker is present in the supplied title.
 *   --base <ref>       Compare against this ref (default: origin/master).
 *
 * Exit codes:
 *   0  fence not touched, OR fence touched and marker present
 *   1  fence touched but marker missing
 *   2  invocation error
 */

import { spawnSync } from 'node:child_process';

const FENCE_PATH = 'src/types/SystemInterfaces.ts';
const MARKER = '[interface-change]';

interface Args {
  base: string;
  prTitle: string | null;
}

function parseArgs(argv: string[]): Args {
  let base = 'origin/master';
  let prTitle: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base') {
      base = argv[++i] ?? base;
    } else if (arg === '--pr-title') {
      prTitle = argv[++i] ?? null;
    }
  }
  return { base, prTitle };
}

function git(args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

function changedFiles(base: string): string[] {
  // Try base..HEAD first; fall back to HEAD~1..HEAD; fall back to staged.
  let r = git(['diff', '--name-only', `${base}..HEAD`]);
  if (!r.ok) r = git(['diff', '--name-only', 'HEAD~1..HEAD']);
  if (!r.ok) r = git(['diff', '--name-only', '--cached']);
  if (!r.ok) {
    console.error(`[check-fence] could not list changed files: ${r.stderr}`);
    process.exit(2);
  }
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function commitSubject(): string {
  const r = git(['log', '-1', '--pretty=%s']);
  if (!r.ok) return '';
  return r.stdout;
}

function main(): void {
  const { base, prTitle } = parseArgs(process.argv.slice(2));

  const changed = changedFiles(base);
  const fenceTouched = changed.includes(FENCE_PATH);

  if (!fenceTouched) {
    console.log(`[check-fence] OK — ${FENCE_PATH} not touched.`);
    return;
  }

  const commitText = commitSubject();
  const titleText = prTitle ?? '';

  const inCommit = commitText.includes(MARKER);
  const inTitle = titleText.length > 0 ? titleText.includes(MARKER) : true; // skip if title not provided

  if (inCommit && inTitle) {
    console.log(`[check-fence] OK — ${FENCE_PATH} touched and "${MARKER}" present.`);
    return;
  }

  console.error(`[check-fence] FAIL`);
  console.error(`  ${FENCE_PATH} is in the diff vs ${base}.`);
  if (!inCommit) {
    console.error(`  Last commit subject: "${commitText}"`);
    console.error(`  Missing marker: ${MARKER}`);
  }
  if (prTitle !== null && !inTitle) {
    console.error(`  PR title: "${titleText}"`);
    console.error(`  Missing marker: ${MARKER}`);
  }
  console.error(`  See docs/INTERFACE_FENCE.md and docs/AGENT_ORCHESTRATION.md.`);
  process.exit(1);
}

main();
