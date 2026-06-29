# Playtest memo — cycle-2026-06-28-terrain-vegetation-asset-defects (Phase 3, Field Readiness)

> **Automated gates complete; owner visual walk pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 3).
> Merged on CI green + terrain-nav-reviewer APPROVE; perf A/B PASS. Phase 3 is
> terrain/vegetation/asset defect repair — the fixes are unit/behavior-tested;
> the *look* (no trees on the runway/trail, no coconut pop, sun reads as a body)
> is the owner's call on `/gallery` + in-world.

## What shipped (7 PRs, all merged to master, all `fence_change: no`)

| Task | PR | Merge | Change |
|---|---|---|---|
| veg-poi-exclusion | [#435](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/435) | `223cfc40` | hero scatterer now respects POI exclusion zones (`GLBHeroScatterer.setExclusionZones` + `isExcluded` gate, mirroring `GroundCardScatterer`) — no more hero trees on the airfield runway |
| vegetation-density-retune | [#434](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/434) | `083865c0` | thinned the two over-dense biomes: bamboo-thicket 2.8→1.8, riverbank coconut 1.25→0.7 (config-only) |
| coconut-card-crossfade | [#437](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/437) | `fd46642c` | ported the `transitionFadeMeters` opacity blend into `GroundCardNearMeshTier` — coconut palm no longer hard-pops mesh↔card (default fade 28m) |
| structure-import-corruption-fix | [#438](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/438) | `9acf18d1` | aid-station double-root-yaw fixed at the importer (`stripRedundantRootYaw`) + re-imported; barracks-tent verified byte-clean (not corrupt) |
| sun-disc-banding-fix | [#436](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/436) | `42abba16` | band-limited the sun-disc sine terms (×317→48) across TSL/GLSL/CPU mirrors — kills the LED-dot lattice, keeps a warm body |
| route-corridor-exclusion | [#440](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/440) | `f70f1967` | veg-exclusion corridors traced down each compiled route centerline → both scatterers skip the gray "trail" patches |
| asset-reroll-requests | [#439](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/439) | `3d0cf275` | doc-only: marked UH-1 Huey + A-1 Skyraider re-rolls DONE (`f8c3518c`); filed B-52D fuselage-aspect + A-37 scale re-roll advisories |

## Automated evidence

- **veg-poi-exclusion + route-corridor-exclusion** are behavior-tested against the
  scatterers' real circular `isExcluded` predicate (`dx²+dz² ≤ r²`): a candidate
  on the runway / route centerline is excluded while one well off it is not.
  terrain-nav-reviewer APPROVE-WITH-NOTES on both; route-corridor's full
  production wiring (compiler → compositor → `TerrainSystem.setExclusionZones` →
  both scatterers) was traced and confirmed not dead-code.
- **coconut-card-crossfade**: terrain-nav-reviewer APPROVE-WITH-NOTES after a
  re-rule; the `onNearMeshLoaded` discard guard re-keyed so fade-path loads are
  not discarded, all four deletion paths route through `disposeEntry`, fade
  materials cloned once at promote. Behavior test asserts the `batch.hidden`
  false→true→false trajectory + a `disposeInstance`-counting fake.
- **sun-disc-banding-fix**: CPU-mirror test asserts the max sine frequency is
  band-limited below the lattice threshold and the core stays warm/bright.
- **structure-import-corruption-fix**: importer `stripRedundantRootYaw` guarded by
  a structural test; barracks-tent confirmed byte-identical to source (the
  reported "jumble" was not corruption). Command-tent shares the aid-station
  defect class — flagged out-of-scope (advisory in the PR).
- **combat120 perf A/B PASS** (same-machine, seed 2718): pre-Phase-3 `91355b59`
  steady-state p99 **40.70ms** → post-Phase-3 `1b561ccd` **31.20ms** = **Δ −9.50ms
  (−23.34%)** — an *improvement*, far on the safe side of the +5% HALT line.
  **Reachability caveat:** vegetation scatter is dormant in `ai_sandbox`
  (`veg=0/0 chunks=0` across all 87 samples in both runs), so #434/#435/#437/#440
  never execute there — the only Phase-3 code that runs in the scenario is #436
  (a shader-term *reduction*) + #438 (asset data). The −23% is dominated by
  machine/GC noise; the gate is satisfied by both the delta direction and
  reachability. Absolute ~31-40ms is non-quiet-machine (`measurement_trust:warn`),
  not baseline-grade; the A/B delta is the trustworthy signal.

## What the owner should walk (the actual gate — `/gallery` + in-world A Shau / Open Frontier)

1. **No trees on the airfield** — fly/walk to the A Shau runway: hero trees no
   longer grow on the paved surface.
2. **No trees down the trail centerline** — find a gray strategic "trail" patch:
   the centerline reads as a cleared path, not a tree-lined one.
3. **Vegetation density** — bamboo thickets + riverbank coconut groves read
   thinner / less wall-of-green, without looking bald.
4. **Coconut palm LOD** — approach/retreat from a coconut palm at the card↔mesh
   transition band (~28m): the swap crossfades, no hard pop.
5. **Sun disc** — look at the sun: a warm solar body, not a screen of LED dots.
6. **Structures** (`/gallery`) — `aid-station.glb` has its full roof and correct
   orientation; `barracks-tent.glb` reads un-jumbled.

## Notes

- terrain-nav-reviewer gated 3 PRs (veg-poi via R1, coconut-card, route-corridor);
  all APPROVE / APPROVE-WITH-NOTES.
- One CI hiccup on route-corridor (#440): the `lint:budget` Source-budget gate
  (separate from the `npm run lint` eslint step) FAILed because the +3 LOC join
  block pushed grandfathered `TerrainFeatureCompiler.ts` 764→767. Resolved by the
  sanctioned ratchet rebase (snapshot 764→767); no new carry-over (within-cycle,
  the file's split-debt is already tracked in the grandfather entry). Not part of
  the walk.
- Reviewer follow-ups (non-blocking): coconut-card `needsUpdate` micro-cost is
  superseded for `coconut-palm` by the mesh-near / octa-far route;
  route-corridor edge-sliver coverage + `map_only` latent over-clear (no
  production config uses `map_only`).
- Open advisories filed for the owner's next Kiln pass: B-52D fuselage aspect,
  A-37 scale (`docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md`).
