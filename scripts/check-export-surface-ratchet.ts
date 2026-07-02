// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Export-surface ratchet gate (campaign manifest F8, 2026-07-02).
 *
 * `knip` reports the repo's dead export surface: whole unused files, unused
 * exported values, and unused exported types. The full ~119-file sweep of that
 * surface was deferred (owner decision F8 in
 * `docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`), so instead of a
 * one-shot cleanup this gate freezes the surface as a ONE-WAY RATCHET, the same
 * shape as `scripts/lint-source-budget.ts`:
 *
 *   - A committed snapshot in `scripts/export-surface-ratchet.json` records the
 *     current counts (flaggedFiles / unusedFiles / unusedExports /
 *     unusedExportedTypes).
 *   - The gate FAILs (exit 1) if ANY count GROWS past its snapshot — new dead
 *     export surface may not be introduced.
 *   - If a count SHRINKS, the gate passes but prints update guidance: lower the
 *     snapshot to lock the win in (the ratchet only goes down).
 *
 * This runs `knip` with the JSON reporter (config-hints suppressed, matching
 * `knip:ci`) and derives the counts from its `issues` array — it does NOT reuse
 * `knip:ci`'s `--include` filter because that filter drops the `exports`/`types`
 * issue kinds this ratchet is meant to freeze.
 *
 * Usage:
 *   npx tsx scripts/check-export-surface-ratchet.ts          # fail on any growth
 *   npx tsx scripts/check-export-surface-ratchet.ts --print  # print measured counts, no exit-code change
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const repoRoot = process.cwd();
const SNAPSHOT_PATH = join(repoRoot, 'scripts', 'export-surface-ratchet.json');

/** The four dimensions the ratchet tracks. */
export interface ExportSurfaceCounts {
  /** Distinct files knip reported any issue for. */
  flaggedFiles: number;
  /** Whole modules knip reports as entirely unused. */
  unusedFiles: number;
  /** Unused exported values (`exports` issue kind). */
  unusedExports: number;
  /** Unused exported types (`types` issue kind). */
  unusedExportedTypes: number;
}

export type CountKey = keyof ExportSurfaceCounts;

export const COUNT_KEYS: readonly CountKey[] = [
  'flaggedFiles',
  'unusedFiles',
  'unusedExports',
  'unusedExportedTypes',
];

/** Minimal shape of one entry in knip's JSON `issues` array. */
interface KnipIssue {
  file: string;
  files?: boolean | unknown[];
  exports?: unknown[];
  types?: unknown[];
}

interface KnipJson {
  issues?: KnipIssue[];
}

/**
 * Reduce knip's JSON `issues` array to the four ratchet counts. Pure so it can
 * be unit-tested against a fixture without invoking knip.
 */
export function countExportSurface(issues: KnipIssue[]): ExportSurfaceCounts {
  const flagged = new Set<string>();
  let unusedFiles = 0;
  let unusedExports = 0;
  let unusedExportedTypes = 0;

  for (const issue of issues) {
    flagged.add(issue.file);
    // knip marks a wholly-unused file with `files: true` (some versions use a
    // non-empty array) — treat either as one unused file.
    if (issue.files === true || (Array.isArray(issue.files) && issue.files.length > 0)) {
      unusedFiles += 1;
    }
    if (Array.isArray(issue.exports)) unusedExports += issue.exports.length;
    if (Array.isArray(issue.types)) unusedExportedTypes += issue.types.length;
  }

  return {
    flaggedFiles: flagged.size,
    unusedFiles,
    unusedExports,
    unusedExportedTypes,
  };
}

export type Verdict = 'ok' | 'grew' | 'shrank';

export interface DimensionResult {
  key: CountKey;
  measured: number;
  snapshot: number;
  verdict: Verdict;
}

/**
 * Classify one dimension against its snapshot. Pure.
 *   measured > snapshot -> 'grew'   (ratchet violation, FAIL)
 *   measured < snapshot -> 'shrank' (a win — lower the snapshot to lock it in)
 *   measured === snapshot -> 'ok'
 */
export function classifyCount(key: CountKey, measured: number, snapshot: number): DimensionResult {
  let verdict: Verdict = 'ok';
  if (measured > snapshot) verdict = 'grew';
  else if (measured < snapshot) verdict = 'shrank';
  return { key, measured, snapshot, verdict };
}

