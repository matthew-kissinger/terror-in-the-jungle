import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const oldRuntimeTokens = [
  'DipterocarpGiant',
  'TwisterBanyan',
  'RubberTree',
  'ArecaPalmCluster',
  'ElephantGrass',
  'RicePaddyPlants',
  'Mangrove',
  'dipterocarp',
  'rubberTree',
  'ricePaddyPlants',
  'elephantGrass',
  'areca',
  'mangrove',
  'banyan',
  'us-walk-',
  'vc-walk-',
  'nva-walk-',
  'arvn-walk-',
  'us-fire-',
  'vc-fire-',
  'nva-fire-',
  'arvn-fire-',
  'us-mounted',
  'vc-mounted',
  'nva-mounted',
  'arvn-mounted',
  'assets/source/soldiers',
  'source/soldiers',
  'arvn-back-fire',
  'arvn-back-walk',
  'arvn-front-fire',
  'arvn-front-walk',
  'arvn-side-fire',
  'arvn-side-walk',
  'nva-back-fire',
  'nva-back-walk',
  'nva-front-fire',
  'nva-front-walk',
  'nva-side-fire',
  'nva-side-walk',
];

const disallowedRuntimeTokens = [
  ...oldRuntimeTokens,
  // This Pixel Forge candidate has an off-origin capture footprint that makes
  // the runtime billboard plane enormous. Keep it out of shipped builds.
  'palm-quaternius-3',
];

const runtimeFiles = [
  'src/config/vegetationTypes.ts',
  'src/config/biomes.ts',
  'src/systems/assets/AssetLoader.ts',
  'src/systems/combat/CombatantMeshFactory.ts',
  'src/systems/combat/CombatantRenderer.ts',
  'src/systems/combat/PixelForgeNpcRuntime.ts',
];

const oldPublicAssetNames = [
  'DipterocarpGiant.webp',
  'TwisterBanyan.webp',
  'RubberTree.webp',
  'ArecaPalmCluster.webp',
  'ElephantGrass.webp',
  'RicePaddyPlants.webp',
  'Mangrove.webp',
  'CoconutPalm.webp',
  'FanPalmCluster.webp',
  'BambooGrove.webp',
  'BananaPlant.webp',
  'Fern.webp',
  'ElephantEarPlants.webp',
  'us-walk-front-1.webp',
  'us-walk-front-2.webp',
  'us-walk-back-1.webp',
  'us-walk-back-2.webp',
  'us-walk-side-1.webp',
  'us-walk-side-2.webp',
  'us-fire-front.webp',
  'us-fire-back.webp',
  'us-fire-side.webp',
  'vc-walk-front-1.webp',
  'vc-walk-front-2.webp',
  'vc-walk-back-1.webp',
  'vc-walk-back-2.webp',
  'vc-walk-side-1.webp',
  'vc-walk-side-2.webp',
  'vc-fire-front.webp',
  'vc-fire-back.webp',
  'vc-fire-side.webp',
  'nva-walk-front-1.webp',
  'nva-walk-front-2.webp',
  'nva-walk-back-1.webp',
  'nva-walk-back-2.webp',
  'nva-walk-side-1.webp',
  'nva-walk-side-2.webp',
  'nva-fire-front.webp',
  'nva-fire-back.webp',
  'nva-fire-side.webp',
  'arvn-walk-front-1.webp',
  'arvn-walk-front-2.webp',
  'arvn-walk-back-1.webp',
  'arvn-walk-back-2.webp',
  'arvn-walk-side-1.webp',
  'arvn-walk-side-2.webp',
  'arvn-fire-front.webp',
  'arvn-fire-back.webp',
  'arvn-fire-side.webp',
  'us-mounted.webp',
  'vc-mounted.webp',
  'nva-mounted.webp',
  'arvn-mounted.webp',
  'arvn-back-fire.png',
  'arvn-back-walk1.png',
  'arvn-back-walk2.png',
  'arvn-front-fire.png',
  'arvn-front-walk1.png',
  'arvn-front-walk2.png',
  'arvn-side-fire.png',
  'arvn-side-walk1.png',
  'arvn-side-walk2.png',
  'nva-back-fire.png',
  'nva-back-walk1.png',
  'nva-back-walk2.png',
  'nva-front-fire.png',
  'nva-front-walk1.png',
  'nva-front-walk2.png',
  'nva-side-fire.png',
  'nva-side-walk1.png',
  'nva-side-walk2.png',
];

