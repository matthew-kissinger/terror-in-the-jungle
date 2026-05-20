# DEFEKT-6 — Terrain occlusion and fire authority

Status: open
Owning subsystem: combat / terrain / navigation / materialization
Opened: cycle-2026-05-11

## Latest evidence

Player report during KONVEYER follow-up that enemies can still be shot through terrain; K11 brief records this as an architecture risk in `docs/tasks/cycle-2026-05-11-konveyer-k11-proof-terrain-budget.md`. The 2026-05-11 follow-up note says this may indicate larger wiring, dependency, authority, and optimization issues rather than one bad weapon branch. First code slice found and patched a player-fire gap where close-range shots under 200m bypassed the CPU height-profile fallback when the terrain BVH missed. Targeted unit proof lives at `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`; strict WebGPU browser proof lives at `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json` and records a real 181.7m Open Frontier line where BVH returned no hit but effective-height profile blocked before damage. Do not close this directive from that first slice.

## Success criteria

- Reproduce or disprove fire-through-terrain with browser evidence that records shooter, target, terrain height/effective height, weapon ray, LOS result, and hit outcome.
- Identify the authoritative terrain occlusion query for player fire, NPC fire, AI LOS, cover, and active-driver shot validation.
- Verify combat raycasts are not bypassing render terrain, effective collision terrain, hydrology/cover blockers, navmesh placement, or materialization state through stale caches or partial shortcuts.
- Record perf impact and cache ownership before changing LOS cadence, ray count, or terrain-query implementation.
