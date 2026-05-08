#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type Status = 'pass' | 'warn' | 'fail';
type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

interface SourceFile {
  path: string;
  text: string;
  lines: string[];
}

interface AuditCheck {
  id: string;
  status: CheckStatus;
  file: string;
  line: number;
  summary: string;
  evidence: string;
}

interface SvyazPingCommandAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-svyaz-ping-command-audit';
  directive: 'SVYAZ-2';
  status: Status;
  inputs: {
    files: string[];
    browserProofArtifact: string | null;
  };
  summary: {
    filesScanned: number;
    pass: number;
    warn: number;
    fail: number;
    existingGroundOrdersPresent: boolean;
    attackHerePresent: boolean;
    fallBackEquivalentPresent: boolean;
    mapPingMarkerPresent: boolean;
    inWorldPingMarkerPresent: boolean;
    browserVisibilityProofPresent: boolean;
    browserVisibilityProofPath: string | null;
    travelEngagementPartial: boolean;
    priorityRulesDocumented: boolean;
    acceptanceReady: boolean;
  };
  checks: AuditCheck[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-svyaz-ping-command-audit';
const BROWSER_PROOF_OUTPUT_NAME = 'projekt-143-svyaz-ping-command-browser-proof';
const BROWSER_PROOF_SUMMARY_NAME = 'ping-command-browser-proof.json';
const ARTIFACT_ROOT = resolve('artifacts/perf');
const SOURCE_PATHS = [
  'src/systems/combat/types.ts',
  'src/systems/combat/SquadCommandPresentation.ts',
  'src/systems/combat/CommandInputManager.ts',
  'src/systems/combat/CommandInputManager.test.ts',
  'src/systems/combat/PlayerSquadController.ts',
  'src/systems/combat/PlayerSquadController.test.ts',
  'src/systems/combat/SquadCommandWorldMarker.ts',
  'src/systems/combat/CombatantAI.ts',
  'src/systems/combat/CombatantAI.test.ts',
  'src/systems/combat/ai/AIStatePatrol.ts',
  'src/ui/hud/CommandModeOverlay.ts',
  'src/ui/hud/CommandTacticalMap.ts',
  'src/ui/hud/CommandTacticalMap.test.ts',
  'src/ui/minimap/MinimapRenderer.ts',
  'src/ui/minimap/MinimapRenderer.test.ts',
  'src/ui/minimap/MinimapSystem.ts',
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function outputDir(): string {
  const explicit = argValue('--out-dir');
  if (explicit) return resolve(explicit);
  return join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function readSource(path: string): SourceFile | null {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return null;
  const text = readFileSync(absolute, 'utf-8');
  return {
    path,
    text,
    lines: text.split(/\r?\n/),
  };
}

function findLatestBrowserProof(): { path: string; status: string | null; inWorldMarkerVisible: boolean; tacticalMapMarkerVisible: boolean } | null {
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const candidates: Array<{
    path: string;
    mtimeMs: number;
    status: string | null;
    inWorldMarkerVisible: boolean;
    tacticalMapMarkerVisible: boolean;
  }> = [];
  for (const artifactDir of readdirSync(ARTIFACT_ROOT)) {
    const summaryPath = join(ARTIFACT_ROOT, artifactDir, BROWSER_PROOF_OUTPUT_NAME, BROWSER_PROOF_SUMMARY_NAME);
    if (!existsSync(summaryPath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(summaryPath, 'utf-8')) as {
        status?: string;
        summary?: {
          inWorldMarkerVisible?: boolean;
          tacticalMapMarkerVisible?: boolean;
        };
      };
      candidates.push({
        path: rel(summaryPath),
        mtimeMs: statSync(summaryPath).mtimeMs,
        status: parsed.status ?? null,
        inWorldMarkerVisible: parsed.summary?.inWorldMarkerVisible === true,
        tacticalMapMarkerVisible: parsed.summary?.tacticalMapMarkerVisible === true,
      });
    } catch {
      candidates.push({
        path: rel(summaryPath),
        mtimeMs: statSync(summaryPath).mtimeMs,
        status: null,
        inWorldMarkerVisible: false,
        tacticalMapMarkerVisible: false,
      });
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ?? null;
}

function findLine(source: SourceFile | null, pattern: RegExp): { line: number; text: string } {
  if (!source) return { line: 0, text: 'missing source file' };
  const index = source.lines.findIndex((line) => pattern.test(line));
  if (index < 0) return { line: 0, text: 'pattern not found' };
  return { line: index + 1, text: source.lines[index].trim() };
}

function sourceSection(source: SourceFile | null, startPattern: RegExp, endPattern: RegExp): string {
  if (!source) return '';
  const start = source.text.search(startPattern);
  if (start < 0) return '';
  const rest = source.text.slice(start);
  const end = rest.search(endPattern);
  return end < 0 ? rest : rest.slice(0, end);
}

function addCheck(
  checks: AuditCheck[],
  id: string,
  status: CheckStatus,
  source: SourceFile | null,
  linePattern: RegExp,
  summary: string,
  fallbackEvidence?: string,
): void {
  const located = findLine(source, linePattern);
  checks.push({
    id,
    status,
    file: source?.path ?? 'missing',
    line: located.line,
    summary,
    evidence: located.line > 0 ? located.text : fallbackEvidence ?? located.text,
  });
}

function hasAll(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function toMarkdown(report: SvyazPingCommandAuditReport): string {
  return [
    '# SVYAZ-2 Ping Command Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Files scanned: ${report.summary.filesScanned}`,
    `- Checks: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
    `- Existing ground orders present: ${report.summary.existingGroundOrdersPresent}`,
    `- Attack-here present: ${report.summary.attackHerePresent}`,
    `- Fall-back equivalent present: ${report.summary.fallBackEquivalentPresent}`,
    `- Map ping marker present: ${report.summary.mapPingMarkerPresent}`,
    `- In-world ping marker present: ${report.summary.inWorldPingMarkerPresent}`,
    `- Browser visibility proof present: ${report.summary.browserVisibilityProofPresent}`,
    `- Browser visibility proof path: ${report.summary.browserVisibilityProofPath ?? 'none'}`,
    `- Travel engagement partial: ${report.summary.travelEngagementPartial}`,
    `- Priority rules documented: ${report.summary.priorityRulesDocumented}`,
    `- Acceptance ready: ${report.summary.acceptanceReady}`,
    '',
    '## Checks',
    '',
    ...report.checks.map((check) => `- ${check.status} ${check.id}: ${check.summary} (${check.file}:${check.line})`),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

function main(): void {
  const sources = new Map<string, SourceFile | null>(
    SOURCE_PATHS.map((path) => [path, readSource(path)]),
  );
  const checks: AuditCheck[] = [];

  for (const path of SOURCE_PATHS) {
    const source = sources.get(path) ?? null;
    if (!source) {
      checks.push({
        id: `source:${path}`,
        status: 'FAIL',
        file: path,
        line: 0,
        summary: 'Required SVYAZ-2 audit source file is missing.',
        evidence: path,
      });
    }
  }

  const types = sources.get('src/systems/combat/types.ts') ?? null;
  const presentation = sources.get('src/systems/combat/SquadCommandPresentation.ts') ?? null;
  const input = sources.get('src/systems/combat/CommandInputManager.ts') ?? null;
  const inputTest = sources.get('src/systems/combat/CommandInputManager.test.ts') ?? null;
  const controller = sources.get('src/systems/combat/PlayerSquadController.ts') ?? null;
  const controllerTest = sources.get('src/systems/combat/PlayerSquadController.test.ts') ?? null;
  const worldMarker = sources.get('src/systems/combat/SquadCommandWorldMarker.ts') ?? null;
  const ai = sources.get('src/systems/combat/CombatantAI.ts') ?? null;
  const aiTest = sources.get('src/systems/combat/CombatantAI.test.ts') ?? null;
  const patrol = sources.get('src/systems/combat/ai/AIStatePatrol.ts') ?? null;
  const overlay = sources.get('src/ui/hud/CommandModeOverlay.ts') ?? null;
  const map = sources.get('src/ui/hud/CommandTacticalMap.ts') ?? null;
  const mapTest = sources.get('src/ui/hud/CommandTacticalMap.test.ts') ?? null;
  const minimap = sources.get('src/ui/minimap/MinimapRenderer.ts') ?? null;
  const minimapTest = sources.get('src/ui/minimap/MinimapRenderer.test.ts') ?? null;

  const existingGroundOrdersPresent = hasAll(types?.text ?? '', [
    /HOLD_POSITION\s*=\s*'hold_position'/,
    /PATROL_HERE\s*=\s*'patrol_here'/,
    /RETREAT\s*=\s*'retreat'/,
  ]);
  addCheck(
    checks,
    'ground-order-enum-surface',
    existingGroundOrdersPresent ? 'PASS' : 'FAIL',
    types,
    /HOLD_POSITION\s*=|PATROL_HERE\s*=|RETREAT\s*=/,
    existingGroundOrdersPresent
      ? 'SquadCommand has Hold, Patrol, and Retreat ground-order values.'
      : 'SquadCommand is missing one or more existing ground-order values.',
  );

  const attackHerePresent = /ATTACK_HERE|ATTACK_POINT|attack_here|attack point|attack here/i.test(types?.text ?? '')
    || /ATTACK_HERE|ATTACK_POINT|attack_here|attack point|attack here/i.test(presentation?.text ?? '');
  addCheck(
    checks,
    'attack-here-command-surface',
    attackHerePresent ? 'PASS' : 'WARN',
    types,
    /ATTACK_HERE|ATTACK_POINT|attack_here|attack point|attack here/i,
    attackHerePresent
      ? 'Attack-here command surface is present in command vocabulary.'
      : 'Attack-here command surface is absent from the command vocabulary.',
  );

  const fallBackEquivalentPresent = /RETREAT\s*=\s*'retreat'/.test(types?.text ?? '')
    && /fullLabel:\s*'(?:RETREAT|FALL BACK)'/.test(presentation?.text ?? '');
  addCheck(
    checks,
    'fall-back-equivalent',
    fallBackEquivalentPresent ? 'PASS' : 'WARN',
    presentation,
    /RETREAT/,
    fallBackEquivalentPresent
      ? 'RETREAT exists as the internal fall-back equivalent.'
      : 'No fall-back or retreat equivalent appears in quick commands.',
  );

  const fallBackLanguagePresent = /FALL BACK|FALLBACK/i.test(presentation?.text ?? '')
    || /FALL BACK|FALLBACK/i.test(overlay?.text ?? '');
  addCheck(
    checks,
    'fall-back-language',
    fallBackLanguagePresent ? 'PASS' : 'WARN',
    presentation,
    /FALL BACK|FALLBACK/i,
    fallBackLanguagePresent
      ? 'Player-facing command language includes fall-back wording.'
      : 'Player-facing command language says RETREAT, not fall back.',
  );

  const targetRequirementSection = sourceSection(presentation, /export function requiresCommandTarget/, /export function getSquadCommandLabel/);
  const existingGroundOrdersNeedTarget = hasAll(targetRequirementSection, [
    /SquadCommand\.HOLD_POSITION/,
    /SquadCommand\.PATROL_HERE/,
    /SquadCommand\.ATTACK_HERE/,
    /SquadCommand\.RETREAT/,
  ]);
  addCheck(
    checks,
    'targeted-ground-orders',
    existingGroundOrdersNeedTarget ? 'PASS' : 'FAIL',
    presentation,
    /export function requiresCommandTarget/,
    existingGroundOrdersNeedTarget
      ? 'Hold, Patrol, Attack, and Retreat require tactical-map placement.'
      : 'One or more ground orders do not require tactical-map placement.',
  );

  const overlayExposesExistingOrders = hasAll(overlay?.text ?? '', [
    /Hold,\s*Patrol,\s*(?:Fall Back|Retreat),\s*and\s*Attack|Hold\/Patrol\/(?:Fall Back|Retreat)\/Attack/i,
    /onMapPointSelected/,
  ]);
  addCheck(
    checks,
    'overlay-existing-ground-orders',
    overlayExposesExistingOrders ? 'PASS' : 'WARN',
    overlay,
    /Hold,\s*Patrol,\s*(?:Fall Back|Retreat),\s*and\s*Attack|Hold\/Patrol\/(?:Fall Back|Retreat)\/Attack/i,
    overlayExposesExistingOrders
      ? 'Command overlay directs the player to place Hold, Patrol, Fall Back, and Attack on the map.'
      : 'Command overlay does not prove the existing ground-order placement flow.',
  );

  const inputPlacesArmedCommand = /this\.pendingPlacementCommand\s*=\s*option\.command/.test(input?.text ?? '')
    && /issueCommandAtPosition/.test(input?.text ?? '');
  addCheck(
    checks,
    'input-placement-dispatch',
    inputPlacesArmedCommand ? 'PASS' : 'FAIL',
    input,
    /pendingPlacementCommand|issueCommandAtPosition/,
    inputPlacesArmedCommand
      ? 'CommandInputManager arms targeted commands and dispatches them at selected map positions.'
      : 'CommandInputManager does not prove armed command placement dispatch.',
  );

  const inputPlacementTest = /arms placement orders in the overlay and dispatches them after a map click/.test(inputTest?.text ?? '')
    && /SquadCommand\.HOLD_POSITION/.test(inputTest?.text ?? '')
    && /SquadCommand\.ATTACK_HERE/.test(inputTest?.text ?? '');
  addCheck(
    checks,
    'input-placement-test',
    inputPlacementTest ? 'PASS' : 'WARN',
    inputTest,
    /arms placement orders in the overlay/,
    inputPlacementTest
      ? 'CommandInputManager tests cover map placement for an armed ground order.'
      : 'CommandInputManager tests do not cover map placement for Hold and Attack ground orders.',
  );

  const tacticalMapPlacement = /this\.placementArmed/.test(map?.text ?? '')
    && /this\.onPointSelected\?\.\(worldPoint\)/.test(map?.text ?? '');
  addCheck(
    checks,
    'tactical-map-placement',
    tacticalMapPlacement ? 'PASS' : 'FAIL',
    map,
    /placementArmed|onPointSelected/,
    tacticalMapPlacement
      ? 'CommandTacticalMap sends a world point when placement is armed.'
      : 'CommandTacticalMap does not prove world-point dispatch for armed placement.',
  );

  const mapPingMarkerPresent = /drawCommandMarker/.test(minimap?.text ?? '')
    && /commandPosition/.test(minimap?.text ?? '');
  addCheck(
    checks,
    'map-command-marker',
    mapPingMarkerPresent ? 'PASS' : 'WARN',
    minimap,
    /drawCommandMarker|commandPosition/,
    mapPingMarkerPresent
      ? 'Minimap renderer draws a command-position marker and leader line.'
      : 'No minimap command-position marker was found.',
  );

  const mapMarkerTest = /commandPosition/.test(minimapTest?.text ?? '')
    && /moveTo/.test(minimapTest?.text ?? '');
  addCheck(
    checks,
    'map-command-marker-test',
    mapMarkerTest ? 'PASS' : 'WARN',
    minimapTest,
    /commandPosition/,
    mapMarkerTest
      ? 'Minimap tests exercise command-position marker drawing.'
      : 'Minimap tests do not exercise command-position marker drawing.',
  );

  const combinedUiText = [
    presentation?.text ?? '',
    input?.text ?? '',
    controller?.text ?? '',
    worldMarker?.text ?? '',
    overlay?.text ?? '',
    map?.text ?? '',
    minimap?.text ?? '',
  ].join('\n');
  const inWorldPingMarkerPresent = /THREE\.(Sprite|Mesh|Group|RingGeometry|CircleGeometry|ConeGeometry)/.test(combinedUiText)
    && /(ping|marker|command).*(world|scene)|scene\.add/i.test(combinedUiText)
    && /setCommand\([^)]*SquadCommand/.test(worldMarker?.text ?? '');
  addCheck(
    checks,
    'in-world-ping-marker',
    inWorldPingMarkerPresent ? 'PASS' : 'WARN',
    worldMarker,
    /scene\.add|THREE\.(Sprite|Mesh|Group|RingGeometry|CircleGeometry|ConeGeometry)|setCommand/i,
    inWorldPingMarkerPresent
      ? 'A scene/world command marker path is present.'
      : 'No in-world ping marker path was found for placed squad commands.',
  );

  const inWorldMarkerTest = /shows an in-world marker for directed squad commands/.test(controllerTest?.text ?? '')
    && /SQUAD_COMMAND_WORLD_MARKER_NAME/.test(controllerTest?.text ?? '');
  addCheck(
    checks,
    'in-world-ping-marker-test',
    inWorldMarkerTest ? 'PASS' : 'WARN',
    controllerTest,
    /shows an in-world marker for directed squad commands|SQUAD_COMMAND_WORLD_MARKER_NAME/,
    inWorldMarkerTest
      ? 'PlayerSquadController tests prove directed commands expose a scene marker.'
      : 'No focused test proves directed commands expose a scene marker.',
  );

  const latestBrowserProof = findLatestBrowserProof();
  const browserVisibilityProofPresent = latestBrowserProof?.status === 'pass'
    && latestBrowserProof.inWorldMarkerVisible
    && latestBrowserProof.tacticalMapMarkerVisible;
  checks.push({
    id: 'browser-visibility-proof',
    status: browserVisibilityProofPresent ? 'PASS' : 'WARN',
    file: 'artifacts/perf',
    line: 0,
    summary: browserVisibilityProofPresent
      ? 'Latest SVYAZ-2 browser proof packet verifies map and in-world marker visibility.'
      : 'No passing SVYAZ-2 browser proof packet verifies map and in-world marker visibility.',
    evidence: latestBrowserProof
      ? `${latestBrowserProof.path} status=${latestBrowserProof.status ?? 'unreadable'} inWorld=${latestBrowserProof.inWorldMarkerVisible} map=${latestBrowserProof.tacticalMapMarkerVisible}`
      : 'Run a browser proof after the source path lands.',
  });

  const patrolCommandBeforeDetection = /this\.handleSquadCommand\(combatant, squad, playerPosition, deltaTime\)/.test(patrol?.text ?? '')
    && /const enemy = findNearestEnemy/.test(patrol?.text ?? '')
    && patrol!.text.indexOf('this.handleSquadCommand(combatant, squad, playerPosition, deltaTime)') < patrol!.text.indexOf('const enemy = findNearestEnemy');
  addCheck(
    checks,
    'travel-engagement-patrol-order',
    patrolCommandBeforeDetection ? 'PASS' : 'WARN',
    patrol,
    /handleSquadCommand|findNearestEnemy/,
    patrolCommandBeforeDetection
      ? 'Patrol-state handling applies squad movement command before enemy detection, so travelling patrol-state units can still detect and engage.'
      : 'Patrol-state command handling does not prove target detection continues while travelling.',
  );

  const activeCombatNotInterruptedByPatrol = /case SquadCommand\.PATROL_HERE:[\s\S]{0,180}Does NOT interrupt active combat/.test(ai?.text ?? '')
    && /case SquadCommand\.ATTACK_HERE:[\s\S]{0,180}Does NOT interrupt active combat/.test(ai?.text ?? '')
    && /case SquadCommand\.HOLD_POSITION:[\s\S]{0,180}Does NOT interrupt active combat/.test(ai?.text ?? '');
  addCheck(
    checks,
    'active-combat-not-interrupted',
    activeCombatNotInterruptedByPatrol ? 'PASS' : 'WARN',
    ai,
    /Does NOT interrupt active combat|PATROL_HERE|HOLD_POSITION/,
    activeCombatNotInterruptedByPatrol
      ? 'CombatantAI keeps Hold, Patrol, and Attack from interrupting active combat states.'
      : 'CombatantAI does not document or prove active-combat priority for Hold, Patrol, and Attack.',
  );

  const aiTestsCoverTravelPriority = /PATROL_HERE/.test(aiTest?.text ?? '')
    && /ATTACK_HERE/.test(aiTest?.text ?? '')
    && /does not interrupt active combat|active combat|ENGAGING/.test(aiTest?.text ?? '');
  addCheck(
    checks,
    'travel-engagement-test-coverage',
    aiTestsCoverTravelPriority ? 'PASS' : 'WARN',
    aiTest,
    /PATROL_HERE|active combat|ENGAGING/,
    aiTestsCoverTravelPriority
      ? 'CombatantAI tests cover command priority around active combat.'
      : 'CombatantAI tests do not clearly prove travelling squads engage targets while under directed movement.',
  );

  const priorityRulesDocumented = /HOLD_POSITION: transition non-combat states to DEFENDING \(does NOT override active combat\)/i.test(ai?.text ?? '')
    && /PATROL_HERE \/ ATTACK_HERE: ensure non-combat states stay in PATROLLING \(does NOT override active combat\)/i.test(ai?.text ?? '')
    && /FOLLOW_ME \/ RETREAT: interrupt combat states/i.test(ai?.text ?? '');
  addCheck(
    checks,
    'priority-rules-documented',
    priorityRulesDocumented ? 'PASS' : 'WARN',
    ai,
    /HOLD_POSITION: transition non-combat states|Does NOT interrupt active combat/,
    priorityRulesDocumented
      ? 'Movement-versus-engagement priority rules are documented in source-facing text.'
      : 'Priority rules between defensive engagement and movement orders are not documented as an acceptance surface.',
  );

  const pass = checks.filter((check) => check.status === 'PASS').length;
  const warn = checks.filter((check) => check.status === 'WARN').length;
  const fail = checks.filter((check) => check.status === 'FAIL').length;
  const status: Status = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';
  const travelEngagementPartial = patrolCommandBeforeDetection && activeCombatNotInterruptedByPatrol;
  const acceptanceReady = status === 'pass'
    && attackHerePresent
    && fallBackLanguagePresent
    && mapPingMarkerPresent
    && inWorldPingMarkerPresent
    && browserVisibilityProofPresent
    && travelEngagementPartial
    && priorityRulesDocumented;

  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'ping-command-audit.json');
  const markdownPath = join(outDir, 'ping-command-audit.md');
  const nextActions: string[] = [];
  if (!attackHerePresent) {
    nextActions.push('Add an explicit attack-here squad command before claiming the full SVYAZ-2 command vocabulary.');
  }
  if (!inWorldPingMarkerPresent) {
    nextActions.push('Add an in-world ping marker path for placed squad commands; the current marker evidence is minimap/tactical-map only.');
  }
  if (!priorityRulesDocumented || !travelEngagementPartial) {
    nextActions.push('Document movement-versus-engagement priority rules and cover them with behavior tests before closing SVYAZ-2.');
  } else {
    nextActions.push('Preserve the documented movement-versus-engagement priority rules when adding remaining SVYAZ-2 visual surfaces.');
  }
  if (!browserVisibilityProofPresent) {
    nextActions.push('Run a browser proof after implementation to verify map and in-world marker visibility.');
  }
  const report: SvyazPingCommandAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-svyaz-ping-command-audit',
    directive: 'SVYAZ-2',
    status,
    inputs: {
      files: SOURCE_PATHS,
      browserProofArtifact: latestBrowserProof?.path ?? null,
    },
    summary: {
      filesScanned: [...sources.values()].filter(Boolean).length,
      pass,
      warn,
      fail,
      existingGroundOrdersPresent,
      attackHerePresent,
      fallBackEquivalentPresent,
      mapPingMarkerPresent,
      inWorldPingMarkerPresent,
      browserVisibilityProofPresent,
      browserVisibilityProofPath: latestBrowserProof?.path ?? null,
      travelEngagementPartial,
      priorityRulesDocumented,
      acceptanceReady,
    },
    checks,
    nextActions,
    nonClaims: [
      browserVisibilityProofPresent
        ? 'This audit consumes the latest browser proof packet; screenshots remain the visual acceptance artifacts.'
        : inWorldPingMarkerPresent
          ? 'This audit proves the source/test in-world marker path, not browser visibility acceptance.'
          : 'This audit does not implement or prove in-world ping markers.',
      'This audit does not prove mobile ergonomics, command feel, or live production parity.',
      browserVisibilityProofPresent
        ? 'This audit does not close SVYAZ-3 or any air-support radio surface.'
        : 'This audit does not close SVYAZ-2.',
    ],
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 SVYAZ-2 ping command audit ${status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`- checks: ${pass} pass, ${warn} warn, ${fail} fail`);
  console.log(`- existing ground orders present: ${report.summary.existingGroundOrdersPresent}`);
  console.log(`- attack here present: ${report.summary.attackHerePresent}`);
  console.log(`- map ping marker present: ${report.summary.mapPingMarkerPresent}`);
  console.log(`- in-world ping marker present: ${report.summary.inWorldPingMarkerPresent}`);
  console.log(`- travel engagement partial: ${report.summary.travelEngagementPartial}`);
  if (status === 'fail') process.exitCode = 1;
}

main();
