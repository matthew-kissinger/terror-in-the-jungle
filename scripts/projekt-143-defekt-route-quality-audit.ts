#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';

interface AnchorCheck {
  id: string;
  path: string;
  needle: string;
  line: number | null;
  text: string | null;
  status: Status;
}

interface TerrainRouteAudit {
  createdAt?: string;
  sourceGitSha?: string;
  status?: Status;
  summary?: {
    modes?: number;
    routeAwareModes?: number;
    failModes?: number;
    warnModes?: number;
    totalRouteLengthMeters?: number;
    totalRouteCapsuleStamps?: number;
  };
  modes?: Array<{
    id?: string;
    status?: Status;
    routeCount?: number;
    routeLengthMeters?: number;
    routeCapsuleStamps?: number;
    routeSurfacePatches?: number;
    flags?: string[];
  }>;
}

interface AuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-defekt-route-quality-audit';
  status: Status;
  classification: {
    owner: 'npc_route_quality_guardrails_present_runtime_acceptance_missing' | 'npc_route_quality_blocked';
    confidence: 'high' | 'medium' | 'low';
    acceptance: 'source_and_static_route_policy_only' | 'blocked';
  };
  inputs: {
    terrainRouteAudit: string | null;
    sourceFiles: string[];
  };
  checks: {
    sourceAnchors: AnchorCheck[];
    terrainRouteAudit: {
      status: Status;
      path: string | null;
      routeAwareModes: number | null;
      totalRouteLengthMeters: number | null;
      totalRouteCapsuleStamps: number | null;
      failModes: number | null;
      warnModes: number | null;
    };
    runtimeAcceptance: {
      status: 'missing';
      requiredPacket: string;
      requiredSignals: string[];
    };
  };
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-defekt-route-quality-audit';
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

const SOURCE_ANCHORS: Array<{ id: string; path: string; needle: string }> = [
  { id: 'combatant_navmesh_waypoint_resolution', path: 'src/systems/combat/CombatantMovement.ts', needle: 'private resolveNavmeshWaypoint' },
  { id: 'combatant_navmesh_query_cache', path: 'src/systems/combat/CombatantMovement.ts', needle: 'private getOrQueryPath' },
  { id: 'combatant_stuck_backtrack_activation', path: 'src/systems/combat/CombatantMovement.ts', needle: 'private activateBacktrack' },
  { id: 'combatant_navmesh_backtrack_snap', path: 'src/systems/combat/CombatantMovement.ts', needle: 'private trySetNavmeshBacktrackPoint' },
  { id: 'combatant_stuck_warning_rate_limit', path: 'src/systems/combat/CombatantMovement.ts', needle: 'private warnStuckRecovery' },
  { id: 'stuck_detector_check_recover', path: 'src/systems/combat/StuckDetector.ts', needle: 'checkAndRecover' },
  { id: 'stuck_detector_backtrack_cap', path: 'src/systems/combat/StuckDetector.ts', needle: 'MAX_CONSECUTIVE_BACKTRACKS' },
  { id: 'stuck_detector_hold_cooldown', path: 'src/systems/combat/StuckDetector.ts', needle: 'HOLD_COOLDOWN_MS' },
  { id: 'stuck_detector_goal_progress_reset', path: 'src/systems/combat/StuckDetector.ts', needle: 'GOAL_PROGRESS_RESET_METERS' },
  { id: 'test_long_range_navmesh_waypoint', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'steers long-range movement toward the current navmesh waypoint' },
  { id: 'test_blocked_waypoint_skip', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'skips a terrain-blocked navmesh waypoint' },
  { id: 'test_backtrack_override_guard', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'does not let navmesh steering override an active backtrack recovery point' },
  { id: 'test_last_good_navmesh_recovery', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'backs up toward last-good navmesh progress' },
  { id: 'test_navmesh_recovery_noop_fallback', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'falls back to a scored recovery point when navmesh snapping would no-op' },
  { id: 'test_terrain_stall_warning_rate_limit', path: 'src/systems/combat/CombatantMovement.test.ts', needle: 'rate-limits terrain-stall recovery warnings' },
  { id: 'test_stuck_hold_across_goal_flips', path: 'src/systems/combat/StuckDetector.test.ts', needle: 'escalates to hold across repeated backtrack<->goal flips on an unreachable goal' },
  { id: 'active_driver_waypoint_advance', path: 'scripts/perf-active-driver.cjs', needle: 'function shouldAdvanceWaypoint' },
  { id: 'active_driver_pit_trap_detection', path: 'scripts/perf-active-driver.cjs', needle: 'function detectPitTrap' },
  { id: 'active_driver_route_overlay_recovery', path: 'scripts/perf-active-driver.cjs', needle: 'function applyRouteOverlayRecovery' },
  { id: 'active_driver_stuck_waypoint_skip', path: 'scripts/perf-active-driver.cjs', needle: 'function shouldSkipStuckWaypoint' },
  { id: 'active_driver_no_progress_reset', path: 'scripts/perf-active-driver.cjs', needle: 'function shouldResetRouteForNoProgress' },
  { id: 'active_driver_route_telemetry_export', path: 'scripts/perf-active-driver.cjs', needle: 'routeNoProgressResets: state.routeNoProgressResets' },
  { id: 'perf_capture_stuck_gate', path: 'scripts/perf-capture.ts', needle: "id: 'harness_max_stuck_seconds'" },
  { id: 'perf_capture_route_telemetry', path: 'scripts/perf-capture.ts', needle: 'routeNoProgressResets: Number(result.routeNoProgressResets ?? 0)' },
  { id: 'active_driver_diagnostic_stuck_finding', path: 'scripts/projekt-143-active-driver-diagnostic.ts', needle: 'Harness stuck time reached' },
  { id: 'active_driver_diagnostic_route_reset_finding', path: 'scripts/projekt-143-active-driver-diagnostic.ts', needle: 'Route objective-progress recovery reset the path' },
];

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function outputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return resolve(raw);
  return join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
}

