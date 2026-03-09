import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ICONS_DIR = path.resolve('public/assets/ui/icons');

// Size rules by prefix
const SIZE_RULES = [
  { prefix: 'icon-',    size: 48 },
  { prefix: 'emblem-',  size: 128 },
  { prefix: 'map-',     size: 32 },
  { prefix: 'mode-',    size: 64 },
  { prefix: 'hint-',    size: 96 },
  { prefix: 'reticle-', size: 120 },
];

function getTargetSize(filename) {
  for (const rule of SIZE_RULES) {
    if (filename.startsWith(rule.prefix)) return rule.size;
  }
  return 48; // fallback
}

// --- Programmatic icon creation ---

async function createMenuIcon() {
  // 48x48 white hamburger menu: 3 bars, each ~30px wide, ~4px tall, evenly spaced
  const size = 48;
  const barW = 30;
  const barH = 4;
  const barX = (size - barW) / 2; // 9
  // 3 bars evenly spaced: bars at y=10, 22, 34 (centers at 12, 24, 36)
  const bars = [10, 22, 34];

  const svgParts = bars.map(y =>
    `<rect x="${barX}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="white"/>`
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${svgParts.join('')}</svg>`;

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

async function createAdsIcon() {
  // 48x48 white scope/magnifier: circle lens + handle bottom-right
  const size = 48;
  // Lens: circle centered at (20,20), radius 12
  // Handle: line from ~(28,28) to (40,40), stroke-width 5
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="20" cy="20" r="12" fill="none" stroke="white" stroke-width="3"/>
    <line x1="29" y1="29" x2="40" y2="40" stroke="white" stroke-width="5" stroke-linecap="round"/>
    <circle cx="20" cy="20" r="2" fill="white"/>
    <line x1="20" y1="10" x2="20" y2="14" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="20" y1="26" x2="20" y2="30" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="10" y1="20" x2="14" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="26" y1="20" x2="30" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

// --- Main ---

async function main() {
  // Create programmatic icons first
  console.log('\n=== Creating programmatic icons ===');

  const menuBuf = await createMenuIcon();
  const menuPath = path.join(ICONS_DIR, 'icon-menu.png');
  fs.writeFileSync(menuPath, menuBuf);
  console.log(`  icon-menu.png: created (${menuBuf.length} bytes)`);

  const adsBuf = await createAdsIcon();
  const adsPath = path.join(ICONS_DIR, 'icon-ads.png');
  fs.writeFileSync(adsPath, adsBuf);
  console.log(`  icon-ads.png: created (${adsBuf.length} bytes)`);

  // Now optimize all PNGs
  const files = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n=== Optimizing ${files.length} PNG icons ===\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  const results = [];

  for (const file of files) {
    const filePath = path.join(ICONS_DIR, file);
    const originalBuf = fs.readFileSync(filePath);
    const beforeSize = originalBuf.length;
    totalBefore += beforeSize;

    const targetSize = getTargetSize(file);

    try {
      // Trim transparent padding, then resize to fit within target
      const trimmed = await sharp(originalBuf)
        .trim()
        .toBuffer();

      const optimized = await sharp(trimmed)
        .resize(targetSize, targetSize, { fit: 'inside', withoutEnlargement: false })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();

      fs.writeFileSync(filePath, optimized);
      const afterSize = optimized.length;
      totalAfter += afterSize;

      const pct = ((1 - afterSize / beforeSize) * 100).toFixed(1);
      results.push({ file, beforeSize, afterSize, pct, targetSize });
    } catch (err) {
      console.error(`  ERROR ${file}: ${err.message}`);
      totalAfter += beforeSize; // count original if failed
    }
  }

  // Print table
  console.log('File'.padEnd(35) + 'Before'.padStart(10) + 'After'.padStart(10) + 'Saved'.padStart(8) + 'Size'.padStart(8));
  console.log('-'.repeat(71));
  for (const r of results) {
    console.log(
      r.file.padEnd(35) +
      fmtBytes(r.beforeSize).padStart(10) +
      fmtBytes(r.afterSize).padStart(10) +
      `${r.pct}%`.padStart(8) +
      `${r.targetSize}px`.padStart(8)
    );
  }
  console.log('-'.repeat(71));
  console.log(
    'TOTAL'.padEnd(35) +
    fmtBytes(totalBefore).padStart(10) +
    fmtBytes(totalAfter).padStart(10) +
    `${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%`.padStart(8)
  );
}

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(1)} KB`;
}

main().catch(err => { console.error(err); process.exit(1); });
