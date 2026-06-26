# Vegetation LOD Visual Acceptance

Status: candidate branch, owner acceptance pending, not deployed.

Goal: make vegetation far representations match their GLB/source assets across
lighting, fog, and LOD snap distances before production deploy.

## Candidate

- Runtime static vegetation impostors use the `foliage-card` lighting profile.
- The profile now preserves baked normal-atlas shape detail, shares the accepted
  foliage rig response, applies a static-hero exposure trim, hardens alpha like
  the accepted billboard path, and receives scene/rig fog uniforms.
- Vegetation impostor and ground-card atlases have RGB alpha bleed applied to
  reduce mip/filter dark-edge contamination.
- Static vegetation impostor atlases were rebaked from source GLBs after fixing
  the baker to preserve vertex colors in the base-color pass.
- Static vegetation impostor normal atlases are now treated as capture/view-space
  normals from the bake and transformed into the runtime camera/world lighting
  basis before sun and hemisphere lighting are evaluated.
- Static alpha impostors compress high-radiance lighting-rig fog colors before
  manual fog mixing, preserving fog hue without washing cards toward white in
  Open Frontier daylight.
- GLB-backed vegetation impostors use a source-like clamped direct-light term
  instead of the wrapped billboard foliage term that over-lifted backfaces.
- Vegetation-owned hero impostors now use a mesh-to-impostor crossfade band at
  the LOD boundary, so the source GLB and far card overlap during promotion and
  demotion instead of hard-snapping visibility in one frame.

## Review Surface

Dev route:

```bash
npm run dev
# open /?mode=vegetation-lod-review&asset=jungle-tree&stage=daylight
```

Controls:

- `[` / `]` selects assets.
- `1` daylight haze, `2` low warm sun, `3` humid fog.

The route renders:

- source GLB
- old surface-normal impostor comparison, for octahedral hero assets
- current foliage-card impostor candidate, for octahedral hero assets
- review-only reduced-fog/exposure foliage-card candidate, for octahedral hero
  assets
- current ground-card candidate, for dense cover assets

The reduced-fog column uses the same atlas, lighting profile, and source GLB as
the current runtime path. Only the custom static-impostor material's
`fogStrength` and `foliageExposure` uniforms are reduced for review comparison;
normal launches keep the default shipped values.

## Proof Commands

```bash
npm run assets:bleed-vegetation-atlases -- --check
npm run check:vegetation-lod-review -- --only jungle-tree,fan-palm,understory-fern --stages daylight,low-sun,humid-fog
npm run check:vegetation-lod-review
npx tsx scripts/scene-parity-probe.ts --renderer webgpu-strict --headed --modes open_frontier,a_shau_valley --veg-impostor-fog-strength 0.62 --veg-impostor-exposure-scale 0.86 --veg-impostor-transition-meters 28
```

Latest useful candidate artifacts:

- `artifacts/perf/2026-06-26T19-50-19-966Z/scene-parity/scene-parity.md`
  - dirty-source Open Frontier + A Shau strict-WebGPU focused scene pass after
    capture-normal transform, fog compression, and source-like direct lighting
  - Open Frontier static impostor fog is compressed from the rig color to
    `rgb(0.620, 0.700, 0.740)` before manual card fog mixing
  - still `warn` only because finite-edge evidence is screenshot-review based
- `artifacts/vegetation-lod-review/2026-06-26T19-49-13-051Z`
  - focused bamboo-grove + fan-palm daylight / humid-fog matrix after the same
    normal, fog, and direct-light candidate changes
- `artifacts/vegetation-lod-review/2026-06-26T18-12-44-039Z`
  - clean-head full-catalog matrix for `cfa260aa481b17ae84c8190ac738c8a0ef0fad94`
  - `summary.json` records `sourceGitStatus: []`
  - 39/39 pass across 13 vegetation assets x daylight / low-sun / humid-fog
- `scripts/scene-parity-probe.ts`
  - live-scene proof now includes a `vegetation-focus` screenshot in addition to
    ground / elevated / skyward / finite-edge poses
  - the focused pose is derived from active vegetation static-impostor batches
    and records the selected slug, source position, promotion distance, demotion
    distance, transition fade width, active mesh/impostor/crossfade state, luma,
    saturation, and overexposure metrics
- `artifacts/perf/2026-06-26T17-56-45-512Z/scene-parity/scene-parity.md`
  - superseded by the focused-pose probe for final owner review, but useful
    provenance for the first strict-WebGPU live-scene pass
- `artifacts/vegetation-lod-review/2026-06-26T17-43-20-798Z`
  - superseded by the clean-head `18-12-44-039Z` matrix above
- `artifacts/vegetation-lod-review/2026-06-26T17-33-54-195Z`
  - representative post-alpha-hardening matrix, 5 assets x 3 lighting/fog stages
- `artifacts/vegetation-lod-review/2026-06-26T17-32-31-051Z`
  - daylight quick check after alpha hardening, fan-palm + jungle-tree
- `artifacts/vegetation-lod-review/2026-06-26T17-28-00-219Z`
  - representative matrix after rebaking static vegetation atlases

## Acceptance

Owner review should cover both surfaces:

- isolated source-vs-far matrix:
  `artifacts/vegetation-lod-review/2026-06-26T18-12-44-039Z`
- live scene focus captures from:
  `npx tsx scripts/scene-parity-probe.ts --renderer webgpu-strict --headed --modes open_frontier,a_shau_valley`

Accept this path only if:

- the current `foliage-card` impostor no longer reads as the pale/washed old
  `surface-normal` billboard at LOD snap
- daylight, low-sun, and humid-fog stages stay close enough to the source GLB
  for each shipped vegetation asset
- Open Frontier and A Shau focused scene screenshots read as terrain/fog
  integrated vegetation instead of pasted cards
- hero impostor promotion/demotion distances and active mesh-vs-impostor state
  are present in the scene-parity report for both maps
- the focused live-scene LOD pose shows whether any vegetation instances are in
  the crossfade band rather than only proving binary mesh/impostor state

Current review risk: the candidate intentionally favors darker, less shiny
foliage than the rejected path. Some mid-distance bamboo / A Shau focus shots
can still read pale because they are participating in scene fog; owner review
decides whether that is acceptable or needs another exposure/fog variant.

Reduced-fog/exposure review path: use the fourth octa-impostor review column and
the scene-parity `--veg-impostor-fog-strength 0.62
--veg-impostor-exposure-scale 0.86` flags to compare whether less fog mix and a
modest exposure trim keep the source silhouette/color closer in humid shots and
dark live terrain without making daylight/low-sun cards look pasted on. This is
evidence-generation only, not the accepted shipped default.

LOD snap review path: normal vegetation launches use a 28 m transition band
(`vegImpostorTransitionMeters=28`) around the hero impostor promotion/demotion
thresholds. Use `vegImpostorTransitionMeters=0` for an A/B capture against the
old binary snap, or widen/narrow the value in scene parity to test whether
overlap hides the material delta without making far cards look doubled.

Do not deploy this as accepted until the owner confirms the current far
representation is the chosen path. If rejected, use the review route to compare
additional exposure, fog, alpha, or bake variants before changing production
defaults, then rerun the clean-head review matrix and the Open Frontier + A Shau
scene-parity focused proof.
