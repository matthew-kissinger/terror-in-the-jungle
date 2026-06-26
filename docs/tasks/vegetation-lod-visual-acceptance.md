# Vegetation LOD Visual Acceptance

Status: candidate branch, owner acceptance pending.

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
- current ground-card candidate, for dense cover assets

## Proof Commands

```bash
npm run assets:bleed-vegetation-atlases -- --check
npm run check:vegetation-lod-review -- --only jungle-tree,fan-palm,understory-fern --stages daylight,low-sun,humid-fog
npm run check:vegetation-lod-review
```

Latest useful candidate artifacts:

- `artifacts/perf/2026-06-26T17-56-45-512Z/scene-parity/scene-parity.md`
  - strict-WebGPU live-scene probe for Open Frontier + A Shau; captures
    vegetation static-impostor material probes, source labels, promotion /
    demotion distances, mesh-vs-impostor snap state, ground-card LOD state,
    terrain LOD rings, and screenshots
- `artifacts/vegetation-lod-review/2026-06-26T17-43-20-798Z`
  - current full-catalog matrix, 13 vegetation assets x 3 lighting/fog stages
- `artifacts/vegetation-lod-review/2026-06-26T17-33-54-195Z`
  - representative post-alpha-hardening matrix, 5 assets x 3 lighting/fog stages
- `artifacts/vegetation-lod-review/2026-06-26T17-32-31-051Z`
  - daylight quick check after alpha hardening, fan-palm + jungle-tree
- `artifacts/vegetation-lod-review/2026-06-26T17-28-00-219Z`
  - representative matrix after rebaking static vegetation atlases

## Acceptance

Do not deploy this as accepted until the owner reviews Open Frontier and A Shau
scene screenshots or live dev route captures and confirms the current far
representation is the chosen path. If rejected, use the review route to compare
additional exposure/alpha/bake variants before changing production defaults.
