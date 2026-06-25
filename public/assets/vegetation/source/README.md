# Vegetation raw-source staging (git-ignored)

Raw downloaded source assets for the Strategy A Vietnam vegetation layer
(cycle C4). **Bytes here are NOT committed** — they are git-ignored because of
their license terms and size. Only this `README.md` and `.gitkeep` are tracked.

## Layout

One subfolder per source slug, matching the slugs in
`docs/asset-provenance/vegetation-2026-06/<slug>.provenance.json`:

```
public/assets/vegetation/source/
  m02p-tropical-plants/     # CC-BY  (mozzarellaARC, Sketchfab)
  ez-tree/                  # MIT    (dgreenheck generator export)
  ambientcg-grass004/       # CC0    (ambientCG)
  ambientcg-leafset013/     # CC0
  ambientcg-leafset017/     # CC0
  cc0-malayan-banyan/       # CC0    (ffish.asia/floraZia)
  mangrove-tree-roots/      # CC-BY
  chinese-banyan/           # CC-BY  (impostor-bake source only)
  jungle-tree/              # CC-BY
  mangrove-hero/            # CC-BY
  polyhaven-dead-tree/      # CC0    (Poly Haven)
  rice-plant/               # CC-BY
  lordsamueli-bamboo/       # CC-BY
  quaternius-nature/        # CC0    (fallback backbone)
  polyhaven-fern-02/        # CC0
```

## How to populate

The owner downloads each source manually (all behind
Sketchfab/ambientCG/PolyHaven auth — no script can fetch them). Follow
`docs/asset-provenance/vegetation-2026-06/DOWNLOAD_CHECKLIST.md` in order and
drop each archive's extracted contents into its matching slug folder above.

After a download:
- Verify the license badge matches the provenance record.
- Update the matching `<slug>.provenance.json` (`status`, verified triangle
  count, exact author handle + URL + license version).
- For CC-BY sources, copy the drafted credit line from
  `docs/asset-provenance/vegetation-2026-06/ATTRIBUTION_PENDING.md` into
  `src/ui/AttributionNotice.ts` only when the derived asset actually ships.

## References

- `docs/rearch/strategy-a-source-manifest.md` — full download list + licenses.
- `docs/rearch/STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md` — Phase 0 (§6) + files-touched (§7).
- `docs/asset-provenance/vegetation-2026-06/` — per-asset provenance records.
