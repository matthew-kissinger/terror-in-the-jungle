# Playtest: cycle-of-river-surface-enable

Last verified: 2026-05-20

Cycle: `cycle-of-river-surface-enable` (campaign position #2 of 3,
2026-05-20 vehicle-boarding-and-water parallel campaign)
Task slug: `of-water-playtest-evidence` (R2, merge gate)
Branch: `task/of-water-playtest-evidence`
Capture script:
[`scripts/capture-of-river-surface-shots.ts`](../../scripts/capture-of-river-surface-shots.ts)

Opens and closes carry-over `VODA-OF-1` once the owner walks the
deferred punch list below. Net delta on the active carry-over count: 0.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md)
declared `posture: autonomous-loop`, the cycle's playtest-required gate
is **deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)
per the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the campaign closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The smoke covers the cycle's three target shots:

1. **Open Frontier Sampan spawn close-up** at world coord `(-200, 0, 100)`.
   The boat should sit on the rendered hydrology river surface (not dry
   dirt). The pre baseline shows the boat on visible terrain because
   `OpenFrontierConfig` previously had `waterEnabled` defaulted off
   (the WaterSystem never dispatched the hydrology mesh on OF before
   the config flip).
2. **Open Frontier PBR spawn close-up** at world coord `(-880, 0, -760)`.
   Same expectation as the Sampan shot — the PBR should sit on the
   river surface post-flip.
3. **Open Frontier river segment wide shot** between the two boats.
   The post-flip frame should show the river ribbon flowing in the
   channel; the global sea-level plane (`globalWaterPlaneEnabled: true`,
   inherited default) should continue to render on the distant shore
   terrain; no z-fighting visible at the river-mouth seams where the
   two surfaces meet.

## R1 production landings (cycle-close evidence)

