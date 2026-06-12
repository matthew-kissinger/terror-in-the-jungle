#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


/**
 * Doc-drift gate (catalog #11 — Phase 0 capstone).
 *
 * Live gate (NOT a retired audit) that walks the full `docs/**` tree and
 * fails CI / `validate:fast` when documentation references drift away from
 * what is actually on disk or in `package.json`. Three reference kinds are
 * checked per doc:
 *
 *   1. Relative markdown links — `](target.md)` (with optional `#fragment`)
 *      where the target is a repo-relative path. The link must resolve to an
 *      existing `.md` file (or directory) on disk, relative to the linking
 *      doc's directory.
 *   2. Backtick code paths under `src/` or `scripts/` — `` `src/foo/Bar.ts` ``.
 *      The path (after stripping an optional `:line[:col]` suffix and a
 *      trailing slash) must exist on disk.
 *   3. `npm run <script>` tokens — the named script must exist in
 *      `package.json#scripts`.
 *
 * Severity model (mirrors scripts/lint-docs.ts SKIP_PREFIXES):
 *   - Docs under `docs/archive/**`, `docs/cycles/**`, `docs/tasks/archive/**`
 *     are LOW severity: their findings are reported as warnings and never
 *     fail the gate. They are historical and intentionally frozen.
 *   - All other ("live") docs are HIGH severity: a finding fails the gate
 *     unless it is grandfathered.
 *
 * Grandfather model:
 *   Phase 0 fixed the live-doc links. A handful of pre-existing broken
 *   references remain (mostly in the archive, plus any live references that
 *   predate this gate). Those are recorded in GRANDFATHER below so the gate is
 *   GREEN on the current master tree; it then fails only on NEW drift. Re-run
 *   with `--print-grandfather` to regenerate the list after an intentional
 *   doc change, and paste the emitted block back into this file.
 *
 * The `--as-of` / `--doc` / `--out-dir` flags and the JSON+MD artifact output
 * are carried over from the original Projekt-143 checker so existing evidence
 * chains keep working.
 *
 * ADVISORY FULL-TREE MODE (`--full`, npm script `check:doc-drift:full`):
 *   The default gate is GREEN by design — it suppresses pre-existing drift via
 *   the GRANDFATHER set (live docs) and the low-severity prefix list (archive /
 *   cycles / tasks-archive). That suppression hides the repo's pre-existing
 *   broken-reference backlog. `--full` re-runs the SAME scan over the whole
 *   `docs/**` tree but counts EVERY broken reference — grandfathered and
 *   low-severity included — and prints a repo-wide summary. It is advisory: it
 *   ALWAYS exits 0 and is intentionally NOT wired into the CI gate. Use it to
 *   measure (not gate) the backlog; full-tree gating is a deliberate follow-up.
 *
 * Usage:
 *   npx tsx scripts/doc-drift.ts                 # full tree, exit 1 on new drift (GATE)
 *   npx tsx scripts/doc-drift.ts --full          # advisory: count ALL broken refs, exit 0
 *   npx tsx scripts/doc-drift.ts --print-grandfather   # emit current failures as a grandfather block
 *   npx tsx scripts/doc-drift.ts --doc docs/DIRECTIVES.md  # scan an explicit subset
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';
type Severity = 'warning' | 'error';
type Kind = 'missing_markdown_link' | 'missing_code_path' | 'missing_package_script';

export interface Finding {
  id: string;
  severity: Severity;
  grandfathered: boolean;
  file: string;
  line: number;
  kind: Kind;
  target: string;
  message: string;
  evidence: string;
}

interface DocDriftReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'doc-drift-gate';
  status: Status;
  asOfDate: string;
  inputs: {
    docsRoot: string;
    packageJson: string;
    skipPrefixes: string[];
  };
  summary: {
    docsScanned: number;
    liveDocsScanned: number;
    lowSeverityDocsScanned: number;
    markdownLinksChecked: number;
    codePathsChecked: number;
    packageScriptRefsChecked: number;
    failingFindings: number;
    grandfatheredFindings: number;
    lowSeverityFindings: number;
  };
  findings: Finding[];
  nextActions: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'doc-drift-gate';

// Mirror scripts/lint-docs.ts. Docs under these prefixes are historical /
// frozen: scanned, but findings are low-severity (never fail the gate).
const SKIP_PREFIXES = ['archive', 'cycles', 'tasks/archive', 'tasks\\archive'];

// ---------------------------------------------------------------------------
// GRANDFATHER — pre-existing broken references allowed on the current tree.
// Keys are `${relPosixDoc}::${kind}::${target}` (see findingKey). Regenerate
// with `npx tsx scripts/doc-drift.ts --print-grandfather`.
// >>> GRANDFATHER-START <<<
const GRANDFATHER: ReadonlySet<string> = new Set<string>([
  "docs/COMBAT.md::missing_code_path::src/systems/strategy/AbstractCombatResolver",
  "docs/REARCHITECTURE.md::missing_code_path::scripts/perf-active-driver.js",
  "docs/directives/webgpu-migration-10.md::missing_package_script::check:hydrology-bakes",
  "docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md::missing_code_path::src/engine/determinism",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md::missing_markdown_link::../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md::missing_markdown_link::../../tasks/cycle-mobile-webgl2-fallback-fix.md",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-renderer-mode-truth.md::missing_markdown_link::../../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md::missing_code_path::src/systems/environment/atmosphere/CloudLayer.ts",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md::missing_code_path::src/systems/environment/WaterSystem.ts",
  "docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md::missing_markdown_link::../../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md",
  "docs/rearch/TANK_SYSTEMS_2026-05-13.md::missing_code_path::src/systems/vehicle/TankCannonProjectile.ts",
  "docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md::missing_code_path::scripts/capture-of-water-airfield-shots.ts",
  "docs/rearch/WEBGPU_MIGRATION_REVIEW_PACKET_2026-05-12.md::missing_package_script::check:hydrology-bakes",
  "docs/rearch/WEBGPU_MIGRATION_STACK_RESEARCH_SPIKES_2026-05-11.md::missing_package_script::check:hydrology-bakes",
  "docs/rearch/WEBGPU_MIGRATION_STACK_RESEARCH_SPIKES_2026-05-11.md::missing_package_script::check:water-runtime",
  "docs/rearch/zone-manager-decoupling.md::missing_code_path::src/integration/scenarios/zone-query-parity.test.ts",
  "docs/tasks/_TEMPLATE.md::missing_code_path::src/path/to/file.ts",
  "docs/tasks/_TEMPLATE.md::missing_code_path::src/path/to/other.ts",
  "docs/tasks/_TEMPLATE.md::missing_code_path::src/path/to/test.test.ts",
  "docs/tasks/ambient-wildlife-mvp.md::missing_code_path::src/config/WildlifeConfig.ts",
  "docs/tasks/ambient-wildlife-mvp.md::missing_code_path::src/systems/wildlife/WildlifeSystem.ts",
  "docs/tasks/asset-gallery-route.md::missing_code_path::scripts/check-asset-gallery.ts",
  "docs/tasks/asset-gallery-route.md::missing_code_path::src/dev/assetGallery/AssetGalleryApp.ts",
  "docs/tasks/asset-gallery-route.md::missing_package_script::check:asset-gallery",
]);
// >>> GRANDFATHER-END <<<
// ---------------------------------------------------------------------------

// Markdown inline links: `](target)` and `]: target` reference-style.
const MD_LINK_PATTERN = /\]\(([^)]+)\)|^\s*\[[^\]]+\]:\s+(\S+)/g;
// Backtick-fenced code paths beginning with src/ or scripts/.
const CODE_PATH_PATTERN = /`((?:src|scripts)\/[^`\s]+)`/g;
// `npm run <script>` where <script> is one or more colon-separated segments,
// never ending in a bare colon. A trailing `:` (then a space, `*`, `<`, …)
// signals a glob/placeholder/checklist separator (`npm run perf:*`,
// `npm run perf:capture:<scenario>`, `npm run lint: <pass/fail>`), not a real
// script name — those are deliberately not matched.
const NPM_RUN_PATTERN = /npm run ([a-z0-9_-]+(?::[a-z0-9_-]+)*)(?![:a-z0-9_*<-])/g;

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function relPosix(absOrRel: string): string {
  return relative(process.cwd(), resolve(absOrRel)).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function argValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg?.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else if (arg === name && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1] ?? '');
      i += 1;
    }
  }
  return values.filter(Boolean);
}

function defaultTimestamp(): string {
  return new Date().toISOString().replaceAll(':', '-');
}

function asOfDate(): string {
  return argValue('--as-of') ?? new Date().toISOString().slice(0, 10);
}

function outputDir(): string {
  const explicit = argValue('--out-dir');
  if (explicit) return resolve(explicit);
  return join(process.cwd(), 'artifacts', 'perf', defaultTimestamp(), OUTPUT_NAME);
}

function isLowSeverityDoc(relDocPosix: string): boolean {
  const sub = relDocPosix.startsWith('docs/') ? relDocPosix.slice('docs/'.length) : relDocPosix;
  const normalized = sub.replace(/\\/g, '/');
  return SKIP_PREFIXES.some((p) => normalized.startsWith(`${p}/`) || normalized === p);
}

function walkDocs(docsRoot: string): string[] {
  const out: string[] = [];
  const stack: string[] = [docsRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(abs);
      } else if (entry.endsWith('.md')) {
        out.push(abs);
      }
    }
  }
  return out.sort();
}

function explicitDocs(): string[] | null {
  const docs = argValues('--doc');
  return docs.length > 0 ? docs.map((d) => resolve(d)) : null;
}

function readPackageScripts(packagePath: string): Record<string, string> {
  const parsed = JSON.parse(readFileSync(packagePath, 'utf-8')) as { scripts?: Record<string, string> };
  return parsed.scripts ?? {};
}

function findingKey(relDocPosix: string, kind: Kind, target: string): string {
  return `${relDocPosix}::${kind}::${target}`;
}

/**
 * A markdown link target is "checkable" as a repo-relative path only if it is
 * a relative path (not a URL, anchor-only, mailto, or absolute path). We only
 * assert existence for links whose path component ends in `.md` or that look
 * like a directory link (trailing slash), to keep the gate focused on doc
 * cross-references rather than every asset.
 */
