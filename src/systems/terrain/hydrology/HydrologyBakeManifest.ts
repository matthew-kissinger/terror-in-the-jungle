import {
  HYDROLOGY_BAKE_ARTIFACT_VERSION,
  type HydrologyBakeArtifact,
  type HydrologyDepressionHandling,
} from './HydrologyBake';

export const HYDROLOGY_BAKE_MANIFEST_VERSION = 1 as const;
export const HYDROLOGY_BAKE_MANIFEST_PATH = '/data/hydrology/bake-manifest.json';

export interface HydrologyBakeManifestEntry {
  modeId: string;
  source: string;
  seed: number | null;
  signature: string;
  hydrologyAsset: string;
  worldSize: number;
  sampleGridSize: number;
  sampleWorldInsetPercent: number;
  sampleSpacingMeters: number;
  depressionHandling: HydrologyDepressionHandling;
  wetCandidateAccumulationQuantile: number;
  channelCandidateAccumulationQuantile: number;
  wetCandidateSlopeMaxDegrees: number;
  wetCandidateElevationMaxMeters: number;
  currentHydrologyBiomeIds: string[];
}

export interface HydrologyBakeManifest {
  schemaVersion: typeof HYDROLOGY_BAKE_MANIFEST_VERSION;
  generator: string;
  entries: HydrologyBakeManifestEntry[];
}

export interface HydrologyBakeSelectionOptions {
  modeId: string;
  seed?: number | null;
  allowSeededFallback?: boolean;
}

export interface HydrologyFetchResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}

export type HydrologyFetch = (url: string) => Promise<HydrologyFetchResponse>;

export interface LoadHydrologyBakeManifestOptions {
  manifestUrl?: string;
  fetchImpl?: HydrologyFetch;
}

export interface LoadHydrologyBakeForModeOptions extends LoadHydrologyBakeManifestOptions, HydrologyBakeSelectionOptions {}

export interface LoadedHydrologyBake {
  manifest: HydrologyBakeManifest;
  entry: HydrologyBakeManifestEntry;
  artifact: HydrologyBakeArtifact;
}

export async function loadHydrologyBakeManifest(
  options: LoadHydrologyBakeManifestOptions = {},
): Promise<HydrologyBakeManifest> {
  const manifestUrl = options.manifestUrl ?? HYDROLOGY_BAKE_MANIFEST_PATH;
  const response = await fetchHydrologyJson(manifestUrl, options.fetchImpl);
  return parseHydrologyBakeManifest(response);
}

export async function loadHydrologyBakeArtifact(
  artifactUrl: string,
  options: LoadHydrologyBakeManifestOptions = {},
): Promise<HydrologyBakeArtifact> {
  const response = await fetchHydrologyJson(artifactUrl, options.fetchImpl);
  return parseHydrologyBakeArtifact(response);
}

export async function loadHydrologyBakeForMode(
  options: LoadHydrologyBakeForModeOptions,
): Promise<LoadedHydrologyBake | null> {
  const manifestUrl = options.manifestUrl ?? HYDROLOGY_BAKE_MANIFEST_PATH;
  const manifest = await loadHydrologyBakeManifest({
    manifestUrl,
    fetchImpl: options.fetchImpl,
  });
  const entry = selectHydrologyBakeEntry(manifest, options);
  if (!entry) return null;

  const artifact = await loadHydrologyBakeArtifact(
    resolveHydrologyAssetUrl(entry.hydrologyAsset, manifestUrl),
    { fetchImpl: options.fetchImpl },
  );

  return { manifest, entry, artifact };
}

export function selectHydrologyBakeEntry(
  manifest: HydrologyBakeManifest,
  options: HydrologyBakeSelectionOptions,
): HydrologyBakeManifestEntry | undefined {
  const candidates = manifest.entries.filter((entry) => entry.modeId === options.modeId);
  if (options.seed !== undefined) {
    return candidates.find((entry) => entry.seed === options.seed);
  }

  const unseeded = candidates.find((entry) => entry.seed === null);
  if (unseeded) return unseeded;
  if (options.allowSeededFallback && candidates.length === 1) return candidates[0];
  return undefined;
}

export function resolveHydrologyAssetUrl(assetUrl: string, manifestUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(assetUrl) || assetUrl.startsWith('/')) return assetUrl;
  if (/^[a-z][a-z0-9+.-]*:/i.test(manifestUrl)) return new URL(assetUrl, manifestUrl).toString();

  const lastSlash = manifestUrl.lastIndexOf('/');
  if (lastSlash < 0) return assetUrl;
  return `${manifestUrl.slice(0, lastSlash + 1)}${assetUrl}`;
}

export function parseHydrologyBakeManifest(raw: unknown): HydrologyBakeManifest {
  const record = readRecord(raw, 'Hydrology bake manifest');
  const schemaVersion = readNumber(record, 'schemaVersion', 'Hydrology bake manifest');
  if (schemaVersion !== HYDROLOGY_BAKE_MANIFEST_VERSION) {
    throw new Error(`Unsupported hydrology bake manifest schema version ${schemaVersion}`);
  }

  const entriesRaw = record.entries;
  if (!Array.isArray(entriesRaw)) {
    throw new Error('Hydrology bake manifest entries must be an array');
  }

  return {
    schemaVersion: HYDROLOGY_BAKE_MANIFEST_VERSION,
    generator: readString(record, 'generator', 'Hydrology bake manifest'),
    entries: entriesRaw.map((entry, index) => parseHydrologyBakeManifestEntry(entry, index)),
  };
}

