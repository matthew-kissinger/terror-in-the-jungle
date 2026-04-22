import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_BUCKET = 'titj-game-assets-prod';
const DEFAULT_ASSET_BASE_URL = 'https://pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev';
const DEFAULT_MANIFEST_OUT = 'dist/asset-manifest.json';

interface AssetSource {
  id: string;
  sourcePath: string;
  keyPrefix: string;
  outputName: string;
  extension: string;
  contentType: string;
  cacheControl: string;
  required: boolean;
  pinned: {
    key: string;
    sha256: string;
    size: number;
  };
}

interface ManifestAsset {
  id: string;
  url: string;
  key: string;
  sha256: string;
  size: number;
  contentType: string;
  cacheControl: string;
  required: boolean;
}

interface GameAssetManifest {
  version: 1;
  generatedAt: string;
  gitSha: string;
  assetBaseUrl: string;
  assets: Record<string, ManifestAsset>;
}

const ASSETS: AssetSource[] = [
  {
    id: 'terrain.ashau.dem',
    sourcePath: 'public/data/vietnam/big-map/a-shau-z14-9x9.f32',
    keyPrefix: 'terrain/a-shau',
    outputName: 'a-shau-z14-9x9',
    extension: 'f32',
    contentType: 'application/octet-stream',
    cacheControl: 'public, max-age=31536000, immutable',
    required: true,
    pinned: {
      key: 'terrain/a-shau/a-shau-z14-9x9.6333377c64acbcd74719a078534dc9ca229b242db5562e860e79ae963dd7fc5a.f32',
      sha256: '6333377c64acbcd74719a078534dc9ca229b242db5562e860e79ae963dd7fc5a',
      size: 21233664,
    },
  },
  {
    id: 'terrain.ashau.rivers',
    sourcePath: 'public/data/vietnam/a-shau-rivers.json',
    keyPrefix: 'terrain/a-shau',
    outputName: 'a-shau-rivers',
    extension: 'json',
    contentType: 'application/json',
    cacheControl: 'public, max-age=31536000, immutable',
    required: true,
    pinned: {
      key: 'terrain/a-shau/a-shau-rivers.c8a5aea6b34f1ca667a17cbd371d785fae8b310cf7c670df55371a12ef108ab5.json',
      sha256: 'c8a5aea6b34f1ca667a17cbd371d785fae8b310cf7c670df55371a12ef108ab5',
      size: 25718,
    },
  },
];

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function gitSha(): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function buildManifest(assetBaseUrl: string): GameAssetManifest {
  const normalizedBaseUrl = normalizeBaseUrl(assetBaseUrl);
  const entries = ASSETS.map(asset => {
    const sourcePath = resolve(asset.sourcePath);
    if (!existsSync(sourcePath)) {
      console.log(`Using pinned R2 metadata for ${asset.id}; source file is absent in this checkout.`);
      return {
        id: asset.id,
        url: `${normalizedBaseUrl}/${asset.pinned.key}`,
        key: asset.pinned.key,
        sha256: asset.pinned.sha256,
        size: asset.pinned.size,
        contentType: asset.contentType,
        cacheControl: asset.cacheControl,
        required: asset.required,
      };
    }
    const hash = sha256(sourcePath);
    const key = `${asset.keyPrefix}/${asset.outputName}.${hash}.${asset.extension}`;
    const statSize = readFileSync(sourcePath).byteLength;
    if (asset.pinned.sha256 !== hash || asset.pinned.size !== statSize || asset.pinned.key !== key) {
      console.warn(
        `Local source for ${asset.id} differs from pinned R2 metadata; ` +
        `upload will publish ${key}. Update pinned metadata before relying on a fresh-checkout deploy.`
      );
    }
    return {
      id: asset.id,
      url: `${normalizedBaseUrl}/${key}`,
      key,
      sha256: hash,
      size: statSize,
      contentType: asset.contentType,
      cacheControl: asset.cacheControl,
      required: asset.required,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    assetBaseUrl: normalizedBaseUrl,
    assets: Object.fromEntries(entries.map(entry => [entry.id, entry])),
  };
}

function writeManifest(manifest: GameAssetManifest, outPath: string): void {
  const absoluteOutPath = resolve(outPath);
  mkdirSync(dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

function runWrangler(args: string[]): void {
  const localWranglerJs = resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');
  const hasLocalWrangler = existsSync(localWranglerJs);
  const command = hasLocalWrangler ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const commandArgs = hasLocalWrangler ? [localWranglerJs, ...args] : ['wrangler', ...args];
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`wrangler ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function uploadAsset(bucket: string, asset: AssetSource, entry: ManifestAsset): void {
  if (!existsSync(resolve(asset.sourcePath))) {
    console.log(`Skipping upload for ${asset.id}; source file is absent, validating existing R2 object ${entry.key}.`);
    return;
  }
  runWrangler([
    'r2',
    'object',
    'put',
    `${bucket}/${entry.key}`,
    '--file',
    asset.sourcePath,
    '--content-type',
    asset.contentType,
    '--cache-control',
    asset.cacheControl,
    '--remote',
  ]);
}

function uploadManifest(bucket: string, manifestPath: string, manifest: GameAssetManifest): void {
  const shortSha = manifest.gitSha === 'unknown' ? 'unknown' : manifest.gitSha.slice(0, 12);
  runWrangler([
    'r2',
    'object',
    'put',
    `${bucket}/manifests/assets.${shortSha}.json`,
    '--file',
    manifestPath,
    '--content-type',
    'application/json',
    '--cache-control',
    'public, max-age=31536000, immutable',
    '--remote',
  ]);
  runWrangler([
    'r2',
    'object',
    'put',
    `${bucket}/manifests/current.json`,
    '--file',
    manifestPath,
    '--content-type',
    'application/json',
    '--cache-control',
    'public, max-age=0, must-revalidate',
    '--remote',
  ]);
}

async function validateManifest(manifest: GameAssetManifest): Promise<void> {
  for (const entry of Object.values(manifest.assets)) {
    const response = await fetch(entry.url, {
      method: 'HEAD',
      headers: { Origin: 'https://terror-in-the-jungle.pages.dev' },
    });
    if (!response.ok) {
      throw new Error(`${entry.id} failed HEAD validation: HTTP ${response.status} ${entry.url}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (/^text\/html\b/i.test(contentType)) {
      throw new Error(`${entry.id} returned HTML from ${entry.url}`);
    }
    if (contentType && contentType !== entry.contentType) {
      throw new Error(`${entry.id} content-type mismatch: got ${contentType}, expected ${entry.contentType}`);
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength !== entry.size) {
      throw new Error(`${entry.id} content-length mismatch: got ${contentLength}, expected ${entry.size}`);
    }
    const cacheControl = response.headers.get('cache-control') ?? '';
    if (cacheControl !== entry.cacheControl) {
      throw new Error(`${entry.id} cache-control mismatch: got ${cacheControl}, expected ${entry.cacheControl}`);
    }
    const cors = response.headers.get('access-control-allow-origin') ?? '';
    if (cors !== '*') {
      throw new Error(`${entry.id} missing public CORS header for browser loads.`);
    }
    console.log(`Validated ${entry.id}: ${entry.url}`);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'manifest';
  const bucket = process.env.TITJ_R2_BUCKET ?? DEFAULT_BUCKET;
  const assetBaseUrl = process.env.TITJ_ASSET_BASE_URL
    ?? process.env.VITE_GAME_ASSET_BASE_URL
    ?? DEFAULT_ASSET_BASE_URL;
  const outPath = argValue('out') ?? process.env.TITJ_ASSET_MANIFEST_OUT ?? DEFAULT_MANIFEST_OUT;
  const skipR2Upload = process.env.TITJ_SKIP_R2_UPLOAD === '1';

  if (command === 'manifest') {
    writeManifest(buildManifest(assetBaseUrl), outPath);
    return;
  }

  if (command === 'upload') {
    const manifest = buildManifest(assetBaseUrl);
    if (skipR2Upload) {
      console.log('Skipping R2 writes because TITJ_SKIP_R2_UPLOAD=1; generating manifest and validating existing public objects.');
    } else {
      for (const asset of ASSETS) {
        uploadAsset(bucket, asset, manifest.assets[asset.id]);
      }
    }
    writeManifest(manifest, outPath);
    if (!skipR2Upload) {
      uploadManifest(bucket, outPath, manifest);
    }
    await validateManifest(manifest);
    return;
  }

  if (command === 'validate') {
    const manifest = JSON.parse(readFileSync(resolve(outPath), 'utf8')) as GameAssetManifest;
    await validateManifest(manifest);
    return;
  }

  throw new Error(`Unknown command '${command}'. Use manifest, upload, or validate.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
