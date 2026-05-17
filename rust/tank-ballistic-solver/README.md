# tank-ballistic-solver

First Rust->WASM pilot crate for Terror in the Jungle. Per
`docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` §3.5, this crate
is small, isolated, and reversible. It exposes a single function
(`solveTrajectory`) that integrates a gravity-only ballistic arc and
returns sampled positions at 1/60 s cadence.

## Surface

```
solveTrajectory(v: f32, angle: f32, targetX: f32, targetY: f32, targetZ: f32, gravity: f32) -> Vec<TrajectorySample>
TrajectorySample { time: f32, x: f32, y: f32, z: f32 }
```

The integrator terminates when the projectile crosses the target's XZ
plane (horizontal travel reaches target horizontal distance) OR after
30 s, whichever fires first.

## Rebuild

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-wasm-ballistic-solver.ps1
```

Or directly:

```
cd rust/tank-ballistic-solver
wasm-pack build --target web --release --out-dir ../../src/systems/combat/projectiles/wasm/tank-ballistic-solver
```

This produces:

- `tank_ballistic_solver_bg.wasm` — compiled binary.
- `tank_ballistic_solver.js` — wasm-bindgen glue.
- `tank_ballistic_solver.d.ts` — TS type declarations.

The TS wrapper at `src/systems/combat/projectiles/TankBallisticSolver.ts`
imports the glue via dynamic `import()`. WASM artifacts are committed to
the repo so CI does not need the Rust toolchain.

## Test

```
cd rust/tank-ballistic-solver
cargo test
```

Pure-numeric unit tests run on the host (x86 / ARM); they do not need a
WASM runtime.

## Success bar (cycle #9 R2)

Per `docs/tasks/cycle-vekhikl-4-tank-turret-and-cannon.md` §"tank-ballistic-solver-wasm-pilot":

- KEEP if WASM is >= 3x faster than the TS reference.
- KEEP-INCONCLUSIVE if WASM is < 3x faster AND WASM gzipped size < 600 KB.
- REVERT if WASM is < 3x faster AND WASM gzipped size >= 600 KB. (Latter
  is a campaign hard-stop — surface to owner before reverting.)

Benchmark output lives at `artifacts/wasm-pilot-2026-05-17/benchmark.json`
+ `.md`. Run it with:

```
npx tsx scripts/benchmark-ballistic-solver.ts
```
