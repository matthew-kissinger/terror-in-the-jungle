#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Pads RGB under transparent pixels for baked vegetation atlases.
 *
 * WebGL canvas captures leave fully transparent pixels black. Linear filtering
 * and mipmaps then sample that black RGB at alpha edges, which makes distant
 * cards/impostors look blurred, faded, or dirty. This keeps alpha unchanged and
 * dilates nearby visible RGB into transparent padding.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';

const DEFAULT_ROOT = join(process.cwd(), 'public', 'assets', 'vegetation');
const TARGET_NAMES = new Set(['atlas.base-color.png', 'atlas.normal.png']);
const DEFAULT_PASSES = 32;

interface CliOptions {
  root: string;
  passes: number;
  check: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const get = (name: string, fallback: string): string => {
    const eq = args.find((arg) => arg.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const index = args.indexOf(`--${name}`);
    if (index >= 0 && index + 1 < args.length) return args[index + 1];
    return fallback;
  };
  return {
    root: get('root', DEFAULT_ROOT),
    passes: Math.max(0, Number(get('passes', String(DEFAULT_PASSES)))),
    check: args.includes('--check'),
  };
}

function collectAtlasFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile() || !TARGET_NAMES.has(entry.name)) continue;
      const normalized = full.replace(/\\/g, '/');
      if (normalized.includes('/impostor/') || normalized.includes('/card/')) {
        out.push(full);
      }
    }
  };
  visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function bleedRgba(data: Buffer, width: number, height: number, passes: number): Buffer {
  const output = Buffer.from(data);
  let colored = new Uint8Array(width * height);
  for (let pixel = 0, i = 0; pixel < colored.length; pixel++, i += 4) {
    colored[pixel] = output[i + 3] > 0 ? 1 : 0;
  }

  for (let pass = 0; pass < passes; pass++) {
    let filled = 0;
    const next = Buffer.from(output);
    const nextColored = new Uint8Array(colored);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (colored[pixel]) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            const neighbor = ny * width + nx;
            if (!colored[neighbor]) continue;
            const ni = neighbor * 4;
            r += output[ni];
            g += output[ni + 1];
            b += output[ni + 2];
            count++;
          }
        }

        if (count === 0) continue;
        const i = pixel * 4;
        next[i] = Math.round(r / count);
        next[i + 1] = Math.round(g / count);
        next[i + 2] = Math.round(b / count);
        // Keep alpha byte unchanged.
        nextColored[pixel] = 1;
        filled++;
      }
    }

    if (filled === 0) break;
    output.set(next);
    colored = nextColored;
  }

  return output;
}

async function processFile(file: string, options: CliOptions): Promise<boolean> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bled = bleedRgba(data, info.width, info.height, options.passes);
  if (Buffer.compare(Buffer.from(data), bled) === 0) {
    return false;
  }
  if (!options.check) {
    const png = await sharp(bled, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer();
    writeFileSync(file, png);
  }
  return true;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const files = collectAtlasFiles(options.root);
  const changed: string[] = [];
  for (const file of files) {
    if (await processFile(file, options)) {
      changed.push(file);
    }
  }

  const action = options.check ? 'would update' : 'updated';
  for (const file of changed) {
    console.log(`${action} ${relative(process.cwd(), file)}`);
  }
  console.log(`[vegetation-atlas-alpha] ${action} ${changed.length}/${files.length} atlas maps`);

  if (options.check && changed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
