#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CompletionStatus = 'complete' | 'not_complete';
type RequirementStatus = 'pass' | 'partial' | 'blocked' | 'fail' | 'missing';

type CycleTargetStatus = 'evidence_complete' | 'ready_for_branch' | 'needs_decision' | 'needs_baseline' | 'blocked';

interface Cycle3Target {
  id?: string;
  bureau?: string;
  status?: CycleTargetStatus;
  summary?: string;
  evidence?: Record<string, unknown>;
}

interface Cycle3Report {
  createdAt?: string;
  sourceGitSha?: string;
  status?: string;
  inputs?: Record<string, string | null>;
  targets?: Cycle3Target[];
  openDecisions?: string[];
  recommendedOrder?: string[];
}

interface EvidenceSuiteReport {
  status?: string;
  steps?: Array<{ id?: string; ok?: boolean; artifactPath?: string | null }>;
}

interface TerrainAssetInventory {
  status?: string;
  summary?: {
    runtimeVegetationSpecies?: number;
    retiredVegetationSpecies?: number;
    blockedVegetationSpecies?: number;
    missingAssets?: number;
    pixelForgeGroundCoverCandidates?: number;
  };
}

interface PixelForgeBureauReport {
  status?: string;
  pixelForgeRootExists?: boolean;
  galleryManifest?: {
    totalEntries?: number;
    vegetationSpecies?: string[];
    runtimeSpeciesPresent?: string[];
    runtimeSpeciesMissing?: string[];
    retiredSpeciesPresent?: string[];
    blockedSpeciesPresent?: string[];
  };
  npcPackage?: {
    exists?: boolean;
    factionCount?: number | null;
    clipCount?: number | null;
    imposterCount?: number | null;
  };
  relevanceCatalog?: {
    propFamilies?: unknown[];
    vegetationPackages?: unknown[];
    queues?: unknown[];
  };
}

interface VegetationNormalProof {
  status?: string;
  files?: { contactSheet?: string };
  aggregate?: {
    expectedPairs?: number;
    capturedPairs?: number;
    maxMeanAbsRgbDelta?: number | null;
    maxAbsMeanLumaDeltaPercent?: number | null;
  };
}

interface GrenadeSummary {
  status?: string;
  measurementTrust?: { status?: string };
}

interface PromptChecklistItem {
  id: string;
  requirement: string;
  namedEvidence: string[];
  inspectedEvidence: Record<string, unknown>;
  status: RequirementStatus;
  coverage: string;
  missingOrWeak: string[];
  proxyWarning: string;
}

interface GitState {
  head: string;
  branchLine: string;
  shortStatus: string[];
  aheadOfOriginMaster: number | null;
  behindOriginMaster: number | null;
  dirty: boolean;
}

