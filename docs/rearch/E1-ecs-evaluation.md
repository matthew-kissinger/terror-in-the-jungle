# E1 — ECS migration (bitECS): evaluation

Branch: `spike/E1-ecs`
Date: 2026-04-16
Author: E1 spike executor
Status: Decision memo — requires human go/no-go call before any Batch F follow-up.

## 1. Question

Should we migrate high-count entities (combatants, projectiles) from the
current object-graph model to `bitECS`' entity-component-system model to
unlock the 3,000-agent combat target?

## 2. Subsystem chosen

**Projectiles (`GrenadePhysics`).** Chosen over combatants for two reasons:

1. Combatant state has ~40 fields spanning faction, squad, AI state, target
   refs, cover, movement anchors, LOD, terrain sample cache, etc. Porting a
   representative slice without losing fidelity would bleed outside the
   task's scope budget.
2. `GrenadePhysics.updateGrenade()` is an isolated, self-contained loop
   (~50 lines, position + velocity + gravity + ground collision). It is the
   cleanest possible "position + velocity + one behavior" slice the task
   brief asks for, and its field layout is structurally identical to the
   combatant case on the dimension that matters: objects-in-an-array with
   scattered THREE.Vector3 heap allocations.

If the data model doesn't win on projectiles, we shouldn't expect a clean
win on combatants either — and the surrounding combatant logic (LOS,
spatial grids, target refs, AI state) does not get faster just by changing
the storage layout. The storage layout isn't the bottleneck in either case.

## 3. Port description

### OOP baseline (`spike/E1-ecs/oop-baseline.ts`)

Mirrors `src/systems/weapons/GrenadePhysics.ts`:

- `OopProjectile = { id, position: THREE.Vector3, velocity: THREE.Vector3, active }`.
- Stored in a plain `OopProjectile[]` array.
- `stepOopPhysics()` applies gravity, air resistance, velocity integration,
  ground collision with bounce/friction — identical algorithm to the real
  `updateGrenade()` loop, minus THREE.Mesh updates and the ObjectPoolManager
  Vector3 borrow/release (stripped because they measure the pool, not the
  data model).

### ECS port (`spike/E1-ecs/ecs-port.ts`)

Native bitECS 0.4 form, no OOP wrappers:

- Components are plain objects of `Float32Array` / `Uint8Array` indexed by
  eid: `Position = { x: Float32Array, y: Float32Array, z: Float32Array }`.
- Typed arrays pre-allocated to `MAX_ENTITIES = 16_384` to avoid capacity
  cliffs.
- `stepEcsPhysics()` queries `[Position, Velocity, Active]` once per tick,
  hoists TypedArray refs into locals (the JIT-friendly pattern), then loops
  entity indices and writes directly to `px[eid]`, `vy[eid]`, etc.
- No wrapper classes. No `forEachComponent`-style abstraction. Native idiom.

### Stubbed out

- `THREE.Mesh` position/rotation sync. Irrelevant to the data-model
  question; renderer paradigm is E2's problem.
- `ObjectPoolManager` Vector3 borrow/release in the OOP path. Measuring the
  pool would distort the OOP-vs-SoA comparison. The pool would go away in
  any ECS port anyway.
- Rotation updates. Not on the hot path.

## 4. Measurements

### Reproducibility

```
npx tsx spike/E1-ecs/microbench.ts
# or, sanity checks:
npx tsx spike/E1-ecs/microbench-pure.ts
npx tsx spike/E1-ecs/microbench-dense.ts
```

Runtime: Node 24.14.1, V8 13.6.233.17-node.44.
Hardware: AMD Ryzen 7 3700X, single-threaded JS.
1000 timed ticks per bucket, 200-tick warmup, mulberry32 seed 42, `dt = 1/60`.

### Full physics loop (`microbench.ts`)

Workload: position + velocity + gravity + air resistance + ground collision
with bounce/friction. Settled projectiles get respawned to keep the workload
live.

| N    | impl | mean ms | p50 ms | p95 ms | p99 ms |
|------|------|---------|--------|--------|--------|
| 120  | oop  | 0.0050  | 0.0046 | 0.0068 | 0.0096 |
| 120  | ecs  | 0.0073  | 0.0064 | 0.0102 | 0.0179 |
| 500  | oop  | 0.0224  | 0.0210 | 0.0327 | 0.0354 |
| 500  | ecs  | 0.0240  | 0.0226 | 0.0297 | 0.0366 |
| 1000 | oop  | 0.0459  | 0.0451 | 0.0500 | 0.0549 |
| 1000 | ecs  | 0.0491  | 0.0476 | 0.0555 | 0.0729 |
| 2000 | oop  | 0.1017  | 0.0995 | 0.1142 | 0.1376 |
| 2000 | ecs  | 0.1041  | 0.1033 | 0.1087 | 0.1145 |
| 3000 | oop  | 0.1546  | 0.1536 | 0.1601 | 0.1666 |
| 3000 | ecs  | 0.1600  | 0.1591 | 0.1645 | 0.1766 |