function findLine(path: string, needle: string): Pick<AnchorCheck, 'line' | 'text' | 'status'> {
  const abs = join(process.cwd(), path);
  if (!existsSync(abs)) return { line: null, text: null, status: 'fail' };
  const lines = readFileSync(abs, 'utf-8').split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  if (index < 0) return { line: null, text: null, status: 'fail' };
  return { line: index + 1, text: lines[index]?.trim() ?? '', status: 'pass' };
}

function buildAnchorChecks(): AnchorCheck[] {
  return SOURCE_ANCHORS.map((anchor) => ({
    ...anchor,
    ...findLine(anchor.path, anchor.needle),
  }));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function latestTerrainRouteAudit(): string | null {
  const arg = argValue('--terrain-route-audit');
  if (arg) {
    const resolved = resolve(arg);
    return existsSync(resolved) ? resolved : null;
  }
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const stamps = readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const stamp of stamps) {
    const candidate = join(ARTIFACT_ROOT, stamp, 'projekt-143-terrain-route-audit', 'terrain-route-audit.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function buildMarkdown(report: AuditReport): string {
  const failedAnchors = report.checks.sourceAnchors.filter((anchor) => anchor.status !== 'pass');
  const lines = [
    '# DEFEKT-4 NPC Route Quality Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Classification',
    '',
    `Owner: ${report.classification.owner}`,
    `Acceptance: ${report.classification.acceptance}`,
    `Confidence: ${report.classification.confidence}`,
    '',
    '## Evidence',
    '',
    `Terrain route audit: ${report.inputs.terrainRouteAudit ?? 'missing'}`,
    `Route-aware modes: ${report.checks.terrainRouteAudit.routeAwareModes ?? 'unknown'}`,
    `Route length: ${report.checks.terrainRouteAudit.totalRouteLengthMeters ?? 'unknown'}m`,
    `Route capsule stamps: ${report.checks.terrainRouteAudit.totalRouteCapsuleStamps ?? 'unknown'}`,
    `Missing source anchors: ${failedAnchors.length}`,
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Runtime Acceptance Required',
    '',
    `Required packet: ${report.checks.runtimeAcceptance.requiredPacket}`,
    ...report.checks.runtimeAcceptance.requiredSignals.map((signal) => `- ${signal}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
  ];
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const createdAt = new Date().toISOString();
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const sourceAnchors = buildAnchorChecks();
  const sourceFailed = sourceAnchors.some((anchor) => anchor.status !== 'pass');
  const terrainRouteAuditPath = latestTerrainRouteAudit();
  const terrainAudit = terrainRouteAuditPath ? readJson<TerrainRouteAudit>(terrainRouteAuditPath) : null;
  const terrainStatus: Status = terrainAudit?.status ?? 'fail';
  const terrainMissingOrFailed = !terrainAudit || terrainStatus === 'fail';
  const status: Status = sourceFailed || terrainMissingOrFailed ? 'fail' : 'warn';

  const reportPath = join(outDir, 'route-quality-audit.json');
  const markdownPath = join(outDir, 'route-quality-audit.md');
  const report: AuditReport = {
    createdAt,
    sourceGitSha: gitSha(),
    mode: 'projekt-143-defekt-route-quality-audit',
    status,
    classification: {
      owner: status === 'fail'
        ? 'npc_route_quality_blocked'
        : 'npc_route_quality_guardrails_present_runtime_acceptance_missing',
      confidence: status === 'fail' ? 'low' : 'high',
      acceptance: status === 'fail' ? 'blocked' : 'source_and_static_route_policy_only',
    },
    inputs: {
      terrainRouteAudit: terrainRouteAuditPath ? rel(terrainRouteAuditPath) : null,
      sourceFiles: Array.from(new Set(SOURCE_ANCHORS.map((anchor) => anchor.path))).sort(),
    },
    checks: {
      sourceAnchors,
      terrainRouteAudit: {
        status: terrainStatus,
        path: terrainRouteAuditPath ? rel(terrainRouteAuditPath) : null,
        routeAwareModes: terrainAudit?.summary?.routeAwareModes ?? null,
        totalRouteLengthMeters: terrainAudit?.summary?.totalRouteLengthMeters ?? null,
        totalRouteCapsuleStamps: terrainAudit?.summary?.totalRouteCapsuleStamps ?? null,
        failModes: terrainAudit?.summary?.failModes ?? null,
        warnModes: terrainAudit?.summary?.warnModes ?? null,
      },
      runtimeAcceptance: {
        status: 'missing',
        requiredPacket: 'A Shau plus Open Frontier active-driver route/stuck browser capture with measurement_trust pass and route telemetry present.',
        requiredSignals: [
          'harness_max_stuck_seconds remains within scenario threshold.',
          'routeNoProgressResets and waypointReplanFailures are recorded and explained.',
          'pathQueryStatus samples show usable route guidance rather than persistent failed queries.',
          'terrain-stall warnings and PlayerMovement blocked-by-terrain counters stay within an accepted bound.',
          'A Shau is captured directly; Open Frontier remains covered as control terrain.',
        ],
      },
    },
    findings: [
      'Infantry route guardrails are present in CombatantMovement and StuckDetector: long-range navmesh waypoint steering, blocked-waypoint skip, last-good backtrack, no-op snap fallback, and hold escalation are source-anchored.',
      'Behavior tests cover the route and stuck-detector guardrails without accepting a live route-quality directive.',
      `Static terrain-route policy currently ${terrainStatus.toUpperCase()} at ${terrainRouteAuditPath ? rel(terrainRouteAuditPath) : 'missing'}.`,
      'DEFEKT-4 remains open because no current browser packet proves NPC/harness route quality under A Shau and Open Frontier runtime conditions.',
    ],
    nextActions: [
      'Run a focused active-driver route-quality capture for A Shau and Open Frontier.',
      'Feed each capture through projekt-143-active-driver-diagnostic and cite the route/stuck metrics in Article III.',
      'Define DEFEKT-4 closure bounds for max stuck seconds, route no-progress resets, waypoint replan failures, and terrain-stall warning rate before closing.',
    ],
    nonClaims: [
      'This packet does not close DEFEKT-4.',
      'This packet does not prove runtime NPC route quality.',
      'This packet does not prove A Shau route acceptance.',
      'This packet does not change gameplay code.',
      'This packet does not prove live production parity.',
    ],
    files: {
      summary: rel(reportPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, buildMarkdown(report));

  console.log(`Projekt 143 DEFEKT-4 route-quality audit ${status.toUpperCase()}: ${rel(reportPath)}`);
  for (const finding of report.findings) {
    console.log(`- ${finding}`);
  }
  if (status === 'fail') process.exitCode = 1;
}

main();
