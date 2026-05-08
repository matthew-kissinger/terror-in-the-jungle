#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CombatPhaseReport {
  createdAt?: string;
  sourceGitSha?: string;
  classification?: {
    combatPhaseOwner?: string;
    confidence?: string;
  };
  inputs?: {
    artifactDir?: string;
    summary?: string;
    runtimeSamples?: string;
  };
  sourceSummary?: {
    validation?: string | null;
    measurementTrust?: string | null;
  };
  windows?: Array<{
    name?: string;
    avgFrameMs?: number | null;
    renderer?: {
      drawCalls?: number | null;
    };
    engagement?: {
      nearestOpforDistance?: number | null;
      currentTargetDistance?: number | null;
    };
    counters?: Record<string, { delta?: number | null }>;
  }>;
  correlations?: Array<{
    metric?: string;
    value?: number | null;
  }>;
}

interface SourceAnchorSpec {
  id: string;
  path: string;
  patterns: string[];
}

interface SourceAnchor {
  id: string;
  path: string;
  present: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface TestAnchor {
  path: string;
  present: boolean;
  anchors: Array<{
    pattern: string;
    line: number | null;
    text: string | null;
  }>;
}

interface CloseEngagementSourceAudit {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-close-engagement-source-audit';
  status: CheckStatus;
  inputs: {
    combatPhaseSidecar: string;
    sourceArtifactDir: string | null;
    sourceSummary: string | null;
    runtimeSamples: string | null;
  };
  telemetry: {
    classification: string | null;
    confidence: string | null;
    validation: string | null;
    measurementTrust: string | null;
    windowFacts: string[];
    correlations: Record<string, number | null>;
  };
  sourceAnchors: SourceAnchor[];
  testAnchors: TestAnchor[];
  ownerRank: Array<{
    owner: string;
    source: string;
    rank: number;
    rationale: string;
    requiredNextEvidence: string;
  }>;
  findings: string[];
  nextActions: string[];
  nonClaims: string[];
  files: {
    summary: string;
    markdown: string;
  };
}

const OUTPUT_NAME = 'projekt-143-close-engagement-source-audit';
const DEFAULT_COMBAT_PHASE_SIDECAR = join(
  process.cwd(),
  'artifacts',
  'perf',
  '2026-05-07T07-27-02-293Z',
  'projekt-143-combat-phase-attribution',
  'combat-phase-attribution.json',
);

const SOURCE_SPECS: SourceAnchorSpec[] = [
  {
    id: 'combatant_ai_dispatch_and_state_timing',
    path: 'src/systems/combat/CombatantAI.ts',
    patterns: [
      'case CombatantState.ENGAGING:',
      'this.engageHandler.handleEngaging(',
      'this.aiStateMs[key] =',
      'getFrameStateProfile()',
      'clearLOSCache(): void',
    ],
  },
  {
    id: 'engage_close_range_and_visibility_ladder',
    path: 'src/systems/combat/ai/AIStateEngage.ts',
    patterns: [
      'const CLOSE_RANGE_DISTANCE = 15',
      'if (targetDistance < CLOSE_RANGE_DISTANCE)',
      'const nearbyEnemyCount = countNearbyEnemies(',
      'if (!canSeeTarget(combatant, target, playerPosition))',
      'combatant.state = CombatantState.SUPPRESSING',
    ],
  },
  {
    id: 'targeting_facade',
    path: 'src/systems/combat/ai/AITargeting.ts',
    patterns: [
      'findNearestEnemy(',
      'canSeeTarget(',
      'countNearbyEnemies(',
      'return this.targetAcquisition.countNearbyEnemies(',
      'return this.lineOfSight.canSeeTarget(',
    ],
  },
  {
    id: 'target_acquisition_and_distribution',
    path: 'src/systems/combat/ai/AITargetAcquisition.ts',
    patterns: [
      'findNearestEnemy(',
      'clusterManager.assignDistributedTarget(',
      'shouldEngage(combatant: Combatant, distance: number)',
      'countNearbyEnemies(',
      'private getNearbyIds(',
    ],
  },
  {
    id: 'line_of_sight_miss_path',
    path: 'src/systems/combat/ai/AILineOfSight.ts',
    patterns: [
      'const LOS_CACHE_TTL_MS = 150',
      'canSeeTarget(',
      'AILineOfSight.cacheMisses++',
      'if (!tryConsumeRaycast())',
      'private evaluateFullLOS(',
    ],
  },
  {
    id: 'close_contact_target_distribution',
    path: 'src/systems/combat/ClusterManager.ts',
    patterns: [
      'assignDistributedTarget(',
      'const targeterPenalty = currentTargeters * 20',
      'const distanceScore = 150 - distance',
      'Math.random() * 10',
      'shouldSimplifyAI(clusterDensity: number)',
    ],
  },
];

const TEST_SPECS: SourceAnchorSpec[] = [
  {
    id: 'ai_state_engage_tests',
    path: 'src/systems/combat/ai/AIStateEngage.test.ts',
    patterns: [
      "it('switches to full-auto behavior at close range'",
      "it('goes full-auto when nearby enemies cross the threshold'",
      "it('transitions to SUPPRESSING when the target is not visible'",
    ],
  },
  {
    id: 'ai_target_acquisition_tests',
    path: 'src/systems/combat/ai/AITargetAcquisition.test.ts',
    patterns: [
      "it('reuses the widest cached spatial query for smaller same-frame checks'",
      "it('refreshes the cache when a later call needs a wider radius'",
    ],
  },
  {
    id: 'ai_line_of_sight_tests',
    path: 'src/systems/combat/ai/AILineOfSight.test.ts',
    patterns: [
      "it('rejects blocked LOS by heightfield without terrain raycast'",
      "it('passes heightfield and falls back to terrain raycast'",
      "it('does not double-raise player eye position for full LOS terrain raycasts'",
    ],
  },
  {
    id: 'cluster_manager_tests',
    path: 'src/systems/combat/ClusterManager.test.ts',
    patterns: [
      "it('should prefer closer targets'",
      "it('should prefer less-targeted enemies'",
      "it('should update target counts when assigning'",
    ],
  },
];

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] ?? null : null;
}

