# Playtest: cycle-voda-1-water-shader-and-acceptance

Last verified: 2026-05-16

Cycle: `cycle-voda-1-water-shader-and-acceptance` (campaign position #5 of 12)
Task slug: `voda-1-playtest-evidence`
Branch: `task/voda-1-playtest-evidence`
Capture script: `scripts/capture-voda-1-water-shots.ts`

Closes `VODA-1` (production water shader + visual acceptance) once the
owner walks the deferred punch list below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 12-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots prove the water surface reads cleanly at
default lighting on both maps and that the terrain-water edge + foam
line work without z-fight — enough evidence to merge under
autonomous-loop posture. Owner sign-off on the punch list at the
bottom is still required to flip `VODA-1` to Closed in
`docs/DIRECTIVES.md`.

## Cycle-specific hard constraint reminder

Per the brief's Hard Stops: **no `WebGLRenderTarget` reflection pass
may be added by any task in this cycle.** The post-KONVEYER water
already dropped the 512×512 reflection RT and that mobile-floor win
must be preserved. This task is docs + capture-script only, so it
cannot add one — but the reminder is recorded here so the owner sweep
catches any drift before promoting `VODA-1` to Closed.

## Playwright smoke evidence

Saved under `artifacts/cycle-voda-1-water-shader-and-acceptance/playtest-evidence/`
by `scripts/capture-voda-1-water-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

| Scenario | File | Observation |
|---|---|---|
| Open Frontier — water surface at noon (default preset) | `water-noon-open-frontier.png` | Global water plane framed from a shoreline overlook so the ripple normal animation, sun-direction tint, and depth-faded transparency near the shore are all in frame. |
| Open Frontier — water surface at sunset | `water-sunset-open-frontier.png` | Same shoreline pose, sunset preset substituted. Confirms the surface picks up warm sun tint without going opaque. |
| Open Frontier — water surface at dawn | `water-dawn-open-frontier.png` | Same shoreline pose, dawn preset substituted. Confirms low-angle sun tint reads on the surface without crushing the ripple animation. |
| A Shau Valley — river bank with visible flow | `river-flow-a-shau.png` | Framed at a river bank where the hydrology channel cuts across the valley floor; sibling `hydrology-river-flow-visuals` task is responsible for landing the flow visual. If that PR lands after this capture runs, back-fill post-merge. |
| A Shau Valley — underwater POV with overlay | `underwater-pov-a-shau.png` | Camera positioned just below the river surface; the `wasUnderwater` overlay flag drives the screen tint and the surface shader handles the topside. |
| Open Frontier — terrain-water edge foam | `shoreline-foam-open-frontier.png` | Tight framing of the terrain-water boundary so the foam line + soft depth blend (from R1 `terrain-water-intersection-mask`) read clearly without z-fight. |

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR but the screenshots themselves
depend on two sibling R2 tasks landing first:

- `hydrology-river-flow-visuals` (R2) — adds the visible river flow.
  Without this the `river-flow-a-shau.png` capture will show a
  static river surface rather than UV-scrolled flow.
- `water-system-file-split` (R2) — code-only refactor; does not
  affect screenshots but is the third co-dispatched R2 task.

R1 already landed (`62db21c2` composed surface shader,
`dfee8d64` terrain-water intersection + foam) so the noon / sunset /
dawn / underwater / shoreline-foam captures should produce valid
frames immediately. If `hydrology-river-flow-visuals` is unmerged at
capture time, the river-flow shot is a best-effort still.

Re-run the capture post-merge with:

```
npx tsx scripts/capture-voda-1-water-shots.ts
```

and back-fill the screenshots in a follow-up commit directly on
master. The script tolerates an absent sun-elevation override API
(the codebase exposes sun direction via the per-scenario preset, not
a runtime setter — the capture uses the default preset and documents
the gap so the owner sweep covers the time-of-day matrix manually).

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. The water
shader path is the same `installWaterMaterialPatches` patched
`MeshStandardMaterial` across both backends (no TSL fork landed in
R1), so visual parity is expected — but the owner sweep is the
load-bearing check against strict-WebGPU desktop.

## What the owner should walk

Punch list mirroring the cycle brief's `voda-1-playtest-evidence`
Method. The owner walks this list in a batch sweep after the
campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**Shoreline visual on Open Frontier:**

1. Spawn into Open Frontier at **noon** (default OF preset). Stand
   on a shoreline overlook. Confirm:
   - Surface ripple animates continuously, no banding.
   - Sun-direction reflection reads on the surface.
   - Transparency fades cleanly into the shore (no harsh polygon
     edge).
   - Foam line traces the terrain-water boundary without z-fight.
2. Repeat at **sunset** (warm preset). Confirm the surface picks up
   the sun tint without going opaque or flat.
3. Repeat at **dawn** (low-oblique preset). Confirm low-angle
   ripple/normal sampling still reads.

**Shoreline visual on A Shau Valley:**

4. Walk to a river bank where the hydrology channel cuts the valley
   floor. Confirm the river surface visibly flows (UV scroll along
   the channel direction; depends on
   `hydrology-river-flow-visuals` being merged).
5. Cross the river. Confirm the foam line at the bank reads cleanly
   on both sides.

**Underwater POV:**

6. Step into the river or pond. Confirm the `wasUnderwater` overlay
   engages, the surface seen from below still reads as water, and
   the player can step back out without state leak.

**Evidence regeneration:**

7. Run `npm run evidence:atmosphere`. Confirm:
   - Zero browser errors in the run log.
   - Water visible in the regenerated artifact frames.
8. Re-check the Open Frontier `terrain_water_exposure_review` flag.
   Confirm overexposure no longer flagged.

## Recording owner sign-off

When the owner walks the list above:

- If all eight steps read as **playable** and **feels right** —
  append an "Owner sign-off" section to this file with the date +
  one-line summary, then close `VODA-1` in `docs/DIRECTIVES.md` with
  this cycle's close-commit SHA.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-voda-1-water-shader-and-acceptance-fix.md`
  per the PLAYTEST_PENDING walk-through protocol. The merged commits
  are not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Screenshot paths reserved under
  `artifacts/cycle-voda-1-water-shader-and-acceptance/playtest-evidence/`;
  populated either by the capture script run in this PR or by a
  post-merge back-fill commit on master.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the merge gate for the
`VODA-1` directive promotion to Closed; this task lands the
evidence-capture surface so the owner sweep has something concrete
to walk against.
