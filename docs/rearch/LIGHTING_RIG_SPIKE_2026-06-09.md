# Lighting Rig Spike — Design Memo (Phase 0)

> **Date:** 2026-06-09
> **Cycle:** cycle-2026-06-09-lighting-rig-spike
> **Task brief:** [docs/tasks/lighting-audit-memo.md](../tasks/lighting-audit-memo.md)
> **Campaign:** [docs/CAMPAIGN_2026-06-09-lighting-rig.md](../CAMPAIGN_2026-06-09-lighting-rig.md)
> **Status:** PROPOSED — ratifies the campaign's target principles into a
> concrete rig spec. No code changed by this task.

This memo is the campaign's contract. It inventories every consumer of the
canonical lighting snapshot and every clamp / compression / emissive hack /
second authority in the path; ratifies a unified rig spec (state fields, units,
shared TSL binding, wrapped-Lambert form); fixes the exposure policy; maps each
inventory item to the phase that absorbs or deletes it; and proposes the
numeric coherence band the time-of-day (TOD) harness enforces.

## 0. Verdict

The campaign finding holds and is **stronger than stated**: there is one
canonical state (`AtmosphereLightingSnapshot`, built in
`src/systems/environment/AtmosphereSystem.ts`) but **five** independent
re-interpretations of it — the four material families plus the capture tool —
and **three** separate energy clamps stacked in series before any material is
even reached. **GO recommended for the rework** (subject to the owner's A/B
review of the rig-prototype captures). A tune cannot fix this: the divergence is
structural (per-family clamp bands + a second light authority), not parametric.

## 1. Inventory — snapshot consumers + energy hacks

### 1a. The canonical state and its build path

| Item | File | Note |
|---|---|---|
| `AtmosphereLightingSnapshot` interface + `refreshLightingSnapshot()` | `src/systems/environment/AtmosphereSystem.ts` | The one canonical per-frame state. Built each frame; re-derived on every `getLightingSnapshot()` call. |
| `shapeDirectLightForRenderer(color, sunY)` | `src/systems/environment/AtmosphereLightingColor.ts` | **HACK 1 (the dawn white-out).** Compresses the Hosek sun color to a 0.78 channel ceiling, then at low sun *lerps toward a fixed cool neutral* (`luma * [0.72, 1.02, 1.20]`). Converts warm dim dawn into bright neutral white. |
| `compressSkyRadianceForRenderer(color, 0.84)` for sky/ground; `(color, 0.74)` for fog | `src/systems/environment/AtmosphereSystem.ts` | **HACK 2.** Peak-normalizes zenith/horizon radiance to a fixed component ceiling so noon does not blow out the hemisphere fill / fog under WebGPU. A second, independent energy clamp. |
| `HEMISPHERE_GROUND_DARKEN = 0.55`, `NIGHT_*` fills, `lowSunAmbientBlend()` | `src/systems/environment/AtmosphereSystem.ts` | Ground-bounce darken + bespoke night ambient/direction substitution + a night-blend ramp. Per-frame artistic shaping baked into the snapshot itself. |

### 1b. Family consumers (the divergent models)

