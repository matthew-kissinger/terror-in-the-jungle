# cycle-2026-06-14-procedural-vegetation-controlled-burn

Status: rejected path; controlled burn applied before production promotion.

## Decision

The generated procedural vegetation candidate path is a no-go. The previewed
tree and understory geometry was not visually acceptable for Terror in the
Jungle and should not ship, hide behind a dormant runtime flag, or remain as a
prod-facing source path.

## Removed Scope

- No `ProceduralVegetationPipeline` source scaffold.
- No procedural vegetation preview factory.
- No `?mode=procedural-vegetation-gallery` bootstrap route.
- No procedural vegetation screenshot/check scripts in `package.json`.
- No generated banyan/rubber/teak/areca/mangrove/elephant-grass/deadfall/vine
  candidates wired into runtime or prod-adjacent source.

## Remaining Direction

Fable can still inform architecture at the strategy level: source assets first,
then near geometry, mid aggregate/culling, and far impostor or canopy shells
only after source assets are accepted. That does not mean TIJ should generate
tree art in code from the rejected scaffold.

The next vegetation pass should use accepted authored/imported source assets or
a materially stronger art-generation pipeline, then prove:

- gallery readability,
- A Shau/Open Frontier grounding,
- horizon coverage,
- culling/LOD behavior,
- perf captures,
- owner visual acceptance.

Until that happens, the only vegetation allowed in production remains the
already accepted runtime vegetation from the world-systems release.
