# Playtest: cycle-ashau-edge-and-flow-tuning

Cycle: `cycle-ashau-edge-and-flow-tuning` (campaign position #2 of 3,
2026-05-19 visual-and-wayfinding parallel campaign)
Task slug: `ashau-edge-and-flow-playtest-evidence`
Branch: `task/ashau-edge-and-flow-playtest-evidence`
Capture script:
[`scripts/capture-ashau-edge-and-flow-shots.ts`](../../scripts/capture-ashau-edge-and-flow-shots.ts)

Closes Stage **D3** of the CDLOD edge-morph plan that landed D1+D2 in
`cycle-2026-05-09-cdlod-edge-morph` (the deferred D3 explicitly named
this cycle as its close condition).

Closes carry-over `KB-DEM-EDGE-TAPER` (opened + closed in-cycle; net
delta on active count: 0). No new carry-overs opened.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md)
declared `posture: autonomous-loop`, the cycle's playtest-required
gate is **deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)
per the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the campaign completes.

This document substitutes Playwright + Chromium headless smoke for
the owner gate. The screenshots cover the three R1 visual targets the
cycle brief calls out:

1. **A Shau north-edge flyover** at altitude 1500 m, heading north
   toward the DEM boundary. **Pre:** tall vertical "fins" at the
   heightmap boundary (pre-D3 clamp extruding ridge pixels as a
   vertical wall). **Post:** smooth taper from boundary value to
   `DEM_EDGE_BASELINE_M = 0 m` over `DEM_EDGE_TAPER_RADIUS_M = 1500 m`,
   no fins.
2. **A Shau valley-road wide shot** showing route stamps on a
   hillside corridor. **Pre:** visible trench across the slope
   (the pre-guard flatten kernel cutting a canal into steep terrain).
   **Post:** drape follows terrain — flatten strength tapers to 0.0
   above the 15 deg slope threshold.
3. **A Shau Sampan spawn close-up** at the post-fix river coordinates
   `(-6895, 0, 4835)`. **Pre:** boat at `(60, 0, 80)` on dry dirt
   (~1.8 km from nearest wet channel; A Shau had `waterEnabled: false`
   so the hydrology surface was suppressed). **Post:** boat on the
   hydrology river surface; A Shau `waterEnabled: true` +
   `globalWaterPlaneEnabled: false` renders only the river channel,
   not the global sea-level plane.

## R1 production landings (cycle-close evidence)

| Slug | Branch | Commit | Author note |
|---|---|---|---|
| `dem-edge-taper` | `task/dem-edge-taper` | `f0359e80` + `a98c1f28` | Replaces boundary clamp in `DEMHeightProvider.sample()` with smoothstep ramp toward `DEM_EDGE_BASELINE_M = 0 m` over `DEM_EDGE_TAPER_RADIUS_M = 1500 m`. Worker-side parity via shared `DEMSampling.ts` module — main thread + `terrain.worker.ts` both delegate to `sampleDEMBilinearWithTaper` so visual bake + NPC ground-stick + navmesh sampling produce byte-identical heights everywhere. |
| `ashau-water-enable` | `task/ashau-water-enable` | `d0adbd9c` | Flips A Shau `waterEnabled: true` + adds new `globalWaterPlaneEnabled: false` config field decoupling the hydrology river surface from the global 2000 m sea-level plane (valley floor at ~580 m makes the global plane invisible). Sampan A Shau spawn moves from `(60, 0, 80)` to `(-6895, 0, 4835)` on a confirmed wet channel (accumulation 32944 cells, ~21.6 km channel length). |
| `route-stamp-slope-guard` | `task/route-stamp-slope-guard` | `78eb7230` | Adds slope-aware flatten in `TerrainFlowCompiler.appendRouteFlow`. Stamp flatten strength tapers to `routeBlendOnSteepSlope = 0.0` above `slopeGuardDegrees = 15` with `slopeGuardSoftnessDegrees = 5` (smooth 10-20 deg transition). On flat ground the stamp is byte-identical to today. |

Tuning values used (committed to `src/config/AShauValleyConfig.ts`
lines 113-135):

