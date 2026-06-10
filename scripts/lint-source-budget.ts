// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Source-file budget linter.
 *
 * Enforces the 2026-05-09 Phase 0 realignment rules:
 *   1. Max file size: 700 LOC for non-test source under `src/`.
 *   2. Max public methods per class: 50.
 *
 * Existing god modules are explicitly grandfathered with a Phase 3 round
 * note AND a measured snapshot. New files cannot be added to the
 * grandfather list without an orchestrator note in `docs/CARRY_OVERS.md`.
 *
 * Ratchet rule (budget-ratchet, 2026-06-09): each grandfathered entry
 * records the LOC / method-count snapshot at the moment it was admitted to
 * the list. A grandfathered file may shrink freely, but if it grows PAST
 * its snapshot the lint FAILs — the grandfather is a one-way ratchet, not a
 * blank cheque. To lock in a shrink, re-run with `--print`, read the
 * measured values, and lower the snapshot. The base 700 LOC / 50 method
 * limits are unchanged for non-grandfathered files.
 *
 * Method counting is a deliberately simple regex — it's not a TS AST
 * walker. False positives are rare in this codebase (no method-shape
 * fields in interfaces / object literals get matched because we anchor
 * on `\bclass\b` first).
 *
 * Usage:
 *   npx tsx scripts/lint-source-budget.ts            # default mode (fail on hard breaches + ratchet regressions)
 *   npx tsx scripts/lint-source-budget.ts --strict   # fail on warns too
 *   npx tsx scripts/lint-source-budget.ts --print    # print all offenders, no exit code change
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const SRC_ROOT = join(repoRoot, 'src');

export const MAX_LOC = 700;
export const MAX_METHODS = 50;

export interface GrandfatherEntry {
  round: string;
  reason: string;
  /**
   * Measured LOC snapshot. The ratchet ceiling for this file is
   * `max(MAX_LOC, loc)`: a file already over budget may shrink below its
   * snapshot freely but may not grow above it; a file under MAX_LOC simply
   * stays bound by the normal MAX_LOC limit.
   */
  loc: number;
  /** Measured first-class public-method snapshot — same `max(MAX_METHODS, methods)` rule. */
  methods: number;
}

