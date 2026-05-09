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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARRY_PATH = join(process.cwd(), 'docs', 'CARRY_OVERS.md');

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

const SLUG_RE = /^cycle-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

function todayISO(): string {
  const d = new Date();
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function validateSlug(slug: string): { ok: boolean; reason?: string } {
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason: `Slug "${slug}" does not match cycle-YYYY-MM-DD-<descriptive-slug> shape.`,
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

  if (closeMode) {
    const { changed, activeCount } = incrementCarryovers();
    console.log(
      `[cycle-validate] carry-overs: ${activeCount} active, ${changed ? 'incremented' : 'unchanged'}.`,
    );
  }
}

main();
