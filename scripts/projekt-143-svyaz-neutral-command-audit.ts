#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

interface NeutralCommandAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-svyaz-neutral-command-audit';
  status: Status;
  directive: 'SVYAZ-1';
  inputs: {
    files: string[];
  };
  summary: {
    filesScanned: number;
    pass: number;
    warn: number;
    fail: number;
    partialNeutralMechanismPresent: boolean;
    explicitStandDownUiPresent: boolean;
    modalCancelPolicyCovered: boolean;
    standDownClearsCommandPosition: boolean;
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

const OUTPUT_NAME = 'projekt-143-svyaz-neutral-command-audit';
const SOURCE_PATHS = [
  'src/systems/combat/types.ts',
  'src/systems/combat/SquadCommandPresentation.ts',
  'src/systems/combat/PlayerSquadController.ts',
  'src/systems/combat/PlayerSquadController.test.ts',
  'src/systems/combat/CommandInputManager.ts',
  'src/systems/combat/CombatantAI.ts',
  'src/systems/combat/CombatantAI.test.ts',
  'src/systems/combat/CommandInputManager.test.ts',
  'src/ui/hud/CommandModeOverlay.ts',
  'src/ui/hud/CommandModeOverlay.test.ts',
  'src/ui/hud/CommandTacticalMap.ts',
  'src/ui/hud/CommandTacticalMap.test.ts',
  'src/integration/scenarios/squad-lifecycle.test.ts',
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

function hasStandDownLanguage(...texts: string[]): boolean {
  return /(stand down|return to neutral|cancel order|cancel command|neutral command|cease order)/i.test(texts.join('\n'));
}

function toMarkdown(report: NeutralCommandAuditReport): string {
  return [
    '# SVYAZ-1 Neutral Command Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Files scanned: ${report.summary.filesScanned}`,
    `- Checks: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
    `- Partial neutral mechanism present: ${report.summary.partialNeutralMechanismPresent}`,
    `- Explicit stand-down UI present: ${report.summary.explicitStandDownUiPresent}`,
    `- Modal cancel policy covered: ${report.summary.modalCancelPolicyCovered}`,
    `- Stand-down clears command position: ${report.summary.standDownClearsCommandPosition}`,
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
        summary: 'Required SVYAZ-1 audit source file is missing.',
        evidence: path,
      });
    }
  }

  const types = sources.get('src/systems/combat/types.ts') ?? null;
  const presentation = sources.get('src/systems/combat/SquadCommandPresentation.ts') ?? null;
  const controller = sources.get('src/systems/combat/PlayerSquadController.ts') ?? null;
  const controllerTest = sources.get('src/systems/combat/PlayerSquadController.test.ts') ?? null;
  const input = sources.get('src/systems/combat/CommandInputManager.ts') ?? null;
  const ai = sources.get('src/systems/combat/CombatantAI.ts') ?? null;
  const aiTest = sources.get('src/systems/combat/CombatantAI.test.ts') ?? null;
  const inputTest = sources.get('src/systems/combat/CommandInputManager.test.ts') ?? null;
  const overlay = sources.get('src/ui/hud/CommandModeOverlay.ts') ?? null;
  const overlayTest = sources.get('src/ui/hud/CommandModeOverlay.test.ts') ?? null;
  const map = sources.get('src/ui/hud/CommandTacticalMap.ts') ?? null;
  const mapTest = sources.get('src/ui/hud/CommandTacticalMap.test.ts') ?? null;

  const enumHasFreeRoam = /FREE_ROAM\s*=\s*'free_roam'/.test(types?.text ?? '');
  addCheck(
    checks,
    'enum-free-roam',
    enumHasFreeRoam ? 'PASS' : 'FAIL',
    types,
    /FREE_ROAM\s*=/,
    enumHasFreeRoam
      ? 'SquadCommand contains an existing free-roam command value.'
      : 'SquadCommand has no free-roam command value.',
  );

  const enumHasNone = /NONE\s*=\s*'none'/.test(types?.text ?? '');
  addCheck(
    checks,
    'enum-none',
    enumHasNone ? 'PASS' : 'FAIL',
    types,
    /NONE\s*=/,
    enumHasNone
      ? 'SquadCommand retains the no-command sentinel.'
      : 'SquadCommand has no no-command sentinel.',
  );

  const quickFreeRoam = /command:\s*SquadCommand\.FREE_ROAM/.test(presentation?.text ?? '');
  addCheck(
    checks,
    'quick-command-free-roam',
    quickFreeRoam ? 'PASS' : 'FAIL',
    presentation,
    /command:\s*SquadCommand\.FREE_ROAM/,
    quickFreeRoam
      ? 'Quick-command slot wiring exposes FREE_ROAM as an immediate command.'
      : 'Quick-command slot wiring does not expose FREE_ROAM.',
  );

  const explicitStandDownUi = hasStandDownLanguage(presentation?.text ?? '', overlay?.text ?? '', map?.text ?? '');
  addCheck(
    checks,
    'explicit-stand-down-language',
    explicitStandDownUi ? 'PASS' : 'WARN',
    presentation,
    /FREE_ROAM|AUTO|FREE ROAM/,
    explicitStandDownUi
      ? 'Command presentation exposes explicit stand-down / return-to-neutral language.'
      : 'Command presentation exposes FREE_ROAM as AUTO / FREE ROAM, not the requested stand-down / return-to-neutral command.',
  );

  const requiresTargetSection = sourceSection(presentation, /export function requiresCommandTarget/, /export function getSquadCommandLabel/);
  const freeRoamRequiresTarget = /FREE_ROAM/.test(requiresTargetSection);
  addCheck(
    checks,
    'free-roam-no-target',
    !freeRoamRequiresTarget ? 'PASS' : 'FAIL',
    presentation,
    /export function requiresCommandTarget/,
    !freeRoamRequiresTarget
      ? 'FREE_ROAM is non-targeted; it can execute without map placement.'
      : 'FREE_ROAM is treated as a targeted ground-order command.',
  );

  const modalCancelPolicyCovered =
    /keeps cancel as modal close instead of issuing stand down implicitly/.test(inputTest?.text ?? '')
    && /issueQuickCommand\)\.not\.toHaveBeenCalled/.test(inputTest?.text ?? '');
  addCheck(
    checks,
    'modal-cancel-policy-covered',
    modalCancelPolicyCovered ? 'PASS' : 'WARN',
    inputTest,
    /keeps cancel as modal close/,
    modalCancelPolicyCovered
      ? 'CommandInputManager tests define cancel as modal close, while stand-down remains an explicit command.'
      : 'CommandInputManager tests do not define whether cancel is modal close or a squad stand-down command.',
  );

  const issueCommand = sourceSection(controller, /private issueCommand/, /private renderIndicator/);
  const fallbackPositionForAllCommands = /commandPosition\s*=\s*explicitPosition\?\.clone\(\)\s*\?\?\s*this\.playerPosition\.clone\(\)/.test(issueCommand);
  const standDownClearsCommandPosition =
    /command\s*===\s*SquadCommand\.FREE_ROAM/.test(issueCommand)
    && /\?\s*undefined/.test(issueCommand);
  addCheck(
    checks,
    'non-targeted-command-position',
    fallbackPositionForAllCommands ? 'WARN' : 'PASS',
    controller,
    /commandPosition\s*=/,
    fallbackPositionForAllCommands
      ? 'PlayerSquadController assigns player position to every non-targeted command; neutral command-position semantics are not cleanly cleared.'
      : 'PlayerSquadController does not assign a command position to every non-targeted command.',
  );

  addCheck(
    checks,
    'stand-down-clears-command-position',
    standDownClearsCommandPosition ? 'PASS' : 'WARN',
    controller,
    /SquadCommand\.FREE_ROAM|commandPosition\s*=/,
    standDownClearsCommandPosition
      ? 'PlayerSquadController clears commandPosition for stand-down / FREE_ROAM.'
      : 'PlayerSquadController does not explicitly clear commandPosition for stand-down / FREE_ROAM.',
  );

  const issueCommandMutatesFormation = /\.formation\s*=/.test(issueCommand);
  addCheck(
    checks,
    'formation-not-mutated',
    !issueCommandMutatesFormation ? 'PASS' : 'FAIL',
    controller,
    /private issueCommand|formation\s*=/,
    !issueCommandMutatesFormation
      ? 'The command issuance path does not directly rewrite squad formation.'
      : 'The command issuance path rewrites squad formation.',
  );

  const aiHandlesFreeRoam =
    /command\s*===\s*SquadCommand\.FREE_ROAM/.test(ai?.text ?? '')
    && /combatant\.state\s*=\s*CombatantState\.PATROLLING/.test(ai?.text ?? '')
    && /combatant\.defensePosition\s*=\s*undefined/.test(ai?.text ?? '');
  addCheck(
    checks,
    'ai-free-roam-clears-command-override',
    aiHandlesFreeRoam ? 'PASS' : 'FAIL',
    ai,
    /command\s*===\s*SquadCommand\.FREE_ROAM/,
    aiHandlesFreeRoam
      ? 'CombatantAI clears command-driven DEFENDING under FREE_ROAM.'
      : 'CombatantAI does not prove FREE_ROAM returns command-driven state to default patrol behavior.',
  );

  const aiTestCoversFreeRoam =
    /describe\('FREE_ROAM command'/.test(aiTest?.text ?? '')
    && /should clear command-driven DEFENDING/.test(aiTest?.text ?? '');
  addCheck(
    checks,
    'ai-free-roam-test',
    aiTestCoversFreeRoam ? 'PASS' : 'WARN',
    aiTest,
    /describe\('FREE_ROAM command'|should clear command-driven DEFENDING/,
    aiTestCoversFreeRoam
      ? 'CombatantAI tests cover clearing command-driven DEFENDING under FREE_ROAM.'
      : 'CombatantAI tests do not cover the free-roam neutral behavior.',
  );

  const inputNeutralTest =
    /FREE_ROAM|stand down|return to neutral|cancel command|neutral command/i.test(inputTest?.text ?? '');
  addCheck(
    checks,
    'command-input-neutral-test',
    inputNeutralTest ? 'PASS' : 'WARN',
    inputTest,
    /FREE_ROAM|stand down|return to neutral|cancel command|neutral command/i,
    inputNeutralTest
      ? 'CommandInputManager tests contain neutral-command coverage.'
      : 'CommandInputManager tests cover overlay mechanics and placement, not neutral-command acceptance.',
  );

  const overlayNeutralTest =
    /FREE_ROAM|STAND DOWN|RETURN TO NEUTRAL|AUTO/i.test(overlayTest?.text ?? '');
  addCheck(
    checks,
    'overlay-neutral-label-test',
    overlayNeutralTest ? 'PASS' : 'WARN',
    overlayTest,
    /FREE_ROAM|STAND DOWN|RETURN TO NEUTRAL|AUTO/i,
    overlayNeutralTest
      ? 'CommandModeOverlay tests assert neutral/auto label behavior.'
      : 'CommandModeOverlay tests do not assert the neutral command label or active state.',
  );

  const tacticalMapTargeting =
    /ignores clicks until a ground order is armed/.test(mapTest?.text ?? '')
    && /setPlacementCommandLabel/.test(map?.text ?? '');
  addCheck(
    checks,
    'tactical-map-non-targeted-separation',
    tacticalMapTargeting ? 'PASS' : 'WARN',
    map,
    /setPlacementCommandLabel|placementArmed/,
    tacticalMapTargeting
      ? 'Tactical map tests separate ground-order placement from non-targeted commands.'
      : 'Tactical map tests do not prove non-targeted command separation.',
  );

  const controllerFormationTest =
    /issues stand down without retaining the prior command point or changing formation/.test(controllerTest?.text ?? '')
    && /expect\(squad\.formation\)\.toBe\('wedge'\)/.test(controllerTest?.text ?? '');
  addCheck(
    checks,
    'controller-neutral-formation-test',
    controllerFormationTest ? 'PASS' : 'WARN',
    controllerTest,
    /stand down|formation|FREE_ROAM/i,
    controllerFormationTest
      ? 'PlayerSquadController tests prove stand-down clears command position while preserving formation.'
      : 'PlayerSquadController tests do not prove stand-down clears command position while preserving formation.',
  );

  const pass = checks.filter((check) => check.status === 'PASS').length;
  const warn = checks.filter((check) => check.status === 'WARN').length;
  const fail = checks.filter((check) => check.status === 'FAIL').length;
  const status: Status = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';
  const acceptanceReady = status === 'pass'
    && explicitStandDownUi
    && modalCancelPolicyCovered
    && standDownClearsCommandPosition
    && controllerFormationTest;
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'neutral-command-audit.json');
  const markdownPath = join(outDir, 'neutral-command-audit.md');
  const report: NeutralCommandAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-svyaz-neutral-command-audit',
    status,
    directive: 'SVYAZ-1',
    inputs: {
      files: SOURCE_PATHS,
    },
    summary: {
      filesScanned: [...sources.values()].filter(Boolean).length,
      pass,
      warn,
      fail,
      partialNeutralMechanismPresent: enumHasFreeRoam && quickFreeRoam && aiHandlesFreeRoam,
      explicitStandDownUiPresent: explicitStandDownUi,
      modalCancelPolicyCovered,
      standDownClearsCommandPosition,
      acceptanceReady,
    },
    checks,
    nextActions: [
      'Use the latest audit packet plus focused tests as the local SVYAZ-1 source/test acceptance record.',
      'Run browser playtest before claiming player-facing command feel or mobile readability.',
      'Carry SVYAZ-2 separately for ping visibility, attack-here behavior, and movement/engagement priority rules.',
    ],
    nonClaims: [
      'This audit does not prove command UI readability, mobile ergonomics, or human playtest acceptance.',
      'This audit does not cover SVYAZ-2 ping visibility or attack-here behavior.',
      'This audit does not prove live production deployment.',
    ],
    files: {
      summary: rel(jsonPath),
      markdown: rel(markdownPath),
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 SVYAZ-1 neutral command audit ${status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`- checks: ${pass} pass, ${warn} warn, ${fail} fail`);
  console.log(`- partial neutral mechanism present: ${report.summary.partialNeutralMechanismPresent}`);
  console.log(`- explicit stand-down UI present: ${report.summary.explicitStandDownUiPresent}`);
  console.log(`- modal cancel policy covered: ${report.summary.modalCancelPolicyCovered}`);
  console.log(`- stand-down clears command position: ${report.summary.standDownClearsCommandPosition}`);
  if (status === 'fail') process.exitCode = 1;
}

main();
