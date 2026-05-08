import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type AuditStatus = 'pass' | 'warn' | 'fail';

interface WaterSystemAuditReport {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-water-system-audit';
  status: AuditStatus;
  inputs: Record<string, string | null>;
  currentContract: {
    globalWaterPlane: boolean;
    threeWaterShader: boolean;
    yZeroWaterLevel: boolean;
    cameraFollower: boolean;
    worldSizeScaledPlane: boolean;
    modeWaterToggle: boolean;
    aShauGlobalWaterDisabled: boolean;
    openFrontierUsesDefaultGlobalWater: boolean;
    openFrontierNoiseCarvesWaterAreas: boolean;
    aShauRiverPolylineAssetPresent: boolean;
    aShauRiverPolylineCount: number | null;
    hydrologyBakeManifestPresent: boolean;
    hydrologyBakeEntryCount: number | null;
    hydrologyLoaderPresent: boolean;
    hydrologyFeatureGatedPreloadPresent: boolean;
    hydrologyFeatureGatedBiomeClassificationPresent: boolean;
    hydrologyDefaultModePreloadPresent: boolean;
    hydrologyDefaultModeBiomeClassificationPresent: boolean;
    hydrologyTerrainMaterialMaskPresent: boolean;
    hydrologyTerrainMaterialFeatheredMaskPresent: boolean;
    hydrologyRiverMeshConsumerPresent: boolean;
    hydrologyRiverMeshStartupWiringPresent: boolean;
    globalWaterPlaneSuppressedByHydrology: boolean;
    hydrologyRiverNaturalMaterialProfilePresent: boolean;
    hydrologyRiverVertexColorGradientPresent: boolean;
    publicWaterQueryApiPresent: boolean;
    hydrologyWaterQuerySurfacePresent: boolean;
    waterQueryTestCoveragePresent: boolean;
  };
  findings: string[];
  nextBranchRequirements: string[];
  nonClaims: string[];
}

const OUTPUT_NAME = 'projekt-143-water-system-audit';
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

