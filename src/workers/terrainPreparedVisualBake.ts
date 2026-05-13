const SOURCE_DELTA_EPSILON_METERS = 0.01;
const MIN_EDGE_SLOPE_SAMPLE_METERS = 8;
const MAX_EDGE_SLOPE_SAMPLE_METERS = 64;
const MAX_EDGE_EXTRAPOLATION_METERS = 320;
const SOURCE_DELTA_CACHE_TARGET_SPACING_METERS = 64;
const SOURCE_DELTA_CACHE_MIN_GRID_SIZE = 33;
const SOURCE_DELTA_CACHE_MAX_GRID_SIZE = 129;

interface SourceDeltaCache {
  data: Float32Array;
  gridSize: number;
  worldSize: number;
}

type SourceSampler<TConfig> = (config: TConfig, worldX: number, worldZ: number) => number;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function bakePreparedVisualGrid<TConfig>(
  preparedData: Float32Array,
  preparedGridSize: number,
  playableWorldSize: number,
  visualMargin: number,
  sourceConfig: TConfig,
  sampleSourceHeight: SourceSampler<TConfig>,
  gridSize: number,
  worldSize: number,
): Float32Array {
  const data = new Float32Array(gridSize * gridSize);
  const halfWorld = worldSize / 2;
  const step = worldSize / (gridSize - 1);
  const sourceDeltaCache = buildSourceDeltaCache(
    sourceConfig,
    sampleSourceHeight,
    playableWorldSize,
    visualMargin,
    worldSize,
  );

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const wx = -halfWorld + x * step;
      const wz = -halfWorld + z * step;
      data[z * gridSize + x] = samplePreparedVisualHeight(
        preparedData,
        preparedGridSize,
        playableWorldSize,
        visualMargin,
        sourceDeltaCache,
        wx,
        wz,
      );
    }
  }

  return data;
}

function samplePreparedVisualHeight(
  preparedData: Float32Array,
  preparedGridSize: number,
  playableWorldSize: number,
  visualMargin: number,
  sourceDeltaCache: SourceDeltaCache,
  worldX: number,
  worldZ: number,
): number {
  const halfPlayable = Math.max(0, playableWorldSize * 0.5);
  const halfVisual = halfPlayable + Math.max(0, visualMargin);
  const clampedX = clamp(worldX, -halfPlayable, halfPlayable);
  const clampedZ = clamp(worldZ, -halfPlayable, halfPlayable);

  if (worldX === clampedX && worldZ === clampedZ) {
    return samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, worldX, worldZ);
  }

  const sampleX = clamp(worldX, -halfVisual, halfVisual);
  const sampleZ = clamp(worldZ, -halfVisual, halfVisual);
  const edgeBaseHeight = samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, clampedX, clampedZ);
  const sourceDelta = sampleSourceDeltaCache(sourceDeltaCache, sampleX, sampleZ);

  if (Math.abs(sourceDelta) > SOURCE_DELTA_EPSILON_METERS) {
    return edgeBaseHeight + sourceDelta;
  }

  return edgeBaseHeight + estimatePreparedEdgeSlopeDelta(
    preparedData,
    preparedGridSize,
    playableWorldSize,
    worldX,
    worldZ,
    clampedX,
    clampedZ,
    halfPlayable,
    halfVisual,
  );
}

function buildSourceDeltaCache<TConfig>(
  sourceConfig: TConfig,
  sampleSourceHeight: SourceSampler<TConfig>,
  playableWorldSize: number,
  visualMargin: number,
  worldSize: number,
): SourceDeltaCache {
  const requestedGridSize = Math.ceil(worldSize / SOURCE_DELTA_CACHE_TARGET_SPACING_METERS) + 1;
  const gridSize = Math.max(
    SOURCE_DELTA_CACHE_MIN_GRID_SIZE,
    Math.min(SOURCE_DELTA_CACHE_MAX_GRID_SIZE, requestedGridSize),
  );
  const data = new Float32Array(gridSize * gridSize);
  const halfWorld = worldSize / 2;
  const halfPlayable = Math.max(0, playableWorldSize * 0.5);
  const halfVisual = halfPlayable + Math.max(0, visualMargin);
  const step = worldSize / (gridSize - 1);

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const worldX = clamp(-halfWorld + x * step, -halfVisual, halfVisual);
      const worldZ = clamp(-halfWorld + z * step, -halfVisual, halfVisual);
      const clampedX = clamp(worldX, -halfPlayable, halfPlayable);
      const clampedZ = clamp(worldZ, -halfPlayable, halfPlayable);
      data[z * gridSize + x] = sampleSourceHeight(sourceConfig, worldX, worldZ)
        - sampleSourceHeight(sourceConfig, clampedX, clampedZ);
    }
  }

  return { data, gridSize, worldSize };
}

