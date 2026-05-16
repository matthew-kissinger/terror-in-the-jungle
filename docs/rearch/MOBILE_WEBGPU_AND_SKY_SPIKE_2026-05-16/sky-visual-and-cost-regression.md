# Sky Visual + Cost Regression — Investigation Memo

Cycle: `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` (R1)
Slug: `sky-visual-and-cost-regression`
Status: investigation, memo-only PR

## Headline

(a) Visual: the post-merge sky is bland because the per-fragment GLSL
analytic sky was replaced with a **128×64 CPU-baked DataTexture** sampled
through a default `MeshBasicMaterial`, which (1) drops effective sky
resolution by ~3 orders of magnitude, (2) clamps all radiance to `[0,1]`
before sRGB encode so the HDR sun/saturation headroom the previous
shader fed into ACES is gone, (3) routes the dome through
`renderer.toneMapping = ACESFilmicToneMapping` (the pre-merge
`ShaderMaterial` deliberately bypassed `tonemapping_fragment`), and
(4) replaced the per-fragment 5-octave cloud + HG sun-disc with a
sparse CPU mix that fires every 2 s into the same 8192-texel buffer.

(b) Cost: on the WebGL2 fallback the post-merge sky drops fragment-shader
cost to **near-zero** (one textured sphere, no math, no fbm) while
adding a CPU baking burst capped at one fire per 2 s. The math we used
to run per-fragment now runs over 8192 texels on the JS thread and
uploads the result via `texture.needsUpdate = true`. The dominant
sky-pass cost on the post-merge fallback is therefore CPU, not GPU; the
GPU sky cost is lower than pre-merge — but the texture is so coarse
that the visual gradient is destroyed (see (a)).

The regression is overwhelmingly a **visual fidelity** loss, not a perf
loss. The cost trade went the wrong way: the post-merge path is cheaper
on GPU but visually unacceptable.

## Method

1. **Code diff.** Pre-merge SHA: `79103082` (the commit immediately
   before the KONVEYER merge `1df141ca`). Compared current
   `HosekWilkieSkyBackend.ts` + `AtmosphereSystem.ts` against
   `git show 79103082:<path>`. Also walked back the two intermediate
   commits that did the bulk of the change:
   - `09d0b562` — `refactor(konveyer): retire hidden cloud plane`
     (deleted `src/systems/environment/atmosphere/CloudLayer.ts`,
     -351 LoC).
   - `8f3d560b` — `refactor(konveyer): render sky dome with standard
     material` (deleted `hosekWilkie.glsl.ts` -214 LoC, swapped
     `ShaderMaterial` → `MeshBasicMaterial` reading a baked
     `DataTexture`).
   - `88e30d02` — `fix(konveyer): restore strict webgpu terrain visuals`
     (added the `compressSkyRadianceForRenderer` cap @ 0.84 / 0.74 to
     the fog + hemisphere readers).
2. **Screenshots.** The fresh post-merge captures were produced by
   running the existing
   `scripts/capture-hosek-wilkie-shots.ts --label post` on this
   worktree against `dist-perf/` (Vite preview, perf-harness bundle,
   1920×1080, Playwright Chromium, default renderer mode `'webgpu'`
   with WebGL2 fallback path available). The pre-merge captures are
   the trusted master baselines committed under
   `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/cloud-audit-and-polish/after-*.png`
   — they were taken during `cycle-2026-04-22-heap-and-polish` against
   the shader-material sky + cloud-runtime cycle output (the state of
   master through `cycle-2026-04-24-architecture-recovery` and into
   pre-merge `79103082`).
3. **WebGL2-fallback cost.** Reasoned through the code paths and the
   commit comments. No live perf-capture against forced WebGL2
   fallback was run — the trusted pre-merge perf baselines in
   `perf-baselines.json` carry no sky-specific entry, and the cycle
   brief explicitly accepts code-diff + perf-baseline reasoning for
   part (b) if a direct capture isn't feasible.

## Part (a): What changed visually

### Smoking gun: dome rendering primitive

**Pre-merge** (`79103082:src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`):
```ts
// pre-merge L84-101
this.material = new THREE.ShaderMaterial({
  name: 'HosekWilkieSky',
  uniforms: { /* ... 11 uniforms ... */ },
  vertexShader: hosekWilkieVertexShader,
  fragmentShader: hosekWilkieFragmentShader,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
});
```

