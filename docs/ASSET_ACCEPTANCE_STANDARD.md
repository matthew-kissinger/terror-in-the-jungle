# Asset Acceptance Standard

Last updated: 2026-05-02

This is the Phase 2 / Cycle 1 acceptance standard for Pixel Forge and other
runtime assets in Terror in the Jungle. It is a stabilization gate, not an art
direction memo: an asset can look good and still be rejected if it cannot prove
its upload, memory, draw-call, LOD, culling, and visual parity costs.

Current strategic constraint: reinforce WebGL for stabilization. Do not use an
asset review to start WebGPU migration work.

## Required Evidence

Every runtime asset acceptance note must include:

- Source commit SHA and artifact paths.
- Asset registry path or loader path.
- Runtime mode coverage: at minimum the mode that uses the asset, plus Open
  Frontier or A Shau when the asset can affect large-world rendering.
- Screenshot evidence for visual acceptance, unless the asset is invisible
  infrastructure.
- Perf or startup evidence when the asset changes texture residency, upload
  timing, draw calls, triangles, shader/program first-use, culling, or LOD.
- A statement of whether the evidence is trusted, diagnostic, or blocked.

Do not claim optimization or remediation without before/after numbers and the
artifact paths for both sides.

## Texture Policy

Mechanical gate:

```bash
npm run check:pixel-forge-textures
```

Acceptance rules:

- Every registered runtime texture must exist on disk and match the dimensions
  declared by `src/config/pixelForgeAssets.ts`.
- GPU residency must be estimated as uncompressed RGBA plus full mip chain.
  Source PNG byte size is not an acceptance proxy.
- A single runtime texture at or above `16MiB` estimated mipmapped RGBA is a
  warning and requires an explicit acceptance note.
- A single runtime texture at or above `32MiB` estimated mipmapped RGBA is
  blocked unless there is startup-upload evidence proving it is pre-uploaded
  behind a truthful loading state or replaced by a compressed, downscaled, or
  partitioned representation.
- Texture exceptions must include the largest-upload table from a startup UI
  artifact when the asset can participate in startup.

Current Cycle 1 measured context: the fresh texture audit at
`artifacts/perf/2026-05-02T22-04-56-474Z/pixel-forge-texture-audit/texture-audit.json`
still reports `38/42` registered Pixel Forge textures flagged, `781.17MiB`
estimated mipmapped RGBA residency, and `407.75MiB` candidate savings.

## Atlas Density

For billboard, imposter, and animated atlas assets:

- Runtime pixels per meter must be recorded from the atlas metadata and runtime
  size, not from source image dimensions alone.
- Vegetation atlases above `80px` per runtime meter require visual
  justification or regeneration at a lower tile size.
- NPC imposter atlases below `24px` per runtime meter require matched
  close-GLB/imposter screenshots before acceptance.
- Candidate atlas sizes are planning estimates until KB-OPTIK visual evidence
  proves silhouette readability, animation readability, luma parity, and LOD
  scale parity.

Mechanical supporting gates:

```bash
npm run check:pixel-forge-optics
npm run check:vegetation-horizon
```

These are static audits. They do not replace runtime screenshots.

## Normal Maps

Normal maps are accepted only when their runtime value beats their upload and
residency cost.

- Vegetation billboard/imposter normal maps must have a side-by-side screenshot
  comparison against the same species without the normal map under at least one
  representative daytime lighting state.
- Ground-cover and small mid-level vegetation should default to hemisphere
  lighting unless the normal map materially improves readability.
- Normal maps that exceed the `16MiB` warning threshold follow the same
  exception process as color textures.
- A normal-map removal or replacement cannot land without checking vegetation
  luma/chroma parity and fog/atmosphere integration.

## Triangle And Draw-Call Budgets

Budgets are provisional Cycle 1 WebGL stabilization gates. They can be adjusted
only with scene attribution and perf evidence.

