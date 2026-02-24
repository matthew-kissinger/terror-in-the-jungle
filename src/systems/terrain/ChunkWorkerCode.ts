/**
 * Inline worker code for chunk generation
 * MUST match NoiseGenerator.ts exactly for seamless chunks
 */

/**
 * Get the worker code as a string
 * This code runs in a Web Worker to generate terrain chunks off the main thread
 */
export function getChunkWorkerCode(): string {
  return `
// Noise implementation - matches src/utils/NoiseGenerator.ts exactly
class WorkerNoise {
  constructor(seed = 12345) {
    this.seed = seed;
    this.perm = [];
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;

    // Seeded random - MUST match NoiseGenerator.seedRandom()
    let x = Math.sin(seed) * 10000;
    const seedRandom = () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };

    // Shuffle with seeded random
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(seedRandom() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = [...p, ...p];
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }

  // Gradient function - MUST match NoiseGenerator.grad()
  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // Noise function - MUST match NoiseGenerator.noise()
  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);

    // Permutation lookups - MUST match NoiseGenerator
    const A = this.perm[X] + Y;
    const AA = this.perm[A];
    const AB = this.perm[A + 1];
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B];
    const BB = this.perm[B + 1];

    return this.lerp(
      this.lerp(
        this.grad(this.perm[AA], x, y),
        this.grad(this.perm[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.perm[AB], x, y - 1),
        this.grad(this.perm[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }
}

let noiseGenerator = null;

// DEM data (set via 'setHeightProvider' message)
let demData = null;       // Float32Array
let demWidth = 0;
let demHeight = 0;
let demMetersPerPixel = 0;
let demOriginX = 0;
let demOriginZ = 0;
let demHalfWidthMeters = 0;
let demHalfHeightMeters = 0;
let useDEM = false;

// DEM bilinear sampling - matches DEMHeightProvider.sampleBilinear()
function sampleDEM(worldX, worldZ) {
  const relX = worldX - demOriginX + demHalfWidthMeters;
  const relZ = worldZ - demOriginZ + demHalfHeightMeters;

  const gxf = relX / demMetersPerPixel;
  const gzf = relZ / demMetersPerPixel;

  const gx = Math.max(0, Math.min(demWidth - 1.001, gxf));
  const gz = Math.max(0, Math.min(demHeight - 1.001, gzf));

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, demWidth - 1);
  const z1 = Math.min(z0 + 1, demHeight - 1);

  const fx = gx - x0;
  const fz = gz - z0;

  const h00 = demData[z0 * demWidth + x0];
  const h10 = demData[z0 * demWidth + x1];
  const h01 = demData[z1 * demWidth + x0];
  const h11 = demData[z1 * demWidth + x1];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;

  return h0 * (1 - fz) + h1 * fz;
}

// NOTE: This calculateHeight function duplicates the logic from NoiseHeightProvider.calculateHeight()
// They must match exactly to ensure seamless terrain generation between main thread and workers.
function calculateHeightNoise(worldX, worldZ, noise) {
  let continentalHeight = noise.noise(worldX * 0.001, worldZ * 0.001);
  let ridgeNoise = 1 - Math.abs(noise.noise(worldX * 0.003, worldZ * 0.003));
  ridgeNoise = Math.pow(ridgeNoise, 1.5);
  let valleyNoise = noise.noise(worldX * 0.008, worldZ * 0.008);
  valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);
  let hillNoise = 0;
  hillNoise += noise.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
  hillNoise += noise.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
  hillNoise += noise.noise(worldX * 0.06, worldZ * 0.06) * 0.125;
  let detailNoise = noise.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

  let height = 0;
  height += (continentalHeight * 0.5 + 0.5) * 30;
  const t = Math.max(0, Math.min(1, (continentalHeight - (-0.3)) / (0.2 - (-0.3))));
  const ridgeStrength = t * t * (3 - 2 * t);
  height += ridgeNoise * 80 * ridgeStrength;
  height += valleyNoise * 40;
  height += hillNoise * 35;
  height += detailNoise * 8;

  const waterNoise = noise.noise(worldX * 0.003, worldZ * 0.003);
  const riverNoise = noise.noise(worldX * 0.01, worldZ * 0.01);
  if (waterNoise < -0.4 && height < 15) {
    height = -3 - waterNoise * 2;
  } else if (Math.abs(riverNoise) < 0.1 && height < 25) {
    height = height * 0.3 - 2;
  } else if (height < 20) {
    height = height * 0.7;
  }
  return Math.max(-8, height);
}

// Dispatch: use DEM if loaded, otherwise noise
function calculateHeight(worldX, worldZ, noise) {
  if (useDEM) {
    return sampleDEM(worldX, worldZ);
  }
  return calculateHeightNoise(worldX, worldZ, noise);
}

function generateChunk(request) {
  const { chunkX, chunkZ, size, segments, seed, requestId } = request;
  if (!noiseGenerator) noiseGenerator = new WorkerNoise(seed);

  const baseX = chunkX * size;
  const baseZ = chunkZ * size;
  const segmentSize = size / segments;
  const vertexCount = (segments + 1) * (segments + 1);
  const indexCount = segments * segments * 6;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  const heightData = new Float32Array(vertexCount);

  let vertexIndex = 0;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const worldX = baseX + x * segmentSize;
      const worldZ = baseZ + z * segmentSize;
      const height = calculateHeight(worldX, worldZ, noiseGenerator);
      const posIndex = vertexIndex * 3;
      positions[posIndex] = x * segmentSize - size / 2;
      positions[posIndex + 1] = height;
      positions[posIndex + 2] = z * segmentSize - size / 2;
      const uvIndex = vertexIndex * 2;
      uvs[uvIndex] = x / segments;
      uvs[uvIndex + 1] = z / segments;
      heightData[vertexIndex] = height;
      vertexIndex++;
    }
  }

  let indexIndex = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const topLeft = z * (segments + 1) + x;
      const topRight = topLeft + 1;
      const bottomLeft = (z + 1) * (segments + 1) + x;
      const bottomRight = bottomLeft + 1;
      indices[indexIndex++] = topLeft;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = topRight;
      indices[indexIndex++] = topRight;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = bottomRight;
    }
  }

  const normalAccum = new Float32Array(vertexCount * 3);
  for (let i = 0; i < indexCount; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    normalAccum[i0] += nx; normalAccum[i0 + 1] += ny; normalAccum[i0 + 2] += nz;
    normalAccum[i1] += nx; normalAccum[i1 + 1] += ny; normalAccum[i1 + 2] += nz;
    normalAccum[i2] += nx; normalAccum[i2 + 1] += ny; normalAccum[i2 + 2] += nz;
  }
  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const nx = normalAccum[idx], ny = normalAccum[idx + 1], nz = normalAccum[idx + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[idx] = nx / len;
    normals[idx + 1] = ny / len;
    normals[idx + 2] = nz / len;
  }

  // Generate vegetation positions (moved from main thread)
  const vegetationData = generateVegetationPositions(chunkX, chunkZ, size, heightData, segments);

  return {
    type: 'result',
    requestId,
    chunkX,
    chunkZ,
    positions,
    normals,
    uvs,
    indices,
    heightData,
    vegetation: vegetationData
  };
}

// Poisson disk sampling for natural distribution
function poissonDiskSampling(width, height, minDist) {
  const cellSize = minDist / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  const points = [];
  const active = [];

  const addPoint = (x, y) => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
      grid[gy * gridWidth + gx] = points.length;
      points.push({ x, y });
      active.push(points.length - 1);
    }
  };

  // Start with random point
  addPoint(Math.random() * width, Math.random() * height);

  const maxPoints = Math.min(1500, Math.max(500, Math.floor(width * height / (minDist * minDist))));
  while (active.length > 0 && points.length < maxPoints) {
    const idx = Math.floor(Math.random() * active.length);
    const point = points[active[idx]];
    let found = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * minDist;
      const nx = point.x + Math.cos(angle) * dist;
      const ny = point.y + Math.sin(angle) * dist;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const gx = Math.floor(nx / cellSize);
      const gy = Math.floor(ny / cellSize);
      let valid = true;

      for (let dy = -2; dy <= 2 && valid; dy++) {
        for (let dx = -2; dx <= 2 && valid; dx++) {
          const checkX = gx + dx;
          const checkY = gy + dy;
          if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
            const checkIdx = grid[checkY * gridWidth + checkX];
            if (checkIdx !== -1) {
              const other = points[checkIdx];
              const distSq = (nx - other.x) ** 2 + (ny - other.y) ** 2;
              if (distSq < minDist * minDist) valid = false;
            }
          }
        }
      }

      if (valid) {
        addPoint(nx, ny);
        found = true;
        break;
      }
    }

    if (!found) active.splice(idx, 1);
  }

  return points;
}

function getHeightAtLocal(heightData, segments, size, localX, localZ) {
  localX = Math.max(0, Math.min(size, localX));
  localZ = Math.max(0, Math.min(size, localZ));

  const gridX = (localX / size) * segments;
  const gridZ = (localZ / size) * segments;

  const x0 = Math.floor(gridX);
  const x1 = Math.min(x0 + 1, segments);
  const z0 = Math.floor(gridZ);
  const z1 = Math.min(z0 + 1, segments);

  const fx = gridX - x0;
  const fz = gridZ - z0;

  const getIndex = (x, z) => z * (segments + 1) + x;

  const h00 = heightData[getIndex(x0, z0)];
  const h10 = heightData[getIndex(x1, z0)];
  const h01 = heightData[getIndex(x0, z1)];
  const h11 = heightData[getIndex(x1, z1)];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;

  return h0 * (1 - fz) + h1 * fz;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

// Compute slope at a local position using adjacent height samples
function getSlopeAtLocal(heightData, segments, size, localX, localZ) {
  const sampleDist = size / segments;
  const h = getHeightAtLocal(heightData, segments, size, localX, localZ);
  const hN = getHeightAtLocal(heightData, segments, size, localX, Math.min(size, localZ + sampleDist));
  const hE = getHeightAtLocal(heightData, segments, size, Math.min(size, localX + sampleDist), localZ);
  const dz = hN - h;
  const dx = hE - h;
  const slopeAngle = Math.atan(Math.sqrt(dx * dx + dz * dz) / sampleDist);
  return slopeAngle * (180 / Math.PI); // degrees
}

// ---------------------------------------------------------------------------
// Biome classification (mirrors BiomeClassifier.ts)
// ---------------------------------------------------------------------------
let biomeRules = [];        // Array of { biomeId, elevationMin?, elevationMax?, slopeMax?, priority }
let defaultBiomeId = 'denseJungle';
let allBiomePalettes = {};  // Record<biomeId, vegetationPalette[]>

function computeSlopeFromHeightData(heightData, segments, size) {
  const mid = Math.floor(segments / 2);
  const s = segments + 1;
  const hC = heightData[mid * s + mid] || 0;
  const hE = heightData[mid * s + Math.min(mid + 1, segments)] || 0;
  const hN = heightData[Math.min(mid + 1, segments) * s + mid] || 0;
  const step = size / segments;
  const dx = hE - hC;
  const dz = hN - hC;
  return Math.atan(Math.sqrt(dx * dx + dz * dz) / step) * (180 / Math.PI);
}

function classifyBiomeWorker(elevation, slopeDeg) {
  if (!biomeRules || biomeRules.length === 0) return defaultBiomeId;
  let bestId = defaultBiomeId;
  let bestPri = -Infinity;
  for (let i = 0; i < biomeRules.length; i++) {
    const r = biomeRules[i];
    if (r.priority <= bestPri) continue;
    if (r.elevationMin !== undefined && elevation < r.elevationMin) continue;
    if (r.elevationMax !== undefined && elevation > r.elevationMax) continue;
    if (r.slopeMax !== undefined && slopeDeg > r.slopeMax) continue;
    bestId = r.biomeId;
    bestPri = r.priority;
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// Data-driven vegetation generation
// vegetationTypes and biomePalette are sent via 'setVegetationConfig' message
// ---------------------------------------------------------------------------
let vegTypes = [];      // Array of { id, yOffset, baseDensity, placement, poissonMinDistance }
let biomePalette = [];  // Array of { typeId, densityMultiplier }

const TRUNK_R_SQ = 9;
const TRUNK_CELL = 3;

function densityNoise(wx, wz) {
  let h = ((wx * 374761 | 0) ^ (wz * 668265 | 0)) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fff) / 0x7fff;
}

function createTrunkGrid() {
  const cells = {};
  function key(cx, cz) { return (cx + 1000) * 10000 + (cz + 1000); }
  return {
    add(x, z) {
      const k = key(Math.floor(x / TRUNK_CELL), Math.floor(z / TRUNK_CELL));
      if (!cells[k]) cells[k] = [];
      cells[k].push({ x, z });
    },
    isNear(lx, lz) {
      const cx = Math.floor(lx / TRUNK_CELL);
      const cz = Math.floor(lz / TRUNK_CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = cells[key(cx + dx, cz + dz)];
          if (!cell) continue;
          for (let i = 0; i < cell.length; i++) {
            const ddx = lx - cell[i].x;
            const ddz = lz - cell[i].z;
            if (ddx * ddx + ddz * ddz < TRUNK_R_SQ) return true;
          }
        }
      }
      return false;
    }
  };
}

function generateVegetationPositions(chunkX, chunkZ, size, heightData, segments, palette) {
  const baseX = chunkX * size;
  const baseZ = chunkZ * size;
  const DENSITY_PER_UNIT = 1.0 / 128.0;
  const MAX_PER_TYPE = Math.min(1500, Math.max(500, Math.floor(size * size / 128)));

  const vegetation = {};
  const densityMap = {};
  const activePalette = palette || biomePalette;
  for (const entry of activePalette) densityMap[entry.typeId] = entry.densityMultiplier;

  const canopyTypes = [];
  const midPoissonTypes = [];
  const groundTypes = [];
  for (const vt of vegTypes) {
    const d = densityMap[vt.id];
    if (d === undefined || d <= 0) continue;
    if (vt.tier === 'canopy') canopyTypes.push(vt);
    else if (vt.tier === 'midLevel' && vt.placement === 'poisson') midPoissonTypes.push(vt);
    else groundTypes.push(vt);
  }

  const trunkGrid = createTrunkGrid();
  const MAX_CANOPY_SLOPE = 30;
  const MAX_MID_SLOPE = 40;

  // ---- CANOPY: shared grid, slope + water + density noise ----
  if (canopyTypes.length > 0) {
    let maxMinDist = 16;
    for (const ct of canopyTypes) {
      if ((ct.poissonMinDistance || 16) > maxMinDist) maxMinDist = ct.poissonMinDistance;
    }
    const sharedPoints = poissonDiskSampling(size, size, maxMinDist);
    let totalW = 0;
    const weights = [];
    for (const ct of canopyTypes) {
      const w = ct.baseDensity * (densityMap[ct.id] || 0);
      weights.push({ t: ct, w });
      totalW += w;
    }
    let idx = 0;
    for (const wt of weights) {
      const share = totalW > 0 ? wt.w / totalW : 0;
      const count = Math.floor(sharedPoints.length * share);
      const insts = [];
      for (let i = 0; i < count && idx < sharedPoints.length; i++, idx++) {
        const p = sharedPoints[idx];
        const h = getHeightAtLocal(heightData, segments, size, p.x, p.y);
        if (h < 0) continue;
        const slope = getSlopeAtLocal(heightData, segments, size, p.x, p.y);
        if (slope > MAX_CANOPY_SLOPE) continue;
        const dn = densityNoise(baseX + p.x, baseZ + p.y);
        if (dn < 0.15) continue;
        const s = randomInRange(0.9, 1.1);
        insts.push({ x: baseX + p.x, y: h + wt.t.yOffset, z: baseZ + p.y, sx: s, sy: s });
        trunkGrid.add(p.x, p.y);
      }
      if (insts.length > 0) vegetation[wt.t.id] = insts;
    }
  }

  // ---- MID-LEVEL POISSON: shared grid, moderate slope ----
  if (midPoissonTypes.length > 0) {
    let maxMinDist = 8;
    for (const mt of midPoissonTypes) {
      if ((mt.poissonMinDistance || 8) > maxMinDist) maxMinDist = mt.poissonMinDistance;
    }
    const sharedPoints = poissonDiskSampling(size, size, maxMinDist);
    let totalW = 0;
    const weights = [];
    for (const mt of midPoissonTypes) {
      const w = mt.baseDensity * (densityMap[mt.id] || 0);
      weights.push({ t: mt, w });
      totalW += w;
    }
    let idx = 0;
    for (const wt of weights) {
      const share = totalW > 0 ? wt.w / totalW : 0;
      const count = Math.floor(sharedPoints.length * share);
      const insts = [];
      for (let i = 0; i < count && idx < sharedPoints.length; i++, idx++) {
        const p = sharedPoints[idx];
        const h = getHeightAtLocal(heightData, segments, size, p.x, p.y);
        if (h < 0) continue;
        const slope = getSlopeAtLocal(heightData, segments, size, p.x, p.y);
        if (slope > MAX_MID_SLOPE) continue;
        const dn = densityNoise(baseX + p.x, baseZ + p.y);
        if (dn < 0.1) continue;
        const s = randomInRange(0.9, 1.1);
        insts.push({ x: baseX + p.x, y: h + wt.t.yOffset, z: baseZ + p.y, sx: s, sy: s });
        trunkGrid.add(p.x, p.y);
      }
      if (insts.length > 0) vegetation[wt.t.id] = insts;
    }
  }

  // ---- GROUND COVER + RANDOM MID: trunk suppression, water, density noise ----
  for (const vt of groundTypes) {
    const biomeDensity = densityMap[vt.id];
    const effectiveDensity = vt.baseDensity * biomeDensity;
    const insts = [];

    if (vt.placement === 'poisson') {
      const minDist = vt.poissonMinDistance || 10;
      const pts = poissonDiskSampling(size, size, minDist);
      const maxCount = Math.min(MAX_PER_TYPE, Math.floor(size * size * DENSITY_PER_UNIT * effectiveDensity));
      const limit = Math.min(pts.length, maxCount);
      for (let i = 0; i < limit; i++) {
        const p = pts[i];
        const h = getHeightAtLocal(heightData, segments, size, p.x, p.y);
        if (h < 0) continue;
        if (trunkGrid.isNear(p.x, p.y)) continue;
        const s = randomInRange(0.9, 1.1);
        insts.push({ x: baseX + p.x, y: h + vt.yOffset, z: baseZ + p.y, sx: s, sy: s });
      }
    } else {
      const count = Math.min(MAX_PER_TYPE, Math.floor(size * size * DENSITY_PER_UNIT * effectiveDensity));
      for (let i = 0; i < count; i++) {
        const lx = Math.random() * size;
        const lz = Math.random() * size;
        const h = getHeightAtLocal(heightData, segments, size, lx, lz);
        if (h < 0) continue;
        if (trunkGrid.isNear(lx, lz)) continue;
        const dn = densityNoise(baseX + lx, baseZ + lz);
        if (Math.random() > dn) continue;
        const s = randomInRange(0.9, 1.1);
        insts.push({ x: baseX + lx, y: h + vt.yOffset, z: baseZ + lz, sx: s, sy: s });
      }
    }

    if (insts.length > 0) vegetation[vt.id] = insts;
  }

  return vegetation;
}

self.onmessage = function(event) {
  const request = event.data;

  if (request.type === 'setHeightProvider') {
    if (request.providerType === 'dem') {
      demData = new Float32Array(request.buffer);
      demWidth = request.width;
      demHeight = request.height;
      demMetersPerPixel = request.metersPerPixel;
      demOriginX = request.originX;
      demOriginZ = request.originZ;
      demHalfWidthMeters = (demWidth * demMetersPerPixel) / 2;
      demHalfHeightMeters = (demHeight * demMetersPerPixel) / 2;
      useDEM = true;
      self.postMessage({ type: 'providerReady' });
    } else if (request.providerType === 'noise') {
      useDEM = false;
      noiseGenerator = new WorkerNoise(request.seed);
      self.postMessage({ type: 'providerReady' });
    }
    return;
  }

  if (request.type === 'setVegetationConfig') {
    vegTypes = request.vegetationTypes || [];
    biomePalette = request.biomePalette || [];
    return;
  }

  if (request.type === 'setBiomeConfig') {
    biomeRules = request.biomeRules || [];
    defaultBiomeId = request.defaultBiomeId || 'denseJungle';
    allBiomePalettes = request.allBiomePalettes || {};
    return;
  }

  if (request.type === 'generate') {
    const result = generateChunk(request);

    // Classify biome from chunk center height + slope
    const cx = request.chunkX * request.size + request.size / 2;
    const cz = request.chunkZ * request.size + request.size / 2;
    const centerIdx = Math.floor(request.segments / 2) * (request.segments + 1) + Math.floor(request.segments / 2);
    const centerElev = result.heightData[centerIdx] || 0;
    const centerSlope = computeSlopeFromHeightData(result.heightData, request.segments, request.size);
    const chunkBiomeId = classifyBiomeWorker(centerElev, centerSlope);

    // Re-generate vegetation with per-chunk biome palette if available
    const chunkPalette = allBiomePalettes[chunkBiomeId];
    if (chunkPalette && chunkPalette.length > 0) {
      const perBiomeVeg = generateVegetationPositions(
        request.chunkX, request.chunkZ, request.size,
        result.heightData, request.segments, chunkPalette
      );
      result.vegetation = perBiomeVeg;
    }

    result.biomeId = chunkBiomeId;

    self.postMessage(result, [
      result.positions.buffer,
      result.normals.buffer,
      result.uvs.buffer,
      result.indices.buffer,
      result.heightData.buffer
    ]);
  }
};
self.postMessage({ type: 'ready' });
`;
}