function sampleSourceDeltaCache(cache: SourceDeltaCache, worldX: number, worldZ: number): number {
  return samplePreparedGrid(cache.data, cache.gridSize, cache.worldSize, worldX, worldZ);
}

function samplePreparedGrid(
  data: Float32Array,
  gridSize: number,
  worldSize: number,
  worldX: number,
  worldZ: number,
): number {
  if (gridSize <= 1) return data[0] ?? 0;
  const halfWorld = worldSize / 2;
  const gx = ((worldX + halfWorld) / worldSize) * (gridSize - 1);
  const gz = ((worldZ + halfWorld) / worldSize) * (gridSize - 1);
  const x0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gx)));
  const z0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gz)));
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const fx = gx - x0;
  const fz = gz - z0;
  const h00 = data[z0 * gridSize + x0];
  const h10 = data[z0 * gridSize + x1];
  const h01 = data[z1 * gridSize + x0];
  const h11 = data[z1 * gridSize + x1];
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fz) + h1 * fz;
}

function estimatePreparedEdgeSlopeDelta(
  preparedData: Float32Array,
  preparedGridSize: number,
  playableWorldSize: number,
  worldX: number,
  worldZ: number,
  clampedX: number,
  clampedZ: number,
  halfPlayable: number,
  halfVisual: number,
): number {
  const outsideX = worldX - clampedX;
  const outsideZ = worldZ - clampedZ;
  const outsideDistance = Math.hypot(outsideX, outsideZ);
  if (outsideDistance <= 0) return 0;

  const sampleStep = clamp(halfPlayable / 128, MIN_EDGE_SLOPE_SAMPLE_METERS, MAX_EDGE_SLOPE_SAMPLE_METERS);
  let delta = 0;
  let weight = 0;

  if (Math.abs(outsideX) > 0) {
    const signX = Math.sign(outsideX);
    const innerX = clamp(clampedX - signX * sampleStep, -halfPlayable, halfPlayable);
    const inwardDistance = Math.abs(clampedX - innerX);
    if (inwardDistance > 0) {
      const edge = samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, clampedX, clampedZ);
      const inner = samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, innerX, clampedZ);
      delta += ((edge - inner) / inwardDistance) * Math.abs(outsideX);
      weight++;
    }
  }

  if (Math.abs(outsideZ) > 0) {
    const signZ = Math.sign(outsideZ);
    const innerZ = clamp(clampedZ - signZ * sampleStep, -halfPlayable, halfPlayable);
    const inwardDistance = Math.abs(clampedZ - innerZ);
    if (inwardDistance > 0) {
      const edge = samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, clampedX, clampedZ);
      const inner = samplePreparedGrid(preparedData, preparedGridSize, playableWorldSize, clampedX, innerZ);
      delta += ((edge - inner) / inwardDistance) * Math.abs(outsideZ);
      weight++;
    }
  }

  if (weight === 0) return 0;
  const averagedDelta = delta / weight;
  const fade = 1 - clamp(outsideDistance / Math.max(1, halfVisual - halfPlayable), 0, 1) * 0.35;
  return clamp(averagedDelta * fade, -MAX_EDGE_EXTRAPOLATION_METERS, MAX_EDGE_EXTRAPOLATION_METERS);
}

export function generateNormalData(heightData: Float32Array, width: number, height: number, worldSize: number): Uint8Array {
  const normalData = new Uint8Array(width * height * 4);
  const cellSize = worldSize / (width - 1);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const idx = z * width + x;
      const xp = Math.min(x + 1, width - 1);
      const xm = Math.max(x - 1, 0);
      const zp = Math.min(z + 1, height - 1);
      const zm = Math.max(z - 1, 0);
      const hL = heightData[z * width + xm];
      const hR = heightData[z * width + xp];
      const hD = heightData[zm * width + x];
      const hU = heightData[zp * width + x];
      const dx = (hR - hL) / (cellSize * (xp - xm));
      const dz = (hU - hD) / (cellSize * (zp - zm));
      const len = Math.sqrt(dx * dx + 1 + dz * dz);
      const nx = -dx / len;
      const ny = 1 / len;
      const nz = -dz / len;
      const outIdx = idx * 4;
      normalData[outIdx] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData[outIdx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData[outIdx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData[outIdx + 3] = 255;
    }
  }

  return normalData;
}