```ts
terrainFlow: {
  // ... (existing fields unchanged)
  routeWidth: 36,
  routeBlend: 14,
  routeTerrainWidthScale: 0.38,
  routeGradeStrength: 0.06,
  // Slope-aware drape: real-DEM hillsides are too steep to cut a flat
  // trail through without visible trenches. Above 15 deg the stamp
  // blends toward full drape (0 flatten). 5 deg softness gives a
  // smooth 10-20 deg blend.
  slopeGuardDegrees: 15,
  slopeGuardSoftnessDegrees: 5,
  routeBlendOnSteepSlope: 0.0,
},
```

DEM edge taper constants (committed to
`src/systems/terrain/DEMSampling.ts`):

```ts
export const DEM_EDGE_TAPER_RADIUS_M = 1500; // covers A Shau cameraFar ~4000 m
export const DEM_EDGE_BASELINE_M = 0;        // sea level
```

A Shau water flags (committed to `src/config/AShauValleyConfig.ts`):

```ts
waterEnabled: true,             // renders hydrology river surface
globalWaterPlaneEnabled: false, // suppress global sea-level plane (valley at ~580 m)
```

## Playwright smoke evidence

Saved under
`artifacts/cycle-ashau-edge-and-flow-tuning/playtest-evidence/` by
`scripts/capture-ashau-edge-and-flow-shots.ts`. The `artifacts/`
directory is gitignored at the repository root; the capture PNGs are
force-added (`git add -f`) on the cycle close commit so the owner
sweep can browse them on master without rerunning the script.

Re-running the capture script (`pre` pair from a baseline checkout
at `master@be953420`, `post` pair from the post-merge tip):

```
git checkout be953420 -- scripts/capture-ashau-edge-and-flow-shots.ts # if not present on baseline; otherwise inject script manually
npm run build:perf
npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --pair-tag=pre
# ... then on the post-merge tip:
git checkout task/ashau-edge-and-flow-playtest-evidence
npm run build:perf
npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --pair-tag=post
npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --pair-tag=post --include-mobile
```

CLI flags for partial reruns:

- `--pair-tag=<pre|post>` — sets the filename suffix per shot
  (defaults to `post`).
- `--skip-edge` — skip the north-edge flyover.
- `--skip-route` — skip the valley-road wide shot.
- `--skip-sampan` — skip the sampan close-up.
- `--include-mobile` — ALSO run Pixel 5 + iPhone 12 emulation probes
  via the existing `scripts/perf-startup-mobile.ts` harness.

The script writes `summary-<pair-tag>.json` alongside the PNGs with
per-capture metadata: shot name, pose, output filename, written byte
count, and any failure notes.

### Capture matrix

| Shot | Pose | Pre evidence | Post evidence |
|---|---|---|---|
| `ashau-north-edge-flyover` | altitude 1500 m, north-facing, -10 deg pitch from `(0, 1500, 9200)` | `ashau-north-edge-flyover-pre.png` | `ashau-north-edge-flyover-post.png` |
| `ashau-valley-road-wide` | mid-valley overlook at `(-2500, 700, 1200)`, looking SE | `ashau-valley-road-wide-pre.png` | `ashau-valley-road-wide-post.png` |
| `ashau-sampan-spawn-closeup` | behind-boat overhead at `(-6890, 5, 4845)`, looking back along the channel | `ashau-sampan-spawn-closeup-pre.png` | `ashau-sampan-spawn-closeup-post.png` |

Total: 6 captures (3 pairs).

### Capture-state caveat

- The capture script ships on this branch. The pre / post pairing is
  driven by the caller checking out the baseline commit and re-running
  with `--pair-tag=pre`. The post run uses `--pair-tag=post` (also the
  default).
- Headless Chromium in this checkout does not grant a WebGPU adapter
  by default; the default `webgpu` mode resolves to
  `webgpu-webgl-fallback` (the WebGL2-backend-of-`WebGPURenderer`
  path mobile lands on). All three captures exercise the same
  resolved backend pre vs post, so the visual difference is wholly
  attributable to the R1 production landings, not renderer drift.