The fragment shader (`79103082:src/systems/environment/atmosphere/hosekWilkie.glsl.ts:139-209`)
ran a Preetham radiance integration + 5-octave cloud fbm + HG sun-disc
per **screen fragment** (~2M fragments on a 1920×1080 viewport).
Crucially, the shader's closing line (`hosekWilkie.glsl.ts:208`):
```glsl
gl_FragColor = vec4( texColor, 1.0 );
```
was deliberately written with no `tonemapping_fragment` /
`colorspace_fragment` includes (see the file-level comment at
`hosekWilkie.glsl.ts:16-20`): "Shader is intentionally self-contained
... so the dome's output color matches what the CPU-side LUT bakes —
keeps the fog tint readout in sync with the dome render".

The shader's sun-disc was a 19000× radiance pin-point:
```glsl
// pre-merge hosekWilkie.glsl.ts:158-160
float sundisc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
L0 += ( vSunE * 19000.0 * Fex ) * sundisc;
```

**Post-merge** (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:207-214`):
```ts
this.material = new THREE.MeshBasicMaterial({
  name: 'HosekWilkieSky',
  map: this.skyTexture,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  fog: false,
});
```

Where `this.skyTexture` is a `THREE.DataTexture` of dimensions
`SKY_TEXTURE_WIDTH = 128, SKY_TEXTURE_HEIGHT = 64` (see lines `9-10`).
A `MeshBasicMaterial` does **not** set `toneMapped: false`, so the
default-true value applies: the dome now passes through the renderer's
`ACESFilmicToneMapping` (`src/core/GameRenderer.ts:145-146`) — exactly
the pass the pre-merge shader deliberately bypassed.

### Four compounding losses

Each of these is independently visible in the screenshots; together
they read as "bland".

1. **Texture resolution: 128×64 = 8192 texels.** On a 1920×1080
   viewport the visible hemisphere covers ~1920 horizontal pixels;
   bilinear filter on a 128-wide texture stretches each texel across
   ~15 screen pixels. The Preetham radiance gradient is smooth at the
   sub-degree scale, but the sun disc (sub-pixel pre-merge,
   ~19000× radiance) ends up averaged into the surrounding ~7×7 texel
   block before it ever reaches the fragment.
   See: `HosekWilkieSkyBackend.ts:9-10` (constants),
   `HosekWilkieSkyBackend.ts:67-79` (bake target),
   `HosekWilkieSkyBackend.ts:436-525` (refresh loop).

2. **HDR clamp at bake time.** The pre-merge fragment shader emitted
   un-clamped radiance — `Lin = pow( ... , vec3(1.5) )` plus
   `L0 += vSunE * 19000.0 * Fex * sundisc`. The post-merge CPU mirror
   in `evaluateAnalytic` does the same Preetham math but clamps the
   final radiance:
   ```ts
   // HosekWilkieSkyBackend.ts:801-805
   out.setRGB(
     Math.max(0, Math.min(8, r)),
     Math.max(0, Math.min(8, g2c)),
     Math.max(0, Math.min(8, b))
   );
   ```
   then the refresh loop slams the result into a `Uint8Array` via
   `sqrt`-gamma encoding (see `HosekWilkieSkyBackend.ts:512-515`):
   ```ts
   data[offset++] = Math.round(Math.sqrt(clamp01(r)) * 255);
   data[offset++] = Math.round(Math.sqrt(clamp01(g)) * 255);
   data[offset++] = Math.round(Math.sqrt(clamp01(b)) * 255);
   ```
   `clamp01` snips at 1.0 — the entire HDR headroom (the bright
   noon-blue and the pearl-white sun) gets clipped to a fixed
   ceiling before sRGB encode. Pre-merge ACES wasn't running on the
   dome at all; with the post-merge clamp, even when ACES does run,
   it has no over-1 input to compress meaningfully, so the result is
   already at LDR before tone mapping touches it.

3. **ACES on the sky dome.** `MeshBasicMaterial` defaults `toneMapped`
   to `true`. With `renderer.toneMapping = THREE.ACESFilmicToneMapping`
   (`src/core/GameRenderer.ts:145`), ACES is applied to the dome each
   frame. ACES on LDR input desaturates and pulls everything toward
   middle grey — exactly the look in the post-merge captures.
   Combined with (2), the dome's saturated horizon ring and noon-blue
   zenith collapse to a near-uniform pale grey-blue.

4. **Sun disc gone.** Post-merge `mixSunDisc`
   (`HosekWilkieSkyBackend.ts:548-556`):
   ```ts
   if (sunDot <= 0.9992) return;
   const strength = smoothstep(0.9992, 0.99992, sunDot);
   color.lerp(this.sunColor, strength);
   ```
   `this.sunColor` is **normalised to peak 1.0** at bake time
   (`HosekWilkieSkyBackend.ts:655-657`). So the strongest the sun can
   ever bias the sky color is "fully lerp to a sRGB-1 color" — no
   bloom, no chromatic halo. Pre-merge: 19000× radiance with a
   sub-pixel angular size, then no tonemapping pass — a true pearl.
   Post-merge: an 8-pixel-wide texel-cluster of a normal-color lerp,
   then tonemapped flat. The owner-visible "no sun" symptom is
   primarily this.

5. **Cloud structure flattened.** Pre-merge `cloudFragmentShader`
   (`79103082:hosekWilkie.glsl.ts:166-201`) combined three layered
   fbm samples (`base`, `bodyDetail`, `edgeDetail`), a per-azimuth
   `horizonWisps` term, and a per-fragment sun-facing highlight
   (`pow(sunFacing, 1.4)`). Post-merge `cloudMaskAtDirection`
   (`HosekWilkieSkyBackend.ts:572-596`) does a **single** 5-octave
   fbm sample plus a `large` modulator, lerped per-texel into a
   warm-grey constant via `mixCloudDeck`
   (`HosekWilkieSkyBackend.ts:558-570`):
   ```ts
   this.scratchCloudColor.setRGB(
     0.78 + this.sunColor.r * 0.16,
     0.80 + this.sunColor.g * 0.14,
     0.84 + this.sunColor.b * 0.12
   );
   ```
   That's a flat off-white with at most ±0.16 of warm sun bias —
   no per-cloud highlight, no shadow, no edge feather.

### Cloud plane retired

Cycle 2026-04-24 (`architecture-recovery-atmosphere-evidence`, commit
`09d0b562`) deleted `CloudLayer.ts` and its 351-line dedicated cloud
plane with its own multi-octave fbm shader, large-field modulator, and
sun-facing pseudo-normal lighting. The post-merge sky-dome cloud pass
(item (5) above) is the **only** cloud rendering. The pre-merge captures
in `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/cloud-audit-and-polish/after-*.png`
still show the CloudLayer plane in the sky (the white wedges in the
upper portion of the frame are the finite plane's footprint). That
specific visual is gone post-merge by design — the hard horizon
divider was the documented motivation — but the **replacement** path
(item (5)) is much less interesting visually than the original sky-dome
shader's per-fragment cloud term.

### Tabulated visual changes

| Aspect | Pre-merge (`79103082`) | Post-merge (master) | File:line |
|---|---|---|---|
| Dome material | `ShaderMaterial` (per-fragment Preetham) | `MeshBasicMaterial` reading `DataTexture` | `HosekWilkieSkyBackend.ts:207-214` |
| Effective sky resolution | per-fragment (~2M @ 1080p) | 128×64 = 8192 texels, bilinear | `HosekWilkieSkyBackend.ts:9-10` |
| HDR range | un-clamped radiance | `evaluateAnalytic` clamps to [0,8], `refreshSkyTexture` clamps to [0,1] before sRGB encode | `HosekWilkieSkyBackend.ts:801-805`, `512-515` |
| Tonemapping on dome | bypassed (shader comment: `hosekWilkie.glsl.ts:16-20`) | ACESFilmic via default `MeshBasicMaterial.toneMapped=true` + `renderer.toneMapping = ACESFilmicToneMapping` | `HosekWilkieSkyBackend.ts:207-214`, `GameRenderer.ts:145` |
| Sun disc magnitude | `vSunE * 19000.0 * Fex` HDR pin-point | `color.lerp(sunColor, smoothstep)` with `sunColor` peak-normalised to 1.0 | pre `hosekWilkie.glsl.ts:158-160` / post `HosekWilkieSkyBackend.ts:548-556`, `655-657` |
| Sun disc angular size | `cos(angDiam) = 0.9998` (~1.1° wide, sub-pixel sharp inner edge) | smoothstep 0.9992 → 0.99992 (~3-4° wide soft blob) | `HosekWilkieSkyBackend.ts:553-554` |
| Cloud math | 3 fbm samples + 5-octave large-field + per-fragment sun-facing highlight (`pow(sunFacing, 1.4)`) + 4 detail/edge masks | single 5-octave fbm sample, large-field modulator only, no per-cloud lighting | pre `hosekWilkie.glsl.ts:155-202` / post `HosekWilkieSkyBackend.ts:572-596` |
| Cloud color | per-fragment shadow→highlight lerp with sun-facing dot | flat off-white + ±0.16 sun bias, single `setRGB` per texel | post `HosekWilkieSkyBackend.ts:564-568` |
| Cloud plane | 36 km transparent `CloudLayer` plane with own shader (white wedges in pre-merge shots) | deleted in `09d0b562` (`refactor(konveyer): retire hidden cloud plane`) | `09d0b562` |
| Refresh cadence | per-frame fragment shader | sky texture re-baked every 2.0 s (idempotent on no-change scenarios) | `HosekWilkieSkyBackend.ts:26`, `283-290` |
| Fog/hemisphere cap | sampled un-clamped | `compressSkyRadianceForRenderer` caps to 0.84 / 0.74 | `AtmosphereSystem.ts:33-34`, `40-49` (added in `88e30d02`) |

### Screenshots

Pairs are at the same scenario + framing. Pre-merge images
(`*-pre-merge.png`) come from
`docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/cloud-audit-and-polish/after-*.png`
(shader-material sky + CloudLayer + per-fragment cloud math).
Post-merge images (`*-post-merge.png`) were captured fresh on this
worktree against current master via
`scripts/capture-hosek-wilkie-shots.ts --label post`.

| Scenario | Pre-merge | Post-merge |
|---|---|---|
| Open Frontier (noon) | `img/openfrontier-noon-pre-merge.png` | `img/openfrontier-noon-post-merge.png` |
| Combat120 (noon) | `img/combat120-noon-pre-merge.png` | `img/combat120-noon-post-merge.png` |
| A Shau (dawn) | `img/ashau-dawn-pre-merge.png` | `img/ashau-dawn-post-merge.png` |
| TDM (dusk) | `img/tdm-dusk-pre-merge.png` | `img/tdm-dusk-post-merge.png` |
| ZC (golden hour) | `img/zc-golden-hour-pre-merge.png` | `img/zc-golden-hour-post-merge.png` |

Open Frontier is the reference scene named in the brief.
Post-merge: the sky is a near-uniform pale grey across all scenarios,
with no visible sun, no horizon ring, no cloud structure — the
post-merge cumulus mask shows only as a slightly less-pale region
at high elevation in the noon shots.
Pre-merge: vivid saturated horizon-to-zenith gradient, bright pearl
sun, distinct cloud structure with shadow + highlight, and a clear
warm horizon halo at dawn / dusk / golden hour.

Caveat: the pre-merge captures are framed from a different time of day
than the post-merge captures because the active scenario-preset
`todCycle` advances simulated time during the 6-8 s settling window.
The takeaway — pre-merge has rich saturation + visible sun, post-merge
has neither at the same elevation — is robust to that drift. Pre-merge
captures also still show the CloudLayer plane as a wedge in the upper
frame; the post-merge replacement is the sky-dome cloud mix
exclusively.

## Part (b): WebGL2 fallback cost

### GPU cost trade

Pre-merge sky pass on WebGL2 (the only available path before
`1df141ca`):

- Vertex shader: 4-line transform on a 64×32 dome → ~2k vertices.
- Fragment shader (per fragment on the visible hemisphere of a 500-unit
  dome, ~1-1.5M fragments at 1920×1080 with terrain occluding the
  lower half):
  - `acos`, `cos`, `pow(..., -1.253)` for optical-path math.
  - `exp(-(vBetaR * sR + vBetaM * sM))` (Fex, vec3).
  - `pow(... , vec3(1.5))` (Lin scaling).
  - `pow(cosTheta, 2.0)` (Rayleigh phase).
  - HG phase `1.0 / pow(1.0 - 2*g*cos + g², 1.5)`.
  - Plus the 5-octave fbm + 3 additional fbm samples per cloud-shaded
    fragment, **per frame**.
  - No texture sample.

Post-merge sky pass on WebGL2 fallback:

- Vertex shader: same 64×32 dome.
- Fragment shader: `MeshBasicMaterial` map sample, one `texture2D` lookup
  per fragment. Linear bilinear filter, RGBA8, no mipmaps configured
  (the texture has `LinearFilter` for both min/mag, see
  `HosekWilkieSkyBackend.ts:77-78`).
- ACES tonemapping pass (added by the standard material chunk).

Net GPU: **post-merge is much cheaper per frame on WebGL2** — a single
texture lookup vs. Preetham radiance + 4 fbm samples + HG phase per
fragment. The exact magnitude depends on mobile fragment shader
performance, but the ratio is conservatively >10× cheaper on GPU.

### CPU cost added

Post-merge moves all of that math to the CPU, in `refreshSkyTexture`:

- 8192 texels (128×64).
- Per texel: bilinear LUT sample (4 reads + 4 multiplies + add),
  `mixSunDisc` (one dot + branch), `mixCloudDeck` (calls
  `cloudMaskAtDirection` which runs the same 5-octave fbm as the
  pre-merge shader did per fragment — but at LUT-texel rate, not
  fragment rate).
- Refresh fires once per 2.0 s (`SKY_TEXTURE_REFRESH_SECONDS`,
  `HosekWilkieSkyBackend.ts:26`), gated on `skyTextureDirty` +
  `skyContentChanged` (`HosekWilkieSkyBackend.ts:283-290`,
  `437-441`), so static-scene scenarios skip refresh entirely.
- Telemetry counters
  (`HosekWilkieSkyBackend.ts:447-448, 522-525`,
  `AtmosphereSystem.getSkyRefreshStatsForDebug` at
  `AtmosphereSystem.ts:304-306`) are already wired so any follow-on
  fix cycle can measure refresh cost directly without code changes.
- Result is then uploaded via `texture.needsUpdate = true`.
- Comment at `HosekWilkieSkyBackend.ts:17-26` records that slice 13 +
  14 measured the refresh cost as the dominant contributor — empirical
  EMA ~5 ms for the 8192-pixel compositing loop at the previous 0.5 s
  cadence; bumping to 2.0 s dropped it ~4×.

### Pre-merge perf-baseline reference

`perf-baselines.json` carries no sky-specific entry. The closest proxy
is the per-scenario `avgFrameMs` budget on `combat120` (15.08 ms warn)
and `openfrontier:short` (8.63 ms warn) — both well under WebGL2
mobile budget on desktop, and neither attributes a fraction to the sky
pass. No direct fallback-only sky number exists in the repo to
compare against.

The trustworthy quantitative claim is therefore code-shape, not
measured ms:

- **Post-merge fallback sky GPU cost ≪ pre-merge fallback sky GPU
  cost.** One textured sphere vs. a Preetham + fbm fragment shader.
- **Post-merge fallback sky CPU cost > pre-merge fallback sky CPU
  cost.** Pre-merge: zero (only LUT bake at sun-direction change,
  same as post-merge). Post-merge: 8192-texel compositing loop on
  the JS thread every 2 s when the scene changes.
- **Net sky-pass cost on WebGL2 fallback: post-merge is cheaper at the
  GPU and modestly more expensive at the CPU.** That trade is fine on
  desktop. On mobile, where the JS thread is often the binding budget,
  the 2 s burst is more harmful than the GPU fragment shader would
  have been — but the GPU shader cost is also more harmful on mobile.
  Direct mobile measurement would be needed to call the net winner.

### Limitation: no live WebGL2-fallback capture

A direct measurement of the post-merge sky pass on a forced WebGL2
fallback (`strictWebGPU=false` path on a no-WebGPU browser) was not
performed. The capture script that produced the post-merge screenshots
uses default Chromium settings, which means it likely ran in WebGPU
mode (the post-merge default per `1df141ca` and `4aec731e`). The
screenshots are still valid for part (a) — the visual symptom is the
same on either renderer, because the bake path is shared CPU code and
the dome material does not branch on backend.

For part (b), the trust falls on the code-shape reasoning above. The
follow-on fix cycle should re-measure once the visual is restored, to
confirm the cost trade is within mobile budget.

## Top-3 suspect lines / blocks

1. **`HosekWilkieSkyBackend.ts:9-10` + `:67-79`** —
   `SKY_TEXTURE_WIDTH = 128`, `SKY_TEXTURE_HEIGHT = 64`. The 128×64
   resolution is the single biggest contributor to blandness; doubling
   (256×128 = 32k texels) is still cheap and would restore visible sun
   placement + horizon ring. Quadrupling (512×256 = 131k texels) is
   the floor where the Preetham gradient reads cleanly on a 1080p
   viewport.
2. **`HosekWilkieSkyBackend.ts:207-214` (material) + the missing
   `toneMapped: false`** — the dome is now subject to ACES tonemapping
   that the pre-merge shader explicitly bypassed. Setting
   `toneMapped: false` on the `MeshBasicMaterial` is a one-line fix
   that restores pre-merge color handling on the dome. The
   `compressSkyRadianceForRenderer` cap in `AtmosphereSystem.ts:40-49`
   is correct for the downstream fog + hemisphere readers and should
   stay; the bug is that the dome itself shouldn't get tonemapped.
3. **`HosekWilkieSkyBackend.ts:548-556` (`mixSunDisc`) + `:655-657`
   (sun-color normalisation)** — the sun disc is per-texel lerped into
   a normalised-to-peak-1.0 color, so it never exceeds 1.0 even before
   the sRGB clamp. The pre-merge `vSunE * 19000.0 * Fex` HDR pearl was
   the only thing that turned the sun white-hot. Restoring an
   un-normalised HDR sun-color path (or compositing the sun disc at a
   shader stage downstream of the bake) is the second-most-impactful
   visual fix.

Cloud-system fidelity (`HosekWilkieSkyBackend.ts:558-596`) is a
distant 4th — fixing items 1-3 will already restore the bright-sun +
saturated-blue look the user remembers; the cloud math can stay as-is
or be re-enriched in a separate cycle once the dome dynamic range is
back.

## Suggested fix-cycle scope (input to R2 alignment memo)

This memo recommends one fix cycle scoped to **dome dynamic range +
resolution**, not a full re-write:

1. Set `toneMapped: false` on the dome material
   (`HosekWilkieSkyBackend.ts:207-214`).
2. Bump `SKY_TEXTURE_WIDTH / SKY_TEXTURE_HEIGHT` to at least
   256×128, ideally 512×256 (measure first; `getRefreshStatsForDebug`
   at `HosekWilkieSkyBackend.ts:533-540` is already wired).
3. Stop clamping radiance to `[0,1]` at bake time. Either upload as
   `THREE.FloatType` / `THREE.HalfFloatType` `DataTexture`, or keep
   `UnsignedByteType` but encode a fixed exposure curve that
   preserves the sun-disc spike (e.g. tonemap on CPU into an LDR range
   the renderer-side ACES will then leave alone). Files:
   `HosekWilkieSkyBackend.ts:67-82` (texture creation),
   `:512-515` (encode), `:801-805` (range clamp).
4. Restore an HDR sun disc path. Easiest: drop a small additive
   sun-disc mesh (a `Sprite` or 2-tri quad) at the sun direction in
   `AtmosphereSystem` with its own tonemap-bypassed shader. Avoids
   re-introducing a per-fragment shader on the full dome while
   restoring the visible pearl.
5. Leave the 2.0 s refresh cadence; the visual loss is not cadence,
   it's dynamic range + resolution.

Out of scope for the proposed fix cycle (defer to a later one):
- Re-introducing per-cloud highlight + shadow math.
- Re-introducing the `CloudLayer` plane.
- Switching to a real Hosek-Wilkie coefficient pipeline.

## Citations index

- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:9-10`,
  `:26`, `:67-79`, `:77-78`, `:207-214`, `:283-290`, `:436-525`,
  `:512-515`, `:533-540`, `:548-556`, `:558-596`, `:564-568`,
  `:572-596`, `:655-657`, `:801-805`.
- `src/systems/environment/AtmosphereSystem.ts:33-34`, `:40-49`,
  `:304-306`.
- `src/core/GameRenderer.ts:145-146`.
- Pre-merge: `git show 79103082:src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:84-101`,
  `git show 79103082:src/systems/environment/atmosphere/hosekWilkie.glsl.ts:16-20`,
  `:96`, `:155-209`.
- Commits: `1df141ca` (merge), `79103082` (immediate pre-merge),
  `09d0b562` (cloud-plane retire), `8f3d560b` (standard-material port),
  `88e30d02` (sky-radiance cap).
