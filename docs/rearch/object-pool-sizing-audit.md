# Object Pool Sizing Audit

Last verified: 2026-05-10

## Scope

Optimization stream memo for `TracerPool`, `ImpactEffectsPool`, and
`ExplosionEffectsPool`. This pass inspected current code and available local
artifacts. The worktree has no `artifacts/` directory, so this memo uses
current source, existing targeted tests, and one static measurement pass. It
does not claim a frame-time win.

## Current Implementation

All three pools extend `EffectPool` from
`@game-field-kits/three-effect-pool`. The package already:

- acquires from the inactive pool first;
- recycles the oldest active effect when capacity is exhausted;
- tracks `active`, `pooled`, `capacity`, and `recycled` through `getStats()`;
- releases expired effects with swap-and-pop compaction.

Current constructor sizes:

| Owner | Tracer | Impact | Explosion |
| --- | ---: | ---: | ---: |
| `CombatantSystem` | 256 | 128 | 16 |
| `FirstPersonWeapon` | 96 | 32 | 0 |
| `AirSupportManager` | 32 | 0 | shared from `CombatantSystem` |
| `AAEmplacement` | 48 | 0 | shared from `CombatantSystem` |
| `HelicopterWeaponSystem` | 32 | shared from `CombatantSystem` | 0 |
| `HelicopterDoorGunner` | 16 | shared from `CombatantSystem` | 0 |

Static declared total if all systems are present:

| Pool | Declared capacity | Preallocated scene children | Position-buffer bytes | Velocity vectors |
| --- | ---: | ---: | ---: | ---: |
| Tracer | 480 | 480 groups plus line children | small, per-tracer 2-point line buffer | 0 |
| Impact | 160 | 480 | 67,200 | 5,600 |
| Explosion | 16 | 80 | 36,480 | 3,040 |

The current object counts are not alarming by themselves. The more important
unknown is runtime occupancy and `recycled` counts during burst scenarios.

## Burst Pressure

Known effect bursts from source:

- Frag grenade: 1 explosion plus 5 impact effects.
- Smoke grenade: 8 impact effects.
- Flashbang: 1 explosion.
- Mortar detonation: 1 explosion plus 20 impact effects.
- AA emplacement destruction: 1 explosion.
- Hitscan combat and helicopter hits add impact effects one at a time.

Impact effects live for 500ms. The shared combat impact pool can absorb six
back-to-back mortar detonations before forced recycling. The standalone player
weapon impact pool is smaller at 32, but it is not used by grenade, mortar,
AA, or NPC combat systems.

Explosion effects live for 3s. A capacity of 16 means forced recycling begins
above roughly 5.3 explosion spawns per second for sustained 3s windows. That
could be correct for readability, but the current source evidence does not
prove whether it is too small or too large.

## Existing Instrumentation

`CombatantSystem` already records `effectPoolsMs` into combat profiling, and
`scripts/perf-capture.ts` exports that timing in capture samples. That is a
timing aggregate only. It does not record per-pool capacity, active count, or
recycled count.

The base `EffectPool` already exposes the missing occupancy counters through
`getStats()`, so the next measurement does not need a new pool abstraction. It
needs a narrow capture hook that samples these existing counters during an
effects-heavy scenario.

## Decision

No pool-size code change is justified from the current evidence.

Reasons:

- the pools are already fixed-capacity, preallocated, scene-resident, and
  recycle instead of allocating on the hot path;
- no local runtime artifacts are present in this worktree;
- current perf samples expose aggregate timing, not occupancy or recycling;
- increasing capacities would add persistent scene objects and memory without
  proof that recycling is visible or expensive;
- decreasing capacities risks visual recycling during grenade, mortar, and
  close-combat bursts without proof that residency is currently the bottleneck.

## Recommended Next Measurement

Add a short, local-only diagnostic to the existing grenade spike or combat120
capture path that records:

- `tracerPool.getStats()`;
- `impactEffectsPool.getStats()`;
- `explosionEffectsPool.getStats()`;
- max active count per pool;
- total and per-sample `recycled` delta;
- effect-pool timing beside those occupancy samples.

Acceptance signal for a future code change:

- if `recycled` stays zero and active counts stay well below capacity, reduce
  only after a memory or scene-traversal measurement shows benefit;
- if `recycled` increments during visible explosions, tune the specific pool
  capacity and rerun the same capture before claiming an optimization;
- if `effectPoolsMs` spikes without recycling, investigate per-effect update
  cost rather than pool size.
