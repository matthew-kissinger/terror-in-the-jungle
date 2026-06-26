// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Per-slug uniform scale corrections for war-asset GLBs whose Kiln source was
 * generated at the wrong scale.
 *
 * The correction is applied at the importer's `TIJ_AxisNormalize` wrapper node
 * (so the whole model scales uniformly about its ground-anchored origin) AND
 * folded into the measured catalog `dims`/`minY`, so the generated catalog stays
 * truthful to what actually loads (dims-coupled mount/camera banding keeps
 * working with no per-consumer magic numbers).
 *
 * These compensate for CONFIRMED Kiln-source half-scale defects, measured by
 * byte-level world-bbox against the true airframe + the prior true-scale legacy
 * GLB (see scratchpad/measure-bbox.mjs):
 *   - uh-1c-huey-gunship: Kiln ~6.28 m long vs the true ~13.86 m -> x2.207.
 *     Rotor span (~13.5 m) and fuselage (~13.86 m) land well-proportioned at the
 *     real Huey footprint.
 *   - b-52d-stratofortress-strategic: Kiln ~21.36 m span vs the in-game-balanced
 *     legacy ~54.4 m -> x2.547. Matches the balanced bomber silhouette. The Kiln
 *     source is additionally slightly stubby in fuselage aspect (a separate
 *     re-roll advisory); uniform scale right-sizes the dominant wingspan
 *     silhouette for the high-altitude arclight flyover.
 *
 * A future corrected Kiln re-roll should DROP the slug from this map (the
 * regenerated GLB will already be true-scale). This map is the single source of
 * truth shared by:
 *   - scripts/import-war-catalog.ts  (full re-import path)
 *   - scripts/apply-catalog-scale-fix.ts (in-place fix for the committed GLBs)
 */
export const CATALOG_SCALE_FIX: Record<string, number> = {
  'uh-1c-huey-gunship': 2.207,
  'b-52d-stratofortress-strategic': 2.547,
};
