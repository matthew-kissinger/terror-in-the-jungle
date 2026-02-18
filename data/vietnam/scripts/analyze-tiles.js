/**
 * Analyze downloaded Terrarium PNG terrain tiles.
 * Decodes elevation data from RGB and reports statistics.
 *
 * Usage: node data/vietnam/scripts/analyze-tiles.js [area-id]
 *   e.g. node data/vietnam/scripts/analyze-tiles.js a-shau-valley
 *        node data/vietnam/scripts/analyze-tiles.js   (analyzes all)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TILES_DIR = path.resolve(__dirname, '..', 'terrain-tiles');

function decodeTerrariumPNG(filepath) {
  const buffer = fs.readFileSync(filepath);
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;

  const elevations = new Float32Array(width * height);
  let min = Infinity, max = -Infinity;
  let sum = 0;
  let waterCount = 0; // elevation <= 0
  let histogram = new Array(20).fill(0); // 20 bins

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // Terrarium decoding
    const elevation = (r * 256 + g + b / 256) - 32768;
    elevations[i] = elevation;

    if (elevation < min) min = elevation;
    if (elevation > max) max = elevation;
    sum += elevation;
    if (elevation <= 0) waterCount++;
  }

  const mean = sum / elevations.length;

  // Compute std deviation
  let variance = 0;
  for (let i = 0; i < elevations.length; i++) {
    variance += (elevations[i] - mean) ** 2;
  }
  const stddev = Math.sqrt(variance / elevations.length);

  // Histogram
  const range = max - min || 1;
  for (let i = 0; i < elevations.length; i++) {
    const bin = Math.min(19, Math.floor((elevations[i] - min) / range * 20));
    histogram[bin]++;
  }

  return {
    width, height,
    pixelCount: width * height,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    stddev: Math.round(stddev * 10) / 10,
    range: Math.round(range * 10) / 10,
    waterPercent: Math.round(waterCount / elevations.length * 1000) / 10,
    histogram,
    elevations,
  };
}

function renderHistogram(histogram, min, max, maxBarWidth = 40) {
  const peak = Math.max(...histogram);
  const binWidth = (max - min) / histogram.length;
  const lines = [];

  for (let i = 0; i < histogram.length; i++) {
    const lo = Math.round(min + i * binWidth);
    const hi = Math.round(min + (i + 1) * binWidth);
    const barLen = Math.round(histogram[i] / peak * maxBarWidth);
    const bar = '#'.repeat(barLen);
    const label = `${String(lo).padStart(6)}m - ${String(hi).padStart(6)}m`;
    lines.push(`  ${label} | ${bar} (${histogram[i]})`);
  }
  return lines.join('\n');
}

function exportRawBinary(elevations, width, height, outPath) {
  // Export as raw Float32 binary for direct game use
  const buffer = Buffer.from(elevations.buffer);
  fs.writeFileSync(outPath, buffer);
  // Also write a metadata sidecar
  const meta = { width, height, format: 'float32', byteOrder: 'little-endian', unit: 'meters' };
  fs.writeFileSync(outPath + '.meta.json', JSON.stringify(meta, null, 2));
  return buffer.length;
}

async function main() {
  const targetArea = process.argv[2];

  if (!fs.existsSync(TILES_DIR)) {
    console.error('No terrain tiles found. Run download-terrain-tiles.js first.');
    process.exit(1);
  }

  const manifestPath = path.join(TILES_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest.json found. Run download-terrain-tiles.js first.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const convertedDir = path.resolve(__dirname, '..', 'converted');
  fs.mkdirSync(convertedDir, { recursive: true });

  const areas = targetArea
    ? { [targetArea]: manifest.areas[targetArea] }
    : manifest.areas;

  if (targetArea && !manifest.areas[targetArea]) {
    console.error(`Unknown area: ${targetArea}`);
    console.error(`Available: ${Object.keys(manifest.areas).join(', ')}`);
    process.exit(1);
  }

  const report = { analyzed: new Date().toISOString(), areas: {} };

  for (const [areaId, area] of Object.entries(areas)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${area.name}`);
    console.log(`  ${area.description}`);
    console.log(`  Center: ${area.lat}N, ${area.lon}E`);
    console.log(`${'='.repeat(60)}`);

    report.areas[areaId] = { zooms: {} };

    for (const [zoomKey, zoomData] of Object.entries(area.tiles)) {
      const zoom = parseInt(zoomKey.replace('z', ''));
      const areaDir = path.join(TILES_DIR, areaId, zoomKey);

      if (!fs.existsSync(areaDir)) continue;

      const pngFiles = fs.readdirSync(areaDir).filter(f => f.endsWith('.png'));
      if (pngFiles.length === 0) continue;

      console.log(`\n  --- Zoom ${zoom} (${zoomData.pixelResolutionMeters}m/pixel, ${zoomData.coverageKm}km coverage, ${pngFiles.length} tiles) ---`);

      // Analyze each tile
      let globalMin = Infinity, globalMax = -Infinity;
      let tileStats = [];

      for (const pngFile of pngFiles) {
        const filepath = path.join(areaDir, pngFile);
        try {
          const stats = decodeTerrariumPNG(filepath);
          tileStats.push({ file: pngFile, ...stats });
          if (stats.min < globalMin) globalMin = stats.min;
          if (stats.max > globalMax) globalMax = stats.max;

          console.log(`    ${pngFile}: ${stats.width}x${stats.height}, elevation ${stats.min}m to ${stats.max}m (mean ${stats.mean}m, stddev ${stats.stddev}m, ${stats.waterPercent}% water)`);
        } catch (err) {
          console.log(`    ${pngFile}: [ERROR] ${err.message}`);
        }
      }

      if (tileStats.length > 0) {
        console.log(`\n    Combined: elevation ${globalMin}m to ${globalMax}m (relief: ${Math.round(globalMax - globalMin)}m)`);

        // For zoom 14 tiles, merge into a single grid and export
        if (zoom === 14 && tileStats.length > 1) {
          const gridSize = Math.round(Math.sqrt(tileStats.length));
          const tileW = tileStats[0].width;
          const tileH = tileStats[0].height;
          const mergedW = gridSize * tileW;
          const mergedH = gridSize * tileH;
          const merged = new Float32Array(mergedW * mergedH);

          // Sort tiles by x,y coords from filename
          tileStats.sort((a, b) => {
            const [ax, ay] = a.file.replace('.png', '').split('_').map(Number);
            const [bx, by] = b.file.replace('.png', '').split('_').map(Number);
            return ay - by || ax - bx;
          });

          // Get unique x and y coords
          const xs = [...new Set(tileStats.map(t => parseInt(t.file.split('_')[0])))].sort((a, b) => a - b);
          const ys = [...new Set(tileStats.map(t => parseInt(t.file.split('_')[1])))].sort((a, b) => a - b);

          for (const ts of tileStats) {
            const [tx, ty] = ts.file.replace('.png', '').split('_').map(Number);
            const col = xs.indexOf(tx);
            const row = ys.indexOf(ty);

            for (let py = 0; py < tileH; py++) {
              for (let px = 0; px < tileW; px++) {
                const srcIdx = py * tileW + px;
                const dstX = col * tileW + px;
                const dstY = row * tileH + py;
                const dstIdx = dstY * mergedW + dstX;
                merged[dstIdx] = ts.elevations[srcIdx];
              }
            }
          }

          const outPath = path.join(convertedDir, `${areaId}-z14-merged.f32`);
          const bytes = exportRawBinary(merged, mergedW, mergedH, outPath);
          console.log(`    Exported merged grid: ${mergedW}x${mergedH} (${(bytes / 1024).toFixed(0)}KB) -> ${path.basename(outPath)}`);

          report.areas[areaId].zooms[zoomKey] = {
            tileCount: tileStats.length,
            resolution: zoomData.pixelResolutionMeters,
            coverageKm: zoomData.coverageKm,
            elevMin: globalMin,
            elevMax: globalMax,
            relief: Math.round(globalMax - globalMin),
            mergedGrid: { width: mergedW, height: mergedH, file: `${areaId}-z14-merged.f32` },
          };
        }

        // Show histogram for the center tile (or first tile)
        const centerTile = tileStats[Math.floor(tileStats.length / 2)];
        console.log(`\n    Elevation histogram (${centerTile.file}):`);
        console.log(renderHistogram(centerTile.histogram, centerTile.min, centerTile.max));

        // Game compatibility assessment
        const relief = globalMax - globalMin;
        const currentMaxHeight = 100; // current game max
        const scaleFactor = currentMaxHeight / relief;
        console.log(`\n    Game compatibility:`);
        console.log(`      Real relief: ${Math.round(relief)}m`);
        console.log(`      Current game height range: -8 to ${currentMaxHeight} (108 units)`);
        console.log(`      Scale factor to fit: ${scaleFactor.toFixed(3)} (${relief > 108 ? 'NEEDS SCALING or expanded height range' : 'fits within current range'})`);
        console.log(`      At 1:1 scale: would need height range 0-${Math.round(relief)} units`);
        console.log(`      Recommended: expand game height range to 0-${Math.round(Math.max(relief * 1.2, 200))} for headroom`);
      }
    }
  }

  // Write report
  const reportPath = path.join(TILES_DIR, 'analysis-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${reportPath}`);
}

main().catch(console.error);
