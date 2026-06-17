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

## Paired Capture Read And Close-Model Material Slice

Fresh current-branch EARS diagnostics after the sim-lane hysteresis patch:

- Open Frontier: `artifacts/perf/2026-06-17T14-58-14-572Z`
- A Shau: `artifacts/perf/2026-06-17T15-02-20-192Z`

Both artifacts remained diagnostic only: they failed measurement trust,
quiet-machine attestation, and harness view-slew trust. They did pass active
combat and materialization pressure, so they are useful for owner attribution.

The read is not "combat LOD lane churn is the sampled owner." Open Frontier
recorded only `2` sim-lane transitions and A Shau recorded `1`; max transition
rendered lag stayed near zero. The stronger owner-aligned signal is close enemy
mesh materialization / render fanout:

- Open Frontier peak `npc_close_glb` draw submissions reached `98`, matching
  `14` close NPCs at roughly `7` submissions/materials each.
- A Shau peak `npc_close_glb` draw submissions reached `56`, with concurrent
  fixed-wing, wildlife, terrain, and weapon submissions.
- Close-model pool loads were `0` in both captures, so this was not an asset
  download or lazy pool load spike.

`CombatantRenderer` now shares tuned steady-state close-model materials across
same-faction close NPCs and forks materials only for per-NPC death fade. That
preserves close-model count, distance, animations, and fade behavior while
reducing material state churn during imposter-to-mesh transitions and avoiding
long-run accumulation of per-instance tuned materials. Focused renderer tests
cover shared steady materials and fade isolation.

Post-change diagnostics:

- Open Frontier: `artifacts/perf/2026-06-17T15-26-27-586Z`
- A Shau: `artifacts/perf/2026-06-17T15-31-40-485Z`

These are still diagnostic, not completion evidence: both failed measurement
trust and dropped-frame gates. Open Frontier did improve on the headline
browser dropped-frame-time metric compared with the prior Open diagnostic
(`34.61ms/s` -> `25.16ms/s`), and peak `npc_close_glb` submissions dropped to
`56` instead of the earlier `98` peak. A Shau remained much heavier
(`74.05ms/s`) with light rain, terrain, close NPCs, weapons, wildlife,
vehicles, and residual presentation gaps all contributing. Sim-lane
transitions remained near-zero in Open Frontier (`1`) and zero in A Shau, so
the next work should not chase combat-lane chatter unless new evidence changes
that read.

`npm run check:dropped-frame-ears -- --dir artifacts/perf/2026-06-17T15-26-27-586Z --dir artifacts/perf/2026-06-17T15-31-40-485Z --strict`
correctly fails this pair as diagnostic: neither artifact has quiet-machine
attestation, both failed measurement trust, and harness view-slew equivalence
is still missing. Do not promote either capture to completion evidence.

The same pass also stops optimized NPC-carried weapons from casting or
receiving shadows. The weapons remain visible and socketed, but A Shau's worst
tail had `16` weapon submissions split across main and shadow passes; removing
the shadow pass is a same-experience micro-optimization aimed directly at
close-model transition tails.
