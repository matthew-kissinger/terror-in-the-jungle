# Task: tod-coherence-fixture-truth

Cycle: `cycle-2026-07-02-lighting-truth-and-shadows` (wave L1).
Manifest: [docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md](../CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md).

## Goal

Make the `check:tod-coherence` gate actually measure foliage, and make anchor
fallback fail loudly. The campaign manifest requires the instrument to land FIRST
— no lighting re-tune is trusted until the gate measures real foliage. Scope is
INSTRUMENT ONLY: no shading/material change, no fade-constant re-tune, no change
to the gate's advisory (Tier 2.5, non-blocking-CI) posture.

## Root cause of the 0.977-vs-0.810 artifact contradiction

The sweep anchors the foliage / npc / glb families on the projected screen
position of their live scene instances, then samples a tight box there and
reports `foliage=anchored`. The anchor scan reported `anchored` whenever ANY
instance projected on screen — even when the geometric-median anchor landed on
the terrain foreground at the very bottom screen edge.

Proof, straight from the committed evidence artifact
`artifacts/lighting-rig/tod-sweep/gate/curves.json` (2026-06-25 run,
`sourceGitSha 73448575`): at EVERY swept TOD the foliage anchor box was
`{x0:0.470, x1:0.540, y0:0.941, y1:1.000}` — screen y-centre 0.971, which is
INSIDE the terrain sample band (`terrain` = `y0:0.82 y1:0.98`) AND clamped hard
to the bottom edge (`y1 = 1.0`). The npc anchor sat at y=0.877, also inside the
terrain band. So the foliage corr 0.977 / rangeRatio 0.969 (and the npc corr
0.989) were **terrain-vs-terrain** — the ground under the cards, not the cards. A
false PASS.

Why two runs 4 days apart disagreed (0.977 PASS 2026-06-25 vs 0.810 FAIL
2026-06-29): the anchor is a function of which foliage instances streamed live in
that frame. Both runs "anchored", but the median landed on **different degenerate
foreground spots** depending on the live billboard `count` that frame (or one
fell back). Two degenerate terrain-vs-terrain readings do not have to agree —
the instrument was measuring streaming noise, not lighting. The
`BillboardNodeMaterial.ts:64-72` comment already recorded the smoking gun (bare
down-valley terrain, `rigLit*0.05` no-op probe left `foliage` luminance
unchanged); this task fixes the instrument so the numbers can be trusted.

## What changed

- **`scripts/tod-coherence-anchor.ts` (new, pure):** `evaluateAnchor` classifies
  a projected anchor as `anchored` (genuine mid-frame), `degenerate` (projected
  onto the terrain foreground / clamped to a screen edge), or `fallback` (no live
  instance). `isUnmeasuredAnchor` — degenerate + fallback are both UNMEASURED
  (terrain-vs-terrain); only `anchored` is real. Fully unit-tested without a
  browser.
- **`scripts/capture-tod-coherence-sweep.ts`:** (1) the median-anchor selector
  now PREFERS candidates that project above the terrain foreground band
  (`screen-y < terrain.y0`) so foliage/npc frame a genuine mid-frame cluster
  instead of the bottom-edge foreground; (2) an anchor is used as the sample
  region ONLY when it classifies `anchored` — a degenerate anchor is discarded
  (it would read terrain) and the family falls back to the fixed box tagged
  `degenerate`; (3) every family's anchor **world + screen position + on-screen
  instance count** is logged into the sample `notes` AND a structured `anchors`
  field in `curves.json` (auditable straight from the artifact).
- **`scripts/tod-coherence-gate.ts`:** new per-family `familyMeasured` status and
  a `<family>.measured` check. A hard-gated family (foliage, npc) that is
  UNMEASURED fails the gate LOUDLY ("instrument broken") with status
  `unmeasurable`, distinct from PASS/FAIL. Its corr/rangeRatio checks are still
  recorded for evidence but downgraded to `unmeasurable` so a terrain-vs-terrain
  number can never masquerade as a coherence pass. The npc-anchored check reuses
  the same provenance (a degenerate anchor now counts as NOT anchored). Backward
  compatible: an older `curves.json` without structured `anchors` is parsed from
  the legacy `notes` string, missing => `fallback`.
