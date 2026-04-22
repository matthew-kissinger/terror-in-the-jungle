# cloud-audit-and-polish: evidence observations

Captured via `scripts/capture-cloud-audit-and-polish-shots.ts`. Each mode
is framed from a fixed camera pose:

- Position: 200m AGL (400m for A Shau, which has >1200m mountain masses).
- Pitch: 20 degrees above horizon.
- Yaw: 90 degrees offset from the scenario's sun azimuth so the sun disc
  stays off-frame and the *lit side* of the cloud field is in view.

The cloud plane sits at terrain-relative +1200m with a 4000m XZ footprint.
At 20-degree pitch the edge of the plane enters the upper frame as a
diagonal line in several shots — that is a pre-existing property of the
single-plane architecture (not in scope; `PLANE_SIZE` is a non-goal) and
is constant across before/after captures.

## Per-mode comparison (before = master shader, after = post-audit shader)

| Mode         | Preset coverage (before / after) | Before appearance                                            | After appearance                                             |
|--------------|-----------------------------------|--------------------------------------------------------------|--------------------------------------------------------------|
| openfrontier | 0.10 / 0.25                       | Sparse wispy edges, sky reads as empty noon                  | Substantial cumulus masses visible across the frame          |
| combat120    | 0.20 / 0.30                       | Thin wisps; sky reads as empty                               | Broader cumulus fields, clearly "noon with some clouds"      |
| zc           | 0.30 / 0.45                       | Broken patches visible on one side                           | Denser broken patches, warm golden-hour tint on lit side     |
| ashau        | 0.40 / 0.55                       | Morning overcast visible                                     | Stronger overcast; tighter feature scale adds density        |
| tdm          | 0.60 / 0.70                       | Dusk overcast; broken layers visible                         | Broken overcast with tighter feature scale; gaps preserved   |

## Verdict on the preliminary diagnosis

The brief's preliminary diagnosis ("clouds only appear in A Shau") is
**qualitatively confirmed** by the before screenshots: low-coverage
scenarios (openfrontier=0.1, combat120=0.2) show only thin wisps near the
cloud-plane edges under the pre-audit 3-octave / threshold=0.88 shader.
Mid-coverage scenarios (zc, tdm, ashau) were already visible and remain
visible.

The user's subjective "only visible on A Shau" report lines up with the
observation that the low-coverage scenarios carry *so little* cloud
signature that a player at ground level — looking mostly horizontally,
with haze bleaching the distant sky — sees effectively no clouds.

## Fix composition

1. **5-octave fbm** (was 3): richer mid-frequency structure inside each puff.
2. **Threshold curve**: `lowerEdge = mix(1.0, -0.4, cov)` (was -0.2) with a
   wider 0.35 feather band (was 0.25). At `cov=0.25`, `lowerEdge = 0.65`;
   5-octave fbm peaks at ~0.97, so the field has generous headroom.
3. **Large-scale modulator**: `bigField = 0.5 + 0.5 * smoothstep(0.20, 0.70, fbm(uv * 0.2))`.
   The 0.5 floor is critical — an earlier iteration used a pure
   `smoothstep(0.30, 0.70, ...)` gate and made openfrontier/combat120
   *worse* by creating large clear holes; the floor keeps every region at
   >=50% of its threshold-derived mask so coverage is never fully erased.
4. **Per-scenario feature scale**: `cloudScaleMetersPerFeature` lets
   ashau (dense, 700m) differ from openfrontier (sparse fair-weather
   cumulus, 1400m).
5. **Animated drift**: `uTimeSeconds` + `uWindDir` — 10 m/s NE over 60 s.
   Visible-over-time, not per-frame jitter.

## Re-shootable

Re-run:

```
npm run build:perf
npx tsx scripts/capture-cloud-audit-and-polish-shots.ts --label after
# (to refresh before: git stash src/, rebuild perf, re-run with --label before)
```

Notes:

- `a_shau_valley` fails to load its DEM in the worktree capture (A Shau
  DEMs are gitignored per `data/vietnam/DATA_PIPELINE.md`). Terrain
  renders flat under the cloud plane; since this task only exercises the
  sky shader, the missing DEM does not affect cloud visibility — only the
  ground under the sky.
- The diagonal "plane edge" line in upper corners of several shots is
  the cloud plane's 4000m XZ footprint viewed at oblique pitch; it is
  consistent across before/after and is not a regression.