const errors: string[] = [];

const shippedTextExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
]);

const getExtension = (path: string): string => {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const lastDot = path.lastIndexOf('.');
  return lastDot > lastSlash ? path.slice(lastDot).toLowerCase() : '';
};

const scanOutputDirectory = (dir: string): void => {
  const absoluteDir = join(repoRoot, dir);
  if (!existsSync(absoluteDir)) return;

  const stack = [absoluteDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const displayPath = relative(repoRoot, path).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (displayPath.endsWith('assets/source/soldiers')) {
          errors.push(`legacy soldier source assets must not ship under ${displayPath}`);
        }
        stack.push(path);
        continue;
      }

      if (!entry.isFile()) continue;

      if (oldPublicAssetNames.includes(entry.name)) {
        errors.push(`legacy asset still exists in shipped output: ${displayPath}`);
      }

      if (!shippedTextExtensions.has(getExtension(entry.name))) continue;

      const text = readFileSync(path, 'utf8');
      for (const token of [...disallowedRuntimeTokens, ...oldPublicAssetNames]) {
        if (text.includes(token)) {
          errors.push(`${displayPath} still contains disallowed cutover token "${token}"`);
        }
      }
    }
  }
};

for (const runtimeFile of runtimeFiles) {
  const text = readFileSync(join(repoRoot, runtimeFile), 'utf8');
  for (const token of disallowedRuntimeTokens) {
    if (text.includes(token)) {
      errors.push(`${runtimeFile} still references disallowed cutover token "${token}"`);
    }
  }
}

for (const name of oldPublicAssetNames) {
  const path = join(repoRoot, 'public/assets', name);
  if (existsSync(path)) {
    errors.push(`legacy public asset still exists: public/assets/${name}`);
  }
}

const oldSoldierSourcePath = join(repoRoot, 'public/assets/source/soldiers');
if (existsSync(oldSoldierSourcePath)) {
  errors.push(`legacy soldier source assets must not ship under ${relative(repoRoot, oldSoldierSourcePath)}`);
}

scanOutputDirectory('dist');
scanOutputDirectory('dist-perf');

const rejectedPath = join(repoRoot, 'public/assets/rejected-do-not-import');
if (existsSync(rejectedPath)) {
  errors.push(`rejected assets must not be copied under ${relative(repoRoot, rejectedPath)}`);
}

const oversizedPalmPath = join(repoRoot, 'public/assets/pixel-forge/vegetation/giantPalm/palm-quaternius-3');
if (existsSync(oversizedPalmPath)) {
  errors.push(`oversized Pixel Forge palm variant must not be copied under ${relative(repoRoot, oversizedPalmPath)}`);
}

const requiredPaths = [
  'public/assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png',
  'public/assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.normal.png',
  'public/assets/pixel-forge/npcs/usArmy/idle/animated-albedo-packed.png',
  'public/models/npcs/pixel-forge-v1/usArmy.glb',
  'public/models/npcs/pixel-forge-v1/nva.glb',
  'public/models/weapons/m16a1.glb',
  'public/models/weapons/ak47.glb',
];

for (const requiredPath of requiredPaths) {
  if (!existsSync(join(repoRoot, requiredPath))) {
    errors.push(`missing required Pixel Forge asset: ${requiredPath}`);
  }
}

const propDir = join(repoRoot, 'public/models/props/pixel-forge');
const propCount = existsSync(propDir)
  ? readdirSync(propDir).filter((file) => file.endsWith('.glb') && statSync(join(propDir, file)).isFile()).length
  : 0;
if (propCount !== 80) {
  errors.push(`expected 80 Pixel Forge prop GLBs, found ${propCount}`);
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Pixel Forge cutover validation passed');