- **`scripts/tod-coherence-sweep-types.ts`:** `AnchorProvenance` /
  `AnchorProvenanceKind` types + optional `anchors` on `TodSample`.

## Tests

- `scripts/tod-coherence-anchor.test.ts` — anchor classification, including the
  literal 2026-06-25 degenerate box as a regression fixture.
- `scripts/tod-coherence-gate.test.ts` — new UNMEASURED cases: a degenerate
  foliage anchor whose fake terrain-vs-terrain corr ~0.99 must FAIL loudly; a
  fully-measured sweep passes; one degenerate TOD poisons the whole family.

## Post-fix sweep evidence (headless GPU, worktree, 2026-07-02)

`npm run check:tod-coherence` on `dist-perf`, exit code 1 (gate correctly FAILS):

- **npc fixture geometry fixed:** the teleport distance was hardcoded 120m; the
  honest instrument measured that landing at screen-y 0.877 — INSIDE the terrain
  foreground band (y0 0.82), so the "npc" row was reading terrain. The distance
  is now `cameraHeight / tan(pitch)` = 331m (the look-at ground point, screen
  centre). Post-fix the npc anchors at screen(0.500, 0.617) — GENUINE, clear of
  the terrain band — `familyMeasured.npc = true`. With a REAL npc reading the
  gate now reports npc corr **0.717** / rangeRatio **3.934 → FAIL** (a genuine
  low-sun impostor overshoot, NOT terrain-vs-terrain). The instrument went from
  "false-anchored terrain" to "genuinely measured real FAIL" — exactly the point.
- **foliage n=0 at every TOD (fixture gap, now honestly surfaced):** the scene
  scan finds ZERO on-screen billboard (`vegetationExposure`) instances at the A
  Shau XZ-origin fixture pose. Foliage falls back to the fixed box → `fallback` →
  UNMEASURED → gate FAIL ("instrument broken"). The fixed-box fallback reads corr
  **0.810** / rangeRatio **2.735** — see reconciliation below.

### Reconciliation of the 0.977-vs-0.810 contradiction (with evidence)

- 2026-06-29 CARRY_OVERS row: foliage corr **0.810** / rangeRatio **2.735** FAIL.
- Post-fix fixed-box fallback (this run): foliage corr **0.810** / rangeRatio
  **2.735** — an EXACT match. So the 0.810/2.735 numbers are the FIXED-BOX
  terrain-vs-terrain reading (the box at y0:0.55-0.72 that the
  `BillboardNodeMaterial.ts:64-72` comment already flagged as bare terrain).
- 2026-06-25 verdict.json: foliage corr **0.977** / rangeRatio **0.969** PASS —
  a DIFFERENT degenerate anchor: the box was pinned to `y0:0.941 y1:1.0`
  (bottom-edge terrain, inside the terrain band). A different terrain patch, a
  different terrain-vs-terrain number.
- **Conclusion:** neither run ever measured foliage. 0.977 was a degenerate
  bottom-edge anchor; 0.810 was the fixed-box fallback. Both terrain-vs-terrain,
  so both are meaningless as a foliage-coherence signal and free to disagree.
  This contradiction was poisoning the registry. Proposed CARRY_OVERS rewrite in
  the PR body reflects reality (foliage is UNMEASURED, not a "clamp-band FAIL").

## Known gap (handoff, not silently dropped)

Foliage still reads `n=0` — no billboard cards render at this fixture pose. The
instrument now refuses to fake it (fails loud) rather than reporting a false
number. Guaranteeing real on-screen foliage-card pixels needs either a foliage
cluster teleport (the npc-fixture pattern) or a pose/scenario that frames
streamed vegetation, plus GPU-sweep iteration. That is the natural next step for
this instrument; it is a fixture-population problem, not a classifier bug.

## Non-goals (per manifest)

Any shading/material change; any re-tune of the foliage fade constants (owned by
`task/tod-impostor-dynamic-mapping`); changing the gate's advisory posture.
