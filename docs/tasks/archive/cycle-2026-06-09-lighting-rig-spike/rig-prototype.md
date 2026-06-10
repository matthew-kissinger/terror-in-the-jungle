<!-- cycle-2026-06-09-lighting-rig-spike R2; follows tod-capture-harness + lighting-audit-memo -->
# rig-prototype

The Phase 0 GO/NO-GO evidence: a flag-gated prototype of the unified lighting
rig on two families (terrain + billboard foliage), A/B-measured with the TOD
coherence harness. Baseline (rig-off) is already damning: foliage range ratio
0.459 vs terrain, GLB correlation -0.772. This task must show the rig closes
the foliage gap. Spec: `docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md`
(memo, merged PR #363). Campaign: `docs/CAMPAIGN_2026-06-09-lighting-rig.md`.

## Files touched

- New rig module under `src/systems/environment/` per the memo's spec
  (LightingRigState / createLightingRigState; prototype-grade but real — it
  seeds Phase 1) + sibling test
- `src/systems/environment/AtmosphereSystem.ts` (derive rig state per frame
  at the LightFog marker, behind the flag)
- `src/systems/terrain/TerrainMaterial.ts` (flag-gated rig branch)
- `src/systems/world/billboard/BillboardNodeMaterial.ts` (flag-gated
  wrapped-Lambert branch)
- `src/core/SystemUpdater.ts` (wiring, if required)

## Scope

1. Implement the memo's rig state (linear radiance: sunDirection,
   sunRadiance, skyIrradiance, groundIrradiance, ambientRadiance,
   sunElevation, fogColor, fogDensity, daylightFactor) derived once per
   frame from the Hosek model — NO shapeDirectLightForRenderer compression
   on the rig path.
2. Runtime flag, default OFF, togglable from a Playwright `page.evaluate`
   (follow an existing runtime-config pattern, e.g. NpcLodConfig-style);
   legacy path byte-identical when OFF.
3. Terrain: flag-gated branch consuming rig sun/sky terms (PBR stays;
   compression gone). Billboards: flag-gated wrapped-Lambert (wrap=0.5)
   against the same terms, clamps bypassed on the rig path.
4. Prototype exposure: single scalar on the rig path per the memo's policy
   (TOD-aware curve keyed on sunElevation) — enough for honest A/B, not
   final tuning.
5. A/B evidence: `capture:tod-sweep --label=rig-off` then `--label=rig-on`
   (flag toggled via the script's evaluate hook — add a `--set-flag` arg to
   the sweep script if needed). Paste both coherence tables in the PR.

## Non-goals

- No NPC impostor / GLB / effects migration (Phase 2).
- No preset retune, no fog unification (Phase 3).
- No deletion of legacy paths (Phase 4); flag default stays OFF in prod.
- Not final visual tuning — coherence numbers + side-by-side captures only.

## Acceptance

- [ ] rig-on coherence table: foliage rangeRatioVsTerrain ≥ 0.6 AND
      corrVsTerrain ≥ 0.92 (memo band); dawn terrain luminance ≤ 0.85.
- [ ] rig-off table matches baseline (legacy path untouched when OFF).
- [ ] `npm run lint && npm run test:run && npm run build` pass; no
      `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief, with both tables + 2-3
      side-by-side PNGs (dawn, noon, midnight) attached or path-referenced.

## Round 2 / Dependencies

- Depends on: `tod-capture-harness` (merged), `lighting-audit-memo` (merged).
- Feeds: the campaign's Phase 0 GO/NO-GO review.