function classifyMarkdownTarget(rawTarget: string): { check: boolean; pathPart: string; isDir: boolean } {
  let t = rawTarget.trim();
  // Strip surrounding angle brackets: [x](<a b.md>)
  if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1);
  // Drop an optional title: [x](path "Title")
  const spaceIdx = t.search(/\s/);
  if (spaceIdx >= 0) t = t.slice(0, spaceIdx);
  if (!t) return { check: false, pathPart: '', isDir: false };

  // Skip URLs, protocol-relative, mailto, in-page anchors, and absolute paths.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return { check: false, pathPart: '', isDir: false };
  if (t.startsWith('//')) return { check: false, pathPart: '', isDir: false };
  if (t.startsWith('#')) return { check: false, pathPart: '', isDir: false };
  if (t.startsWith('/')) return { check: false, pathPart: '', isDir: false };

  // Strip a #fragment and ?query.
  const pathPart = t.split('#')[0]!.split('?')[0]!;
  if (!pathPart) return { check: false, pathPart: '', isDir: false };

  const isDir = pathPart.endsWith('/');
  const looksMd = pathPart.toLowerCase().endsWith('.md');
  if (!looksMd && !isDir) return { check: false, pathPart: '', isDir: false };

  return { check: true, pathPart, isDir };
}

