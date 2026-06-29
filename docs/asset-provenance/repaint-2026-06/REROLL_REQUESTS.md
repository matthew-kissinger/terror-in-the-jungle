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

## Done — re-rolled, imported, wired, gallery-verified

Closed by the owner's Kiln re-roll pass; no further request. Each re-entered
through the importer (idempotent), was spliced into the catalog, and confirmed in
`?mode=asset-gallery` (clean load, no GLTFLoader/texture errors). Prompts of
record: `REROLL_PROMPTS_2026-06-28.md`.

| slug | class | fix shipped | when / commit |
|---|---|---|---|
| uh-1h-huey-transport | aircraft | thinner tail boom + forward-facing cockpit glass; main + tail rotor kept as separate spinning parts. Measured dims `[2.45, 2.98, 12.45]`, 1652 tris, budget PASS | 2026-06-28, `f8c3518c` |
| a-1-skyraider-spad | aircraft | regenerated one clean continuous deep-bellied fuselage (no lumps/steps); propeller kept as a separate spinning part. Measured dims `[14.7, 4.39, 11.03]`, 2612 tris, budget PASS | 2026-06-28, `f8c3518c` |

## Re-roll advisories (imported, but flagged for the next roll)

Accepted into the catalog this cycle; fix in a future re-roll, not urgent:

| slug | class | issue |
|---|---|---|
| b-52d-stratofortress-strategic | aircraft | aspect-stubby source: fuselage ~39m vs real ~47.85m. The catalog scale-fix uniform x2.547 right-sized the dominant wingspan silhouette (21.36m -> 54.4m) for the high-altitude arclight flyover, but uniform scale cannot fix the body aspect — a source re-roll is the only fix. Re-roll a longer, more slender fuselage at true ~50m length keeping the wingspan-wider-than-body proportion |
| a-37-dragonfly-light | aircraft | under-scale: ~5.5m vs real ~8.6m length (live Kiln-batch entry; dormant, matters when flyable). Re-roll at true scale ("small at under nine meters" is already in the prompt — generate to that length, not stubby-small) |
| a37-dragonfly | aircraft | under-scale: 5.5m vs real ~8.6m (older 2026-06-11 roll, superseded by `a-37-dragonfly-light` above; same defect) |
| hh3e-jolly-green-giant | aircraft | under-scale: 9.4m vs real ~17.6m fuselage (dormant entry) |
| artillery-pit | structures | POSITION accessors lack min/max — importer decodes buffers instead of trusting accessor bounds; regenerate with valid bounds |
| helipad (re-roll spec) | structures | beyond the tri cap, the re-roll must restore the 14m flat-pad landing contract (current roll: 26m footprint, 4.4m tall) |

## Not a re-roll (handled elsewhere)

- **Coconut palm** — the off-center/leaning-trunk pop the owner saw is a LOD
  mesh<->card transition pop, fixed in-cycle by `coconut-card-crossfade`
  (PR #437, `fd46642c`) — a `transitionFadeMeters` opacity crossfade, NOT an art
  re-roll. The coconut GLB itself (external Poly-by-Google CC-BY) is unchanged.
  A true source replacement, if ever needed, goes through the
  vegetation/impostor pipeline, not the war importer.

Owner walk 2026-06-28: the UH-1 Huey + A-1 Skyraider rolls above are DONE; the
remaining open items are the advisories listed above (next Kiln pass). The
`/gallery` dev route is the review surface; additions from future walks append
here. Re-rolled assets re-enter through `npm run assets:import-war-catalog`
unchanged (idempotent; budget triage re-evaluates automatically).
