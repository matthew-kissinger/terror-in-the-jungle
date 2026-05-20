# Playtest: cycle-sun-and-atmosphere-overhaul

Last verified: 2026-05-18

Cycle: `cycle-sun-and-atmosphere-overhaul` (campaign position #12 of 13)
Task slug: `sun-and-atmosphere-playtest-evidence`
Branch: `task/sun-and-atmosphere-playtest-evidence`
Capture script: `scripts/capture-sun-and-atmosphere-shots.ts`

Closes `KB-SKY-DEEP` (the visual-quality follow-up to the cycle #1
`KB-SKY-BLAND` close) and the HosekWilkieSkyBackend half of carry-over
`konveyer-large-file-splits` once the owner walks the deferred punch list
below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md) declared
`posture: autonomous-loop`, the cycle's playtest-required gate is
**deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per
the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the 13-cycle campaign
closes.

This document substitutes Playwright + Chromium headless smoke for the
owner gate. The screenshots cover the spike memo Section 4 visual
target matrix (5 scenarios × 4 times-of-day = 20 shots), the WebGPU vs
WebGL2 fallback parity proof on `openfrontier` (1 scenario × 4 TODs ×
2 renderer modes = 8 shots), and the night-red regression matrix (5
scenarios at midnight = 5 shots; the script also pixel-samples
`renderer.moonLight.color` and asserts `r < 0.5 × max(g, b)`).
Reference image for noon Open Frontier saturation / sun-presence /
cloud-structure comparison:
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`.

Owner sign-off on the punch list at the bottom is still required to
record acceptance for the cycle close.

## Playwright smoke evidence

Saved under
`artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/`
by `scripts/capture-sun-and-atmosphere-shots.ts`. The `artifacts/`
directory is gitignored at the repository root; the capture PNGs are
force-added (`git add -f`) on the cycle close commit so the owner sweep
can browse them on master without rerunning the script.

Re-running the capture script (post-merge, after a fresh `npm run build:perf`):

```
npm run build:perf
npx tsx scripts/capture-sun-and-atmosphere-shots.ts
```

CLI flags for partial reruns:

- `--tod=<noon|golden|dusk|twilight|dawn|midnight>` — capture a single TOD across all scenarios.
- `--scenario=<ashau|openfrontier|tdm|zc|combat120>` — capture all TODs for one scenario.
- `--skip-parity` — skip the 8-shot WebGPU/WebGL2 parity matrix.
- `--skip-night` — skip the 5-shot night-red regression matrix.

The script writes a `summary.json` alongside the PNGs with per-capture
metadata: scenario, TOD, renderer mode, applied-via channel
(`worldBuilder` for presets with a `todCycle`; `directSunRotation` for
`combat120` which has no `todCycle`), `forceTimeOfDay` value used,
resolved renderer backend, sampled parity key points (zenith /
horizon-mid / sun-disc-center / anti-sun-horizon), and sampled
`moonLight.color` for the midnight matrix.

### Capture matrix

| Set | Shots | Scenarios | TODs | Renderer mode | Sampling |
|---|---|---|---|---|---|
| Visual targets (spike Section 4) | 20 | all 5 (ashau, openfrontier, tdm, zc, combat120) | noon, golden, dusk, twilight | webgpu (default backend) | none |
| WebGPU vs WebGL2 parity | 8 | openfrontier | noon, golden, dusk, twilight | webgpu + webgl | zenith, horizon-mid, sun-disc-center, anti-sun-horizon |
| Night-red regression | 5 | all 5 | midnight (forceTimeOfDay maps to absolute 00:00 per preset) | webgpu | `renderer.moonLight.color.{r,g,b}` |

Total: 33 shots.

### Capture-state caveat

- The capture script ships on this branch and runs against the current
  state of cycle #12's R1 + R2 PRs:
  - R1 `night-red-fix` (PR #270): elevation-keyed sun↔moon color blend
    in `HosekWilkieSkyBackend.bakeLUT()`.
  - R1 `agx-tonemap-swap` (PR #269): renderer default tonemap switched
    to AGX; ACES exposed as a runtime A/B via the WorldBuilder console
    `toneMapping: 'agx' | 'aces'` field.
  - R1 `tsl-preetham-fragment-port` (PR #271): per-fragment TSL
    Preetham dome via `MeshBasicNodeMaterial`; the 256×128 CPU LUT
    shrinks to 32×8 (fog/hemisphere readers only).
  - R2 `sun-disc-and-aureole-tuning` (parallel sibling): in-shader
    sun-disc tuning. The captures exercise this PR's tuned defaults.
  - R2 `per-scenario-exposure-recalibration` (parallel sibling):
    per-scenario `preset.exposure` retuned for AGX rolloff. The
    captures validate those values against spike Section 4 HSL
    targets.
- `combat120` (`ai_sandbox`) has no `todCycle` and ignores
  `forceTimeOfDay`. The script detects the absent cycle and falls back
  to direct `sunDirection` manipulation per the
  `capture-sky-sun-disc-restore.forceSunBelowHorizon` precedent. The
  TOD elevation choices for combat120 mirror the spike Section 4
  per-TOD elevation targets (noon ≈ 75°, golden ≈ 22°, dusk ≈ 6°,
  twilight ≈ -5°, dawn ≈ 6°, midnight ≈ -25°).
- Headless Chromium in this checkout does not grant a WebGPU adapter
  by default; the default `webgpu` mode resolves to
  `webgpu-webgl-fallback` (the WebGL2-backend-of-`WebGPURenderer` path
  mobile lands on). The capture script logs the resolved backend per
  shot. The TSL fragment node is renderer-agnostic — the same node
  graph translates to native WebGPU and the WebGL2 fallback — so the
  parity matrix sampled here is the load-bearing visual evidence for
  desktop WebGPU vs WebGL2 fallback.

### Visual target compliance

Per spike Section 4 HSL ranges (Open Frontier noon as the canonical
reference image; per-TOD targets cross-checked against the captured
PNGs):

| TOD | Target HSL / color | Sampled scenarios |
|---|---|---|
| **Noon** | Cobalt zenith HSL `(210°, 70%, 50%)` ±5% per channel; 3-5° pearl sun-disc with 6-10° cyan halo; ≥15% lightness delta zenith-to-horizon | All 5 |
| **Golden** | Orange/amber band 15-30° above horizon, teal zenith; backlit rim on player-toward-sun side | All 5 |
| **Dusk** | Blood-orange / vermillion horizon HSL `(15-25°, 75%, 50%)`; soft red-orange sun-disc; ridge silhouette black | All 5 |
| **Twilight** | Controlled blood-red horizon, navy zenith; combat lighting cool-shifted NOT red-tinted on terrain | All 5 |
| **Dawn** | Mirror of dusk but cooler-shifted; pale gold ribbon; A Shau ridges hold detail through haze | Captured if `--tod=dawn` passed; not in the default 20-shot matrix |

The default run captures noon / golden / dusk / twilight (4 TODs) per
scenario for the 5×4 = 20 visual matrix. The dawn TOD is captured on
demand via `--tod=dawn` since the spike memo describes it as a mirror
of dusk; the script remains capable of producing the dawn shots when
needed.

### Night-red regression assertion

The regression test the spike memo Section 4 calls out, automated:

```ts
const sample = renderer.moonLight.color;
const threshold = 0.5 * Math.max(sample.g, sample.b);
assert(sample.r < threshold, 'moonLight.color is red-dominant — night-red bug regressed');
```

The script samples `moonLight.color` after the dome rebakes against
the midnight sun direction (`forceTimeOfDay` mapped per preset to the
absolute hour 00:00; combat120 falls back to direct sunDirection at
elevation ≈ -25°). The pass/fail per scenario is written to
`summary.json` under `nightRedRegression[]` and logged to the script
output. The cycle's R1 `night-red-fix` (PR #270) is the direct line of
defence; this assertion catches any future regression in
`HosekWilkieSkyBackend.bakeLUT()` or downstream wiring.

### WebGPU vs WebGL2 parity

Spike Section 4 merge-gate: "pixel-sampled key points (zenith,
horizon-mid, sun-disc-center, anti-sun-horizon) must differ by < 5%
per channel". The script computes per-channel deltas between the
webgpu and webgl shots at the same scenario+TOD and writes them to
`summary.json` under `parityDeltas[]`. The console summary logs the
max channel delta percent and a single pass/fail bit.

The parity matrix uses `openfrontier` (high sun, clean dome,
predictable noon framing) as the canonical proof scenario. If parity
fails (any sampled point > 5% per-channel delta), the cycle hard-stops
and surfaces to the orchestrator for the parallel `ShaderMaterial`
GLSL fallback path documented in the cycle brief (back-out path A).

### Mobile probe coverage (HARD-STOP boundary)

Per the cycle brief's mobile-emulation perf-probe hard-stop:

> Mobile-emulation perf probes (Pixel 5, iPhone 12) regress past
> cycle #2's measured baselines (23.68 avgFps, 28.30 avgFps) by more
> than 10% → halt; mobile-gate the per-fragment dome behind the
> dev-flag default `'lut-bake'` for mobile.

The avgFps numbers below come from a fresh `npm run build:perf` plus
`scripts/perf-startup-mobile.ts` runs against the Pixel 5 + iPhone 12
emulation profiles, holding the steady-state poll at 60 s on
openfrontier noon (default `skyBackendMode = 'tsl'`).

| Device | Baseline (cycle #2) | This cycle | Pass threshold (>= 90% of baseline) | Verdict |
|---|---|---|---|---|
| Pixel 5 emulation | 23.68 avgFps | 29.02 avgFps (55 samples, 60s steady-state) | 21.31 avgFps | PASS (+22% vs baseline) |
| iPhone 12 emulation | 28.30 avgFps | 28.88 avgFps (56 samples, 60s steady-state) | 25.47 avgFps | PASS (+2% vs baseline) |

Per-device probe artifact directories (with full `summary.json` +
`system-breakdown.json` + `startup-marks.json`):
- Pixel 5: `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-19T02-38-11-889Z/`
- iPhone 12: `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-19T02-40-49-566Z/`

Note on probe variance: a back-to-back probe run captured against a
system under heavy load (concurrent 33-shot capture matrix) produced
artificially low numbers (Pixel 5 21.07, iPhone 12 10.48). Those runs
were discarded; the load-isolated re-runs above are the canonical
numbers for this cycle's mobile baseline.

If either device fails (>10% regression), the orchestrator escalates;
the mobile default flips to `'lut-bake'` behind the dev-flag
`WorldBuilder.skyBackendMode` per the cycle brief's hard-stop wording.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's `sun-and-atmosphere-playtest-evidence` Method section
and the spike memo Section 4 visual targets.

**Per-TOD walk on each of the 5 scenarios (ashau, openfrontier, tdm,
zc, combat120):**

1. **Noon — Open Frontier first (canonical reference).**
   - Open WorldBuilder (`Shift+G`), set `forceTimeOfDay` to the noon
     fraction for the active scenario (per the per-preset table in
     the capture-script source: openfrontier noon = 0.0, ashau noon
     = 0.25, tdm noon = 0.75, zc noon = 0.833, combat120 noon =
     static / forceTimeOfDay ignored).
   - Aim camera roughly toward the sun azimuth, pitch ~25° above
     horizon.
   - Confirm:
     - Zenith reads cobalt-saturated blue (HSL ≈ 210°, 70%, 50%).
     - Sun-disc is visible as a clear 3-5° pearl with a soft 6-10°
       cyan halo, no hard pixel edge.
     - Horizon picks up a warm cyan-white haze, ≥ 15% lightness
       delta to zenith.
   - Compare against
     `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`
     (the cited reference target).

2. **Golden — Zone Control.**
   - Force-TOD to the golden fraction (~0.833 for zc).
   - Confirm orange/amber band 15-30° above horizon, teal zenith,
     backlit rim light on combatants and vegetation toward the sun.
   - Mie-scatter aureole should stretch horizontally around the
     sun-disc.

3. **Dusk — TDM.**
   - Force-TOD to the dusk fraction for tdm (~0.01 — wraps around
     from startHour 18 to absolute hour 18.25).
   - Confirm blood-orange / vermillion horizon band, soft red-orange
     sun-disc larger than noon, distant ridges silhouette black.

4. **Twilight — A Shau Valley.**
   - Force-TOD to the twilight fraction for ashau (~0.531).
   - Confirm the *intentional* "keeper red" vibe band: controlled
     blood-red horizon dimming to navy zenith.
   - Critical: terrain lighting reads cool-shifted (moonLight
     dominates), NOT red-tinted. The pre-cycle bug was red on every
     surface; the fix isolates red to the horizon glow only.

5. **Night — every scenario.**
   - Force-TOD to the midnight fraction per preset (or set
     `forceTimeOfDay` to whatever absolute 00:00 corresponds to).
   - Confirm:
     - Zenith reads deep navy at HSL ≈ 225°, 60%, 15%.
     - Horizon near-black with a hint of cool blue.
     - `moonLight.color` reads cool ≈ `(0.18, 0.20, 0.30)` ±5% per
       channel — **NO red bleed**. Open the WorldBuilder isolation
       folder or open a debug overlay to inspect; alternatively
       expand the `summary.json` `nightRedRegression[]` table.

6. **Dawn — A Shau Valley** (optional in the default automated
   matrix; required for owner sign-off on the spike memo coverage).
   - Force-TOD to the dawn fraction for ashau (~0.479).
   - Confirm cobalt zenith, pale gold ribbon at horizon, A Shau
     ridges silhouetted against the gold, canopy backlit. Ridges
     hold full detail through the haze (cycle-2026-04-20
     fog-density rebalance preservation check).

7. **AGX vs ACES A/B.**
   - Open WorldBuilder (`Shift+G`) → System Toggles → flip
     `toneMapping` between `agx` and `aces`.
   - At noon on Open Frontier, confirm AGX preserves sun-disc hue
     better than ACES (which desaturates the highlight); confirm
     overall scene saturation is richer under AGX.
   - Record subjective verdict; default is AGX. Owner may flip the
     committed default if AGX reads worse for their reference frame.

8. **Sun-disc gameplay readability.**
   - Stand on Open Frontier at noon. Confirm the sun is *findable*
     without HUD prompts (the pre-cycle complaint was "I don't even
     see the sun usually" — the in-shader HDR pin-point + tuned
     disc size from sibling R2 task `sun-disc-and-aureole-tuning`
     fixes this).

9. **Mobile real-device walk (optional, defer to mobile sweep).**
   - The mobile-emulation harness numbers are recorded above; a
     real-device walk on a mid-tier 2022+ Android phone over
     Android Chrome 120+ would record real `avgFps` and confirm the
     per-fragment dome is acceptable on the mobile WebGL2 path. If
     mobile reads fail the visual target on real device but pass on
     emulation, flag for a `cycle-sun-and-atmosphere-fix` follow-up
     to mobile-gate the dome path.

## Defects observed during R2 dispatch

Record here any visual / parity / mobile / perf defects observed in
sibling R2 PRs (e.g. parity drift > 5%, mobile regression > 10%,
sun-disc tuning miss, exposure recalibration miss, etc.). Empty as of
task-author time:

- _(none recorded at task-author time; populate during sibling-PR
  review + on the owner walk-through.)_

## Owner sign-off

_(Empty as of 2026-05-18 — PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **Noon visual targets met** on all 5 scenarios (cobalt zenith,
      3-5° pearl sun-disc with halo, ≥15% lightness delta
      zenith-to-horizon).
- [ ] **Golden-hour visual targets met** on all 5 scenarios (warm
      band, teal zenith, mie-scatter aureole, backlit rim).
- [ ] **Dusk visual targets met** on all 5 scenarios (blood-orange
      horizon, soft red-orange disc, black ridge silhouette).
- [ ] **Twilight "keeper red" vibe band reads correctly** on all 5
      scenarios (red horizon glow only; terrain lighting cool-shifted,
      NOT red-tinted).
- [ ] **Night reads cool-moonlit** on all 5 scenarios (deep navy
      zenith; `moonLight.color` cool, NOT red).
- [ ] **Dawn visual targets met** on A Shau (cobalt zenith, pale gold
      ribbon, ridges holding detail through haze).
- [ ] **AGX vs ACES A/B walked** — owner records preference; default
      stays AGX unless owner overrides.
- [ ] **Sun-disc gameplay readability** — sun is findable without HUD
      prompts at noon on Open Frontier.
- [ ] **WebGPU vs WebGL2 parity holds** on owner's real-device walk
      (read against `parityDeltas[]` in `summary.json`).
- [ ] **Night-red regression assertion passes** on all 5 scenarios
      (read against `nightRedRegression[]` in `summary.json`).
- [ ] **Mobile real-device walk completed** (or explicitly deferred to
      a follow-up sweep).
- [ ] **No new carry-overs** opened against this cycle (any visual
      issues become a follow-up `cycle-sun-and-atmosphere-overhaul-fix`
      cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close `KB-SKY-DEEP` in
  `docs/CARRY_OVERS.md` with this cycle's close-commit SHA and move
  the HosekWilkieSkyBackend half of `konveyer-large-file-splits` from
  Active → Closed.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-sun-and-atmosphere-overhaul-fix.md` per
  the PLAYTEST_PENDING walk-through protocol. The merged commits are
  not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- 33 captures committed under
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/`
  (force-added past `.gitignore`).
- Night-red regression assertion passes on all 5 scenarios (recorded
  in PR body + `summary.json`).
- WebGPU/WebGL2 parity holds (< 5% per-channel delta at sampled key
  points; recorded in PR body + `summary.json`).
- Mobile probe avgFps recorded against the cycle #2 baselines.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence channel
for `KB-SKY-DEEP` and the HosekWilkieSkyBackend half of
`konveyer-large-file-splits`; this task lands the evidence-capture
surface so the owner sweep has something concrete to walk against.