function findLine(lines: string[], pattern: string): { line: number | null; text: string | null } {
  const index = lines.findIndex((line) => line.includes(pattern));
  if (index < 0) return { line: null, text: null };
  return { line: index + 1, text: lines[index].trim() };
}

function collectSourceAnchors(specs: SourceAnchorSpec[]): SourceAnchor[] {
  return specs.map((spec) => {
    const absolute = join(process.cwd(), spec.path);
    const present = existsSync(absolute);
    const lines = present ? readFileSync(absolute, 'utf-8').split(/\r?\n/) : [];
    return {
      id: spec.id,
      path: spec.path,
      present,
      anchors: spec.patterns.map((pattern) => ({
        pattern,
        ...findLine(lines, pattern),
      })),
    };
  });
}

function collectTestAnchors(specs: SourceAnchorSpec[]): TestAnchor[] {
  return specs.map((spec) => {
    const absolute = join(process.cwd(), spec.path);
    const present = existsSync(absolute);
    const lines = present ? readFileSync(absolute, 'utf-8').split(/\r?\n/) : [];
    return {
      path: spec.path,
      present,
      anchors: spec.patterns.map((pattern) => ({
        pattern,
        ...findLine(lines, pattern),
      })),
    };
  });
}

function correlationMap(report: CombatPhaseReport): Record<string, number | null> {
  const output: Record<string, number | null> = {};
  for (const entry of report.correlations ?? []) {
    if (entry.metric) output[entry.metric] = entry.value ?? null;
  }
  return output;
}