const SOURCE_PATHS = {
  waterSystem: join(process.cwd(), 'src', 'systems', 'environment', 'WaterSystem.ts'),
  waterSystemTest: join(process.cwd(), 'src', 'systems', 'environment', 'WaterSystem.test.ts'),
  systemManager: join(process.cwd(), 'src', 'core', 'SystemManager.ts'),
  gameModeTypes: join(process.cwd(), 'src', 'config', 'gameModeTypes.ts'),
  openFrontierConfig: join(process.cwd(), 'src', 'config', 'OpenFrontierConfig.ts'),
  aShauConfig: join(process.cwd(), 'src', 'config', 'AShauValleyConfig.ts'),
  noiseHeightProvider: join(process.cwd(), 'src', 'systems', 'terrain', 'NoiseHeightProvider.ts'),
  aShauRivers: join(process.cwd(), 'public', 'data', 'vietnam', 'a-shau-rivers.json'),
  hydrologyBakeManifest: join(process.cwd(), 'public', 'data', 'hydrology', 'bake-manifest.json'),
  hydrologyLoader: join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyBakeManifest.ts'),
  hydrologyRuntimePreload: join(process.cwd(), 'src', 'core', 'ModeStartupPreparer.ts'),
  terrainMaterial: join(process.cwd(), 'src', 'systems', 'terrain', 'TerrainMaterial.ts'),
  terrainSurfaceRuntime: join(process.cwd(), 'src', 'systems', 'terrain', 'TerrainSurfaceRuntime.ts'),
};

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function main(): void {
  const waterSystem = readText(SOURCE_PATHS.waterSystem);
  const waterSystemTest = readText(SOURCE_PATHS.waterSystemTest);
  const systemManager = readText(SOURCE_PATHS.systemManager);
  const gameModeTypes = readText(SOURCE_PATHS.gameModeTypes);
  const openFrontierConfig = readText(SOURCE_PATHS.openFrontierConfig);
  const aShauConfig = readText(SOURCE_PATHS.aShauConfig);
  const noiseHeightProvider = readText(SOURCE_PATHS.noiseHeightProvider);
  const hydrologyRuntimePreload = readText(SOURCE_PATHS.hydrologyRuntimePreload);
  const terrainMaterial = readText(SOURCE_PATHS.terrainMaterial);
  const terrainSurfaceRuntime = readText(SOURCE_PATHS.terrainSurfaceRuntime);
  const aShauRivers = readJson<{ rivers?: unknown[] }>(SOURCE_PATHS.aShauRivers);
  const hydrologyBakeManifest = readJson<{ entries?: unknown[] }>(SOURCE_PATHS.hydrologyBakeManifest);

  const currentContract = {
    globalWaterPlane: waterSystem.includes('new THREE.PlaneGeometry('),
    threeWaterShader: waterSystem.includes('new Water(waterGeometry'),
    yZeroWaterLevel: waterSystem.includes('WATER_LEVEL = 0'),
    cameraFollower: waterSystem.includes('this.water.position.x = this.camera.position.x')
      && waterSystem.includes('this.water.position.z = this.camera.position.z'),
    worldSizeScaledPlane: waterSystem.includes('safeWorld * 1.8'),
    modeWaterToggle: systemManager.includes('config.waterEnabled !== false')
      && gameModeTypes.includes('waterEnabled?: boolean'),
    aShauGlobalWaterDisabled: aShauConfig.includes('waterEnabled: false'),
    openFrontierUsesDefaultGlobalWater: !openFrontierConfig.includes('waterEnabled: false'),
    openFrontierNoiseCarvesWaterAreas: noiseHeightProvider.includes('waterNoise')
      && noiseHeightProvider.includes('riverNoise')
      && noiseHeightProvider.includes('height = -3'),
    aShauRiverPolylineAssetPresent: Boolean(aShauRivers?.rivers?.length),
    aShauRiverPolylineCount: Array.isArray(aShauRivers?.rivers) ? aShauRivers.rivers.length : null,
    hydrologyBakeManifestPresent: Boolean(hydrologyBakeManifest?.entries?.length),
    hydrologyBakeEntryCount: Array.isArray(hydrologyBakeManifest?.entries) ? hydrologyBakeManifest.entries.length : null,
    hydrologyLoaderPresent: existsSync(SOURCE_PATHS.hydrologyLoader),
    hydrologyFeatureGatedPreloadPresent: hydrologyRuntimePreload.includes('maybePreloadHydrologyBake')
      && hydrologyRuntimePreload.includes('setHydrologyBake'),
    hydrologyFeatureGatedBiomeClassificationPresent: hydrologyRuntimePreload.includes('setHydrologyBiomePolicy')
      && hydrologyRuntimePreload.includes('__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__'),
    hydrologyDefaultModePreloadPresent: [aShauConfig, openFrontierConfig].every((source) => source.includes('hydrology:')
      && source.includes('preload: true')),
    hydrologyDefaultModeBiomeClassificationPresent: [aShauConfig, openFrontierConfig].every((source) => source.includes('biomeClassification:')
      && source.includes('enabled: true')),
    hydrologyTerrainMaterialMaskPresent: terrainMaterial.includes('hydrologyMaskTexture')
      && terrainMaterial.includes('applyHydrologyBiomeBlend')
      && terrainSurfaceRuntime.includes('setHydrologyMaterialMask')
      && terrainSurfaceRuntime.includes('createHydrologyMaskTexture'),
    hydrologyTerrainMaterialFeatheredMaskPresent: terrainSurfaceRuntime.includes('featherHydrologyMask')
      && terrainSurfaceRuntime.includes('THREE.LinearFilter')
      && terrainMaterial.includes('hydrologyMask.wetStrength ?? 0.08')
      && terrainMaterial.includes('hydrologyMask.channelStrength ?? 0.14')
      && terrainMaterial.includes('secondaryBlend = clamp(1.0 - hydrologyWeight'),
    hydrologyRiverMeshConsumerPresent: waterSystem.includes('setHydrologyChannels')
      && waterSystem.includes('buildHydrologyRiverGeometry')
      && waterSystem.includes('hydrology-river-surfaces'),
    hydrologyRiverMeshStartupWiringPresent: hydrologyRuntimePreload.includes('waterSystem.setHydrologyChannels')
      && hydrologyRuntimePreload.includes('hydrologyBake?.artifact'),
    globalWaterPlaneSuppressedByHydrology: waterSystem.includes('isGlobalWaterPlaneActive()')
      && waterSystem.includes('!this.hydrologyRiverGroup')
      && waterSystem.includes('updateGlobalWaterVisibility()'),
    hydrologyRiverNaturalMaterialProfilePresent: waterSystem.includes('HYDROLOGY_RIVER_MATERIAL_PROFILE')
      && waterSystem.includes("'natural_channel_gradient'")
      && waterSystem.includes('emissiveIntensity: 0.02')
      && waterSystem.includes('opacity: 0.55'),
    hydrologyRiverVertexColorGradientPresent: waterSystem.includes("geometry.setAttribute('color'")
      && waterSystem.includes('pushHydrologyRiverColor(colors, centerColor, HYDROLOGY_RIVER_CENTER_ALPHA)')
      && waterSystem.includes('HYDROLOGY_RIVER_CENTER_ALPHA')
      && waterSystem.includes('vertexColors: true'),
    publicWaterQueryApiPresent: waterSystem.includes('isUnderwater(position: THREE.Vector3)')
      && waterSystem.includes('getWaterSurfaceY(position: THREE.Vector3): number | null')
      && waterSystem.includes('getWaterDepth(position: THREE.Vector3): number'),
    hydrologyWaterQuerySurfacePresent: waterSystem.includes('hydrologyWaterQuerySegments')
      && waterSystem.includes('getHydrologyWaterSurfaceY')
      && waterSystem.includes('startSurfaceY')
      && waterSystem.includes('halfWidth'),
    waterQueryTestCoveragePresent: waterSystemTest.includes('reports global water surface and depth while the global plane is active')
      && waterSystemTest.includes('getWaterSurfaceY(new THREE.Vector3(5, 1, 0))')
      && waterSystemTest.includes('getWaterDepth(new THREE.Vector3(5, 1, 0))'),
  };

  const missingCore = [
    ['WaterSystem global plane', currentContract.globalWaterPlane],
    ['mode water toggle', currentContract.modeWaterToggle],
    ['hydrology bake manifest', currentContract.hydrologyBakeManifestPresent],
    ['hydrology loader', currentContract.hydrologyLoaderPresent],
  ].filter(([, present]) => !present).map(([label]) => label);

  const report: WaterSystemAuditReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-water-system-audit',
    status: missingCore.length > 0 ? 'fail' : 'warn',
    inputs: Object.fromEntries(Object.entries(SOURCE_PATHS).map(([key, path]) => [key, existsSync(path) ? rel(path) : null])),
    currentContract,
    findings: [
      currentContract.globalWaterPlane && currentContract.cameraFollower
        ? 'Current runtime water is a camera-following global plane at sea level, not a map-space river or stream network.'
        : 'Current runtime water contract could not be fully identified from source.',
      currentContract.aShauGlobalWaterDisabled
        ? 'A Shau correctly disables the global water plane because the map needs streams, not a sea-level sheet through the DEM.'
        : 'A Shau global-water disable was not found.',
      currentContract.openFrontierUsesDefaultGlobalWater && currentContract.openFrontierNoiseCarvesWaterAreas
        ? 'Open Frontier currently combines procedural negative-height water areas with the default global water plane; it does not own a stable river graph.'
        : 'Open Frontier water assumptions need review before hydrology-backed rendering.',
      currentContract.aShauRiverPolylineAssetPresent
        ? currentContract.hydrologyRiverMeshConsumerPresent
          ? 'A Shau still has a separate legacy river-polyline data asset; the runtime river visual path now consumes hydrology-bake channel polylines instead.'
          : 'A Shau already has a river-polyline data asset, but the current hydrology cache and water renderer do not consume it yet.'
        : 'A Shau river-polyline data was not found.',
      currentContract.hydrologyBakeManifestPresent && currentContract.hydrologyLoaderPresent
        ? currentContract.hydrologyDefaultModePreloadPresent
          ? currentContract.hydrologyDefaultModeBiomeClassificationPresent && currentContract.hydrologyTerrainMaterialMaskPresent
            ? currentContract.hydrologyRiverMeshConsumerPresent && currentContract.hydrologyRiverMeshStartupWiringPresent
              ? currentContract.hydrologyRiverNaturalMaterialProfilePresent
                && currentContract.hydrologyRiverVertexColorGradientPresent
                && currentContract.hydrologyTerrainMaterialFeatheredMaskPresent
                && currentContract.globalWaterPlaneSuppressedByHydrology
                ? 'The hydrology bake manifest, typed loader, default large-map vegetation classifier, feathered terrain material mask, bank-to-channel river material consumer, and global-water suppression on hydrology maps are wired; final stream visuals still need browser proof and human acceptance.'
                : 'The hydrology bake manifest, typed loader, default large-map vegetation classifier, terrain material mask, and provisional river-strip water consumer are wired; final stream visuals still need browser proof and human acceptance.'
              : 'The hydrology bake manifest, typed loader, default large-map vegetation classifier, and terrain material mask consumer are wired; runtime water remains the global-plane/fallback contract.'
            : 'The hydrology bake manifest and typed loader are wired by default for large maps, but vegetation/material consumers need review.'
          : currentContract.hydrologyFeatureGatedPreloadPresent
          ? currentContract.hydrologyFeatureGatedBiomeClassificationPresent
            ? 'The hydrology bake manifest and typed loader can preload behind an explicit feature gate, with a separate feature-gated vegetation-biome classifier candidate; default visuals remain unchanged.'
            : 'The hydrology bake manifest and typed loader can preload behind an explicit feature gate, but remain visually inert.'
          : 'The hydrology bake manifest and typed loader are present, but intentionally unwired from mode startup and rendering.'
        : 'The hydrology manifest/loader contract is incomplete.',
      currentContract.publicWaterQueryApiPresent && currentContract.hydrologyWaterQuerySurfacePresent && currentContract.waterQueryTestCoveragePresent
        ? 'WaterSystem now exposes the public VODA-1 gameplay query API for global water and hydrology channel surfaces, with focused regression coverage.'
        : 'WaterSystem public gameplay water query acceptance remains incomplete.',
    ],
    nextBranchRequirements: [
      'Keep WaterSystem as the global ocean/lake fallback; hydrology river surfaces must remain a separate map-space consumer, not a clipped/scaled global plane.',
      'Treat hydrology river strips as provisional until matched Open Frontier/A Shau browser screenshots and perf captures pass.',
      'Refine river mesh strips from accepted channel polylines instead of scaling or clipping the global water plane.',
      'Feed bank/wetness masks into route/trail crossings and water queries before final ecology acceptance.',
      'Route future gameplay consumers through WaterSystem queries instead of reintroducing simple y<0 water-contact assumptions.',
      'Require matched Open Frontier/A Shau screenshots and clean perf captures before accepting runtime river visuals.',
    ],
    nonClaims: [
      currentContract.publicWaterQueryApiPresent && currentContract.hydrologyWaterQuerySurfacePresent
        ? 'This audit accepts the source/test query API surface only; it does not prove every future gameplay consumer uses it.'
        : 'This audit does not accept gameplay water queries.',
      'This audit does not accept A Shau streams or Open Frontier rivers.',
      'This audit does not provide perf evidence.',
    ],
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'water-system-audit.json');
  const markdownPath = join(outputDir, 'water-system-audit.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, toMarkdown(report), 'utf-8');

  console.log(`Projekt 143 water system audit ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  for (const finding of report.findings) {
    console.log(`- ${finding}`);
  }
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
}

function toMarkdown(report: WaterSystemAuditReport): string {
  return [
    '# Projekt Objekt-143 Water System Audit',
    '',
    `Created: ${report.createdAt}`,
    `Status: ${report.status.toUpperCase()}`,
    `Source SHA: ${report.sourceGitSha}`,
    '',
    '## Current Contract',
    '',
    ...Object.entries(report.currentContract).map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`),
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Next Branch Requirements',
    '',
    ...report.nextBranchRequirements.map((requirement) => `- ${requirement}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

main();