| Slug | Branch | Commit | Author note |
|---|---|---|---|
| `of-water-config-flip` | `task/of-water-config-flip` | `3312d0f6` (PR #286) | Adds explicit `waterEnabled: true` to `OpenFrontierConfig.ts` with a comment explaining that OF benefits from BOTH the global sea-level plane AND the hydrology river ribbon (terrain centers near y=0). `terrain-nav-reviewer` APPROVE-WITH-NOTES (3 retro nits captured for the cycle-retro bucket; none merge-blocking). |
| `of-water-spawn-snap-resolver` | `task/of-water-spawn-snap-resolver` | `0b28d689` (PR #291) | Extends `OperationalRuntimeComposer` Sampan + PBR snap paths to consult `WaterSurfaceSampler.sample(x, z)` when the active scenario has `waterEnabled: true`. Both watercraft now snap to `waterY + freeboard` on OF (was: terrain Y). A Shau snap path stays byte-identical (regression-locked by the existing A Shau composer test). |
| `of-water-capture-pair` | `task/of-water-capture-pair` | `83adea6a` (PR #292, OPEN) | New `scripts/capture-of-river-surface-shots.ts`. Captures three Playwright pre/post shots and probes `WaterSystem.sampleWaterInteraction(spawn)` at each pose, writing the result to `summary-of-water-<pair-tag>.json` as `riverSurface.visible: boolean`. See the "Capture-state caveat" section below — the post captures landed BEFORE the two sibling R1 PRs merged to master, so the committed post `summary-of-water-post.json` records `visible: false` across all three records. Regeneration on master tip after #286 + #291 land is a cycle-retro action (see "Cycle retro items" below). |

## Playwright smoke evidence

Saved under
`artifacts/cycle-of-river-surface-enable/playtest-evidence/` by
`scripts/capture-of-river-surface-shots.ts`. The `artifacts/`
directory is gitignored at the repository root; the capture PNGs are
force-added (`git add -f`) on PR #292's commit so the owner sweep can
browse them on master without rerunning the script.

Re-running the capture script (`pre` pair from a baseline checkout at
`master@d9b612f4`, `post` pair from the post-merge tip):

```
# Pre baseline (already committed by PR #292 from master tip d9b612f4).
git worktree add ../of-water-pre d9b612f4
cd ../of-water-pre
npm ci
npm run build:perf
npx tsx scripts/capture-of-river-surface-shots.ts --pair-tag=pre

# Post capture on the post-merge tip (regen required - see caveat).
cd ../terror-in-the-jungle
npm run build:perf
npx tsx scripts/capture-of-river-surface-shots.ts --pair-tag=post
```

CLI flags:

- `--pair-tag=<pre|post>` — sets the filename suffix per shot
  (defaults to `post`).
- `--scenario=openfrontier` — scenario id passed to the runtime probe
  (defaults to `openfrontier`).
- `--skip-sampan` / `--skip-pbr` / `--skip-river` — skip individual
  shots for partial reruns.

The script writes `summary-of-water-<pair-tag>.json` alongside the
PNGs with per-capture metadata: shot name, pose
(position + yaw + pitch), output filename, PNG byte count, and a
`riverSurface` block recording the runtime probe at the spawn coord
(`query`, `surfaceY`, `visible`, `source`).

### Capture matrix

| Shot | Pose | Pre evidence | Post evidence |
|---|---|---|---|
| `of-sampan-spawn` | `(-215, 6, 100)`, yaw 90°, pitch -12° | `of-sampan-spawn-pre.png` | `of-sampan-spawn-post.png` |
| `of-pbr-spawn` | `(-900, 8, -760)`, yaw 90°, pitch -12° | `of-pbr-spawn-pre.png` | `of-pbr-spawn-post.png` |
| `of-river-segment` | `(-540, 120, -100)`, yaw 200°, pitch -30° | `of-river-segment-pre.png` | `of-river-segment-post.png` |

Total: 6 captures (3 pairs) + 3 summary JSON files
(`summary-of-water-pre.json`, `summary-of-water-post.json`,
`summary-of-water.json` — the bare summary mirrors the latest run for
back-compat with the orchestrator's per-cycle summary collector).

### Capture-state caveat (READ THIS BEFORE THE OWNER SWEEP)

PR #292's post captures were generated **before** the two sibling R1
PRs (`#286 of-water-config-flip`, `#291 of-water-spawn-snap-resolver`)
merged to master. The capture-pair branch built its post pair against
a scratch local merge of the two sibling branches, but the committed
post `summary-of-water-post.json` records `riverSurface.visible: false`
on all three records (sampan, PBR, river segment). Possible causes
(in priority order for the cycle retro to investigate):

1. The scratch local merge was not in fact picked up by the perf build
   (`npm run build:perf` may have been run before the merge stitched
   the two branches in).
2. The WaterSystem render dispatch path is gated on something beyond
   `waterEnabled: true` that the cycle missed (the cycle brief's
   hard-stop list calls this case out explicitly).
3. The `WaterSurfaceSampler.sample(x, z)` runtime probe used by the
   capture script reads from a separate code path than the visible
   render mesh, and the probe returns `null` on OF even after the flip.

The cycle-retro action is to **regenerate the post captures on a fresh
worktree off master tip after #286 + #291 have both landed** (both
are already on master as of `0b28d689`; #292's capture refresh remains
the open work). The owner sweep should treat the committed post PNGs
as provisional until the regen lands; the pre captures are
authoritative.

If the regenerated post captures STILL show `riverSurface.visible: false`,
the cycle hits its second hard-stop ("config flip lands but river
surface does NOT render in the post capture → halt; root-cause in
WaterSystem dispatch") and a follow-up cycle is opened against the
WaterSystem dispatch path.

Headless Chromium in this checkout does not grant a WebGPU adapter
by default; the default `webgpu` mode resolves to
`webgpu-webgl-fallback` (the WebGL2-backend-of-`WebGPURenderer` path
mobile lands on). All three captures exercise the same resolved
backend pre vs post, so the visual difference is wholly attributable
to the R1 production landings, not renderer drift.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign closes,
per [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror
the cycle brief's `of-water-playtest-evidence` Method section.

1. **Sampan on water (Open Frontier).**
   - Pull master, `npm run dev`, load Open Frontier.
   - Navigate to the Sampan spawn at world coord `(-200, 0, 100)`
     (use WorldBuilder free-fly via `Shift+G` or the dev-console
     `__engine.player.teleport(-200, 5, 100)` surface).
   - Confirm the boat sits on a **visible water surface** — the
     rendered hydrology river ribbon, not dry dirt or the bare
     terrain mesh.
   - Compare against `of-sampan-spawn-pre.png` and
     `of-sampan-spawn-post.png`.

2. **PBR on water (Open Frontier).**
   - From the same dev preview, navigate to the PBR spawn at world
     coord `(-880, 0, -760)`.
   - Confirm the PBR sits on the same hydrology river surface.
   - Compare against `of-pbr-spawn-pre.png` and `of-pbr-spawn-post.png`.

3. **River segment between the two boats.**
   - Walk or free-fly the river segment that runs between the Sampan
     spawn at `(-200, 0, 100)` and the PBR spawn at `(-880, 0, -760)`.
   - Confirm:
     - The river ribbon is **visible and flows** (UV-scrolled flow
       shader from cycle-voda-1 reads correctly on the OF channel).
     - There is **no z-fighting at the shorelines** where the
       hydrology river surface meets the terrain.
     - The **global sea-level plane still renders** on distant shore
       terrain (Open Frontier inherits `globalWaterPlaneEnabled: true`
       — the cycle brief's intent is for both surfaces to coexist on
       OF because the terrain centers near y=0).
   - Compare against `of-river-segment-pre.png` and
     `of-river-segment-post.png`.

4. **A Shau regression check (smoke).**
   - Load A Shau Valley. Navigate to the A Shau Sampan spawn at
     `(-6895, 0, 4835)` and confirm the river surface still renders
     identically to cycle-2026-05-19 baseline (the A Shau path was
     out of scope for this cycle; any visual diff is a hard stop).

5. **(Optional) Boarding smoke once cycle #1 ships.**
   - If `cycle-vekhikl-player-boarding-wire` of the same campaign has
     also landed by the sweep time, attempt to board the Sampan + PBR
     with F-key. A successful board confirms the snap resolver's
     `waterY + freeboard` Y-offset reads sane against the
     `WatercraftPlayerAdapter` mount transform.

## Cycle retro items

These are NOT new carry-overs (respecting the ≤ 12 active limit per
Phase 0); they are bundled into the next cycle that touches the
relevant area or executed as a zero-cycle follow-up:

1. **Post-capture regeneration on a fresh worktree off master tip.**
   PR #292's post captures were generated before #286 + #291 reached
   master; the committed `summary-of-water-post.json` records
   `riverSurface.visible: false`. The cycle close memo for
   `cycle-of-river-surface-enable` MUST include a regen step:
   `git worktree add ../of-water-post master && cd ../of-water-post &&
   npm ci && npm run build:perf &&
   npx tsx scripts/capture-of-river-surface-shots.ts --pair-tag=post`,
   then commit the refreshed PNGs + summary JSON to master in a
   single chore commit. The cycle does NOT close until the regenerated
   post captures show `riverSurface.visible: true` on at least the
   two boat-spawn records (river-segment wide shot is informational —
   the runtime probe queries the channel midpoint which may or may not
   sample a wet cell depending on bake layout).
2. **`terrain-nav-reviewer` retro nits on PR #286** (3 items) —
   informational, do NOT fix here. Pull into the next cycle that
   touches `src/config/OpenFrontierConfig.ts` or the
   WaterSystem render-dispatch path.

## Owner sign-off

_(Empty as of 2026-05-20 — PENDING owner walk-through AND PENDING the
post-capture regen described in the cycle retro item above. Append
below on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **Sampan sits on water** at OF spawn `(-200, 0, 100)`; hydrology
      river surface visible under the boat.
- [ ] **PBR sits on water** at OF spawn `(-880, 0, -760)`; hydrology
      river surface visible under the boat.
- [ ] **River ribbon flows** between the two boats; UV-scrolled flow
      shader reads correctly.
- [ ] **No z-fighting at the shorelines** where the river meets the
      terrain.
- [ ] **Global sea-level plane still renders** on distant shore
      terrain (`globalWaterPlaneEnabled: true` inherited).
- [ ] **A Shau river surface unchanged** vs the 2026-05-19 baseline
      (regression smoke).
- [ ] **Post captures regenerated** on a fresh worktree off master tip
      and `riverSurface.visible: true` on both boat-spawn summary
      records.
- [ ] **No new carry-overs** opened against this cycle (any visual
      issues become a follow-up `cycle-of-river-surface-fix` cycle,
      not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close `VODA-OF-1` in
  `docs/CARRY_OVERS.md` with this cycle's close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle brief
  at `docs/tasks/cycle-of-river-surface-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are not
  reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: not run (docs-only change; no test changes).
- `npm run build`: not run (docs-only change).
- Doc + PLAYTEST_PENDING row committed.
- 6 captures + 3 summary JSON files already committed by PR #292 under
  `artifacts/cycle-of-river-surface-enable/playtest-evidence/`.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence channel
for `VODA-OF-1` and the cycle-close acceptance. This task lands the
evidence-capture surface so the owner sweep has something concrete to
walk against; the post-capture regen described in the cycle retro
items section is the load-bearing close gate.