// Grandfather list — current god modules. Each gets a Phase 3 round target
// plus a measured snapshot the ratchet enforces. Snapshots measured against
// the current tree on 2026-06-09 (budget-ratchet): the old free-text `reason`
// carried stale counts (e.g. CombatantRenderer "219 methods" when it now has
// 78), which understated real progress and could not catch backsliding. The
// `loc` / `methods` fields are the live snapshot — a grandfathered file may
// drop below them but may not climb above them. (Values are the true measured
// counts, not rounded; dimensions already under the base limit keep the base
// limit as their effective ceiling.)
// Format: posix-style relative path (forward slashes).
const GRANDFATHER: Record<string, GrandfatherEntry> = {
  'src/systems/combat/CombatantRenderer.ts': { round: 'P3R1', reason: 'split into 5 files', loc: 2191, methods: 78 },
  'src/systems/combat/CombatantMovement.ts': { round: 'P3R2', reason: 'split into 4 files', loc: 1701, methods: 63 },
  'src/systems/player/PlayerController.ts': { round: 'P3R3', reason: 'split into 5 files', loc: 1217, methods: 111 },
  'src/systems/debug/PerformanceTelemetry.ts': { round: 'P3R5', reason: 'split into 4 files', loc: 995, methods: 41 },
  'src/systems/vehicle/FixedWingModel.ts': { round: 'P3R4', reason: 'split into 4 files', loc: 1155, methods: 48 },
  'src/systems/vehicle/airframe/Airframe.ts': { round: 'P3R4', reason: '0 tests → add tests + slim split', loc: 985, methods: 22 },
  'src/systems/combat/CombatantLODManager.ts': { round: 'P3R1', reason: 'ai-timing-gate; +5 LOC: sole body-despawn owner now reaps terminal DEAD stragglers (combat-death-body-persistence)', loc: 933, methods: 32 },
  'src/systems/world/WorldFeatureSystem.ts': { round: 'P3R4', reason: 'split into 3 files', loc: 860, methods: 34 },
  'src/systems/navigation/NavmeshSystem.ts': { round: 'P3R5', reason: 'split into 3 files; +19 LOC: worker-offload tiled generation past the anchor window (navmesh-coverage-ashau)', loc: 808, methods: 24 },
  'src/systems/strategy/WarSimulator.ts': { round: 'P3R5', reason: 'split into 2 files', loc: 788, methods: 36 },
  'src/systems/combat/ai/AIStateEngage.ts': { round: 'P3R2', reason: 'cover-search extraction P4F2', loc: 1005, methods: 30 },
  'src/systems/combat/CombatantAI.ts': { round: 'P3R2', reason: 'ai-timing-gate: hoist per-tick state callbacks + gate diagnostics off the hot path; +12 LOC: per-frame stepper hook for the shared NPC tank cannon, scaled-dt signature per combat-review (npc-tank-cannon-wiring, 2026-06-09)', loc: 1004, methods: 44 },
  // Admitted 2026-06-09 (npc-tank-cannon-wiring review fix): the prod
  // composition point absorbed seated-weapon lifecycle (tank cannon + M2HB),
  // HUD panel hosts (m2hb-gun-experience), and the NPC tank-gunner wire +
  // single-owner stepping gate in one cycle window. Orchestrator note in
  // docs/CARRY_OVERS.md (Parked). Factor into a composition split when it
  // next grows.
  'src/core/StartupPlayerRuntimeComposer.ts': { round: 'P3R5', reason: 'prod composition point for seated-weapon/NPC-gunner/HUD-host wiring; split queued when it next grows', loc: 739, methods: 50 },
  'src/ui/hud/HUDSystem.ts': { round: 'P3R3', reason: 'split into 4 files', loc: 757, methods: 83 },
  'src/systems/combat/CombatantSystem.ts': { round: 'P3R2', reason: '0 direct tests → split + tests; +10 LOC: wire rifle-death squad bookkeeping hooks (combat-death-body-persistence)', loc: 762, methods: 43 },
  // ZoneManager removed from grandfather list 2026-05-09 (Phase 2): fan-in
  // dropped from 52 → ≤20 via IZoneQuery seam (Batches A+B+C of
  // cycle-2026-05-10-zone-manager-decoupling). File is well under both LOC and
  // method limits; no further grandfathering needed.
  // Additional offenders surfaced at Phase 0 install. Not in original god-module top-15
  // but already over the new limit. Each gets a queued split target.
  'src/systems/helicopter/HelicopterModel.ts': { round: 'P3R4', reason: 'split during AVIATSIYA-3 helicopter parity work; +3 LOC for vehicle-seat-lifecycle seat-binder forward (2026-06-09)', loc: 707, methods: 47 },
  // Snapshot raised 781 → 810 (ci-gate-consolidation, 2026-06-09): the sibling
  // Phase-1 task `real-mouse-input` (040337e7) added 29 LOC of real
  // held-mouse-button state to PlayerInput AFTER the budget-ratchet snapshot
  // (#339) was measured, so the gate was red on master before it could be made
  // blocking. Growth is intentional and already merged; the file's R3 split
  // target is unchanged. Within-cycle ratchet re-base, not a new carry-over.
  'src/systems/player/PlayerInput.ts': { round: 'P3R3', reason: 'split alongside PlayerController in R3', loc: 810, methods: 44 },
  'src/systems/player/PlayerRespawnManager.ts': { round: 'P3R3', reason: 'use beginRejoiningSquad helper, see docs/CARRY_OVERS.md', loc: 752, methods: 58 },
  'src/systems/terrain/TerrainFeatureCompiler.ts': { round: 'P3R5', reason: 'split into placement / compile policy', loc: 764, methods: 0 },
  'src/systems/terrain/TerrainMaterial.ts': { round: 'P3R5', reason: 'split shader uniforms / atlas / impostor sampling', loc: 1120, methods: 0 },
  'src/systems/terrain/TerrainSystem.ts': { round: 'P3R5', reason: 'split into TerrainCore + TerrainStreamingFacade; +22 LOC cycle-2026-06-09 gameplay-heightmap-resolution (DEM-faithful CPU query grid in syncCpuHeightsToGpu + rationale)', loc: 898, methods: 69 },
  'src/ui/hud/CommandModeOverlay.ts': { round: 'P3R3', reason: 'split alongside HUDSystem in R3', loc: 861, methods: 24 },
  'src/ui/map/FullMapSystem.ts': { round: 'P3R3', reason: 'split alongside HUDSystem in R3', loc: 882, methods: 42 },
  'src/config/AShauValleyConfig.ts': { round: 'P3R4', reason: '0 tests → split into terrain config + biome config + spawn data; +5 LOC: prebaked navmesh asset wiring (navmesh-coverage-ashau)', loc: 761, methods: 0 },
  // Pre-existing budget debt surfaced by validate:fast (CI runs `lint` but not
  // `lint:budget`): grew during the 2026-06-03 deploy-loadout cycle (UX-3
  // faction-availability chips + the selectable-ammo 4th loadout slot).
  // Not relicense-related; queued for a presentation/loadout-panel split.
  'src/ui/screens/DeployScreen.ts': { round: 'P4-deploy-loadout', reason: 'split the loadout panel out of the screen facade', loc: 1038, methods: 68 },
  'src/core/SystemManager.ts': { round: 'P2-P3', reason: 'decompose system wiring + lifecycle into helpers', loc: 355, methods: 61 },
  // Added 2026-05-12 at the exp/konveyer-webgpu-migration → master merge gate.
  // HosekWilkieSkyBackend grew through the KONVEYER campaign and is tracked as
  // split-debt in docs/CARRY_OVERS.md (konveyer-large-file-splits). The
  // WaterSystem half of that carry-over closes with the VODA-1 split
  // (water-system-file-split, 2026-05-16): WaterSystem.ts is now an
  // orchestrator that delegates to water/HydrologyRiverSurface,
  // water/WaterSurfaceSampler, and water/WaterSurfaceBinding.
  'src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts': { round: 'P4-KONVEYER-followup', reason: 'split atmosphere LUT + sun model + cloud composition during the TSL fragment-shader sky port', loc: 1069, methods: 0 },
};