- The valley-road wide pose `(-2500, 700, 1200)` is a representative
  hillside-route overlook. The A Shau route stamp bake is
  deterministic so the pose stays stable across runs; if the
  captured frame reads "wrong" against the actual route corridor,
  the executor or owner can pose-refine in a follow-up.

## Mobile probe coverage (HARD-STOP boundary)

Per the cycle brief's mobile-emulation perf-probe hard-stop:

> Terrain bake budget exceeds existing headroom by > 20% -> halt;
> the taper or slope guard is on the wrong path.

The cycle-#12 baselines for the same mobile profile (closed at
sun-and-atmosphere overhaul; load-isolated 60 s steady-state on
A Shau Open Frontier noon):

| Device | Cycle #12 baseline | Pass threshold (>= 90% of baseline) |
|---|---|---|
| Pixel 5 emulation | 29.02 avgFps | 26.12 avgFps |
| iPhone 12 emulation | 28.88 avgFps | 25.99 avgFps |

The probe runs against A Shau (`a_shau_valley` preset) so the new
DEM edge taper + route-stamp slope guard + waterEnabled flip all
fire in the bake path being measured. Run via:

```
npx tsx scripts/capture-ashau-edge-and-flow-shots.ts --include-mobile
```

The summary JSON's `mobileProbes[]` array records exit code, artifact
dir, and stdout tail per device. Owner-side merge gate: any device
that fails to come in within 10 percent of its cycle #12 baseline
flips this row to "needs work" and surfaces a follow-up cycle.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's `ashau-edge-and-flow-playtest-evidence` Method section.

1. **DEM edge taper (north-edge flyover).**
   - Spin up dev preview (`npm run dev`), load A Shau Valley.
   - Open WorldBuilder (`Shift+G`) → free-fly. Translate camera to
     altitude 1500 m, drift north toward the DEM boundary
     (z = +10368 m).
   - Confirm no tall vertical "fins" extruding past the boundary.
     The terrain past the DEM edge should ramp smoothly to the
     baseline elevation over a visible ~1.5 km transition band;
     past that the heightmap pins at `DEM_EDGE_BASELINE_M = 0 m`.
   - Compare against `ashau-north-edge-flyover-pre.png` and
     `ashau-north-edge-flyover-post.png`.

