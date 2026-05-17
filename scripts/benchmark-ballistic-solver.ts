/* eslint-disable no-console */
/**
 * Benchmark harness for the Rust->WASM tank ballistic-solver pilot.
 *
 * Runs N trajectory solves comparing the TS reference vs the WASM-backed
 * implementation, records median + p99 ms per call, computes the speedup
 * ratio, and writes both a machine-readable JSON and a human-readable
 * markdown summary to artifacts/wasm-pilot-2026-05-17/.
 *
 * Run with:
 *   npx tsx scripts/benchmark-ballistic-solver.ts
 *
 * Per `docs/tasks/cycle-vekhikl-4-tank-turret-and-cannon.md` §"tank-ballistic-solver-wasm-pilot":
 *   - KEEP if WASM is >= 3x faster than the TS reference.
 *   - KEEP-INCONCLUSIVE if WASM is < 3x faster AND WASM gzipped size < 600 KB.
 *   - REVERT if WASM is < 3x faster AND WASM gzipped size >= 600 KB. (Latter
 *     is a campaign hard-stop — surface to owner before reverting.)
 */

import { performance } from 'node:perf_hooks';
import { promises as fs, statSync, readFileSync } from 'node:fs';
import { gzipSync, constants as zlibConstants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(REPO_ROOT, 'artifacts', 'wasm-pilot-2026-05-17');
const WASM_BINARY = path.join(
  REPO_ROOT,
  'src/systems/combat/projectiles/wasm/tank-ballistic-solver/tank_ballistic_solver_bg.wasm',
);

interface BenchResult {
  iterations: number;
  medianMs: number;
  p99Ms: number;
  meanMs: number;
}

function summarize(samples: number[], iterations: number): BenchResult {
  const sorted = [...samples].sort((a, b) => a - b);
  const midIdx = Math.floor(sorted.length / 2);
  const p99Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    iterations,
    medianMs: sorted[midIdx],
    p99Ms: sorted[p99Idx],
    meanMs: sum / sorted.length,
  };
}

async function loadWasmSolver(): Promise<{
  solve: (v: number, angle: number, tx: number, ty: number, tz: number, g: number) => Float32Array;
} | null> {
  try {
    const modPath = path.join(
      REPO_ROOT,
      'src/systems/combat/projectiles/wasm/tank-ballistic-solver/tank_ballistic_solver.js',
    );
    const mod = await import(`file://${modPath.replace(/\\/g, '/')}`);
    const wasmPath = path.join(
      REPO_ROOT,
      'src/systems/combat/projectiles/wasm/tank-ballistic-solver/tank_ballistic_solver_bg.wasm',
    );
    const bytes = readFileSync(wasmPath);
    await mod.default({ module_or_path: bytes });
    return {
      solve: mod.solveTrajectoryFlat as (
        v: number,
        angle: number,
        tx: number,
        ty: number,
        tz: number,
        g: number,
      ) => Float32Array,
    };
  } catch (err) {
    console.error('Failed to load WASM solver:', err);
    return null;
  }
}

const STEP_SECONDS = 1 / 60;
const MAX_FLIGHT_SECONDS = 30;
const GRAVITY = -9.8;

function solveTS(v: number, angle: number, target: THREE.Vector3): unknown {
  const horizLen = Math.hypot(target.x, target.z);
  let cosAz = 0;
  let sinAz = 1;
  if (horizLen >= 1e-6) {
    cosAz = target.x / horizLen;
    sinAz = target.z / horizLen;
  }
  const cosPitch = Math.cos(angle);
  const sinPitch = Math.sin(angle);
  const vx = v * cosPitch * cosAz;
  let vy = v * sinPitch;
  const vz = v * cosPitch * sinAz;

  let x = 0;
  let y = 0;
  let z = 0;
  let t = 0;
  const samples: { time: number; x: number; y: number; z: number }[] = [];
  samples.push({ time: t, x, y, z });

  const targetHoriz = horizLen;
  while (t < MAX_FLIGHT_SECONDS) {
    vy += GRAVITY * STEP_SECONDS;
    x += vx * STEP_SECONDS;
    y += vy * STEP_SECONDS;
    z += vz * STEP_SECONDS;
    t += STEP_SECONDS;
    samples.push({ time: t, x, y, z });
    const horizNow = Math.hypot(x, z);
    if (horizNow >= targetHoriz) break;
  }
  return samples;
}

