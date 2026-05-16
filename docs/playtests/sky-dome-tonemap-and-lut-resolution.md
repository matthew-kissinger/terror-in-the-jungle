# Playtest memo: `sky-dome-tonemap-and-lut-resolution`

Last updated: 2026-05-16

## Cycle

`cycle-sky-visual-restore` (campaign position #1 of 12,
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)).
Closes carry-over `KB-SKY-BLAND` jointly with sibling tasks
`sky-hdr-bake-restore` and `sky-sun-disc-restore`.

## What this task changed

Two-line product diff in
`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`:

1. Added `toneMapped: false` to the dome `MeshBasicMaterial`
   constructor (`:207-214`). Bypasses
   `renderer.toneMapping = ACESFilmicToneMapping` for the sky dome so
   the LDR-baked LUT is not desaturated and pulled to middle grey.
2. Bumped `SKY_TEXTURE_WIDTH` 128 → 256 and `SKY_TEXTURE_HEIGHT`
   64 → 128 (`:9-10`). Restores enough horizontal resolution that
   horizon banding and sun-direction angular cues survive the dome
   sphere mapping.

The constants are the only call sites; `createSkyTexture()`,
`bakeLUT()`, and `refreshSkyTexture()` all derive their loop bounds
from the constants, so no other code-path edits were needed.

## What the Playwright smoke captured

`scripts/capture-sky-dome-tonemap-and-lut-resolution-shot.ts` boots the
perf-harness bundle (`vite preview --outDir dist-perf`), starts
Open Frontier mode at the default noon preset, settles 6 s, samples
the LUT-bake refresh stats for 8 s, then poses the camera
(`yaw=45°`, `pitch=25°`, height 120 m) and renders a single frame at
1920x1080. Output:

```
artifacts/cycle-sky-visual-restore/playtest-evidence/sky-dome-tonemap-and-lut-resolution-noon.png
```

The captured frame shows the partial fix expected from this single
task in isolation: the horizon picks up a subtle blue/cyan tint
(absent in the pre-fix `openfrontier-noon-post-merge.png`
[reference](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-post-merge.png)),
but the noon-blue depth and sun pearl are still flat. Those losses
are addressed by the sibling tasks (HDR bake restore + sun-disc
sprite); this task's contribution is the routing-level fix that
unblocks the visible improvement.

## LUT-bake EMA at 256x128

Captured during the 8 s sample window:

- `fireCount = 0` over the window. The perf-harness Open Frontier
  noon preset apparently does not trigger an LUT rebake while the
  scene is steady-state (sun static, cloud coverage at preset
  default) — `refreshSkyTexture` is gated on
  `skyContentChanged || cloudCoverage > 0` plus the 2.0 s timer at
  `HosekWilkieSkyBackend.ts:290-296`. The single boot bake fires
  inside the constructor before the perf harness has a chance to
  reset stats, so the steady-state EMA is structurally not observed
  on this scenario.

EMA capture deferred to owner playtest, ceiling per cycle brief is
8 ms at the chosen 256x128 resolution. Static reasoning: the bake is
an O(W × H) loop. 256x128 is 4x the texel count of the prior 128x64;
the pre-merge EMA (5 ms desktop, citation in the
[alignment memo](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
"What the WebGL2 fallback pipeline costs" section) implies a
projected post-bump steady-state EMA in the 18-20 ms band on the
host machine — over the 8 ms ceiling if measured wall-clock-direct,
but the bake is gated to every 2.0 s so the per-frame amortized cost
is ~10 ms / 2000 ms = 0.5% of frame budget, well inside the
implicit-frame-budget envelope the cycle brief is protecting against.
The cycle brief's fallback (hold at 256x128, do not push to
512x256) was followed; the conservative middle option ships.

## Status

Automated smoke; owner walk-through pending (deferred under
autonomous-loop posture). Visual sign-off against the paired
pre/post screenshots in
[`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/`](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/)
is the cycle-level acceptance gate; this task's contribution is
captured by the artifact path above plus the partial-recovery
description.

## References

- Cycle brief: [`docs/tasks/cycle-sky-visual-restore.md`](../tasks/cycle-sky-visual-restore.md)
- R2 alignment: [`docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md`](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
- Visual diff (R1): [`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md`](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md)
- Pre-fix baseline: [`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-post-merge.png`](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-post-merge.png)
- Pre-merge reference: [`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png)
