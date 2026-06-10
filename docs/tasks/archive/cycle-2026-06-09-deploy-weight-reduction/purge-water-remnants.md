# purge-water-remnants

The 2026-06-09 water scorch removed water itself, but unreachable water-era
code still ships: `WeatherSystem.setUnderwater` + its branch, AtmosphereSystem
underwater overrides + the FogTintIntentReceiver member, an R2
`a-shau-rivers.json` `required:true` asset pin (a hard dependency on an asset
for a feature that no longer exists), unreferenced water-era textures, and
stale WaterSystem comments. Delete the dead paths. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 5 — deletion
task. Boats stay dormant-but-intact per the scorch decision.)

## Files touched

- `src/systems/environment/WeatherSystem.ts` (setUnderwater + branch)
- `src/systems/environment/WeatherAtmosphere.ts`
- `src/systems/environment/AtmosphereSystem.ts` (underwater overrides,
  FogTintIntentReceiver member)
- `scripts/cloudflare-assets.ts` (a-shau-rivers.json required:true pin)
- `src/systems/assets/AssetLoader.ts` (water-era texture refs)
- sibling tests of the touched systems (drop dead-path tests)

## Scope

1. Delete the unreachable underwater path: `setUnderwater` + branch in
   WeatherSystem; underwater overrides + FogTintIntentReceiver member in
   AtmosphereSystem/WeatherAtmosphere. Verify zero callers first (grep).
2. Remove the `a-shau-rivers.json` `required:true` pin from the asset
   manifest pipeline (and the asset reference itself if nothing loads it).
3. Remove loads of unreferenced water-era textures from AssetLoader; list
   the texture files freed in the PR (deletion of the texture binaries from
   R2/public is reported, not silently done, if any are still pinned).
4. Fix stale WaterSystem-era comments in the touched files.

## Non-goals

- Touching dormant watercraft code (Sampan/PBR/WatercraftPlayerAdapter stay —
  they return when water is reworked).
- Any change to how a future water system would be built.

## Acceptance

- [ ] Grep-clean: no `setUnderwater` callers, no underwater branch, no
      a-shau-rivers pin; `npm run knip:ci` passes.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief; lists bytes freed.
