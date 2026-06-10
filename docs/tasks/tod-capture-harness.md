<!-- cycle-2026-06-09-lighting-rig-spike R1 -->
# tod-capture-harness

Owner verdict on prod: foliage holds near-constant lighting across the
day/night cycle while terrain swings; dawn terrain reflects near-white. This
task builds the measurement instrument the whole lighting-rig campaign is
judged with: a scripted time-of-day sweep that captures all material families
in one frame and computes per-family relative-luminance curves. See
`docs/CAMPAIGN_2026-06-09-lighting-rig.md` Phase 0.

## Files touched

- New capture script under `scripts/` named `capture-tod-coherence-sweep`
  (extends the framework of `scripts/capture-sun-and-atmosphere-shots.ts`,
  reusing `scripts/preview-server.ts` and the `WorldBuilder.forceTimeOfDay`
  mechanism — absolute-hour → preset-relative conversion documented in that
  script's header)
- New npm script `capture:tod-sweep` in `package.json`

## Scope

1. Fixed camera fixture in one scenario (default `ashau`) framing, in known
   screen regions simultaneously: terrain ground, billboard foliage, an NPC
   impostor, and a GLB prop/vehicle. Document the region boxes as constants.
2. Sweep 8 absolute TODs (00/04/06/08/12/17/19/21h) via forceTimeOfDay;
   one PNG per TOD under `artifacts/` in a `lighting-rig/tod-sweep/<label>/`
   folder (gitignored; `--label` arg, default `baseline`).
3. Per TOD, compute mean relative luminance per family region (sharp pixel
   sampling, pattern from the night-red assertion in
   `scripts/capture-sun-and-atmosphere-shots.ts`); write `curves.json`:
   per-family luminance-vs-TOD arrays + pairwise correlation vs terrain.
4. Print a coherence summary table (family, min, max, range ratio vs terrain,
   correlation). No pass/fail gate yet — this is evidence capture, not CI.
5. Headless-safe: best-effort per shot (log-and-continue on scenario load
   failure), same posture as the existing capture scripts.

## Non-goals

- No lighting/material changes of any kind (read-only on `src/`).
- No CI wiring (that is Phase 4 `tod-coherence-gate`).
- No WebGL/WebGPU parity matrix — single renderer mode is enough for curves.

## Acceptance

- [ ] Invoking the new package script (name: capture:tod-sweep) produces 8
      PNGs + `curves.json` + summary table on this machine (RTX 3070, WebGPU).
- [ ] `curves.json` shows the known defect signature: foliage range ratio
      far below terrain's (the [0.40, 0.78] clamp band) — i.e. the
      instrument detects the bug we built it to measure.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Blocks: `rig-prototype` (its A/B evidence runs this harness with
  `--label=rig-on` / `--label=rig-off`).
