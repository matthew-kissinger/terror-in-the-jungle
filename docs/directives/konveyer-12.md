# KONVEYER-12 — Finite map edge strategy

Status: open
Owning subsystem: terrain / renderer / atmosphere / mode boundaries
Opened: cycle-2026-05-11-konveyer-edge-strategy

## Latest evidence

K10/K11 strict scene probes show the old render-only apron was measurable but not visually accepted. A cheap render-only horizon-ring prototype passed strict WebGPU numeric checks at `artifacts/perf/2026-05-11T19-44-30-183Z/konveyer-scene-parity/scene-parity.json`, but visual review rejected it as slab/wall presentation with hard cloud/terrain cut lines, so it is not active branch strategy. The active first slice is source-backed visual terrain extent, proved in strict WebGPU at `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`; that run also fixes the Team Deathmatch probe alias and confirms actual `tdm` config (`playable=400`, `visualMargin=1200`). After visual review flagged the bright-lime `tall-grass.webp` source tile, candidate palette artifacts were written to `artifacts/perf/2026-05-11T20-30-tall-grass-palette/`, the live tile was corrected, and force-built strict WebGPU proof passed at `artifacts/perf/2026-05-11T20-58-48-929Z/konveyer-scene-parity/scene-parity.json`. The current full-mode strict WebGPU proof after the cloud-deck anchoring and A Shau collar rejection is `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`. Open Frontier, Zone Control, actual Team Deathmatch, and combat120 no longer read as a cheap wall/slab from finite-edge screenshots. A Shau remains blocked because its DEM has no real outer source data and still reads as a flat edge. A later A Shau-only 1600m collar experiment with DEM edge-slope extrapolation and visual-edge tint proved strict WebGPU at `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`, but visual review rejected the tan/gold synthetic band; keep that as evidence against further probe tuning, not as active acceptance.

## Success criteria

- Pick one finite-edge model for small maps and A Shau: source-backed visual terrain extent, low-detail far ring, horizon skirt, terrain fade, flight/weapon boundary, or an explicit hybrid.
- Prove the model in strict WebGPU from ground, elevated, skyward, and finite-edge poses without hiding the edge behind fog alone.
- Preserve gameplay boundaries separately from visual terrain coverage.
- Record triangle/pass impact before changing terrain LOD ranges or shadow policy.