interface CompletionAuditReport {
  createdAt: string;
  mode: 'projekt-143-completion-audit';
  objective: string;
  concreteSuccessCriteria: string[];
  completionStatus: CompletionStatus;
  canMarkGoalComplete: boolean;
  sourceGitSha: string;
  git: GitState;
  inputs: Record<string, string | null>;
  promptToArtifactChecklist: PromptChecklistItem[];
  blockers: string[];
  nextRequiredActions: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-completion-audit';

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitOutput(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gitState(): GitState {
  const head = gitOutput(['rev-parse', 'HEAD']);
  const statusLines = gitOutput(['status', '--short', '--branch']).split(/\r?\n/).filter(Boolean);
  let aheadOfOriginMaster: number | null = null;
  let behindOriginMaster: number | null = null;
  try {
    const [behindText, aheadText] = gitOutput(['rev-list', '--left-right', '--count', 'origin/master...HEAD']).split(/\s+/);
    behindOriginMaster = Number.parseInt(behindText, 10);
    aheadOfOriginMaster = Number.parseInt(aheadText, 10);
  } catch {
    aheadOfOriginMaster = null;
    behindOriginMaster = null;
  }

  return {
    head,
    branchLine: statusLines[0] ?? '',
    shortStatus: statusLines.slice(1),
    aheadOfOriginMaster,
    behindOriginMaster,
    dirty: statusLines.slice(1).length > 0,
  };
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matches = files.filter(predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function target(report: Cycle3Report | null, id: string): Cycle3Target | null {
  return report?.targets?.find((entry) => entry.id === id) ?? null;
}

function targetStatus(report: Cycle3Report | null, id: string): string | null {
  return target(report, id)?.status ?? null;
}

function inputExists(path: string | null): boolean {
  return Boolean(path && existsSync(path));
}

function addItem(items: PromptChecklistItem[], item: PromptChecklistItem): void {
  items.push(item);
}

function statusBlocksCompletion(status: RequirementStatus): boolean {
  return status !== 'pass';
}

function writeMarkdown(report: CompletionAuditReport, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Completion Audit',
    '',
    `Generated: ${report.createdAt}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Completion status: ${report.completionStatus.toUpperCase()}`,
    `Can mark goal complete: ${report.canMarkGoalComplete ? 'yes' : 'no'}`,
    '',
    '## Objective',
    '',
    report.objective,
    '',
    '## Concrete Success Criteria',
    '',
    ...report.concreteSuccessCriteria.map((criterion) => `- ${criterion}`),
    '',
    '## Git State',
    '',
    `- Branch/status: ${report.git.branchLine}`,
    `- Dirty: ${report.git.dirty}`,
    `- Ahead origin/master: ${report.git.aheadOfOriginMaster ?? 'unknown'}`,
    `- Behind origin/master: ${report.git.behindOriginMaster ?? 'unknown'}`,
    '',
    '## Checklist',
    '',
    '| Status | Requirement | Evidence | Missing / Weak |',
    '| --- | --- | --- | --- |',
    ...report.promptToArtifactChecklist.map((item) => {
      const evidence = item.namedEvidence.length > 0 ? item.namedEvidence.join('<br>') : 'none';
      const missing = item.missingOrWeak.length > 0 ? item.missingOrWeak.join('<br>') : 'none';
      return `| ${item.status} | ${item.requirement} | ${evidence} | ${missing} |`;
    }),
    '',
    '## Blockers',
    '',
    ...report.blockers.map((blocker) => `- ${blocker}`),
    '',
    '## Next Required Actions',
    '',
    ...report.nextRequiredActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

function buildReport(): CompletionAuditReport {
  const files = walkFiles(ARTIFACT_ROOT, () => true);
  const cycle3Path = latestFile(files, (path) => path.endsWith(join('projekt-143-cycle3-kickoff', 'cycle3-kickoff-summary.json')));
  const suitePath = latestFile(files, (path) => path.endsWith(join('projekt-143-evidence-suite', 'suite-summary.json')));
  const terrainInventoryPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-asset-inventory', 'terrain-asset-inventory.json')));
  const pixelForgePath = latestFile(files, (path) => path.endsWith(join('projekt-143-pixel-forge-bureau', 'pixel-forge-bureau.json')));
  const vegetationNormalProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-normal-proof', 'summary.json')));
  const grenadePath = latestFile(files, (path) => path.includes('grenade-spike-') && path.endsWith('summary.json'));
  const optikDecisionPath = latestFile(files, (path) => path.endsWith(join('projekt-143-optik-decision-packet', 'decision-packet.json')));
  const terrainBaselinePath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-horizon-baseline', 'summary.json')));
  const cullingBaselinePath = latestFile(files, (path) => path.endsWith(join('projekt-143-culling-owner-baseline', 'summary.json')));

  const cycle3 = readJson<Cycle3Report>(cycle3Path);
  const suite = readJson<EvidenceSuiteReport>(suitePath);
  const terrainInventory = readJson<TerrainAssetInventory>(terrainInventoryPath);
  const pixelForge = readJson<PixelForgeBureauReport>(pixelForgePath);
  const vegetationNormalProof = readJson<VegetationNormalProof>(vegetationNormalProofPath);
  const grenade = readJson<GrenadeSummary>(grenadePath);
  const git = gitState();

  const inputs = {
    cycle3Kickoff: rel(cycle3Path),
    staticEvidenceSuite: rel(suitePath),
    terrainAssetInventory: rel(terrainInventoryPath),
    pixelForgeBureau: rel(pixelForgePath),
    vegetationNormalProof: rel(vegetationNormalProofPath),
    grenadeSpike: rel(grenadePath),
    optikDecisionPacket: rel(optikDecisionPath),
    terrainHorizonBaseline: rel(terrainBaselinePath),
    cullingOwnerBaseline: rel(cullingBaselinePath),
  };

  const items: PromptChecklistItem[] = [];
  const cycleStatuses = {
    optik: targetStatus(cycle3, 'npc-imposter-scale-luma-contract'),
    load: targetStatus(cycle3, 'pixel-forge-texture-upload-residency'),
    effects: targetStatus(cycle3, 'grenade-first-use-stall'),
    terrain: targetStatus(cycle3, 'large-mode-vegetation-horizon'),
    cull: targetStatus(cycle3, 'static-feature-and-vehicle-culling-hlod'),
  };

  addItem(items, {
    id: 'ledger-and-cycle-control',
    requirement: 'Projekt Objekt-143 has an authoritative current ledger and kickoff artifact that can drive completion decisions.',
    namedEvidence: [inputs.cycle3Kickoff, 'docs/PROJEKT_OBJEKT_143.md', 'docs/PROJEKT_OBJEKT_143_HANDOFF.md'].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      cycle3Status: cycle3?.status ?? null,
      cycle3CreatedAt: cycle3?.createdAt ?? null,
      targetStatuses: cycleStatuses,
      openDecisionCount: cycle3?.openDecisions?.length ?? null,
    },
    status: cycle3?.status === 'warn' ? 'partial' : cycle3?.status === 'pass' ? 'pass' : 'missing',
    coverage: 'The kickoff artifact summarizes current bureau readiness and open decisions.',
    missingOrWeak: cycle3?.status === 'warn' ? ['Kickoff is WARN, so it is explicitly not a completion certificate.'] : [],
    proxyWarning: 'A kickoff report is a routing artifact; completion still requires every bureau and release gate to be closed.',
  });

  addItem(items, {
    id: 'static-evidence-suite',
    requirement: 'The static Projekt Objekt-143 evidence suite is wired and green.',
    namedEvidence: [inputs.staticEvidenceSuite].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      suiteStatus: suite?.status ?? null,
      steps: suite?.steps?.map((step) => ({ id: step.id, ok: step.ok, artifactPath: step.artifactPath })) ?? null,
    },
    status: suite?.status === 'pass' ? 'pass' : 'missing',
    coverage: 'Static audits for texture, imposter optics, vegetation horizon, and WebGPU strategy are wired.',
    missingOrWeak: suite?.status === 'pass' ? [] : ['Static evidence suite is missing or not pass.'],
    proxyWarning: 'This suite explicitly does not run headed perf probes or prove runtime remediation completion.',
  });

  addItem(items, {
    id: 'kb-optik-closeout',
    requirement: 'KB-OPTIK closes NPC imposter scale, luma, crop, and human-visible parity decisions.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.optikDecisionPacket].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.optik,
      summary: target(cycle3, 'npc-imposter-scale-luma-contract')?.summary ?? null,
      openDecisions: cycle3?.openDecisions ?? null,
    },
    status: cycleStatuses.optik === 'evidence_complete' ? 'pass' : cycleStatuses.optik === 'needs_decision' ? 'blocked' : 'partial',
    coverage: 'Matched scale/luma and runtime LOD-edge proof exist, but the current target status is still the controlling evidence.',
    missingOrWeak: cycleStatuses.optik === 'needs_decision'
      ? ['8.5m near-stress silhouette exception or human visual review remains undecided.']
      : [],
    proxyWarning: 'Runtime LOD-edge PASS is not the same as final visual acceptance while the near-stress decision remains open.',
  });

  addItem(items, {
    id: 'kb-load-closeout',
    requirement: 'KB-LOAD closes startup stall and Pixel Forge texture upload/residency work without visual regression.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.vegetationNormalProof].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.load,
      vegetationNormalProofStatus: vegetationNormalProof?.status ?? null,
      expectedPairs: vegetationNormalProof?.aggregate?.expectedPairs ?? null,
      capturedPairs: vegetationNormalProof?.aggregate?.capturedPairs ?? null,
      contactSheet: vegetationNormalProof?.files?.contactSheet ?? null,
    },
    status: cycleStatuses.load === 'evidence_complete' ? 'pass' : 'partial',
    coverage: 'Startup/upload baselines and a no-normal visual proof path exist.',
    missingOrWeak: [
      'Target is ready_for_branch, not evidence_complete.',
      'Vegetation normal-map removal remains WARN until human visual review accepts the contact sheet.',
      'Long startup latency remains attributed but not closed.',
    ],
    proxyWarning: 'Improved candidate timings do not prove acceptance without matched visual review and default-runtime policy change.',
  });

  addItem(items, {
    id: 'kb-effects-closeout',
    requirement: 'KB-EFFECTS closes grenade first-use stall for the scoped runtime path.',
    namedEvidence: [inputs.grenadeSpike].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.effects,
      grenadeStatus: grenade?.status ?? null,
      measurementTrust: grenade?.measurementTrust?.status ?? null,
    },
    status: cycleStatuses.effects === 'evidence_complete' && grenade?.measurementTrust?.status === 'pass' ? 'pass' : 'partial',
    coverage: 'Low-load grenade first-use path has trusted evidence.',
    missingOrWeak: cycleStatuses.effects === 'evidence_complete'
      ? []
      : ['Grenade target is not evidence_complete in the latest kickoff.'],
    proxyWarning: 'This does not certify grenade behavior under broad combat120 stress or future visual effect changes.',
  });