| # | Consumer | File | Lighting model + the hack |
|---|---|---|---|
| 1 | **Terrain** (`MeshStandardNodeMaterial`, PBR) | `src/systems/terrain/TerrainMaterial.ts` | Scene lights + **HACK 3 (night-fill emissive):** `createTerrainNightFillNode` adds `atmosphereNightFillColor * atmosphereNightFillStrength` as **emissive**. Plus `terrainLowSunOcclusionMask` (terrain-only horizon ray-march, its own sun-elevation inputs) and a `0.88` roughness floor + `applyNightTerrainColorStabilizer` (a red/warm-excess cooler). |
| 1b | Terrain rig inputs assembled | `src/systems/terrain/TerrainSystem.ts` (`setAtmosphereLighting`) | Re-derives `nightFillStrength = nightBlend * 0.38`, `nightFillColor` (ambient lerp toward sky/ground), and `lowSunOcclusionStrength` from the snapshot — a per-family re-shaping layer between snapshot and material. |
| 2 | **Foliage / billboards** (`MeshBasicNodeMaterial`, unlit) | `src/systems/world/billboard/BillboardNodeMaterial.ts` | **HACK 4 (the [0.40, 0.78] clamp):** `createBillboardLightingNode` blends a fixed hemisphere term then `clamp(light, minVegetationLight=0.40, maxVegetationLight=0.78)`. Foliage cannot go darker than 40% (midnight) or brighter than 78% (dawn). Plus a capture-baked `captureSun = (0.35,0.65,0.68)` ndotl, `HUMID_JUNGLE_VEGETATION_EXPOSURE=0.82`, saturation/gamma trims. |
| 3 | **NPC impostors** (`MeshBasicNodeMaterial`, unlit) | `src/systems/combat/CombatantShaders.ts` | **HACK 5 (the second authority):** `resolveNpcAtmosphereSnapshot` **re-scans `scene.children`** for `HemisphereLight` / `DirectionalLight`, averages their colors weighted by intensity, and derives its own `lightScale` (`NPC_LIGHT_SCALE_*`). Never reads the canonical snapshot at all. |
| 4 | **GLBs** (vehicles, props, close NPCs; standard PBR) | renderer lights set in `applyToRenderer()` (`src/systems/environment/AtmosphereSystem.ts`) | The only family with no per-material hack — lit by the three scene lights (`moonLight` / `hemisphereLight` / `ambientLight`) the snapshot drives. This is the de-facto reference for "PBR truth." |

### 1c. Wiring points + the extra consumer the manifest missed

| Item | File | Note |
|---|---|---|
| Per-frame snapshot pull → terrain + billboard fan-out | `src/core/SystemUpdater.ts` (Billboards block) | `getLightingSnapshot()` → `terrainSystem.setAtmosphereLighting()` and copies `directLightColor`/`skyColor`/`groundColor` into the billboard struct. The single per-frame update point. |
| Billboard uniform upload (`sunColor`/`skyColor`/`groundColor`/`lightingEnabled`) | `src/systems/world/billboard/BillboardBufferManager.ts` | Copies the struct into material uniforms; **also copies `scene.fog.color` straight into the billboard `fogColor` uniform** — a second fog read parallel to the snapshot's `fogColor`. |
| NPC uniform upload | `src/systems/combat/CombatantRenderer.ts` → `updateShaderUniforms` | Calls the scene-scan path each frame against `this.scene`. |
| **Capture tool (5th consumer, BEYOND the manifest)** | `scripts/capture-sun-and-atmosphere-shots.ts` | Already calls `getLightingSnapshot()` + `setAtmosphereLighting()` and drives `forceTimeOfDay`. It is the precursor the TOD harness should reuse/extend, not reinvent. |
| Renderer exposure (AGX) | `src/core/GameRenderer.ts` | `toneMapping = AgXToneMapping`, `toneMappingExposure = 1.0`. The single global energy stage. AGX is a keeper. |
| Sky radiance source (Hosek-Wilkie) | `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` | `getSun`/`getZenith`/`getHorizon` return linear radiance already scaled by `preset.exposure`. The physical backend. A keeper. |

## 2. Rig spec — the unified lighting state

**New module:** a new module under `src/systems/environment/` named
**LightingRig** (proposed exported type `LightingRigState`, factory
`createLightingRigState`). It is derived **once per frame** inside
`AtmosphereSystem.update()` at the existing `World.Atmosphere.LightFog` marker —
the same point `refreshLightingSnapshot()` runs today — so there is exactly one
authority and one update point. `AtmosphereLightingSnapshot` becomes a thin
projection of the rig during migration, then is retired in Phase 4.

### 2a. State fields + units

All colors are **linear radiance** (NOT compressed presentation colors). The
rig carries energy honestly and lets exposure (Section 3) handle brightness.

