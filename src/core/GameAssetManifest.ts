import { Logger } from '../utils/Logger';

export const ASHAU_DEM_ASSET_ID = 'terrain.ashau.dem';
export const ASHAU_RIVERS_ASSET_ID = 'terrain.ashau.rivers';

export interface GameAssetManifestEntry {
  id: string;
  url: string;
  key: string;
  sha256: string;
  size: number;
  contentType: string;
  cacheControl: string;
  required: boolean;
}

export interface GameAssetManifest {
  version: 1;
  generatedAt: string;
  gitSha: string;
  assetBaseUrl: string;
  assets: Record<string, GameAssetManifestEntry>;
}

let manifestPromise: Promise<GameAssetManifest | null> | null = null;

function getManifestUrl(): string {
  const configured = import.meta.env.VITE_GAME_ASSET_MANIFEST_URL as string | undefined;
  if (configured?.trim()) {
    return configured.trim();
  }
  return `${import.meta.env.BASE_URL}asset-manifest.json`;
}

function resolveManifestRelativeUrl(url: string, manifestUrl: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) {
    return url;
  }
  return new URL(url, new URL(manifestUrl, window.location.origin)).toString();
}

async function loadManifest(): Promise<GameAssetManifest | null> {
  const manifestUrl = getManifestUrl();
  const response = await fetch(manifestUrl, { cache: 'no-cache' });

  if (response.status === 404 && import.meta.env.DEV) {
    Logger.info('asset-manifest', `No asset manifest at ${manifestUrl}; using dev fallback paths.`);
    return null;
  }

  if (!response.ok) {
    throw new Error(`Asset manifest fetch failed: HTTP ${response.status} for ${manifestUrl}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (/^text\/html\b/i.test(contentType)) {
    throw new Error(`Asset manifest returned HTML for ${manifestUrl}; deployment is missing asset-manifest.json.`);
  }

  const manifest = await response.json() as GameAssetManifest;
  if (manifest.version !== 1 || !manifest.assets || typeof manifest.assets !== 'object') {
    throw new Error(`Asset manifest at ${manifestUrl} has an unsupported schema.`);
  }

  return manifest;
}

async function getManifest(): Promise<GameAssetManifest | null> {
  manifestPromise ??= loadManifest();
  return manifestPromise;
}

export async function resolveGameAssetUrl(assetId: string | undefined, fallbackUrl: string): Promise<string> {
  if (!assetId) {
    return fallbackUrl;
  }

  try {
    const manifest = await getManifest();
    if (!manifest) {
      return fallbackUrl;
    }

    const entry = manifest.assets[assetId];
    if (!entry) {
      throw new Error(`Asset manifest is missing required asset '${assetId}'.`);
    }

    return resolveManifestRelativeUrl(entry.url, getManifestUrl());
  } catch (error) {
    if (import.meta.env.DEV) {
      Logger.warn('asset-manifest', `Falling back to ${fallbackUrl} for ${assetId}:`, error);
      return fallbackUrl;
    }
    throw error;
  }
}

export function resetGameAssetManifestForTests(): void {
  manifestPromise = null;
}