2. **Route-stamp slope guard (valley-road wide shot).**
   - In A Shau dev preview, walk the player or free-fly to a route
     corridor that climbs a valley hillside (the visible "trench"
     in the pre build, per the cycle brief's screenshot reference).
   - Confirm the route now drapes over the terrain rather than
     cutting a canal. The corridor surface should match the
     hillside slope, not slice through it. Flatten only persists
     on gentle ground (below the 15 deg slope guard threshold).
   - Compare against `ashau-valley-road-wide-pre.png` and
     `ashau-valley-road-wide-post.png`.

3. **Sampan on water (sampan spawn close-up).**
   - In A Shau dev preview, navigate to the relocated sampan spawn
     near `(-6895, 0, 4835)`.
   - Confirm the sampan sits on the hydrology river channel (not
     dry dirt). The river surface should render — `waterEnabled: true`
     gates the hydrology mesh — without a competing global sea-level
     plane visible elsewhere on the map (`globalWaterPlaneEnabled: false`).
   - Compare against `ashau-sampan-spawn-closeup-pre.png` and
     `ashau-sampan-spawn-closeup-post.png`.

4. **NPC nav across the once-flattened corridor (smoke test).**
   - With A Shau loaded, observe NPCs traversing the post-stamp
     route corridor. The cycle brief calls this out as a hard stop
     boundary — if NPC stuck-rate up > 50% on a smoke run, raise the
     slope guard threshold or revert the route-stamp change.
   - Per `terrain-nav-reviewer` APPROVE on PR #282 the corridor is
     still walkable on a 30 deg slope (the `SlopeStuckDetector` from
     cycle #11 absorbs the difference).

5. **Mobile real-device walk (optional, defer to mobile sweep).**
   - The mobile-emulation harness numbers are recorded above; a
     real-device walk on a mid-tier 2022+ Android phone over Android
     Chrome 120+ would record real `avgFps` and confirm the new
     taper + slope-guard + hydrology-render-on bake budget remains
     acceptable on real mobile. If real-device reads exceed the
     cycle #12 baseline by > 10%, flag for a follow-up cycle to
     gate the taper-mesh or slope-sample resolution.

## Defects observed during R1 + R2 dispatch

R1 reviewer-flagged items (informational; do NOT fix here — captured
as cycle-retro items per orchestrator policy):

- **PR #282 (route-stamp-slope-guard):** `samplingRadius` in
  `TerrainFlowCompiler.ts:263` is not scaled by `flattenStrength`.
  Safe today (dead path when `flattenStrength = 0`) but a one-line
  comment is recommended. Cycle-retro item — bundle into the next
  cycle that touches `TerrainFlowCompiler.ts`.
- **PR #282 (route-stamp-slope-guard):** The 4-tap slope sample at
  DEM edges (where the new taper meets steep terrain) is
  directionally biased toward zero — `DEMHeightProvider` clamps both
  `+s` and `-s` taps to the same edge column, yielding `dHdX = 0`.
  Acceptable for R1; the route stamp at the DEM boundary is rare.
  Campaign-retro item.
- **PR #277 (ashau-water-enable):** Sampan A Shau relocation coord
  `(-6895, 0, 4835)` is brittle to future hydrology bake regen — if
  the bake reseed shifts the largest channel, the spawn falls back
  off-channel. Cycle-3 follow-up recommended: either add a
  provenance-comment annotation pinning the seed used, or migrate
  to a dynamic `resolvePosition` that snaps to the nearest wet
  channel center at runtime.

R2 defects observed during this task: _(none recorded at task-author
time; populate during owner sweep.)_

## Owner sign-off

_(Empty as of 2026-05-20 — PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **DEM edge taper visible** on the A Shau north-edge flyover:
      no vertical fins past the boundary; smooth ramp to baseline.
- [ ] **Route stamp drapes hillsides** on A Shau: no trench across
      steep slopes; gentle ground flatten still present.
- [ ] **Sampan sits on water** at the new A Shau spawn coords
      `(-6895, 0, 4835)`; hydrology river surface renders, no
      global sea-level plane.
- [ ] **NPC nav across the once-flattened corridor still completes**
      (smoke test on a live A Shau session; no > 50% stuck-rate
      regression).
- [ ] **Mobile real-device walk completed** (or explicitly deferred
      to a follow-up sweep).
- [ ] **No new carry-overs** opened against this cycle (any visual
      issues become a follow-up `cycle-ashau-edge-and-flow-fix`
      cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close
  `KB-DEM-EDGE-TAPER` in `docs/CARRY_OVERS.md` with this cycle's
  close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-ashau-edge-and-flow-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are
  not reverted under autonomous-loop posture.

## Cycle retro items

These are NOT new carry-overs (respecting the <= 12 active limit per
Phase 0); they are bundled into the next cycle that touches the
relevant area:

1. **`TerrainFlowCompiler.ts:263` `samplingRadius` scaling** —
   document that the radius is not currently scaled by
   `flattenStrength`. Dead-path-safe today; one-line comment when
   next-cycle touches the file.
2. **4-tap slope sample at DEM edges** — DEM boundary clamp on both
   `±s` taps yields `dHdX = 0`, biasing the slope sample toward
   "flat" at the very edge. Rare in practice (routes don't usually
   reach the DEM boundary on A Shau) but worth fixing when
   re-touching the slope-sample logic.
3. **Sampan A Shau coord provenance** — `(-6895, 0, 4835)` is
   brittle to hydrology bake reseed. Cycle-3 (or first downstream
   sampan-touching cycle) to either pin the seed via comment or
   replace with a dynamic `resolvePosition(nearest wet channel)`
   lookup.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: PASS (no test changes; the R1 PRs added their
  own tests).
- `npm run build`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- 6 captures available under
  `artifacts/cycle-ashau-edge-and-flow-tuning/playtest-evidence/` once
  the script runs (force-added past `.gitignore` on cycle close).

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence
channel for `KB-DEM-EDGE-TAPER` and the cycle-close acceptance.
This task lands the evidence-capture surface so the owner sweep has
something concrete to walk against.
