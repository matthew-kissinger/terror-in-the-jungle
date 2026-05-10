# BVH Rebuild Threshold Review

Last verified: 2026-05-10

## Scope

Optimization stream memo for terrain near-field BVH rebuild threshold tuning.
This pass inspected `TerrainRaycastRuntime`, `TerrainSystem`, terrain config,
and available local artifacts. The worktree has no `artifacts/` directory, so
this memo uses current source, targeted tests, and one local micro-measurement
of the live `TerrainRaycastRuntime` queue path.

## Current Implementation

The near-field terrain raycast mesh is owned by `TerrainRaycastRuntime`.

Current constants and defaults:

- `bvhRadius`: 200m from `createTerrainConfig()`.
- `bvhRebuildThreshold`: 50m from `createTerrainConfig()`.
- rebuild grid step: fixed 6m in `TerrainRaycastRuntime.queueNearFieldRebuild()`.
- normal update row budget: `Math.max(4, Math.floor(collisionUpdateBudgetMs * 10))`.
- default `collisionUpdateBudgetMs`: 0.8ms, so normal rebuilds process 8 rows
  per terrain update.

The runtime already avoids the historical reset-loop bug. If a rebuild is
queued, it only retargets the queue when the player moves farther than the
threshold from the current target center. Otherwise, it keeps draining
pending rows.

`TerrainSystem.update()` also staggers collision work against vegetation work:
on alternating frames where vegetation did work, collision rebuild work is
skipped. That reduces stacked terrain work but can extend wall-clock rebuild
completion during heavy vegetation churn.

## Measured Static Result

Command run in this worktree:

```powershell
@'
import * as THREE from 'three';
import { TerrainRaycastRuntime } from './src/systems/terrain/TerrainRaycastRuntime.ts';

const callsPerFrame: number[] = [];
let calls = 0;
const runtime = new TerrainRaycastRuntime({
  registerChunk: () => {},
  unregisterChunk: () => {},
  clear: () => {},
} as any);
const center = new THREE.Vector3(0, 0, 0);
let frames = 0;
do {
  calls = 0;
  runtime.updateNearFieldMesh(center, 200, 50, () => {
    calls += 1;
    return 0;
  }, 8);
  callsPerFrame.push(calls);
  frames += 1;
} while (runtime.getPendingRowCount() > 0 && frames < 20);
console.log(JSON.stringify({ frames, callsPerFrame }));
'@ | npx tsx -
```

Result:

- frames to drain at the default row budget: 9;
- height queries per full rebuild: 4,761;
- per-frame height-query slices: `552` for eight frames, then `345`;
- grid width: 69;
- triangles: 9,248;
- position buffer: 57,132 bytes;
- index buffer: 55,488 bytes;
- total geometry buffer size: 112,620 bytes.

## Threshold Tradeoff

The current threshold-to-radius ratio is 25% (`50 / 200`). That is
conservative: it keeps the player near the center of the 200m collision/LOS
mesh, but it can trigger rebuild queues during regular traversal.

Readiness checks are intentionally narrower than the full radius:

- `isTerrainReady()` accepts the player within `max(threshold, radius * 0.35)`,
  currently 70m.
- `isAreaReadyAt()` accepts queried areas within `max(24, threshold)`,
  currently 50m.

This means a simple threshold bump is not free. Raising
`bvhRebuildThreshold` above 70m changes both rebuild cadence and readiness
semantics. It could reduce rebuild frequency, but it may also allow more time
with the active player offset farther from the freshest committed mesh.

## Decision

No BVH threshold code change is justified from the current evidence.

Reasons:

- the current runtime is already incremental and drains a full 200m mesh in 9
  update slices at the default budget;
- existing source has explicit retarget protection for in-flight rebuilds;
- no current local A Shau or Open Frontier traversal artifacts are present;
- threshold changes affect both rebuild cadence and terrain readiness checks;
- previous docs already point to terrain rebuild bursts as suspicious, but
  not to a current before/after threshold measurement in this worktree.

## Low-Risk Candidate, If Measurement Justifies It

The first candidate is not a threshold bump. It is adding diagnostic counters
to the terrain capture path:

- rebuild queued count;
- retarget count;
- rows processed per frame;
- max pending rows;
- time from queue start to LOS registration;
- player distance from last committed center at queue start and completion;
- whether the frame was skipped because vegetation did work.

If those counters show frequent completed rebuilds with no readiness failures
and low terrain-hit sensitivity, then test thresholds of 64m and 80m in
Open Frontier and A Shau traversal captures. Keep 50m until a matched capture
shows better frame tails without readiness regressions.

Acceptance signal for a future code change:

- reduced rebuild starts per traversal minute;
- no increase in terrain-not-ready or LOS miss diagnostics;
- no new A Shau startup or traversal warnings;
- p99 and max-frame movement in the same direction on a quiet machine.
