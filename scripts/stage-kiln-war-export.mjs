#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Bridge: Kiln war-export-plan.json -> pixel-forge-style import manifest.
 *
 * The war-asset importer (`scripts/import-war-catalog.ts`,
 * `npm run assets:import-war-catalog`) consumes a pixel-forge manifest
 * (`{ batch, generatedAt, assets:[{slug,class,status,file,tijTarget,...}] }`),
 * NOT Kiln's `war-export-plan.json` (a flat `[{pack,root,resolved,grade,prompt}]`).
 * This script reads the plan, derives a stable kebab slug + an importer class for
 * each of the 99 entries, copies each generation's `model.glb` into a staging
 * package laid out the way the importer's `file` field expects, mirrors a
 * provenance sidecar next to each GLB (so the importer records provider/model/
 * prompt), and synthesizes `manifest.json` matching the importer schema exactly.
 *
 * The Kiln assets are imported as NET-NEW slugs (action 'new') under a
 * `kiln-war-2026-06/` subdir per class, so they ADD to the catalog alongside the
 * existing pixel-forge entries and can never overwrite a live legacy GLB. The
 * orchestration step that consumes this staging package runs the importer over
 * the staging dir, then merges the generated kiln entries into the committed
 * `warAssetCatalog.ts` (preserving every legacy entry verbatim) — the importer
 * was modified after the legacy catalog was generated and no longer reproduces a
 * couple of legacy aircraft byte-for-byte, so a union re-import is avoided.
 *
 * Class mapping (per task brief):
 *   vietnam-weapons                        -> weapons
 *   vietnam-buildings + vietnam-structures -> structures
 *   vietnam-vehicles                       -> aircraft | ground | boats (headline keywords)
 *   vietnam-wildlife-and-props             -> animals | props (headline keywords)
 *
 * Usage:
 *   node scripts/stage-kiln-war-export.mjs --out <stagingDir> \
 *     [--plan <war-export-plan.json>] [--generations <generations-dir>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const PLAN = argValue('--plan', join(REPO_ROOT, '..', '..', 'kiln', 'kiln-studio', 'tmp', 'war-export-plan.json'));
const GENERATIONS = argValue('--generations', join(REPO_ROOT, '..', '..', 'kiln', 'kiln-studio', '.localdata', 'generations'));
const OUT = argValue('--out', join(os.tmpdir(), 'kiln-war-staging'));

// Importer class -> on-disk output dir under public/models/. Mirrors the
// pixel-forge tijTarget convention so `resolvedGroup` files each entry into the
// correct catalog path-constant group.
const CLASS_DIR = {
  weapons: 'weapons',
  aircraft: 'vehicles/aircraft',
  ground: 'vehicles/ground',
  boats: 'vehicles/watercraft',
  structures: 'structures',
  animals: 'animals',
  props: 'props',
};
const KILN_SUBDIR = 'kiln-war-2026-06';

const DROP = ['the', 'and', 'with', 'for', 'its', 'same', 'to', 'at', 'on', 'in', 'from'];

/** Subject headline: first clause, leading article stripped (keeps "A-1"/"A-37"). */
function headline(prompt) {
  const h = prompt.split(/ [-–—] | of | for |[,.:;]/)[0];
  return h.replace(/^\s*(a|an|the)\s+/i, '').trim();
}

/** Stable kebab slug: <=4 meaningful words of the subject headline. */
function slugify(head) {
  const words = head
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !DROP.includes(w));
  return words.slice(0, 4).join('-').replace(/^-+|-+$/g, '') || 'asset';
}

function vehicleClass(head) {
  const s = head.toLowerCase();
  if (/\b(tank|truck|jeep|apc|armored personnel carrier|personnel carrier|mutt|duster|ontos|patton|half-?track|self-propelled|anti-aircraft|howitzer|deuce|cargo|six-wheel)\b/.test(s)) return 'ground';
  if (/\b(boat|sampan|pbr|raft|landing craft|swift|mike boat|river patrol|brown water)\b/.test(s)) return 'boats';
  if (/\b(helicopter|gunship|aircraft|airplane|jet|fighter|bomber|skyraider|phantom|bronco|huey|cobra|mig|chinook|hercules|stratofortress|dragonfly|jolly green|cayuse|loach|spooky|fresco)\b/.test(s)) return 'aircraft';
  return 'ground';
}

function wildlifeClass(head) {
  return /\b(barrel|crate|drum|box|sign|post|debris|sack|jar|pot|basket|cart|fuel|supply|tool|coopered)\b/.test(head.toLowerCase())
    ? 'props'
    : 'animals';
}

