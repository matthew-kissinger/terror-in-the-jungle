# Browser-runtime primitives inventory

Last verified: 2026-05-13

Authored on `exp/konveyer-webgpu-migration`; merged to `master` 2026-05-13 via PR #192 (commit `1df141ca`). Companion to
[ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
("keep the stack" + the 2026-05-13 ground-vehicle addendum naming
Rapier-Rust→WASM as a gated, not-default, future evaluation) and to
[GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
(which names the four-gate clause on adopting `@dimforge/rapier3d-compat`).
Sibling to [KONVEYER_AUTONOMOUS_RUN_2026-05-10.md](KONVEYER_AUTONOMOUS_RUN_2026-05-10.md)
(the WebGPU/TSL campaign map this branch is the home of). Owner-stated
scope expansion 2026-05-12: "any primitive we can fold into code that
runs in browser."

**TL;DR.** Forward-looking inventory of browser primitives this project
could fold into the runtime to push what is feasible in-browser, ordered
by leverage against the actual game shape (3000-NPC combatant sim, CDLOD
terrain on 21 km DEM, helicopter + fixed-wing + queued ground vehicles,
LUT-driven sky and atmospherics, large audio mix, replay-determinism
ambition). Scope is **not WebGPU** — KONVEYER covers that already — but
the CPU + memory + audio + input + networking surface around it. Rust→WASM
is named as **one toolbox item** (where it earns its keep on small hot
numeric kernels, deterministic fixed-point math, or pre-existing crates
like Rapier), not as a default. C++→WASM is already proven here via
`@recast-navigation/*` for navmesh, so the WASM call boundary is not a
new risk — only the toolchain choice on top of it is. The
leverage-ranked recommendation table in §11 has 18 rows; the four
**NOW**-ranked items are all WebGPU-compute (handled by KONVEYER), the
**NEXT** items are AudioWorklet for vehicle engine sim, OPFS for
prebake cache, one pilot Rust→WASM crate (ballistic solver), and
SharedArrayBuffer-flavoured worker buffers; everything else is
deferred, parked, or speculative.

---

## 1. State of play

What the project ALREADY uses from the browser-runtime surface, grounded
in current `src/` greps (2026-05-13).

| Primitive | Status here | Citation |
|---|---|---|
| **WebGL2** (`WebGLRenderer`) | Production runtime. | `src/core/GameRenderer.ts:44` instantiates `THREE.WebGLRenderer`. Output color space pinned to `THREE.SRGBColorSpace` at `GameRenderer.ts:121` and `src/dev/gunRangeScene.ts:110`. |
| **WebGPU + TSL** | Experimental on this branch. KONVEYER campaign tracks the migration. | [KONVEYER_AUTONOMOUS_RUN_2026-05-10.md](KONVEYER_AUTONOMOUS_RUN_2026-05-10.md). No `WebGPURenderer` instantiation in `src/` yet (`grep` returns no matches); planned per KONVEYER-1. |
| **Web Workers** (module-type) | Two active worker pools. | `src/systems/terrain/TerrainWorkerPool.ts:71` spawns up to `min(navigator.hardwareConcurrency - 1, 4)` instances of `src/workers/terrain.worker.ts` for heightmap bake + vegetation placement. `src/systems/navigation/NavmeshSystem.ts:177` spawns `src/workers/navmesh.worker.ts` for off-thread Recast tile build. Both via `new Worker(new URL(..., import.meta.url), { type: 'module' })` (Vite-bundled ES modules). |
| **WASM (C++→WASM)** | Production. | `@recast-navigation/core` + `@recast-navigation/generators` + `@recast-navigation/three` (per `package.json:168-170`) provide WASM-backed Recast/Detour. `NavmeshSystem.ts:162` awaits `core.init()` then spawns the worker. Note the WASM module loads on both main thread and worker — see `NavmeshSystem.ts:160-168`. |
| **SharedArrayBuffer / Atomics** | Not in use. | `grep` returns one comment-only match in `src/dev/terrainSandbox/heightmapExport.ts:102` ("SharedArrayBuffer-backed views would be rejected"). No live SAB. |
| **OffscreenCanvas / ImageBitmap / createImageBitmap** | Not directly used. | `grep` returns zero matches in `src/`. Three.js's loaders may use `createImageBitmap` internally for texture decode, but no explicit project usage. |
| **PointerLock + relative pointer movement** | Production for FPS look. | Used throughout `src/systems/input/InputManager.ts` and `src/systems/player/PlayerCamera.ts` (per `grep` for `PointerLock` and `requestPointerLock`). |
| **Gamepad API** | Production. | `src/ui/controls/GamepadManager.ts` is a dedicated wrapper with hot-plug, deadzone, and per-action mapping. Tested at `GamepadManager.test.ts`. |
| **Web Audio + PannerNode (via Three.js)** | Production. | `src/systems/audio/AudioManager.ts:44-47` creates `THREE.AudioListener` (a `PannerNode` wrapper). `src/systems/audio/AudioPoolManager.ts` pools `THREE.PositionalAudio` (HRTF spatialization). Procedural footstep DSP at `src/systems/audio/FootstepSynthesis.ts` creates noise buffers on the main `BaseAudioContext`. |
| **`crypto.subtle.digest`** | One use, advisory. | `src/systems/navigation/NavmeshCache.ts:42` hashes prebaked-navmesh inputs with SHA-256. Not on a hot path. |
| **`Math.random()` + `Date.now()` + `performance.now()`** | Heavy use; partially gated through `SeededRandom`. | Top-20 LOGIC sites already routed through `src/core/SeededRandom.ts` per C2 (see [C2-determinism-open-sources.md](C2-determinism-open-sources.md)); ~80-90 LOGIC sites remain on `Math.random`, ~60 on `Date.now`, ~30 on `performance.now`. The 14 systems that bypass `TimeScale` are catalogued in `MEMORY.md`. |
| **`navigator.storage` / OPFS / IndexedDB** | Not used. | `grep` for `OPFS`, `navigator.storage`, `IndexedDB` returns zero matches. Settings/saves currently flow through `localStorage` (per `src/config/SettingsManager.ts`, `src/systems/strategy/PersistenceSystem.ts`, `src/systems/navigation/NavmeshCache.ts`). |
| **BroadcastChannel / WebTransport / WebRTC / WebCodecs / WebHID / WebXR** | Not used. | `grep` returns zero matches. Game is single-player; no streaming media; no XR. |
| **Compression Streams API** | Not used. | `grep` returns zero matches. |
| **Cross-origin isolation (COOP + COEP)** | **Already enabled at the edge.** | `public/_headers:7-8` sets `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless`. This means `crossOriginIsolated === true` is reachable today, which unlocks SharedArrayBuffer, `performance.measureUserAgentSpecificMemory()`, and high-resolution timers without a one-line PR. CSP also already permits `'wasm-unsafe-eval'` and `worker-src 'self' blob:` (line 9). |

The COOP/COEP finding is the most important line in this section — it
means WASM threads + SAB are unblocked from the deploy side. Whether the
project takes advantage of that is a separate decision (§3).

---

## 2. CPU compute primitives

Ranked by leverage against the project's actual hot paths. For each:
what it is (one line), browser support (cross-browser cutover date),
what it would enable in *this* game, integration cost, priority.

### 2.1 Web Workers

**What.** Off-main-thread JS execution; `postMessage` boundary; transferable
ArrayBuffers cross the boundary by reference (zero-copy).

**Support.** Universal; module workers (`{ type: 'module' }`) supported
since Chrome 80 / Firefox 114 / Safari 15. Project already uses module
workers (see §1).

**What it enables here.**
- **Combat AI utility scoring sub-worker.** The DEFEKT-3 cover-search
  bottleneck (`AIStateEngage.initiateSquadSuppression()` synchronous
  cover search; ~34 ms p99 at combat120) is a candidate to move off the
  main thread once the data layout is SoA-friendly. Worker reads a
  snapshot of combatant transforms (Float32Array, transferred), runs
  scoring, posts back top-N candidates. Round-trip is async; the AI
  state machine has to tolerate a one-tick delay on the result. The R2
  cycle task brief slots here.
- **Deterministic sim worker (post-`SimClock` seam).** When the
  `SimClock` work in [C2-determinism-open-sources.md](C2-determinism-open-sources.md)
  lands, the deterministic combat tick can run in a worker, fed from a
  command queue. Main thread renders an interpolated snapshot. This is
  the standard headless-server-in-a-worker pattern.
- **Audio DSP** — see AudioWorklet (§7) which is the better home for
  this.

**Integration cost.** Low. The project already has the worker wiring
pattern (`new Worker(new URL(..., import.meta.url), { type: 'module' })`)
working in two places. The cost is per-system: defining the message
schema, transferable buffers, and back-pressure handling.

**Priority.** NEXT for combat-AI utility-scoring sub-worker (slots with
DEFEKT-3 follow-ups). DEFERRED for deterministic sim worker (gated on
`SimClock`).

### 2.2 SharedArrayBuffer + Atomics

**What.** A typed-array-backing buffer shared across worker boundaries
(no copy, no transfer). `Atomics.*` provides lock-free ops + futex-style
wait/notify.

**Support.** Chrome 68+, Firefox 79+, Safari 15.2+. **Requires
cross-origin isolation** (COOP=same-origin + COEP=require-corp or
credentialless). Already enabled at `public/_headers:7-8` on this
project's Cloudflare deploy.

**What it enables here.**
- **Zero-copy combatant snapshot.** A `SharedArrayBuffer`-backed
  `Float32Array(MAX_COMBATANTS * 8)` (x, y, z, vx, vy, vz, faction,
  flags) lets the main thread write while worker threads read, with
  `Atomics.load`/`Atomics.store` on a sequence counter for fence
  semantics. Saves the per-tick `postMessage` copy entirely.
- **Lock-free job queue.** A ring buffer of work items (cover search
  requests, navmesh path requests, BVH raycast batches) drained by N
  worker threads. `Atomics.wait`/`Atomics.notify` on the head/tail
  indices.
- **WASM threads prerequisite.** WASM threads (`shared` memory imports)
  require SAB. The Rapier crate, if ever adopted at the multi-vehicle
  gate, ships a threaded variant that needs this.

**Integration cost.** Medium. The COOP/COEP infrastructure is already
in place. The work is on the typed-array layout discipline and on
verifying every `<img>` / `<script>` / cross-origin resource the game
loads is `Cross-Origin-Resource-Policy`-compatible with COEP. The
existing CSP at `public/_headers:9` already constrains origins to the
project's own R2 bucket + Cloudflare Insights, so the COEP audit is
small. R2 assets need a `Cross-Origin-Resource-Policy:
cross-origin` header set in the R2 bucket settings; verify this in the
Cloudflare console before flipping any feature gate on.

**Priority.** NEXT (paired with the combat-AI worker — that's the first
hot path where the per-tick postMessage copy hurts).

### 2.3 WASM (general)

**What.** Compile-target bytecode for the browser; near-native arithmetic
performance; integer math is bit-exact across CPUs.

**Support.** Universal since 2017.

**What it enables here.** WASM is already proven in this codebase via
`@recast-navigation/*` (Recast/Detour navmesh, C++ source) and is fenced
behind a tested wrapper. New WASM candidates:

- **AI utility scoring inner loop.** ~10 features per candidate cover
  point, 50-200 candidates per request, ~120 requests per second under
  combat120. A tight loop over Float32Array contiguous memory. SIMD-
  vectorizable.
- **Ballistic trajectory solver.** Tank cannon shell with drag + gravity
  + spin + Magnus + wind, integrated at 1 ms substeps for ~3 second
  flight. Called once per shot. Small, hot, deterministic.
- **Fixed-point deterministic math library.** If the `SimClock` +
  ReplayPlayer work extends to byte-identical cross-machine replay
  (currently an explicit non-goal per [C2-determinism-open-sources.md](C2-determinism-open-sources.md)
  §"Tolerance and scope"), `i32`/`i64` math in WASM is the cleanest
  path; TypeScript's IEEE-754 `number` cannot match across CPUs even
  with seeded RNG.
- **Influence map blur kernel.** 64x64 grid (`InfluenceMapSystem`),
  5-pass separable Gaussian, runs every 500 ms. Cache-friendly,
  SIMD-vectorizable.

**Integration cost.** Low for tactical WASM modules. The `tsconfig.json`
+ Vite already handles `*.wasm` URLs via the Recast tooling. Cost is on
the source-language toolchain — see §4 for Rust→WASM, which is the
recommended path for new WASM modules in this project. Emscripten/C++
is the other option but the project has zero in-house C++ today and
adding a build dimension is not free.

**Priority.** NEXT for a single Rust→WASM pilot module (see §4 for
candidate selection). DEFERRED for broader WASM adoption.

### 2.4 WASM SIMD (`v128`)

**What.** 128-bit packed-SIMD ops inside WASM. Four 32-bit floats or
four 32-bit ints per op. `f32x4.add`, `f32x4.mul`, `f32x4.fma`, etc.

**Support.** Chrome 91+, Firefox 89+, Safari 16.4+. Universal on modern
desktop browsers; the Safari catch-up was the last holdout. Mobile
Safari 16.4+ supports it.

**What it enables here.** SIMD wins are concentrated in tight numeric
loops with regular memory access. Concrete candidates:

- **Influence-map separable Gaussian blur.** 4-tap horizontal pass +
  4-tap vertical pass over 64x64 = 4096 cells. SIMD-friendly; 3-4×
  speedup over scalar Float32 plausible.
- **Spatial-grid cover-point scoring.** Parallel scoring of up to four
  cover points at a time per `v128` lane. Vector dot products, distance
  squared, half-space tests are all SIMD-friendly.
- **Batched vector math** — e.g., updating N combatant velocity
  vectors against a wind field, or batched ray-vs-AABB tests for
  pre-BVH culling.
- **Ballistic solver substep batches.** Solve four shells' positions in
  a single SIMD-vectorized substep.

**Integration cost.** Low if the surrounding code is already in WASM.
Negligible additional cost beyond §2.3 once a Rust→WASM crate exists —
SIMD intrinsics are `cargo` feature-gated and the build target
`wasm32-unknown-unknown` with `+simd128` enables them.

**Priority.** NEXT (folds into the §4 pilot crate).

### 2.5 WASM threads

**What.** A WASM module compiled with `shared` memory imports, executed
by multiple workers each owning a thread of execution against the same
`SharedArrayBuffer`-backed linear memory.

**Support.** Universal modern browsers; requires SAB which requires
cross-origin isolation. Both are met here per §1.

**What it enables here.** Specifically what Rapier's threaded variant
uses — broadphase + narrowphase + constraint solver split across
threads. Of marginal value for this project until the multi-vehicle
gate fires (per `GROUND_VEHICLE_PHYSICS_2026-05-13.md`). Until then no
hot path in scope needs > 1 WASM thread.

**Integration cost.** Medium-high. The build chain is more involved
(`wasm-bindgen` + `wasm-pack` + Rayon-on-wasm in Rust; Emscripten-
pthreads in C++). The runtime cost is on memory-management discipline.

**Priority.** DEFERRED until Rapier is in scope at its named gate.

### 2.6 OffscreenCanvas

**What.** A canvas whose backing buffer can be transferred to a worker.
The worker holds the rendering context (WebGL2 / WebGPU / Canvas2D) and
draws without main-thread involvement.

**Support.** Chrome 69+, Firefox 105+, Safari 16.4+. Now universal on
modern targets.

**What it enables here.**
- **Off-main-thread Three.js render.** Move the entire `WebGLRenderer`
  / `WebGPURenderer` instance into a worker. Main thread reduces to
  input + UI + per-tick state writes. Frame-rate ceiling rises to "the
  worker's busy fraction" rather than "all main-thread work combined".
  Trade-off: one renderer per worker; DOM access from the worker is
  zero; loading screens / HUD overlays still live on the main thread or
  on a separate Canvas2D overlay.
- **Tile-builder canvases.** The Pixel Forge close-model billboard
  pipeline (per `memory/project_perception_and_stuck_2026-05-08.md`)
  composes per-NPC silhouette frames into atlas tiles. Doing this on
  an OffscreenCanvas inside a worker would unblock main-thread frames
  during atlas regen.

**Integration cost.** High for full-renderer move (touches every system
that holds a `renderer` reference; fenced `IGameRenderer` would need a
worker-side proxy). Low for tile-builder offloading.

**Priority.** DEFERRED for renderer migration (gated on KONVEYER
landing). Tile-builder offloading is a NEXT candidate once Pixel Forge
finishes the velocity-keyed cadence iteration.

### 2.7 Cryptographic primitives (`crypto.getRandomValues`, `crypto.subtle`)

**What.** Native-grade randomness + hashes. `getRandomValues(typedArray)`
fills a buffer with cryptographic-quality entropy. `crypto.subtle` is
async; not for hot paths.

**Support.** Universal.

**What it enables here.** The project already uses `crypto.subtle.digest`
for cache invalidation (`NavmeshCache.ts:42`). `getRandomValues` could
seed `SeededRandom` instead of `Math.random()`-derived seeds, but the
determinism story explicitly *prefers* reproducible PRNG output — so
`crypto.getRandomValues` is the wrong tool inside the simulation. The
correct use is for one-shot session-ID / build-ID / save-slot-ID
generation outside the sim.

**Priority.** Stable as-is; no new adoption needed.

---

## 3. Rust → WASM as a toolbox option

Owner direction 2026-05-12: Rust where it earns its keep. Tone for this
section is the same as `ENGINE_TRAJECTORY_2026-04-23.md` §6 — name the
shape, name where it pays, name where it doesn't, recommend a single
small pilot before committing to a build-system shift.

### 3.1 Where it earns its keep

- **Small hot numeric kernels with SIMD-vectorizable shape.** If a
  TypeScript hot path is 8-12% of frame time, called many times per
  tick, and operates on contiguous numeric data, Rust+WASM with
  `wasm32-unknown-unknown` + `+simd128` is a real 3-8× win in practice
  (industry consensus, not measured here; the E1 spike found that V8
  closes the OOP-vs-SoA gap inside JS — see
  [E1-ecs-evaluation.md](E1-ecs-evaluation.md) §4 — but that finding is
  *within JS*, not vs WASM SIMD, where the SIMD intrinsics live below
  V8's reach).
- **Deterministic fixed-point or integer math.** TypeScript's `number`
  is IEEE-754 `f64`. Reproducing exact results across CPUs (different
  microcodes, x87 vs SSE rounding modes, ARM-vs-x86 transcendental
  function precision) is fragile. Rust `i32`/`i64` ops compile to
  WASM `i32.add`/`i64.mul` that are bit-exact by the WASM spec, on
  every conformant runtime. Relevant when [C2-determinism-open-sources.md](C2-determinism-open-sources.md)'s
  "cross-machine determinism is an explicit non-goal" assumption ever
  flips — e.g., for VODA-1 multiplayer or for byte-identical replay
  archives.
- **Pre-existing Rust crates that solve a problem better than DIY.**
  Rapier (`@dimforge/rapier3d-compat`) is the canonical example,
  already named at a deferred-revisit gate per
  `GROUND_VEHICLE_PHYSICS_2026-05-13.md`. Others worth knowing about
  exist (e.g., `parry3d` for narrowphase, `glam` for SIMD-friendly
  vector math) but none of them is in scope yet.

### 3.2 Where it's tooling theater

- **Code that's not hot.** The WASM↔JS call boundary has overhead per
  call (function-table indirection, type-marshalling, GC root
  management). A function that runs in 50 ns scalar JS is *slower* in
  WASM if the boundary cost exceeds the body's savings. Rough rule:
  the body has to do > 1 µs of work to amortize a boundary call. Tiny
  utilities lose.
- **Code that manipulates JS-side objects, strings, DOM, or async
  resources.** Marshalling these across the WASM boundary is expensive
  (UTF-8 conversion, JS-object proxy via `wasm-bindgen`, lifetime
  management). Game logic that lives in JS objects (`Combatant`,
  `Squad`, `AIState`) doesn't translate cleanly.
- **Subsystems that will be replaced by Three.js's next minor anyway.**
  Custom shader passes, scene-graph helpers, GLB loader hooks — these
  evolve fast upstream. Locking them into a WASM module that ships
  separate to the main bundle is a maintenance bill.

### 3.3 Integration cost

| Cost vector | Detail |
|---|---|
| Toolchain | `cargo` (stable Rust + `wasm32-unknown-unknown` target), `wasm-bindgen` or `wasm-pack`, and a Vite plugin (`vite-plugin-wasm` or `@rollup/plugin-wasm`). Independent of the existing Emscripten-built `@recast-navigation/*` path — no clash. |
| Bundle | Small Rust hot-path crate: ~30-80 KB gzipped per module (includes the trimmed `std` + allocator). With `wasm-opt` (binaryen) typically halves. Rapier full: ~600 KB gzipped per its npm package, named in `GROUND_VEHICLE_PHYSICS_2026-05-13.md` §"Decision". |
| CI | Adds a `cargo build --release --target wasm32-unknown-unknown` step before Vite. Cargo caching keeps incremental builds fast (~1-5 s after warm cache). First cold build is ~30-60 s. |
| Workspace structure | Recommend `crates/<name>/` at repo root, each crate published as a Vite-imported WASM module via `wasm-bindgen` glue. Keeps the Rust source out of `src/` (which is reserved for TypeScript). The TS-side import looks like `import init, { solveBallistic } from './crates/ballistics/pkg/ballistics.js'`. |
| Source-of-truth boundary | The `.d.ts` emitted by `wasm-bindgen` is the interface contract. Treat it as a fenced surface; changing it is a "fence change" by the spirit of `docs/INTERFACE_FENCE.md` even though the file isn't `src/types/SystemInterfaces.ts`. |
| Test story | Per-crate `cargo test` for unit tests (run on host, not WASM, since the crate is pure-numeric). Behavior tests live in TS-side `vitest` and call into the WASM module; the test infrastructure already loads WASM (Recast pattern). |

### 3.4 Concrete candidates for this project

| Candidate | Subsystem | Why Rust pays |
|---|---|---|
| Ballistic trajectory solver | Tank cannon shells (queued VEKHIKL-4) and existing mortar/grenade arcs | Small, hot, isolated. Easy to A/B against a TS reference. Drops cleanly into the tank-cannon flow. |
| Cover-search spatial grid | DEFEKT-3 close | Tight numeric loop; SIMD-vectorizable. Alternative path if KONVEYER's WebGPU-compute spatial grid (named in the experimental-branch parity matrix) is blocked. |
| Influence-map blur kernel | `InfluenceMapSystem` (per [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md) §2.3) | Separable Gaussian, contiguous Float32Array, 64×64. Clean SIMD candidate. |
| Deterministic fixed-point math library | Future VODA-1 multiplayer or cross-machine replay | Bit-exact ops; reproducible across CPUs. Wraps `i32` saturating arithmetic with a thin TS-facing API. |
| Rapier integration shim | Gated per `GROUND_VEHICLE_PHYSICS_2026-05-13.md` four-gate clause | Not a new Rust *crate* — this is "adopt the existing Rust→WASM crate behind a gate." Counts here only for tracking. |

### 3.5 Recommendation — one pilot crate first

**Pilot: the ballistic trajectory solver.** Reasons:

1. **Small.** ~150-300 lines of Rust for shell physics (drag, gravity,
   Magnus, ground-test). Single struct, single function entry point.
2. **Isolated.** Touches nothing else; the call site is at most
   "spawn a projectile" and "advance a projectile". Reversible by
   deletion + restoring the TS reference.
3. **Easy A/B.** The TS reference implementation exists in
   `src/systems/weapons/GrenadePhysics.ts` and would stay as a
   fallback. A `?ballisticBackend=rust|ts` query parameter switches at
   boot — exactly the dual-renderer pattern KONVEYER-1 already
   establishes for WebGPU/WebGL.
4. **Lands cleanly when VEKHIKL-4 (tank cannon) opens.** The tank
   cannon needs accurate shell physics in a way the existing grenade
   arc doesn't; the pilot would already be production-tested by the
   time the tank cycle wants it.
5. **Validates the toolchain.** Once one Rust crate ships through CI,
   the second is mechanical. The first is the expensive one.

Specifically **do not** bring Rapier in for the pilot. Rapier is gated
per `GROUND_VEHICLE_PHYSICS_2026-05-13.md` and a pilot at that scale
breaks the "small, isolated" rule.

---

## 4. Memory + asset primitives

### 4.1 Origin Private File System (OPFS)

**What.** Browser-sandboxed file system, accessible via
`navigator.storage.getDirectory()`. Files persist across sessions;
quota is generous (typically half of free disk, per UA). Synchronous
file-handle access available **only inside workers** via
`createSyncAccessHandle()`.

**Support.** Chrome 86+, Firefox 111+, Safari 15.2+ (with the
synchronous handle landing later in Chrome 102 / Firefox 111 / Safari
17). Universal for the project's target audience.

**What it enables here.**
- **Prebake cache.** The project ships prebaked navmeshes + heightmaps
  via `scripts/prebake-navmesh.ts` and `public/data/navmesh/*` (cached
  at the edge with `Cache-Control: public, max-age=31536000, immutable`
  per `public/_headers:32`). For modes that prebake at runtime (the
  worldbuilder console, terrain-param-sandbox), persisting bakes to
  OPFS would survive page reloads without re-baking. Today the
  worldbuilder leans on `localStorage` (which has a ~5 MB quota and
  is JSON-only) per `src/dev/worldBuilder/WorldBuilderConsole.ts`.
  OPFS is the right home for binary baked artifacts.
- **Replay archive storage.** `ReplayRecorder` currently lives in
  memory; persisting a replay to OPFS lets the user replay sessions
  later or share them.
- **User save slots.** `SettingsManager.ts` uses `localStorage` today;
  fine for small JSON but blocks any larger save-game shape (campaign
  progress, loadout history, custom maps from worldbuilder). OPFS
  unblocks that.
- **Asset side-loading.** Future: drop a custom GLB into a folder, the
  worldbuilder picks it up from OPFS. Niche but cheap.

**Integration cost.** Low. The API surface is small (`getDirectory`,
`getFileHandle`, `createWritable`/`createSyncAccessHandle`). A thin
`OpfsStore` adapter mirroring `SettingsManager`'s shape would unify
storage. Worker-side sync access is preferable for binary writes.

**Priority.** NEXT for prebake cache (lines up with the
worldbuilder + terrain-param-sandbox flows). DEFERRED for replay
storage (gated on replay-feature scope).

### 4.2 Streams API (ReadableStream / WritableStream / TransformStream)

**What.** Backpressure-aware streaming I/O primitive. Pipes producers
(`fetch().body`, `Blob.stream()`) to consumers (`<video>`, decoder)
with chunk-by-chunk processing.

**Support.** Universal.

**What it enables here.**
- **CDLOD tile streaming.** Today CDLOD tile fetches are full-buffer
  `fetch().then(r => r.arrayBuffer())`. Streaming the heightmap chunks
  by row would let the worker start computing while the network is
  still delivering. Marginal win for our chunk sizes (typically tens
  of KB) but free if we already touch the tile-fetch code for the
  KONVEYER terrain port.
- **Replay-file compression on write.** Pipe `ReplayRecorder` events
  through a `CompressionStream('gzip')` (see §4.4) into an OPFS
  writable. The whole pipeline is non-blocking.
- **Asset prefetch with progress.** `fetch().body` can be streamed +
  measured for a loading-bar percentage. Today the project uses the
  size-from-Content-Length pattern; streaming would let progress
  reflect actual decoded bytes.

**Integration cost.** Low. Streams compose with `fetch` already.

**Priority.** PARKED. Useful but not load-bearing today. Lands free
when other primitives in this list (Compression Streams, OPFS replay)
arrive.

### 4.3 OffscreenCanvas + ImageBitmap

**What.** `createImageBitmap(blob, options)` decodes an image off the
main thread and returns a transferable handle. Three.js's
`ImageBitmapLoader` is the loader-side adapter.

**Support.** Universal modern browsers.

**What it enables here.**
- **Asset texture decode off main.** GLB → glTF KHR_texture_basisu
  decodes are CPU-heavy. `ImageBitmapLoader` already handles
  out-of-the-box decoding for image-based textures. **Verify the
  project's `TextureLoader` usage uses `ImageBitmapLoader` where
  available** (no occurrence in `src/` per `grep`; Three.js may
  internally select it). If the asset pipeline is hitting main-thread
  decode stalls during load, this is the fix.
- **Atlas regeneration off main** — see Pixel Forge offload in §2.6.

**Integration cost.** Low. A one-line `THREE.ImageBitmapLoader` swap
where applicable, plus a fallback for environments that don't support
it (older Safari).

**Priority.** DEFERRED. Audit loading-spike frames first; if texture
decode is on the critical path, prioritize. Otherwise PARKED.

### 4.4 Compression Streams API

**What.** Native `CompressionStream('gzip' | 'deflate' | 'deflate-raw')`
and `DecompressionStream`. Streaming, no extra JS bytes shipped.

**Support.** Chrome 80+, Firefox 113+, Safari 16.4+. Universal on
modern targets.

**What it enables here.**
- **Replay-file compression.** A 30-second combat120 replay's input
  trace is small (~100 KB); compressed it's ~10-20 KB. Cheap win if
  replays ever ship to disk or to a server.
- **Worker payload compression.** Sending large state snapshots
  between main and worker can be compressed in flight. Likely a loss
  for hot paths (gzip overhead beats the network transfer cost only
  at WAN distances; main↔worker is in-process), so this is mostly an
  on-disk / cross-tab story.

**Integration cost.** Negligible. Streams glue.

**Priority.** PARKED. Lands when replay-to-disk or save-archive arrives.

### 4.5 WebCodecs (`VideoDecoder` / `AudioDecoder` / `ImageDecoder`)

**What.** Hardware-accelerated, frame-accurate codec access. Bypasses
the `<video>`/`<audio>` element. Returns decoded frames as
`VideoFrame` / `AudioData` / `ImageBitmap` for direct GPU upload.

**Support.** Chrome 94+, Firefox 130+, Safari 16.4+ (partial — Safari
ships `VideoDecoder` and `AudioDecoder` but not `ImageDecoder` until
17.x). Effectively universal on the project's likely target browsers.

**What it enables here.**
- **In-game video screens.** Briefing screens, propaganda playback on
  TV-screen meshes, intel reels. The traditional `<video>` element
  has frame-sync, latency, and texture-update quirks that
  `VideoDecoder` sidesteps. Probably not load-bearing for this game
  but a clean primitive if cinematic content lands.
- **Helicopter / fixed-wing thermal-camera HUD render.** Not in scope
  but a candidate if VEKHIKL-X ever ships an FLIR mode.

**Integration cost.** Medium. Frame timing + AudioWorklet sync is
non-trivial.

**Priority.** SPECULATIVE.

---

## 5. Rendering primitives beyond WebGPU

WebGPU + TSL is the KONVEYER campaign's focus and out of scope here.
Adjacent rendering primitives the browser exposes:

### 5.1 HDR canvas / Display-P3 / Rec2020

**What.** Wider gamut + brighter highlights via
`getContext('webgl2', { colorSpace: 'display-p3' })` and
`canvas.configureHighDynamicRange({ mode: 'extended' })` (the latter
still spec-evolving). Three.js supports `THREE.DisplayP3ColorSpace`.

**Support.** Display-P3: Chrome 90+, Safari 11+, Firefox 113+. HDR
extended-range: Chrome 132+ (origin trial / behind flag in earlier),
Safari 16.4+. Maturity uneven.

**What it enables here.** Sun, muzzle flash, explosion fireballs,
tracer cores — anything authored above peak SDR white — would actually
render brighter than display white on HDR displays. The atmosphere
recently moved to LUT-driven DataTexture + 2 s refresh (per recent
KONVEYER commits); sky highlights are a natural HDR consumer.

**Current state.** Pinned to SRGB at `GameRenderer.ts:121`
(`this.renderer.outputColorSpace = THREE.SRGBColorSpace`). No HDR
plumbing.

**Integration cost.** Medium. Color authoring + tone-mapper + Bayer
quantize pass (`PostProcessingManager`) all assume SDR. The retro
pixelation aesthetic per [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
§2.5 may not benefit from HDR at all — HDR mostly wins on smooth
highlight rolloff, and the project's look quantizes that on purpose.

**Priority.** DEFERRED, gated on a visual review (does the look
target *want* HDR?). Most likely PARKED.

### 5.2 `requestVideoFrameCallback`

**What.** Per-decoded-frame callback for `<video>` elements; gives
exact presentation time + media time. Lets video textures sync to the
render loop instead of polling.

**Support.** Chrome 83+, Firefox 132+, Safari 15.4+.

**What it enables here.** Frame-accurate video-texture sync for the
in-game-video-screens scenario in §4.5. Niche.

**Priority.** PARKED.

### 5.3 View Transitions API

**What.** Declarative cross-document animated transitions for DOM
elements; the browser snapshots before/after states and animates the
diff.

**Support.** Chrome 111+, Safari 18+, Firefox not yet.

**What it enables here.** Polished HUD/menu transitions
(loading → main menu → mode select). Cosmetic; not load-bearing.

**Priority.** PARKED.

### 5.4 `image-rendering: pixelated`

**What.** CSS property suppressing image-smoothing on upscaled images.

**Support.** Universal.

**What it enables here.** The Pixel Forge impostor pipeline already
quantizes to a target pixel grid. If any of those impostors leak
through CSS-styled `<img>` elements (HUD icons sourced from atlas
images), `image-rendering: pixelated` keeps them crisp.

**Priority.** NOW (free; check HUD-icon CSS once and call it). Likely
already applied per `PixelPerfect.ts` (per `grep`) but verify on the
HUD-icon path.

---

## 6. Audio primitives

### 6.1 AudioWorklet

**What.** Custom audio-processing node running on the audio rendering
thread (separate from main thread, separate from any Web Worker).
JavaScript-coded DSP with sample-accurate timing. Inputs and outputs
are Float32Arrays of size 128 (one render quantum).

**Support.** Chrome 64+, Firefox 76+, Safari 14.1+. Universal.

**What it enables here.**

- **RPM-driven engine sound synthesis** for the M151 jeep (VEKHIKL-1)
  and queued tanks. Pitched-sample engine sounds — the current pattern
  for the helicopter rotor and fixed-wing engines — sound thin under
  load variation. An AudioWorklet additive-synthesis engine model
  (fundamental + 4-6 harmonics + per-band gain envelopes keyed on RPM
  and throttle) sounds 10× more alive at no asset cost. This is the
  highest-leverage single use of AudioWorklet for this game.
- **Impact-material-aware sound resampling.** Currently
  `FootstepSynthesis.ts` builds an AudioBuffer on the main thread and
  plays it via Three.js's `Audio`. Moving the synthesis to an
  AudioWorklet allows continuous parameter modulation (terrain blend,
  speed-keyed cadence, weight-keyed bass) without rebuilding buffers.
- **Procedural ambient layer.** Wind-by-altitude, crowd-by-density,
  combat-by-intensity — a continuous synth bed parameterized by game
  state. Plays well with the existing `AmbientSoundManager`.
- **Custom HRTF / occlusion DSP** beyond the built-in `PannerNode`.
  Niche; the `PannerNode` HRTF is already decent for this game shape.

**Latency note.** AudioWorklet has higher input-to-output latency on
Safari than on Chrome (the `audioContext.outputLatency` value differs
substantially). For DSP that responds to game events (gunfire,
explosions), the latency is fine — those are scheduled, not realtime.
For player-input-to-audio loops (custom synth controlled by mouse), it
matters; not a use case here.

**Integration cost.** Medium. The AudioWorklet processor runs in a
separate JS context; module loading + parameter messaging is its own
surface. The synth itself is the work — a single-cylinder engine model
is ~200 lines of careful DSP. The plumbing is ~50 lines.

**Priority.** NEXT, paired with VEKHIKL-1 (jeep MVP) or VEKHIKL-4 (tank
cannon + engine). Highest-leverage non-WebGPU primitive in this memo.

### 6.2 `PannerNode` / HRTF

Already in use via Three.js's `PositionalAudio` (per §1). Stable.

### 6.3 Web MIDI

Speculative — only relevant if a player wants to control the game with
a MIDI controller. PARKED.

---

## 7. Input primitives

### 7.1 Gamepad API

Already in use via `src/ui/controls/GamepadManager.ts`. Hot-plug
events and deadzone are handled. **Common gotcha worth flagging:**
the Gamepad API's `gamepadconnected`/`gamepaddisconnected` events fire
only on user input on Chrome (security feature, since Chrome 100ish).
The wrapper handles this but verify on Safari which has different
semantics.

**Priority.** Stable.

### 7.2 WebHID

**What.** Direct USB HID descriptor access. Browser-mediated; user
must explicitly grant per-device permission via a chooser.

**Support.** Chrome 89+, Edge 89+. Not in Safari or Firefox.

**What it enables here.** HOTAS (Hands-On Throttle-And-Stick) for
flight-sim fans on the helicopter / AC-47 / future fixed-wing.
Quality-of-life feature; not in scope today. Niche but cheap once an
HID-to-action mapping layer exists.

**Priority.** PARKED.

### 7.3 WebXR Device API

**What.** VR headset + AR pass-through input + projection model.
Three.js supports WebXR (`renderer.xr.enabled = true`).

**Support.** Chrome desktop + Meta Browser + Apple Vision (Safari)
support varies.

**What it enables here.** A VR mode for the game. Cost: re-render
twice per frame at higher framerate target (90-120 Hz); rebake the
controller/locomotion model entirely (no FPS-mouse-look story); UI
goes 3D. Significant scope.

**Priority.** SPECULATIVE.

### 7.4 PointerLock

Already in use. Stable.

---

## 8. Determinism primitives

The C2 determinism work ([C2-determinism-open-sources.md](C2-determinism-open-sources.md))
already names the remaining LOGIC sites that need to thread through
the deterministic seam. From the browser-primitive lens specifically:

### 8.1 Seeded PRNG

`src/core/SeededRandom.ts` is in place. Continuing the C2 pass is
mechanical. No new primitive needed.

### 8.2 Fixed-point math (`i32` fractional units)

Two paths:

- **TypeScript implementation.** A `Fixed32` class with manually scaled
  integer ops. Works; verbose; allocates on every op unless boxed in
  typed arrays.
- **Rust→WASM implementation.** Native `i32` ops, bit-exact across
  CPUs by WASM spec. The pilot crate from §3.5 doesn't need this, but
  if the determinism story extends to byte-identical cross-machine
  replay, this is where the lever lands.

**Priority.** DEFERRED, gated on the determinism scope expanding to
cross-machine (currently an explicit non-goal per C2).

### 8.3 `performance.now()` vs `performance.timeOrigin` + replay-mode clock

`MEMORY.md` catalogues 14 systems that read `performance.now()`
directly and bypass `TimeScale`. The `SimClock` seam named in
[C2-determinism-open-sources.md](C2-determinism-open-sources.md)
§"Recommended next pass" is the unified fix. Not a new browser
primitive — it's a wrapper over existing ones.

### 8.4 `performance.measureUserAgentSpecificMemory()`

**What.** Cross-realm memory measurement. Reports heap + workers +
WASM in one number.

**Support.** Chrome 89+; requires cross-origin isolation. Both met.

**What it enables here.** Drop-in replacement for the
`performance.memory.usedJSHeapSize` (Chrome-only, less accurate) in
`PerformanceTelemetry`. Better leak detection, especially with workers
+ future Rust→WASM modules.

**Priority.** NEXT (paired with the worker / WASM expansion;
otherwise the new heap doesn't show up in telemetry).

---

## 9. Networking primitives (speculative)

The game is single-player today. Networking primitives are catalogued
for completeness; none are NOW or NEXT.

### 9.1 WebTransport

**What.** Bidirectional, datagram + reliable-stream, UDP-like protocol
over HTTP/3 QUIC. Lower latency and head-of-line-free vs WebRTC for
game-state syncing.

**Support.** Chrome 97+, Firefox 114+. Not Safari yet.

**What it enables here.** Multiplayer (VODA-1, theoretical). Replaces
the WebSocket / WebRTC pattern as the default.

**Priority.** PARKED.

### 9.2 WebRTC data channels

**What.** Peer-to-peer reliable + unreliable channels.

**Support.** Universal.

**What it enables here.** Small-group multiplayer without a server,
via signaling-only architecture. The cost story is on NAT traversal
+ STUN/TURN; non-trivial.

**Priority.** PARKED.

### 9.3 BroadcastChannel

**What.** Same-origin cross-tab + cross-worker messaging.

**Support.** Universal.

**What it enables here.**
- **Spectator-mode companion tab.** Open the game in one tab + a
  spectator HUD in another; sync via BroadcastChannel.
- **Dev-companion debug window.** Live tuning panel in a side tab.

**Priority.** PARKED.

---

## 10. Cross-cutting prerequisites

A handful of items unlock multiple primitives at once. Worth naming
explicitly.

### 10.1 Cross-origin isolation (already shipping)

Already enabled via `public/_headers:7-8` (COOP=same-origin +
COEP=credentialless). Unlocks **SharedArrayBuffer, WASM threads,
`performance.measureUserAgentSpecificMemory()`, high-precision
timers**.

**Action item:** verify the R2 asset bucket sets
`Cross-Origin-Resource-Policy: cross-origin` on every fetchable asset.
The `credentialless` COEP mode is permissive — it does not require
explicit CORP headers on cross-origin resources fetched without
credentials — so today's R2 assets work. Switching to `require-corp`
would break the R2 fetch path; document this in
`cloudflare-stabilization-followups` so it doesn't get accidentally
flipped.

### 10.2 Vite plugin coverage

Adding a WASM module (`@dimforge/rapier3d-compat`, or a project-built
Rust crate from §3) needs a Vite plugin. Likely `vite-plugin-wasm`
plus `vite-plugin-top-level-await` (Rapier exports use top-level await
in its loader). One-time setup; document in `docs/dev/` when the
first WASM module is added.

### 10.3 Worker module URL pattern

The existing two workers use `new Worker(new URL('../../workers/foo.worker.ts', import.meta.url), { type: 'module' })`.
This is Vite's supported module-worker pattern; new workers should
follow it. Don't drift to inline-blob workers or to non-module workers.

---

## 11. Leverage-ranked recommendation table

| # | Primitive | Subsystem it lands in | Effort | Win | Priority |
|---|---|---|---|---|---|
| 1 | WebGPU compute (spatial grid) | DEFEKT-3 cover search / KONVEYER-11 | High | High | NOW (KONVEYER) |
| 2 | WebGPU compute (influence map) | `InfluenceMapSystem` | High | Medium | NOW (KONVEYER) |
| 3 | WebGPU indirect draw + GPU culling | Combatant + vegetation render | High | High | NOW (KONVEYER) |
| 4 | WebGPU storage textures (deformation) | Tank track marks (VEKHIKL-4) | Medium | Medium | NOW (KONVEYER) |
| 5 | AudioWorklet (engine RPM synthesis) | VEKHIKL-1 jeep + VEKHIKL-4 tank engine + existing helicopter rotor | Medium | High | **NEXT** |
| 6 | OPFS (prebake + worldbuilder cache) | `WorldBuilderConsole`, terrain-param-sandbox, future replay storage | Low | Medium | **NEXT** |
| 7 | Rust→WASM pilot (ballistic solver) | VEKHIKL-4 tank cannon shells + existing arc weapons | Medium | Medium | **NEXT** |
| 8 | SharedArrayBuffer + worker snapshot | Combat AI utility-scoring worker, paired with DEFEKT-3 cover-search worker | Medium | Medium-High | **NEXT** |
| 9 | `performance.measureUserAgentSpecificMemory()` | `PerformanceTelemetry` (replaces `performance.memory.usedJSHeapSize`) | Low | Low-Medium | **NEXT** (paired with #8) |
| 10 | WASM SIMD (folds into #7) | Same as #7 | — | Multiplier on #7 | **NEXT** (folds in) |
| 11 | WASM threads + Rapier | Multi-vehicle / ragdoll / watercraft / articulated trucks gate | High | High at the gate | DEFERRED (per `GROUND_VEHICLE_PHYSICS_2026-05-13.md`) |
| 12 | OffscreenCanvas (renderer move) | `GameRenderer` → worker | Very High | Medium | DEFERRED (post-KONVEYER landing) |
| 13 | OffscreenCanvas (Pixel Forge atlas regen) | Pixel Forge close-model pipeline | Medium | Medium | DEFERRED |
| 14 | ImageBitmap loader | `AssetLoader` texture decode | Low | Low (verify first) | DEFERRED (audit first) |
| 15 | HDR canvas + Display-P3 | `GameRenderer.outputColorSpace`, post-process | Medium | Low (look-target dependent) | DEFERRED |
| 16 | Fixed-point Rust math library | Future cross-machine determinism | Medium | High at the gate | DEFERRED (gated on determinism scope expanding) |
| 17 | Compression Streams (replay archive) | `ReplayRecorder` → OPFS | Low | Low-Medium | PARKED (gated on replay-feature scope) |
| 18 | Streams API (CDLOD tile stream) | CDLOD terrain tile loader | Low | Low | PARKED |
| 19 | WebCodecs (in-game video) | Briefing screens / TV meshes / FLIR mode | Medium | Low (no content) | SPECULATIVE |
| 20 | WebTransport / WebRTC | VODA-1 multiplayer | High | High at the gate | PARKED (gated on multiplayer) |
| 21 | BroadcastChannel | Spectator-tab + dev debug window | Low | Low | PARKED |
| 22 | WebHID | HOTAS support for flight sim fans | Medium | Low (niche) | PARKED |
| 23 | WebXR | VR mode | Very High | Very High (different game) | SPECULATIVE |
| 24 | View Transitions API | HUD/menu polish | Low | Cosmetic | PARKED |
| 25 | `image-rendering: pixelated` | HUD icon CSS audit | Trivial | Aesthetic guard | NOW (verify) |

**Reading the table.** The four NOW items are all WebGPU and already
under the KONVEYER campaign; nothing new there. The four NEXT items
(rows 5-9, with #10 folding into #7) are the actionable surface this
memo opens up: AudioWorklet for engine sim, OPFS for cache, a pilot
Rust→WASM crate, SharedArrayBuffer for the combat-AI worker, plus the
free upgrade of `performance.measureUserAgentSpecificMemory()` to
catch the new heap surface in telemetry. None of those four are
campaign-blocking; each is a small, isolated, reversible addition.

Everything DEFERRED has a named gate. Everything PARKED has a named
"if-this-then-revisit" trigger.

---

## 12. Open questions

- **R2 CORP header verification.** Does the R2 bucket
  (`pub-d965f26ac79947f091f25cf31ac4b48d.r2.dev`, per the CSP at
  `public/_headers:9`) set `Cross-Origin-Resource-Policy: cross-origin`
  on every fetched asset? COEP=credentialless makes this non-blocking
  today, but the answer matters if the project ever tightens to
  COEP=require-corp.
- **`crates/` placement.** Where in the repo do Rust source crates
  live? Recommended `crates/<name>/` at repo root; needs a one-line
  decision before the §3.5 pilot lands. Confirm with the owner.
- **AudioWorklet Safari latency.** Per §6.1, Safari has noticeably
  higher AudioWorklet output latency than Chrome. Does the audience
  include Safari-on-macOS or Safari-on-iPad users in numbers that
  matter? If yes, validate the engine-sim worklet on Safari before
  shipping. If no, ignore.
- **iOS / mobile Safari scope.** WebCodecs `ImageDecoder` is unstable
  on iOS Safari until 17.x; the WebGPU strict-mode work on this
  branch may have already excluded iOS targets entirely. Confirm
  iOS scope before promoting any §4.5 or §5.1 work.
- **`vite-plugin-wasm` adoption.** If the §3.5 pilot proceeds, which
  Vite WASM plugin? `vite-plugin-wasm` is the well-known one; the
  `@recast-navigation/*` packages already work without it (they ship
  pre-loaded WASM blobs). The pilot's choice sets a precedent for
  future WASM modules.
- **AssetLoader `ImageBitmapLoader` usage.** Audit the loading-spike
  frames once — is texture decode actually on the main-thread
  critical path? If yes, row 14 is a NEXT, not a DEFERRED.
- **HDR look target.** Does the retro-pixelated aesthetic per
  [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  §2.5 want HDR at all? Probably no, but worth a one-paragraph
  decision before row 15 sits in DEFERRED indefinitely.

---

## 13. References

Repo files cited (paths relative to repo root):

- `package.json` — dep list, scripts.
- `public/_headers` — Cloudflare edge headers (COOP/COEP/CSP).
- `src/core/GameRenderer.ts` — WebGL renderer instantiation, color space.
- `src/core/SeededRandom.ts` + `src/core/ReplayRecorder.ts` +
  `src/core/ReplayPlayer.ts` — determinism primitives.
- `src/systems/audio/AudioManager.ts` + `src/systems/audio/AudioPoolManager.ts`
  + `src/systems/audio/FootstepSynthesis.ts` — Web Audio surface.
- `src/systems/navigation/NavmeshSystem.ts` + `src/workers/navmesh.worker.ts`
  + `src/systems/navigation/NavmeshCache.ts` — Recast WASM + worker
  pattern + `crypto.subtle` usage.
- `src/systems/terrain/streaming/TerrainStreamingScheduler.ts` +
  `src/systems/terrain/TerrainWorkerPool.ts` +
  `src/workers/terrain.worker.ts` — terrain worker pattern.
- `src/systems/combat/ai/AIStateEngage.ts` +
  `src/systems/combat/ai/CoverSearchBudget.ts` — DEFEKT-3 hot path
  named in §2.1 and §2.4.
- `src/systems/combat/InfluenceMapSystem.ts` — influence-map blur
  named in §2.3 and §2.4.
- `src/ui/controls/GamepadManager.ts` — Gamepad API wrapper.
- `src/config/SettingsManager.ts` +
  `src/systems/strategy/PersistenceSystem.ts` — current `localStorage`
  usage.
- `src/dev/worldBuilder/WorldBuilderConsole.ts` — worldbuilder
  `localStorage` use that OPFS would replace.

Rearch memos cited:

- [KONVEYER_AUTONOMOUS_RUN_2026-05-10.md](KONVEYER_AUTONOMOUS_RUN_2026-05-10.md)
- [ENGINE_TRAJECTORY_2026-04-23.md](ENGINE_TRAJECTORY_2026-04-23.md)
  (including the 2026-05-13 addendum on ground vehicles)
- [GROUND_VEHICLE_PHYSICS_2026-05-13.md](GROUND_VEHICLE_PHYSICS_2026-05-13.md)
  (four-gate Rapier clause)
- [E1-ecs-evaluation.md](E1-ecs-evaluation.md) (V8 closes the OOP-vs-SoA
  gap inside JS; bitECS spike result)
- [C2-determinism-open-sources.md](C2-determinism-open-sources.md)
  (remaining `Math.random` / `Date.now` / `performance.now` LOGIC
  sites; `SimClock` seam recommendation)

External specs (refresh before use; specs evolve):

- MDN: SharedArrayBuffer, Atomics, OPFS (File System Access API),
  AudioWorklet, OffscreenCanvas, WebCodecs, Streams API,
  Compression Streams, WebTransport, WebHID, WebXR Device API,
  `performance.measureUserAgentSpecificMemory()`.
- W3C / WHATWG editor's drafts for the same.
- Three.js docs for `WebGPURenderer`, `ImageBitmapLoader`,
  `DisplayP3ColorSpace`, `xr` namespace.
- Rust + `wasm-bindgen` book, `wasm-pack` docs, `vite-plugin-wasm`.

---

## 14. Summary — top three recommendations for the PR body

1. **Cross-origin isolation is already on.** SAB + WASM threads + the
   better memory telemetry are unblocked from the deploy side today.
   Verify the R2 bucket's CORP header so a future flip to
   COEP=require-corp wouldn't break asset loading; that's a one-time
   audit, not engineering work.
2. **Three NEXT primitives, ordered by leverage:** AudioWorklet for
   engine-RPM synthesis (lands cleanly with VEKHIKL-1 / VEKHIKL-4
   vehicle cycles), one pilot Rust→WASM crate (ballistic trajectory
   solver — small, isolated, reversible, validates the toolchain),
   and OPFS for the worldbuilder / prebake cache. Pair the
   SharedArrayBuffer-based combat-AI worker with the DEFEKT-3
   cover-search follow-up so the new heap surface shows up in
   telemetry from day one.
3. **Don't pre-empt KONVEYER or VEKHIKL.** Every NOW item in §11 is
   already under the KONVEYER campaign; every DEFERRED item has a
   named gate; every PARKED item has a named trigger. The four NEXT
   items are small enough to ship without disturbing either campaign.
   Bringing Rapier in (row 11) or moving the renderer to a worker (row
   12) is a campaign-sized decision and the gates per
   `GROUND_VEHICLE_PHYSICS_2026-05-13.md` and KONVEYER respectively
   apply.
