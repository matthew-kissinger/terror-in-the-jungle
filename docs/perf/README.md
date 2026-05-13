# Performance and Profiling

Last verified: 2026-05-13

Index for the perf-harness docs. The original 2,332-LOC `docs/PERFORMANCE.md`
was split into focused topics on `cycle-2026-05-09-doc-decomposition-and-wiring`.
Pre-split full-history copy lives at `docs/archive/PERFORMANCE.md`.

## Topic map

- [baselines.md](baselines.md) — tracked baselines, refresh procedure, current
  scenario health.
- [scenarios.md](scenarios.md) — scenario definitions (combat120, frontier30m,
  etc.), URL overrides, environment variables, capture discipline.
- [playbook.md](playbook.md) — how to investigate a regression, common
  bottleneck classes, validation gates.

## Artifact retention policy

Perf captures land in `artifacts/perf/<timestamp>/`. The `artifacts/` tree is
gitignored, so retention is enforced by [`scripts/artifact-prune.ts`](../../scripts/artifact-prune.ts):
captures older than 30 days are deleted unless they are cited by name in any
`docs/**/*.md` file or pinned in `perf-baselines.json`. Long-term reference
captures should be linked from a cycle doc or carry-over, not assumed to live
forever in `artifacts/perf/`.

The [`artifact-prune` GitHub Actions workflow](../../.github/workflows/artifact-prune.yml)
runs every Sunday at 04:00 UTC (and on `workflow_dispatch`). To inspect runs:

```
gh run list --workflow=artifact-prune.yml
gh run view <run-id> --log
```

To run the prune locally:

```
npm run artifact:prune          # dry-run report
npm run artifact:prune:apply    # actually delete prunable dirs
```

## Build targets

Three Vite build targets exist, differing only in whether the perf-harness
diagnostic hooks are compiled in:

| Target | Command | Output | Harness surface | Use |
|--------|---------|--------|-----------------|-----|
| dev    | `npm run dev`        | — (HMR server) | yes   | Local development and live iteration |
| retail | `npm run build`      | `dist/`        | no    | What ships to Cloudflare Pages |
| perf   | `npm run build:perf` | `dist-perf/`   | yes   | Prod-shape bundle measured by perf captures |

The `perf` target is the retail build plus the diagnostic hooks the harness
drives (`window.__engine`, `window.__metrics`, `window.advanceTime`,
`window.combatProfile`, `window.perf`, etc.). `VITE_PERF_HARNESS=1` is set at
build time; Vite constant-folds `import.meta.env.VITE_PERF_HARNESS === '1'`,
so retail builds dead-code-eliminate the hook branches.

Retail and perf builds do not emit `.gz` or `.br` sidecar files. Cloudflare
Pages handles visitor-facing compression for JS, CSS, JSON, fonts, and WASM,
so local artifacts and deploy uploads stay limited to canonical assets.

Why measure the `perf` build instead of `dev`:

- **Fidelity.** Minification, tree-shaking, and chunk splitting change both
  code shape and frame cost. Numbers from a dev bundle overstate production
  work per frame.
- **Stability.** Vite's dev HMR websocket has been observed to rot under
  repeated headless captures (`send was called before connect`). The
  preview-served bundle is stateless.

Why not measure the `retail` bundle directly: the harness driver needs the
diagnostic globals to coordinate warmup, read frame metrics, and inspect
combat state. The `perf` bundle keeps everything else identical.

`perf:capture` and `fixed-wing-runtime-probe` default to the `perf` target.
Use `--server-mode dev` to debug against source maps; use
`--server-mode retail` if you want to preview the ship bundle (the capture
driver will time out waiting for `__engine`, which is the point — it proves
retail has zero harness surface).

## Capture commands

```bash
npm run build:perf                      # Build dist-perf/
npm run preview:perf                    # Preview dist-perf/ for browser checks

# Steady-state captures (headed, default; --headless available):
npm run perf:capture                    # Default scenario
npm run perf:capture:combat120          # Primary regression target
npm run perf:capture:openfrontier:short # Open Frontier 180s
npm run perf:capture:ashau:short        # A Shau 180s
npm run perf:capture:zonecontrol        # Zone Control 120s
npm run perf:capture:teamdeathmatch     # TDM 120s
npm run perf:capture:frontier30m        # 30-minute soak
npm run perf:capture:headless           # Default scenario, headless

# Specific probes:
npm run perf:grenade-spike              # KB-EFFECTS grenade first-use probe
npm run perf:startup:openfrontier       # Retail startup benchmark (UI phases)
npm run perf:quick                      # Smoke; not a baseline

# Analysis and comparison:
npm run perf:analyze:latest             # Print latest artifact summary
npm run perf:compare                    # Compare latest vs tracked baselines
npm run perf:compare:strict             # Same compare, fail on warnings too
npm run perf:update-baseline            # Refresh baselines from latest capture (use sparingly)
```