function classFor(pack, head) {
  if (pack === 'vietnam-weapons') return 'weapons';
  if (pack === 'vietnam-buildings' || pack === 'vietnam-structures') return 'structures';
  if (pack === 'vietnam-vehicles') return vehicleClass(head);
  if (pack === 'vietnam-wildlife-and-props') return wildlifeClass(head);
  return 'structures';
}

function loadLegacySlugs() {
  // Dedupe Kiln slugs against the committed catalog's legacy slugs so a derived
  // slug can never collide with (and clobber) an existing pixel-forge entry.
  const catalog = join(REPO_ROOT, 'src', 'config', 'generated', 'warAssetCatalog.ts');
  const slugs = new Set();
  if (existsSync(catalog)) {
    const txt = readFileSync(catalog, 'utf8');
    for (const m of txt.matchAll(/^\s+'([^']+)':\s*\{ slug:/gm)) slugs.add(m[1]);
  }
  return slugs;
}

function main() {
  const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  const used = loadLegacySlugs();
  const dedupe = (base) => {
    if (!used.has(base)) { used.add(base); return base; }
    for (let i = 2; ; i++) { const c = `${base}-${i}`; if (!used.has(c)) { used.add(c); return c; } }
  };

  // Fresh staging tree.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const assets = [];
  const index = [];
  const gradeCount = {};
  const classCount = {};
  const missing = [];

  for (const entry of plan) {
    const glb = join(GENERATIONS, entry.root, 'model.glb');
    if (!existsSync(glb)) { missing.push(entry.root); continue; }
    const head = headline(entry.prompt);
    const cls = classFor(entry.pack, head);
    const slug = dedupe(slugify(head));
    const outDir = CLASS_DIR[cls];

    // Read the Kiln generation provenance for accurate provider/model/ts/prompt.
    const genProvPath = join(GENERATIONS, entry.root, 'provenance.json');
    let provider = 'kiln-studio';
    let model = 'kiln-studio';
    let ts = new Date().toISOString();
    let promptHash = null;
    let category = null;
    if (existsSync(genProvPath)) {
      const gp = JSON.parse(readFileSync(genProvPath, 'utf8'));
      provider = gp.model?.provider ?? provider;
      model = gp.model?.model ?? model;
      ts = gp.createdAt ?? ts;
      promptHash = gp.request?.promptHash ?? null;
      category = gp.request?.category ?? null;
    }

    // Stage the GLB + a provenance sidecar in the importer-expected layout.
    const fileRel = `kiln/${outDir}/${slug}.glb`;
    const destGlb = join(OUT, fileRel);
    mkdirSync(dirname(destGlb), { recursive: true });
    copyFileSync(glb, destGlb);
    const bytes = statSync(destGlb).size;

    const sidecar = {
      asset: `${slug}.glb`,
      provider,
      model,
      pipeline: 'kiln-batch-glb',
      ts,
      prompt: entry.prompt,
      promptHash,
      extras: { slug, pack: entry.pack, grade: entry.grade, generationId: entry.root, category },
    };
    writeFileSync(`${destGlb}.provenance.json`, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');

    const tijTarget = `public/models/${outDir}/${KILN_SUBDIR}/${slug}.glb`;
    assets.push({
      slug,
      class: cls,
      status: 'ready',
      file: fileRel,
      bytes,
      tris: 0, // re-measured from geometry by the importer; manifest value is advisory.
      model: `${provider}:${model}`,
      action: 'new',
      handEdit: `Kiln war-export-plan 2026-06-25; grade ${entry.grade}; generation ${entry.root}`,
      tijTarget,
      generatedAt: ts,
    });
    index.push({ slug, class: cls, pack: entry.pack, grade: entry.grade, generationId: entry.root, headline: head, tijTarget, runtimePath: `${outDir}/${KILN_SUBDIR}/${slug}.glb` });
    gradeCount[entry.grade] = (gradeCount[entry.grade] || 0) + 1;
    classCount[cls] = (classCount[cls] || 0) + 1;
  }

  const manifest = {
    batch: 'kiln-war-export-2026-06-25',
    generatedAt: new Date().toISOString(),
    source: 'kiln-studio war-export-plan.json',
    assets,
  };
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(join(OUT, 'kiln-grade-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  console.log(`Staged ${assets.length} Kiln war assets -> ${OUT}`);
  console.log(`  class:  ${JSON.stringify(classCount)}`);
  console.log(`  grade:  ${JSON.stringify(gradeCount)}`);
  if (missing.length) console.log(`  MISSING generation GLBs (${missing.length}): ${missing.join(', ')}`);
  if (new Set(assets.map((a) => a.slug)).size !== assets.length) {
    console.error('FATAL: duplicate slug in staged manifest');
    process.exit(1);
  }
}

main();