function windowFacts(report: CombatPhaseReport): string[] {
  const early = report.windows?.find((window) => window.name === 'early');
  const late = report.windows?.find((window) => window.name === 'late');
  if (!early || !late) return ['Combat-phase sidecar has no early/late windows.'];
  return [
    `avgFrameMs ${early.avgFrameMs ?? 'n/a'} -> ${late.avgFrameMs ?? 'n/a'}`,
    `drawCalls ${early.renderer?.drawCalls ?? 'n/a'} -> ${late.renderer?.drawCalls ?? 'n/a'}`,
    `currentTargetDistance ${early.engagement?.currentTargetDistance ?? 'n/a'} -> ${late.engagement?.currentTargetDistance ?? 'n/a'}`,
    `nearestOpforDistance ${early.engagement?.nearestOpforDistance ?? 'n/a'} -> ${late.engagement?.nearestOpforDistance ?? 'n/a'}`,
    `shotsDelta ${early.counters?.shots?.delta ?? 'n/a'} -> ${late.counters?.shots?.delta ?? 'n/a'}`,
    `damageTakenDelta ${early.counters?.damageTaken?.delta ?? 'n/a'} -> ${late.counters?.damageTaken?.delta ?? 'n/a'}`,
    `npcMovementDelta ${early.counters?.npcMovementSamples?.delta ?? 'n/a'} -> ${late.counters?.npcMovementSamples?.delta ?? 'n/a'}`,
  ];
}

