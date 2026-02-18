/**
 * One-time script to extract river polylines from the HydroViet shapefile
 * that intersect our A Shau Valley DEM bounding box, and convert them
 * to game world coordinates.
 *
 * Usage:  node data/vietnam/scripts/extract-rivers.mjs
 * Output: data/vietnam/reference/a-shau-rivers.json
 *         public/data/vietnam/a-shau-rivers.json (runtime copy)
 */

import { open } from 'shapefile';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

// --- DEM bounding box (from a-shau-z14-9x9.f32.meta.json) ---
const GEO_BOUNDS = {
  north: 16.320139453117566,
  south: 16.130262012034756,
  west: 107.07275390625,
  east: 107.2705078125
};

// Add a small margin so rivers that graze the edge are included
const MARGIN_DEG = 0.01;
const BBOX = {
  north: GEO_BOUNDS.north + MARGIN_DEG,
  south: GEO_BOUNDS.south - MARGIN_DEG,
  west: GEO_BOUNDS.west - MARGIN_DEG,
  east: GEO_BOUNDS.east + MARGIN_DEG
};

// --- World coordinate conversion (must match AShauValleyConfig.ts) ---
const DEM_WIDTH = 2304;
const DEM_HEIGHT = 2304;
const METERS_PER_PIXEL = 9;
const COVERAGE_METERS = DEM_WIDTH * METERS_PER_PIXEL; // 20736
const HALF_WORLD = COVERAGE_METERS / 2;

function geoToWorld(lat, lon) {
  const lonFrac = (lon - GEO_BOUNDS.west) / (GEO_BOUNDS.east - GEO_BOUNDS.west);
  const latFrac = (lat - GEO_BOUNDS.south) / (GEO_BOUNDS.north - GEO_BOUNDS.south);
  const worldX = lonFrac * COVERAGE_METERS - HALF_WORLD;
  const worldZ = (1 - latFrac) * COVERAGE_METERS - HALF_WORLD; // Z flipped (north = -Z)
  return [worldX, worldZ];
}

function pointInBBox(lon, lat) {
  return lon >= BBOX.west && lon <= BBOX.east &&
         lat >= BBOX.south && lat <= BBOX.north;
}

// Check if any point of a line segment intersects the bbox
function lineIntersectsBBox(coords) {
  for (const [lon, lat] of coords) {
    if (pointInBBox(lon, lat)) return true;
  }
  return false;
}

