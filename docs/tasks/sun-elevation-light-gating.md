# task/sun-elevation-light-gating

Cycle: `cycle-2026-07-02-lighting-truth-and-shadows` (wave L2)
Manifest: [docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md](../CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md)
Reviewer: terrain-nav-reviewer

## Goal

Sunlight must DIE below the horizon and roll off believably at grazing angles —
the owner "the light goes through the terrain depending on where the sun is at"
symptom. Campaign fork resolution (approved): elevation-gated sun radiance; the
terrain horizon march feeds the DIRECT LIGHT term, not just surface color.

## Root cause (recon, re-verified against master after PR #491)

1. `LightingRig.deriveLightingRigState` fed the Hosek backend's `getSun` radiance
   to every consumer UNCONDITIONALLY. The backend crossfades to a dim cool moon
   below the horizon but never dies, so a sun behind a ridge (or fully set) still
   lit sun-facing slopes and foliage.
2. `TerrainMaterial.terrainLowSunOcclusionMask` (5-tap horizon march) only
   darkened terrain COLOR ~28% via `mix(color, color*vec3(0.28,0.36,0.44), mask)`
   — it never attenuated the direct light term, so ridge-shadowed slopes glowed.
3. The card families (foliage billboard, static-impostor foliage, NPC sprite) each
   read a private `RIG_LOW_SUN_FADE_*` band (defined on BillboardNodeMaterial,
   imported by the other two) — one shared curve among themselves, but a curve
   that diverged from terrain's low-sun response.

## Implementation

1. **Elevation gate at the rig level.** New `src/systems/environment/SunElevationGate.ts`
   owns one pure curve: `sunElevationGate(elevationRad)` — smoothstep 0 at/below the
   geometric horizon, 1 above the civil-twilight band, smooth monotonic in between.
   `deriveLightingRigState` multiplies `sunRadiance` by it (gated on the new
   `LightingRigConfig.sunElevationGate` flag). Because ALL direct-sun consumers read
   `lightingRigBindings.sunRadiance` (terrain scene lights via `rigSceneLightRadiance`
   -> moonLight color; foliage/impostor/NPC bindings), one multiply propagates the
   identical rolloff everywhere. The gate scales magnitude only — the backend's own
   dawn reddening is preserved (it multiplies, it does not re-tint).
2. **Horizon march -> direct light term.** Deepened the terrain occlusion multiply
   to a darker cool shadow floor (`vec3(0.16,0.23,0.33)`). Terrain is PBR
   (`output = albedo * light`) and the `lowSunOcclusion` mask is already
   direct-light-aware (weighted by shadow-facing nDotL + the ray-march), so a deeper
   multiply removes the blocked direct sun in proportion — a ridge shadow now reads
   as a real shadow, not a faint 28% tint. The cool bias is the retained cheap
   ambient-occlusion component. Single-line, net-zero LOC (TerrainMaterial is
   grandfathered at 1192). Dual path: the TSL colorNode is the WebGPU + WebGL2
   fallback expression the material already maintains.
3. **Family coherence.** Rebased the card-normal low-sun fade constants
   (`RIG_LOW_SUN_FADE_*`) onto the shared gate module as `SUN_CARD_FADE_*` +
   `sunCardLowSunFade`, so terrain and the card families now read ONE coordinated
   low-sun source. BillboardNodeMaterial re-exports the names for its two importers
   (StaticImpostorMaterial, CombatantMeshFactory) — no value change, no per-family
   re-tune; the shader expressions are unchanged. With the rig gate now killing the
   sun for terrain AND cards together below/near the horizon, the supplemental fade
   only corrects the card-normal overshoot in the grazing band above the gate.
4. **Kill-switch.** `LightingRigConfig.sunElevationGate` (default ON, owner sign-off
   = the manifest per AGENTS.md U3). Flip to `false`
   (`window.__lightingRig.sunElevationGate = false`) to restore the ungated backend
   sun radiance exactly. Independent of `enabled`; inert on the OFF (legacy) path.

## Critic couplings (verified)

- **SkyCloudSystem / cloud rendering:** clouds are colored inside the Hosek backend's
  analytic sky model using the backend's OWN internal sun, not the rig
  `sunRadiance` binding. My gate only scales the rig binding (a copy of `getSun`),
  so cloud rendering is unaffected — correct, clouds sit above terrain and should
  not follow terrain occlusion. No fix needed.
- **muzzle/explosion `FLAME_BLOOM_GAIN=2.2` (NapalmFireSystem):** the boosted colors
  are on `AdditiveBlending` materials — self-emissive, NOT rig-lit. The gate scales
  only `sunRadiance` + scene lights, which these flames do not consume, so flashes
  bloom identically at dawn and noon. Reasoning confirmed; no change.
- **Sun disc (#491):** `updateSunDisc` reads `backend.getSun` directly (ungated), owned
  by the sibling task. My gate does not touch it. No interference.

## Non-goals (untouched)

Shadow camera / frustum / casters (sibling task/shadow-single-map-truth owns
`MIN_SUN_Y` and the shadow-follow); sun DISC visuals (#491); TOD->impostor artistic
curve mapping (wave L3); post-stack.

## Validation

- `npm run typecheck` — PASS
- `npm run lint` — PASS (only the pre-existing ZoneManager.test.ts warning)
- `npm run lint:budget` — PASS (0 failures; TerrainMaterial net-zero at 1192)
- `npm run test:run -- src/systems/environment/SunElevationGate.test.ts src/systems/environment/LightingRig.test.ts` — PASS (33 tests)
- `npm run test:run -- <terrain/impostor/billboard/combatant/atmosphere tests>` — PASS (185 tests)
- `npm run build` — PASS

## Proposed PLAYTEST_PENDING row

dusk ridge walk — stand in a valley with the sun setting behind a ridge: no direct
sunlight on your slope once the ridge blocks it, no glowing sun-facing slopes after
sunset, dawn/dusk foliage darkens WITH the terrain (not on its own curve), midnight
genuinely dark (but readable via the night floor), kill-switch
(`window.__lightingRig.sunElevationGate = false`) restores the old look.