  addItem(items, {
    id: 'kb-terrain-closeout',
    requirement: 'KB-TERRAIN closes far vegetation horizon, terrain readability, A Shau route/placement quality, and ground-cover direction.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.terrainHorizonBaseline, inputs.terrainAssetInventory].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.terrain,
      terrainInventoryStatus: terrainInventory?.status ?? null,
      inventorySummary: terrainInventory?.summary ?? null,
    },
    status: cycleStatuses.terrain === 'evidence_complete' ? 'pass' : 'partial',
    coverage: 'Baseline, route, placement, distribution, and asset-inventory evidence exist.',
    missingOrWeak: [
      'Target is ready_for_branch, not evidence_complete.',
      'A Shau remains unsigned due to terrain-stall/backtracking notes.',
      'Far-horizon canopy/outer vegetation acceptance is not closed.',
      'Ground-cover replacements are cataloged but not accepted runtime imports.',
    ],
    proxyWarning: 'A terrain asset inventory proves candidates and missing files, not visual/runtime acceptance.',
  });

  addItem(items, {
    id: 'kb-cull-closeout',
    requirement: 'KB-CULL closes static feature, vehicle, HLOD, culling, and pool-residency decisions with representative before/after evidence.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.cullingOwnerBaseline].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.cull,
      targetSummary: target(cycle3, 'static-feature-and-vehicle-culling-hlod')?.summary ?? null,
    },
    status: cycleStatuses.cull === 'evidence_complete' ? 'pass' : 'partial',
    coverage: 'Owner-path baselines and layer-specific culling evidence exist.',
    missingOrWeak: [
      'Target is ready_for_branch, not evidence_complete.',
      'Existing evidence covers selected layers only, not broad culling/HLOD acceptance.',
      'Close-NPC pool residency remains diagnostic-only until combat stress trust passes.',
    ],
    proxyWarning: 'Deterministic category proof and static batching evidence are not broad gameplay culling certification.',
  });

  addItem(items, {
    id: 'kb-forge-and-asset-pipeline',
    requirement: 'KB-FORGE folds the local Pixel Forge repo into Projekt as a relevance/catalog pipeline for TIJ assets.',
    namedEvidence: [inputs.pixelForgeBureau, 'docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md'].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: pixelForge?.status ?? null,
      pixelForgeRootExists: pixelForge?.pixelForgeRootExists ?? null,
      manifestEntries: pixelForge?.galleryManifest?.totalEntries ?? null,
      vegetationEntries: pixelForge?.galleryManifest?.vegetationSpecies?.length ?? null,
      runtimeMissing: pixelForge?.galleryManifest?.runtimeSpeciesMissing ?? null,
      retiredPresent: pixelForge?.galleryManifest?.retiredSpeciesPresent ?? null,
      blockedPresent: pixelForge?.galleryManifest?.blockedSpeciesPresent ?? null,
      queues: pixelForge?.relevanceCatalog?.queues?.length ?? null,
      propFamilies: pixelForge?.relevanceCatalog?.propFamilies?.length ?? null,
      vegetationPackages: pixelForge?.relevanceCatalog?.vegetationPackages?.length ?? null,
      npcPackage: pixelForge?.npcPackage ?? null,
    },
    status: pixelForge?.status === 'pass' ? 'pass' : pixelForge?.pixelForgeRootExists ? 'partial' : 'missing',
    coverage: 'The sibling Pixel Forge repo is present and cataloged for TIJ pipeline relevance.',
    missingOrWeak: pixelForge?.status === 'pass'
      ? []
      : [
        'Audit remains WARN because the local Pixel Forge pipeline/catalog surface is incomplete or stale.',
        'No Pixel Forge output is accepted for runtime by this catalog.',
      ],
    proxyWarning: 'Local pipeline availability and a relevance catalog are not production asset acceptance.',
  });

  addItem(items, {
    id: 'owner-vegetation-specifics',
    requirement: 'Owner-directed vegetation changes are honored: remove the small palm, preserve taller palm-like trees, and redirect budget toward grass/ground cover/trails.',
    namedEvidence: [
      inputs.terrainAssetInventory,
      inputs.pixelForgeBureau,
      'src/config/vegetationTypes.ts',
      'src/config/vegetationTypes.test.ts',
      'src/config/biomes.ts',
    ].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      runtimeSpecies: pixelForge?.galleryManifest?.runtimeSpeciesPresent ?? null,
      retiredSpecies: pixelForge?.galleryManifest?.retiredSpeciesPresent ?? null,
      terrainInventorySummary: terrainInventory?.summary ?? null,
    },
    status: terrainInventory?.summary?.missingAssets === 0 && pixelForge?.galleryManifest?.runtimeSpeciesMissing?.length === 0 ? 'pass' : 'fail',
    coverage: 'Runtime inventory and config evidence records giantPalm retired, fanPalm/coconut preserved, and approved ground-cover runtime species fern/elephantEar with density and scale coverage.',
    missingOrWeak: terrainInventory?.summary?.missingAssets === 0 && pixelForge?.galleryManifest?.runtimeSpeciesMissing?.length === 0
      ? []
      : ['Runtime vegetation inventory is missing assets or approved species.'],
    proxyWarning: 'This closes the owner-specific small-palm/ground-cover request, not the broader KB-TERRAIN trail, far-horizon, or A Shau acceptance work.',
  });

  addItem(items, {
    id: 'validation-and-release',
    requirement: 'The complete Projekt state is validated, committed, pushed, deployed, and live production parity is verified.',
    namedEvidence: ['git status --short --branch', 'origin/master', 'live /asset-manifest.json'].filter(Boolean),
    inspectedEvidence: {
      branchLine: git.branchLine,
      dirty: git.dirty,
      shortStatus: git.shortStatus,
      aheadOfOriginMaster: git.aheadOfOriginMaster,
      behindOriginMaster: git.behindOriginMaster,
    },
    status: !git.dirty && git.aheadOfOriginMaster === 0 ? 'partial' : 'fail',
    coverage: 'Local git state is inspected directly.',
    missingOrWeak: [
      git.dirty ? 'Working tree has uncommitted changes.' : '',
      git.aheadOfOriginMaster && git.aheadOfOriginMaster > 0 ? `Local master is ahead of origin/master by ${git.aheadOfOriginMaster} commits.` : '',
      'No fresh push, CI, manual deploy, live manifest, service-worker, R2 DEM, or browser smoke evidence for the current local state is present in this audit.',
    ].filter(Boolean),
    proxyWarning: 'Local validation or passing artifact checks do not prove production parity.',
  });

  const blockers = items
    .filter((item) => statusBlocksCompletion(item.status))
    .map((item) => `${item.id}: ${item.missingOrWeak[0] ?? item.coverage}`);

  const nextRequiredActions = [
    'Resolve KB-OPTIK near-stress visual decision or explicitly switch the next remediation slot.',
    'Choose and execute one KB-LOAD branch with accepted visual proof, or leave normal maps/default policy unchanged.',
    'Execute KB-TERRAIN far-horizon/A Shau/ground-cover acceptance work with matched screenshots and perf captures.',
    'Execute KB-CULL representative owner-path work until broad culling/HLOD claims have real before/after evidence.',
    'Refresh Pixel Forge review manifest so retired/blocked states align with TIJ policy before importing any new assets.',
    'Commit the current local stack, push, run required CI/deploy, and verify live production state before any release-complete claim.',
  ];

  return {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-completion-audit',
    objective: 'Complete Projekt Objekt-143: close the recovery program opened for startup stalls, frame-time regressions, imposter visual mismatches, vegetation horizon loss, grenade spikes, profiler trust, culling/HLOD, terrain/A Shau quality, Pixel Forge asset-pipeline relevance, and release parity.',
    concreteSuccessCriteria: [
      'Every named bureau target is either evidence_complete or has an explicit owner-accepted exception recorded in the ledger.',
      'The prompt-to-artifact checklist maps each requirement to real files, command output, or current git/deploy evidence.',
      'Static suites, runtime probes, visual proofs, and perf captures cover the actual requirements they are used to claim.',
      'No proxy signal is treated as sufficient when the underlying requirement is visual, performance, deploy, or human-review dependent.',
      'The local repo is clean, pushed, CI-verified, manually deployed when required, and live Pages production is verified against the shipped SHA.',
    ],
    completionStatus: blockers.length === 0 ? 'complete' : 'not_complete',
    canMarkGoalComplete: blockers.length === 0,
    sourceGitSha: git.head,
    git,
    inputs,
    promptToArtifactChecklist: items,
    blockers,
    nextRequiredActions,
    nonClaims: [
      'This audit does not fix the remaining bureaus.',
      'This audit does not accept vegetation normal-map removal.',
      'This audit does not accept any Pixel Forge candidate for runtime.',
      'This audit does not claim production parity for the unpushed local stack.',
    ],
  };
}

function main(): void {
  const report = buildReport();
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'completion-audit.json');
  const markdownFile = join(outputDir, 'completion-audit.md');
  writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeMarkdown(report, markdownFile);

  console.log(`Projekt 143 completion audit ${report.completionStatus.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const item of report.promptToArtifactChecklist) {
    console.log(`- ${item.status.toUpperCase()} ${item.id}: ${item.requirement}`);
  }
  if (report.completionStatus !== 'complete') {
    console.log('Blockers:');
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (process.argv.includes('--strict') && report.completionStatus !== 'complete') {
    process.exitCode = 1;
  }
}

main();
