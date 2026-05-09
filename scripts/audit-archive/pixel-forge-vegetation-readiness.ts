#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PIXEL_FORGE_VEGETATION_ASSETS } from '../src/config/pixelForgeAssets';

type CheckStatus = 'pass' | 'warn' | 'fail';
type BranchExecutionState =
  | 'ready_for_candidate_generation'
  | 'needs_pixel_forge_profile_patch'
  | 'blocked_missing_pixel_forge'
  | 'blocked_missing_inputs';

interface LoadBranchSelector {
  status?: string;
  selectedBranch?: string;
  selectedBranchSummary?: string;
  inputs?: Record<string, string | null>;
  inspectedEvidence?: {
    activeVegetationAtlasCandidates?: Array<{
      species?: string;
      files?: string[];
      currentEstimatedMipmappedMiB?: number;
      candidateEstimatedMipmappedMiB?: number;
      estimatedSavingsMiB?: number;
    }>;
    vegetationCandidatesOnly?: {
      estimatedSavingsMiB?: number;
    } | null;
  };
}

interface TextureAuditEntry {
  name?: string;
  file?: string;
  kind?: string;
  width?: number;
  height?: number;
  atlasTileSize?: number | null;
  estimatedMipmappedMiB?: number;
  remediationCandidate?: {
    action?: string;
    targetWidth?: number;
    targetHeight?: number;
    targetTileSize?: number | null;
    targetEstimatedMipmappedMiB?: number;
    estimatedMipmappedMiBSaved?: number;
  } | null;
}

interface TextureAudit {
  createdAt?: string;
  entries?: TextureAuditEntry[];
}

interface GalleryManifestEntry {
  kind?: string;
  id?: string;
  meta?: Record<string, unknown>;
}

interface GalleryManifest {
  generatedAt?: string;
  counts?: Record<string, number>;
  entries?: GalleryManifestEntry[];
}

interface PixelForgePackageJson {
  scripts?: Record<string, string>;
}

interface SelectedAtlasCandidate {
  species: string;
  variant: string;
  runtimeColorFile: string;
  runtimeNormalFile: string;
  targetWidth: number | null;
  targetHeight: number | null;
  targetTileSize: number | null;
  currentWidth: number | null;
  currentHeight: number | null;
  currentTileSize: number | null;
  currentEstimatedMipmappedMiB: number;
  targetEstimatedMipmappedMiB: number;
  estimatedSavingsMiB: number;
  pixelForge: {
    manifestEntryPresent: boolean;
    manifestVariantPresent: boolean;
    productionStatus: string | null;
    manifestTileSize: number | null;
    manifestAngles: number | null;
    manifestAtlasProfile: string | null;
    manifestShaderProfile: string | null;
    sourceGlb: string | null;
    sourceGlbExists: boolean;
    outputModel: string | null;
    outputModelExists: boolean;
    outputColorAtlas: string | null;
    outputColorAtlasExists: boolean;
    outputNormalAtlas: string | null;
    outputNormalAtlasExists: boolean;
    outputMeta: string | null;
    outputMetaExists: boolean;
    outputMetaTileSize: number | null;
    outputMetaNormalSpace: string | null;
    outputMetaAuxLayers: string[];
    normalContractPresent: boolean;
    candidateOutputAlreadyAtTarget: boolean;
  };
  readiness: 'ready' | 'ready_for_candidate_generation' | 'needs_profile_patch' | 'blocked';
  issues: string[];
}

