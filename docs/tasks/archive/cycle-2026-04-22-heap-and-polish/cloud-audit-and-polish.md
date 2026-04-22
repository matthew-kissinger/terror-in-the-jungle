# cloud-audit-and-polish: diagnose "clouds only visible on A Shau" and land a proper cross-mode cloud look

**Slug:** `cloud-audit-and-polish`
**Cycle:** `cycle-2026-04-22-heap-and-polish`
**Round:** 2
**Priority:** P1 — user-facing presentation regression across 4 of 5 game modes.
**Playtest required:** NO (screenshot-verified across all modes).
**Estimated risk:** low — tuning constants + optionally a modest shader improvement. Shader-path risk is contained to `CloudLayer.ts` which is a single ShaderMaterial in a leaf subsystem.
**Budget:** ≤300 LOC.
**Files touched:**

- Read: `src/systems/environment/AtmosphereSystem.ts`, `src/systems/environment/atmosphere/CloudLayer.ts`, `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts`, `src/systems/environment/WeatherAtmosphere.ts`.
- Modify: `src/systems/environment/atmosphere/CloudLayer.ts` (shader + constants), `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` (per-scenario `cloudCoverageDefault`).
- Optionally modify: `src/systems/environment/AtmosphereSystem.ts` if a uniform threading change is needed. **STOP** if this pulls in `src/types/SystemInterfaces.ts` (`ICloudRuntime`) — that's a fence change.
- Add: evidence screenshots in `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/cloud-audit-and-polish/` (before/after per mode).

## Required reading first