/**
 * A backtick code path is checkable only if it points at a concrete file or
 * directory. We strip a trailing `:line[:col]` suffix and a trailing slash,
 * and skip anything containing a glob, brace, or placeholder marker.
 */
function classifyCodePath(rawPath: string): { check: boolean; pathPart: string } {
  let p = rawPath.trim();
  // Strip a trailing line/column citation: `:line`, `:line:col`, `:start-end`,
  // or comma/hyphen-separated line lists like `:129,157` / `:9-13`. These are
  // citations of a real file, not a distinct path — we only assert the file
  // itself exists. A `:` followed solely by digits, commas, and hyphens.
  p = p.replace(/:[\d][\d,\-:]*$/, '');
  // Strip trailing slash for the existence check.
  const cleaned = p.replace(/\/+$/, '');
  if (!cleaned) return { check: false, pathPart: '' };
  // Skip globs / placeholders / brace-expansions / ellipses.
  if (/[*?<>{}]|\.\.\./.test(cleaned)) return { check: false, pathPart: '' };
  // Skip obvious sentence fragments (a path with a trailing comma/period the
  // backtick capture already excluded; nothing further needed here).
  return { check: true, pathPart: cleaned };
}

function scanDoc(
  absDoc: string,
  relDocPosix: string,
  lowSeverity: boolean,
  scripts: Record<string, string>,
  counters: { md: number; code: number; npm: number },
): Finding[] {
  const findings: Finding[] = [];
  const docDir = dirname(absDoc);
  const lines = readFileSync(absDoc, 'utf-8').split(/\r?\n/);

  const push = (kind: Kind, line: number, target: string, message: string, evidence: string): void => {
    const baseSeverity: Severity = lowSeverity ? 'warning' : 'error';
    const grandfathered = !lowSeverity && GRANDFATHER.has(findingKey(relDocPosix, kind, target));
    findings.push({
      id: `${kind}:${relDocPosix}:${line}:${target}`,
      severity: grandfathered ? 'warning' : baseSeverity,
      grandfathered,
      file: relDocPosix,
      line,
      kind,
      target,
      message,
      evidence: evidence.trim().slice(0, 200),
    });
  };

  let inFence = false;
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    // Track fenced code blocks; do not treat link/path syntax inside ``` blocks
    // as markdown links (but DO still check backtick inline paths — those use
    // single backticks and are handled per-line regardless).
    if (/^\s*```/.test(rawLine)) {
      inFence = !inFence;
    }

    // (1) Relative markdown links. Strip inline code spans first so that
    // links quoted as example prose (`See [x](y).`) are not treated as live
    // links. Backtick code-path checking below still runs on the raw line.
    if (!inFence) {
      const lineNoCode = rawLine.replace(/`[^`]*`/g, '');
      for (const match of lineNoCode.matchAll(MD_LINK_PATTERN)) {
        const rawTarget = match[1] ?? match[2] ?? '';
        const { check, pathPart, isDir } = classifyMarkdownTarget(rawTarget);
        if (!check) continue;
        counters.md += 1;
        const abs = resolve(docDir, pathPart);
        const exists = existsSync(abs);
        const okType = exists && (isDir ? safeIsDir(abs) : safeIsFile(abs));
        if (!okType) {
          push(
            'missing_markdown_link',
            lineNumber,
            pathPart,
            `Relative markdown link target does not exist on disk: ${pathPart}`,
            rawLine,
          );
        }
      }
    }

    // (2) Backtick code paths under src/ or scripts/.
    for (const match of rawLine.matchAll(CODE_PATH_PATTERN)) {
      const { check, pathPart } = classifyCodePath(match[1] ?? '');
      if (!check) continue;
      counters.code += 1;
      const abs = resolve(process.cwd(), pathPart);
      if (!existsSync(abs)) {
        push(
          'missing_code_path',
          lineNumber,
          pathPart,
          `Backtick code path does not exist on disk: ${pathPart}`,
          rawLine,
        );
      }
    }

    // (3) npm run <script> tokens.
    for (const match of rawLine.matchAll(NPM_RUN_PATTERN)) {
      const command = match[1] ?? '';
      counters.npm += 1;
      if (!scripts[command]) {
        push(
          'missing_package_script',
          lineNumber,
          command,
          `Document references npm script "${command}", but package.json does not define it.`,
          rawLine,
        );
      }
    }
  });

  return findings;
}

