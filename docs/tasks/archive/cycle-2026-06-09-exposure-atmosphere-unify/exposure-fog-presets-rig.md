<!-- cycle-2026-06-09-exposure-atmosphere-unify (Phase 3 of CAMPAIGN_2026-06-09-lighting-rig) -->
# exposure-fog-presets-rig

Phases 1-2 put every material family on the rig (terrain+GLB corr +0.94,
foliage corr 1.000 on the fixed instrument). Phase 3 finishes the
atmosphere half: scene fog driven from the rig, the exposure policy
reconciled and documented in one place, and the scenario presets
re-expressed as trims over the physical baseline — so Phase 4 can delete
the legacy shaping with nothing left depending on it. Spec:
`docs/rearch/LIGHTING_RIG_SPIKE_2026-06-09.md` §3.

## Files touched

- `src/systems/environment/AtmosphereSystem.ts` (+ test) — rig-path scene
  fog (applyFogColor's legacy shaping bypassed when ON; fog color/density
  from the rig's fogColor/fogDensity); exposure policy reconciliation
- `src/systems/environment/LightingRig.ts` (+ test) — exposure policy:
  decide and DOCUMENT the final split between in-shader rig exposure and
  AGX `toneMappingExposure` (memo says energy once at AGX; the prototype
  multiplies in-shader — either implement the memo split or document the
  in-shader choice as final with rationale; no double application)
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts`
  (+ test) — presets as trims on the rig path: each preset's color stacks
  must not fight the rig (rig path reads preset TRIM fields; legacy
  absolute stacks untouched for the OFF path)
- `src/systems/environment/WeatherAtmosphere.ts` — only if weather fog
  writes collide with the rig fog path (trace; keep weather authority over
  intensity per the Phase 1 contract)

## Scope

1. Rig-path scene fog: `scene.fog` color/density derived from the rig
   terms; horizon fog matches the Hosek sky at all 8 TODs (no fog-line
   seam at dawn/dusk). Legacy fog path byte-identical when OFF.
2. Exposure policy: one documented application of energy (no family gets
   exposure twice); add a regression test asserting the policy (e.g. rig
   scene-light radiance and in-shader terms cannot both carry exposure).
3. Presets: on the rig path each scenario preset contributes bounded trims
   (tint/intensity multipliers) over the rig baseline instead of absolute
   color stacks; verify per-preset with the sweep across the 5 scenarios
   at 4 key TODs (dawn/noon/dusk/midnight) — paste a per-scenario summary
   (terrain+foliage corr per scenario; no scenario may break the band).
4. A/B `capture:tod-sweep` on A Shau (`--label=p3-off/p3-on --rig-on`):
   bands hold (foliage corr ≥ 0.92, rangeRatio [0.6,1.6]); fog-vs-sky
   horizon parity within the existing ±5% check pattern where measurable.

## Non-goals

- No legacy deletion, no flag-default flip (Phase 4).
- No new weather types; weather keeps intensity authority.
- No billboard/NPC/terrain shader changes (Phases 1-2 landed).
- No water terms (still deferred).

## Acceptance

- [ ] p3-on tables hold the bands; per-scenario summary shows no preset
      breaks coherence; fog/sky horizon reads continuous at dawn/dusk.
- [ ] Exposure policy documented in LightingRig with a regression test.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: Phases 1-2 (merged: #371 #376 #378).
- Feeds: Phase 4 (`tod-coherence-gate`, `legacy-path-deletion`,
  `lighting-ship`).
