# Vegetation provenance — cycle C4 (2026-06)

Per-asset provenance records for the **Strategy A** Vietnam vegetation sources.
One `<slug>.provenance.json` per source in
`docs/rearch/strategy-a-source-manifest.md` (Tier 1/2/3 tables).

**Status: pending-download.** The raw source bytes are behind
Sketchfab / ambientCG / Poly Haven auth and are acquired manually by the owner
(no script can fetch them). Until then every record carries
`"status": "pending-download"` and stages into
`public/assets/vegetation/source/<slug>/` (git-ignored).

## Record schema (stub)

```jsonc
{
  "slug": "...",                 // matches the staging folder + this filename
  "provider": "...",             // mozzarellaARC / dgreenheck / ambientCG / Poly Haven / ...
  "sourceUrl": "...",            // exact download page
  "license": "CC-BY | CC0 | MIT",
  "sourceTriangles": 46575,      // verified from manifest, or null if ⚠️ unverified
  "status": "pending-download",  // → "downloaded" then "shipped" as it lands
  "localPath": "public/assets/vegetation/source/<slug>/",
  "attributionRequired": true,   // true for CC-BY; false for CC0/MIT
  "notes": "..."                 // use, mesh/texture work, license caveats
}
```

## On download (owner)

1. Verify the license badge at the source matches `license` here.
2. Set `status` → `downloaded`; fill the **verified** triangle count + the exact
   author handle, model URL, and license version.
3. For CC-BY sources, copy the matching credit line from
   `ATTRIBUTION_PENDING.md` into `src/ui/AttributionNotice.ts` **only when the
   derived asset actually ships**, then set `status` → `shipped`.

## Files

- `DOWNLOAD_CHECKLIST.md` — owner-facing ordered acquisition checklist (by Tier).
- `ATTRIBUTION_PENDING.md` — drafted CC-BY credit lines (copy-paste when shipped).
- `<slug>.provenance.json` — the 15 source stubs.

## References

- `docs/rearch/strategy-a-source-manifest.md`
- `docs/rearch/STRATEGY_A_VEGETATION_IMPLEMENTATION_2026-06-25.md` (§6 Phase 0, §7 files-touched)
- `ASSET_ACCEPTANCE_STANDARD.md` (provenance requirement)
