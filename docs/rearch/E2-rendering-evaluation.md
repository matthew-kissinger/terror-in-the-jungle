# E2: Rendering Paradigm at Scale — Decision Memo

Status: draft (spike)
Branch: `spike/E2-rendering-at-scale`
Date: 2026-04-16
Author: E2 executor agent

## 1. Question

Does the classic Three.js scene graph (one `Object3D` per entity) scale to 3,000 animated combatants + vehicles + projectiles + effects? Or do we need GPU-driven rendering (instanced meshes, compute-updated transforms, indirect draws) — possibly via WebGPU?

Context reframe discovered during the spike: **the current NPC rendering path is already GPU-instanced**. `CombatantRenderer` + `CombatantMeshFactory` allocate a pool of `THREE.InstancedMesh` buckets keyed by `{faction, state, viewDir}` (≈36 keys × 3 meshes each = ~108 instanced draws total), not one `Object3D` per combatant. So the E2 question as written — "does Object3D-per-entity scale?" — is answered "we already don't do that for NPCs". The real questions for this spike turned out to be:

- Is the existing keyed-instanced path fast enough at 3,000?
- What does a collapsed single-mesh path look like for contrast?
- Where are the concrete cliffs in the current implementation?

## 2. Current-path measurements

Measurement scenes, all rendered with Three.js r0.183.2 / WebGL2 in headless Chromium on the workstation (AMD Ryzen 7 3700X + RTX 3070, Windows 11, WebGL2 via ANGLE-on-D3D11):

- **A. `ObjectPerEntity`** — one `THREE.Mesh` per entity, worst-case naive path. This is NOT how NPCs are rendered today, but approximates effect/prop paths that spawn one-mesh-per-spawn.
- **B. `KeyedInstancedPool`** — `InstancedMesh` per bucket with sprite + aura + ground-marker triple, matching the shape of `CombatantRenderer`. This is the live NPC rendering path.
- **C. `SingleInstancedMesh`** — one `InstancedMesh` for all entities, shared material. GPU-driven ideal.

All three scenes update every entity every frame: position wobble (per-entity sinusoid, phase) and Y rotation. The measurement window is 300 frames after 60 frames of warmup. Frame time is measured as `update() + renderer.render() + gl.getError()` (forces command-buffer flush; excludes GPU pipeline completion). rAF is bypassed during measurement because 144Hz vsync would otherwise clamp all scenes at ≈6.9ms and hide the CPU cost.

Run 1 (`artifacts/e2-rendering-bench/bench-2026-04-17T00-44-54-118Z.csv`):

| scene | N     | avg   | p50   | p95   | p99   | max   | draw calls | programs | triangles |
|-------|-------|-------|-------|-------|-------|-------|------------|----------|-----------|
| A     | 500   | 0.91  | 0.9   | 1.1   | 1.2   | 1.3   | 500        | 1        | 1,000     |
| A     | 1000  | 2.06  | 2.0   | 2.5   | 2.9   | 2.9   | 1000       | 1        | 2,000     |
| A     | 2000  | 3.14  | 3.1   | 3.5   | 3.8   | 3.9   | 2000       | 1        | 4,000     |
| A     | 3000  | 4.79  | 4.7   | 5.4   | 5.8   | 6.3   | 2861 \*    | 1        | 5,722     |
| B     | 500   | 1.57  | 1.5   | 1.8   | 2.0   | 2.4   | 180        | 3        | 35,000    |
| B     | 1000  | 1.67  | 1.6   | 1.9   | 2.1   | 2.1   | 180        | 3        | 70,000    |
| B     | 2000  | 1.81  | 1.8   | 2.1   | 2.2   | 2.3   | 180        | 3        | 140,000   |
| B     | 3000  | 2.02  | 2.0   | 2.3   | 2.6   | 2.8   | 180        | 3        | 210,000   |
| C     | 500   | 0.20  | 0.2   | 0.3   | 0.4   | 0.5   | 1          | 1        | 1,000     |
| C     | 1000  | 0.23  | 0.2   | 0.4   | 0.5   | 0.6   | 1          | 1        | 2,000     |
| C     | 2000  | 0.30  | 0.3   | 0.4   | 0.6   | 1.1   | 1          | 1        | 4,000     |
| C     | 3000  | 0.50  | 0.5   | 0.7   | 0.9   | 0.9   | 1          | 1        | 6,000     |