const SKIP = (rel: string): boolean =>
  rel.endsWith('.test.ts') ||
  rel.endsWith('.spec.ts') ||
  rel.includes('/__tests__/') ||
  rel.includes('\\__tests__\\') ||
  rel.includes('/test-utils/') ||
  rel.includes('\\test-utils\\') ||
  rel.endsWith('.d.ts');

export interface Finding {
  level: 'warn' | 'fail';
  rel: string;
  rule: 'loc' | 'methods';
  value: number;
  /**
   * The ceiling the value was compared against. For non-grandfathered files
   * this is the base limit (MAX_LOC / MAX_METHODS). For grandfathered files
   * it is the ratchet ceiling `max(base, snapshot)`.
   */
  limit: number;
  grandfathered: boolean;
  /**
   * `true` when this finding is a ratchet regression — a grandfathered file
   * grew past its recorded snapshot. These are FAILs, not WARNs.
   */
  ratchetRegression: boolean;
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
  // Exclude the leading SPDX / copyright license header (added repo-wide by the
  // AGPL-3.0 relicense) so license boilerplate is not counted against each
  // file's code budget.
  let start = 0;
  while (
    start < lines.length &&
    /^\s*\/\/\s*(SPDX-License-Identifier:|Copyright \(c\))/.test(lines[start])
  ) {
    start += 1;
  }
  if (start > 0 && start < lines.length && lines[start].trim() === '') start += 1;
  const body = lines.slice(start);
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  return body.length;
}

