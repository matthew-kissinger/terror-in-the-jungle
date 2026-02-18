/**
 * Download AWS Terrain Tiles (Terrarium PNG format) for Vietnam battle areas.
 *
 * Terrarium encoding: elevation_meters = (R * 256 + G + B / 256) - 32768
 * Source: https://registry.opendata.aws/terrain-tiles/
 * No API key required, public domain.
 *
 * Usage: node data/vietnam/scripts/download-terrain-tiles.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'terrain-tiles');

// Key Vietnam War battle areas
const BATTLE_AREAS = {
  'a-shau-valley': {
    name: 'A Shau Valley (Hamburger Hill area)',
    lat: 16.20, lon: 107.30,
    description: '40km valley flanked by 900-1800m ridges, Ho Chi Minh Trail, Hill 937',
  },
  'ia-drang': {
    name: 'Ia Drang Valley (LZ X-Ray / Albany)',
    lat: 13.58, lon: 107.72,
    description: 'First major US-NVA battle 1965, Chu Pong Massif, 200-750m rolling hills',
  },
  'central-highlands-pleiku': {
    name: 'Central Highlands - Pleiku Plateau',
    lat: 13.98, lon: 108.00,
    description: 'Pleiku plateau at 800m, Camp Holloway, multiple firebases',
  },
  'cu-chi': {
    name: 'Cu Chi Tunnel District',
    lat: 11.00, lon: 106.50,
    description: 'Flat alluvial plain 5-20m, famous tunnel network, near Saigon',
  },
  'hue-citadel': {
    name: 'Hue - Perfume River',
    lat: 16.47, lon: 107.58,
    description: 'Battle of Hue 1968, Citadel, river crossing, coastal plain 0-50m',
  },
  'mekong-delta': {
    name: 'Mekong Delta',
    lat: 10.00, lon: 106.00,
    description: 'Sea-level delta 0-5m, seasonal flooding, Brown Water Navy ops',
  },
  'khe-sanh': {
    name: 'Khe Sanh Combat Base',
    lat: 16.63, lon: 106.73,
    description: 'Famous siege 1968, hilltop base at ~500m, mountainous terrain',
  },
  'dak-to': {
    name: 'Dak To - Hill 875',
    lat: 14.65, lon: 107.83,
    description: 'Battle of Dak To 1967, Central Highlands, 500-1000m ridges',
  },
  'kon-tum': {
    name: 'Kon Tum Plateau',
    lat: 14.35, lon: 108.00,
    description: 'Battle of Kon Tum 1972, plateau at 500m, Easter Offensive',
  },
  'long-binh': {
    name: 'Long Binh / Bien Hoa',
    lat: 10.95, lon: 106.82,
    description: 'Largest US base, Tet Offensive target, flat terrain 10-30m',
  },
};

// Zoom levels to download
// 10: ~156km/tile (country overview)
// 12: ~39km/tile  (regional)
// 13: ~19.5km/tile (battle area)
// 14: ~9.7km/tile  (detailed, ~38m/pixel - close to SRTM 30m)
const ZOOM_LEVELS = [10, 12, 13, 14];

// For zoom 14, also grab a 3x3 grid of tiles around center for larger coverage
const GRID_AT_ZOOM_14 = true;
const GRID_SIZE = 3; // 3x3 = ~29km coverage at zoom 14

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
  const circumference = 40075016.686; // meters
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
            reject(new Error(`HTTP ${res2.statusCode} for redirect ${redirectUrl}`));
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
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
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
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = {
    format: 'Terrarium PNG (24-bit RGB encoded elevation)',
    decode: 'elevation_meters = (R * 256 + G + B / 256) - 32768',
    source: 'AWS Open Data - Terrain Tiles',
    license: 'Public domain',
    downloaded: new Date().toISOString(),
    areas: {},
  };

  let totalDownloaded = 0;
  let totalFailed = 0;

  for (const [areaId, area] of Object.entries(BATTLE_AREAS)) {
    console.log(`\n=== ${area.name} ===`);
    console.log(`  ${area.description}`);
    console.log(`  Center: ${area.lat}N, ${area.lon}E`);

    const areaDir = path.join(OUT_DIR, areaId);
    fs.mkdirSync(areaDir, { recursive: true });

    manifest.areas[areaId] = {
      ...area,
      tiles: {},
    };

    for (const zoom of ZOOM_LEVELS) {
      const center = latLonToTile(area.lat, area.lon, zoom);
      const tileWidth = tileWidthMeters(area.lat, zoom);
      const pixelRes = tileWidth / 256; // each tile is 256x256 pixels

      console.log(`  Zoom ${zoom}: tile (${center.x}, ${center.y}), ~${(tileWidth / 1000).toFixed(1)}km/tile, ~${pixelRes.toFixed(0)}m/pixel`);

      // Determine which tiles to download
      let tiles = [];
      if (zoom === 14 && GRID_AT_ZOOM_14) {
        const half = Math.floor(GRID_SIZE / 2);
        for (let dx = -half; dx <= half; dx++) {
          for (let dy = -half; dy <= half; dy++) {
            tiles.push({ x: center.x + dx, y: center.y + dy });
          }
        }
        console.log(`    Downloading ${GRID_SIZE}x${GRID_SIZE} grid (${tiles.length} tiles, ~${(GRID_SIZE * tileWidth / 1000).toFixed(1)}km coverage)`);
      } else {
        tiles.push(center);
      }

      const zoomDir = path.join(areaDir, `z${zoom}`);
      fs.mkdirSync(zoomDir, { recursive: true });

      manifest.areas[areaId].tiles[`z${zoom}`] = {
        pixelResolutionMeters: Math.round(pixelRes),
        tileWidthKm: parseFloat((tileWidth / 1000).toFixed(1)),
        tileCount: tiles.length,
        coverageKm: parseFloat((Math.sqrt(tiles.length) * tileWidth / 1000).toFixed(1)),
        files: [],
      };

      for (const tile of tiles) {
        const filename = `${tile.x}_${tile.y}.png`;
        const filepath = path.join(zoomDir, filename);
        const bounds = tileBounds(tile.x, tile.y, zoom);

        if (fs.existsSync(filepath)) {
          const stat = fs.statSync(filepath);
          if (stat.size > 100) {
            console.log(`    [skip] ${filename} (already exists, ${stat.size} bytes)`);
            manifest.areas[areaId].tiles[`z${zoom}`].files.push({
              file: filename, x: tile.x, y: tile.y, bounds, cached: true,
            });
            totalDownloaded++;
            continue;
          }
        }

        try {
          const data = await downloadTile(zoom, tile.x, tile.y);
          fs.writeFileSync(filepath, data);
          console.log(`    [ok]   ${filename} (${data.length} bytes)`);
          manifest.areas[areaId].tiles[`z${zoom}`].files.push({
            file: filename, x: tile.x, y: tile.y, bytes: data.length, bounds,
          });
          totalDownloaded++;
          await sleep(100); // be polite
        } catch (err) {
          console.log(`    [FAIL] ${filename}: ${err.message}`);
          totalFailed++;
        }
      }
    }
  }

  // Write manifest
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n=== Done ===`);
  console.log(`Downloaded: ${totalDownloaded}, Failed: ${totalFailed}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(console.error);