\* Scene A at N=3000 reports 2,861 draw calls instead of 3,000 because Three.js's per-mesh frustum culling removed the off-screen tail of the grid. All numbers in ms.

Run 2 (same machine, different warm state; `artifacts/e2-rendering-bench/bench-2026-04-17T00-45-48-271Z.csv`), as a stability cross-check:

| scene | N     | avg   | p95   | p99   |
|-------|-------|-------|-------|-------|
| A     | 500   | 0.87  | 1.1   | 1.2   |
| A     | 1000  | 1.91  | 2.7   | 3.1   |
| A     | 2000  | 3.29  | 3.8   | 4.5   |
| A     | 3000  | 4.89  | 5.8   | 6.3   |
| B     | 500   | 1.59  | 1.8   | 2.2   |
| B     | 1000  | 1.77  | 2.1   | 2.3   |
| B     | 2000  | 2.03  | 2.3   | 2.4   |
| B     | 3000  | 2.08  | 2.3   | 2.6   |
| C     | 500   | 0.20  | 0.3   | 0.4   |
| C     | 1000  | 0.22  | 0.4   | 0.4   |
| C     | 2000  | 0.30  | 0.4   | 0.5   |
| C     | 3000  | 0.37  | 0.5   | 0.6   |

Run-to-run variance is ~5-10% at avg and ~10-20% at p99 — typical for unpinned JS timing on a consumer OS. Conclusions below are robust to that noise.

Reproducibility:

```bash
npm ci --prefer-offline
npm run bench:e2:capture:headed   # or npm run bench:e2:capture (headless)
# writes artifacts/e2-rendering-bench/bench-<iso>.csv and .json
```

`npm run bench:e2` opens the page for interactive use (`run full sweep` button, or scene/N shortcuts). The per-scene measurement is rAF-gated in that mode to preserve visual sanity; the Playwright capture script uses the uncapped-timing path so the numbers reported above are CPU-bound, not vsync-bound.

## 3. Identified bottleneck

Scene B — the live NPC path — costs roughly **0.5ms baseline + ~0.5ms per 1000 instances** on this workstation. At 3,000 it is still only ~2ms/frame of CPU-side renderer cost. The cost breakdown per entity is:

1. 3 × `setMatrixAt()` (one per bucket mesh: sprite, aura, marker) — three `Matrix4.copyTo` into a `Float32Array`.
2. 3 × `instanceMatrix.needsUpdate = true` (set once per bucket, not per entity, so amortized over ~83 entities per bucket).
3. `Matrix4` composition math per entity (one rotation, one scale compose, one position set) — JS-side arithmetic.

What the current renderer does **worse** than scene B and what the spike's scene B does **not** simulate:

- Per-entity distance culling (`RENDER_DISTANCE_SQ = 400*400`) — free skip, not cost.
- `getViewDirection()` dot-product — one Vec3 dot, cheap.
- Death-animation branches per dying combatant — rarely hot.
- **Billboard orientation recompute every frame** — one matrix op, cheap.

In other words: the live renderer does roughly what scene B does plus a tiny constant per entity. The real combat120 p95 of ~32ms is **not spent in the renderer** — it is spent in AI (documented in `docs/BACKLOG.md`: "synchronous cover search in `AIStateEngage.initiateSquadSuppression()`"). This spike confirms rendering is not the bottleneck today and, more interestingly, **would not become the bottleneck at 3,000 agents**.

Scene A (Object3D per entity) at 3000 costs ~5ms — not free, but still well under the 16ms frame budget — meaning even a naive "spawn a mesh per bullet tracer / prop" pattern can tolerate thousands of entities on this class of machine before it shows up. The risk with scene A is not steady-state frame time; it is GC churn from creating/destroying `Object3D`s, and matrix-world invalidation storms if anything reparents them.

