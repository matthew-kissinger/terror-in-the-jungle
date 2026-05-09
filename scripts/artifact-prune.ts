/**
 * Artifact retention prune.
 *
 * Retention policy (Phase 0, 2026-05-09 realignment):
 *   - Keep capture directories under `artifacts/perf/<timestamp>/` whose
 *     directory mtime is within `--days` (default 30) of now.
 *   - Keep any directory whose path is referenced by name in the current
 *     docs/&#42;&#42;/&#42;.md file set (treat citations as "load-bearing").
 *   - Keep any directory matching one of the explicit baseline pins listed
 *     in `perf-baselines.json` (if present).
 *   - Delete the rest.
 *
 * Runs in dry-run by default. Pass `--apply` to actually delete.
 *
 * Usage:
 *   npx tsx scripts/artifact-prune.ts                        # dry-run, last 30d
 *   npx tsx scripts/artifact-prune.ts --apply                # actually delete
 *   npx tsx scripts/artifact-prune.ts --days 45 --apply      # 45d retention
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const PERF_DIR = join(repoRoot, 'artifacts', 'perf');
const DOCS_DIR = join(repoRoot, 'docs');
const BASELINES_FILE = join(repoRoot, 'perf-baselines.json');

interface Args {
  days: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  let days = 30;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--days') days = Number(argv[++i]) || days;
    else if (arg === '--apply') apply = true;
  }
  return { days, apply };
}

function walkDocs(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkDocs(abs));
    else if (entry.endsWith('.md')) out.push(abs);
  }
  return out;
}

function citedDirNames(): Set<string> {
  const cited = new Set<string>();
  const re = /artifacts\/perf\/([\w\-:.]+)\b/g;
  for (const file of walkDocs(DOCS_DIR)) {
    const text = readFileSync(file, 'utf8').replace(/\\/g, '/');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      cited.add(m[1]);
    }
  }
  return cited;
}

function baselinePinnedDirs(): Set<string> {
  const pinned = new Set<string>();
  if (!existsSync(BASELINES_FILE)) return pinned;
  try {
    const raw = readFileSync(BASELINES_FILE, 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    const flatten = (obj: unknown): void => {
      if (typeof obj === 'string') {
        const m = /artifacts\/perf\/([\w\-:.]+)/.exec(obj.replace(/\\/g, '/'));
        if (m) pinned.add(m[1]);
      } else if (Array.isArray(obj)) {
        for (const v of obj) flatten(v);
      } else if (obj && typeof obj === 'object') {
        for (const v of Object.values(obj)) flatten(v);
      }
    };
    flatten(json);
  } catch {
    /* tolerate malformed baseline file */
  }
  return pinned;
}

function main(): void {
  if (!existsSync(PERF_DIR)) {
    console.log(`[artifact-prune] No artifacts/perf/ directory; nothing to do.`);
    return;
  }

  const { days, apply } = parseArgs(process.argv.slice(2));
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const cited = citedDirNames();
  const pinned = baselinePinnedDirs();

  const captures = readdirSync(PERF_DIR)
    .map((name) => ({ name, abs: join(PERF_DIR, name) }))
    .filter((e) => {
      try {
        return statSync(e.abs).isDirectory();
      } catch {
        return false;
      }
    });

  const keep: string[] = [];
  const drop: string[] = [];

  for (const { name, abs } of captures) {
    const st = statSync(abs);
    const recent = st.mtimeMs >= cutoffMs;
    const isCited = cited.has(name);
    const isPinned = pinned.has(name);
    if (recent || isCited || isPinned) {
      keep.push(name);
    } else {
      drop.push(name);
    }
  }

  const totalSize = (paths: string[]): number => {
    let sum = 0;
    const stack = paths.map((n) => join(PERF_DIR, n));
    while (stack.length > 0) {
      const cur = stack.pop()!;
      try {
        const st = statSync(cur);
        if (st.isDirectory()) {
          for (const c of readdirSync(cur)) stack.push(join(cur, c));
        } else {
          sum += st.size;
        }
      } catch {
        /* skip */
      }
    }
    return sum;
  };

  const dropBytes = totalSize(drop);
  const dropMB = (dropBytes / (1024 * 1024)).toFixed(1);

  console.log(`[artifact-prune] perf captures: ${captures.length} total`);
  console.log(`[artifact-prune] retention: ${days}d (${captures.length - drop.length} kept, ${drop.length} prunable)`);
  console.log(`[artifact-prune]   cited in docs: ${cited.size} dirs`);
  console.log(`[artifact-prune]   pinned in perf-baselines.json: ${pinned.size} dirs`);
  console.log(`[artifact-prune] prunable disk: ${dropMB} MB`);

  if (drop.length === 0) return;

  if (!apply) {
    console.log(`[artifact-prune] dry-run; pass --apply to delete.`);
    if (drop.length <= 20) {
      for (const d of drop) console.log(`  would prune: ${relative(repoRoot, join(PERF_DIR, d)).replace(/\\/g, '/')}`);
    } else {
      console.log(`  (${drop.length} dirs; first 10 shown)`);
      for (const d of drop.slice(0, 10)) console.log(`  would prune: ${relative(repoRoot, join(PERF_DIR, d)).replace(/\\/g, '/')}`);
    }
    return;
  }

  for (const d of drop) {
    const abs = join(PERF_DIR, d);
    try {
      rmSync(abs, { recursive: true, force: true });
    } catch (err) {
      console.error(`  failed to prune ${d}: ${(err as Error).message}`);
    }
  }
  console.log(`[artifact-prune] pruned ${drop.length} dirs (~${dropMB} MB).`);
}

main();