### Speedup (ecs / oop), higher means ECS wins

| N    | mean x | p99 x |
|------|--------|-------|
| 120  | 0.69x  | 0.54x |
| 500  | 0.93x  | 0.97x |
| 1000 | 0.93x  | 0.75x |
| 2000 | 0.98x  | 1.20x |
| 3000 | 0.97x  | 0.94x |

**At N=3000 (our vision anchor): bitECS is 3% slower at mean, 6% slower at p99.**
Across all N, bitECS is either within noise or measurably slower.

### Sanity check 1 — pure motion, no branch/call (`microbench-pure.ts`)

Same bitECS query pattern but no ground collision, no function call, no
branches. Theoretical best case for SoA cache behavior.

| N    | oop mean ms | ecs mean ms |   x   |
|------|-------------|-------------|-------|
| 120  | 0.0007      | 0.0022      | 0.33x |
| 500  | 0.0029      | 0.0048      | 0.60x |
| 1000 | 0.0053      | 0.0074      | 0.71x |
| 2000 | 0.0091      | 0.0147      | 0.62x |
| 3000 | 0.0140      | 0.0214      | 0.65x |
| 5000 | 0.0270      | 0.0362      | 0.75x |
| 10000| 0.0563      | 0.0693      | 0.81x |

With the physics branching stripped, bitECS is _worse_ — because the
per-tick `query()` call overhead becomes a larger fraction of total work.

### Sanity check 2 — dense-iterate, no framework (`microbench-dense.ts`)

Raw `Float32Array` SoA with no bitECS at all, no query, no sparse set — just
iterating indices 0..N. This isolates "does SoA data layout beat OOP
Vector3s at all?"

| N    | oop mean ms | soa mean ms |   x   |
|------|-------------|-------------|-------|
| 120  | 0.0008      | 0.0008      | 0.99x |
| 500  | 0.0024      | 0.0025      | 0.98x |
| 1000 | 0.0053      | 0.0049      | 1.08x |
| 2000 | 0.0106      | 0.0097      | 1.10x |
| 3000 | 0.0142      | 0.0145      | 0.97x |
| 5000 | 0.0270      | 0.0249      | 1.08x |
| 10000| 0.0553      | 0.0488      | 1.13x |

Raw SoA (no framework) is ~10% faster at 10k, roughly parity at 3k, slower
at 120 (query-less iteration only starts paying off at larger N).

### Interpretation

1. **V8's JIT optimizes OOP access on stable-shape objects very well.** An
   array of `{ position, velocity }` where each Vector3 has `x/y/z`
   stable-shape properties gets hidden-class inline caching. Field reads
   compile to direct offset loads. This is not 1998-C++-style cache-cold
   property access; modern V8 has essentially closed the OOP-vs-SoA gap for
   this class of workload.
2. **The SoA data advantage at our scale is ~10%, not the "10-100x"
   assumption in `docs/REARCHITECTURE.md`.** The 10-100x number is a
   folk-wisdom ceiling that applies in C/C++ where struct fields aren't
   individually cached by the CPU front-end and OOP implies pointer
   indirection per field. JS doesn't have that.
3. **bitECS 0.4's per-tick `query()` overhead eats the raw SoA win.** A
   `query(world, [Position, Velocity, Active])` walks a sparse set and
   assembles a Uint32Array. That cost is O(N) plus framework bookkeeping.
   In principle `asBuffer` + cached queries might claw some of this back,
   but the brief said to measure the native form. The native form does not
   win.
4. **This workload isn't memory-bound.** Each entity per tick does ~15 float
   ops + 1 function call + 1-2 branches + 1-2 terrain samples. Arithmetic
   and branches dominate; the memory-access pattern doesn't materially
   affect wall-clock time.

## 5. Cost estimate

If we chose to migrate anyway (to achieve cleaner code, not speed):

- **Projectiles only (grenades + mortars + rockets + maybe helicopter
  weapons):** ~2-3 days. `GrenadePhysics`, `MortarSystem`, `GrenadeSystem`
  orchestrator, projectile spawn callers, grenade effects pool integration,
  arc renderer hookup.
- **Combatants:** ~2-4 weeks. The combatant surface (see `src/systems/combat/`)
  has ~65 files. Position/velocity alone is trivial; the hard parts are:
  - Target refs (`combatant.target` points to another Combatant) — must
    become eid refs with lookup dances.
  - LOD level, AI state, squad membership, faction — each becomes a
    component (which means the ComponentRegistry grows large and each tick
    runs many queries).
  - Navmesh adapter, spatial grid manager, terrain sample cache — these are
    external systems keyed by combatant.id; they'd need eid-keying or the
    migration has to be dual-path.
  - ~3700 existing tests touch Combatant objects directly. Not all would
    need updating, but the ones in `src/integration/scenarios/` and the
    combat-flow tests certainly would.