function safeIsDir(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function safeIsFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function statusFromFindings(findings: Finding[]): Status {
  if (findings.some((f) => f.severity === 'error')) return 'fail';
  if (findings.length > 0) return 'warn';
  return 'pass';
}

export interface FullTreeDriftSummary {
  /** Distinct docs that produced at least one broken-reference finding. */
  docsWithDrift: number;
  /** Total broken references across the whole tree (no suppression). */
  totalBrokenRefs: number;
  brokenByKind: Record<Kind, number>;
  /** Of the total, how many are hidden from the gate (grandfathered + low-severity). */
  suppressedFromGate: number;
}

/**
 * Pure roll-up of a full-tree scan for the advisory `--full` mode. Unlike the
 * gate (which only surfaces NEW, live-doc, error-severity drift), this counts
 * EVERY broken reference the scan produced — grandfathered live-doc refs and
 * low-severity archive refs included — so the repo-wide broken-reference
 * backlog is visible as a single number. It does not exit or mutate anything;
 * `--full` always exits 0.
 *
 * Every `Finding` the scanner emits represents a broken reference (the scanner
 * only pushes a finding when a target is missing on disk / in package.json), so
 * the full-tree broken-ref count is simply the finding count rolled up by kind.
 */
export function summarizeFullTreeDrift(findings: Finding[]): FullTreeDriftSummary {
  const brokenByKind: Record<Kind, number> = {
    missing_markdown_link: 0,
    missing_code_path: 0,
    missing_package_script: 0,
  };
  const docsWithDrift = new Set<string>();
  let suppressedFromGate = 0;

  for (const f of findings) {
    brokenByKind[f.kind] += 1;
    docsWithDrift.add(f.file);
    // A finding is invisible to the gate when it is not an error: either it was
    // grandfathered (downgraded to 'warning') or it lives under a low-severity
    // (archive/cycles/tasks-archive) prefix.
    if (f.severity !== 'error') suppressedFromGate += 1;
  }

  return {
    docsWithDrift: docsWithDrift.size,
    totalBrokenRefs: findings.length,
    brokenByKind,
    suppressedFromGate,
  };
}

function buildReport(outDir: string): { report: DocDriftReport; findings: Finding[] } {
  const docsRoot = resolve('docs');
  const explicit = explicitDocs();
  const docs = explicit ?? walkDocs(docsRoot);
  const packageJsonPath = resolve('package.json');
  const scripts = readPackageScripts(packageJsonPath);

  const counters = { md: 0, code: 0, npm: 0 };
  const allFindings: Finding[] = [];
  let liveCount = 0;
  let lowCount = 0;

  for (const absDoc of docs) {
    const relDocPosix = relPosix(absDoc);
    const lowSeverity = isLowSeverityDoc(relDocPosix);
    if (lowSeverity) lowCount += 1;
    else liveCount += 1;
    allFindings.push(...scanDoc(absDoc, relDocPosix, lowSeverity, scripts, counters));
  }

  const failing = allFindings.filter((f) => f.severity === 'error');
  const grandfathered = allFindings.filter((f) => f.grandfathered);
  const lowSeverityFindings = allFindings.filter((f) => f.severity === 'warning' && !f.grandfathered);

  const outputJson = join(outDir, 'doc-drift.json');
  const outputMd = join(outDir, 'doc-drift.md');

  const report: DocDriftReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'doc-drift-gate',
    status: statusFromFindings(allFindings),
    asOfDate: asOfDate(),
    inputs: {
      docsRoot: 'docs',
      packageJson: 'package.json',
      skipPrefixes: SKIP_PREFIXES,
    },
    summary: {
      docsScanned: docs.length,
      liveDocsScanned: liveCount,
      lowSeverityDocsScanned: lowCount,
      markdownLinksChecked: counters.md,
      codePathsChecked: counters.code,
      packageScriptRefsChecked: counters.npm,
      failingFindings: failing.length,
      grandfatheredFindings: grandfathered.length,
      lowSeverityFindings: lowSeverityFindings.length,
    },
    findings: allFindings,
    nextActions: failing.length === 0
      ? ['Keep check:doc-drift in validate:fast and CI; it fails only on NEW live-doc drift.']
      : [
          'Fix the broken references above, or (if intentional) regenerate the grandfather block via --print-grandfather.',
          'Live-doc references must resolve to real files/dirs/scripts on disk.',
        ],
    files: {
      summary: relPosix(outputJson),
      markdown: relPosix(outputMd),
    },
  };

  return { report, findings: allFindings };
}