// Clip a polyline to the bounding box, returning segments that are inside
function clipPolylineToBBox(coords) {
  const segments = [];
  let current = [];

  for (const [lon, lat] of coords) {
    if (pointInBBox(lon, lat)) {
      current.push([lon, lat]);
    } else {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }
  return segments;
}

// --- Extract the shapefile from zip ---
async function extractAndParse() {
  const shpPath = resolve(ROOT, 'data/vietnam/reference/hydroviet-rivers/temp_rivers/gms_river.shp');
  const dbfPath = resolve(ROOT, 'data/vietnam/reference/hydroviet-rivers/temp_rivers/gms_river.dbf');

  console.log('Opening shapefile:', shpPath);
  const source = await open(shpPath, dbfPath, { encoding: 'utf-8' });

  const rivers = [];
  let totalFeatures = 0;
  let matchedFeatures = 0;

  while (true) {
    const result = await source.read();
    if (result.done) break;
    totalFeatures++;

    const feature = result.value;
    const geom = feature.geometry;
    if (!geom) continue;

    // Handle MultiLineString and LineString
    let lineGroups;
    if (geom.type === 'MultiLineString') {
      lineGroups = geom.coordinates;
    } else if (geom.type === 'LineString') {
      lineGroups = [geom.coordinates];
    } else {
      continue;
    }

    for (const coords of lineGroups) {
      if (!lineIntersectsBBox(coords)) continue;

      // Clip to bbox and convert to world coords
      const clipped = clipPolylineToBBox(coords);
      for (const segment of clipped) {
        matchedFeatures++;
        const worldPoints = segment.map(([lon, lat]) => {
          const [wx, wz] = geoToWorld(lat, lon);
          return [Math.round(wx * 10) / 10, Math.round(wz * 10) / 10];
        });

        // Simplify: skip segments shorter than 3 points or 50m total length
        if (worldPoints.length < 3) continue;
        let totalLen = 0;
        for (let i = 1; i < worldPoints.length; i++) {
          const dx = worldPoints[i][0] - worldPoints[i - 1][0];
          const dz = worldPoints[i][1] - worldPoints[i - 1][1];
          totalLen += Math.sqrt(dx * dx + dz * dz);
        }
        if (totalLen < 50) continue;

        rivers.push({
          points: worldPoints,
          lengthM: Math.round(totalLen),
          properties: feature.properties || {}
        });
      }
    }
  }

  console.log(`Scanned ${totalFeatures} features, found ${matchedFeatures} segments in bbox`);
  console.log(`After filtering: ${rivers.length} river segments`);

  // Sort by length (longest first)
  rivers.sort((a, b) => b.lengthM - a.lengthM);

  // Print summary
  for (const r of rivers.slice(0, 10)) {
    const name = r.properties.Name || r.properties.NAME || r.properties.name || '(unnamed)';
    console.log(`  ${name}: ${r.lengthM}m, ${r.points.length} points`);
  }

  return rivers;
}

// --- Douglas-Peucker simplification ---
function simplifyPolyline(points, tolerance) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolyline(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolyline(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  } else {
    return [start, end];
  }
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dz = lineEnd[1] - lineStart[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len === 0) return Math.sqrt((point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2);
  return Math.abs(dx * (lineStart[1] - point[1]) - (lineStart[0] - point[0]) * dz) / len;
}

// --- Main ---
async function main() {
  // Step 1: Get the major river from the shapefile
  const shapefileRivers = await extractAndParse();
  const majorRivers = shapefileRivers.map(r => ({
    points: simplifyPolyline(r.points, 20),
    lengthM: r.lengthM,
    name: r.properties.Name || r.properties.NAME || r.properties.name || null,
    source: 'shapefile',
    width: 12 // Major river default width in meters
  }));

  // Step 2: Derive tributaries from DEM flow accumulation
  console.log('\n--- Adding DEM-derived tributaries ---');
  const tributaries = await deriveRiversFromDEM();

  // Combine: major rivers first, then tributaries sorted by length
  const allRivers = [
    ...majorRivers,
    ...tributaries
  ];

  console.log(`\nTotal: ${allRivers.length} river segments (${majorRivers.length} major + ${tributaries.length} tributaries)`);

  const output = {
    description: 'River polylines for A Shau Valley. Major rivers from HydroViet GMS shapefile, tributaries from DEM flow accumulation.',
    geoBounds: GEO_BOUNDS,
    coverageMeters: COVERAGE_METERS,
    generated: new Date().toISOString(),
    rivers: allRivers
  };

  const jsonStr = JSON.stringify(output, null, 2);

  const refPath = resolve(ROOT, 'data/vietnam/reference/a-shau-rivers.json');
  writeFileSync(refPath, jsonStr);
  console.log(`\nWrote ${refPath} (${(jsonStr.length / 1024).toFixed(1)} KB)`);

  const pubDir = resolve(ROOT, 'public/data/vietnam');
  mkdirSync(pubDir, { recursive: true });
  const pubPath = resolve(pubDir, 'a-shau-rivers.json');
  writeFileSync(pubPath, jsonStr);
  console.log(`Wrote ${pubPath}`);
}

// --- Derive rivers from DEM elevation data (D8 flow accumulation) ---
async function deriveRiversFromDEM() {
  console.log('\n--- DEM-derived river extraction ---');
  const demPath = resolve(ROOT, 'data/vietnam/big-map/a-shau-z14-9x9.f32');
  const buffer = readFileSync(demPath);
  const dem = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  console.log(`DEM loaded: ${DEM_WIDTH}x${DEM_HEIGHT}, ${dem.length} samples`);
  console.log(`Elevation range: ${Math.min(...dem.slice(0, 1000)).toFixed(1)} to ${Math.max(...dem.slice(0, 1000)).toFixed(1)} (first 1000 samples)`);

  // Flow accumulation: for each cell, follow steepest descent and count upstream cells
  // This is a simplified D8 flow routing algorithm
  const W = DEM_WIDTH;
  const H = DEM_HEIGHT;
  const flow = new Uint32Array(W * H); // accumulation count
  const flowDir = new Int8Array(W * H); // direction index (0-7)

  // D8 neighbor offsets: E, NE, N, NW, W, SW, S, SE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dz = [0, -1, -1, -1, 0, 1, 1, 1];
  const diagDist = Math.SQRT2;

  console.log('Computing flow directions...');

  // Compute flow direction for each cell (steepest descent)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const idx = z * W + x;
      const h = dem[idx];
      let maxSlope = 0;
      let bestDir = -1;
      for (let d = 0; d < 8; d++) {
        const nx = x + dx[d];
        const nz = z + dz[d];
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        const nh = dem[nz * W + nx];
        const dist = (d % 2 === 0) ? 1 : diagDist;
        const slope = (h - nh) / dist;
        if (slope > maxSlope) {
          maxSlope = slope;
          bestDir = d;
        }
      }
      flowDir[idx] = bestDir;
    }
  }

  console.log('Computing flow accumulation...');

  // Sort cells by elevation (highest first) for efficient accumulation
  const indices = Array.from({ length: W * H }, (_, i) => i);
  indices.sort((a, b) => dem[b] - dem[a]);

  // Accumulate flow
  for (const idx of indices) {
    flow[idx] += 1; // count self
    const dir = flowDir[idx];
    if (dir < 0) continue;
    const x = idx % W;
    const z = Math.floor(idx / W);
    const nx = x + dx[dir];
    const nz = z + dz[dir];
    if (nx >= 0 && nx < W && nz >= 0 && nz < H) {
      flow[nz * W + nx] += flow[idx];
    }
  }

  // Find max accumulation for thresholding
  let maxFlow = 0;
  for (let i = 0; i < flow.length; i++) {
    if (flow[i] > maxFlow) maxFlow = flow[i];
  }
  console.log(`Max flow accumulation: ${maxFlow}`);

  // Threshold: cells with high flow accumulation are "river"
  // At 9m resolution over a 2304^2 grid, we want meaningful streams.
  // 2000 upstream cells ~ a watershed of ~162,000 m^2 (0.4km x 0.4km)
  const threshold = 2000;
  console.log(`River threshold: ${threshold} upstream cells`);

  // Extract river cells and trace connected segments
  const isRiver = new Uint8Array(W * H);
  let riverCellCount = 0;
  for (let i = 0; i < flow.length; i++) {
    if (flow[i] >= threshold) {
      isRiver[i] = 1;
      riverCellCount++;
    }
  }
  console.log(`River cells: ${riverCellCount} (${(riverCellCount / (W * H) * 100).toFixed(2)}%)`);

  // Trace river paths by following flow direction from high-accumulation headwaters
  const visited = new Uint8Array(W * H);
  const rivers = [];

  // Find river source cells (river cells whose upstream neighbor is not a river)
  const sources = [];
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = z * W + x;
      if (!isRiver[idx]) continue;

      // Check if any upstream neighbor flows into this cell and is also a river
      let hasUpstreamRiver = false;
      for (let d = 0; d < 8; d++) {
        const nx = x + dx[d];
        const nz = z + dz[d];
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        const nIdx = nz * W + nx;
        if (!isRiver[nIdx]) continue;
        // Check if that neighbor flows to us
        const nd = flowDir[nIdx];
        if (nd < 0) continue;
        const fnx = nx + dx[nd];
        const fnz = nz + dz[nd];
        if (fnx === x && fnz === z) {
          hasUpstreamRiver = true;
          break;
        }
      }
      if (!hasUpstreamRiver) {
        sources.push(idx);
      }
    }
  }
  console.log(`River source cells: ${sources.length}`);

  // Trace from each source downstream
  for (const startIdx of sources) {
    if (visited[startIdx]) continue;
    const path = [];
    let idx = startIdx;

    while (idx >= 0 && idx < W * H && isRiver[idx] && !visited[idx]) {
      visited[idx] = 1;
      const x = idx % W;
      const z = Math.floor(idx / W);

      // Convert grid coords to world coords
      const worldX = x * METERS_PER_PIXEL - HALF_WORLD;
      const worldZ = z * METERS_PER_PIXEL - HALF_WORLD;
      path.push([Math.round(worldX * 10) / 10, Math.round(worldZ * 10) / 10]);

      const dir = flowDir[idx];
      if (dir < 0) break;
      const nx = x + dx[dir];
      const nz = z + dz[dir];
      if (nx < 0 || nx >= W || nz < 0 || nz >= H) break;
      idx = nz * W + nx;
    }

    if (path.length >= 5) {
      // Simplify to reduce point count
      const simplified = simplifyPolyline(path, 30); // 30m tolerance
      let totalLen = 0;
      for (let i = 1; i < simplified.length; i++) {
        const ddx = simplified[i][0] - simplified[i - 1][0];
        const ddz = simplified[i][1] - simplified[i - 1][1];
        totalLen += Math.sqrt(ddx * ddx + ddz * ddz);
      }
      if (totalLen >= 500) { // Only keep rivers longer than 500m
        rivers.push({
          points: simplified,
          lengthM: Math.round(totalLen),
          name: null
        });
      }
    }
  }

  // Sort by length
  rivers.sort((a, b) => b.lengthM - a.lengthM);
  console.log(`\nExtracted ${rivers.length} tributary segments from DEM`);
  for (const r of rivers.slice(0, 15)) {
    console.log(`  ${r.lengthM}m, ${r.points.length} points`);
  }

  // Classify by flow: wider rivers have more upstream cells
  // Assign width based on length as a proxy for flow volume
  return rivers.map(r => ({
    ...r,
    source: 'dem-flow',
    width: r.lengthM > 5000 ? 8 : r.lengthM > 2000 ? 5 : 3
  }));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
