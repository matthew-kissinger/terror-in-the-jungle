/**
 * Download a large terrain tile grid for the A Shau Valley / Hamburger Hill area.
 * Target: ~20km x 20km open world map centered on Dong Ap Bia (Hill 937).
 *
 * Hill 937 (Hamburger Hill): 16.233N, 107.177E
 * A Shau Valley floor: ~580m elevation
 * Flanking ridges: 900-1800m
 * Triple-canopy jungle, Ho Chi Minh Trail
 *
 * At zoom 14: ~2.35km per tile at this latitude, 9m/pixel
 * 9x9 grid = ~21km x 21km coverage
 * At zoom 13: ~4.7km per tile, 18m/pixel
 * 7x7 grid = ~33km x 33km (wider context)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'big-map');

// Hamburger Hill (Dong Ap Bia / Hill 937)
const CENTER_LAT = 16.233;
const CENTER_LON = 107.177;

// Grid configurations
const GRIDS = [
  { zoom: 13, gridSize: 7, label: 'wide-context (33km)' },
  { zoom: 14, gridSize: 9, label: 'primary (21km)' },
];

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

function tileBounds(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lonLeft = x / n * 360 - 180;
  const lonRight = (x + 1) / n * 360 - 180;
  const latTopRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const latBottomRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  return {
    north: latTopRad * 180 / Math.PI,
    south: latBottomRad * 180 / Math.PI,
    west: lonLeft,
    east: lonRight,
  };
}

function tileWidthMeters(lat, zoom) {
  const circumference = 40075016.686;
  return circumference * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

function downloadTile(z, x, y) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        const mod = redirectUrl.startsWith('https') ? https : http;
        mod.get(redirectUrl, (res2) => {
          if (res2.statusCode !== 200) {
            reject(new Error(`HTTP ${res2.statusCode}`));
            return;
          }
          const chunks = [];
          res2.on('data', (chunk) => chunks.push(chunk));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
          res2.on('error', reject);
        }).on('error', reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

function decodeTerrariumPNG(buffer) {
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;
  const elevations = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    elevations[i] = (r * 256 + g + b / 256) - 32768;
  }
  return { width, height, elevations };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== A Shau Valley / Hamburger Hill - Big Map Download ===');
  console.log(`Center: ${CENTER_LAT}N, ${CENTER_LON}E (Hill 937 / Dong Ap Bia)`);
  console.log();

  const results = {};

  for (const config of GRIDS) {
    const { zoom, gridSize, label } = config;
    const center = latLonToTile(CENTER_LAT, CENTER_LON, zoom);
    const tileWidth = tileWidthMeters(CENTER_LAT, zoom);
    const pixelRes = tileWidth / 256;
    const coverage = gridSize * tileWidth / 1000;
    const half = Math.floor(gridSize / 2);

    console.log(`--- Zoom ${zoom}: ${label} ---`);
    console.log(`  Center tile: (${center.x}, ${center.y})`);
    console.log(`  Grid: ${gridSize}x${gridSize} = ${gridSize * gridSize} tiles`);
    console.log(`  Coverage: ${coverage.toFixed(1)}km x ${coverage.toFixed(1)}km`);
    console.log(`  Resolution: ${pixelRes.toFixed(0)}m/pixel`);
    console.log(`  Merged grid: ${gridSize * 256}x${gridSize * 256} pixels`);
    console.log();

    const zoomDir = path.join(OUT_DIR, `z${zoom}`);
    fs.mkdirSync(zoomDir, { recursive: true });

    // Build tile list
    const tiles = [];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        tiles.push({ x: center.x + dx, y: center.y + dy, col: dx + half, row: dy + half });
      }
    }

    // Download all tiles
    let downloaded = 0;
    let failed = 0;
    const tileData = new Map();

    for (const tile of tiles) {
      const filename = `${tile.x}_${tile.y}.png`;
      const filepath = path.join(zoomDir, filename);

      if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) {
        const buffer = fs.readFileSync(filepath);
        tileData.set(`${tile.col}_${tile.row}`, { buffer, tile });
        downloaded++;
        process.stdout.write(`  [cache] ${filename}\r`);
        continue;
      }

      try {
        const buffer = await downloadTile(zoom, tile.x, tile.y);
        fs.writeFileSync(filepath, buffer);
        tileData.set(`${tile.col}_${tile.row}`, { buffer, tile });
        downloaded++;
        process.stdout.write(`  [ok]    ${filename} (${(buffer.length / 1024).toFixed(0)}KB)\r`);
        await sleep(50);
      } catch (err) {
        console.log(`  [FAIL]  ${filename}: ${err.message}`);
        failed++;
      }
    }
    console.log(`\n  Downloaded: ${downloaded}, Failed: ${failed}`);

    // Merge into single grid
    const mergedW = gridSize * 256;
    const mergedH = gridSize * 256;
    const merged = new Float32Array(mergedW * mergedH);
    let globalMin = Infinity, globalMax = -Infinity;
    let sum = 0, count = 0;

    for (const [key, { buffer, tile }] of tileData) {
      const decoded = decodeTerrariumPNG(buffer);
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const srcIdx = py * 256 + px;
          const dstX = tile.col * 256 + px;
          const dstY = tile.row * 256 + py;
          const dstIdx = dstY * mergedW + dstX;
          const elev = decoded.elevations[srcIdx];
          merged[dstIdx] = elev;
          if (elev < globalMin) globalMin = elev;
          if (elev > globalMax) globalMax = elev;
          sum += elev;
          count++;
        }
      }
    }

    const mean = sum / count;
    let variance = 0;
    for (let i = 0; i < merged.length; i++) {
      variance += (merged[i] - mean) ** 2;
    }
    const stddev = Math.sqrt(variance / count);

    // Water detection
    let waterCount = 0;
    for (let i = 0; i < merged.length; i++) {
      if (merged[i] <= 0) waterCount++;
    }

    // Compute geo bounds
    const topLeft = tileBounds(center.x - half, center.y - half, zoom);
    const bottomRight = tileBounds(center.x + half, center.y + half, zoom);
    const geoBounds = {
      north: topLeft.north,
      south: bottomRight.south,
      west: topLeft.west,
      east: bottomRight.east,
    };

    console.log(`\n  Elevation: ${globalMin.toFixed(1)}m to ${globalMax.toFixed(1)}m`);
    console.log(`  Relief: ${(globalMax - globalMin).toFixed(0)}m`);
    console.log(`  Mean: ${mean.toFixed(1)}m, StdDev: ${stddev.toFixed(1)}m`);
    console.log(`  Water: ${(waterCount / count * 100).toFixed(1)}%`);
    console.log(`  Geo bounds: ${geoBounds.south.toFixed(4)}N to ${geoBounds.north.toFixed(4)}N, ${geoBounds.west.toFixed(4)}E to ${geoBounds.east.toFixed(4)}E`);

    // Export merged Float32
    const f32Path = path.join(OUT_DIR, `a-shau-z${zoom}-${gridSize}x${gridSize}.f32`);
    fs.writeFileSync(f32Path, Buffer.from(merged.buffer));

    const meta = {
      name: 'A Shau Valley / Hamburger Hill',
      center: { lat: CENTER_LAT, lon: CENTER_LON },
      centerFeature: 'Hill 937 (Dong Ap Bia / Hamburger Hill)',
      zoom,
      gridSize,
      tileCount: gridSize * gridSize,
      width: mergedW,
      height: mergedH,
      format: 'float32',
      byteOrder: 'little-endian',
      unit: 'meters',
      pixelResolutionMeters: Math.round(pixelRes),
      coverageKm: parseFloat(coverage.toFixed(1)),
      coverageMeters: Math.round(coverage * 1000),
      geoBounds,
      elevation: {
        min: parseFloat(globalMin.toFixed(1)),
        max: parseFloat(globalMax.toFixed(1)),
        mean: parseFloat(mean.toFixed(1)),
        stddev: parseFloat(stddev.toFixed(1)),
        relief: Math.round(globalMax - globalMin),
      },
      waterPercent: parseFloat((waterCount / count * 100).toFixed(1)),
      keyFeatures: [
        'Hill 937 (Hamburger Hill / Dong Ap Bia) - 937m, center of map',
        'A Shau Valley floor - ~580m, NW-SE corridor',
        'Eastern ridgeline - 900-1200m',
        'Western ridgeline (Laos border) - 1000-1800m',
        'Multiple LZs and firebase sites along valley',
        'Triple-canopy jungle throughout',
        'Ho Chi Minh Trail corridor',
      ],
      historicalBattles: [
        'Battle of Hamburger Hill (Hill 937) - May 10-20, 1969',
        'Operation Apache Snow - May 1969',
        'Operation Delaware - April 1968',
        'Firebase Ripcord - March-July 1970',
        'Battle of A Shau - March 1966',
      ],
      gameCompatibility: {
        currentHeightRange: '[-8, 100] (108 units)',
        reliefNeeded: Math.round(globalMax - globalMin),
        scaleFactor1to1: parseFloat((108 / (globalMax - globalMin)).toFixed(4)),
        recommendation: 'Expand height range to at least 0-2000 for 1:1 scale',
        worldSizeAtPixelRes: `${Math.round(coverage * 1000)}m x ${Math.round(coverage * 1000)}m`,
      },
    };
    fs.writeFileSync(f32Path + '.meta.json', JSON.stringify(meta, null, 2));

    // Also export a 16-bit PNG heightmap for visual inspection
    const relief = globalMax - globalMin;
    const png = new PNG({ width: mergedW, height: mergedH });
    for (let i = 0; i < merged.length; i++) {
      const normalized = (merged[i] - globalMin) / relief;
      const gray = Math.round(normalized * 255);
      png.data[i * 4] = gray;
      png.data[i * 4 + 1] = gray;
      png.data[i * 4 + 2] = gray;
      png.data[i * 4 + 3] = 255;
    }
    const pngPath = path.join(OUT_DIR, `a-shau-z${zoom}-${gridSize}x${gridSize}-heightmap.png`);
    fs.writeFileSync(pngPath, PNG.sync.write(png));
    console.log(`\n  Exported: ${path.basename(f32Path)} (${(merged.byteLength / 1024 / 1024).toFixed(1)}MB)`);
    console.log(`  Exported: ${path.basename(pngPath)} (visual heightmap)`);

    // Elevation profile across the valley (east-west through center)
    console.log(`\n  East-West elevation profile through Hill 937:`);
    const centerRow = Math.floor(mergedH / 2);
    const step = Math.floor(mergedW / 40);
    let profile = '  ';
    const profileElevs = [];
    for (let x = 0; x < mergedW; x += step) {
      const elev = merged[centerRow * mergedW + x];
      profileElevs.push(elev);
    }
    const profMin = Math.min(...profileElevs);
    const profMax = Math.max(...profileElevs);
    const profRange = profMax - profMin || 1;
    const barChars = ' ._-=+*#@';
    for (const elev of profileElevs) {
      const normalized = (elev - profMin) / profRange;
      const charIdx = Math.min(barChars.length - 1, Math.floor(normalized * barChars.length));
      profile += barChars[charIdx];
    }
    console.log(profile);
    console.log(`  W ${profMin.toFixed(0)}m ${' '.repeat(15)} ${profMax.toFixed(0)}m E`);

    // North-South profile
    console.log(`\n  North-South elevation profile:`);
    const centerCol = Math.floor(mergedW / 2);
    const nsElevs = [];
    for (let y = 0; y < mergedH; y += step) {
      nsElevs.push(merged[y * mergedW + centerCol]);
    }
    const nsMin = Math.min(...nsElevs);
    const nsMax = Math.max(...nsElevs);
    const nsRange = nsMax - nsMin || 1;
    let nsProfile = '  ';
    for (const elev of nsElevs) {
      const normalized = (elev - nsMin) / nsRange;
      const charIdx = Math.min(barChars.length - 1, Math.floor(normalized * barChars.length));
      nsProfile += barChars[charIdx];
    }
    console.log(nsProfile);
    console.log(`  N ${nsMin.toFixed(0)}m ${' '.repeat(15)} ${nsMax.toFixed(0)}m S`);

    results[`z${zoom}`] = meta;
    console.log();
  }

  // Write combined manifest
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({
    name: 'A Shau Valley / Hamburger Hill - Big Map',
    description: 'Large-scale terrain data for Vietnam War open world mode',
    center: { lat: CENTER_LAT, lon: CENTER_LON, feature: 'Hill 937 (Hamburger Hill)' },
    downloaded: new Date().toISOString(),
    grids: results,
  }, null, 2));

  console.log('=== Done ===');
  console.log('Files in:', OUT_DIR);
}

main().catch(console.error);