function makeMarkdown(report: DocDriftReport): string {
  const failing = report.findings.filter((f) => f.severity === 'error');
  return [
    '# Doc Drift Gate',
    '',
    `Status: ${report.status.toUpperCase()}`,
    `As of: ${report.asOfDate}`,
    `Docs scanned: ${report.summary.docsScanned} (live ${report.summary.liveDocsScanned}, low-severity ${report.summary.lowSeverityDocsScanned})`,
    `Markdown links checked: ${report.summary.markdownLinksChecked}`,
    `Code paths checked: ${report.summary.codePathsChecked}`,
    `npm script refs checked: ${report.summary.packageScriptRefsChecked}`,
    `Failing findings: ${report.summary.failingFindings}`,
    `Grandfathered: ${report.summary.grandfatheredFindings}`,
    `Low-severity findings: ${report.summary.lowSeverityFindings}`,
    '',
    '## Failing findings',
    ...(failing.length > 0
      ? failing.map((f) => `- ${f.kind} ${f.file}:${f.line} ${f.message}`)
      : ['- None.']),
    '',
    '## Next Actions',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
  ].join('\n');
}

function printGrandfatherBlock(findings: Finding[]): void {
  // Only live-doc (error-severity, pre-grandfather) findings are eligible.
  const eligible = findings
    .filter((f) => !f.grandfathered && f.severity === 'error')
    .map((f) => findingKey(f.file, f.kind, f.target))
    .concat(findings.filter((f) => f.grandfathered).map((f) => findingKey(f.file, f.kind, f.target)));
  const unique = [...new Set(eligible)].sort();
  console.log('// >>> GRANDFATHER-START <<<');
  console.log('const GRANDFATHER: ReadonlySet<string> = new Set<string>([');
  for (const key of unique) {
    console.log(`  ${JSON.stringify(key)},`);
  }
  console.log(']);');
  console.log('// >>> GRANDFATHER-END <<<');
  console.log(`\n// ${unique.length} grandfathered entr${unique.length === 1 ? 'y' : 'ies'}.`);
}

