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
- GLB-backed vegetation impostors apply a stronger source-match foliage color
  curve (`foliageColorGamma=1.75`, `foliageSaturation=1.0`) before rig
  lighting. Scene A/B showed fog/exposure-only and alpha-ramp experiments did
  not materially solve the pale-card failure; the color response did.
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

Live-scene review variants can also tune the color response without code edits:
`scripts/scene-parity-probe.ts` accepts `--veg-impostor-color-gamma` and
`--veg-impostor-saturation` in addition to the fog, exposure, and transition
flags. Use those flags for owner A/B screenshots; do not treat a variant as
accepted until it is promoted to the default and rerun clean.

## Proof Commands

```bash
npm run assets:bleed-vegetation-atlases -- --check
npm run check:vegetation-lod-review -- --only jungle-tree,fan-palm,understory-fern --stages daylight,low-sun,humid-fog
npm run check:vegetation-lod-review
npx tsx scripts/scene-parity-probe.ts --renderer webgpu-strict --headed --modes open_frontier,a_shau_valley --force-build --veg-impostor-transition-meters 28
```

Latest useful candidate artifacts:

- `artifacts/vegetation-lod-review/2026-06-26T21-01-52-536Z`
  - clean-head focused source-vs-impostor matrix for
    `b02cd5cfc4241d922fa4ae017df3a2c4a4a11ad2`
  - `summary.json` records `sourceGitStatus: []`
  - 12/12 pass across the pale-risk review set:
    fan-palm, jungle-tree, rubber-a, and teak-a x daylight / low-sun /
    humid-fog
- `artifacts/perf/2026-06-26T21-03-04-836Z/scene-parity/scene-parity.md`
  - clean-head Open Frontier + A Shau strict-WebGPU focused scene pass for
    `b02cd5cfc4241d922fa4ae017df3a2c4a4a11ad2`
  - `scene-parity.json` records `sourceGitStatus: []`
  - material probes confirm the default static-impostor batches use
    `foliageColorGamma=1.75`, `foliageSaturation=1`, default fog/exposure, and
    `transitionMeters=28`
  - per-archetype vegetation-focus screenshots were captured for all seven
    active GLB-backed vegetation impostors in both Open Frontier and A Shau
  - Open Frontier worst remaining pale-risk samples: rubber-a
    `luma=0.396`, `saturation=0.528`, `pale=0.405`, `overexposed=0.000`;
    teak-a `luma=0.338`, `saturation=0.574`, `pale=0.316`,
    `overexposed=0.000`
  - A Shau samples stayed integrated with the terrain/fog; rubber-a
    `luma=0.288`, `saturation=0.510`, `pale=0.240`, `overexposed=0.000`
  - still `warn` only because finite-edge evidence remains screenshot-review
    based
- `artifacts/vegetation-lod-review/2026-06-26T20-07-47-999Z`
  - clean-head full-catalog matrix for `35d8e8913d6cdb2c5dc20a911fa60ed961327794`
  - `summary.json` records `sourceGitStatus: []`
  - 39/39 pass across 13 vegetation assets x daylight / low-sun / humid-fog
- `artifacts/perf/2026-06-26T20-05-50-152Z/scene-parity/scene-parity.md`
  - clean-head Open Frontier + A Shau strict-WebGPU focused scene pass for
    `35d8e8913d6cdb2c5dc20a911fa60ed961327794`
  - Open Frontier static impostor fog is compressed from the rig color to
    `rgb(0.620, 0.700, 0.740)` before manual card fog mixing
  - vegetation focus metrics record Open Frontier `luma=0.213`,
    `saturation=0.655`, `overexposed=0.000`; A Shau `luma=0.250`,
    `saturation=0.406`, `overexposed=0.000`
  - still `warn` only because finite-edge evidence is screenshot-review based
- `artifacts/perf/2026-06-26T20-19-28-599Z/scene-parity/scene-parity.md`
  - clean-head A/B pass with `vegImpostorFogStrength=0.62`,
    `vegImpostorExposureScale=0.86`, and `vegImpostorTransitionMeters=28`
  - material probes confirm the variant reached the static-impostor batches
    (`fogStrength=0.62`, `foliageExposure=0.479536`)
  - screenshot crop sampling did not show a meaningful visual move versus the
    default: Open Frontier pale-pixel ratio changed `0.0445 -> 0.0428`; A Shau
    changed `0.3041 -> 0.3036`
  - conclusion: do not promote the reduced-fog/exposure variant as a default
    fix without owner preference; the remaining pale clumps are not primarily
    solved by these two material uniforms
- `artifacts/vegetation-lod-review/2026-06-26T20-04-15-125Z`
  - clean-head focused matrix for bamboo-grove, fan-palm, jungle-tree, and
    understory-fern after the capture-normal, fog, and direct-light candidate
    changes
- `scripts/scene-parity-probe.ts`
  - live-scene proof now includes a `vegetation-focus` screenshot in addition to
    ground / elevated / skyward / finite-edge poses
  - the focused pose is derived from active vegetation static-impostor batches
    and records the selected slug, source position, promotion distance, demotion
    distance, transition fade width, active mesh/impostor/crossfade state, luma,
    saturation, and overexposure metrics
- `artifacts/perf/2026-06-26T19-50-19-966Z/scene-parity/scene-parity.md`
  - superseded dirty-source Open Frontier + A Shau pass from before the
    `35d8e891` commit; useful only as provenance for the normal/fog fix
- `artifacts/vegetation-lod-review/2026-06-26T18-12-44-039Z`
  - superseded clean-head full-catalog matrix from before the capture-normal and
    fog-compression follow-up
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
  `artifacts/vegetation-lod-review/2026-06-26T21-01-52-536Z`
- live scene focus captures from:
  `artifacts/perf/2026-06-26T21-03-04-836Z/scene-parity/scene-parity.md`

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

Current review risk: the candidate intentionally favors darker, more saturated
foliage than the rejected path because that is what moves the live scene away
from fog-bleached cards. Open Frontier rubber-a still has some pale lower-canopy
detail against dark terrain, even though it no longer reads like the washed old
surface-normal column. A Shau still depends heavily on scene fog and terrain
exposure. The latest probes show zero overexposed vegetation-focus pixels, but
owner review decides whether the remaining pale clumps are acceptable
integration or need another bake/material variant.

Reduced-fog/exposure review path: the fourth octa-impostor review column and the
scene-parity `--veg-impostor-fog-strength 0.62
--veg-impostor-exposure-scale 0.86` flags are evidence-generation only, not the
accepted shipped default. The clean A/B scene pass above shows this variant is
not a strong fix for the remaining Open Frontier / A Shau pale-clump risk; keep
it available for owner comparison, but do not ship it as the answer by default.
The color-curve default is the current production candidate.

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
