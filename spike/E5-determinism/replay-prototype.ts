/**
 * E5 spike: record-and-replay prototype.
 *
 * This script runs two deliberately simple tick loops to measure how much
 * of the work toward determinism is "just" plumbing versus genuinely
 * structural.
 *
 * RUN 1: build a fake combat tick that uses Math.random + Date.now directly
 *        (matching how most of the real code is wired today). Record an
 *        input log + positions for N ticks.
 *
 * RUN 2: build the same tick but with:
 *        - a seeded PRNG passed through call sites
 *        - deltaTime fixed to 1/60
 *        - timestamps derived from tick index, not Date.now
 *        Replay with the same seed + input log. Compare final state.
 *
 * The point is NOT to port the real game. The point is to quantify how
 * invasive the fix is for an equivalent-complexity slice of logic, so we
 * can size the real investment.
 *
 * Throwaway. Spike branch only. Do not wire into production.
 */
import { createRng, SeededRng } from './seeded-rng';

interface Entity {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  health: number;
  lastHitTickAt: number;
}

interface Input {
  tick: number;
  fire: boolean;
  moveX: number;
  moveZ: number;
}

// -------------------------------------------------------------------------
// Variant A: the "current game" shape. Uses Math.random + Date.now directly.
// -------------------------------------------------------------------------

function tickNondeterministic(ents: Entity[], input: Input, dt: number): void {
  for (const e of ents) {
    // Random wander jitter (like CombatantFactory.ts L55, SquadManager.ts L100)
    const wanderX = (Math.random() - 0.5) * 0.3;
    const wanderZ = (Math.random() - 0.5) * 0.3;

    // Apply input + wander
    e.vx = input.moveX * 5 + wanderX;
    e.vz = input.moveZ * 5 + wanderZ;
    e.x += e.vx * dt;
    e.z += e.vz * dt;

    // Random hit check (like CombatantBallistics.ts L100)
    if (input.fire && Math.random() < 0.2) {
      e.health -= 10 + Math.random() * 5;
      // Date.now-based timestamp (like CombatantDamage.ts L83)
      e.lastHitTickAt = Date.now();
    }
  }
}

// -------------------------------------------------------------------------
// Variant B: the "after determinism pass" shape.
// -------------------------------------------------------------------------

function tickDeterministic(
  ents: Entity[],
  input: Input,
  dt: number,
  rng: SeededRng,
  simTimeMs: number,
): void {
  for (const e of ents) {
    const wanderX = (rng() - 0.5) * 0.3;
    const wanderZ = (rng() - 0.5) * 0.3;

    e.vx = input.moveX * 5 + wanderX;
    e.vz = input.moveZ * 5 + wanderZ;
    e.x += e.vx * dt;
    e.z += e.vz * dt;

    if (input.fire && rng() < 0.2) {
      e.health -= 10 + rng() * 5;
      e.lastHitTickAt = simTimeMs;
    }
  }
}

// -------------------------------------------------------------------------
// Record / replay harness
// -------------------------------------------------------------------------

function makeEntities(n: number): Entity[] {
  // Note: even starting state is "deterministic" here, because we're measuring
  // the sim tick in isolation. In the real game, spawn positions use
  // Math.random too — so fixing only the tick is not enough.
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: i * 10,
    z: 0,
    vx: 0,
    vz: 0,
    health: 100,
    lastHitTickAt: 0,
  }));
}

function makeInputLog(tickCount: number): Input[] {
  // A scripted input sequence. In the real prototype we'd record keyboard
  // state. Here we just script it to stay reproducible across runs.
  const log: Input[] = [];
  for (let t = 0; t < tickCount; t++) {
    log.push({
      tick: t,
      fire: t % 7 === 0,
      moveX: Math.sin(t * 0.01),
      moveZ: Math.cos(t * 0.01),
    });
  }
  return log;
}

function checksum(ents: Entity[]): string {
  // Quantize to 4 decimal places so tiny float noise doesn't dominate the
  // string compare. Real determinism work needs to decide a tolerance
  // policy explicitly; here we just want a visible signal.
  let s = '';
  for (const e of ents) {
    s += `${e.id}:${e.x.toFixed(4)},${e.z.toFixed(4)},${e.health.toFixed(2)}|`;
  }
  return s;
}

function runVariantA(ticks: number): string {
  const ents = makeEntities(16);
  const input = makeInputLog(ticks);
  for (let t = 0; t < ticks; t++) {
    tickNondeterministic(ents, input[t], 1 / 60);
  }
  return checksum(ents);
}

function runVariantB(ticks: number, seed: number): string {
  const ents = makeEntities(16);
  const input = makeInputLog(ticks);
  const rng = createRng(seed);
  for (let t = 0; t < ticks; t++) {
    const simTimeMs = t * (1000 / 60);
    tickDeterministic(ents, input[t], 1 / 60, rng, simTimeMs);
  }
  return checksum(ents);
}

// -------------------------------------------------------------------------
// Main: show divergence under variant A, convergence under variant B
// -------------------------------------------------------------------------

const TICKS = 30 * 60; // 30 seconds at 60 Hz

console.log('E5 determinism spike — record/replay prototype\n');

console.log('Variant A (Math.random + Date.now, matches real game):');
const a1 = runVariantA(TICKS);
const a2 = runVariantA(TICKS);
console.log(`  run 1 checksum len: ${a1.length}`);
console.log(`  run 2 checksum len: ${a2.length}`);
console.log(`  identical?          ${a1 === a2 ? 'YES' : 'NO'}`);

console.log('\nVariant B (seeded RNG, fixed dt, sim time from tick index):');
const b1 = runVariantB(TICKS, 12345);
const b2 = runVariantB(TICKS, 12345);
const b3 = runVariantB(TICKS, 99999); // different seed should differ
console.log(`  run 1 (seed 12345):     ${b1.slice(0, 80)}...`);
console.log(`  run 2 (seed 12345):     ${b2.slice(0, 80)}...`);
console.log(`  run 3 (seed 99999):     ${b3.slice(0, 80)}...`);
console.log(`  same seed identical?    ${b1 === b2 ? 'YES' : 'NO'}`);
console.log(`  diff seed differs?      ${b1 !== b3 ? 'YES' : 'NO'}`);
