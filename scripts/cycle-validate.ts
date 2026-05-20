/**
 * Cycle slug validator and carry-over registry helper.
 *
 * Two responsibilities (Phase 0, 2026-05-09 realignment):
 *
 *   A. Validate that a proposed cycle slug does NOT contain a banned keyword.
 *      Banned: polish, cleanup, drift-correction, stabilization-reset,
 *      debug-cleanup, housekeeping, tidy, chore-only.
 *      Each cycle must close one user-observable gap; doctor-doc work
 *      happens inside a feature cycle, not as its own.
 *
 *   B. Increment the `Cycles open` counter for every active row in
 *      `docs/CARRY_OVERS.md`, refresh `Last verified`, and report the active
 *      count delta vs. cycle-start.
 *
 * Usage:
 *   npx tsx scripts/cycle-validate.ts <slug>
 *       Validate slug only (no carry-over mutation).
 *
 *   npx tsx scripts/cycle-validate.ts <slug> --close
 *       Validate slug + run end-of-cycle bookkeeping (increment counters).
 *
 *   npx tsx scripts/cycle-validate.ts --increment-carryovers
 *       Increment counters only (e.g. nightly).
 *
 * Exit codes:
 *   0  OK
 *   1  validation failure (banned keyword, etc.)
 *   2  invocation error
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARRY_PATH = join(process.cwd(), 'docs', 'CARRY_OVERS.md');

// Brief LOC thresholds (framework recovery Pass 2 R1.2). The template caps at
// 80 lines; warn at 100; recommend a split at 150. WARN, never FAIL — owners
// can knowingly ship a longer brief, but executor token-budget deaths in the
// 2026-05-20 vehicle-boarding cycle (350-510 LOC briefs) are the reason this
// gate exists.
const BRIEF_WARN_LOC = 100;
const BRIEF_SPLIT_LOC = 150;
const TASKS_DIR = join(process.cwd(), 'docs', 'tasks');

const BANNED_KEYWORDS = [
  'polish',
  'cleanup',
  'drift-correction',
  'stabilization-reset',
  'debug-cleanup',
  'housekeeping',
  'tidy',
  'chore-only',
];

// Two accepted shapes:
//   1. dated:  cycle-YYYY-MM-DD-<descriptive-slug>  (original convention, e.g. cycle-2026-05-16-mobile-webgpu-and-sky-recovery)
//   2. bare:   cycle-<descriptive-slug>             (campaign-queue convention introduced 2026-05-13 for CAMPAIGN_2026-05-13-POST-WEBGPU.md, e.g. cycle-sky-visual-restore)
// The bare shape was introduced when the post-WebGPU campaign manifest pre-authored a 12-cycle queue: dating the slugs locks dispatch order to a calendar that doesn't match reality if a cycle stretches or skips. Both shapes still carry the same banned-keyword discipline below.
const SLUG_RE = /^cycle-(?:\d{4}-\d{2}-\d{2}-)?[a-z0-9-]+$/;

function todayISO(): string {
  const d = new Date();
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export interface BriefLocCheck {
  path: string;
  lineCount: number;
  level: 'ok' | 'warn' | 'split';
  message: string;
}

/**
 * Count meaningful lines in a brief and classify against the LOC thresholds.
 * Pure: no I/O. Caller supplies the file body (so tests can synthesize one
 * without touching the filesystem).
 */
export function classifyBriefLoc(path: string, body: string): BriefLocCheck {
  // Split on either CRLF or LF. A trailing newline produces one empty cell;
  // drop it so a 100-line file with a trailing newline counts as 100, not 101.
  const parts = body.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const lineCount = parts.length;

  if (lineCount > BRIEF_SPLIT_LOC) {
    return {
      path,
      lineCount,
      level: 'split',
      message:
        `Brief "${path}" is ${lineCount} LOC (>${BRIEF_SPLIT_LOC}). ` +
        `Strongly consider splitting into Round 1 + Round 2 task files. ` +
        `Long briefs starve executor token budgets — see ` +
        `docs/tasks/_TEMPLATE.md (80 LOC cap).`,
    };
  }
  if (lineCount > BRIEF_WARN_LOC) {
    return {
      path,
      lineCount,
      level: 'warn',
      message:
        `Brief "${path}" is ${lineCount} LOC (>${BRIEF_WARN_LOC}). ` +
        `Target is ≤80 LOC per docs/tasks/_TEMPLATE.md. Trim Non-goals / ` +
        `Acceptance prose or split into Round 2.`,
    };
  }
  return {
    path,
    lineCount,
    level: 'ok',
    message: `Brief "${path}" is ${lineCount} LOC (within target).`,
  };
}

/**
 * Resolve a slug to its brief path and run the LOC check. Returns null when
 * no brief file is found — the slug-name discipline gate is separate, so a
 * missing brief is not a validator failure here.
 */