| Field | Type | Unit / meaning |
|---|---|---|
| `sunDirection` | vec3 (normalized) | World-space direction toward the sun. |
| `sunRadiance` | vec3 | Linear RGB radiance of the direct (sun/moon) term, from `getSun`, **uncompressed**. Falls off with sun elevation in the rig, not via a channel ceiling. |
| `skyIrradiance` | vec3 | Linear RGB upper-hemisphere (zenith-weighted) irradiance, from `getZenith`. Drives the sky half of the wrapped-Lambert ambient. |
| `groundIrradiance` | vec3 | Linear RGB lower-hemisphere irradiance — horizon (`getHorizon`) scaled by a ground-albedo bounce factor. |
| `ambientRadiance` | vec3 | Residual uniform fill (night-floor moon/skyglow term). The night floor lives here (Section 3), not in emissive/clamps. |
| `sunElevation` | float | `asin(sunDirection.y)` in radians. The single driver for horizon occlusion + low-sun falloff (replaces the per-family sun-Y math). |
| `fogColor` | vec3 | Linear fog color derived from `groundIrradiance` (horizon), pre-exposure. |
| `fogDensity` | float | Per-scenario base × weather multiplier (unchanged ownership). |
| `daylightFactor` | float [0,1] | Smooth day scalar, retained for systems that dim authored highlights. |

### 2b. Shared TSL binding API

One shared uniform set built from `uniform(...)` nodes (the TSL primitive in
`.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md`), constructed once by
the rig module and **handed by reference** to each material family so all
families read the identical node objects:

```
rig.bindings = {
  sunDirection:    uniform(new THREE.Vector3()),
  sunRadiance:     uniform(new THREE.Color()),
  skyIrradiance:   uniform(new THREE.Color()),
  groundIrradiance:uniform(new THREE.Color()),
  ambientRadiance: uniform(new THREE.Color()),
  sunElevation:    uniform(0),
  fogColor:        uniform(new THREE.Color()),
  fogDensity:      uniform(0),
}
```

The rig updates these uniforms in place each frame (`.value.copy(...)`).
Material families import the bindings and compose their `colorNode` against
them — no per-family color objects, no `scene.children` scans, no struct
copies in `SystemUpdater`.

### 2c. Wrapped-Lambert form (unlit-family migration)

Foliage + NPC impostors move off their bespoke models to the **same** diffuse
math, evaluated against the rig terms. Wrapped Lambert softens the terminator
for foliage cards / impostors that lack true geometric normals:

```
wrap  = 0.5                       // softens terminator; artistic trim
nl    = max(dot(N, sunDirection), -wrap)
diff  = (nl + wrap) / (1 + wrap)  // wrapped Lambert, [0,1]

// Hemisphere ambient: lerp ground↔sky irradiance by the up-facing factor.
hemi  = mix(groundIrradiance, skyIrradiance, 0.5 + 0.5 * N.y)

lit   = albedo * (hemi + sunRadiance * diff) + ambientRadiance
```

For billboards `N` is the camera-facing card normal (or the impostor normal map
when present); for NPC impostors the captured impostor normal. The **same**
`sunRadiance` / `skyIrradiance` / `groundIrradiance` terrain consumes feed this,
so the families track terrain by construction. Existing clamp/exposure constants
(`minVegetationLight`, `maxVegetationLight`, `vegetationExposure`) survive only
as **documented artistic trims** with defaults, never as the lighting mechanism.

## 3. Exposure policy

- **Energy is handled exactly once, at AGX.** `GameRenderer` keeps
  `AgXToneMapping`; the global `toneMappingExposure` becomes the single
  brightness control. Remove the three mid-pipeline compressions
  (`shapeDirectLightForRenderer` neutral-lerp, `compressSkyRadianceForRenderer`
  on sky/ground/fog, billboard exposure-as-mechanism). Radiance reaches the
  tonemapper uncompressed.
- **TOD-aware exposure (Phase 3).** A single exposure curve as a function of
  `sunElevation` (and scenario preset) replaces the per-material brightness
  compensation. One curve for the whole scene — never per-family.
