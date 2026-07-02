# KB-STARTUP-1 — Mode-start terrain surface bake

Status: closed 2026-07-02 (superseded — registry-truth-sweep, fork Q20)
Owning subsystem: terrain / engine init / perf harness
Opened: 2026-05-13 mode-startup spike

> **Superseded / closed 2026-07-02.** The spike's finding was "the stall is
> terrain CPU bake, not Recast/WASM cache." That exact bake was root-caused and
> fixed directly on master 2026-06-10 by the StampSpatialIndex work (`778bf4d2`):
> the per-sample all-stamps loop over ~1,364 A Shau stamps was the cost, and a
> uniform-grid stamp index cut sync-cpu-heights 47.2s→68ms and the worker
> surface bake 15.7s→95ms (zero longtasks ≥300ms). The spike branch's coarse
> "visual-margin source-delta cache" — whose Open Frontier + A Shau visual
> review was the last open acceptance criterion below — was a *workaround* for
> the slow bake; because the bake is now fast, that approximation never ships
> and the review is moot. The `task/mode-startup-terrain-spike` branch is absent
> from origin (verified) and obsolete. Carry-over moved to Closed in
> [docs/CARRY_OVERS.md](../CARRY_OVERS.md); the original spike evidence below is
> retained as history.

## Latest evidence

Baseline `artifacts/perf/2026-05-13T03-49-44-385Z/startup-ui-zone-control` measured Zone Control at `modeClickToDeployVisible=27765ms` and `modeClickToPlayable=32473ms`; Open Frontier timed out past 120s in the same diagnostic pass. The spike evidence after worker offload is `artifacts/perf/2026-05-13T04-30-36-660Z/startup-ui-zone-control` (`modeClickToDeployVisible=1156ms`, worker bake 523.4ms), `artifacts/perf/2026-05-13T04-31-26-223Z/startup-ui-open-frontier` (`3387ms`, worker bake 2374.7ms), and `artifacts/perf/2026-05-13T04-34-04-814Z/startup-ui-tdm` (`1185ms`, worker bake 236.8ms). Design memo: `docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`.

## Cache finding

Recast WASM, Vite build assets, and prebaked navmesh delivery were already on the correct immutable/header path. The blocker was synchronous terrain surface CPU work after mode select, not a missing WASM/navmesh cache push.

## Success criteria

- Mode-click deploy UI appears quickly in production-shaped startup probes for Zone Control, Open Frontier, and TDM, without returning terrain baking to the main-thread click path.
- Worker terrain baking uses transferable typed arrays and serialized provider configs; no fenced-interface change.
- Open Frontier and A Shau visual review accepts the source-backed visual-margin approximation before merge. If not accepted, replace it with persistent/prebaked visual-surface artifacts or IndexedDB/OPFS cache, not a synchronous fallback.
- `npm run typecheck`, `npm run lint`, `npm run lint:budget`, `npm run test:quick`, `npm run build`, and the three `perf-startup-ui` probes are linked in the PR. The existing CDLOD micro-timing flake must be called out if `validate:fast` fails only there.
