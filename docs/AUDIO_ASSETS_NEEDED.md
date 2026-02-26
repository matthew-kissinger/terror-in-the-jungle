# Audio Assets Needed

Last updated: 2026-02-25
Target path: `public/assets/optimized/`
Status: No audio assets from this list have been generated or integrated yet. All items remain TODO.

## Goal

Replace placeholder reuse with distinct combat assets while keeping pooled playback and low allocation overhead.

## Priority 1

- Weapon variants:
  - `playerGunshot2.ogg`, `playerGunshot3.ogg`
  - `playerShotgun2.ogg`, `playerShotgun3.ogg`
  - `playerSMG2.ogg`, `playerSMG3.ogg`
  - `otherGunshot2.ogg`, `otherGunshot3.ogg`
- Feedback:
  - `emptyClick.ogg`
  - `impactBody.ogg`
  - `impactHeadshot.ogg`

## Priority 2

- Reload sequence:
  - `reloadMagOut.ogg`
  - `reloadMagIn.ogg`
  - `reloadChamber.ogg`

## Priority 3

- Material impacts:
  - `impactMetal.ogg`
  - `impactDirt.ogg`
  - `impactVegetation.ogg`
  - `impactWater.ogg`

## Technical Constraints

- Preferred format: OGG Vorbis, mono, 44.1/48kHz.
- Keep clips short and dry; runtime pitch variation already adds diversity.
- Existing audio pool sizes should remain sufficient unless runtime profiling proves otherwise.

## Validation

- Confirm files load through existing audio managers with no code changes.
- Spot-check rapid fire/reload scenarios for clipping/overlap artifacts.
- Re-run perf capture to ensure no added hitching from decode/playback changes.