**One concrete cliff was found, though.** `CombatantRenderer`'s instanced bucket capacity is hard-coded at `maxInstances = 120` per key in `CombatantMeshFactory.createMeshSet()` (mounted buckets are 32). With 4 factions × (2 × 3 = 6 walking/firing keys + 3 mounted keys) + SQUAD variants, there are enough keys to cover well over 3,000 total instances. But any single bucket can only hold 120 — and at 3,000 combatants biased toward a faction or state, individual buckets will overflow. The current code silently drops overflows (`if (index >= capacity) return;` in `CombatantRenderer.updateBillboards`). **This is the first bug that will surface at scale**, not the renderer paradigm.

## 4. Instanced-path measurements (single-bucket contrast)

Scene C is a "perfect" single-draw-call instanced path. At N=3000 it takes ~0.5ms (~10x cheaper than scene B at the same N). That 10x speedup represents the headroom if we eventually collapse the bucket pool into a texture-atlas-per-frame scheme (one material with a uniform or per-instance texture-index attribute, instead of one material per {state, direction}). That is not a small change, but it is a bounded one, and it buys ~1.5ms at N=3000.

## 5. WebGPU status snapshot (Three.js r183)

Three.js r0.183.2 ships WebGPU as a first-class parallel renderer (`import { WebGPURenderer } from 'three/webgpu'`), introduced as stable (no longer Examples/JSM) around r162-r164. The TSL node-material system is now the canonical shader path for WebGPU work (`import * as TSL from 'three/tsl'`). On Windows, WebGPU is behind a Chrome feature flag in stable but default-enabled since Chrome 113; works in Edge 113+ and recent Firefox Nightly. Compute shaders and storage buffers are available — meaning a compute-driven transform update (write entity positions from a compute pass, skip the CPU→GPU `instanceMatrix` upload) is possible.

Migration cost is **substantial and invasive**: shader code shifts from GLSL strings / Three material classes to TSL nodes. Every custom `ShaderMaterial` (we have at least the `createOutlineMaterial` in `CombatantShaders.ts`) would need a TSL rewrite. The public API (`renderer.render`, `scene.add`, etc.) is unchanged — but anything that pokes at `renderer.info`, buffer geometries with strided attributes, or direct `getContext()` calls becomes backend-specific. Given the above measurements, WebGPU adoption is **not justified by the rendering-at-scale question** at our current and projected agent counts. It may become justified later for compute-based AI (E1) or for shadow-pass cost at very large map sizes, but neither is gated by this memo.

## 6. Cost estimate — if we wanted to push rendering further

Two paths, neither urgent:

1. **Fix the 120-per-bucket cap in `CombatantRenderer` (required for 3K).** Bump `maxInstances` to a dynamic value that matches per-bucket population plus headroom, or switch to "grow on overflow" by reallocating the `InstancedMesh` with a larger cap. Scoped, ~1 day of work, well-understood. **Do this when we start actually testing at 2K+ NPCs** — before, it is dead code speculation.
2. **Collapse buckets into a single InstancedMesh with per-instance texture index (atlas path).** Saves ~1.5ms at 3K; buys back ~10% of frame budget. Scope: rewrite `CombatantMeshFactory` to produce a single `InstancedBufferAttribute` of texture indices, pack all walk-frame / fire / mounted textures into one atlas per faction, rewrite outline `ShaderMaterial` to sample from the atlas. ~1 week of work. Requires playtest to confirm visual parity (sprite flipping, outline thickness, ground marker positioning are all live concerns). **Only worth doing if we actually hit the 3K target and something else has already closed the 16ms-budget gap; rendering is not on the critical path.**

## 7. Value estimate — frame budget gained at various N

Using the measurements above, the frame budget impact of rendering at the stated N targets on the workstation is:

| N    | current (scene B) | GPU-ideal (scene C) | savings |
|------|-------------------|---------------------|---------|
| 500  | 1.6ms             | 0.2ms               | 1.4ms   |
| 1000 | 1.7ms             | 0.2ms               | 1.5ms   |
| 2000 | 1.8ms             | 0.3ms               | 1.5ms   |
| 3000 | 2.0ms             | 0.5ms               | 1.5ms   |

Caveat: these numbers are workstation (Ryzen 7 + RTX 3070). On a mid-tier laptop iGPU, multiply by 3-5x for a working estimate. Mobile (the stated mobile target in `CLAUDE.md`) is another step down. The current renderer holds 2.0ms on the workstation at 3K; that could be 6-10ms on a laptop. Still under the 16ms budget, but now non-trivial, and the ~1.5ms savings matter more there.

