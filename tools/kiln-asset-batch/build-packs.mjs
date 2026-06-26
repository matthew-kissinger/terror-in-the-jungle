// Builds Kiln pack plans for the Vietnam war-asset regen from the existing
// provenance prompts. Output: ./packs/*.json, each a ready-to-POST { plan }
// body for POST /api/packs (palette-bound). Run: node build-packs.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROV = resolve(here, '../../docs/asset-provenance/repaint-2026-06');
const OUT = resolve(here, 'packs');
const PALETTE_ID = 'vietnam-war';
const MAX_ITEMS = 40;
const MAX_PROMPT = 400;

// class -> { category (generation taxonomy), role (layout/grade) }
const MAP = {
  weapons:    { category: 'prop',         role: 'prop' },
  structures: { category: 'environment',  role: 'building' },
  buildings:  { category: 'architecture', role: 'building' },
  aircraft:   { category: 'prop',         role: 'vehicle' },
  ground:     { category: 'prop',         role: 'vehicle' },
  boats:      { category: 'prop',         role: 'vehicle' },
  animals:    { category: 'prop',         role: 'prop' },
  props:      { category: 'prop',         role: 'prop' },
};

// Which classes go in which pack file (each <= 40 items).
const PACKS = [
  { id: 'weapons',       name: 'Vietnam Weapons',   classes: ['weapons'],
    theme: 'Vietnam-war infantry small arms and heavy weapons, low-poly game-ready, one shared palette.' },
  { id: 'structures',    name: 'Vietnam Structures', classes: ['structures'],
    theme: 'Vietnam-war firebase fortifications, emplacements, and field structures, low-poly game-ready.' },
  { id: 'buildings',     name: 'Vietnam Buildings',  classes: ['buildings'],
    theme: 'Vietnamese village and French-colonial buildings, low-poly game-ready, one shared palette.' },
  { id: 'vehicles',      name: 'Vietnam Vehicles',   classes: ['aircraft', 'ground', 'boats'],
    theme: 'Vietnam-war aircraft, ground vehicles, and boats, low-poly game-ready, +X forward, named pivots for rotors/turrets/wheels.' },
  { id: 'wildlife-props', name: 'Vietnam Wildlife and Props', classes: ['animals', 'props'],
    theme: 'Southeast-Asian jungle wildlife and field props, low-poly game-ready.' },
];

// Per-class suffix nudging Kiln toward the engine conventions + budget.
const SUFFIX = {
  vehicle: ' Low-poly, +X forward, ground at Y=0; named pivots for moving parts.',
  prop: ' Low-poly, game-ready, clean hard edges.',
  building: ' Low-poly, blocky, modular; simple readable silhouette.',
};

function trimPrompt(text, suffix) {
  let t = (text || '').replace(/\s+/g, ' ').trim();
  const budget = MAX_PROMPT - suffix.length;
  if (t.length > budget) {
    t = t.slice(0, budget);
    const cut = Math.max(t.lastIndexOf('. '), t.lastIndexOf(', '), t.lastIndexOf(' '));
    if (cut > budget * 0.6) t = t.slice(0, cut);
    // Drop dangling trailing stub words/punctuation so the prompt ends clean.
    t = t.replace(/[\s,;:]+$/, '');
    for (let i = 0; i < 4; i++) {
      t = t.replace(/[\s,]+(and|with|a|the|of|that|carry|carries|on|in|over|like|its)$/i, '').replace(/[\s,;:]+$/, '');
    }
    t = t + '.';
  }
  return (t + suffix).slice(0, MAX_PROMPT);
}

// Load provenance.
const prov = {};
for (const f of readdirSync(PROV).filter((f) => f.endsWith('.provenance.json'))) {
  const j = JSON.parse(readFileSync(resolve(PROV, f), 'utf8'));
  if (j.sourcePrompt) prov[j.slug] = j;
}

mkdirSync(OUT, { recursive: true });
let totalItems = 0;
const report = [];

for (const pack of PACKS) {
  const items = [];
  for (const slug of Object.keys(prov).sort()) {
    const p = prov[slug];
    if (!pack.classes.includes(p.class)) continue;
    const m = MAP[p.class];
    const suffix = SUFFIX[m.role] || '';
    items.push({
      prompt: trimPrompt(p.sourcePrompt, suffix),
      category: m.category,
      role: m.role,
    });
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(`pack ${pack.id} has ${items.length} > ${MAX_ITEMS} items; split it.`);
  }
  const body = {
    plan: {
      name: pack.name,
      prompt: pack.theme,
      paletteId: PALETTE_ID,
      items,
    },
  };
  writeFileSync(resolve(OUT, `pack-${pack.id}.json`), JSON.stringify(body, null, 2) + '\n');
  totalItems += items.length;
  report.push(`pack-${pack.id}.json: ${items.length} items  (${pack.classes.join('+')})`);
}

console.log(report.join('\n'));
console.log(`\nTotal: ${totalItems} items across ${PACKS.length} packs, palette=${PALETTE_ID}`);
const over = Object.values(prov).filter((p) => false).length; // placeholder
console.log(`Longest item prompt check: all <= ${MAX_PROMPT} chars (enforced).`);
