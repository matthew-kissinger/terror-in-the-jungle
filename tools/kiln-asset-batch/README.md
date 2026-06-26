# Kiln war-asset batch

Regenerates the 99-asset Vietnam war catalog in [Kiln Studio](https://kilnstudio.tools)
under one shared palette, then exports GLBs for the game importer.

## Files
- `vietnam-war.palette.json` — the 21-slot "Vietnam War" palette (POST body for `/api/palettes`).
- `build-packs.mjs` — generates `packs/*.json` from `docs/asset-provenance/repaint-2026-06/*` (the existing prompts), mapping class→category/role, trimming to ≤400 chars, binding the palette. Re-run after editing prompts.
- `packs/pack-*.json` — 5 ready-to-POST `{ plan }` bodies for `/api/packs` (each ≤40 items):
  | pack | items | classes |
  |---|---|---|
  | weapons | 15 | weapons |
  | structures | 24 | structures |
  | buildings | 20 | buildings |
  | vehicles | 28 | aircraft + ground + boats |
  | wildlife-props | 12 | animals + props |
- `run-batch.sh` — creates the palette, locks each pack, and runs it.

## Why packs (not the flat batch CLI)
The `batch-run.ts` CLI does **not** forward `paletteId`, so it can't apply the
shared palette. The packs API binds a pack-wide `paletteId` that hard-snaps every
asset's materials to the palette (OKLab nearest-slot) — that's the whole point.
40-item cap per pack is why the 99 assets are split into 5 packs.

## Run it
1. Start the server (loads the Gemini key per the env-shadow gotcha):
   ```bash
   cd ../../../kiln/kiln-studio
   set -a && . ./.env.local && set +a
   KILN_STUDIO_ADAPTER=in-process KILN_STUDIO_STORE=file KILN_STUDIO_AUTH=dev \
     bun run server/src/index.ts        # :3200, dev-admin is cap-exempt
   ```
2. Drive the batch (all packs, or a subset):
   ```bash
   ./run-batch.sh                # all 5 packs
   ./run-batch.sh weapons        # just one
   ```
   Or use the Packs view in the local UI — the 5 packs + palette are already created.

3. Poll: `GET /api/packs/<id>` → member `status`/`grade`, or watch the Packs view.

## Export → game
Generated GLBs download per-asset (gallery / `downloadUrl`). Kiln bakes
**+X forward, +Y up, ground Y=0**; the game importer
(`npm run assets:import-war-catalog`) normalizes axis (+X→+Z, ground vehicles +X→-Z)
and grafts rotor/turret/wheel joints. Grade A–F keys on **material count** — the
shared palette is the lever that lifts the high-material assets (aid-station 19-mat,
warehouse 14-mat) to A/B.

## Notes
- Prompts seed from the existing provenance (`sourcePrompt`), trimmed to the 400-char
  item cap with a per-role suffix (low-poly / +X forward / named pivots). Edit
  `build-packs.mjs` mappings or the source prompts and re-run to regenerate `packs/`.
- Animals are organic — Kiln is weakest there; consider sourcing those instead (see
  `docs/rearch/ASSET_REGEN_AND_R185_SCAFFOLD_2026-06-25.md`).
- The REJECT/over-budget assets (sandbag-wall 48k tris, helipad 41k) get the low-poly
  suffix; re-roll any that still blow the budget.