- **Night floor lives in `ambientRadiance`, here, once.** The terrain night-fill
  emissive, the billboard 0.40 clamp floor, and the NPC `lightScale` floor are
  three different night floors today; they collapse into the rig's
  `ambientRadiance` term + the exposure curve's low end. Midnight foliage is
  then *allowed* to be dark (the owner's complaint), bounded only by the one
  ambient floor.
- AGX and the Hosek-Wilkie backend are **keepers** — explicitly not re-litigated.

## 4. Migration order + deletion list

| Inventory item | Absorbed/deleted in | Action |
|---|---|---|
| LightingRig module + per-frame derive | Phase 1 `lighting-rig-state` | NEW. One authority, one update point. |
| `shapeDirectLightForRenderer` (HACK 1) | Phase 1 build it out of the rig path; **deleted** Phase 4 `legacy-path-deletion` | Kept callable until Phase 4 so nothing else breaks mid-migration. |
| `compressSkyRadianceForRenderer` (HACK 2) | Phase 1 `scene-light-unification` drives lights from rig; **retired** Phase 3 `tod-exposure` | The hemisphere/fog ceilings dissolve once exposure owns energy. |
| Terrain night-fill emissive (HACK 3) | Phase 1 `terrain-rig-migration` | Replace emissive with the rig's `ambientRadiance`/moon term; **delete** in Phase 4. |
| Terrain horizon occlusion bespoke inputs | Phase 1 `terrain-rig-migration` | Keep the effect; re-drive from `rig.sunElevation`. |
| `TerrainSystem.setAtmosphereLighting` re-shaping | Phase 1 `terrain-rig-migration` | Collapses into the rig; terrain consumes bindings directly. |
| Billboard [0.40, 0.78] clamps + fixed hemisphere blend (HACK 4) | Phase 2 `billboard-rig-migration` | Replace with wrapped-Lambert vs rig; clamps demoted to trims. |
| Billboard parallel `scene.fog.color` read | Phase 2 `billboard-rig-migration` | Drive `fogColor` from the rig binding (single fog authority). |
| NPC `resolveNpcAtmosphereSnapshot` scene scan (HACK 5) | Phase 2 `npc-impostor-rig-migration` | **Delete the scan.** Consume rig bindings; match billboard response. |
| Effects/UI-world meshes, water-era leftovers | Phase 2 `effects-prop-pass` | Rig-consume or explicit unlit; no orphan snapshot readers. |
| Global TOD exposure + fog/sky coherence + preset retune | Phase 3 | Exposure curve, fog from rig, presets as trims over the physical baseline. |
| TOD coherence gate (Section 5) | Phase 4 `tod-coherence-gate` | Harness becomes a scripted check with committed tolerances. |

**Flagged: items the campaign manifest did not name.**
1. **Capture tool is a 5th snapshot consumer** (`scripts/capture-sun-and-atmosphere-shots.ts`) — it must migrate with the snapshot or it silently captures stale state. The TOD harness should extend it, not duplicate it.
2. **Billboard has a parallel fog authority** (`BillboardBufferManager` reads `scene.fog.color` directly) — not in the four-family table; fold into Phase 2.
3. **`TerrainSystem.setAtmosphereLighting` is a per-family re-shaping layer** between snapshot and material — a sixth shaping site distinct from the material itself; absorb in Phase 1.
4. **There are THREE energy clamps**, not the one the manifest highlights: the dawn-neutral lerp, the sky/ground/fog ceilings, and the billboard clamp band. Phase 3 must verify all three are gone, not just HACK 1.

## 5. Coherence band

The TOD harness frames terrain + foliage + NPC impostor + a GLB prop together,
captures at ~8 TODs, and computes a per-family **relative-luminance curve**
`L_family(t)` (mean luminance of that family's pixels, normalized to its own
noon value). Terrain is the reference. Proposed committed tolerances:

- **Pearson correlation** of each non-terrain family's normalized luminance
  curve against terrain's, across the 8 TODs: **r ≥ 0.92**. (Families must
  brighten/darken *together*; this is what SOL-1's channel gates never checked.)
- **Per-TOD range ratio:** at every captured TOD, each family's normalized
  luminance must sit within **[0.6×, 1.6×]** of terrain's normalized luminance.
  This is the band that the [0.40, 0.78] foliage clamp violates at the extremes
  today (midnight foliage ~0.40 vs terrain →~0.1; dawn foliage capped 0.78 vs
  terrain white-out >1.0).
- **Dawn white-out guard:** terrain mean luminance at the dawn TOD must be
  **≤ 0.85** (no near-white) — a direct assertion against HACK 1's failure mode.

Phase exit gates tighten toward `r ≥ 0.95` / `[0.7×, 1.4×]` once all families
are migrated (Phase 2 exit), with the looser band above as the floor a
regression must not cross. Numbers are the harness's committed starting
tolerances; the rig-prototype A/B sweep calibrates the final committed values
the owner ratifies at the Phase 0 gate.
