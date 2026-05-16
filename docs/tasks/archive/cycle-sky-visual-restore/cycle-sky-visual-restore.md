# Cycle: Sky Visual Restore

Last verified: 2026-05-16

## Status

Queued at position #1 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `KB-SKY-BLAND` (already moved to Closed in `docs/CARRY_OVERS.md`
on cycle-2026-05-16 close; this cycle ships the fix).

## Skip-confirm: yes

Campaign auto-advance is `yes`. The orchestrator dispatches R1 without
a wait-for-go gate.

## Concurrency cap: 3

R1 ships three small parallel tasks. Concurrency cap is the task count.

## Objective

Restore pre-merge sky visual fidelity (saturated horizon, visible sun
pearl, deep noon blue) without re-introducing the per-fragment Preetham
shader on the full dome. Source memo:
[docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).

The post-merge sky pass is **cheaper** on GPU than pre-merge (one
textured sphere vs. Preetham + 5-octave fbm + HG sun-disc per
fragment); the regression is visual fidelity, not perf. Four
compounding losses produce the bland look: under-resolved 128×64 LUT,
HDR clamp to `[0,1]` at bake time, missing `toneMapped: false`
routing the dome through `ACESFilmicToneMapping`, and a sun-disc
lerped into a peak-normalised color.

## Branch

- Per-task branches: `task/<slug>`.
- Final integration: each task ships its own PR; orchestrator merges
  in dispatch order.

## Required Reading

