<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 5) -->
# deploy-map-3d-spike

From the 2026-06-28 owner ask: a "fast 3D map" for deploy/situational awareness.
This is a DESIGN/FEASIBILITY doc only — no build this campaign (the committed code
this phase is the 2D `deploy-map-navigation` overhaul). Produce a spike memo the
owner + a future cycle can act on.

## Files touched

- `docs/rearch/DEPLOY_MAP_3D_SPIKE_2026-06-28.md` (new)

## Scope

1. Lay out 2-3 candidate approaches for a fast 3D deploy map (e.g. reuse the
   terrain CDLOD render at a fixed orbit camera; a baked low-poly terrain proxy +
   markers; a heightfield-textured plane), with the tradeoffs of each.
2. Define a perf budget + reuse strategy: what existing terrain/minimap render
   paths can be reused, the cost ceiling (it must be "fast" — bounded load + frame
   cost), and how it coexists with the deploy screen (the game world may not be
   live during deploy).
3. Recommend one approach + a phased build plan (MVP → full), and call out the
   open risks (load time on A Shau's 21km DEM, memory, WebGPU/WebGL parity).

## Non-goals

- Any implementation/code — this is a design doc only.
- Replacing the 2D map (the 2D navigation overhaul ships separately this phase).

## Acceptance

- [ ] `docs/rearch/DEPLOY_MAP_3D_SPIKE_2026-06-28.md` exists with the candidate
      approaches, perf budget + reuse strategy, a recommendation, and a phased
      plan with risks.
- [ ] `npm run lint` green (doc-only; no `src/...` path reference that doesn't exist).
- [ ] PR linking this brief.

## Dependencies

- Root (no blockers). Doc-only. No reviewer.
