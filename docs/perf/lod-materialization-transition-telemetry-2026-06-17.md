# LOD Materialization Transition Telemetry - 2026-06-17

This note preserves the detailed diagnostic evidence behind the 2026-06-17
NPC LOD / materialization stabilization slice. The active goal state remains in
`docs/tasks/cycle-2026-06-14-dropped-frame-time-perf-research.md`.

## Owner Symptom

The owner still sees stutter, slow frames, and visible frame drops when enemies
cross LOD or materialization tiers. The likely crossing points are imposter to
mesh, combat sim-lane promotion or demotion, and rendered catch-up after lower
fidelity movement.

## Close-Model Hysteresis Evidence

The newest Open Frontier EARS diagnostic artifact
`artifacts/perf/2026-06-17T14-15-19-033Z` was captured with local source edits
and failed validation plus measurement trust, so it is not completion evidence.
It does still show the shape after the close-model replacement hysteresis
patch:

- Peak close-model replacements stayed `0`.
- Total drained render-lane transition-window events fell from the prior reset
  artifact's `209` to `163`.
- `impostor->close-glb` fell `72 -> 41`.
- `close-glb->impostor` fell `52 -> 24`.

This supports keeping the hysteresis patch, but it does not prove the goal.
The same diagnostic run got worse overall: `29.52ms/s` dropped-frame time and
`2.04` estimated dropped 60Hz frames/s.

## Tail Attribution

Tail attribution moved away from a pure close-NPC story. The worst selected
loop was render-bound:

- `RenderMain.renderer.render` was about `195.6ms` of a `~202ms` callback.
- Adjacent render submissions were dominated by world-static features
  (`75` submissions), ground vehicles (`60`), fixed-wing aircraft (`56`), and
  terrain (`409k` triangles).
- Presentation-gap terrain context remained significant: `same-identity`
  terrain sync covered `157/239` gaps and about `3327ms` of dropped-frame time,
  while tile-set churn was smaller (`24/239`).

The current suspect set is close-model transition stability, sim-lane promotion
bursts / rendered catch-up, terrain same-identity presentation sync, and static
base / parked vehicle / parked aircraft draw-material fanout.

## Harness Change

`CombatantLODManager` now emits per-frame `simLaneTransitions` inside
`aiScheduling`, including `from->to` buckets, promotions vs demotions, and max
logical-vs-rendered lag / transition lag.

`perf-capture` serializes those fields into every runtime sample, prints a
compact `simLane=... up=... down=... lag=...` suffix in capture logs, and
aggregates them under `summary.json.simLaneTransitionMetrics`.

This is read-only telemetry. It does not change LOD ranges, update cadence, NPC
counts, visual materialization, or gameplay behavior.

## Smoke Evidence

Short harness-smoke artifact `artifacts/perf/2026-06-17T14-30-31-527Z`
verifies the new telemetry is emitted in a built perf bundle:

- `summary.json.simLaneTransitionMetrics` recorded one `culled->low`
  transition.
- Max rendered lag was `94.25m`.
- Capture logs printed `simLane=...` rows.

This 45s smoke failed validation and had `0` shots, so it is schema/runtime
proof only, not performance or combat evidence.

## Verification

Focused verification for this slice passed:

- `npx vitest run src/systems/combat/CombatantLODManager.test.ts src/systems/combat/CombatantRenderer.test.ts scripts/perf-presentation-gap-summary.test.ts scripts/check-dropped-frame-ears.test.ts`
- Targeted ESLint over the changed source/scripts.
- `npm run typecheck`.
- `npm run lint:budget` after moving telemetry types out of the oversized
  LOD manager.

## Next Capture Read

The next runtime capture should use this harness head so LOD-crossing claims
can be correlated with frame drops before applying sim-lane hysteresis or
min-residency.

The next same-experience render optimization target is static base / airfield
draw consolidation, parked ground-vehicle draw consolidation, and fixed-wing
GLB material/draw consolidation. Terrain should stay in the second-pass queue
unless the next capture shows terrain sync dominating independently of those
draw-submission spikes.

## Follow-On Hysteresis Slice

After the owner reported continued stutter when enemy LOD tiers changed,
`CombatantSimLaneClassifier` added small sticky distance hysteresis around the
combat sim-lane thresholds. The center ranges stay unchanged; the classifier
only prevents actors hovering near a boundary from repeatedly flipping
high/medium, medium/low, or low/culled lanes.

This is a same-experience candidate, not completion proof. It should reduce
transition chatter and make the new `simLaneTransitions` summary more useful,
but it still needs a trusted Open Frontier and A Shau capture to prove reduced
dropped-frame time under combat.
