#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Post-build step: emit gzip sidecars for the large static binaries under
 * `dist/data/` that Cloudflare will not auto-compress (application/octet-stream
 * is not on its compressible-type list). The runtime prefers `<asset>.gz`
 * via DecompressionStream and falls back to the plain asset — see
 * `src/utils/CompressedAssetFetch.ts`. Deploy-artifact only; nothing is
 * committed (public/ keeps canonical assets only).
 *
 * Usage: npx tsx scripts/compress-data-assets.ts [--dist=dist]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { gzipSync, constants } from 'zlib';

const distFlag = process.argv.find((a) => a.startsWith('--dist='));
const distRoot = join(process.cwd(), distFlag ? distFlag.split('=')[1] : 'dist');

const TARGET_DIRS: Array<{ dir: string; extensions: string[] }> = [
  { dir: join(distRoot, 'data', 'navmesh'), extensions: ['.bin'] },
  { dir: join(distRoot, 'data', 'heightmaps'), extensions: ['.f32'] },
];

let total = 0;
for (const { dir, extensions } of TARGET_DIRS) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!extensions.some((ext) => name.endsWith(ext))) continue;
    const sourcePath = join(dir, name);
    const raw = readFileSync(sourcePath);
    const compressed = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
    writeFileSync(`${sourcePath}.gz`, compressed);
    total += 1;
    const ratio = ((compressed.byteLength / raw.byteLength) * 100).toFixed(0);
    console.log(
      `[compress-data-assets] ${name}: ${(raw.byteLength / 1048576).toFixed(1)}MB -> ` +
      `${(compressed.byteLength / 1048576).toFixed(1)}MB (${ratio}%)`,
    );
  }
}
console.log(`[compress-data-assets] wrote ${total} sidecar(s) under ${distRoot}`);
