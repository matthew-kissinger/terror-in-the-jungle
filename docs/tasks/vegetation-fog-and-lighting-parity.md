# vegetation-fog-and-lighting-parity: vegetation reacts to fog/lighting differently than terrain

**Slug:** `vegetation-fog-and-lighting-parity`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — visual coherence; vegetation and terrain should read as the same world.
**Playtest required:** YES.
**Estimated risk:** medium — likely shader-include alignment between two material paths.
**Budget:** ≤ 200 LOC.
**Files touched:**

- Investigate: every vegetation material setup, every terrain material setup. Compare the fog include + lighting include each uses.
- Modify: the vegetation material to share the terrain's fog/lighting includes (or vice versa, whichever is the canonical home).

## Symptoms (orchestrator playtest 2026-04-20)

User reported: "the vegetation seems affected by lighting and other effects more differently than the vegetation [than the terrain]." (Read as: vegetation responds to fog/lighting differently from terrain.)

This is plausible because cycle-2026-04-20 added:
1. Per-frame sky-driven `scene.fog.color` mutation via `AtmosphereSystem.applyFogColor` (PR #103).
2. Per-frame `moonLight.color` + `hemisphereLight.color/groundColor` updates (PR #104).

If the vegetation material uses Three.js's stock `fog_fragment` include, it picks up `fog.color` from the same uniform terrain reads. **Should be parity by default.** So the symptom suggests either:
- Vegetation uses a custom shader that doesn't pull from `fog.color` correctly (e.g. samples a different uniform, or the include order means it reads a stale uniform).
- Vegetation has a separate ambient/light setup (e.g. a custom `MeshBasicMaterial` with no light response) so it doesn't track the new hemisphere/sun colors.
- Vegetation is on a different render order / pass that doesn't pick up the renderer's per-frame light update.

## Required reading first

- `src/systems/terrain/TerrainFeatureCompiler.ts`, `src/systems/terrain/ChunkVegetationGenerator.ts` — vegetation setup.
- `src/systems/assets/ModelDrawCallOptimizer.ts` — instanced model materials.
- `src/systems/combat/CombatantMeshFactory.ts` — combatant sprites (same family of issue).
- The terrain shader/material — find via `Grep MeshStandardMaterial src/systems/terrain/` or whichever pattern the project uses.
- `src/systems/environment/AtmosphereSystem.ts` `applyToRenderer` (lights) and `applyFogColor` (fog).

## Hypothesis (verify)

Most likely cause: vegetation uses `MeshBasicMaterial` (no lighting) while terrain uses `MeshLambertMaterial` / `MeshStandardMaterial` (lighting). The atmosphere's hemisphere/sun color updates affect lit materials only — basic materials look the same regardless of TOD. So at noon vegetation looks "right" but at dawn vegetation stays bright while terrain darkens.

If true, the fix is: switch vegetation to a lighting-aware material (cheapest is `MeshLambertMaterial` with `fog: true`), accepting the small per-frame cost. OR write a minimal custom shader that samples zenith/horizon and does a cheap hemispheric tint.

## Steps

1. Reproduce: `npm run dev`, switch between scenarios; observe whether vegetation appears equally lit at dawn vs noon vs dusk while terrain tracks.
2. Read each material setup; identify the divergence.
3. Pick the cheapest fix that gives parity.
4. Verify perf doesn't regress (vegetation has thousands of instanced sprites; even small material changes can move budget).

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/vegetation-fog-and-lighting-parity/`:

- `combat120-vegetation-noon-master.png` and `_fixed.png`
- `ashau-vegetation-dawn-fixed.png` — vegetation should darken with terrain, not stay bright.
- `tdm-vegetation-dusk-fixed.png` — same.

## Exit criteria

- Vegetation visibly tracks the same lighting / fog as nearby terrain across all 5 scenarios.
- `combat120` perf smoke within WARN bound (vegetation count hasn't changed; only material tweak).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not redesign vegetation rendering broadly.
- Do not touch the alpha-edge fix (separate task).
- Do not switch to PBR / `MeshPhysicalMaterial`.

## Hard stops

- Fence change → STOP.
- Material change blows perf budget by > 5% in `combat120` → STOP, find a cheaper match.