export function parseHydrologyBakeArtifact(raw: unknown): HydrologyBakeArtifact {
  const record = readRecord(raw, 'Hydrology bake artifact');
  const schemaVersion = readNumber(record, 'schemaVersion', 'Hydrology bake artifact');
  if (schemaVersion !== HYDROLOGY_BAKE_ARTIFACT_VERSION) {
    throw new Error(`Unsupported hydrology artifact schema version ${schemaVersion}`);
  }

  const width = readPositiveInteger(record, 'width', 'Hydrology bake artifact');
  const height = readPositiveInteger(record, 'height', 'Hydrology bake artifact');
  const cellCount = width * height;
  readPositiveNumber(record, 'cellSizeMeters', 'Hydrology bake artifact');
  readDepressionHandling(record, 'depressionHandling', 'Hydrology bake artifact');

  const transform = readRecord(record.transform, 'Hydrology bake artifact transform');
  readNumber(transform, 'originX', 'Hydrology bake artifact transform');
  readNumber(transform, 'originZ', 'Hydrology bake artifact transform');
  readPositiveNumber(transform, 'cellSizeMeters', 'Hydrology bake artifact transform');

  const thresholds = readRecord(record.thresholds, 'Hydrology bake artifact thresholds');
  readNumber(thresholds, 'accumulationP90Cells', 'Hydrology bake artifact thresholds');
  readNumber(thresholds, 'accumulationP95Cells', 'Hydrology bake artifact thresholds');
  readNumber(thresholds, 'accumulationP98Cells', 'Hydrology bake artifact thresholds');
  readNumber(thresholds, 'accumulationP99Cells', 'Hydrology bake artifact thresholds');

  const masks = readRecord(record.masks, 'Hydrology bake artifact masks');
  readCellList(masks, 'wetCandidateCells', 'Hydrology bake artifact masks', cellCount);
  readCellList(masks, 'channelCandidateCells', 'Hydrology bake artifact masks', cellCount);

  if (!Array.isArray(record.channelPolylines)) {
    throw new Error('Hydrology bake artifact channelPolylines must be an array');
  }

  return raw as HydrologyBakeArtifact;
}

function parseHydrologyBakeManifestEntry(raw: unknown, index: number): HydrologyBakeManifestEntry {
  const label = `Hydrology bake manifest entry ${index}`;
  const record = readRecord(raw, label);
  return {
    modeId: readString(record, 'modeId', label),
    source: readString(record, 'source', label),
    seed: readNullableNumber(record, 'seed', label),
    signature: readString(record, 'signature', label),
    hydrologyAsset: readString(record, 'hydrologyAsset', label),
    worldSize: readPositiveNumber(record, 'worldSize', label),
    sampleGridSize: readPositiveInteger(record, 'sampleGridSize', label),
    sampleWorldInsetPercent: readNumber(record, 'sampleWorldInsetPercent', label),
    sampleSpacingMeters: readPositiveNumber(record, 'sampleSpacingMeters', label),
    depressionHandling: readDepressionHandling(record, 'depressionHandling', label),
    wetCandidateAccumulationQuantile: readNumber(record, 'wetCandidateAccumulationQuantile', label),
    channelCandidateAccumulationQuantile: readNumber(record, 'channelCandidateAccumulationQuantile', label),
    wetCandidateSlopeMaxDegrees: readNumber(record, 'wetCandidateSlopeMaxDegrees', label),
    wetCandidateElevationMaxMeters: readNumber(record, 'wetCandidateElevationMaxMeters', label),
    currentHydrologyBiomeIds: readStringArray(record, 'currentHydrologyBiomeIds', label),
  };
}

async function fetchHydrologyJson(url: string, fetchImpl = getDefaultHydrologyFetch()): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    const status = response.status ? `${response.status} ` : '';
    throw new Error(`Failed to fetch hydrology bake asset ${url}: ${status}${response.statusText ?? ''}`.trim());
  }
  return response.json();
}

function getDefaultHydrologyFetch(): HydrologyFetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Hydrology bake loading requires fetch or an injected fetchImpl');
  }
  return (url) => globalThis.fetch(url);
}

function readRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function readNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} ${key} must be a finite number`);
  }
  return value;
}

function readPositiveNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = readNumber(record, key, label);
  if (value <= 0) throw new Error(`${label} ${key} must be positive`);
  return value;
}

function readPositiveInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = readPositiveNumber(record, key, label);
  if (!Number.isInteger(value)) throw new Error(`${label} ${key} must be an integer`);
  return value;
}

function readNullableNumber(record: Record<string, unknown>, key: string, label: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} ${key} must be null or a finite number`);
  }
  return value;
}

function readString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} ${key} must be a non-empty string`);
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, key: string, label: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} ${key} must be a string array`);
  }
  return value;
}

function readDepressionHandling(
  record: Record<string, unknown>,
  key: string,
  label: string,
): HydrologyDepressionHandling {
  const value = readString(record, key, label);
  if (value !== 'none' && value !== 'epsilon-fill') {
    throw new Error(`${label} ${key} must be a supported depression handling mode`);
  }
  return value;
}

function readCellList(record: Record<string, unknown>, key: string, label: string, cellCount: number): number[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`${label} ${key} must be an array`);
  for (const cell of value) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cellCount) {
      throw new Error(`${label} ${key} cell ${cell} is out of range`);
    }
  }
  return value as number[];
}