- `src/systems/environment/atmosphere/CloudLayer.ts` end-to-end — the single horizontal plane, fbm fragment shader, `BASE_ALTITUDE = 1200`, `PLANE_SIZE = 4000`, `NOISE_SCALE = 1/900`, 3-octave fbm, threshold formula `lowerEdge = mix(1.0, -0.2, coverage)`.
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts:165-235` — current per-scenario `cloudCoverageDefault`: ashau=0.4, openfrontier=0.1, tdm=0.6, zc=0.3, combat120=0.2.
- `src/systems/environment/AtmosphereSystem.ts:443-462` — `updateCloudLayer` reconciles preset + weather override, drives `CloudLayer.update(camera, terrainY, sunDir, sunColor)` each frame.
- `src/core/GameEngineLoop.ts:72-83` — per-frame `syncDomePosition(cameraPos)` + `setTerrainYAtCamera(terrainSystem.getHeightAt(cameraPos.x, cameraPos.z))`. Runs for every mode; cloud wiring is NOT conditional on mode.
- `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/cloud-runtime-implementation.md` — the brief that landed the current implementation; documents the "single horizontal plane with fbm" architectural choice and why volumetric raymarch was out of budget.

## Diagnosis (user report + preliminary analysis)

User report: "clouds only appear in A Shau Valley and only cover one tile above."

Preliminary diagnosis (must be verified with screenshots as Step 1):

1. **Coverage is mode-dependent, not presence-dependent.** `CloudLayer` is unconditionally instantiated in `AtmosphereSystem` constructor and updated every frame. All 5 scenarios set a nonzero `cloudCoverageDefault`. So clouds exist in every mode; they are just invisible at low coverage.
2. **Coverage threshold is punishing at low values.** The fragment shader computes `lowerEdge = mix(1.0, -0.2, coverage)`. At coverage=0.1 (openfrontier), `lowerEdge = 0.88`. The fbm output over 3 octaves is typically mean≈0.5 with amp≈0.5, so very little of the field passes 0.88 — openfrontier shows almost nothing. At coverage=0.2 (combat120), `lowerEdge = 0.76` — only tall peaks of the fbm pass, so clouds look like sparse wisps. At coverage=0.4 (ashau), `lowerEdge = 0.52` — broad, recognizable cloud patches. This is consistent with the user's "I see clouds on A Shau only."
3. **"Only one tile above"** is the low-frequency signature of 3-octave fbm at `NOISE_SCALE = 1/900`. 3 octaves = features at 900m, 450m, 225m. The camera-locked 4000m plane shows roughly 4-5 cloud-sized features across. At low coverage, only 1-2 features poke above the threshold — hence "one tile."
4. **Not fixable by coverage alone.** Simply raising all modes to coverage=0.4 would make every mode feel overcast, breaking the authored atmosphere (ashau=morning overcast, tdm=dusk overcast, zc=golden broken, openfrontier=clear noon). The fix needs both better defaults AND a richer cloud field so coverage=0.15 still looks like *clouds* (scattered cumuli) rather than *nothing*.

## Fix (three composed sub-changes)

### 1. Better cloud field density (shader)

Increase fbm richness from 3 to 5 octaves, widen the threshold's soft edge, and add low-amp large-scale modulation so cloud fields feel organic instead of uniform noise. Specifically:

- fbm: 3 → 5 octaves (amp geometric series 0.5·0.5^i). Lacunarity stays ~2.03.
- `lowerEdge = mix(1.0, -0.4, coverage)` (was `-0.2`) — stretches the responsive range so coverage=0.15 yields visible but sparse clouds instead of near-empty sky.
- `upperEdge = lowerEdge + 0.35` (was `+0.25`) — wider wispy band; cloud edges feather instead of stopping hard.
- Add a second large-scale modulator: `vec2 bigUv = vWorldXZ * (uNoiseScale * 0.2)` sampled once, multiply `mask` by `smoothstep(0.3, 0.7, fbm(bigUv))`. This gives cloud *regions* (cumulus fields with gaps between them) on top of the individual puffs.

### 2. Per-scenario density/scale tuning (presets + uniform threading)

Add two optional preset fields (both backward compatible with defaults):

- `cloudCoverageDefault?: number` — already exists; re-balance:
  - openfrontier: 0.1 → 0.25 (scattered fair-weather cumulus over the desert — the sky currently reads as dead-empty)
  - combat120: 0.2 → 0.30 (perf-neutral default but visible)
  - ashau: 0.4 → 0.55 (morning overcast over jungle valley reads as stronger overcast)
  - zc: 0.3 → 0.45 (golden-hour broken layer is visible)
  - tdm: 0.6 → 0.70 (dusk overcast stays clear)
- `cloudScaleMetersPerFeature?: number` — controls feature size. Optional; if unset, use current 900. Try: openfrontier=1400 (larger fair-weather cumulus), ashau=700 (smaller denser puffs), others unchanged. Pipes via a new `uNoiseScale` per-preset write at preset apply time.

### 3. Animation drift (shader + update)

Add a slow `uTimeSeconds` uniform driving a world-space offset on the noise UV so clouds appear to drift. Wind: 10 m/s NE-ish (0.7, 0.7). Visible over 60 s, not per-frame shaky.

```
vec2 uv = (vWorldXZ + uWindOffset) * uNoiseScale;
```

where `uWindOffset = windDir * uTimeSeconds * 10`.

## Steps

1. Read all of "Required reading first."
2. **Baseline screenshots.** Boot the dev server (`npm run dev`), visit each mode (ashau, openfrontier, tdm, zc, combat120) via the URL query params used by the perf harness. Take a top-down-ish screenshot of the sky for each mode. Commit to `evidence/cloud-audit-and-polish/before-<mode>.png`. Note the observed cloud appearance per mode in `evidence/cloud-audit-and-polish/observations.md` — this is the source-of-truth diagnosis.
3. Diagnose. If the observations confirm "visible in ashau, invisible in openfrontier/combat120, present-but-dim in zc/tdm," the preliminary diagnosis above is correct — proceed with the fix. If the observations differ (e.g., clouds broken entirely in tdm), re-scope the task — file additional findings in the evidence memo and STOP on any architectural surprise.
4. Implement Sub-change 1 (shader: 5 octaves, widened threshold, large-scale modulator). Rebuild, verify no TypeScript errors.
5. Implement Sub-change 2 (preset re-balance; optional per-scenario noise scale). Thread the scale uniform if you add `cloudScaleMetersPerFeature`.
6. Implement Sub-change 3 (animated drift).
7. **After screenshots.** Repeat Step 2 on the new build. Commit to `evidence/cloud-audit-and-polish/after-<mode>.png`. Side-by-side comparison in `observations.md`.
8. Regression test:
   - Extend `CloudLayer.test.ts` to assert the mask responds to the new threshold over a broader coverage range (e.g., `setCoverage(0.15)` produces a non-trivial mask at some sample point).
   - Extend `AtmosphereSystem.test.ts` (or sibling) to assert each scenario preset applies a `cloudCoverageDefault` consistent with the new values.
9. Probe perf: boot `npm run perf:capture:combat120` on the new combat120 (coverage 0.30). Confirm p99 stays within 5% of the inherited baseline. Cloud fragment shader is still one plane + one more octave of valueNoise + one second fbm sample for the large-scale modulator — perf cost is small but verify.

## Exit criteria

- Each of ashau, openfrontier, tdm, zc, combat120 shows **visibly present** clouds in the sky at the default (no-weather) state. "Visibly present" = at least two discrete cloud masses in frame from a default spawn view.
- Cloud features have organic structure (puff-scale detail + large-scale gaps), not uniform noise.
- Cloud edges feather softly — no sharp discontinuity at the coverage threshold.
- Animated drift is visible over a 60s sit-still observation; per-frame motion does not jitter.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf p99 within 5% of baseline.
- Before/after screenshots for all five modes committed to evidence.

## Non-goals

- **No architectural replacement.** The single-plane + fbm architecture stays. No multi-layer stacks, no billboard systems, no volumetric raymarch. Those are follow-up-cycle territory and belong in a dedicated cloud-rewrite brief gated on design review.
- Do not touch `WeatherAtmosphere.ts` coverage lerp logic. The storm/rain override already works; this task only improves the baseline look.
- Do not change `BASE_ALTITUDE` or `PLANE_SIZE`.
- Do not modify `HosekWilkieSkyBackend` or anything else under `atmosphere/`. Scope is cloud-only.
- Do not change `ICloudRuntime` in `SystemInterfaces.ts`. If the fix seems to require this, STOP — that is a fence change.

## Hard stops

- Observations reveal clouds are architecturally broken (e.g., the plane isn't in the scene graph for certain modes, or `setTerrainYAtCamera` returns NaN on TDM) → STOP, deliver a memo at `docs/rearch/CLOUD_ARCHITECTURAL_ISSUE.md` describing the bug and its reproduction. The preliminary diagnosis is then wrong; this task punts to a proper fix cycle.
- Perf p99 regresses > 5% on combat120 after the shader change → STOP, roll back sub-changes one at a time until perf recovers, record which octave bump or modulator was the cost driver.
- Fence change → STOP.

## Pairs with

None directly. Independent of helicopter-interpolated-pose, a1-altitude-hold-elevator-clamp, and heap-recovery-combat120-triage. Runs in parallel with the other R2 tasks.

## Notes for the executor

- The game does not expose a "cloudy preset preview" URL query. To take per-mode screenshots in headless preview you will need to load each mode via the canonical query strings used by `scripts/perf-capture.ts` (see `perf-capture.ts` for the `--mode` mapping) — or bypass the UI with a short harness script that directly instantiates `AtmosphereSystem` + `CloudLayer` and renders one frame per scenario preset. Either is acceptable.
- Preliminary diagnosis is YOUR hypothesis to verify, not a conclusion. Do the screenshots first. If openfrontier actually looks fine with current coverage=0.1, the root cause is elsewhere and the fix shape changes.
- If you need more than 3 octaves of fbm for a plausible cloud look, that's allowed — but keep the fragment cost bounded. Each octave adds ~8 taps to `valueNoise` per fragment; on combat120 (1080p60) that's meaningful budget. If you go to 6+ octaves, re-probe perf aggressively.