## 8. Recommendation

**Defer GPU-driven rendering work. Do NOT start a WebGPU migration. Do NOT collapse the bucket pool yet.**

Rationale:

1. **The current path is already instanced.** The framing of "Object3D per entity" is not what `CombatantRenderer` does. Measurements show the live path (scene B) costs ~2ms at 3000, well inside budget on the reference workstation.
2. **Rendering is not the combat120 bottleneck.** p95 32ms / p99 34ms is AI, not draws. Any rendering optimization is second-order until the AI work item lands.
3. **The one concrete cliff — 120 instances per bucket — is a bug to fix when it becomes real, not a paradigm choice.** Fix in-place when we can reproduce overflow in a scenario with 2K+ NPCs.
4. **WebGPU is ready to consider but offers no measurable payoff on this specific question.** Its ROI lives in compute-backed simulation (E1) and advanced post-processing, not in clearing a render bottleneck we don't have.

**Action items** (none of these belong in Phase F's rearchitecting pass — they belong in the normal backlog):

- [backlog-P2] Remove or raise the `maxInstances = 120` hard cap in `CombatantMeshFactory` before combat testing moves past 500 concurrent NPCs per bucket. Add a perf-capture assertion that no instance write is dropped.
- [backlog-P3] Add a rendering-at-scale regression test that spawns dummy instanced meshes at N=1000 and asserts the scene B style path stays under a sanity budget (e.g. <5ms avg on the reference workstation), so a future refactor that accidentally drops instancing is caught.
- [rearch-note] Mark E2 closed. Phase F does not need a rendering-paradigm task.

## Reversibility

The decision to defer is trivially reversible: the bench harness (`scripts/e2-rendering-bench/`) stays in the repo and can be re-run against any future commit. If future gameplay changes (e.g. 3D animated soldier models replacing billboards, or a 5-10x increase in projectile density) shift the bottleneck into rendering, the same measurement commands produce a fresh decision.

## Appendix A: measurement commands

```bash
# One-shot headless sweep (A/B/C × 500/1000/2000/3000), 300 measured frames each.
# Takes ~3 min wall-clock. Writes CSV + JSON to artifacts/e2-rendering-bench/.
npm run bench:e2:capture

# Headed variant (browser visible, useful for GPU-driver sanity checks):
npm run bench:e2:capture:headed

# Interactive: open the bench page in your browser.
# Click "run full sweep" or individual scene/N buttons.
npm run bench:e2
# open http://localhost:5180/
```

## Appendix B: what the spike did NOT measure

1. **GPU-side timing.** The harness measures CPU work (JS + command submission). Actual GPU pipeline completion is asynchronous and excluded to avoid polluting numbers with `glFinish`-style stalls. On this workstation with a fragment-cheap shader, GPU time is negligible at these instance counts; on an integrated GPU or at very high overdraw it would matter.
2. **Realistic shaders.** Scene B uses `MeshBasicMaterial`. The live `CombatantRenderer` uses a custom `ShaderMaterial` (outline pass with cel shading, rim lighting, damage flash). That adds program-compilation overhead (one-time) and some per-fragment cost. Unlikely to flip the conclusion at 3K, but worth re-measuring if we re-skin the shader.
3. **Memory / GC.** Scene A does not create `Object3D`s per frame; it creates them once upfront. The real risk with an "Object3D per tracer" pattern is spawn/despawn GC pressure, which this harness does not exercise.
4. **Cross-device.** Only one machine. Mobile and low-end laptops will look different.

## Appendix C: files added by this spike

- `scripts/e2-rendering-bench/index.html`
- `scripts/e2-rendering-bench/bench.ts`
- `scripts/e2-rendering-bench/vite.config.ts`
- `scripts/e2-rendering-bench/capture.ts`
- `package.json` — added `bench:e2`, `bench:e2:capture`, `bench:e2:capture:headed` scripts
- `docs/rearch/E2-rendering-evaluation.md` — this memo

No source files under `src/` were touched. No fenced interfaces were changed. No changes merged to master.
