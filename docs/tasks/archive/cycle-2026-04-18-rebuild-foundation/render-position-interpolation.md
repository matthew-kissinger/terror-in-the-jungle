# Task A2: Render-side position interpolation for LOD'd combatants

**Phase:** A (foundation)
**Depends on:** nothing
**Blocks:** hypersprint visual fix; any future scale-up work on LOD'd crowds
**Playtest required:** yes (combatant movement feel)
**Estimated risk:** medium — touches hot-path LOD manager
**Files touched:** `src/systems/combat/CombatantLODManager.ts`, possibly a small
new `src/systems/combat/CombatantRenderInterpolator.ts`, combat integration tests.

## Goal

Split **logical position** from **rendered position** for low-LOD combatants so
that dt amortization no longer causes visible teleports ("NPC hypersprint"). The
logical sim ticks at full dt; the renderer interpolates the visible transform
toward the latest logical position.

## Background

From `docs/BACKLOG.md` Known Issue #1:

> `CombatantLODManager` per-update dt amortization (lines ~425, ~454-456, ~652):
> logical positions tick at full dt but rendered positions don't interpolate, so
> low-LOD crowds visually teleport.

A prior surgical patch attempted a dt clamp at the sim layer — it was closed
(PR #71, 2026-04-17) because it would have broken LOD amortization and the
speed-ceiling bypasses it targeted had already been fixed on master. The proper
fix is render-side interpolation: the sim keeps amortizing; the render reads
`renderedPosition = lerp(lastRendered, logical, alpha)` each frame.

## Required reading first

- `docs/TESTING.md` — behavior tests only.
- `docs/BACKLOG.md` — Known Issue #1 context.
- `src/systems/combat/CombatantLODManager.ts` — identify the logical-position
  update sites (around lines 425, 454-456, 652) and where rendered meshes are
  positioned each frame.
- `src/systems/combat/CombatantMeshFactory.ts` — how instance matrices get
  written. Your interpolated position must land here, not at the logical site.

## Steps

1. Add a `renderedPosition: Vector3` (and `renderedQuaternion: Quaternion` if
   rotation also teleports) per combatant, initialized to logical position on
   spawn.
2. On each sim tick, keep logical position updated as it is today.
3. On each frame (regardless of whether the combatant's sim ticked this frame),
   lerp `renderedPosition` toward `logicalPosition` by an alpha tuned so that a
   combatant's visible travel per frame stays under a sane threshold (e.g. 0.3
   m/frame at 60 Hz, i.e. max visible speed ~18 m/s). Use the existing
   `CombatantConfig` speed cap as the anchor if one already exists.
4. Write instance matrices from `renderedPosition`, not from `logicalPosition`.
5. Unit test: feed a combatant a series of teleport-sized logical jumps; assert
   that rendered position moves smoothly across frames and never jumps more than
   the per-frame threshold.
6. Integration test: spawn 120 combatants in a scripted scenario, drive them,
   assert rendered positions never exceed a peak speed that implies a teleport.
7. Perf check: `combat120` baseline must not regress p99 > 5%. The extra lerp
   is cheap (three muladds per combatant per frame) but measure.

## Exit criteria

- No visible hypersprint under `combat120` when eyeballed in dev build.
- Integration test demonstrates per-frame rendered movement is bounded.
- `combat120` p99 delta < +5% vs baseline.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Human playtest: a sample run under Open Frontier confirms the teleport is gone.

## Non-goals

- Do not change LOD amortization cadence — the sim still ticks far-LOD combatants
  less often. Only the rendered position is continuous.
- Do not rework `CombatantMeshFactory`'s `maxInstances = 120` cap — that's A3.
- Do not touch AI state transitions — pure render-layer work.

## Hard stops

- Fence change to `IGameRenderer` or combat interfaces: stop and surface.
- Perf regression > 5% p99: stop and surface; do not push.
