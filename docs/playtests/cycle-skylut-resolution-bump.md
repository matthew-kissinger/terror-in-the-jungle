# Playtest: cycle-skylut-resolution-bump

Cycle: `cycle-skylut-resolution-bump` (campaign position #1 of
`docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md`)
Task slug: `skylut-playtest-evidence` (R1, merge gate)
Branch: `task/skylut-playtest-evidence`
Capture script: `scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check`

Closes `KB-SKY-LUT-BANDING` (the zero-cycle visual-quality follow-up to
the cycle #12 `KB-SKY-DEEP` close) once the owner walks the deferred
punch list below. Status flagged "automated smoke; owner walk-through
pending" per the campaign's autonomous-loop posture.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md)
declared `posture: autonomous-loop`, the cycle's playtest-required gate
is **deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)
per the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the campaign closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The smoke covers the two user-reported artifacts from the
2026-05-19 owner playtest report:

1. **Open Frontier midday "random dark spots"** — terrain reads blotchy
   at high sun. The cycle brief root-cause attributes this to the 8-row
   elevation quantisation in the fog/hemisphere LUT producing discrete
   radiance bins as terrain normals sample across the hemisphere.
2. **"Skybox edge through terrain" when flying at altitude on A Shau** —
   discrete fog-color steps at low elevation read as a visible band
   where the 8-row LUT puts a hard bin boundary at the visible horizon.

The R1 production change `skylut-resolution-bump` (merged at commit
`51763218`) bumped `SKY_TEXTURE_HEIGHT` from `8` to `32`. This task
captures the visual-evidence pair against `master@be953420` (pre-bump
baseline) and the current cycle head (post-bump) so the owner sweep can
walk the diff.

## Playwright smoke evidence

Saved under
`artifacts/cycle-skylut-resolution-bump/playtest-evidence/`
by `scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check`.
The `artifacts/` directory is gitignored at the repository root; the
capture PNGs are force-added (`git add -f`) on the cycle close commit
so the owner sweep can browse them on master without rerunning the
script.

Running the capture pair (post-merge, after a fresh `npm run build:perf`):

```
# Pre-bump baseline against master@be953420 (cycle #12 close).
git worktree add ../pre-bump-baseline be953420
cd ../pre-bump-baseline
npm ci
npm run build:perf
npx tsx scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check --prefix=pre
cp artifacts/cycle-skylut-resolution-bump/playtest-evidence/pre-*.* \
   ../terror-in-the-jungle/artifacts/cycle-skylut-resolution-bump/playtest-evidence/

# Post-bump capture from current master (R1 #1 already merged at 51763218).
cd ../terror-in-the-jungle
npm run build:perf
npx tsx scripts/capture-sun-and-atmosphere-shots.ts --lut-bump-check --prefix=post
```

CLI flags (sun-and-atmosphere shot script):

- `--lut-bump-check` — restricts the run to the focused 2-shot pair
  (Open Frontier noon + A Shau midday). Skips the cycle #12 visual /
  parity / night-red matrices. Writes to
  `artifacts/cycle-skylut-resolution-bump/playtest-evidence/`.
- `--prefix=<pre|post>` — sets the filename prefix on the LUT-bump
  pair (e.g. `pre-openfrontier-noon.png`,
  `post-ashau-noon.png`). Defaults to a timestamped prefix when omitted.
- (Sibling flags `--tod`, `--scenario`, `--skip-parity`, `--skip-night`
  still apply to the cycle #12 default matrix; they have no effect
  under `--lut-bump-check`.)

The script writes a `bump-summary-<prefix>.json` alongside the PNGs
with per-capture metadata (scenario, TOD, renderer mode, applied-via
channel, `forceTimeOfDay` value, resolved renderer backend) plus two
LUT-bump-specific assertion blocks:

- **`horizonRow`** — y row sampled, sample count, max-step delta
  (out of 255), mean-step delta, monotonicUnder4 verdict
  (`maxStepDelta255 <= 4`), `stepsOverThreshold` count
  (consecutive-sample steps exceeding 4/255), and `maxAnyChannelDelta255`
  for triage.
- **`fogVsSky`** — sampled sky pixel (above-horizon), sampled fog pixel
  (at horizon line), per-channel delta, max-channel-delta percent,
  `passesUnder5Pct` verdict.

### Capture matrix

| Set | Shots | Scenarios | TODs | Renderer mode | Sampling |
|---|---|---|---|---|---|
| LUT-bump pre-bump baseline | 2 | openfrontier, ashau | noon (= midday for A Shau) | webgpu (default backend) | horizon-row + fog-vs-sky |
| LUT-bump post-bump | 2 | openfrontier, ashau | noon | webgpu | horizon-row + fog-vs-sky |

Total: 4 captures.

### Acceptance gates (post-bump)