interface Workload {
  v: number;
  angle: number;
  target: THREE.Vector3;
}

function buildWorkload(n: number): Workload[] {
  // A spread of muzzle speeds, pitch angles, and target ranges so the
  // benchmark covers short-shot (tens of samples) to lobbed-fire (hundreds
  // of samples). Deterministic.
  const out: Workload[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const speed = 200 + ((i * 31) % 400); // 200..600 m/s
    const pitch = ((i * 7) % 50) / 200; // 0..0.25 rad
    const range = 50 + ((i * 17) % 800); // 50..850 m
    const az = ((i * 13) % 360) * (Math.PI / 180);
    out[i] = {
      v: speed,
      angle: pitch,
      target: new THREE.Vector3(range * Math.cos(az), 0, range * Math.sin(az)),
    };
  }
  return out;
}

function runBench(label: string, workload: Workload[], solve: (w: Workload) => void): BenchResult {
  // Warm-up pass; JIT settles.
  for (let i = 0; i < Math.min(500, workload.length); i++) solve(workload[i]);

  const samples: number[] = new Array(workload.length);
  for (let i = 0; i < workload.length; i++) {
    const w = workload[i];
    const t0 = performance.now();
    solve(w);
    const t1 = performance.now();
    samples[i] = t1 - t0;
  }
  const summary = summarize(samples, workload.length);
  console.log(
    `  ${label.padEnd(8)} median=${summary.medianMs.toFixed(4)} ms  p99=${summary.p99Ms.toFixed(4)} ms  mean=${summary.meanMs.toFixed(4)} ms  iter=${summary.iterations}`,
  );
  return summary;
}

interface BenchOutput {
  ranAt: string;
  iterations: number;
  wasmRawBytes: number;
  wasmGzippedBytes: number;
  ts: BenchResult;
  wasm: BenchResult | null;
  speedup: number | null;
  verdict: 'KEEP' | 'KEEP-INCONCLUSIVE' | 'REVERT' | 'WASM-UNAVAILABLE';
  rationale: string;
  notes: string[];
}

function classify(
  ts: BenchResult,
  wasm: BenchResult | null,
  gzippedBytes: number,
): { verdict: BenchOutput['verdict']; rationale: string; speedup: number | null } {
  if (!wasm) {
    return {
      verdict: 'WASM-UNAVAILABLE',
      rationale: 'WASM module failed to load in the benchmark environment.',
      speedup: null,
    };
  }
  const speedup = ts.medianMs / wasm.medianMs;
  if (speedup >= 3) {
    return {
      verdict: 'KEEP',
      rationale: `WASM is ${speedup.toFixed(2)}x faster than the TS reference; pilot success bar met.`,
      speedup,
    };
  }
  if (gzippedBytes < 600 * 1024) {
    return {
      verdict: 'KEEP-INCONCLUSIVE',
      rationale: `WASM is ${speedup.toFixed(2)}x faster (< 3x bar) but gzipped size ${(gzippedBytes / 1024).toFixed(1)} KB is well under the 600 KB ceiling; keeping the surface for further investigation.`,
      speedup,
    };
  }
  return {
    verdict: 'REVERT',
    rationale: `WASM is ${speedup.toFixed(2)}x faster (< 3x bar) AND gzipped size ${(gzippedBytes / 1024).toFixed(1)} KB is >= 600 KB ceiling. Hard-stop per cycle task.`,
    speedup,
  };
}

