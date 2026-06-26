# Repaint 2026-06 — re-roll requests

Assets REJECTED by `scripts/import-war-catalog.ts` budget triage. The prior
TIJ GLB is kept on disk unchanged; the pixel-forge side owns the re-roll.
Re-rolled assets re-enter through the same importer (idempotent).

| slug | class | measured tris | measured KB | reason | target tris |
|---|---|---:|---:|---|---:|
| ammo-bunker | structures | 35456 | 201.9 | 35456 tris > 20k hard cap | 2500 |
| barbed-wire-fence | structures | 8520 | 375 | 375KB > 300KB hard cap; mass-placed 8520 tris > 6k cap | 2500 |
| burmese-python-rest | animals | 22152 | 582.5 | 22152 tris > 20k hard cap; 582.5KB > 300KB hard cap (Kiln war-export 2026-06-25) | 5538 |
| concertina-wire | structures | 14948 | 464.2 | 464.2KB > 300KB hard cap; mass-placed 14948 tris > 6k cap | 2500 |
| egret | animals | 8230 | 512.6 | 512.6KB > 300KB hard cap | 2057 |
| helipad | structures | 41704 | 84.6 | 41704 tris > 20k hard cap; helipad footprint 26m / height 4.44m breaks 14m flat-pad landing contract | 2500 |
| rice-dike | structures | 8812 | 739.1 | 739.1KB > 300KB hard cap | 2500 |
| sandbag-bunker | structures | 8524 | 47.9 | mass-placed 8524 tris > 6k cap | 2500 |
| sandbag-wall | structures | 48472 | 123.6 | 48472 tris > 20k hard cap; mass-placed 48472 tris > 6k cap | 2500 |
| toc-bunker | structures | 15132 | 119.5 | minY -2.2m: bounds-snap would beach the buried bunker as a monolith | 2500 |

## Re-roll advisories (imported, but flagged for the next roll)

Accepted into the catalog this cycle; fix in a future re-roll, not urgent:

| slug | class | issue |
|---|---|---|
| a37-dragonfly | aircraft | under-scale: 5.5m vs real ~8.6m (dormant entry; matters when flyable) |
| hh3e-jolly-green-giant | aircraft | under-scale: 9.4m vs real ~17.6m fuselage (dormant entry) |
| artillery-pit | structures | POSITION accessors lack min/max — importer decodes buffers instead of trusting accessor bounds; regenerate with valid bounds |
| helipad (re-roll spec) | structures | beyond the tri cap, the re-roll must restore the 14m flat-pad landing contract (current roll: 26m footprint, 4.4m tall) |

Cycle close 2026-06-12: no owner-flagged items yet — the owner walk has not
happened. The `/gallery` dev route is the review surface; additions from that
walk append here. Re-rolled assets re-enter through
`npm run assets:import-war-catalog` unchanged (idempotent; budget triage
re-evaluates automatically).