function main(): void {
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const { report, findings } = buildReport(outDir);
  writeFileSync(join(outDir, 'doc-drift.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(join(outDir, 'doc-drift.md'), makeMarkdown(report), 'utf-8');

  if (process.argv.includes('--print-grandfather')) {
    printGrandfatherBlock(findings);
    return;
  }

  // Advisory full-tree mode: report the repo-wide broken-reference backlog and
  // ALWAYS exit 0. This never touches the gate's pass/fail logic below.
  if (process.argv.includes('--full')) {
    const full = summarizeFullTreeDrift(findings);
    console.log(`doc-drift FULL (advisory): ${report.files.summary}`);
    console.log(
      `docs=${report.summary.docsScanned} (live=${report.summary.liveDocsScanned}) ` +
      `mdLinks=${report.summary.markdownLinksChecked} codePaths=${report.summary.codePathsChecked} ` +
      `npmRefs=${report.summary.packageScriptRefsChecked}`,
    );
    console.log(
      `brokenRefs=${full.totalBrokenRefs} across ${full.docsWithDrift} docs ` +
      `(missing_markdown_link=${full.brokenByKind.missing_markdown_link} ` +
      `missing_code_path=${full.brokenByKind.missing_code_path} ` +
      `missing_package_script=${full.brokenByKind.missing_package_script})`,
    );
    console.log(
      `suppressedFromGate=${full.suppressedFromGate} ` +
      `(grandfathered + low-severity archive/cycles/tasks-archive) — advisory, gate unaffected`,
    );
    return;
  }

  console.log(`doc-drift ${report.status.toUpperCase()}: ${report.files.summary}`);
  console.log(
    `docs=${report.summary.docsScanned} (live=${report.summary.liveDocsScanned}) ` +
    `mdLinks=${report.summary.markdownLinksChecked} codePaths=${report.summary.codePathsChecked} ` +
    `npmRefs=${report.summary.packageScriptRefsChecked}`,
  );
  console.log(
    `failing=${report.summary.failingFindings} grandfathered=${report.summary.grandfatheredFindings} ` +
    `lowSeverity=${report.summary.lowSeverityFindings}`,
  );
  if (report.summary.failingFindings > 0) {
    const failing = findings.filter((f) => f.severity === 'error');
    for (const f of failing.slice(0, 50)) {
      console.log(`  [FAIL] ${f.file}:${f.line} (${f.kind}) ${f.target}`);
    }
    if (failing.length > 50) console.log(`  ... and ${failing.length - 50} more`);
    process.exit(1);
  }
}

// Run CLI behavior only when invoked directly, not when imported by tests.
// `process.argv[1]` is the script path under tsx; compare normalized paths.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /doc-drift\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error('doc-drift-gate failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