async function main(): Promise<void> {
  const iterations = Number(process.env.BENCH_ITERS ?? '10000');
  console.log(`Tank ballistic-solver benchmark — ${iterations} iterations`);

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  // WASM size readings.
  const wasmStat = statSync(WASM_BINARY);
  const wasmBytes = readFileSync(WASM_BINARY);
  const wasmGz = gzipSync(wasmBytes, { level: zlibConstants.Z_BEST_COMPRESSION });
  const rawBytes = wasmStat.size;
  const gzBytes = wasmGz.length;
  console.log(`WASM raw=${(rawBytes / 1024).toFixed(2)} KB  gzip=${(gzBytes / 1024).toFixed(2)} KB`);

  const workload = buildWorkload(iterations);

  // TS path bench.
  console.log('\nTS reference:');
  const ts = runBench('TS', workload, w => solveTS(w.v, w.angle, w.target));

  // WASM path bench.
  console.log('\nWASM:');
  const wasm = await loadWasmSolver();
  let wasmResult: BenchResult | null = null;
  if (wasm) {
    wasmResult = runBench('WASM', workload, w =>
      wasm.solve(w.v, w.angle, w.target.x, w.target.y, w.target.z, GRAVITY),
    );
  } else {
    console.log('  WASM solver unavailable; reporting TS-only.');
  }

  // Verdict.
  const cls = classify(ts, wasmResult, gzBytes);
  console.log(`\nVerdict: ${cls.verdict}`);
  console.log(`  ${cls.rationale}`);
  if (cls.speedup !== null) {
    console.log(`  Speedup (median): ${cls.speedup.toFixed(2)}x`);
  }

  const output: BenchOutput = {
    ranAt: new Date().toISOString(),
    iterations,
    wasmRawBytes: rawBytes,
    wasmGzippedBytes: gzBytes,
    ts,
    wasm: wasmResult,
    speedup: cls.speedup,
    verdict: cls.verdict,
    rationale: cls.rationale,
    notes: [
      'Benchmark runs in Node tsx, not the browser. Browser numbers will',
      'differ (typically WASM speedup is somewhat smaller in V8-on-Chrome',
      'than in Node due to slightly different JIT heuristics on tight float',
      'loops). Treat these as a relative-order indicator, not absolute.',
      'Per `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` §3.2,',
      'tiny-body functions like this one can lose to the JIT once the',
      'WASM↔JS boundary cost is included — the pilot is data, not commitment.',
    ],
  };

  const jsonPath = path.join(ARTIFACT_DIR, 'benchmark.json');
  await fs.writeFile(jsonPath, JSON.stringify(output, null, 2), 'utf8');

  const md = buildMarkdown(output);
  const mdPath = path.join(ARTIFACT_DIR, 'benchmark.md');
  await fs.writeFile(mdPath, md, 'utf8');

  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

function buildMarkdown(o: BenchOutput): string {
  const wasmRow = o.wasm
    ? `| WASM | ${o.wasm.medianMs.toFixed(4)} | ${o.wasm.p99Ms.toFixed(4)} | ${o.wasm.meanMs.toFixed(4)} |`
    : '| WASM | n/a | n/a | n/a |';
  const speedupCell = o.speedup === null ? 'n/a' : `${o.speedup.toFixed(2)}x`;
  return [
    '# Tank Ballistic Solver — Rust->WASM Pilot Benchmark',
    '',
    `Generated: ${o.ranAt}`,
    `Iterations: ${o.iterations}`,
    '',
    '## WASM binary size',
    '',
    `- Raw:    ${(o.wasmRawBytes / 1024).toFixed(2)} KB`,
    `- Gzip:   ${(o.wasmGzippedBytes / 1024).toFixed(2)} KB (hard-stop ceiling: 600 KB)`,
    '',
    '## Per-call latency',
    '',
    '| Backend | median (ms) | p99 (ms) | mean (ms) |',
    '|---------|-------------|----------|-----------|',
    `| TS      | ${o.ts.medianMs.toFixed(4)} | ${o.ts.p99Ms.toFixed(4)} | ${o.ts.meanMs.toFixed(4)} |`,
    wasmRow,
    '',
    `Speedup (TS / WASM, medians): **${speedupCell}**`,
    '',
    '## Verdict',
    '',
    `**${o.verdict}** — ${o.rationale}`,
    '',
    '## Notes',
    '',
    ...o.notes.map(n => `- ${n}`),
    '',
  ].join('\n');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
