<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase PX, owner-added 2026-06-29). -->
# cycle-2026-06-29-terrain-spike-fix

Phase PX — owner-reported mid-campaign: random ~100m terrain "towers/spikes" stick
up out of the ground across the map. Two investigations + a node bake replication
proved the terrain heightmap pipeline is CLEAN (A Shau DEM has no NaN/Inf/sentinel;
0 baked cells exceed their neighborhood by >50m; steepest real delta 68.8m/21m is a
real ridge). The tower is NOT terrain — it is a **static-impostor billboard card**
whose vertical scale is taken from a live `Box3.setFromObject()` Y extent with only a
LOWER clamp (0.1) and no upper clamp, ignoring the archetype's authored `bounds.size`.
Impostor cards are the far-LOD of map-scattered GLB hero trees, so any hero GLB with an
inflated runtime AABB-Y renders as a tall card at scattered locations, only at impostor
distance — matching the symptom exactly. A DEM/height clamp would be a NO-OP.

## Files touched

- `src/systems/world/staticImpostors/StaticImpostorSystem.ts` (upper-clamp card scale.y; registration guard/log)
- `src/systems/world/staticImpostors/StaticImpostorSystem.test.ts` (new/extend — regression lock + best-effort GLB-bounds audit)

## Scope

1. At `StaticImpostorSystem.ts:~197-218`, upper-clamp the card's vertical scale to the
   archetype's authored bounds: `clamp(_size.y, 0.1, archetype.bounds.size[1] * 1.5) * planePaddingScale`.
   Keep the existing lower clamp and `planePaddingScale`. Confirm `archetype.bounds.size[1]`
   is available at that call-site (read `src/config/staticImpostorArchetypes.ts`).
2. Add a ONE-TIME warn-log (per archetype) when the live `_size.y` exceeds
   `archetype.bounds.size[1] * 2`, naming the archetype + modelPath, so the offending GLB
   is caught at registration rather than silently rendered as a tower.
3. Tests: a deterministic regression test feeding `registerInstance` a synthetic object with
   an inflated-Y child and asserting the resulting card scale.y is clamped (NOT a tower).
   If GLB load works in the test env (GLTFLoader parses geometry without a GL context),
   ALSO add a best-effort audit asserting each archetype GLB's `Box3.setFromObject` Y is
   ≤ `bounds.size[1] * 1.5`, and report which archetype (if any) fails — that names the
   culprit asset for a follow-up re-normalize. If GLB load is not viable in jsdom, skip the
   audit gracefully and note it; the synthetic regression test is the required lock.

## Non-goals

- NO change to the DEM/heightmap/bake/CDLOD path (proven clean — a height clamp would be a no-op).
- NO touch to `src/systems/terrain/**` or `src/config/AShauValleyConfig.ts` (the separate
  worldSize/DEM-box ~1.93% mismatch is a real latent bug but causes edge-droop, not towers —
  out of scope; record as a follow-up).
- NO re-import/re-normalization of GLB assets (the clamp fixes the symptom now; the audit
  names the asset for a later import-pipeline pass).

## Acceptance

- [ ] Impostor card vertical scale is upper-clamped to authored bounds; no tower can render
      from an inflated GLB AABB.
- [ ] Regression test locks the clamp; audit (if viable) names any offending archetype.
- [ ] `npm run lint && npm run test:run && npm run build` green; fence-safe; budgets verified.
- [ ] Owner visual confirmation deferred to `docs/PLAYTEST_PENDING.md` (can't render-verify headless).

## Dependencies

- Independent (world/impostor layer). Benefits P5 orbital map indirectly (same scatter set),
  but touches no shared files. No reviewer gate required (not combat/terrain/nav scope).
