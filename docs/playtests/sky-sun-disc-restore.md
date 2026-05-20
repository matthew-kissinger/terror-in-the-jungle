# Playtest evidence — sky-sun-disc-restore

Cycle: `cycle-sky-visual-restore` (campaign position #1 of 12)
Task slug: `sky-sun-disc-restore`
Branch: `task/sky-sun-disc-restore`
Captured: 2026-05-16 (Playwright + Chromium headless, perf-harness build).

## What changed

Added a new `SunDiscMesh` (additive HDR sprite, `MeshBasicMaterial` with
`toneMapped: false`, `AdditiveBlending`, `depthWrite: false`,
`depthTest: false`) and wired it into `AtmosphereSystem`. Each frame the
system pushes the authoritative sun-direction + sun-color into the
sprite; the sprite hides when the sun drops below the horizon.

The sprite restores the pre-merge `vSunE * 19000.0 * Fex` HDR pin-point
that the post-merge CPU-baked `DataTexture` cannot represent (radiance
gets clamped to `[0,1]` at bake time, then tonemapped flat).

## Captures

Saved under `artifacts/cycle-sky-visual-restore/playtest-evidence/`:

| Scenario | File | Observation |
|---|---|---|
| Open Frontier noon, camera aimed at sun | `sky-sun-disc-restore-noon.png` | Visible pearl disc dead-centre frame; warm-white core with soft additive halo, consistent with the spec's "bright pin-point on top of the dome's soft glow". |
| Forced sub-horizon sun (Y = -0.5), same framing | `sky-sun-disc-restore-nadir.png` | Sky paints near-black (analytic Hosek-Wilkie collapses without scattering); NO bright sun-disc punches through. Both the new sprite (hides via `mesh.visible = false`) and the dome's existing `mixSunDisc` composite (re-baked at the new sun direction) are correctly absent. |

The noon capture is paired against the upstream reference
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`.
Full pre-merge saturation + sharp HDR core requires the upstream
`sky-dome-tonemap-and-lut-resolution` and `sky-hdr-bake-restore` tasks
to land — both are scoped under the same cycle. This task adds the
sprite primitive; the upstream tasks fix the dome dynamic range so the
sprite's HDR radiance reads at full intensity on the final composited
frame.

## Acceptance

- `npm run lint`, `npm run test:run` (4258 / 4258 pass),
  `npm run build` all green.
- `SunDiscMesh.test.ts` covers the seven contract behaviours
  (hide-below-horizon, show-above-horizon, position at sunDir x
  domeRadius, material flags `toneMapped:false` + AdditiveBlending +
  `depthWrite/Test:false`, idempotent mesh handle, starts-hidden,
  dispose).
- Visual smoke shows the sprite is wired, visible at noon, hidden at
  sub-horizon.

## Posture

Automated smoke; owner walk-through pending (deferred per the
cycle's autonomous-loop posture). Visual fidelity gate
(pearl-bright at noon, saturated horizon) becomes meaningful once the
sibling `sky-dome-tonemap-and-lut-resolution` and `sky-hdr-bake-restore`
tasks land in the same cycle.
