#!/usr/bin/env tsx

import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, resolve } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryConfig {
  src: string;
  dest: string;
  format: 'webp' | 'png';
  quality: number;
  maxDim: number | null;
  trimAlpha: boolean;
  cleanEdges: boolean;
  enforcePOT: boolean;
  nameMap?: Record<string, string>;
}

interface ProcessResult {
  input: string;
  output: string;
  inputSize: number;
  outputSize: number;
  inputDim: string;
  outputDim: string;
  skipped: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Category configurations
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(join(import.meta.dirname!, '..'));

const VEGETATION_NAME_MAP: Record<string, string> = {
  'jungle-fern': 'Fern',
  'elephant-ear-plants': 'ElephantEarPlants',
  'fan-palm-cluster': 'FanPalmCluster',
  'coconut-palm': 'CoconutPalm',
  'areca-palm-cluster': 'ArecaPalmCluster',
  'dipterocarp-giant': 'DipterocarpGiant',
  'banyan-tree': 'TwisterBanyan',
  // New types — keep kebab-to-PascalCase
  'bamboo-grove': 'BambooGrove',
  'rice-paddy-plants': 'RicePaddyPlants',
  'banana-plant': 'BananaPlant',
  'elephant-grass': 'ElephantGrass',
  'mangrove': 'Mangrove',
  'rubber-tree': 'RubberTree',
};

const SOLDIER_NAME_MAP: Record<string, string> = {};
for (const faction of ['nva', 'arvn']) {
  for (const dir of ['front', 'back', 'side']) {
    SOLDIER_NAME_MAP[`${faction}-${dir}-walk1`] = `${faction}-walk-${dir}-1`;
    SOLDIER_NAME_MAP[`${faction}-${dir}-walk2`] = `${faction}-walk-${dir}-2`;
    SOLDIER_NAME_MAP[`${faction}-${dir}-fire`] = `${faction}-fire-${dir}`;
  }
}

const SCREEN_NAME_MAP: Record<string, string> = {
  'start-screen_raw': 'start-screen',
};

const CATEGORIES: Record<string, CategoryConfig> = {
  vegetation: {
    src: 'public/assets/source/vegetation',
    dest: 'public/assets',
    format: 'webp',
    quality: 95,
    maxDim: 1024,
    trimAlpha: false,
    cleanEdges: false,
    enforcePOT: true,
    nameMap: VEGETATION_NAME_MAP,
  },
  soldiers: {
    src: 'public/assets/source/soldiers',
    dest: 'public/assets',
    format: 'webp',
    quality: 95,
    maxDim: 512,
    trimAlpha: true,
    cleanEdges: true,
    enforcePOT: true,
    nameMap: SOLDIER_NAME_MAP,
  },
  textures: {
    src: 'public/assets/source/textures',
    dest: 'public/assets',
    format: 'webp',
    quality: 90,
    maxDim: 512,
    trimAlpha: false,
    cleanEdges: false,
    enforcePOT: true,
  },
  icons: {
    src: 'public/assets/source/ui/icons',
    dest: 'public/assets/ui/icons',
    format: 'webp',
    quality: 100,
    maxDim: null,
    trimAlpha: false,
    cleanEdges: false,
    enforcePOT: false,
  },
  screens: {
    src: 'public/assets/source/ui/screens',
    dest: 'public/assets/ui/screens',
    format: 'webp',
    quality: 85,
    maxDim: null,
    trimAlpha: false,
    cleanEdges: false,
    enforcePOT: false,
    nameMap: SCREEN_NAME_MAP,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nearestPOT(n: number): number {
  const lower = Math.pow(2, Math.floor(Math.log2(n)));
  const upper = lower * 2;
  return (n - lower) <= (upper - n) ? lower : upper;
}

function mapOutputName(file: string, config: CategoryConfig): string {
  const stem = basename(file, extname(file));
  const ext = config.format === 'webp' ? '.webp' : '.png';

  if (config.nameMap && config.nameMap[stem]) {
    return config.nameMap[stem] + ext;
  }
  return stem + ext;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function isRawFile(filename: string): boolean {
  return filename.includes('_raw') || filename.includes('tpose-ref')
    || filename.includes('-mounted') || filename.startsWith('ref-');
}

function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ext === '.png' || ext === '.webp' || ext === '.jpg' || ext === '.jpeg';
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  config: CategoryConfig,
  dryRun: boolean,
  force: boolean,
): Promise<ProcessResult> {
  const filename = basename(filePath);
  const outputName = mapOutputName(filename, config);
  const destDir = join(PROJECT_ROOT, config.dest);
  const outputPath = join(destDir, outputName);

  const inputStat = statSync(filePath);
  const result: ProcessResult = {
    input: filename,
    output: outputName,
    inputSize: inputStat.size,
    outputSize: 0,
    inputDim: '',
    outputDim: '',
    skipped: false,
  };

  if (!force && existsSync(outputPath)) {
    const outStat = statSync(outputPath);
    result.outputSize = outStat.size;
    result.skipped = true;
    result.outputDim = '(exists)';
    return result;
  }

  if (dryRun) {
    const meta = await sharp(filePath).metadata();
    result.inputDim = `${meta.width}x${meta.height}`;
    result.outputDim = '(dry-run)';
    result.skipped = true;
    return result;
  }

  try {
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    let pipeline = sharp(filePath);
    const meta = await pipeline.metadata();
    let w = meta.width!;
    let h = meta.height!;
    result.inputDim = `${w}x${h}`;

    // Trim transparent padding
    if (config.trimAlpha && meta.hasAlpha) {
      pipeline = pipeline.trim();
      const trimmed = await pipeline.toBuffer({ resolveWithObject: true });
      w = trimmed.info.width;
      h = trimmed.info.height;
      pipeline = sharp(trimmed.data);
    }

    // Clean dark fringe on alpha edges: dilate slightly to push edge pixels outward,
    // filling the dark halo left by background removal with neighboring color data
    if (config.cleanEdges && meta.hasAlpha) {
      pipeline = pipeline.ensureAlpha().dilate();
    }

    // Resize to fit within maxDim
    if (config.maxDim && (w > config.maxDim || h > config.maxDim)) {
      pipeline = pipeline.resize(config.maxDim, config.maxDim, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      });
      const ratio = Math.min(config.maxDim / w, config.maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    // Enforce power-of-two dimensions (pad with transparency instead of stretching)
    if (config.enforcePOT) {
      const potW = nearestPOT(w);
      const potH = nearestPOT(h);
      if (potW !== w || potH !== h) {
        pipeline = pipeline.resize(potW, potH, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.lanczos3,
        });
        w = potW;
        h = potH;
      }
    }


    // Output
    if (config.format === 'webp') {
      pipeline = pipeline.webp({
        quality: config.quality,
        lossless: config.quality >= 100,
        effort: 4,
      });
    } else {
      pipeline = pipeline.png({
        compressionLevel: 9,
      });
    }

    const outputBuffer = await pipeline.toBuffer({ resolveWithObject: true });
    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, outputBuffer.data);

    result.outputSize = outputBuffer.data.length;
    result.outputDim = `${outputBuffer.info.width}x${outputBuffer.info.height}`;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.skipped = true;
  }

  return result;
}

async function processCategory(
  name: string,
  config: CategoryConfig,
  dryRun: boolean,
  force: boolean,
): Promise<ProcessResult[]> {
  const srcDir = join(PROJECT_ROOT, config.src);
  if (!existsSync(srcDir)) {
    console.error(`  Source directory not found: ${srcDir}`);
    return [];
  }

  const files = readdirSync(srcDir)
    .filter(f => isImageFile(f) && (!isRawFile(f) || (name === 'screens' && f === 'start-screen_raw.png')))
    .sort();

  if (files.length === 0) {
    console.log(`  No files to process in ${config.src}`);
    return [];
  }

  console.log(`  Found ${files.length} files in ${config.src}`);
  const results: ProcessResult[] = [];

  for (const file of files) {
    const filePath = join(srcDir, file);
    const result = await processFile(filePath, config, dryRun, force);
    results.push(result);

    const status = result.error
      ? `ERROR: ${result.error}`
      : result.skipped
        ? '(skipped)'
        : `${formatBytes(result.inputSize)} -> ${formatBytes(result.outputSize)} (${result.outputDim})`;
    console.log(`    ${result.input} -> ${result.output}  ${status}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(allResults: Map<string, ProcessResult[]>): void {
  console.log('\n' + '='.repeat(80));
  console.log('OPTIMIZATION REPORT');
  console.log('='.repeat(80));

  let totalIn = 0;
  let totalOut = 0;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [category, results] of allResults) {
    const processed = results.filter(r => !r.skipped && !r.error);
    const skipped = results.filter(r => r.skipped && !r.error);
    const errors = results.filter(r => r.error);

    const catIn = processed.reduce((s, r) => s + r.inputSize, 0);
    const catOut = processed.reduce((s, r) => s + r.outputSize, 0);
    const savings = catIn > 0 ? ((1 - catOut / catIn) * 100).toFixed(1) : '0';

    console.log(`\n${category.toUpperCase()}`);
    console.log(`  Processed: ${processed.length}  Skipped: ${skipped.length}  Errors: ${errors.length}`);
    if (processed.length > 0) {
      console.log(`  Input: ${formatBytes(catIn)}  Output: ${formatBytes(catOut)}  Savings: ${savings}%`);
    }

    if (errors.length > 0) {
      for (const r of errors) {
        console.log(`  ERROR: ${r.input}: ${r.error}`);
      }
    }

    totalIn += catIn;
    totalOut += catOut;
    totalProcessed += processed.length;
    totalSkipped += skipped.length;
    totalErrors += errors.length;
  }

  console.log('\n' + '-'.repeat(80));
  const totalSavings = totalIn > 0 ? ((1 - totalOut / totalIn) * 100).toFixed(1) : '0';
  console.log(`TOTAL: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors`);
  if (totalProcessed > 0) {
    console.log(`  ${formatBytes(totalIn)} -> ${formatBytes(totalOut)}  (${totalSavings}% savings)`);
  }
  console.log('='.repeat(80));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { category: string; dryRun: boolean; force: boolean; report: boolean } {
  const args = process.argv.slice(2);
  let category = 'all';
  let dryRun = false;
  let force = false;
  let report = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
        category = args[++i] || 'all';
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      case '--no-report':
        report = false;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/optimize-assets.ts [options]

Options:
  --category <name>   Process a single category (vegetation, soldiers, textures, icons, screens) or 'all' (default: all)
  --dry-run           Show what would be processed without writing files
  --force             Overwrite existing output files
  --no-report         Skip the summary report
  --help              Show this help

Categories:
${Object.entries(CATEGORIES).map(([k, v]) => `  ${k.padEnd(12)} ${v.src} -> ${v.dest} (${v.format}, q${v.quality})`).join('\n')}
`);
        process.exit(0);
    }
  }

  return { category, dryRun, force, report };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log('='.repeat(80));
  console.log('TERROR IN THE JUNGLE - Asset Optimizer');
  console.log('='.repeat(80));

  if (opts.dryRun) console.log('DRY RUN — no files will be written\n');

  const categoriesToRun = opts.category === 'all'
    ? Object.keys(CATEGORIES)
    : [opts.category];

  for (const cat of categoriesToRun) {
    if (!CATEGORIES[cat]) {
      console.error(`Unknown category: ${cat}`);
      console.error(`Available: ${Object.keys(CATEGORIES).join(', ')}`);
      process.exit(1);
    }
  }

  const allResults = new Map<string, ProcessResult[]>();

  for (const cat of categoriesToRun) {
    console.log(`\n[${cat.toUpperCase()}]`);
    const config = CATEGORIES[cat];
    const results = await processCategory(cat, config, opts.dryRun, opts.force);
    allResults.set(cat, results);
  }

  if (opts.report) {
    printReport(allResults);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
