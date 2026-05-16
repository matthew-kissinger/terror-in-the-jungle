# TSL shader cost audit (R1 — `cycle-2026-05-16-mobile-webgpu-and-sky-recovery`)

Last verified: 2026-05-16

User-observable gap surfaced: **KB-MOBILE-WEBGPU** — mobile playability tanked post-KONVEYER-merge. The two surface candidates this memo addresses are (a) per-fragment TSL cost on the WebGL2 fallback path that mobile lands on and (b) anything new on the WebGL2 path that the pre-merge WebGL renderer never had to pay.

## TL;DR

The post-merge production runtime ships **three** TSL node materials. There are no others — sky, water, weather, effects, helicopters, weapons, vehicles, and all UI overlays remain on classic `MeshBasicMaterial` / `MeshStandardMaterial` / `ShaderMaterial`. Sky in particular is **not** a TSL material; `HosekWilkieSkyBackend` still ships a `MeshBasicMaterial` with a CPU-baked `DataTexture` map (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:207-214`).

Ranked by estimated WebGL2 fragment cost (worst first):

| Rank | Surface | TSL class | Production callsite | Cost summary |
|------|---------|-----------|---------------------|--------------|
| 1 | Terrain ground | `MeshStandardNodeMaterial` (`src/systems/terrain/TerrainMaterial.ts:639`) | `TerrainSurfaceRuntime.ts:97,146` → every CDLOD tile in every mode | **~146 effective texture samples per fragment** in the color path alone; PBR lighting on top via the `MeshStandardNodeMaterial` lit shader. Highest per-fragment cost on the screen by a wide margin. |
| 2 | NPC Pixel Forge impostor | `MeshBasicNodeMaterial` (`src/systems/combat/CombatantMeshFactory.ts:394`) | `CombatantRenderer.createFactionBillboards` → `CombatantSystem.ts:201`; ≥6 buckets per mode, 512 instances each, every NPC at impostor LOD | 2 texture samples per fragment (parity with pre-merge), but **~16 ALU-heavy passes** (lighting tint, parity scale, atmosphere tint, fog mode select, height/distance fog, edge-fog mask) over many small overdrawing alpha-tested billboards. Overdraw is the issue, not per-fragment depth. |
| 3 | Vegetation billboard | `MeshBasicNodeMaterial` (`src/systems/world/billboard/BillboardNodeMaterial.ts:168`) | `GPUBillboardVegetation` constructor (`BillboardBufferManager.ts:79`) → `GPUBillboardSystem.ts:60`; one per vegetation type, up to 16384 instances each | 4 texture samples per fragment (parity with pre-merge), plus atlas azimuth blend, dual-row tile selection, wind sway, hemisphere lighting, height-fog. Cost dominated by overdraw on dense canopy. |

The proof-fixture `createAlphaTextureNodeMaterial` in `src/core/TslMaterialFactory.ts:83` and the `KonveyerInstancedSlice` wrapper at `src/rendering/KonveyerInstancedSlice.ts:50` are **not** wired into production scenes; their only non-test caller is `scripts/konveyer-slice-probe.ts`. They are excluded from the production ranking above.

The dominant cost — by an order of magnitude — is the **terrain TSL fragment**. The post-merge TSL implementation expanded the pre-merge dynamic `if`-branched biome sampler chain into a fully-unrolled `mix(prev, sample, step(...))` chain that **forces all 8 biome samplers to be read on every fragment**, where the pre-merge GLSL evaluated exactly one sampler per call. With anti-tiling rotation (2x) and triplanar projection (3x) layered on, the primary slot alone draws 48 effective biome samples per fragment, and the secondary slot doubles it.

## Method

1. Grep `from 'three/tsl'`, `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`, `MeshPhysicalNodeMaterial`, `NodeMaterial`, `colorNode`, `positionNode`, `opacityNode`, `roughnessNode` under `src/`. Cross-reference with `from 'three/webgpu'` to confirm every TSL material instantiation site.
2. For each TSL material, trace through to its production callsite — confirm it actually ships on the runtime path (not just exercised by tests or proof scripts).
3. Read the TSL node graph source to characterize per-fragment cost: count effective texture samples, count selection/branching constructs, count uniform/sampler bindings, identify ALU-heavy ops (`pow`, `exp`, `sin`, `cos`, `atan`, `asin`, `smoothstep`).
4. For each TSL material that replaced a pre-merge equivalent, fetch the pre-merge GLSL via `git show 79103082:<path>` and diff the per-fragment cost shape.
5. Where a compiled-GLSL extraction would tighten the answer, document the methodology and queue it for the fix cycle (this investigation runs on a Node worktree without a live WebGL2 context, so a true `renderer.compileAsync` capture would require a browser-hosted probe — out of scope for the memo-only R1 deliverable).

**No probe shipped.** The proof-fixture infrastructure to compile a TSL material to WebGL2 GLSL in a real renderer already exists in `scripts/konveyer-slice-probe.ts`, but that probe runs the offline pure-Node path and does not exercise the WebGL2 backend. Building an in-browser probe was scoped out: the structural answer (sample counts and op shapes) is recoverable from source, the structural delta against pre-merge is recoverable from `git show`, and the fix-cycle will need a browser-hosted capture path anyway — building it now would prejudge the fix-cycle's instrumentation choices.

## Full TSL material inventory

### 1. Terrain ground material — `TerrainMaterial`

- File: `src/systems/terrain/TerrainMaterial.ts` (1011 LOC, grandfathered on the source-budget list per `docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md`).
- Class: `MeshStandardNodeMaterial` from `three/webgpu` (instantiated at `src/systems/terrain/TerrainMaterial.ts:639` via `createTerrainMaterial`).
- Lit / PBR. `flatShading: false`, `metalness: 0.0`, `roughness: 1.0` initial, overridden by `roughnessNode`.
- Wired by `TerrainSurfaceRuntime.ts:97` (initial) and `TerrainSurfaceRuntime.ts:146` (reconfigure). One material per terrain surface runtime → applied to every CDLOD tile in every mode.
- Pre-merge equivalent: `MeshStandardMaterial` with `onBeforeCompile` GLSL injection (`git show 79103082:src/systems/terrain/TerrainMaterial.ts:647-754`). Same lighting model, very different fragment shape — see "Pre-vs-post diff" below.

**Sampler bindings (TSL, post-merge):**

- `terrainHeightmap` (vertex sample, `TerrainMaterial.ts:245`).
- `terrainNormalMap` (fragment, sampled twice per fragment via `createTerrainNormalNode` once in colorNode and again in roughnessNode, `TerrainMaterial.ts:258`).
- `biomeTexture0..7` (8 samplers, fragment, all-eight-sampled-every-fragment by the `step()`-mixed chain in `sampleBiomeTextureRaw`, `TerrainMaterial.ts:275-286`).
- `hydrologyMaskTexture` (fragment, `TerrainMaterial.ts:397`).

Total bindings: **12 samplers**. Mobile GLES3 must support at least 16 fragment samplers, so the count is in budget, but every active sampler is hit every fragment.

**Per-fragment sample count, color path:**

| Step | Calls to `sampleBiomeTexture` | Calls to `sampleBiomeTextureRaw` | Effective texture samples |
|------|-------------------------------|----------------------------------|---------------------------|
| `terrainNormal` in `createTerrainNormalNode` | — | — | 1 (normal map) |
| `primaryPlanar` (`TerrainMaterial.ts:541`) | 1 | 2 (primary + rotated) | 16 |
| `primaryTriplanar` (`TerrainMaterial.ts:542`) | 3 (zy, xz, xy) | 6 | 48 |
| `secondaryPlanar` (`TerrainMaterial.ts:544`) | 1 | 2 | 16 |
| `secondaryTriplanar` (`TerrainMaterial.ts:545`) | 3 | 6 | 48 |
| `rockPlanar` (`TerrainMaterial.ts:559`) | 1 | 2 | 16 |
| `hydrologyMaskTexture` (`TerrainMaterial.ts:397`) | — | — | 1 |
| **Color path subtotal** | | | **146** |

The roughness path (`createTerrainRoughnessNode`, `TerrainMaterial.ts:587-623`) re-samples the normal map (1 sample) and otherwise uses scalar uniform-array selectors (`sampleBiomeScalar`) which compile to ALU, not texture fetches. So roughness adds ~1 effective texture sample plus its own classify-blend ALU chain. **Total ~147 texture samples per fragment** when the visual is in worst-case (all biome rules enabled, triplanar active, hydrology mask hot).

The triplanar branch is weighted by `triplanarBlend = 1.0 - smoothstep(threshold-0.2, threshold, slopeUp)`. Where slopes are flat (open frontier flat terrain, A Shau valley floors), `triplanarBlend = 0` and the GPU still evaluates all six triplanar calls but their contributions get multiplied by zero. **The driver does not dead-code-eliminate the samples** because they live on the active TSL graph; the cost is unconditional.

**ALU-heavy ops in the color path (count of source-level occurrences):**

- `smoothstep`: 21 calls.
- `mix` (post-`step` selectors and final blends): 50 calls.
- `step`: 28 calls (each one is the gating fraction for a `mix`-chain entry).
- `pow` / `exp` / `sin` / `cos` / `atan` / `asin`: ~28 transcendentals.
- `reciprocal` / `length` / `distance` / `clamp` / `floor` / `fract` / `abs` / `max` / `min`: dozens.

**Branching:** zero true conditionals at the GLSL level. Every "branch" is implemented as a `mix(a, b, step(...))` — both sides always evaluated. The pre-merge GLSL by contrast used 11 `if` statements with early returns in `sampleBiomeTextureRaw` and `applyFeatureSurfaceColor`, which let the driver short-circuit on the chosen biome / surface (see "Pre-vs-post diff" below).

**Uniforms (count of distinct fragment-readable bindings):** ~40 scalar / vec2 / vec3 / vec4 uniforms plus 8 `Float32Array(8)` uniform arrays (biome and feature-surface tables). On WebGL2 these are individual `uniform float[8]` arrays; on iOS Safari and older Android Chrome the uniform vector budget is 256 vec4s — the terrain material consumes ~50 vec4-equivalents, well in budget. `highp` is implied by `MeshStandardNodeMaterial` PBR math (normal, view direction, world position).

**Pre-vs-post diff — terrain (the load-bearing one):**

| Aspect | Pre-merge (79103082) | Post-merge (master) |
|--------|----------------------|---------------------|
| Material class | `MeshStandardMaterial` + `onBeforeCompile` GLSL injection | `MeshStandardNodeMaterial` + TSL node graph |
| Biome sampler dispatch | `if (biomeSlot < 0.5) return texture2D(biomeTexture0, uv); else if (...) ...` chain (`git show 79103082:src/systems/terrain/TerrainMaterial.ts:313-322`) | `mix(prev, texture(biomeTextureN, uv), step(N-0.5, biomeSlot))` unrolled over all 8 samplers (`TerrainMaterial.ts:275-286`) |
| Effective per-call samples | **1** (chosen branch only) | **8** (all branches always evaluated) |
| Color-path total samples (worst) | ~19 (1 normal + 6 biome calls × ~1 each × 2 anti-tile rotation × 3 triplanar / secondary) plus hydrology and rock | ~147 (table above) |
| Conditional patterns | `if (rockBlend <= 0.001) return color;` early-outs in `applyCliffRockAccent`, `applyFarCanopyTint`, `applyFeatureSurfaceColor`, `applyLowlandWetness` | Same logic always evaluated, with the conditional collapsed to a `mix(...., mask)` (e.g. `TerrainMaterial.ts:560-565` for rock blend) |
| `if` branches in fragment | 11 conditionals with early `return` | 0 conditionals; everything is `select`/`mix`/`step` |
| Heightmap displacement on vertex | Custom GLSL via `onBeforeCompile` (`TERRAIN_VERTEX_MAIN`) | TSL `positionNode` (`createTerrainPositionNode`, `TerrainMaterial.ts:216-254`) |
| LOD morph + skirt + CDLOD | Same algorithm in both, same edge masking, same skirt-drop formula | Verbatim port (compare `TerrainMaterial.ts:65-135` GLSL comment to `TerrainMaterial.ts:216-254` TSL) |

**Estimated WebGL2 cost amplification on the worst-case fragment: ~7.5x texture fetches vs pre-merge**, plus elimination of the early-out branches that on a mobile GPU could short-circuit hydrology / rock / feature-surface evaluation entirely.

This is the strongest TSL-cost signal in the audit and the most likely individual TSL contributor to KB-MOBILE-WEBGPU on the WebGL2 fallback path. Open Frontier and Zone Control flat-terrain fragments are still cheaper than A Shau Valley triplanar fragments — but they are still 8x more expensive than pre-merge anywhere a biome rule is active.

### 2. NPC Pixel Forge impostor material

- File: `src/systems/combat/CombatantMeshFactory.ts` (582 LOC).
- Class: `MeshBasicNodeMaterial` from `three/webgpu` (instantiated at `src/systems/combat/CombatantMeshFactory.ts:394` inside `createImpostorMaterial`).
- Unlit. `transparent: true`, `alphaTest: 0.18`, `forceSinglePass: true`, `depthWrite: true`, `side: DoubleSide`, `fog: false` (sky/atmosphere fog is computed inline in `colorNode`).
- Wired by `CombatantMeshFactory.createFactionImpostorBucket` (called from `CombatantRenderer.createFactionBillboards`, `CombatantRenderer.ts:419-432` and `CombatantSystem.ts:201`). At least one bucket per `(faction, clipId)` pair; `PIXEL_FORGE_NPC_STARTUP_CLIP_IDS = ['idle','patrol_walk']` ship eagerly per faction × 4 factions + 1 SQUAD = **10 buckets at startup**, each holding 512 instanced billboards. More buckets allocated on-demand as combatants advance into other clips.
- Pre-merge equivalent: `ShaderMaterial` with raw GLSL (`git show 79103082:src/systems/combat/CombatantMeshFactory.ts:342-380`).

**Sampler bindings:**

- `map` (atlas texture, 1 sample per fragment).
- `tileCropMap` (`DataTexture` storing per-tile UV crop bounds; 1 sample per fragment).

Total: **2 samplers, 2 samples per fragment** — same as pre-merge.

**ALU-heavy ops in the color path:**

- `smoothstep`: 4 calls (top-light gradient, fog edge mask, fog-near/far for `linearFog` mode, atmosphere tint y-blend).
- `mix`: 7 calls (alert tint, readability lift, atmosphere tint, fog mode lerp, fog color match, parity luma desat, mode select).
- `step`: 4 calls (animationMode select, npcFogMode active/linear).
- `exp`: 2 calls (exponential fog density, fog height falloff).
- `dot` (luma + atmosphere): 4 calls.
- `clamp` / `min` / `max`: extensive throughout.

**Branching:** zero in TSL; pre-merge had `if (texColor.a < 0.18) discard;` plus `if`-gated fog branches. The TSL `alphaTest: 0.18` + `alphaTestNode` (line 409) preserves the discard at the shader-frame boundary, but **every other gate is collapsed to `mix(step(...))`**. The fog-mode active gate `step(0.5, npcFogMode)` always evaluates both the exponential and linear paths and the heightFactor regardless of whether fog is enabled.

**Uniforms:** 27 distinct fragment-readable bindings (atlas geometry, clip duration, frames-per-clip, view/frame grids, animation mode, tile crop scale, combat state, readability color/strength, parity scale/lift/saturation, lighting enabled/atmosphere scale, sky/ground/sun colors, fog mode/color/density/falloff/start/near/far). All scalars except for two `vec2` (view/frame grids), three `vec3` (sky/ground/sun colors + fog color + readability color), and one sampler-pair for the maps. Comfortable on mobile vec4 budgets.

**Pre-vs-post diff — combatant impostor:**

| Aspect | Pre-merge | Post-merge |
|--------|-----------|------------|
| Material class | `ShaderMaterial` raw GLSL | `MeshBasicNodeMaterial` + TSL `colorNode` / `opacityNode` |
| Texture samples | 2 (`map`, `tileCropMap`) | 2 (same) |
| Discard | `if (texColor.a < 0.18) discard;` (`git show 79103082:CombatantMeshFactory.ts:368`) | `alphaTest: 0.18` + `alphaTestNode` (`CombatantMeshFactory.ts:398, 409`) |
| Fog mode gating | `if (npcFogMode > 0.5) { ... if (npcFogMode > 1.5) linearFog else expFog ... }` | `mix(expFog, linearFog, step(1.5, npcFogMode))` × `step(0.5, npcFogMode)` — both fog paths always evaluated |
| Atmosphere lighting toggle | `if (npcLightingEnabled > 0.5)` | `mix(npcColor, tinted, step(0.5, npcLightingEnabled))` — both paths always evaluated |
| Overdraw cost | High; alpha-tested NPCs overlap heavily in screen-space at combat density | Same overdraw shape, ~10% more ALU per fragment because of the unconditional dual-path fog/atmosphere math |

**Estimated WebGL2 cost amplification: ~1.10x to 1.15x per fragment**, dominated by always-on dual-path fog/atmosphere evaluation. Less alarming than terrain. The real mobile-cost lever here is **overdraw count** (number of overlapping alpha-tested billboards), not per-fragment depth.

### 3. Vegetation billboard material

- File: `src/systems/world/billboard/BillboardNodeMaterial.ts` (436 LOC).
- Class: `MeshBasicNodeMaterial` from `three/webgpu` (instantiated at `BillboardNodeMaterial.ts:168` inside `createBillboardNodeMaterial`).
- Unlit. `transparent: true`, `alphaTest: 0.25`, `side: DoubleSide`, `forceSinglePass: true`, custom blending (`OneFactor`, `OneMinusSrcAlphaFactor`), `depthWrite: true`, `fog: false`.
- Wired by `GPUBillboardVegetation` constructor (`BillboardBufferManager.ts:79`), spawned from `GPUBillboardSystem.ts:60`. One material instance per vegetation type (canopy hero, canopy balanced, ground compact, etc.). Each manages up to `config.maxInstances` (typically 16384) billboards.
- Pre-merge equivalent: `RawShaderMaterial` with explicit GLSL strings (`git show 79103082:src/systems/world/billboard/BillboardBufferManager.ts:114` + `BillboardShaders.ts`).

**Sampler bindings:**

- `map` (atlas color, sampled twice — current tile + next tile for azimuth blend, `BillboardNodeMaterial.ts:343-346`).
- `normalMap` (sampled twice for the same blend, `BillboardNodeMaterial.ts:347-350`).

Total: **2 samplers, 4 samples per fragment** — same as pre-merge.

**ALU-heavy ops:**

- `smoothstep`: 5 calls (alpha hardening, near-alpha solid blend, near-fade, far-fade, near-light boost).
- `mix`: 8 calls (atlas tile blend × 2 for color + normal, color tint, foliage saturation, near-alpha hardened, hemisphere lighting, lit-vs-unlit toggle, fog blend, ambient hemisphere).
- `step` / `select`: ~10 calls (LOD tier selectors, atlas-enabled gate, stable-azimuth gate, fog-enabled gate).
- `pow` / `exp` / `sin` / `atan` / `asin`: ~15 transcendentals (gamma correction, wind sway, atlas elevation/azimuth math, fog density and height falloff).
- `cos` (rotateUv): 1 call.

**Branching:** zero. The atlas azimuth blend evaluates both tiles even when `tiles.x <= 1.5` (the gating `shouldBlend = atlasEnabled.and(tiles.x.greaterThan(1.5))` collapses to a `mix` weight of zero — the second sample still happens). Same shape pre-merge — the pre-merge GLSL also unconditionally sampled the second tile when `imposterAtlasEnabled && imposterTiles.x > 1.5`, just inside a real `if`-branch (`git show 79103082:src/systems/world/billboard/BillboardShaders.ts:220-225`). **Sampler-count parity is preserved.**

**Uniforms:** ~32 distinct (`BillboardNodeMaterial.ts:56-93`). All scalars except `colorTint` (vec3), `fogColor` / `skyColor` / `groundColor` / `sunColor` (vec3 each), `imposterTiles` / `lodDistances` (vec2), `imposterUvBounds` (vec4), `viewMatrix` (mat4), plus the two samplers. Comfortable mobile budget.

**Pre-vs-post diff — vegetation billboard:**

| Aspect | Pre-merge | Post-merge |
|--------|-----------|------------|
| Material class | `RawShaderMaterial` raw GLSL | `MeshBasicNodeMaterial` + TSL |
| Texture samples | 4 (2 color + 2 normal for azimuth blend) | 4 (same) |
| Fog gate | `if (fogEnabled) { ... }` | `select(fogEnabled, mix(base, fogColor, factor), base)` — fog math always evaluated, then select |
| Far-fade / near-fade | `if (vDistance > fadeDistance)` | `select(cameraDistance.greaterThan(fadeDistance), ...)` — both paths always evaluated |
| Normal lighting | `if (normalMapEnabled) hemiNormal else hemiUv` | `select(normalMapEnabled, normalLight, hemiLight)` — both paths always evaluated |
| Alpha hardening | Same algorithm | Same algorithm; TSL port at `BillboardNodeMaterial.ts:228-240` |

**Estimated WebGL2 cost amplification: ~1.15x to 1.20x per fragment**, dominated by unconditional fog + dual lighting-mode evaluation. Same overdraw caveat as combatant impostors — the dominant mobile lever is canopy density and overdraw, not per-fragment depth.

## Not TSL — clarifications for the alignment memo

The following surfaces are **not** TSL materials despite being recently touched by the KONVEYER campaign. The alignment memo and any fix-cycle proposal should not pursue them as TSL-cost candidates:

- **Sky dome (`HosekWilkieSkyBackend`)** — `MeshBasicMaterial` with a CPU-baked `DataTexture` (`HosekWilkieSkyBackend.ts:207-214`). The sky-bland regression named in KB-SKY-BLAND is **not** a TSL-fragment-shader issue; the LUT-driven sky composites a 128×64 atmosphere texture every 2 s on the CPU, then maps it with the equivalent of `gl_FragColor = texture(skyMap, uv)`. Cost-on-WebGL2 is one texture sample per fragment. See `sky-visual-and-cost-regression.md` for the dedicated visual diff.
- **Water (`WaterSystem`)** — `MeshStandardMaterial` (`WaterSystem.ts:165, 535`). Not TSL.
- **Weather / clouds / rain / debris** — `MeshBasicMaterial` and `Sprite` (`WeatherSystem.ts:153`). Not TSL.
- **Tracers, muzzle flashes, smoke clouds, explosions, impact effects** — vanilla Three.js materials. Not TSL.
- **Helicopter / aircraft / vehicle geometry** — vanilla Three.js materials.
- **HUD / minimap / debug overlays** — `CanvasTexture` + Sprite/Plane with `MeshBasicMaterial`. Not TSL.

The KONVEYER campaign migrated the three highest-instance-count surfaces (terrain, vegetation, NPCs) and left the rest on classic materials. The audit confirms that scope.

## Methodology limitations

1. **No compiled GLSL captured.** This memo characterizes the TSL graphs and pre-merge GLSL but does not include a `renderer.compileAsync` capture of the post-merge compiled fragment shader. A faithful WebGL2-compiled-GLSL extraction requires a browser-hosted probe; the fix cycle should ship one. Until then, sample-count and op-count estimates are derived from the TSL source (which generates the GLSL deterministically).
2. **No live mobile profile.** Per-fragment cost in cycles or ms is not measured here; this is structural analysis. Real fragment-time numbers belong in the `mobile-startup-and-frame-budget` memo, which captures actual frame-time breakdowns on mobile / 4x-CPU emulation.
3. **Pre-merge sample counts approximated.** The pre-merge biome sampler chain branches at runtime; the "1 sample per call" figure assumes the GPU's dynamic-branch-elision works as expected. Mobile drivers sometimes serialize dynamic-branched texture fetches; the true pre-merge cost could have been higher than the 19-sample worst case stated. The 8x ratio for post-merge vs pre-merge is the **floor** of the amplification, not the ceiling.

## Recommendations for the alignment memo

Ranked by impact × effort, low-effort-first:

1. **Restore early-out biome sampling in TSL terrain.** Replace the `mix(prev, sample, step(...))` unroll in `sampleBiomeTextureRaw` (`TerrainMaterial.ts:275-286`) with a TSL `If/ElseIf` chain (the `three/tsl` library exposes `If` for this exact case, see `.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md`). Same logic, but the compiled WebGL2 fragment can early-out on the chosen biome. Expected: ~6-8x reduction in terrain-fragment texture fetches in the common case. **High impact, low effort.**
2. **Gate triplanar sampling on `triplanarBlend > epsilon`.** The triplanar branch is dead weight on flat terrain (Open Frontier, A Shau valley floors). A TSL `If(triplanarBlend.greaterThan(0.001))` gate around the triplanar sample sub-graph would skip 48 samples per fragment on flat surfaces. **Medium impact, low effort.**
3. **Gate hydrology, rock-accent, feature-surface paths on their masks.** Same pattern — these were `if (mask > 0.001) return;` early-outs pre-merge; restoring that shape recovers ~16 samples (rock) and the feature-surface ALU chain. **Medium impact, low effort.**
4. **Compile-cost probe.** Build a Playwright probe under `scripts/perf-tsl-shader-cost.ts` that boots the game in `webgpu-force-webgl` mode, runs `renderer.compileAsync(scene, camera)` against the production terrain/billboard/combatant scenes, harvests the compiled GLSL via the `WebGLNodesHandler` debug surface, and writes per-material `instructionCount` / `samplerCount` / `uniformCount` to a JSON artifact. This is the right shape to ship as the fix-cycle's measurement scaffold. **Low impact directly, high impact as a regression gate.**
5. **Defer or revert the post-merge dual-path fog/atmosphere math on combatant impostors and vegetation billboards.** Probably not worth chasing — these are 10-20% per-fragment regressions, dominated by overdraw, not depth.

## Acceptance check

- Memo names every TSL material in production: **yes** — three (Terrain, Vegetation Billboard, NPC Impostor). The proof-fixture `createAlphaTextureNodeMaterial` is named and explicitly excluded as non-production.
- Ranked by estimated WebGL2 fragment cost: **yes** — terrain >> impostor > billboard.
- Top-3 cost contributors named with `file:line` citations: **yes** — `TerrainMaterial.ts:275-286`, `CombatantMeshFactory.ts:394`, `BillboardNodeMaterial.ts:168` (plus the inner-loop citations under each section).
- Pre-migration comparison included where the material existed before: **yes** — pre-vs-post diffs for all three; the billboard material did not exist pre-merge in this file (`BillboardNodeMaterial.ts` is new) but the GPU billboard vegetation pipeline existed at `BillboardBufferManager.ts` + `BillboardShaders.ts`, both diffed against here.
- Probe shipped: **no** (memo-only PR, see "Method").
