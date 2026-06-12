# Repaint 2026-06 — re-roll requests

Assets REJECTED by `scripts/import-war-catalog.ts` budget triage. The prior
TIJ GLB is kept on disk unchanged; the pixel-forge side owns the re-roll.
Re-rolled assets re-enter through the same importer (idempotent).

| slug | class | measured tris | measured KB | reason | target tris |
|---|---|---:|---:|---|---:|
| ammo-bunker | structures | 35456 | 201.9 | 35456 tris > 20k hard cap | 2500 |
| barbed-wire-fence | structures | 8520 | 375 | 375KB > 300KB hard cap; mass-placed 8520 tris > 6k cap | 2500 |
| concertina-wire | structures | 14948 | 464.2 | 464.2KB > 300KB hard cap; mass-placed 14948 tris > 6k cap | 2500 |
| egret | animals | 8230 | 512.6 | 512.6KB > 300KB hard cap | 2057 |
| helipad | structures | 41704 | 84.6 | 41704 tris > 20k hard cap; helipad footprint 26m / height 4.44m breaks 14m flat-pad landing contract | 2500 |
| rice-dike | structures | 8812 | 739.1 | 739.1KB > 300KB hard cap | 2500 |
| sandbag-bunker | structures | 8524 | 47.9 | mass-placed 8524 tris > 6k cap | 2500 |
| sandbag-wall | structures | 48472 | 123.6 | 48472 tris > 20k hard cap; mass-placed 48472 tris > 6k cap | 2500 |
| toc-bunker | structures | 15132 | 119.5 | minY -2.2m: bounds-snap would beach the buried bunker as a monolith | 2500 |