1. [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
   — R2 alignment memo naming this cycle.
2. [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md)
   — full visual diff + paired pre/post screenshots.
3. `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
   (807 LOC, grandfathered) — primary file.
4. `src/systems/environment/AtmosphereSystem.ts` —
   `compressSkyRadianceForRenderer` interaction (downstream readers
   need the cap; the dome itself does not).
5. `src/core/GameRenderer.ts:145-146` —
   `renderer.toneMapping = ACESFilmicToneMapping` site.
6. [.claude/skills/webgpu-threejs-tsl/SKILL.md](../../.claude/skills/webgpu-threejs-tsl/SKILL.md)
   — TSL reference for HalfFloatType DataTexture and tonemap nodes
   (if the cycle goes the TSL route for the sun-disc sprite).
7. [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — KB-SKY-BLAND already
   recorded as closed at the prior cycle close; this cycle is the
   promised follow-on fix.

## Critical Process Notes

1. **Owner playtest required.** Acceptance is paired pre/post
   screenshots against the originals at
   [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/).
   The cycle marks "Playtest recommended" in the end-of-run summary;
   the orchestrator merges on CI green but flags it.
2. **Do not touch `compressSkyRadianceForRenderer`.** That cap is
   correct for the downstream fog + hemisphere readers and must stay.
   The bug is the dome itself shouldn't be tonemapped, not that the
   downstream radiance compression is wrong.
3. **No perf-baseline refresh.** That's cycle #12
   `cycle-stabilizat-1-baselines-refresh`.
4. **Measure refresh cost before bumping LUT resolution.** Use the
   existing `getRefreshStatsForDebug` at
   `HosekWilkieSkyBackend.ts:533-540`. If the bake EMA exceeds 8 ms
   at 256×128, hold at 256×128 and document; if comfortable, ship
   512×256.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `sky-dome-tonemap-and-lut-resolution`, `sky-hdr-bake-restore`, `sky-sun-disc-restore` | 3 | All three touch `HosekWilkieSkyBackend.ts`; orchestrator merges in order to minimize rebase churn. |

No R2 — this is a single-round cycle.

## Task Scope

### sky-dome-tonemap-and-lut-resolution (R1)

Set `toneMapped: false` on the dome `MeshBasicMaterial` and bump the
sky LUT resolution.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` (the
  `MeshBasicMaterial` constructor at `:207-214` + the
  `SKY_TEXTURE_WIDTH` / `SKY_TEXTURE_HEIGHT` constants at `:9-10`).

**Method:**
1. Add `toneMapped: false` to the `MeshBasicMaterial` constructor at
   `:207-214`.
2. Bump `SKY_TEXTURE_WIDTH = 128` → `256` and
   `SKY_TEXTURE_HEIGHT = 64` → `128`.
3. Run a single-frame perf capture of the refresh loop via the
   existing `getRefreshStatsForDebug` at `:533-540`. If EMA stays
   under 8 ms at 256×128, ship 256×128. If headroom is ample
   (<3 ms), bump to 512×256 instead.
4. Commit message: `feat(sky): disable tonemap on dome + bump LUT to 256x128 (sky-dome-tonemap-and-lut-resolution)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- Visual diff against
  `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`
  shows recovered horizon saturation and noon-blue depth.
- LUT-bake EMA captured in PR description.

### sky-hdr-bake-restore (R1)

Stop clamping radiance to `[0,1]` at bake time. Either upload
`THREE.HalfFloatType` `DataTexture`, or encode a fixed exposure curve
that preserves the sun-disc spike.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  (`:67-79` texture creation, `:512-515` encode step, `:801-805`
  range clamp).

**Method:**
1. Change the `DataTexture` type from `UnsignedByteType` to
   `HalfFloatType` (`Float16Array` storage). The texture format
   stays `RGBAFormat`; the type changes.
2. Remove the `clamp01` calls at `:512-515` (the sqrt-gamma encode
   was a workaround for the 8-bit dynamic range; with half-float
   storage we keep linear radiance).
3. In `evaluateAnalytic` at `:801-805`, lift the `Math.min(8, ...)`
   ceiling to something the sun-disc can realistically hit
   (recommend `Math.min(64, ...)` so the post-bake sun-disc retains
   headroom without overflowing fp16's exponent).
4. Verify the texture upload path. Three.js `DataTexture` accepts
   `HalfFloatType` directly; no change to `needsUpdate` flow.
5. Commit message: `feat(sky): half-float HDR sky LUT, drop [0,1] radiance clamp (sky-hdr-bake-restore)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- No new WebGL warnings in console under default `webgpu` mode +
  strict-WebGPU mode + `?renderer=webgl` force-fallback.
- Visual diff shows saturation recovery beyond what
  `sky-dome-tonemap-and-lut-resolution` alone produces (noon-blue
  reaches pre-merge intensity).

### sky-sun-disc-restore (R1)

Restore the visible sun pearl. Drop a small additive sprite (or
2-tri quad) at the sun direction in `AtmosphereSystem` with its own
tonemap-bypassed shader. Avoids re-introducing a per-fragment shader
on the full dome.

**Files touched:**
- New: `src/systems/environment/atmosphere/SunDiscMesh.ts` (≤200 LOC).
- `src/systems/environment/AtmosphereSystem.ts` — instantiate +
  update the sun-disc mesh; pass sun direction each frame.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` —
  the sky-dome LUT keeps the soft sun glow (existing `mixSunDisc`
  composite stays); the new sprite is the bright pin-point on top.

**Method:**
1. Build a small additive `Mesh` (small `PlaneGeometry` or `Sprite`)
   billboarded to the camera, positioned at sun direction × dome
   radius * 0.99 (just inside the dome so it z-blends correctly).
2. Material: `MeshBasicMaterial` with `toneMapped: false`,
   `transparent: true`, `blending: AdditiveBlending`,
   `depthWrite: false`, `depthTest: false`, and a radial-falloff
   `CanvasTexture` (or `THREE.RingGeometry` with vertex-colour gradient).
3. Drive intensity from the same Preetham sun-color path that fed
   the pre-merge HDR pin-point (look up the `vSunE * 19000.0 * Fex`
   ratio in the pre-merge `hosekWilkie.glsl.ts`; that's the target
   peak in linear-radiance terms).
4. Hide the sprite when sun is below horizon (sun direction `.y` < 0).
5. Commit message: `feat(sky): additive HDR sun-disc sprite restores pearl (sky-sun-disc-restore)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- New sibling test `SunDiscMesh.test.ts` covers (a) sprite hidden
  below horizon, (b) sprite positioned at sun direction, (c)
  material flags (`toneMapped: false`, additive blending).
- Visual diff shows visible pearl sun in the noon-scene paired
  screenshot.

## Hard Stops

Standard:
- Fenced-interface change (`src/types/SystemInterfaces.ts`) → halt,
  surface to owner.
- Worktree isolation failure → halt.
- Twice-rejected reviewer on a single task → halt.

Cycle-specific:
- LUT-bake EMA exceeds 12 ms on the development machine at the
  chosen resolution (256×128 minimum) → fall back to 192×96 (still
  better than pre-cycle 128×64) and ship; do not halt.
- Owner playtest rejects the visual at PR review → reviewer
  CHANGES-REQUESTED loop applies; second rejection halts.
- No perf regression > 5% p99 on `combat120` (orchestrator runs
  `perf-analyst` after R1).

## Reviewer Policy

- No mandatory `combat-reviewer` or `terrain-nav-reviewer` (this
  cycle touches `src/systems/environment/**` only, which is outside
  both reviewer scopes).
- Orchestrator reviews each PR for memo + acceptance match,
  visual screenshot included in PR description, file:line citations
  for the relevant `HosekWilkieSkyBackend.ts` lines.

## Acceptance Criteria (cycle close)

- All 3 task PRs merged.
- Paired pre/post screenshots committed under
  `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/` (a
  `*-cycle-close.png` series alongside the existing `*-post-merge.png`).
- Owner-playtest "looks like the pre-merge sky again" sign-off
  recorded in cycle close commit message.
- No perf regression > 5% p99 on `combat120`.
- `KB-SKY-BLAND` row in `docs/CARRY_OVERS.md` already-Closed entry
  updated with this cycle's close-commit SHA + screenshot path.

## Out of Scope

- Re-introducing per-cloud highlight / shadow math. Defer to a
  future cloud-fidelity cycle if owner playtest after this cycle
  flags the cloud structure as still flat.
- Re-introducing the retired `CloudLayer` plane.
- Switching to a real Hosek-Wilkie coefficient pipeline (the
  current Preetham approximation stays).
- TSL fragment-shader sky port. That's the trigger for the
  `cycle-konveyer-large-file-splits` `HosekWilkieSkyBackend` half;
  not on this cycle's queue.
- Any product-code touches outside `src/systems/environment/**`.
- Fenced-interface touches.
- Perf-baseline refresh.

## Carry-over impact

KB-SKY-BLAND was already moved to Closed in `docs/CARRY_OVERS.md` on
the prior cycle's close with the resolution "promoted to fix cycle
`cycle-sky-visual-restore`." This cycle ships the fix; no carry-over
movement needed (the row stays in Closed). Net cycle delta: 0.