- **Entire codebase:** ~6-10 weeks, including vehicle-state, NPC vehicle
  controllers, cluster manager, influence map feedback. Not recommended
  without a concrete performance gain to motivate the churn.

## 6. Value estimate

Against the vision anchors in `docs/REARCHITECTURE.md`:

- **3,000-agent combat:** bitECS does not unblock this anchor. At 3000
  entities our projectile-shaped workload costs ~0.16 ms/tick; the combat120
  p99 ~34ms problem is not "position update is slow," it's
  `AIStateEngage.initiateSquadSuppression()` doing synchronous cover search
  (see `docs/BACKLOG.md`). **A storage-layout change cannot fix an
  algorithmic problem.**
- **Stable frame-time tails:** maybe marginal. bitECS's `query()` allocates
  per call (in default mode), which contributes to GC pressure — arguably
  _worse_ for tails than the current object-graph model, which has steady
  allocation patterns the GC has learned to collect cheaply.
- **Deterministic sim (E5 adjacent):** bitECS would _help_ here — iteration
  order over eids is deterministic, unlike `Map` iteration. But this is a
  benefit of SoA discipline, not specifically bitECS.
- **Agent-as-player (E4):** no impact.

**Summary: 0 of 4 vision anchors are unblocked by this migration.** Some
readability wins (explicit component composition) exist but they're not
bottlenecked by the object-graph model — they're bottlenecked by the AI
state machine sprawl, which E3 addresses directly.

## 7. Reversibility

- **The spike itself:** fully reversible; it lives on `spike/E1-ecs` and
  never touches master.
- **A real port, once landed:** poorly reversible. Once combatants are eids
  and systems use queries, rolling back means rewriting everything that
  indexes into those typed arrays. You can wrap components in classes for
  compatibility, but that destroys the original reason to port.
- **Dual-path:** feasible for a few weeks as a transition but painful to
  maintain. The combatant surface is too wide to keep two models in sync.

This is a high-cost, low-reversibility change with no measured performance
upside. That is the inverse of a decision the reversibility-weighted
rubric in `docs/REARCHITECTURE.md` § "Purpose of Phase E" would recommend.

## 8. Recommendation

**Defer. No measurable win in the prototype; the decision rule
(>=3x at 1000+ entities) is not met — we measured ~0.9x.**

Concrete next steps that address the _actual_ bottleneck:

1. Fix `AIStateEngage.initiateSquadSuppression()` synchronous cover search
   (already P0 in `docs/BACKLOG.md`). This is almost certainly where the
   ~34ms p99 at 120 NPCs comes from — not scattered-heap cache misses.
2. If, after (1), we still see tail problems at 500+ NPCs, revisit E1 with
   a _combatant_-shaped slice and a specific algorithmic hot-path in mind.
   The question then changes from "should we migrate to ECS?" to "is there
   a hot path where SoA enables vectorization we can't get in OOP?" — a
   much sharper question with a much better-bounded answer.
3. Do not port projectiles to bitECS for performance reasons. If we port
   them for _code cleanliness_, argue that case on its own merits — but
   `GrenadePhysics` at 143 lines is not the cleanliness problem to solve
   first.

### Decision rule from `docs/REARCHITECTURE.md` § E1 (verbatim)

> If bitECS wins by >=3x at 1000+ entities AND the port is bounded
> (estimable in <2 weeks), do it. If it wins by <2x or the port is
> unbounded, don't.

Measured: ~0.9x at 1000+ entities. The rule returns "don't" unambiguously.

### Fence-change implications

None. No proposed change to `src/types/SystemInterfaces.ts`. If a future
ECS port lands, `IPlayerController`, `IHelicopterModel`, etc. might need to
expose eids instead of object refs — but that's a Batch F planning concern,
not a decision this memo forces.

## Appendix — surprises worth flagging

1. **The "ECS is 10-100x faster" folk wisdom does not survive contact with
   modern V8.** This is the most important finding. Any future ECS pitch
   in this codebase should carry its own measurement, not rely on
   out-of-date intuition.
2. **bitECS 0.4 is a major API reshape** from older bitECS you may
   remember. Components are plain objects of typed arrays, not
   `defineComponent({ x: Types.f32, y: Types.f32 })` declarations. The 0.3
   API lives under `bitecs/legacy`. Any external blog post or tutorial on
   bitECS likely references 0.3; verify version before copying patterns.
3. **The OOP hot path includes per-tick `ObjectPoolManager.getVector3()`
   calls** in the real `GrenadePhysics.updateGrenade()`. We stripped them
   in the baseline. In production they add allocation/release overhead that
   bitECS wouldn't have — so the real-world gap is slightly narrower than
   our measurements suggest, but not enough to flip the conclusion. A
   cheaper change that would capture most of that saving: inline the
   arithmetic in `GrenadePhysics` (as we did in the baseline) and skip the
   pool. That's a surgical optimization, not an architecture change.