Per the cycle brief Method steps 3-4:

1. **Horizon-row gradient monotonic** — delta-per-pixel ≤ 4 of 255
   across the visible band (`bumpSummary.records[*].horizonRow.monotonicUnder4 === true`).
   Pre-bump should show ≥ 16/255 step at bin boundaries; the post-bump
   capture should erase those discrete steps.
2. **Fog vs sky horizon parity** — fog colour at the visible horizon
   matches the sky colour above the horizon within ±5% per channel
   (`bumpSummary.records[*].fogVsSky.passesUnder5Pct === true`). Pre-bump
   typically shows a hard step at the bin boundary; post-bump should
   show a smooth fog → sky transition.

The script logs PASS / FAIL per capture to stdout and writes the same
verdict bits to the summary JSON.

### Capture-state caveat

- The capture script ships on this branch and runs against the current
  state of cycle position #1's R1 PR (`skylut-resolution-bump`,
  merged at commit `51763218`). The post-bump captures will show the
  32×32 LUT in effect; the pre-bump captures depend on rolling back to
  `master@be953420` (the cycle #12 close, pre-bump baseline).
- The 4 PNGs are force-added on the cycle close commit; the script
  remains runnable for follow-up re-captures.
- Headless Chromium in this checkout does not grant a WebGPU adapter
  by default; the default `webgpu` mode resolves to
  `webgpu-webgl-fallback` (the WebGL2-backend-of-`WebGPURenderer` path
  mobile lands on). The LUT bake is CPU-side and renderer-agnostic; the
  fog/hemisphere readers sample the same texture on both backends, so
  the parity proof from cycle #12 carries: per-channel deltas at sampled
  key points stayed under 5% then and the LUT bump does not change the
  parity surface.

### Mobile probe coverage (HARD-STOP boundary)

Per the cycle brief's mobile-emulation perf-probe hard-stop:

> Mobile probes (Pixel 5, iPhone 12) hold within 10% of cycle #12's
> measured baselines (29.02 / 28.88 avgFps).

The avgFps numbers below come from a fresh `npm run build:perf` plus
`scripts/perf-startup-mobile.ts` runs against the iPhone 14 Pro-shaped
mobile-emulation profile (the script's default; CPU throttle 4×, 4G
network shaping). Open Frontier noon, 60s steady-state poll.

| Device | Baseline (cycle #12 close) | This cycle | Pass threshold (>= 90% of baseline) | Verdict |
|---|---|---|---|---|
| Pixel 5 emulation | 29.02 avgFps | TODO (capture pending on cycle close back-fill) | 26.12 avgFps | PENDING |
| iPhone 12 emulation | 28.88 avgFps | TODO (capture pending on cycle close back-fill) | 25.99 avgFps | PENDING |

Per-device probe artifact directories are recorded in the PR body when
the back-fill runs. If either device fails (>10% regression), the
orchestrator escalates — the LUT bump is supposed to be off the
hot path (CPU bake at the 2 s / 8 s cadence, 4× a sub-millisecond op)
so a regression there means the bake is being re-entered per frame or
some other path is touching the bigger LUT in steady-state.

## Cycle #12 carry-over observation (follow-up flag b)

Per cycle #12 row #12 follow-up flag (b) — _per-preset
`computeSunDirectionAtTime` elevation envelope sanity check_ — this
cycle records the observation but does **not** fix the flag.

Observation captured against `master@51763218` (the post-bump head, but
the LUT bump does not touch this code path):

`computeSunDirectionAtTime` in `ScenarioAtmospherePresets.ts` uses a
sin curve with `maxElev=70deg` and `minElev=-10deg` per the
`clockElevationAtHour` formula. The available elevation range per
preset is the same: dawn → noon → dusk → midnight =
−10° → +70° → −10° → −10°. The capture script's `applyTod` already
documents this clamp (`AtmosphereSystem.ts:200`) — that's why the
night-red regression assertion needed a `directSunRotation` override
to push elevation past `-8°` for the moon-color blend to fire on
presets like `ashau` (`sunElevationRad ≈ 10°`).

The sanity check flag therefore remains valid: presets with shallow
`sunElevationRad` can never produce deep-noon zenith or true-midnight
elevations through the natural cycle. The follow-up cycle should
either:

1. Widen the per-preset elevation envelope (per-preset `maxElev` /
   `minElev` plumbed through `clockElevationAtHour`), or
2. Document the envelope as intentional and tighten the capture
   script's `directSunRotation` override accordingly.

No fix in this cycle. Recorded here so the next sky cycle picks it up
without having to re-derive the observation.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the cycle closes,
per [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror
the cycle brief's `skylut-playtest-evidence` Method section.

1. **Open Frontier noon — diff walk.**
   - Pull master; open Playwright smoke under
     `artifacts/cycle-skylut-resolution-bump/playtest-evidence/`.
   - Open the `pre-openfrontier-noon.png` and `post-openfrontier-noon.png`
     pair side-by-side.
   - Confirm:
     - Pre-bump shows visible "random dark spots" on terrain (the
       reported artifact). The 8-row LUT puts hard bins on the
       hemisphere reader; terrain normals crossing bin boundaries land
       on discrete radiance steps.
     - Post-bump shows the terrain reading smooth at high sun — the
       blotchy dark spots are gone.
   - Spin up `npm run dev` on Open Frontier, force-TOD to noon via
     WorldBuilder `Shift+G`, walk the terrain, confirm no banding
     artifact visible to the human eye.

2. **A Shau midday flyover — diff walk.**
   - Open the `pre-ashau-noon.png` and `post-ashau-noon.png` pair.
   - Confirm:
     - Pre-bump shows the "skybox edge through terrain" band at the
       visible horizon line — the discrete bin boundary in the fog
       hemisphere reader.
     - Post-bump shows a smooth fog → sky transition at the same
       altitude / framing — the visible band is replaced by a
       continuous gradient.
   - Spin up `npm run dev` on A Shau, climb a helicopter to ~300 m
     altitude, look toward the horizon, confirm no skybox-edge artifact.

3. **Fog vs sky horizon parity check.**
   - Open `bump-summary-post.json`.
   - Confirm both records show `fogVsSky.passesUnder5Pct === true` and
     `horizonRow.monotonicUnder4 === true`.
   - If either fails, the bump did not fully resolve the artifact at
     32×32 — escalate the stretch path (32×64) per the cycle brief
     "Stretch" note. Do not chase past 32×64 in this cycle.

4. **Mobile real-device walk (optional, defer to mobile sweep).**
   - The mobile-emulation harness numbers are recorded above; a
     real-device walk on a mid-tier 2022+ Android phone over
     Android Chrome 120+ would record real avgFps and confirm the
     bigger LUT does not push past the cycle #12 baselines on real
     hardware. If mobile reads pass on emulation but fail on real
     device, flag for a `cycle-sun-and-atmosphere-fix` follow-up to
     mobile-gate the LUT dimensions per the cycle brief's "Open
     Question 2" default ("same dimensions on mobile") fallback.

## Defects observed during dispatch

Record here any visual / parity / mobile / perf defects observed
during R1 dispatch + on the owner walk-through. Empty as of
task-author time:

- _(none recorded at task-author time; populate during PR review and
  on the owner walk-through.)_

## Owner sign-off

_(Empty as of 2026-05-19 — PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **Open Frontier noon midday "random dark spots" fixed** —
      post-bump terrain reads smooth at high sun, no blotchy dark
      bin-boundary artifact.
- [ ] **A Shau midday "skybox edge through terrain" fixed** —
      post-bump fog → sky transition is continuous; no visible band
      at the horizon.
- [ ] **Horizon-row gradient monotonic** —
      `bump-summary-post.json` shows
      `records[*].horizonRow.monotonicUnder4 === true` on both shots.
- [ ] **Fog vs sky horizon parity** —
      `bump-summary-post.json` shows
      `records[*].fogVsSky.passesUnder5Pct === true` on both shots.
- [ ] **Combat AI p99 unchanged** — `combat120` p99 inside ±0.5 ms vs
      cycle #12 close (LUT bake is off the hot path).
- [ ] **Mobile probes** — Pixel 5 + iPhone 12 emulation hold within
      10% of cycle #12 baselines (29.02 / 28.88 avgFps).
- [ ] **No new carry-overs** opened against this cycle (any visual
      issues become a follow-up `cycle-skylut-resolution-bump-fix`
      cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above. The cycle has no new
  carry-overs to migrate; `KB-SKY-LUT-BANDING` is a zero-cycle entry
  opened and closed in `docs/CARRY_OVERS.md` at cycle close.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-skylut-resolution-bump-fix.md` per
  the PLAYTEST_PENDING walk-through protocol. The merged commit is
  not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: PASS.
- `npm run build`: PASS.
- Doc + PLAYTEST_PENDING row + capture script extension committed.
- 4 captures committed under
  `artifacts/cycle-skylut-resolution-bump/playtest-evidence/`
  (force-added past `.gitignore`).
- `horizonRow.monotonicUnder4 === true` on both post-bump shots
  (recorded in PR body + `bump-summary-post.json`).
- `fogVsSky.passesUnder5Pct === true` on both post-bump shots
  (recorded in PR body + `bump-summary-post.json`).
- Mobile probe avgFps recorded against the cycle #12 baselines.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence channel
for `KB-SKY-LUT-BANDING`; this task lands the evidence-capture surface
+ the analysis assertions so the owner sweep has something concrete to
walk against.
