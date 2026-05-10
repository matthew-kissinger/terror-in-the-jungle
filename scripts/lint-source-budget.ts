/**
 * Source-file budget linter.
 *
 * Enforces the 2026-05-09 Phase 0 realignment rules:
 *   1. Max file size: 700 LOC for non-test source under `src/`.
 *   2. Max public methods per class: 50.
 *
 * Existing god modules are explicitly grandfathered with a Phase 3 round
 * note. New files cannot be added to the grandfather list without an
 * orchestrator note in `docs/CARRY_OVERS.md`.
 *
 * Method counting is a deliberately simple regex — it's not a TS AST
 * walker. False positives are rare in this codebase (no method-shape
 * fields in interfaces / object literals get matched because we anchor
 * on `\bclass\b` first).
 *
 * Usage:
 *   npx tsx scripts/lint-source-budget.ts            # default mode (fail on hard breaches outside grandfather)
 *   npx tsx scripts/lint-source-budget.ts --strict   # fail on warns too
 *   npx tsx scripts/lint-source-budget.ts --print    # print all offenders, no exit code change
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const SRC_ROOT = join(repoRoot, 'src');

const MAX_LOC = 700;
const MAX_METHODS = 50;

// Grandfather list — current god modules. Each gets a Phase 3 round target.
// Format: posix-style relative path (forward slashes).
const GRANDFATHER: Record<string, { round: string; reason: string }> = {
  'src/systems/combat/CombatantRenderer.ts': { round: 'P3R1', reason: '1825 LOC, 219 methods → split into 5 files' },
  'src/systems/combat/CombatantMovement.ts': { round: 'P3R2', reason: '1179 LOC, 158 methods → split into 4 files' },
  'src/systems/player/PlayerController.ts': { round: 'P3R3', reason: '1014 LOC, 177 methods → split into 5 files' },
  'src/systems/debug/PerformanceTelemetry.ts': { round: 'P3R5', reason: '995 LOC → split into 4 files' },
  'src/systems/vehicle/FixedWingModel.ts': { round: 'P3R4', reason: '957 LOC → split into 4 files' },
  'src/systems/vehicle/airframe/Airframe.ts': { round: 'P3R4', reason: '948 LOC, 0 tests → add tests + slim split' },
  'src/systems/combat/CombatantLODManager.ts': { round: 'P3R1', reason: '892 LOC → split into 3 files' },
  'src/systems/world/WorldFeatureSystem.ts': { round: 'P3R4', reason: '802 LOC → split into 3 files' },
  'src/systems/navigation/NavmeshSystem.ts': { round: 'P3R5', reason: '789 LOC → split into 3 files' },
  'src/systems/strategy/WarSimulator.ts': { round: 'P3R5', reason: '788 LOC → split into 2 files' },
  'src/systems/combat/ai/AIStateEngage.ts': { round: 'P3R2', reason: '758 LOC; cover-search extraction P4F2' },
  'src/systems/combat/CombatantAI.ts': { round: 'P3R2', reason: '757 LOC → split into 3 files' },
  'src/ui/hud/HUDSystem.ts': { round: 'P3R3', reason: '740 LOC → split into 4 files' },
  'src/systems/combat/CombatantSystem.ts': { round: 'P3R2', reason: '665 LOC, 0 direct tests → split + tests' },
  // ZoneManager removed from grandfather list 2026-05-09 (Phase 2): fan-in
  // dropped from 52 → ≤20 via IZoneQuery seam (Batches A+B+C of
  // cycle-2026-05-10-zone-manager-decoupling). File is well under both LOC and
  // method limits; no further grandfathering needed.
  // Additional offenders surfaced at Phase 0 install. Not in original god-module top-15
  // but already over the new limit. Each gets a queued split target.
  'src/systems/helicopter/HelicopterModel.ts': { round: 'P3R4', reason: '704 LOC → split during AVIATSIYA-3 helicopter parity work' },
  'src/systems/player/PlayerInput.ts': { round: 'P3R3', reason: '727 LOC → split alongside PlayerController in R3' },
  'src/systems/player/PlayerRespawnManager.ts': { round: 'P3R3', reason: '53 methods → use beginRejoiningSquad helper, see docs/CARRY_OVERS.md' },
  'src/systems/terrain/TerrainFeatureCompiler.ts': { round: 'P3R5', reason: '728 LOC → split into placement / compile policy' },
  'src/systems/terrain/TerrainMaterial.ts': { round: 'P3R5', reason: '1039 LOC → split shader uniforms / atlas / impostor sampling' },
  'src/systems/terrain/TerrainSystem.ts': { round: 'P3R5', reason: '753 LOC, 60 methods → split into TerrainCore + TerrainStreamingFacade' },
  'src/ui/hud/CommandModeOverlay.ts': { round: 'P3R3', reason: '823 LOC → split alongside HUDSystem in R3' },
  'src/ui/map/FullMapSystem.ts': { round: 'P3R3', reason: '742 LOC → split alongside HUDSystem in R3' },
  'src/config/AShauValleyConfig.ts': { round: 'P3R4', reason: '763 LOC, 0 tests → split into terrain config + biome config + spawn data' },
  'src/core/SystemManager.ts': { round: 'P2-P3', reason: '60 methods → decompose system wiring + lifecycle into helpers' },
};

const SKIP = (rel: string): boolean =>
  rel.endsWith('.test.ts') ||
  rel.endsWith('.spec.ts') ||
  rel.includes('/__tests__/') ||
  rel.includes('\\__tests__\\') ||
  rel.includes('/test-utils/') ||
  rel.includes('\\test-utils\\') ||
  rel.endsWith('.d.ts');

interface Finding {
  level: 'warn' | 'fail';
  rel: string;
  rule: 'loc' | 'methods';
  value: number;
  limit: number;
  grandfathered: boolean;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

function countMethodsInFirstClass(source: string): number {
  // Find first `class ... {` declaration.
  const classMatch = /\bclass\s+\w+[^{]*\{/.exec(source);
  if (!classMatch) return 0;
  const classBodyStart = classMatch.index + classMatch[0].length;

  // Walk braces to find the matching close.
  let depth = 1;
  let i = classBodyStart;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  const body = source.slice(classBodyStart, Math.max(classBodyStart, i - 1));

  // Count method-like declarations: `name(...) {` or `private/protected/public/static/async name(...) {`
  // Skip getters/setters since they're property-shaped; still count as one method.
  // This intentionally undercounts in some shapes (overloads, decorators), which is fine — we're after god-class signal, not perfect AST.
  const methodRe = /^[\s]*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|override\s+|get\s+|set\s+)*[\w$]+\s*(?:<[^>]*>)?\s*\(/gm;
  const matches = body.match(methodRe);
  if (!matches) return 0;

  // Filter out lines that are clearly not methods: `if (`, `for (`, `while (`, `return foo(`, etc.
  const reserved = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'throw',
    'new', 'await', 'typeof', 'super', 'this', 'void', 'in', 'of',
    'else', 'do', 'try', 'finally', 'function',
  ]);
  let count = 0;
  for (const m of matches) {
    const name = /^[\s]*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|override\s+|get\s+|set\s+)*([\w$]+)/.exec(m);
    if (!name) continue;
    if (reserved.has(name[1])) continue;
    if (name[1] === 'constructor') continue;
    count += 1;
  }
  return count;
}

function locOf(source: string): number {
  const lines = source.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.length;
}

function classify(rel: string, loc: number, methods: number): Finding[] {
  const findings: Finding[] = [];
  const grandfathered = Boolean(GRANDFATHER[rel.replace(/\\/g, '/')]);
  if (loc > MAX_LOC) {
    findings.push({
      level: grandfathered ? 'warn' : 'fail',
      rel,
      rule: 'loc',
      value: loc,
      limit: MAX_LOC,
      grandfathered,
    });
  }
  if (methods > MAX_METHODS) {
    findings.push({
      level: grandfathered ? 'warn' : 'fail',
      rel,
      rule: 'methods',
      value: methods,
      limit: MAX_METHODS,
      grandfathered,
    });
  }
  return findings;
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const printOnly = process.argv.includes('--print');

  const files = walk(SRC_ROOT);
  const all: Finding[] = [];
  let inspected = 0;

  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    if (SKIP(rel)) continue;
    inspected += 1;
    const source = readFileSync(abs, 'utf8');
    const loc = locOf(source);
    const methods = countMethodsInFirstClass(source);
    all.push(...classify(rel, loc, methods));
  }

  const fails = all.filter((f) => f.level === 'fail');
  const warns = all.filter((f) => f.level === 'warn');

  if (printOnly || all.length > 0) {
    for (const f of all) {
      const tag = f.level.toUpperCase();
      const gf = f.grandfathered ? ' [grandfathered]' : '';
      const ruleLabel = f.rule === 'loc' ? 'LOC' : 'methods';
      console.log(`[${tag}] ${f.rel} (${ruleLabel}): ${f.value} > ${f.limit}${gf}`);
    }
  }

  console.log(
    `\n[lint-source-budget] ${inspected} files inspected, ${warns.length} warnings, ${fails.length} failures.`,
  );
  console.log(`[lint-source-budget] grandfather list size: ${Object.keys(GRANDFATHER).length}`);

  if (printOnly) return;
  if (fails.length > 0) process.exit(1);
  if (strict && warns.length > 0) process.exit(1);
}

main();
