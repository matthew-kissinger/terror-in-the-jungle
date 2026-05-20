# Cycle: Sky LUT Resolution Bump (Open Frontier midday dark-spots + horizon-banding fix)

Last verified: 2026-05-19 (queued at insertion; pre-dispatch)

## Status

Queued at **position #1** in
[docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md](../CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md).
Independent of cycles #2 and #3 in the same campaign — runs in parallel.
Opens and closes a new ID `KB-SKY-LUT-BANDING` in-cycle (zero-cycle
visual-quality follow-up to `KB-SKY-DEEP`, which was opened and closed
inside cycle #12 `cycle-sun-and-atmosphere-overhaul`).

## Skip-confirm: no

Owner playtest deferred to PLAYTEST_PENDING under autonomous-loop
posture; merge gated on CI green + Playwright capture pair (pre/post
on Open Frontier noon) showing banding eliminated. The fix is small
enough that a single PR carries it.

## Concurrency cap: 2

R1 ships the LUT dimension bump + the parity test extension. A
single-PR cycle in shape; the second slot exists only for a
back-out PR if the bump regresses fog color in a way the parity test
doesn't catch. No R2.

## Objective

Eliminate two related visual artifacts on `master` (live SHA
`fc398f12`, head SHA `be953420`) caused by the
`tsl-preetham-fragment-port` (e26348b5) LUT shrink from `256×128` to
`32×8` half-float:

1. **Open Frontier midday "random dark spots"** — terrain reads
   blotchy at high sun. Most likely cause is the **8-row elevation
   quantization** in the fog/hemisphere LUT (`HosekWilkieSkyBackend.ts`
   lines 21–22) producing discrete radiance bins as terrain normals
   sample across the hemisphere.
2. **Visible "skybox edge through terrain" when flying at altitude**
   (reported on A Shau valley flights). The 500-unit sphere dome can
   never geometrically intersect the 21 km DEM; the symptom is
   actually **discrete fog-color steps at low elevation** where the
   8-row LUT puts a hard bin boundary at the visible horizon line.
   The dome is per-fragment TSL post-port; only the fog/hemisphere
   readers still sample the coarse LUT, so the band is fog-driven.

Both symptoms share one root: the LUT's 8 elevation rows × 32
azimuth columns is too coarse for the post-AGX exposure range. Bump
to `32×32` (or `64×32` if the parity case asks for it) — net memory
change still tiny (256 → 1024 or 2048 half-float texels), bake time
negligible (≤ 1 ms on the existing cadence), no architectural
change.

Source authority for scope:
- This brief (root cause analysis from the 2026-05-19 owner playtest
  report).
- [docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](../rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
  Section 3 candidate F (the chosen approach for cycle #12).
- Cycle #12 close memo at
  [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  row #12 (the LUT-shrink rationale and the carry-over follow-up
  flags).

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
   lines `9–22` (LUT dimension constants), lines `104–134` (texture
   creation), lines `777–812` (`bakeLUT` body). These are the only
   lines that should change in the production path.
2. `src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts`
   — the existing parity test. The new LUT dimensions need the
   expected-shape assertions updated. The TSL/CPU parity test from
   cycle #12 (64-direction render-back) is the canonical visual
   gate; verify the assertion still holds at the new dimensions.
3. `src/systems/environment/AtmosphereSystem.ts` lines `41–42` —
   downstream `compressSky*` caps. The bump should not push values
   past these caps; if it does, document.
4. Cycle #12 brief at
   `docs/tasks/cycle-sun-and-atmosphere-overhaul.md` task
   `tsl-preetham-fragment-port` "Method" step 4 (the LUT shrink
   rationale) and Acceptance Criteria "Net memory: 0 MB new".
5. `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md` row #12 follow-up
   flag (b): per-preset `computeSunDirectionAtTime` elevation
   envelope sanity check. This cycle does **not** fix that flag;
   capture the answer in the playtest evidence so the next sky
   cycle picks it up.
6. `perf-baselines.json` — `combat120` and `openfrontier:short` p99
   (currently warn-stamped per STABILIZAT-1; treat as soft gate).

## Critical Process Notes

1. **One file is the production change** —
   `HosekWilkieSkyBackend.ts`. If a diff proposes touching
   `HosekWilkieTslNode.ts`, the visual dome, or any other atmosphere
   module, halt — this cycle's scope is strictly the CPU LUT
   dimensions and the consumers that sample it.
2. **No fence change.** `src/types/SystemInterfaces.ts` does not
   need to be touched.
3. **No new `WebGLRenderTarget`** (cycle-voda-1 mobile no-RT win
   stays load-bearing).
4. **Don't re-tune AGX exposure** — cycle #12 R2
   `per-scenario-exposure-recalibration` set per-scenario exposures
   on the assumption of the coarse LUT. After the bump the LUT
   becomes smoother but the absolute brightness target is unchanged;
   the recalibrated exposures stay valid. If the bump visibly
   shifts midtones, file a follow-up — don't tune in this cycle.
5. **Mobile sky-refresh cadence (8 s) stays unchanged.** The bigger
   LUT still bakes inside the existing `refreshSkyTexture` budget
   (256 → 1024 texels is a 4× CPU bake-cost increase on a path that
   takes < 1 ms today — well inside the 8 s cadence headroom).
6. **WebGPU vs WebGL2 parity** — the LUT path is CPU-baked + GPU
   sampled by readers; same on both renderer modes. No parity risk
   expected, but the playtest capture pair must show parity in
   `fog` color at the horizon.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `skylut-resolution-bump`, `skylut-playtest-evidence` | 2 | One production PR + one playtest-evidence PR. Both small. |

## Task Scope

### skylut-resolution-bump (R1)

Bump the fog/hemisphere LUT in `HosekWilkieSkyBackend.ts` and update
tests.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  (lines `9–22` LUT dimension constants; verify lines `104–134`
  texture allocation accepts new dimensions; verify `bakeLUT` loop
  at `777–812` iterates correctly; verify `sample()` at the call
  site picks up the new dimensions).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts`
  (update `expected-shape` assertions for new LUT dimensions; the
  64-direction parity test should still hold but with tighter
  per-channel deltas — record the new measured deltas in the test
  comments).

**Method:**
1. Change `SKY_TEXTURE_HEIGHT` from `8` → `32`. Keep
   `SKY_TEXTURE_WIDTH` at `32` (a single doubling on each axis
   gives 4× total bin count without quadrupling memory; bake cost
   roughly 4× a sub-millisecond operation).
2. Verify the `bakeLUT()` body's `for row, col` loops index against
   the new dimensions; the existing code uses
   `SKY_TEXTURE_WIDTH/HEIGHT` constants so a single constant change
   should propagate — confirm no hardcoded `8` or `32` literals
   remain in the bake or sample paths.
3. Verify `LUT_ELEVATION_BINS` (or the equivalent reader-side
   constant if separate) picks up the new height.
4. Re-bake on cycle start (existing `refreshSkyTexture` triggers
   covers this — first frame after scenario load).
5. Confirm the existing `getRefreshStatsForDebug()` telemetry still
   reports correctly with the new dimensions.
6. **Stretch (only if the 32×32 bump still shows visible banding at
   Open Frontier midday in the playtest capture):** raise
   `SKY_TEXTURE_HEIGHT` to `64`. Defer beyond `32×64 = 2048` texels
   without a follow-up cycle — at that scale the CPU LUT starts to
   compete with the per-fragment TSL path on cost.
7. Commit message: `feat(atmosphere): bump sky LUT 32x8 → 32x32 for fog/hemisphere reader smoothness (skylut-resolution-bump)`.

**Acceptance:**
- Lint + tests + build green.
- TSL/CPU parity test (from cycle #12) passes at the new
  dimensions with per-channel delta ≤ 0.05 at 64 sampled directions
  (tighter than the coarse-LUT case because the CPU sample is now
  closer to the per-fragment TSL value).
- Existing `HosekWilkieSkyBackend.test.ts` shape assertions
  updated; all cases green.
- `combat120` p99 unchanged ±0.1 ms (LUT bake is off the hot path).
- Net memory change: +0.75 KB to +3 KB depending on final
  dimensions (256 → 1024 or 2048 half-float texels). Negligible.

### skylut-playtest-evidence (R1, merge gate)

Playwright capture pair (pre-bump from `master` baseline + post-bump
from this cycle's branch) on Open Frontier noon and A Shau midday
flyover.

**Files touched:**
- New: `docs/playtests/cycle-skylut-resolution-bump.md`.
- Extend the existing `scripts/capture-sun-and-atmosphere-shots.ts`
  with a `--lut-bump-check` flag that runs the Open Frontier noon
  + A Shau midday capture pair only. Reuse the cycle #12 capture
  framework — don't add a new script.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. Capture pre-bump baseline: switch to `master` (commit
   `be953420`), run capture, save as
   `artifacts/cycle-skylut-resolution-bump/playtest-evidence/pre-*.png`.
2. Capture post-bump from this cycle's merged head, save as
   `post-*.png`.
3. Visual diff: assert no banding bands visible in `post-*.png`;
   sample the horizon row of pixels and assert the gradient is
   monotonic with delta-per-pixel ≤ 4 (out of 255) across the visible
   band (the pre-bump case typically shows steps of ≥ 16 at bin
   boundaries).
4. Pixel-sample the recorded fog color and skybox color at the
   horizon line and assert they match within ±5%.
5. Mobile-emulation probes (Pixel 5, iPhone 12) hold within 10%
   of cycle #12's measured mobile baselines (29.02 / 28.88 avgFps).
6. Commit message: `docs(skylut): playtest evidence + capture script extension (skylut-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- Lint + tests + build green.
- 4 captures committed (2 pre + 2 post).
- Horizon-row gradient monotonic assertion passes on `post-*.png`.
- Fog/sky horizon color match within ±5%.
- Mobile probes inside 10% gate.
- Playtest doc + PLAYTEST_PENDING row landed.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- LUT bump produces a regression in fog color visible at any TOD
  in cycle #12's existing 27-capture set → halt; back out.
- TSL/CPU parity test fails with delta > 0.05 per channel → halt;
  back out (means a `bakeLUT` loop has a hardcoded literal that
  didn't pick up the dimension change).
- `combat120` p99 shifts > 0.5 ms in either direction → halt; the
  LUT bake is not supposed to be on the hot path. A shift means
  the bake is being re-entered per frame; fix that, not the bump.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no `src/systems/combat/**` touches.
- **No mandatory `terrain-nav-reviewer`** — no terrain or nav touches.
- Orchestrator reviews for: surface integrity, perf stability, parity
  test pass.
- **Optional perf-analyst pre-merge gate** — cheap to run, confirms
  the LUT bake is off the hot path.

## Acceptance Criteria (cycle close)

- Single PR merges `skylut-resolution-bump` + a small playtest PR.
- Open Frontier noon post-bump capture shows monotonic horizon
  gradient (no banding bands).
- A Shau midday flyover post-bump shows no "skybox edge through
  terrain" — the visible band the user reported is replaced by a
  smooth fog → sky transition.
- 4 Playwright captures committed under
  `artifacts/cycle-skylut-resolution-bump/playtest-evidence/`.
- `combat120` p99 stable ±0.5 ms vs cycle #12 close.
- Memory change documented in commit message (expected: ≤ +3 KB).
- `KB-SKY-LUT-BANDING` opened and closed in CARRY_OVERS.md in this
  cycle (zero-cycle entry, like KB-SKY-DEEP in cycle #12).
- No fence change.
- No new `WebGLRenderTarget`.

## Out of Scope

- Per-fragment TSL dome changes (cycle #12 already shipped them;
  any further work goes in a future sky cycle).
- AGX exposure recalibration (cycle #12 R2 already calibrated; this
  cycle does not re-tune).
- Cloud rendering changes (separate cycle).
- Skybox geometry changes (sphere dome stays; alternative
  approaches like screen-space sky live behind a future cycle).
- Behind-cloud sun occlusion, ADS-toward-sun glare (deferred per
  cycle #12).
- Per-preset `computeSunDirectionAtTime` elevation envelope sanity
  check (cycle #12 follow-up flag (b)) — record in playtest doc as
  observation; do not fix here.

## Open Questions (owner-default decisions pre-baked)

1. **Final LUT dimensions: 32×32 or 32×64?** **Default: 32×32.**
   Bump-and-measure; if Open Frontier midday still shows banding
   bands in post-bump capture, executor re-runs at 32×64 and records
   the delta. Owner can override pre-dispatch by editing this brief.
2. **Mobile-specific LUT size?** **Default: same dimensions on
   mobile.** Mobile gates on the existing 8 s cadence, not the LUT
   size. A different mobile size would re-introduce branch-by-device
   code that we just consolidated.

## Carry-over impact

- New ID: `KB-SKY-LUT-BANDING` (visual-quality follow-up to
  `KB-SKY-DEEP`). Cycle-open ID — opens at cycle launch, closes at
  cycle close, lives only as a history-log entry.

Net cycle delta on active carry-over count: 0.
