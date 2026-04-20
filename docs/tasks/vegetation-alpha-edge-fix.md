# vegetation-alpha-edge-fix: white/blue outlines on vegetation edge pixels

**Slug:** `vegetation-alpha-edge-fix`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — visible regression in playtest; vegetation is the dominant scene element.
**Playtest required:** YES (visual observable).
**Estimated risk:** medium — alpha-test interaction with mipmaps + new fog-color uniform.
**Budget:** ≤ 250 LOC.
**Files touched:**

- Investigate: vegetation rendering path. The repo has no `src/systems/vegetation/` or `src/systems/foliage/` directory; vegetation lives in `src/systems/terrain/TerrainFeatureCompiler.ts`, `src/systems/terrain/ChunkVegetationGenerator.ts`, possibly `src/systems/terrain/VegetationScatterer.test.ts` and `src/systems/assets/ModelDrawCallOptimizer.ts`.
- Probably modify: the material setup for vegetation sprites / billboards (alphaTest threshold, mipmap settings, premultipliedAlpha, fog usage).

## Symptoms (orchestrator playtest 2026-04-20)

User reported: "vegetation now has white or blue outlines on the edge of the visible pixels at times now that were not there before."

This is the classic alpha-test fringe artifact: vegetation textures use a binary `alphaTest` cutout (discard fragments below threshold). At texture seam pixels with partial alpha, the kept pixel inherits the texture's RGB from a TRANSPARENT neighbor (often white or sky-blue from the source PNG's background) and the discarded neighbors leave that fringe visible.

Why now: the cycle-2026-04-20 atmosphere stack changed:
1. Sky background + dome from dark-grey PNG to a bright Hosek/Preetham analytic with a near-white horizon.
2. Fog color from a constant `0x5a7a6a` to a sky-driven uniform. If vegetation samples fog using its OWN material setup (different from terrain), the fog interaction at fringe pixels may produce a visible halo.

Was hidden previously because the dark-grey background masked the white-fringe artifact.

## Required reading first

- Search: `Grep alphaTest src/`. Find every vegetation material that uses `alphaTest`.
- `src/systems/terrain/TerrainFeatureCompiler.ts` and `src/systems/terrain/ChunkVegetationGenerator.ts` — vegetation instancing.
- `src/systems/assets/ModelDrawCallOptimizer.ts` — material setup for instanced models.
- `src/systems/combat/CombatantMeshFactory.ts` — combatant sprites also use alpha cutout; same pattern likely shared.
- `public/assets/vegetation/` (or wherever vegetation textures live) — check the PNG borders. If alpha-test, the RGB inside the discarded pixels matters.

## Hypothesis (verify before fix)

The fix is one of (cheapest first):

1. **Pre-multiply alpha into the source PNGs** (asset-side fix). Solves it forever, no shader changes. But touches binary assets — check if there's an existing asset pipeline (`scripts/optimize-assets.ts`, `assets:fix-alpha` mentioned in package.json scripts list).
2. **Bleed RGB across the alpha boundary** so discarded pixels carry plausible RGB. Same asset-pipeline approach.
3. **Lower mipmap influence** (`magFilter: NearestFilter`, `generateMipmaps: false`) — but vegetation needs mipmaps for distant LOD.
4. **Use `alphaToCoverage`** instead of binary alphaTest — only works when MSAA is on, which it isn't in this pipeline (we use 1/3-res RT → blit, no MSAA on the RT).
5. **Adjust alphaTest threshold** — raising it discards more fringe but may cause vegetation to look thinner.

The repo already has `npm run assets:fix-alpha` — investigate what it does and whether running it across vegetation textures resolves this.

## Steps

1. Reproduce: `npm run dev`, observe a vegetation cluster near the player at noon. Confirm white/blue outlines on edges.
2. Read each of the files in "Required reading first." Identify the exact material setup vegetation uses.
3. Test option 1 (alpha bleed via existing asset pipeline) on a single vegetation sprite. If it fixes the issue, run it across all vegetation textures.
4. If asset pipeline doesn't help, try the shader-side options.
5. Verify the fix doesn't break other vegetation rendering (LOD transitions, distant haze).

## Screenshot evidence (required for merge)

Commit before/after PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/vegetation-alpha-edge-fix/`:

- `combat120-vegetation-closeup-master.png` and `combat120-vegetation-closeup-fixed.png` — same camera, same scene, before/after.
- `ashau-vegetation-distance-fixed.png` — distant vegetation should still read correctly (no LOD regression).

## Exit criteria

- White/blue outlines on vegetation edges are gone or significantly reduced.
- Vegetation LOD / distant rendering unchanged.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf smoke within WARN bound.

## Non-goals

- Do not switch to a different vegetation rendering paradigm (impostors, geometry-shader expansion, etc.).
- Do not redesign the vegetation asset pipeline beyond alpha-bleed if needed.
- Do not address vegetation color/lighting parity here — separate `vegetation-fog-and-lighting-parity` task.

## Hard stops

- Fence change → STOP.
- Fix would require regenerating navmesh / heightmap → STOP.
- Fix breaks distant LOD readability → STOP, revert and try a different option.
