# KONVEYER Full Autonomous WebGPU Migration

Last verified: 2026-05-12 (KONVEYER-11 added; scene-parity cycle closed atmosphere CPU collapse)

## Goal

Continue the full KONVEYER WebGPU migration campaign on the experimental
branch. KONVEYER-0 through KONVEYER-9 now have branch-review evidence: strict
WebGPU starts, default startup requests WebGPU, active production render
blockers are migrated or retired, and the latest terrain ground-tone packet
passes. The next cycle is KONVEYER-10: rest-of-scene visual parity and
frame-budget attribution. WebGL is diagnostic only and must not be treated as a
migration fallback, acceptance path, or demo proof.

Pasteable directive:

> Continue `exp/konveyer-webgpu-migration` from the completed KONVEYER-0
> through KONVEYER-9 branch-review packet into KONVEYER-10. Preserve strict
> WebGPU proof with no WebGL fallback in the acceptance path. Focus the next
> cycle on rest-of-scene visual parity and frame-budget attribution: vegetation
> and NPC washout, atmosphere/sky/cloud behavior, world-budget decomposition,
> skyward triangle attribution, and finite-map terrain-edge presentation. Keep
> terrain color treated as accepted for now unless new evidence reopens it;
> source assets that visibly fight the Vietnam palette remain fair game.
> Commit and push coherent milestones for human review, and stop only for
> fenced-interface changes, perf-baseline updates, master merges, production
> deploys, or a renderer/visual regression that would make the game unfit for
> playtest.

## Branch

- `exp/konveyer-webgpu-migration`

If the branch exists, continue it. If it does not exist, create it from the
current `origin/master`.

## Required Reading