`perf:capture` accepts `--scenario`, `--server-mode`, `--headless`,
`--cdp-profiler`, `--cdp-heap-sampling`, `--trace-window-start-ms`, and
`--trace-window-duration-ms`. See `scripts/perf-capture.ts` for the full flag
list.

Static-evidence audits (KB-* commands like `check:pixel-forge-optics`,
`check:vegetation-horizon`, `check:webgpu-strategy`, and the retained
plain-named `check:*` audits) live alongside the perf harness but write to
`artifacts/perf/<timestamp>/<audit-name>/`. They are inventory and decision
input, not steady-state frame evidence. The full list is enumerated under
`package.json` `scripts.check:*`.

## Artifacts

Each `perf:capture` run writes to `artifacts/perf/<timestamp>/`:

| File | Contents |
|------|----------|
| `summary.json` | Pass/warn/fail result, frame timing stats |
| `validation.json` | Gate results (combat, heap, hitches) |
| `measurement-trust.json` | Harness self-certification: probe round-trip, missed samples, sample presence |
| `scene-attribution.json` | Post-sample scene census by approximate asset/system category |
| `runtime-samples.json` | Per-sample frame timing, heap, renderer.info, system timing |
| `movement-artifacts.json` | Occupancy cells, hotspots, sampled tracks |
| `movement-terrain-context.json` | Gameplay surface context for viewer |
| `movement-viewer.html` | Self-contained terrain-relative movement viewer |
| `startup-timeline.json` | Boot phase timing |
| `console.json` | Browser console messages captured during run |
| `final-frame.png` | Screenshot at end of capture |

Optional deep artifacts when CDP probing is enabled:
`cpu-profile.cpuprofile`, `heap-sampling.json`, `chrome-trace.json`.

`summary.json`, `validation.json`, `measurement-trust.json`, `console.json`,
and `runtime-samples.json` are written on best-effort failure paths too, so a
blocked run still leaves enough evidence to diagnose startup regressions.

Startup UI benchmarks (`perf-startup-ui.ts`, `perf:startup:*`) write retail
artifacts under `artifacts/perf/<timestamp>/startup-ui-<mode>/`:
`summary.json`, `startup-marks.json`, `browser-stalls.json`, `console.json`,
and `cpu-profile-iteration-N.cpuprofile`. These measure operator-visible
phases from title screen through deploy and playable HUD; they do not write
`measurement-trust.json` and do not replace `perf-capture.ts` for steady-state
frame claims.

The 2026-05-13 mode-startup spike used this path to separate cache delivery
from runtime CPU work. Recast WASM/navmesh headers were already correct; the
blocking work was terrain surface baking after mode select. For any future
startup change, capture at least:

```bash
npm run build
npx tsx scripts/perf-startup-ui.ts --mode zone_control --runs 1
npx tsx scripts/perf-startup-ui.ts --mode open_frontier --runs 1
npx tsx scripts/perf-startup-ui.ts --mode tdm --runs 1
```

Design memo and current evidence:
`docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`.

## Diagnostics surface

- Perf diagnostics gated behind `import.meta.env.DEV` + `?perf=1` URL param at
  runtime, OR `import.meta.env.VITE_PERF_HARNESS === '1'` at build time.
  Retail `npm run build` ships zero harness surface — the hook branches are
  dead-code-eliminated.
- Perf-harness URL also sets `?uiTransitions=0` to avoid browser
  view-transition / screenshot interactions during live-entry.
- `SystemUpdater` emits `performance.mark()` / `performance.measure()` during
  captures only.
- Browser stall observers (`longtask`, `long-animation-frame`) are
  Chromium-only, harness-only.
- Captures are always launched at fixed `1920x1080`,
  `--force-device-scale-factor=1` to avoid multi-monitor span contamination.

## External references

- Three.js `InstancedMesh`: <https://threejs.org/docs/pages/InstancedMesh.html>
- Three.js `BatchedMesh`: <https://threejs.org/docs/pages/BatchedMesh.html>
- Three.js optimization manual, "Optimize Lots of Objects":
  <https://threejs.org/manual/en/optimize-lots-of-objects.html>
- glTF Transform: <https://gltf-transform.dev/>
- meshoptimizer / `gltfpack`: <https://meshoptimizer.org/gltf/>
- `three-mesh-bvh`: <https://github.com/gkjohnson/three-mesh-bvh>
- FCL paper on BVH and broad-phase collision/proximity queries:
  <https://gamma.cs.unc.edu/FCL/fcl_docs/webpage/pdfs/fcl_icra2012.pdf>