| Asset class | Provisional budget | Required proof |
| --- | ---: | --- |
| Close NPC GLB | `<= 5,000` source triangles per faction GLB; no silent over-cap fallback | Close/imposter screenshot parity and close-pool capacity evidence |
| Weapon attachment | `<= 1,500` triangles per weapon; merged where practical | Renderer stats with close NPCs visible |
| Static prop/building/structure | `<= 2,500` triangles per placement and `<= 4` optimized material/draw buckets | Open Frontier scene attribution and draw-call delta |
| Aircraft/helicopter | `<= 15,000` triangles LOD0 and `<= 20` optimized draw buckets | Distance visibility or LOD proof plus Open Frontier/A Shau renderer stats |
| Vegetation/imposter bucket | Instanced/bucketed submission only; no per-instance draw path | Scene attribution and culling/visibility registration |
| Effect asset/material | No first-use shader/program stall above `50ms` around trigger | Low-load effect probe with CPU profile and browser stalls |

Any asset over budget is blocked unless its acceptance note includes:

- Why the visual/gameplay value requires the exception.
- Draw calls, triangles, textures, and programs from a trusted capture.
- Scene attribution showing the asset class is named and visible-unattributed
  triangles remain below `10%`.
- A rollback path.

## LOD And Culling Registration

Every accepted runtime asset must be registered in the appropriate visibility
contract:

- Static world features must pass through `WorldFeatureSystem` placement and
  `ModelDrawCallOptimizer` where applicable.
- Aircraft and helicopters must use the existing distance/fog visibility or a
  documented LOD path.
- NPCs must respect the close GLB cap, mid/far imposter path, and explicit
  over-cap reporting.
- Vegetation must state whether it is cell-resident, shader-faded, or part of
  a future outer-canopy tier.
- `frustumCulled=false` is allowed only for an instanced/bucketed path with
  explicit runtime culling or distance cutoff evidence.

KB-CULL cannot certify culling from static file inventory alone. It needs
trusted `scene-attribution.json`, `runtime-samples.json` renderer stats, and
representative screenshots or camera paths.

## Screenshot And Perf Evidence

Use this evidence matrix before accepting changes:

| Change type | Required evidence |
| --- | --- |
| Texture downscale/compression | Before/after startup UI artifact with WebGL upload table, plus visual screenshots |
| NPC imposter scale/luma | Matched close GLB and imposter screenshots at LOD switch distances; projected height and mean luma/chroma deltas |
| Vegetation atlas/normal change | Ground and elevated screenshots in Open Frontier and A Shau, plus texture audit |
| Static feature/vehicle culling | Trusted Open Frontier or A Shau perf capture with renderer stats and scene attribution |
| Grenade/effect first-use fix | Low-load two-grenade probe before/after; no long task above `50ms` within the trigger window |
| Outer canopy | Elevated Open Frontier and A Shau screenshots plus p95 frame and draw-call deltas |

KB-OPTIK cannot accept imposter fixes without matched GLB/imposter visual
evidence. KB-EFFECTS cannot close grenade spikes until the measured first-use
stall is reproduced and removed. KB-CULL cannot certify culling without
draw-call and renderer telemetry.

## Bundle Certification

Cycle 1 benchmark bundles are certified with:

```bash
npm run check:projekt-143-cycle1-bundle -- \
  --startup-open <startup-ui-open-frontier-dir> \
  --startup-zone <startup-ui-zone-control-dir> \
  --combat120 <combat120-artifact-dir> \
  --openfrontier-short <open-frontier-short-artifact-dir> \
  --ashau-short <ashau-short-artifact-dir> \
  --grenade <grenade-spike-artifact-dir>
```

The certifier writes a bundle summary and a
`projekt-143-cycle1-metadata.json` sidecar into each source artifact directory.
Those sidecars record commit SHA, mode, timing windows, warmup policy,
browser/runtime metadata, instrumentation flags, renderer/scene evidence, and
measurement-trust status.