1. `AGENTS.md`
2. `docs/ENGINEERING_CULTURE.md`
3. `docs/INTERFACE_FENCE.md`
4. `docs/TESTING.md`
5. `docs/state/CURRENT.md`
6. `docs/state/perf-trust.md`
7. `docs/rearch/KONVEYER_AUTONOMOUS_RUN_2026-05-10.md`
8. `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
9. `docs/rearch/KONVEYER_TERRAIN_LIGHTING_ANALYSIS_2026-05-11.md`
10. `scripts/webgpu-strategy-audit.ts`
11. `scripts/check-platform-capabilities.ts`

## Campaign Slices

### KONVEYER-0 - Recon And Bootstrap

- Refresh upstream WebGPU/TSL facts.
- Run `npm run check:webgpu-strategy`.
- Write `docs/rearch/KONVEYER_PARITY_2026-05-10.md`.
- Map all renderer/material/post/terrain/water/combatant/vegetation blockers.
- Confirm the order of KONVEYER-1 through KONVEYER-9 in repo-specific terms.

### KONVEYER-1 - Dual Renderer Boot Path

- Add a strict WebGPU renderer path behind an explicit experimental flag.
- Do not preserve WebGL as the experiment proof path.
- Record backend capability data.
- Add startup smoke evidence for strict WebGPU where available.

### KONVEYER-2 - TSL Material Foundation

- Add reusable TSL/node material helpers.
- Port one low-risk material fixture.
- Keep old material path only as named diagnostic evidence outside the proof
  path.

### KONVEYER-3 - Vegetation GPU-Driven Slice

- Implement a contained vegetation visibility/culling or draw-submission path.
- Prove it under strict WebGPU.
- Capture local evidence.

### KONVEYER-4 - Combatant Render Slice

- Port an isolated combatant render bucket or impostor material path.
- Do not change combat simulation authority.
- Validate at low count under strict WebGPU before scaling.

### KONVEYER-5 - Particles, Projectiles, And Effects Compute

- Prototype one compute-backed effect or projectile broadphase path.
- Keep CPU determinism authority until proven; do not use WebGL as a renderer
  fallback for the proof path.
- Document determinism boundaries.

### KONVEYER-6 - Cover And AI Sensor Compute Carrier

- Prototype or prepare GPU-ready cover/sensor query data.
- Keep tactical decision ownership on CPU.
- Tie the result back to DEFEKT-3 and `CoverQueryService`.

### KONVEYER-7 - Terrain, Water, And Post Parity

- Decide terrain material, water material, and post-processing parity path.
- Port only the smallest safe tail item needed to prove the route.

### KONVEYER-8 - Strict WebGPU Validation Policy

- Build a strict WebGPU support matrix.
- Document any diagnostic WebGL comparisons as non-proof.
- Fail any migration packet that succeeds only through WebGL.

### KONVEYER-9 - Default-On Readiness Packet

- Produce the final branch review packet.
- Include proposed default-on patch only if isolated and reversible.
- Include rollback plan, remaining blockers, and human-review decisions.

### KONVEYER-10 - Scene Parity And Frame-Budget Attribution

- Split the overloaded `World` timing bucket into actionable sub-timings:
  atmosphere sky texture, atmosphere light/fog, weather, water, and zone/ticket
  work.
- Add strict-WebGPU visual/debug evidence for vegetation and NPC impostors:
  raw atlas/crop, material lighting, fog contribution, and final output.
- Treat terrain color as generally accepted for now, but fix source texture
  outliers when screenshot review shows they fight the Vietnam jungle palette.
- Fix or document the `todCycle.startHour` drift so scenario sun phase matches
  preset intent.
- Capture skyward renderer counters with scene/pass attribution before changing
  CDLOD, shadows, or vegetation budgets.
- Decide and prototype the sky/cloud anchoring route so flying no longer makes
  clouds or the dome feel attached to the player. First slice is in place:
  camera-followed dome plus world/altitude-projected cloud-deck sampling,
  proved at
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.
  Do not call this final cloud art direction; blocky puffs, cloud shadows,
  weather layering, and possible authored/Pixel Forge cloud assets remain open.
- Propose a finite-map edge strategy for Zone Control and other small maps:
  terrain apron, low-res far ring, edge fade, flight clamp, or another measured
  implementation.
- Validate with strict WebGPU Open Frontier, Zone Control, Team Deathmatch,
  combat120, and A Shau short captures before any new default-on claim.
- Latest branch work is on `origin/exp/konveyer-webgpu-migration`; use the
  remote branch head rather than a frozen SHA in this brief and do not restart
  from the K0-K9 packet.
  Close-NPC materialization and startup compile proof is
  `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
  It proves public materialization telemetry, geometry-derived close-GLB body
  bounds, a visible strict-WebGPU close soldier/weapon crop, and a bounded
  Open Frontier spawn-residency reserve with 11 close GLBs and zero fallback
  records for the nearest actors. Multi-mode reserve verification now exists
  at
  `artifacts/perf/2026-05-12T01-50-01-495Z/konveyer-asset-crop-probe/asset-crop-probe.json`:
  Open Frontier 10/10 close-GLB residents, Zone Control 11/13 with two
  total-cap fallbacks, Team Deathmatch 12/16 with four total-cap fallbacks,
  combat120 12/29 with three pool-empty and fourteen total-cap fallbacks at
  ~23 m, and A Shau Valley with no combatants inside the close radius from
  the current spawn pose. Phase F materialization tier draft is
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`. The stamped
  heightmap rebake remains open work.
- Water/hydrology bridge proof is now part of the follow-up loop: source audit
  `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`
  and runtime proof
  `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
  prove hydrology meshes, queries, and `sampleWaterInteraction` in Open
  Frontier and A Shau. This does not accept final water shader/art, terrain
  intersections, flow, swimming/buoyancy physics, or watercraft.

### KONVEYER-11 - Materialization Rearchitecture (Phase F Continuation)

KONVEYER-10 scene parity closed the rest-of-scene visual gap and an
unexpected CPU bottleneck. Slices 9 through 15 shipped on
`exp/konveyer-webgpu-migration`: perf-window gate, system-timings
attribution, atmosphere sub-attribution, terrain roughness floor (A Shau
glass-reflection fix), LUT-driven sky refresh, DataTexture + 2 s timer,
refresh-counter diagnostic, and idempotent `setCloudCoverage`. The
atmosphere CPU collapse is the headline win: total Atmosphere dropped
from ~5-6 ms in every mode to <1 ms (A Shau worst case 5.99 ms → 0.52 ms).
The refresh-counter diagnostic also resolved the "phantom EMA" puzzle —
the crop probe runs `vite preview --outDir dist-perf` against a pre-built
bundle and DOES NOT auto-rebuild on source changes; `npm run build:perf`
is now a required step before every probe run.

