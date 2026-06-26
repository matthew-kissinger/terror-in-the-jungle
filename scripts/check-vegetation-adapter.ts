// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Gate: validate the vegetation-library -> engine adapter against the real catalog
 * and the actual on-disk binaries. Proves the integration seam is sound without
 * touching any runtime: every emitted engine record must reference files that exist,
 * have sane fields, and every ready CC-BY asset must be credited. Every ready catalog
 * asset must be accounted for (archetype / billboard / placement-only).
 *
 * Run: npx tsx scripts/check-vegetation-adapter.ts   (npm run check:vegetation-adapter)
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readyVegetation, type VegetationAsset } from '@game-field-kits/vegetation-library';
import {
  VEGETATION_ASSET_ROOT,
  vegetationLibraryAttributions,
  vegetationLibraryBillboardAssets,
  vegetationLibraryGroundCards,
  vegetationLibraryStaticArchetypes,
} from '../src/config/vegetation/vegetationLibraryAdapter';

const PUBLIC = join(process.cwd(), 'public');
const errors: string[] = [];
const note = (m: string) => console.log(`  ${m}`);

/** A served URL ('/assets/vegetation/...') -> the public/ file that backs it. */
function publicFile(servedUrl: string): string {
  return join(PUBLIC, servedUrl.replace(/^\/+/, ''));
}
function mustExist(servedUrl: string, label: string): void {
  if (!existsSync(publicFile(servedUrl))) errors.push(`${label}: missing file ${servedUrl}`);
}

const ready = readyVegetation();
console.log(`vegetation-adapter check — ${ready.length} ready assets, root ${VEGETATION_ASSET_ROOT}\n`);

// 1. Static archetypes (Path B): files exist, distances coherent, bounds valid.
const archetypes = vegetationLibraryStaticArchetypes();
console.log(`static archetypes: ${Object.keys(archetypes).length}`);
for (const [slug, a] of Object.entries(archetypes)) {
  mustExist(a.modelPath, `archetype ${slug} modelPath`);
  mustExist(a.maps.baseColor, `archetype ${slug} baseColor`);
  mustExist(a.maps.normal, `archetype ${slug} normal`);
  mustExist(a.maps.depth, `archetype ${slug} depth`);
  if (a.promotionDistanceMeters <= a.demotionDistanceMeters) {
    errors.push(`archetype ${slug}: promotion (${a.promotionDistanceMeters}) must exceed demotion (${a.demotionDistanceMeters})`);
  }
  if (!(a.bounds.radius > 0)) errors.push(`archetype ${slug}: bounds.radius must be > 0`);
  if (a.columns <= 0 || a.rows <= 0) errors.push(`archetype ${slug}: columns/rows must be > 0`);
  note(`${slug}: model+atlas OK, promote@${a.promotionDistanceMeters}m demote@${a.demotionDistanceMeters}m, r=${a.bounds.radius}`);
}

// 2. Billboard assets (Path A): files exist.
const billboards = vegetationLibraryBillboardAssets();
console.log(`\nbillboard assets: ${billboards.length}`);
for (const b of billboards) {
  mustExist(b.colorFile, `billboard ${b.id} colorFile`);
  mustExist(b.normalFile, `billboard ${b.id} normalFile`);
  note(`${b.id}: ${b.tilesX}x${b.tilesY}@${b.tileSize}, world ${b.worldSize}m`);
}

// 2b. Ground cards (Path C): mesh-near + INSTANCED card-far. Both binaries exist,
//     distances coherent, bounds valid.
const groundCards = vegetationLibraryGroundCards();
console.log(`\nground cards: ${Object.keys(groundCards).length}`);
for (const [slug, c] of Object.entries(groundCards)) {
  mustExist(c.meshPath, `ground card ${slug} meshPath`);
  mustExist(c.card.baseColor, `ground card ${slug} baseColor`);
  if (c.card.normal) mustExist(c.card.normal, `ground card ${slug} normal`);
  if (c.cullDistanceMeters <= c.meshFarEdgeMeters) {
    errors.push(`ground card ${slug}: cull (${c.cullDistanceMeters}) must exceed mesh far edge (${c.meshFarEdgeMeters})`);
  }
  if (!(c.bounds.radius > 0)) errors.push(`ground card ${slug}: bounds.radius must be > 0`);
  note(`${slug}: mesh+card OK, mesh<${c.meshFarEdgeMeters}m card<${c.cullDistanceMeters}m, world ${c.cardWorldSize[0].toFixed(2)}x${c.cardWorldSize[1].toFixed(2)}m`);
}

// 3. Attribution coverage: every ready, attribution-required asset must be credited.
const credits = vegetationLibraryAttributions();
const creditedIds = new Set(credits.map((c) => c.id));
for (const a of ready) {
  if (a.provenance.attributionRequired && !creditedIds.has(a.id)) {
    errors.push(`attribution: ready CC-BY asset '${a.id}' not surfaced by vegetationLibraryAttributions()`);
  }
}
console.log(`\nattribution credits: ${credits.length} (${credits.map((c) => c.id).join(', ')})`);

// 4. Coverage: every ready asset is accounted for (archetype / billboard / placement-only).
const placementOnly: string[] = [];
for (const a of ready as VegetationAsset[]) {
  const inArch = a.id in archetypes;
  const inBill = billboards.some((b) => b.id === a.id);
  const inCard = a.id in groundCards;
  if (!inArch && !inBill && !inCard) placementOnly.push(a.id);
}
console.log(`\ncoverage: ${Object.keys(archetypes).length} archetype, ${billboards.length} billboard, ${Object.keys(groundCards).length} ground-card, ${placementOnly.length} placement-only (near-mesh, far band not yet baked):`);
note(placementOnly.join(', ') || '(none)');

if (errors.length) {
  console.error(`\nFAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK — adapter maps every ready asset to a valid engine record or placement-only.');