function markdownFor(report: CloseEngagementSourceAudit): string {
  const lines: string[] = [
    '# Projekt 143 Close-Engagement Source Audit',
    '',
    `- Status: ${report.status}`,
    `- Combat-phase sidecar: ${report.inputs.combatPhaseSidecar}`,
    `- Classification: ${report.telemetry.classification ?? 'n/a'}`,
    `- Confidence: ${report.telemetry.confidence ?? 'n/a'}`,
    `- Measurement trust: ${report.telemetry.measurementTrust ?? 'n/a'}`,
    '',
    '## Telemetry Facts',
    '',
    ...report.telemetry.windowFacts.map((fact) => `- ${fact}`),
    '',
    '## Ranked Owners',
    '',
    '| Rank | Owner | Source | Rationale | Required next evidence |',
    '|---:|---|---|---|---|',
    ...report.ownerRank.map((owner) => `| ${owner.rank} | ${owner.owner} | ${owner.source} | ${owner.rationale} | ${owner.requiredNextEvidence} |`),
    '',
    '## Source Anchors',
    '',
  ];

  for (const source of report.sourceAnchors) {
    lines.push(`### ${source.id}`, '');
    for (const anchor of source.anchors) {
      lines.push(`- ${source.path}:${anchor.line ?? 'missing'} - ${anchor.pattern}`);
    }
    lines.push('');
  }

  lines.push('## Test Anchors', '');
  for (const test of report.testAnchors) {
    lines.push(`### ${test.path}`, '');
    for (const anchor of test.anchors) {
      lines.push(`- ${anchor.line ?? 'missing'} - ${anchor.pattern}`);
    }
    lines.push('');
  }

  lines.push('## Findings', '', ...report.findings.map((finding) => `- ${finding}`));
  lines.push('', '## Next Actions', '', ...report.nextActions.map((action) => `- ${action}`));
  lines.push('', '## Non-Claims', '', ...report.nonClaims.map((claim) => `- ${claim}`));
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const combatPhasePath = resolve(argValue('--combat-phase') ?? DEFAULT_COMBAT_PHASE_SIDECAR);
  if (!existsSync(combatPhasePath)) {
    throw new Error(`Missing combat-phase sidecar: ${combatPhasePath}`);
  }

  const outputRoot = resolve(argValue('--output-root') ?? join(process.cwd(), 'artifacts', 'perf', timestampForPath()));
  const outputDir = join(outputRoot, OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'source-audit.json');
  const markdownPath = join(outputDir, 'source-audit.md');

  const combatPhase = readJson<CombatPhaseReport>(combatPhasePath);
  const correlations = correlationMap(combatPhase);
  const sourceAnchors = collectSourceAnchors(SOURCE_SPECS);
  const testAnchors = collectTestAnchors(TEST_SPECS);
  const sourceArtifactDir = combatPhase.inputs?.artifactDir ?? null;
  const sourceSummary = combatPhase.inputs?.summary ?? null;
  const runtimeSamples = combatPhase.inputs?.runtimeSamples ?? null;

  const report: CloseEngagementSourceAudit = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-close-engagement-source-audit',
    status: 'warn',
    inputs: {
      combatPhaseSidecar: rel(combatPhasePath) ?? combatPhasePath,
      sourceArtifactDir,
      sourceSummary,
      runtimeSamples,
    },
    telemetry: {
      classification: combatPhase.classification?.combatPhaseOwner ?? null,
      confidence: combatPhase.classification?.confidence ?? null,
      validation: combatPhase.sourceSummary?.validation ?? null,
      measurementTrust: combatPhase.sourceSummary?.measurementTrust ?? null,
      windowFacts: windowFacts(combatPhase),
      correlations: {
        shotsDelta: correlations.shots_delta_per_sample ?? null,
        damageTakenDelta: correlations.damage_taken_delta_per_sample ?? null,
        currentTargetDistance: correlations.current_target_distance ?? null,
        nearestOpforDistance: correlations.nearest_opfor_distance ?? null,
        npcMovementDelta: correlations.npc_movement_delta_per_sample ?? null,
        rendererDrawCalls: correlations.renderer_draw_calls ?? null,
      },
    },
    sourceAnchors,
    testAnchors,
    ownerRank: [
      {
        rank: 1,
        owner: 'close range engage ladder',
        source: 'src/systems/combat/ai/AIStateEngage.ts',
        rationale: 'Close target distance and shot cadence track frame cost; this ladder owns close-range full-auto, nearby-enemy burst, suppression transition, and cover/suppression routing.',
        requiredNextEvidence: 'Runtime counters for close-range full-auto activations, nearby-enemy burst triggers, and suppressing transitions in the next trusted combat120 capture.',
      },
      {
        rank: 2,
        owner: 'LOS miss path',
        source: 'src/systems/combat/ai/AILineOfSight.ts',
        rationale: 'LOS miss delta has positive correlation with frame cost while clear LOS hits are negative; miss/raycast path needs source-level counters before tuning.',
        requiredNextEvidence: 'Per-frame LOS miss, cache-hit, budget-denial, prefilter, and full-raycast counters tied to Combat runtime samples.',
      },
      {
        rank: 3,
        owner: 'target acquisition and close-contact distribution',
        source: 'src/systems/combat/ai/AITargetAcquisition.ts + src/systems/combat/ClusterManager.ts',
        rationale: 'Close-contact density tracks frame cost and the acquisition path owns nearest-target selection, nearby-enemy counts, cluster target distribution, and nondeterministic distribution jitter.',
        requiredNextEvidence: 'Counters for potential target count, cluster distribution calls, targeter counts, and reassignment churn during late combat windows.',
      },
    ],
    findings: [
      'The source owners line up with the combat-phase packet: close-contact AI paths own target distance, shot cadence, incoming damage, LOS misses, and target distribution.',
      'Existing tests cover close full-auto, nearby-enemy burst, suppression transition, LOS heightfield prefilter, and target distribution primitives.',
      'Existing tests do not prove perf ownership for close-contact combat120; the next runtime packet needs counters, not another broad cap.',
    ],
    nextActions: [
      'Add narrow runtime counters in CombatantAI or AIStateEngage for close-range full-auto activations, nearby-enemy burst triggers, suppression transitions, and close-contact target distance buckets.',
      'Add LOS miss/full-raycast/cache counters to runtime samples so the next combat120 capture can separate LOS miss pressure from engagement ladder pressure.',
      'Keep renderer, terrain stream, and visual-cap changes out of the next DEFEKT-3 action unless the counter packet reverses this source-owner audit.',
    ],
    nonClaims: [
      'This sidecar does not prove a runtime fix.',
      'This sidecar does not authorize a perf baseline refresh.',
      'This sidecar does not change production behavior.',
    ],
    files: {
      summary: rel(jsonPath) ?? jsonPath,
      markdown: rel(markdownPath) ?? markdownPath,
    },
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, markdownFor(report));

  console.log(`Projekt 143 close-engagement source audit ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(`combatPhase=${report.inputs.combatPhaseSidecar}`);
  console.log(`classification=${report.telemetry.classification}/${report.telemetry.confidence}`);
  console.log(`topOwner=${report.ownerRank[0]?.source}`);
}

main();
