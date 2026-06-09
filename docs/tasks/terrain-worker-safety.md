# terrain-worker-safety

TerrainWorkerPool has four lifecycle hazards that can wedge startup or leak
memory: dispose() leaves pendingTasks promises hanging forever, worker.onerror
doesn't reject the pending task (silent stall), bakes have no timeout (navmesh
worker has 60s), getAvailableWorker has a busy/undefined fallback bug, and
demBufferCache retains ~21MB per worker after setHeightProvider replaces the
provider. (Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`,
Phase 4.)

## Files touched

- `src/systems/terrain/TerrainWorkerPool.ts`
- `src/workers/terrain.worker.ts`
- sibling behavior tests (new or extended)

## Scope

1. `dispose()` rejects all pendingTasks (no orphaned promises after a
   mode-switch/dispose race).
2. `worker.onerror` rejects the worker's pending task with the error.
3. Add a bake timeout mirroring the navmesh worker's 60s (reject + recover
   the worker slot).
4. Fix the `getAvailableWorker` busy/undefined fallback so a busy pool queues
   instead of mis-dispatching.
5. Evict `demBufferCache` on `setHeightProvider` (kills the per-worker ~21MB
   retention leak across mode switches).
6. Behavior tests: dispose-during-bake rejects; worker error rejects; timeout
   fires; cache evicted on provider swap.

## Non-goals

- Changing bake outputs or terrain content.
- The heightmap-resolution change (sibling task, same cycle — different
  surfaces; coordinate only if a rebase is needed).

## Acceptance

- [ ] Tests above pass; at least the dispose-hang and onerror-stall repros
      demonstrated on master first.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] terrain-nav-reviewer signs off pre-merge.