interface PixelForgeVegetationReadinessReport {
  createdAt: string;
  sourceGitSha: string;
  workingTreeDirty: boolean;
  pixelForgeSourceGitSha: string | null;
  pixelForgeWorkingTreeDirty: boolean | null;
  source: 'projekt-143-pixel-forge-vegetation-readiness';
  status: CheckStatus;
  branchExecutionState: BranchExecutionState;
  selectedBranch: string | null;
  inputs: {
    loadBranchSelector: string | null;
    textureAudit: string | null;
    pixelForgeRoot: string;
    pixelForgePackageJson: string | null;
    pixelForgePipelineRunner: string | null;
    pixelForgeVegetationValidator: string | null;
    pixelForgeGalleryManifest: string | null;
  };
  commandSurface: {
    tijPipelineCommand: string | null;
    tijCandidatePipelineCommand: string | null;
    tijVegetationValidateCommand: string | null;
    tijCandidateVegetationValidateCommand: string | null;
    supportsVegetationOnlyPipeline: boolean;
    pipelineBakesNormalAuxLayer: boolean;
    pipelineUsesComboTileSize: boolean;
    candidateTileOverrideDetected: boolean;
    candidateOutputRootDetected: boolean;
    candidateGenerationProfileSupported: boolean;
    recommendation: string;
  };
  summary: {
    selectedSpecies: string[];
    selectedVariants: string[];
    candidateCount: number;
    candidatesReady: number;
    candidatesReadyForGeneration: number;
    candidatesNeedingProfilePatch: number;
    candidatesBlocked: number;
    normalPairsRetained: boolean;
    targetTileSize: number | null;
    targetAtlasSize: string | null;
    currentEstimatedMipmappedMiB: number;
    targetEstimatedMipmappedMiB: number;
    estimatedSavingsMiB: number;
    candidateOutputProfileSupported: boolean;
  };
  selectedCandidates: SelectedAtlasCandidate[];
  findings: string[];
  requiredNextActions: string[];
  proofAfterGeneration: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-pixel-forge-vegetation-readiness';
const SELECTED_BRANCH = 'vegetation-atlas-regeneration-retain-normals';
const PIXEL_FORGE_ROOT = resolve(process.env.PIXEL_FORGE_ROOT ?? join(process.cwd(), '..', 'pixel-forge'));

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function isWorkingTreeDirty(): boolean {
  return execFileSync('git', ['status', '--short'], { encoding: 'utf-8' }).trim().length > 0;
}

function gitShaAt(cwd: string): string | null {
  if (!existsSync(cwd)) return null;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

function isWorkingTreeDirtyAt(cwd: string): boolean | null {
  if (!existsSync(cwd)) return null;
  try {
    return execFileSync('git', ['status', '--short'], { cwd, encoding: 'utf-8' }).trim().length > 0;
  } catch {
    return null;
  }
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const pending = [root];
  const files: string[] = [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        pending.push(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matching = files.filter(predicate);
  matching.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matching[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function readText(path: string | null): string {
  return path && existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function resolvePixelForgePath(path: string | null): string | null {
  if (!path) return null;
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')
    ? path
    : join(PIXEL_FORGE_ROOT, path);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function roundMetric(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function variantFromRuntimeFile(file: string): string | null {
  const match = file.replaceAll('\\', '/').match(/pixel-forge\/vegetation\/[^/]+\/([^/]+)\//);
  return match?.[1] ?? null;
}

function textureEntryFor(entries: TextureAuditEntry[], file: string, kind: string): TextureAuditEntry | null {
  return entries.find((entry) => entry.file === file && entry.kind === kind) ?? null;
}

function variantRecords(entry: GalleryManifestEntry | null): Array<Record<string, unknown>> {
  const variants = entry?.meta?.variants;
  return Array.isArray(variants) ? variants.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function outputMeta(pixelForgeRoot: string, relativeMetaPath: string | null): Record<string, unknown> | null {
  return readJson<Record<string, unknown>>(resolvePixelForgePath(relativeMetaPath)?.replace(PIXEL_FORGE_ROOT, pixelForgeRoot) ?? null);
}

function buildSelectedCandidates(
  selector: LoadBranchSelector | null,
  textureAudit: TextureAudit | null,
  manifest: GalleryManifest | null,
  candidateGenerationProfileSupported: boolean,
): SelectedAtlasCandidate[] {
  const textureEntries = textureAudit?.entries ?? [];
  const manifestEntries = manifest?.entries ?? [];
  const selectorCandidates = selector?.inspectedEvidence?.activeVegetationAtlasCandidates ?? [];
  const selectedSpecies = new Set(selectorCandidates.map((candidate) => candidate.species).filter((species): species is string => Boolean(species)));

  return PIXEL_FORGE_VEGETATION_ASSETS
    .filter((asset) => selectedSpecies.has(asset.id))
    .map((asset) => {
      const colorEntry = textureEntryFor(textureEntries, asset.colorFile, 'vegetation-color');
      const normalEntry = textureEntryFor(textureEntries, asset.normalFile, 'vegetation-normal');
      const manifestEntry = manifestEntries.find((entry) => entry.kind === 'vegetation' && entry.id === asset.id) ?? null;
      const variant = variantFromRuntimeFile(asset.colorFile) ?? asset.variant;
      const manifestVariant = variantRecords(manifestEntry).find((entry) => asString(entry.variant) === variant) ?? null;
      const metaPath = asString(manifestVariant?.imposterMeta);
      const meta = outputMeta(PIXEL_FORGE_ROOT, metaPath);
      const outputColorAtlas = asString(manifestVariant?.imposter);
      const outputNormalAtlas = asString(manifestVariant?.imposterNormal);
      const outputModel = asString(manifestVariant?.model);
      const sourceGlb = asString(manifestVariant?.src);
      const targetTileSize = colorEntry?.remediationCandidate?.targetTileSize ?? normalEntry?.remediationCandidate?.targetTileSize ?? null;
      const targetWidth = colorEntry?.remediationCandidate?.targetWidth ?? normalEntry?.remediationCandidate?.targetWidth ?? null;
      const targetHeight = colorEntry?.remediationCandidate?.targetHeight ?? normalEntry?.remediationCandidate?.targetHeight ?? null;
      const outputMetaAuxLayers = asStringArray(meta?.auxLayers);
      const outputMetaTileSize = asNumber(meta?.tileSize);
      const outputMetaNormalSpace = asString(meta?.normalSpace);
      const normalContractPresent = Boolean(
        outputNormalAtlas
          && existsSync(resolvePixelForgePath(outputNormalAtlas) ?? '')
          && outputMetaAuxLayers.includes('normal')
          && outputMetaNormalSpace === 'capture-view'
      );
      const candidateOutputAlreadyAtTarget = Boolean(
        targetTileSize
          && outputMetaTileSize === targetTileSize
          && asNumber(manifestEntry?.meta?.tileSize) === targetTileSize
      );
      const issues: string[] = [];

      if (!manifestEntry) issues.push('Pixel Forge gallery manifest has no vegetation entry for this runtime species.');
      if (!manifestVariant) issues.push('Pixel Forge gallery manifest has no selected runtime variant for this species.');
      if (!sourceGlb || !existsSync(sourceGlb)) issues.push('Selected source GLB is missing or not readable.');
      if (!outputColorAtlas || !existsSync(resolvePixelForgePath(outputColorAtlas) ?? '')) issues.push('Current Pixel Forge color imposter output is missing.');
      if (!normalContractPresent) issues.push('Current Pixel Forge normal-lit output contract is missing or incomplete.');
      if (!targetTileSize || !targetWidth || !targetHeight) issues.push('Texture-audit target dimensions are missing.');
      if (!candidateOutputAlreadyAtTarget) issues.push('Current Pixel Forge output is production 512px-tile mid-balanced output, not the selected 256px-tile candidate output.');

      const blocked = issues.some((issue) => !issue.includes('256px-tile candidate'));
      const readiness = blocked
        ? 'blocked'
        : candidateOutputAlreadyAtTarget
          ? 'ready'
          : candidateGenerationProfileSupported
            ? 'ready_for_candidate_generation'
            : 'needs_profile_patch';

      return {
        species: asset.id,
        variant,
        runtimeColorFile: asset.colorFile,
        runtimeNormalFile: asset.normalFile,
        targetWidth,
        targetHeight,
        targetTileSize,
        currentWidth: colorEntry?.width ?? null,
        currentHeight: colorEntry?.height ?? null,
        currentTileSize: colorEntry?.atlasTileSize ?? null,
        currentEstimatedMipmappedMiB: roundMetric((colorEntry?.estimatedMipmappedMiB ?? 0) + (normalEntry?.estimatedMipmappedMiB ?? 0)),
        targetEstimatedMipmappedMiB: roundMetric((colorEntry?.remediationCandidate?.targetEstimatedMipmappedMiB ?? 0) + (normalEntry?.remediationCandidate?.targetEstimatedMipmappedMiB ?? 0)),
        estimatedSavingsMiB: roundMetric((colorEntry?.remediationCandidate?.estimatedMipmappedMiBSaved ?? 0) + (normalEntry?.remediationCandidate?.estimatedMipmappedMiBSaved ?? 0)),
        pixelForge: {
          manifestEntryPresent: Boolean(manifestEntry),
          manifestVariantPresent: Boolean(manifestVariant),
          productionStatus: asString(manifestEntry?.meta?.productionStatus),
          manifestTileSize: asNumber(manifestEntry?.meta?.tileSize),
          manifestAngles: asNumber(manifestEntry?.meta?.angles),
          manifestAtlasProfile: asString(manifestEntry?.meta?.atlasProfile),
          manifestShaderProfile: asString(manifestEntry?.meta?.shaderProfile),
          sourceGlb,
          sourceGlbExists: Boolean(sourceGlb && existsSync(sourceGlb)),
          outputModel,
          outputModelExists: Boolean(outputModel && existsSync(resolvePixelForgePath(outputModel) ?? '')),
          outputColorAtlas,
          outputColorAtlasExists: Boolean(outputColorAtlas && existsSync(resolvePixelForgePath(outputColorAtlas) ?? '')),
          outputNormalAtlas,
          outputNormalAtlasExists: Boolean(outputNormalAtlas && existsSync(resolvePixelForgePath(outputNormalAtlas) ?? '')),
          outputMeta: metaPath,
          outputMetaExists: Boolean(metaPath && existsSync(resolvePixelForgePath(metaPath) ?? '')),
          outputMetaTileSize,
          outputMetaNormalSpace,
          outputMetaAuxLayers,
          normalContractPresent,
          candidateOutputAlreadyAtTarget,
        },
        readiness,
        issues,
      };
    })
    .sort((a, b) => a.species.localeCompare(b.species));
}

function buildReport(): PixelForgeVegetationReadinessReport {
  const artifactFiles = walkFiles(ARTIFACT_ROOT);
  const loadBranchSelectorPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-load-branch-selector', 'load-branch-selector.json')));
  const textureAuditPath = latestFile(artifactFiles, (path) => path.endsWith(join('pixel-forge-texture-audit', 'texture-audit.json')));
  const pixelForgePackagePath = join(PIXEL_FORGE_ROOT, 'package.json');
  const pipelineRunnerPath = join(PIXEL_FORGE_ROOT, 'scripts/run-tij-pipeline.ts');
  const vegetationValidatorPath = join(PIXEL_FORGE_ROOT, 'scripts/validate-tij-vegetation-package.ts');
  const galleryManifestPath = join(PIXEL_FORGE_ROOT, 'packages/server/output/tij/gallery-manifest.json');

  const selector = readJson<LoadBranchSelector>(loadBranchSelectorPath);
  const textureAudit = readJson<TextureAudit>(textureAuditPath);
  const packageJson = readJson<PixelForgePackageJson>(pixelForgePackagePath);
  const manifest = readJson<GalleryManifest>(galleryManifestPath);
  const pipelineText = readText(pipelineRunnerPath);
  const candidatePipelineCommand = packageJson?.scripts?.['tij:pipeline:kb-load-vegetation-256'] ?? null;
  const candidateVegetationValidateCommand = packageJson?.scripts?.['tij:vegetation-validate:kb-load-vegetation-256'] ?? null;
  const commandSurface = {
    tijPipelineCommand: packageJson?.scripts?.['tij:pipeline'] ?? null,
    tijCandidatePipelineCommand: candidatePipelineCommand,
    tijVegetationValidateCommand: packageJson?.scripts?.['tij:vegetation-validate'] ?? null,
    tijCandidateVegetationValidateCommand: candidateVegetationValidateCommand,
    supportsVegetationOnlyPipeline: pipelineText.includes("--only vegetation") && pipelineText.includes("only === 'vegetation'"),
    pipelineBakesNormalAuxLayer: pipelineText.includes("auxLayers: ['normal']"),
    pipelineUsesComboTileSize: pipelineText.includes('tileSize: combo.tileSize'),
    candidateTileOverrideDetected: /TIJ_.*TILE|--.*tile|vegetation-profile|kb-load-vegetation-256|candidate.*tile/i.test(pipelineText),
    candidateOutputRootDetected: pipelineText.includes('packages/server/output/tij-candidates/kb-load-vegetation-256'),
    candidateGenerationProfileSupported: Boolean(
      candidatePipelineCommand
        && candidateVegetationValidateCommand
        && pipelineText.includes('kb-load-vegetation-256')
        && pipelineText.includes('vegetationTileSize')
        && pipelineText.includes('vegetationCombosForProfile')
        && pipelineText.includes('packages/server/output/tij-candidates/kb-load-vegetation-256')
    ),
    recommendation: 'Use the review-only Pixel Forge candidate profile to emit selected mid-balanced runtime variants at 256px tiles with normal aux layers retained.',
  };
  const selectedCandidates = buildSelectedCandidates(selector, textureAudit, manifest, commandSurface.candidateGenerationProfileSupported);
  const candidatesReady = selectedCandidates.filter((candidate) => candidate.readiness === 'ready').length;
  const candidatesReadyForGeneration = selectedCandidates.filter((candidate) => candidate.readiness === 'ready_for_candidate_generation').length;
  const candidatesNeedingProfilePatch = selectedCandidates.filter((candidate) => candidate.readiness === 'needs_profile_patch').length;
  const candidatesBlocked = selectedCandidates.filter((candidate) => candidate.readiness === 'blocked').length;
  const currentEstimatedMipmappedMiB = roundMetric(selectedCandidates.reduce((sum, candidate) => sum + candidate.currentEstimatedMipmappedMiB, 0));
  const targetEstimatedMipmappedMiB = roundMetric(selectedCandidates.reduce((sum, candidate) => sum + candidate.targetEstimatedMipmappedMiB, 0));
  const estimatedSavingsMiB = roundMetric(selectedCandidates.reduce((sum, candidate) => sum + candidate.estimatedSavingsMiB, 0));
  const targetTileSizes = [...new Set(selectedCandidates.map((candidate) => candidate.targetTileSize).filter((value): value is number => typeof value === 'number'))];
  const targetSizes = [...new Set(selectedCandidates.map((candidate) =>
    candidate.targetWidth && candidate.targetHeight ? `${candidate.targetWidth}x${candidate.targetHeight}` : null
  ).filter((value): value is string => Boolean(value)))];
  const candidateOutputProfileSupported = candidatesBlocked === 0
    && selectedCandidates.length > 0
    && (candidatesReady === selectedCandidates.length || commandSurface.candidateGenerationProfileSupported)
    && candidatesNeedingProfilePatch === 0;
  const selectedBranchMatches = selector?.selectedBranch === SELECTED_BRANCH;

  const findings: string[] = [];
  if (!existsSync(PIXEL_FORGE_ROOT)) {
    findings.push(`Pixel Forge sibling repo is missing at ${PIXEL_FORGE_ROOT}.`);
  } else {
    findings.push(`Pixel Forge sibling repo is present at ${PIXEL_FORGE_ROOT}.`);
  }
  if (!selectedBranchMatches) {
    findings.push(`Latest KB-LOAD selector does not select ${SELECTED_BRANCH}; readiness cannot execute the intended branch.`);
  }
  if (selectedCandidates.length > 0) {
    findings.push(`Selected runtime vegetation atlas candidates are ${selectedCandidates.map((candidate) => `${candidate.species}/${candidate.variant}`).join(', ')}.`);
  }
  if (commandSurface.supportsVegetationOnlyPipeline && commandSurface.pipelineBakesNormalAuxLayer) {
    findings.push('Pixel Forge TIJ vegetation pipeline can run the vegetation slice and already bakes normal aux layers for normal-lit output.');
  }
  if (commandSurface.candidateGenerationProfileSupported) {
    findings.push('Pixel Forge now exposes a review-only kb-load-vegetation-256 candidate profile with a separate tij-candidates output root and selected-species validation command.');
  }
  if (!commandSurface.candidateTileOverrideDetected && candidatesNeedingProfilePatch > 0) {
    findings.push('Current Pixel Forge TIJ pipeline has no detected candidate tile-size override; selected mid-balanced outputs still need a 256px-tile review profile before branch proof.');
  }

  const requiredNextActions = commandSurface.candidateGenerationProfileSupported
    ? [
        'Run the Pixel Forge review-only candidate profile: bun run tij:pipeline:kb-load-vegetation-256.',
        'Run the Pixel Forge selected-species candidate validation: bun run tij:vegetation-validate:kb-load-vegetation-256.',
        'Keep candidate output under packages/server/output/tij-candidates/kb-load-vegetation-256 until side-by-side vegetation visual proof passes; do not overwrite the accepted production gallery.',
        'After visual proof, copy/import only the accepted color/normal pairs into TIJ and rerun the TIJ texture audit, Cycle 3 kickoff, and completion audit.',
        'After import, run quiet-machine Open Frontier and Zone Control before/after startup tables and WebGL largest-upload tables before making a startup/perf claim.',
      ]
    : [
        'Patch Pixel Forge with a review-only candidate profile or CLI/env override for the selected mid-balanced runtime variants at 4x4 tiles, 256px tile size, and 1024x1024 color/normal atlases.',
        'Keep aux normal baking, capture-view normal space, baseColor color layer, srgb color space, and edge bleed intact; do not use default no-normal removal for this branch.',
        'Write candidate output outside the current accepted production gallery or make the manifest/profile explicit enough that TIJ can compare default versus candidate without overwriting good current assets.',
        'Run Pixel Forge vegetation validation against the candidate manifest, then copy/import only after side-by-side vegetation visual proof passes.',
        'After visual proof, run quiet-machine Open Frontier and Zone Control before/after startup tables and rerun the TIJ texture audit, Cycle 3 kickoff, and completion audit.',
      ];

  const branchExecutionState: BranchExecutionState =
    !existsSync(PIXEL_FORGE_ROOT) || !packageJson
      ? 'blocked_missing_pixel_forge'
      : !selector || !textureAudit || !selectedBranchMatches || selectedCandidates.length === 0
        ? 'blocked_missing_inputs'
        : candidateOutputProfileSupported
          ? 'ready_for_candidate_generation'
          : 'needs_pixel_forge_profile_patch';
  const status: CheckStatus = branchExecutionState.startsWith('blocked') ? 'fail' : candidateOutputProfileSupported ? 'pass' : 'warn';

  return {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    workingTreeDirty: isWorkingTreeDirty(),
    pixelForgeSourceGitSha: gitShaAt(PIXEL_FORGE_ROOT),
    pixelForgeWorkingTreeDirty: isWorkingTreeDirtyAt(PIXEL_FORGE_ROOT),
    source: 'projekt-143-pixel-forge-vegetation-readiness',
    status,
    branchExecutionState,
    selectedBranch: selector?.selectedBranch ?? null,
    inputs: {
      loadBranchSelector: rel(loadBranchSelectorPath),
      textureAudit: rel(textureAuditPath),
      pixelForgeRoot: PIXEL_FORGE_ROOT,
      pixelForgePackageJson: rel(existsSync(pixelForgePackagePath) ? pixelForgePackagePath : null),
      pixelForgePipelineRunner: rel(existsSync(pipelineRunnerPath) ? pipelineRunnerPath : null),
      pixelForgeVegetationValidator: rel(existsSync(vegetationValidatorPath) ? vegetationValidatorPath : null),
      pixelForgeGalleryManifest: rel(existsSync(galleryManifestPath) ? galleryManifestPath : null),
    },
    commandSurface,
    summary: {
      selectedSpecies: selectedCandidates.map((candidate) => candidate.species),
      selectedVariants: selectedCandidates.map((candidate) => `${candidate.species}/${candidate.variant}`),
      candidateCount: selectedCandidates.length,
      candidatesReady,
      candidatesReadyForGeneration,
      candidatesNeedingProfilePatch,
      candidatesBlocked,
      normalPairsRetained: selectedCandidates.every((candidate) => candidate.pixelForge.normalContractPresent),
      targetTileSize: targetTileSizes.length === 1 ? targetTileSizes[0]! : null,
      targetAtlasSize: targetSizes.length === 1 ? targetSizes[0]! : null,
      currentEstimatedMipmappedMiB,
      targetEstimatedMipmappedMiB,
      estimatedSavingsMiB: selector?.inspectedEvidence?.vegetationCandidatesOnly?.estimatedSavingsMiB ?? estimatedSavingsMiB,
      candidateOutputProfileSupported,
    },
    selectedCandidates,
    findings,
    requiredNextActions,
    proofAfterGeneration: [
      'Pixel Forge candidate manifest shows the four selected variants at 256px tiles with normal atlas files present.',
      'TIJ texture audit estimates the four selected color/normal pairs at 1024x1024 and preserves vegetation normal-map policy.',
      'Visual proof compares default 512px-tile normal-lit vegetation against candidate 256px-tile normal-lit vegetation.',
      'Quiet-machine startup proof covers Open Frontier and Zone Control mode-click/deploy-click timings plus WebGL largest-upload tables.',
    ],
    nonClaims: [
      'This readiness audit does not mutate Pixel Forge.',
      'This readiness audit does not generate, resize, import, or accept any atlas.',
      'This readiness audit does not prove visual parity, startup improvement, runtime performance, release readiness, or production parity.',
    ],
  };
}

function main(): void {
  const report = buildReport();
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, 'vegetation-readiness.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  console.log(`Projekt 143 Pixel Forge vegetation readiness ${report.status.toUpperCase()}: ${rel(outputPath)}`);
  console.log(`- branchExecutionState=${report.branchExecutionState}`);
  console.log(`- selected=${report.summary.selectedVariants.join(', ') || 'none'}`);
  console.log(`- target=${report.summary.targetAtlasSize ?? 'unknown'} tile=${report.summary.targetTileSize ?? 'unknown'} normalPairsRetained=${report.summary.normalPairsRetained}`);
  console.log(`- estimatedSavingsMiB=${report.summary.estimatedSavingsMiB}`);
  if (report.status === 'fail') process.exitCode = 1;
}

main();