function checkBriefLocForSlug(slug: string): BriefLocCheck | null {
  const cleanSlug = slug.startsWith('cycle-') ? slug : slug;
  const candidates = [
    join(TASKS_DIR, `${cleanSlug}.md`),
    join(TASKS_DIR, `${slug}.md`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return classifyBriefLoc(path, readFileSync(path, 'utf8'));
    }
  }
  return null;
}

function validateSlug(slug: string): { ok: boolean; reason?: string } {
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason: `Slug "${slug}" does not match cycle-<descriptive-slug> or cycle-YYYY-MM-DD-<descriptive-slug> shape.`,
    };
  }
  for (const banned of BANNED_KEYWORDS) {
    if (slug.includes(banned)) {
      return {
        ok: false,
        reason:
          `Slug "${slug}" contains banned keyword "${banned}". ` +
          `Each cycle must close one user-observable gap; doctor-doc work ` +
          `happens inside a feature cycle, not as its own.`,
      };
    }
  }
  return { ok: true };
}

interface CarryRow {
  raw: string;
  isHeader: boolean;
  isSeparator: boolean;
  cycleOpenIdx: number; // index into split cells; -1 if not a data row
}

function incrementCarryovers(): { changed: boolean; activeCount: number } {
  let content: string;
  try {
    content = readFileSync(CARRY_PATH, 'utf8');
  } catch (err) {
    console.error(`[cycle-validate] could not read ${CARRY_PATH}: ${(err as Error).message}`);
    process.exit(2);
  }

  const lines = content.split(/\r?\n/);
  let inActive = false;
  let inClosed = false;
  let headerSeen = false;
  let activeCount = 0;
  let changed = false;

  const out = lines.map((line) => {
    if (/^##\s+Active\s*$/i.test(line)) {
      inActive = true;
      inClosed = false;
      headerSeen = false;
      return line;
    }
    if (/^##\s+Closed\s*$/i.test(line)) {
      inActive = false;
      inClosed = true;
      return line;
    }
    if (/^##\s+/.test(line)) {
      inActive = false;
      inClosed = false;
      return line;
    }

    if (!inActive) return line;

    // Skip the header row, separator, and non-table rows.
    if (line.trim().startsWith('| ID ') || line.trim().startsWith('| Title ')) {
      headerSeen = true;
      return line;
    }
    if (/^\|[\s:|-]+\|$/.test(line.trim())) {
      return line;
    }
    if (!headerSeen) return line;
    if (!line.trim().startsWith('|')) return line;

    // Active data row. Cells separated by `|`. Empty edge cells from leading/trailing pipes.
    const cells = line.split('|');
    if (cells.length < 5) return line;

    // Layout: ['', ID, Title, Opened, Cycles open, Owning, Blocking?, Notes, '']
    const cyclesIdx = 4;
    const cell = cells[cyclesIdx]?.trim();
    if (!cell) return line;
    const n = Number(cell);
    if (!Number.isFinite(n)) return line;
    cells[cyclesIdx] = ` ${n + 1} `;
    activeCount += 1;
    changed = true;
    return cells.join('|');
  });

  // Refresh `Last verified:` line.
  const refreshed = out.map((line) =>
    /^Last verified:\s*\d{4}-\d{2}-\d{2}/.test(line)
      ? `Last verified: ${todayISO()}`
      : line,
  );

  if (changed) {
    writeFileSync(CARRY_PATH, refreshed.join('\n'), 'utf8');
  }

  return { changed, activeCount };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('[cycle-validate] usage: cycle-validate.ts <slug> [--close] | --increment-carryovers');
    process.exit(2);
  }

  if (argv[0] === '--increment-carryovers') {
    const { changed, activeCount } = incrementCarryovers();
    console.log(
      `[cycle-validate] carry-overs: ${activeCount} active, ${changed ? 'incremented' : 'unchanged'}.`,
    );
    return;
  }

  const slug = argv[0];
  const closeMode = argv.includes('--close');

  const v = validateSlug(slug);
  if (!v.ok) {
    console.error(`[cycle-validate] FAIL — ${v.reason}`);
    process.exit(1);
  }
  console.log(`[cycle-validate] OK — slug "${slug}" passes the cycle-name discipline gate.`);

  const briefCheck = checkBriefLocForSlug(slug);
  if (briefCheck && briefCheck.level !== 'ok') {
    console.warn(`[cycle-validate] WARN — ${briefCheck.message}`);
  } else if (briefCheck) {
    console.log(`[cycle-validate] OK — ${briefCheck.message}`);
  }

  if (closeMode) {
    const { changed, activeCount } = incrementCarryovers();
    console.log(
      `[cycle-validate] carry-overs: ${activeCount} active, ${changed ? 'incremented' : 'unchanged'}.`,
    );
  }
}

// Run CLI behavior only when invoked directly, not when imported by tests.
// `process.argv[1]` is the script path under tsx; compare normalized basenames.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /cycle-validate\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  main();
}
