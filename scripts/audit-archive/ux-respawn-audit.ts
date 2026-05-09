#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type AuditStatus = 'pass' | 'warn' | 'fail';
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

interface UxRespawnAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-ux-respawn-audit';
  status: AuditStatus;
  directive: 'UX-1';
  inputs: {
    files: string[];
  };
  summary: {
    filesScanned: number;
    pass: number;
    warn: number;
    fail: number;
    deployScreenPresent: boolean;
    spawnPointClassesPresent: boolean;
    mapColorCodesSpawnKinds: boolean;
    mapLabelsSpawnKinds: boolean;
    mobileParityHooksPresent: boolean;
    acceptanceReady: boolean;
  };
  checks: AuditCheck[];
  currentContract: string[];
  gaps: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-ux-respawn-audit';
const SOURCE_PATHS = [
  'src/ui/screens/DeployScreen.ts',
  'src/ui/screens/DeployScreen.module.css',
  'src/systems/world/runtime/DeployFlowSession.ts',
  'src/systems/player/RespawnSpawnPoint.ts',
  'src/systems/player/SpawnPointSelector.ts',
  'src/systems/player/RespawnMapController.ts',
  'src/ui/map/OpenFrontierRespawnMap.ts',
  'src/ui/map/OpenFrontierRespawnMapRenderer.ts',
  'src/systems/player/RespawnUI.test.ts',
  'src/systems/player/PlayerRespawnManager.test.ts',
  'scripts/mobile-ui-check.ts',
  'docs/dizayn/art-direction-gate.md',
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

function countStatuses(checks: AuditCheck[], status: CheckStatus): number {
  return checks.filter((check) => check.status === status).length;
}

function findSignedDizaynGate(): string | null {
  const perfRoot = join(process.cwd(), 'artifacts', 'perf');
  if (!existsSync(perfRoot)) return null;

  const candidates: string[] = [];
  for (const entry of readdirSync(perfRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const gatePath = join(
      perfRoot,
      entry.name,
      'projekt-143-ux-respawn-dizayn-gate',
      'ux-respawn-dizayn-gate.json',
    );
    if (!existsSync(gatePath)) continue;

    try {
      const gate = JSON.parse(readFileSync(gatePath, 'utf-8')) as {
        directive?: string;
        status?: string;
        decision?: string;
        summary?: { signed?: boolean };
      };
      const signed = gate.directive === 'UX-1'
        && gate.status === 'pass'
        && gate.summary?.signed === true
        && /signed/i.test(gate.decision ?? '');
      if (signed) candidates.push(gatePath);
    } catch {
      // Malformed historical artifacts are ignored by this source audit.
    }
  }

  candidates.sort();
  const latest = candidates.at(-1);
  return latest ? rel(latest) : null;
}

function makeMarkdown(report: UxRespawnAuditReport): string {
  return [
    '# UX-1 Respawn Surface Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Summary',
    '',
    `- Files scanned: ${report.summary.filesScanned}`,
    `- Checks: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`,
    `- Deploy screen present: ${report.summary.deployScreenPresent}`,
    `- Spawn point classes present: ${report.summary.spawnPointClassesPresent}`,
    `- Map color-codes spawn kinds: ${report.summary.mapColorCodesSpawnKinds}`,
    `- Map labels spawn kinds: ${report.summary.mapLabelsSpawnKinds}`,
    `- Mobile parity hooks present: ${report.summary.mobileParityHooksPresent}`,
    `- Acceptance ready: ${report.summary.acceptanceReady}`,
    '',
    '## Current Contract',
    '',
    ...report.currentContract.map((item) => `- ${item}`),
    '',
    '## Checks',
    '',
    ...report.checks.map((check) => `- ${check.status} ${check.id}: ${check.summary} (${check.file}:${check.line})`),
    '',
    '## Gaps',
    '',
    ...report.gaps.map((gap) => `- ${gap}`),
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
        summary: 'Required UX-1 audit source file is missing.',
        evidence: path,
      });
    }
  }

  const deploy = sources.get('src/ui/screens/DeployScreen.ts') ?? null;
  const deployCss = sources.get('src/ui/screens/DeployScreen.module.css') ?? null;
  const session = sources.get('src/systems/world/runtime/DeployFlowSession.ts') ?? null;
  const spawnType = sources.get('src/systems/player/RespawnSpawnPoint.ts') ?? null;
  const selector = sources.get('src/systems/player/SpawnPointSelector.ts') ?? null;
  const mapController = sources.get('src/systems/player/RespawnMapController.ts') ?? null;
  const map = sources.get('src/ui/map/OpenFrontierRespawnMap.ts') ?? null;
  const renderer = sources.get('src/ui/map/OpenFrontierRespawnMapRenderer.ts') ?? null;
  const respawnTest = sources.get('src/systems/player/RespawnUI.test.ts') ?? null;
  const managerTest = sources.get('src/systems/player/PlayerRespawnManager.test.ts') ?? null;
  const mobileCheck = sources.get('scripts/mobile-ui-check.ts') ?? null;
  const artGate = sources.get('docs/dizayn/art-direction-gate.md') ?? null;
  const signedDizaynGate = findSignedDizaynGate();

  const deployScreenPresent = hasAll(deploy?.text ?? '', [
    /class\s+DeployScreen/,
    /this\.root\.id\s*=\s*'respawn-ui'/,
    /createSelectedPanel/,
    /createLoadoutPanel/,
    /createControlsPanel/,
  ]);
  addCheck(
    checks,
    'deploy-screen-present',
    deployScreenPresent ? 'PASS' : 'FAIL',
    deploy,
    /class\s+DeployScreen|this\.root\.id\s*=\s*'respawn-ui'/,
    deployScreenPresent
      ? 'DeployScreen owns the respawn/deploy UI surface with selected spawn, loadout, and controls panels.'
      : 'DeployScreen surface is missing or not wired as the respawn UI.',
  );

  const modeFlowLoadoutHeader = hasAll(deploy?.text ?? '', [
    /createMetaRow\('Mode'/,
    /createMetaRow\('Flow'/,
    /createMetaRow\('Loadout'/,
  ]);
  addCheck(
    checks,
    'mode-flow-loadout-header',
    modeFlowLoadoutHeader ? 'PASS' : 'WARN',
    deploy,
    /createMetaRow\('Mode'/,
    modeFlowLoadoutHeader
      ? 'Deploy header presents mode, flow, and loadout state.'
      : 'Deploy header does not present mode, flow, and loadout state together.',
  );

  const allianceOrFactionSurface = /respawn-loadout-faction/.test(deploy?.text ?? '')
    && /factionLabel/.test(deploy?.text ?? '')
    && /createMetaRow\('Alliance'/.test(deploy?.text ?? '')
    && /updateAlliance/.test(`${deploy?.text ?? ''}\n${managerTest?.text ?? ''}`);
  addCheck(
    checks,
    'alliance-surface',
    allianceOrFactionSurface ? 'PASS' : 'WARN',
    deploy,
    /createMetaRow\('Alliance'|respawn-loadout-faction|factionLabel/,
    allianceOrFactionSurface
      ? 'Deploy UI exposes alliance in the main decision header and faction in loadout metadata.'
      : 'Deploy UI lacks an explicit alliance/faction decision surface.',
  );

  const spawnPointClassesPresent = hasAll(spawnType?.text ?? '', [
    /'home_base'/,
    /'zone'/,
    /'helipad'/,
    /'insertion'/,
    /selectionClass/,
  ]) && hasAll(selector?.text ?? '', [
    /buildAvailableSpawnPoints/,
    /kind:\s*'helipad'/,
    /kind:\s*'insertion'/,
    /kind:\s*z\.isHomeBase \? 'home_base' : 'zone'/,
  ]);
  addCheck(
    checks,
    'spawn-point-classes',
    spawnPointClassesPresent ? 'PASS' : 'FAIL',
    spawnType,
    /RespawnSpawnPointKind|selectionClass/,
    spawnPointClassesPresent
      ? 'Spawn model distinguishes home base, zone, helipad, and insertion classes.'
      : 'Spawn model does not distinguish the UX-1 spawn classes.',
  );

  const helipadFallbackCovered = /falls back to configured helipads during initial deploy/.test(managerTest?.text ?? '')
    && /prefers the main frontier helipad/.test(managerTest?.text ?? '');
  addCheck(
    checks,
    'helipad-tests',
    helipadFallbackCovered ? 'PASS' : 'WARN',
    managerTest,
    /falls back to configured helipads during initial deploy|prefers the main frontier helipad/,
    helipadFallbackCovered
      ? 'PlayerRespawnManager tests cover configured helipad fallback and frontier helipad preference.'
      : 'Helipad spawn behavior is not covered by focused tests.',
  );

  const insertionCovered = /preselects the preferred insertion point for initial deploy/.test(managerTest?.text ?? '')
    && /direct_insertion/.test(managerTest?.text ?? '');
  addCheck(
    checks,
    'insertion-tests',
    insertionCovered ? 'PASS' : 'WARN',
    managerTest,
    /preselects the preferred insertion point for initial deploy|direct_insertion/,
    insertionCovered
      ? 'PlayerRespawnManager tests cover direct insertion preselection.'
      : 'Direct insertion behavior is not covered by focused tests.',
  );

  const mapReceivesSpawnPoints = /setSpawnPoints\(spawnPoints/.test(mapController?.text ?? '')
    && /openFrontierRespawnMap\.setSpawnPoints/.test(mapController?.text ?? '')
    && /focusSpawnPoints/.test(mapController?.text ?? '');
  addCheck(
    checks,
    'map-receives-spawn-points',
    mapReceivesSpawnPoints ? 'PASS' : 'FAIL',
    mapController,
    /setSpawnPoints\(spawnPoints/,
    mapReceivesSpawnPoints
      ? 'RespawnMapController forwards available spawn points to the canvas map and focuses them.'
      : 'RespawnMapController does not forward spawn points to the canvas map.',
  );

  const mapColorCodesSpawnKinds = hasAll(renderer?.text ?? '', [
    /drawSpawnPoint/,
    /selectionClass === 'direct_insertion'/,
    /spawnPoint\.kind === 'helipad'/,
  ]);
  addCheck(
    checks,
    'map-color-codes-spawn-kinds',
    mapColorCodesSpawnKinds ? 'PASS' : 'WARN',
    renderer,
    /drawSpawnPoint|selectionClass === 'direct_insertion'/,
    mapColorCodesSpawnKinds
      ? 'Canvas respawn map color-codes direct insertion and helipad markers.'
      : 'Canvas respawn map does not color-code the required spawn kinds.',
  );

  const mapLabelsSpawnKinds = hasAll(renderer?.text ?? '', [
    /spawnPoint\.name/,
    /kind|selectionClass/,
  ]);
  addCheck(
    checks,
    'map-labels-spawn-kinds',
    mapLabelsSpawnKinds ? 'PASS' : 'WARN',
    renderer,
    /spawnPoint\.name|selectionClass|kind/,
    mapLabelsSpawnKinds
      ? 'Canvas respawn map labels spawn classes clearly enough for UX-1 review.'
      : 'Canvas respawn map does not label or name available zone, helipad, and insertion choices clearly enough for UX-1 closure.',
  );

  const textualSpawnList = /updateSpawnOptions\(spawnPoints/.test(deploy?.text ?? '')
    && /groupSpawnPoints/.test(deploy?.text ?? '')
    && /spawnOptionGroupTitle/.test(deploy?.text ?? '')
    && /selectionClass/.test(deploy?.text ?? '');
  addCheck(
    checks,
    'textual-spawn-list',
    textualSpawnList ? 'PASS' : 'WARN',
    deploy,
    /availableSpawnPoints|spawn point list|selectionClass/i,
    textualSpawnList
      ? 'DeployScreen renders available spawn choices outside the canvas.'
      : 'DeployScreen does not render a textual list grouping available zones, helipads, and insertion points outside the canvas.',
  );

  const mobileParityHooksPresent = /@media \(max-width: 960px\)/.test(deployCss?.text ?? '')
    && /@media \(pointer: coarse\)/.test(deployCss?.text ?? '')
    && /respawn-side-scroll/.test(mobileCheck?.text ?? '')
    && /Deploy primary action/.test(mobileCheck?.text ?? '');
  addCheck(
    checks,
    'mobile-parity-hooks',
    mobileParityHooksPresent ? 'PASS' : 'WARN',
    deployCss,
    /@media \(max-width: 960px\)|@media \(pointer: coarse\)/,
    mobileParityHooksPresent
      ? 'Deploy screen has responsive CSS hooks and mobile-ui gate coverage for deploy scrolling and primary action.'
      : 'PC/mobile parity hooks or mobile deploy gate coverage are incomplete.',
  );

  const decisionSpeedInstrumentation = /death to respawn|decision time|time from death|decision-speed|deathToDecision|decisionStartedAtMs|recordDecisionTime|performance\.mark/i.test(
    `${deploy?.text ?? ''}\n${session?.text ?? ''}\n${mobileCheck?.text ?? ''}`,
  );
  addCheck(
    checks,
    'decision-speed-instrumentation',
    decisionSpeedInstrumentation ? 'PASS' : 'WARN',
    deploy,
    /decisionStartedAtMs|recordDecisionTime|Decision time/i,
    decisionSpeedInstrumentation
      ? 'A decision-speed metric or marker exists for death-to-respawn decision time.'
      : 'No death-to-respawn decision-speed metric or marker was found.',
  );

  const artDirectionProcedurePresent = /looks right/.test(artGate?.text ?? '')
    && /Reviewer decision/.test(artGate?.text ?? '');
  addCheck(
    checks,
    'art-direction-procedure',
    artDirectionProcedurePresent ? 'PASS' : 'FAIL',
    artGate,
    /Reviewer decision|looks right/,
    artDirectionProcedurePresent
      ? 'KB-DIZAYN art-direction procedure exists and can be invoked for UX-1.'
      : 'KB-DIZAYN art-direction procedure is missing.',
  );

  const artDirectionSignoff = signedDizaynGate !== null;
  addCheck(
    checks,
    'art-direction-signoff',
    artDirectionSignoff ? 'PASS' : 'WARN',
    artGate,
    /UX-1|Respawn screen|signed/i,
    artDirectionSignoff
      ? 'A UX-1-specific art-direction signoff artifact is recorded.'
      : 'No UX-1-specific KB-DIZAYN art-direction signoff artifact is recorded.',
    signedDizaynGate ?? undefined,
  );

  const respawnTestsCoverSession = /should apply deploy-session copy to the UI/.test(respawnTest?.text ?? '')
    && /should render faction-aware preset metadata/.test(respawnTest?.text ?? '')
    && /should be enabled when timer is 0 AND selection made/.test(respawnTest?.text ?? '');
  addCheck(
    checks,
    'deploy-screen-tests',
    respawnTestsCoverSession ? 'PASS' : 'WARN',
    respawnTest,
    /should apply deploy-session copy to the UI|should render faction-aware preset metadata/,
    respawnTestsCoverSession
      ? 'DeployScreen tests cover session copy, faction-aware loadout metadata, and deploy-button readiness.'
      : 'DeployScreen tests do not cover the core UX-1 decision chain.',
  );

  const fail = countStatuses(checks, 'FAIL');
  const warn = countStatuses(checks, 'WARN');
  const pass = countStatuses(checks, 'PASS');
  const acceptanceReady = fail === 0
    && warn === 0
    && deployScreenPresent
    && spawnPointClassesPresent
    && mapColorCodesSpawnKinds
    && mapLabelsSpawnKinds
    && mobileParityHooksPresent;
  const status: AuditStatus = fail > 0 ? 'fail' : warn > 0 ? 'warn' : 'pass';
  const outDir = outputDir();
  const summaryPath = join(outDir, 'ux-respawn-audit.json');
  const markdownPath = join(outDir, 'ux-respawn-audit.md');

  const gaps = checks
    .filter((check) => check.status !== 'PASS')
    .map((check) => `${check.id}: ${check.summary}`);

  const report: UxRespawnAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-ux-respawn-audit',
    status,
    directive: 'UX-1',
    inputs: {
      files: SOURCE_PATHS,
    },
    summary: {
      filesScanned: SOURCE_PATHS.length,
      pass,
      warn,
      fail,
      deployScreenPresent,
      spawnPointClassesPresent,
      mapColorCodesSpawnKinds,
      mapLabelsSpawnKinds,
      mobileParityHooksPresent,
      acceptanceReady,
    },
    checks,
    currentContract: [
      'DeployScreen owns the respawn/deploy surface under #respawn-ui.',
      'DeployFlowSession supplies mode-specific deploy, insertion, and respawn copy.',
      'SpawnPointSelector can produce home-base, controlled-zone, helipad, and direct-insertion spawn points.',
      'RespawnMapController forwards spawn points to OpenFrontierRespawnMap and focuses them.',
      'DeployScreen exposes alliance, grouped textual spawn options, selected-spawn metadata, and decision-time instrumentation.',
      'OpenFrontierRespawnMapRenderer draws spawn markers with separate helipad and direct-insertion color paths and visible class labels.',
      'RespawnUI and PlayerRespawnManager tests cover loadout metadata, grouped spawn options, helipad fallback, direct insertion, spawn-option selection, and deploy-button readiness.',
    ],
    gaps,
    nextActions: acceptanceReady
      ? [
          'Pair signed local UX-1 visual evidence with live production parity or explicit Politburo deferral before closing UX-1.',
          'Keep browser runtime proof attached for death-to-decision timing and PC/mobile parity.',
        ]
      : [
          'Run a PC/mobile browser proof for the respawn decision surface and attach screenshots to the UX-1 evidence chain.',
          'Invoke KB-DIZAYN visual signoff with the browser proof before declaring UX-1 complete.',
        ],
    nonClaims: [
      'This packet is a source/test audit and only records KB-DIZAYN visual signoff when a signed gate artifact exists.',
      'This packet does not prove final mobile touch ergonomics in a live browser.',
      'This packet does not prove production deployment parity.',
      'This packet does not close UX-2, UX-3, or UX-4.',
    ],
    files: {
      summary: rel(summaryPath),
      markdown: rel(markdownPath),
    },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, makeMarkdown(report), 'utf-8');

  console.log(`Projekt 143 UX respawn audit ${status.toUpperCase()}: ${report.files.summary}`);
  console.log(`checks=${pass} pass, ${warn} warn, ${fail} fail acceptanceReady=${acceptanceReady}`);
  if (status === 'fail') process.exit(1);
}

try {
  main();
} catch (error) {
  console.error('projekt-143-ux-respawn-audit failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
