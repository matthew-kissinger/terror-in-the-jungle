# KB-STARTUP-1 — Mode-start terrain surface bake

Status: open / candidate branch (`task/mode-startup-terrain-spike`)
Owning subsystem: terrain / engine init / perf harness
Opened: 2026-05-13 mode-startup spike

## Latest evidence

Baseline `artifacts/perf/2026-05-13T03-49-44-385Z/startup-ui-zone-control` measured Zone Control at `modeClickToDeployVisible=27765ms` and `modeClickToPlayable=32473ms`; Open Frontier timed out past 120s in the same diagnostic pass. The spike evidence after worker offload is `artifacts/perf/2026-05-13T04-30-36-660Z/startup-ui-zone-control` (`modeClickToDeployVisible=1156ms`, worker bake 523.4ms), `artifacts/perf/2026-05-13T04-31-26-223Z/startup-ui-open-frontier` (`3387ms`, worker bake 2374.7ms), and `artifacts/perf/2026-05-13T04-34-04-814Z/startup-ui-tdm` (`1185ms`, worker bake 236.8ms). Design memo: `docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`.

## Cache finding

Recast WASM, Vite build assets, and prebaked navmesh delivery were already on the correct immutable/header path. The blocker was synchronous terrain surface CPU work after mode select, not a missing WASM/navmesh cache push.

## Success criteria

- Mode-click deploy UI appears quickly in production-shaped startup probes for Zone Control, Open Frontier, and TDM, without returning terrain baking to the main-thread click path.
- Worker terrain baking uses transferable typed arrays and serialized provider configs; no fenced-interface change.
- Open Frontier and A Shau visual review accepts the source-backed visual-margin approximation before merge. If not accepted, replace it with persistent/prebaked visual-surface artifacts or IndexedDB/OPFS cache, not a synchronous fallback.
- `npm run typecheck`, `npm run lint`, `npm run lint:budget`, `npm run test:quick`, `npm run build`, and the three `perf-startup-ui` probes are linked in the PR. The existing CDLOD micro-timing flake must be called out if `validate:fast` fails only there.