Atmosphere is no longer the bottleneck. Combat is now the
relatively-largest CPU contributor at 1.5-6.5 ms across modes with no
sub-attribution yet — `CombatantSystem.update` has internal
`profiler.profiling.*` tracking but no `performanceTelemetry.beginSystem`
children.

KONVEYER-11 owns the Phase F materialization rearch slices named in
`docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md` and
`docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md`:

- Combat sub-attribution (Influence / AI / Billboards / Effects).
- Lane-rename refactor: `Combatant.lodLevel` → `simLane` + introduce
  `renderLane`. Pure refactor, wide blast radius, surface for arbiter v2.
- Sky-refresh residual investigation (~5-10 fires/sec post slice 15).
- Cover-candidate spatial grid (primitive-spike 2.b) — closes DEFEKT-3
  surface, reuses existing `SpatialGrid` telemetry, ~1-2 ms saving.
- Render-silhouette lane — single billboard between impostor and culled.
- Squad-aggregated strategic sim (Phase F memo slice 3) — O(squads)
  CULLED tier; the 3,000-combatant scaling primitive.
- Budget arbiter v2 — single function assigning `simLane` + `renderLane`
  per combatant with explicit budget accounting.
- Render-cluster lane — one billboard per squad with count badge.
- Strict-WebGPU multi-mode proof v2 (A Shau p99 ≤33 ms gate held).
- Review-packet update.

Cycle brief:
[docs/tasks/cycle-2026-05-13-konveyer-materialization-rearch.md](cycle-2026-05-13-konveyer-materialization-rearch.md).
Pickup point: `origin/exp/konveyer-webgpu-migration` HEAD (`1b31379c`
at the time of writing; use the branch head, not a frozen SHA).

KONVEYER-11 deliberately does NOT touch the following blocked tracks
(owner decisions or art/pipeline pending):

- A Shau finite-edge (KONVEYER-12 — DEM/boundary owner decision).
- Cloud representation (volumetric / Pixel Forge cloud asset pass).
- Vegetation + NPC asset acceptance (Pixel Forge regen / impostor
  rebake).
- Water shader / art / physics (VODA-1/2/3).
- Terrain / fire authority shared pass (DEFEKT-6).
- Startup stamped-heightmap rebake worker (~48 ms one-time).
- TSL fragment-shader sky port — Atmosphere is <1 ms; saving ~0.4 ms,
  parked unless a regression resurfaces it.

## Autonomy Rules

- Continue to the next viable KONVEYER slice when blocked.
- Memo blocked slices with exact file/API reasons.
- Add adapters instead of changing fenced interfaces.
- Keep strict WebGPU proof alive and visible.
- Use explicit experimental flags or dev query params.
- Commit and push branch progress frequently.
- Do not wait for owner input unless a hard stop is hit.

## Hard Stops

Stop implementation and write a handoff note if any of these are required:

- edit `src/types/SystemInterfaces.ts`
- update `perf-baselines.json`
- merge to `master`
- deploy experimental renderer code
- require WebGL fallback for migration proof
- conceal a known renderer regression

## Validation

Run before final branch handoff:

```
npm run lint
npm run test:run
npm run build
npm run check:webgpu-strategy
npm run audit:konveyer-completion
```

Also run targeted tests/probes for each implemented KONVEYER slice.

## Human Review Packet

The final branch must include:

- `docs/rearch/KONVEYER_PARITY_2026-05-10.md`
- implementation notes for KONVEYER slices attempted
- KONVEYER-10 rest-of-scene parity notes, including unresolved visual issues
- evidence artifact paths
- validation results
- final recommendation for default-on readiness or remaining blockers
