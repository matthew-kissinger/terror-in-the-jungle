# Task C2: Recast WASM deduplication

**Phase:** C (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** medium (touches Vite config and worker bundling)
**Files touched:** `vite.config.ts`, possibly `src/systems/navigation/**` (import paths), `package.json`

## Problem

`recast-navigation` WASM ships twice in the build output:

```
assets/recast-navigation.wasm-compat-Cmsm6Jlo.js.gz   710.06kb / gzip: 212.51kb
assets/recast-navigation.wasm-compat-DaOaoX8x.js.gz   710.01kb / gzip: 212.47kb
```

That's ~1.4 MB of raw bytes (425 KB gzipped) duplicated in the shipped bundle. Per `docs/BACKLOG.md`, cause is "Vite worker boundary" — the main thread and the navmesh worker each get their own copy because Vite can't share a WASM module across the boundary by default.

## Goal

Single copy of recast-navigation WASM in the bundle. Bundle size drops by ~710 KB raw / ~212 KB gzipped.

## Required reading first

- `vite.config.ts` — current chunk / worker config.
- `src/systems/navigation/*.ts` — where recast is imported from main thread.
- Worker file path (likely `src/**/navmesh.worker.ts` or similar).
- Vite docs on manual chunking and worker config: `build.rollupOptions.output.manualChunks`, `worker.rollupOptions`.

## Suggested approach

Several possible angles; implementer picks based on investigation:

1. **Manual chunk for recast-navigation:** add `manualChunks: { 'recast': ['recast-navigation'] }` and see if both main and worker pull from the same chunk. May require Vite config refinements.
2. **Worker-as-module:** switch the navmesh worker to `type: 'module'` and use bare imports so Vite treats it as part of the same module graph.
3. **Shared recast init module:** if the above don't work, factor recast init into a shared `.ts` that both entry points import — Vite's dedup should catch it.

Start with option 1. Measure. If ineffective, try option 2. Document what worked and why.

## Verification

- `npm run build` completes.
- Inspect `dist/assets/` — exactly one `recast-navigation.wasm-compat-*.js` (or equivalent). No duplicate.
- `npm run test:run` green.
- `npx tsx scripts/prebake-navmesh.ts` still works (if applicable to this worktree).
- Runtime check: pathfinding still works. Load a mode, observe NPCs navigating.
- Report before/after bundle sizes from `npm run build` output.

## Non-goals

- Don't upgrade or downgrade recast-navigation.
- Don't change the navmesh prebake logic.
- Don't restructure navigation module boundaries beyond what's needed for dedup.
- Don't touch fenced interfaces.

## Exit criteria

- Single recast-wasm-compat shipped file.
- Bundle size dropped by ~700 KB.
- Tests and build green; runtime pathfinding works.
- PR titled `chore(build): dedupe recast-navigation wasm across main/worker (C2)`.
- PR body includes the before/after bundle size diff from build output.