/**
 * Classify one measured dimension against the budget rules. Pure: takes the
 * grandfather entry (or null) directly so it can be unit-tested without any
 * filesystem access.
 *
 * Rules:
 *   - Not grandfathered: FAIL when value > baseLimit (the original hard rule).
 *   - Grandfathered, value > snapshot:     FAIL (ratchet regression — the file
 *     grew past the floor it was admitted at).
 *   - Grandfathered, baseLimit < value ≤ snapshot: WARN (known debt, no
 *     regression — shrinking is encouraged).
 *   - value ≤ baseLimit: no finding (a grandfathered file that has shrunk
 *     under the base limit is simply healthy on this dimension).
 */
export function classifyDimension(
  rel: string,
  rule: 'loc' | 'methods',
  value: number,
  baseLimit: number,
  entry: GrandfatherEntry | null,
): Finding | null {
  const grandfathered = entry !== null;
  if (value <= baseLimit) {
    // Within the base budget. No finding even if grandfathered — a grandfather
    // entry whose dimension dropped under the limit no longer needs flagging.
    return null;
  }
  if (!grandfathered) {
    return { level: 'fail', rel, rule, value, limit: baseLimit, grandfathered: false, ratchetRegression: false };
  }
  const snapshot = rule === 'loc' ? entry.loc : entry.methods;
  const ceiling = Math.max(baseLimit, snapshot);
  if (value > ceiling) {
    // Grew past the recorded snapshot — the ratchet only goes one way.
    return { level: 'fail', rel, rule, value, limit: ceiling, grandfathered: true, ratchetRegression: true };
  }
  // Over base limit but at or under snapshot: known, accepted debt.
  return { level: 'warn', rel, rule, value, limit: baseLimit, grandfathered: true, ratchetRegression: false };
}

function classify(rel: string, loc: number, methods: number): Finding[] {
  const findings: Finding[] = [];
  const entry = GRANDFATHER[rel.replace(/\\/g, '/')] ?? null;
  const locFinding = classifyDimension(rel, 'loc', loc, MAX_LOC, entry);
  if (locFinding) findings.push(locFinding);
  const methodsFinding = classifyDimension(rel, 'methods', methods, MAX_METHODS, entry);
  if (methodsFinding) findings.push(methodsFinding);
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
      const gf = f.ratchetRegression
        ? ' [grandfathered: GREW PAST SNAPSHOT]'
        : f.grandfathered
          ? ' [grandfathered]'
          : '';
      const ruleLabel = f.rule === 'loc' ? 'LOC' : 'methods';
      console.log(`[${tag}] ${f.rel} (${ruleLabel}): ${f.value} > ${f.limit}${gf}`);
    }
  }

  const ratchetRegressions = fails.filter((f) => f.ratchetRegression);
  if (ratchetRegressions.length > 0) {
    console.error(
      `\n[lint-source-budget] ${ratchetRegressions.length} grandfathered file(s) grew past their snapshot. ` +
        `Grandfather is a one-way ratchet: shrink the file, or — if the growth is intentional and approved — ` +
        `raise its snapshot in scripts/lint-source-budget.ts with an orchestrator note in docs/CARRY_OVERS.md.`,
    );
  }

  console.log(
    `\n[lint-source-budget] ${inspected} files inspected, ${warns.length} warnings, ${fails.length} failures.`,
  );
  console.log(`[lint-source-budget] grandfather list size: ${Object.keys(GRANDFATHER).length}`);

  if (printOnly) return;
  if (fails.length > 0) process.exit(1);
  if (strict && warns.length > 0) process.exit(1);
}

// Run CLI behavior only when invoked directly, not when imported by tests.
// `process.argv[1]` is the script path under tsx; compare normalized basenames.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /lint-source-budget\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  main();
}