/** Compare all four dimensions against the snapshot. Pure. */
export function classifyAll(
  measured: ExportSurfaceCounts,
  snapshot: ExportSurfaceCounts,
): DimensionResult[] {
  return COUNT_KEYS.map((key) => classifyCount(key, measured[key], snapshot[key]));
}

function loadSnapshot(): ExportSurfaceCounts {
  const raw = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Partial<ExportSurfaceCounts>;
  for (const key of COUNT_KEYS) {
    if (typeof raw[key] !== 'number') {
      throw new Error(`export-surface-ratchet.json is missing numeric "${key}"`);
    }
  }
  return {
    flaggedFiles: raw.flaggedFiles as number,
    unusedFiles: raw.unusedFiles as number,
    unusedExports: raw.unusedExports as number,
    unusedExportedTypes: raw.unusedExportedTypes as number,
  };
}

function resolveKnipBin(): string {
  // Resolve knip's own JS entrypoint from node_modules and run it with the
  // current `node` (process.execPath). This is portable — it sidesteps the
  // Windows `npx.cmd` shim (which spawnSync rejects with EINVAL without a shell)
  // and does not depend on a warm npx cache. knip's package.json is not
  // exposed via "exports", so derive the package root from the resolved main
  // module (`<pkgRoot>/dist/index.js`) and reach its `bin/knip.js` sibling.
  const require = createRequire(join(repoRoot, 'package.json'));
  const mainPath = require.resolve('knip'); // <pkgRoot>/dist/index.js
  const pkgRoot = dirname(dirname(mainPath));
  return join(pkgRoot, 'bin', 'knip.js');
}

function runKnip(): KnipJson {
  // Same knip invocation the whole repo uses for dead-code scans, but with the
  // JSON reporter so we can count the `exports`/`types` issue kinds. knip exits
  // non-zero whenever it finds issues, which is the normal case here — we parse
  // stdout regardless of exit status and only fail on a genuine spawn error or
  // unparseable output.
  const r = spawnSync(
    process.execPath,
    [resolveKnipBin(), '--reporter', 'json', '--no-config-hints'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.error) {
    throw new Error(`failed to run knip: ${r.error.message}`);
  }
  const stdout = (r.stdout ?? '').trim();
  if (!stdout) {
    throw new Error(
      `knip produced no JSON output (exit ${r.status ?? 'null'}). stderr:\n${(r.stderr ?? '').trim()}`,
    );
  }
  try {
    return JSON.parse(stdout) as KnipJson;
  } catch (err) {
    throw new Error(`could not parse knip JSON output: ${(err as Error).message}`);
  }
}

function main(): void {
  const printOnly = process.argv.includes('--print');

  const knip = runKnip();
  const measured = countExportSurface(knip.issues ?? []);
  const snapshot = loadSnapshot();
  const results = classifyAll(measured, snapshot);

  console.log('[check-export-surface-ratchet] measured vs snapshot:');
  for (const r of results) {
    const arrow = r.verdict === 'grew' ? '>' : r.verdict === 'shrank' ? '<' : '=';
    console.log(`  ${r.key}: ${r.measured} ${arrow} ${r.snapshot}`);
  }

  if (printOnly) return;

  const grew = results.filter((r) => r.verdict === 'grew');
  const shrank = results.filter((r) => r.verdict === 'shrank');

  if (shrank.length > 0) {
    console.log(
      '\n[check-export-surface-ratchet] dead export surface SHRANK — nice. To lock the win in ' +
        '(the ratchet only goes down), lower these in scripts/export-surface-ratchet.json:',
    );
    for (const r of shrank) {
      console.log(`  ${r.key}: ${r.snapshot} -> ${r.measured}`);
    }
  }

  if (grew.length > 0) {
    console.error(
      '\n[check-export-surface-ratchet] FAIL: dead export surface GREW past the snapshot. ' +
        'This is a one-way ratchet (manifest F8): remove the new unused export(s)/type(s)/file(s), ' +
        'or run `npm run deadcode` to find them. Do NOT raise the snapshot to hide new dead code.',
    );
    for (const r of grew) {
      console.error(`  ${r.key}: ${r.measured} > ${r.snapshot} (+${r.measured - r.snapshot})`);
    }
    process.exit(1);
  }

  console.log('\n[check-export-surface-ratchet] OK: dead export surface did not grow.');
}

// Run CLI behavior only when invoked directly, not when imported by tests.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /check-export-surface-ratchet\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  main();
}
