/**
 * E6 spike scenario runner.
 *
 * Headless: runs the unified Airframe sim through three scenarios and prints
 * feel-adjacent metrics + frame time. No Three.js scene, no renderer.
 *
 * Usage:
 *   npx tsx spike/E6-airframe/scenario.ts
 *
 * Scenarios:
 *   1. ARROW-UP AT LOW SPEED — holds elevator stick during low-speed ground
 *      roll. Verifies pitch feedback is visible to the player (the "arrow keys
 *      feel unresponsive" claim).
 *   2. CLIMB INTO RISING TERRAIN — throws aircraft at a ramped ground plane;
 *      verifies swept collision clamps the trajectory instead of passing through.
 *   3. ROLL-AND-RECOVER — full stick roll for 1s, then center; measures time to
 *      wings-level in assist vs raw tiers.
 */

import * as THREE from 'three';
import { Airframe, SKYRAIDER_AIRFRAME, type AirframeIntent, type AirframeTerrainProbe } from './airframe';

// ─────────────────────────────────────────────────────────────────────────────
// Terrain probes
// ─────────────────────────────────────────────────────────────────────────────

function flatTerrain(): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample: () => ({ height: 0, normal }),
    sweep: (from, to) => {
      if (from.y > 0 && to.y > 0) return null;
      if (from.y >= 0 && to.y < 0) {
        const t = from.y / (from.y - to.y);
        return {
          hit: true,
          point: new THREE.Vector3().lerpVectors(from, to, t),
          normal: normal.clone(),
        };
      }
      return null;
    },
  };
}

/** Height = 0 for x < 200, ramps at 60% grade for x >= 200 (steep ridge). */
function rampTerrain(): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  const heightAt = (x: number) => (x < 200 ? 0 : (x - 200) * 0.6);
  return {
    sample: (x) => ({ height: heightAt(x), normal }),
    sweep: (from, to) => {
      // Sample along segment at ~1m resolution.
      const steps = Math.max(1, Math.ceil(from.distanceTo(to)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = from.x + (to.x - from.x) * t;
        const py = from.y + (to.y - from.y) * t;
        const pz = from.z + (to.z - from.z) * t;
        const h = heightAt(px);
        if (py <= h) {
          const hitPoint = new THREE.Vector3(px, h, pz);
          return { hit: true, point: hitPoint, normal };
        }
      }
      return null;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: arrow-up at low speed
// ─────────────────────────────────────────────────────────────────────────────

function scenarioArrowUpLowSpeed(): void {
  console.log('\n── Scenario 1: arrow-up pitch feedback during ground roll ──');
  const af = new Airframe(new THREE.Vector3(0, 0.5, 0), SKYRAIDER_AIRFRAME);
  const terrain = flatTerrain();

  const intent: AirframeIntent = {
    pitch: 1, roll: 0, yaw: 0,
    throttle: 0, brake: 0, tier: 'raw',
  };

  // Frame 0: immediate response.
  af.step(intent, terrain, 1 / 60);
  const immediate = af.getState();
  console.log(`  After 1 frame (v=${immediate.airspeedMs.toFixed(1)} m/s): pitch=${immediate.pitchDeg.toFixed(2)}°`);

  // 0.5s hold.
  for (let i = 0; i < 30; i++) af.step(intent, terrain, 1 / 60);
  const halfSec = af.getState();
  console.log(`  After 0.5s hold (v=${halfSec.airspeedMs.toFixed(1)} m/s): pitch=${halfSec.pitchDeg.toFixed(2)}°`);

  // Now apply throttle, let it accelerate to Vr, keep pitch at 1.0.
  intent.throttle = 1;
  for (let i = 0; i < 60 * 20; i++) af.step(intent, terrain, 1 / 60);
  const rolled = af.getState();
  console.log(`  After 20s throttle+pitch (v=${rolled.airspeedMs.toFixed(1)} m/s): pitch=${rolled.pitchDeg.toFixed(2)}°, phase=${rolled.phase}, WoW=${rolled.weightOnWheels}`);

  // Acceptance: immediate frame produces non-zero pitch (player sees feedback).
  if (Math.abs(immediate.pitchDeg) > 0.5) {
    console.log('  ✓ Immediate pitch response is visible to the pilot.');
  } else {
    console.log(`  ✗ Pitch on frame 1 is ${immediate.pitchDeg.toFixed(2)}° — player cannot see input is working.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: climb into rising terrain (swept collision test)
// ─────────────────────────────────────────────────────────────────────────────

function scenarioSweptCollision(): void {
  console.log('\n── Scenario 2: climb into rising terrain ──');

  // Spawn at x=0, y=25 (25m AGL). Ridge starts at x=200, climbs at 60% grade.
  // Aircraft flies +X at 80 m/s with slight climb (2 m/s). Without swept
  // collision, aircraft would fly *through* ridge at ~t=3s; with swept, it
  // should clamp on the slope.
  const af = new Airframe(new THREE.Vector3(0, 25, 0), SKYRAIDER_AIRFRAME);
  af.resetAirborne(new THREE.Vector3(0, 25, 0), 0, 0);
  af.getState().velocity.set(80, 2, 0);
  af.getState().quaternion.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));

  const terrain = rampTerrain();
  const intent: AirframeIntent = {
    pitch: -0.1, roll: 0, yaw: 0, // slight nose-down to ensure collision
    throttle: 0.3, brake: 0, tier: 'raw',
  };

  let hit = false;
  let lastLog = -1;
  for (let i = 0; i < 60 * 15; i++) {
    af.step(intent, terrain, 1 / 60);
    const s = af.getState();
    if (Math.floor(i / 60) !== lastLog) {
      lastLog = Math.floor(i / 60);
      const terrainHere = s.position.x < 500 ? 0 : (s.position.x - 500) * 0.2;
      console.log(`    t=${lastLog}s  x=${s.position.x.toFixed(0)} y=${s.position.y.toFixed(1)} terrain=${terrainHere.toFixed(1)} vy=${s.verticalSpeedMs.toFixed(1)} phase=${s.phase}`);
    }
    if (s.weightOnWheels && s.position.x > 500) {
      hit = true;
      console.log(`  Clamped at x=${s.position.x.toFixed(1)}, y=${s.position.y.toFixed(1)} after ${(i / 60).toFixed(1)}s. Terrain height there = ${((s.position.x - 500) * 0.2).toFixed(1)}m.`);
      break;
    }
    if (s.position.x > 2000) {
      console.log(`  No clamp; aircraft reached x=${s.position.x.toFixed(1)} at y=${s.position.y.toFixed(1)}.`);
      break;
    }
  }
  if (hit) console.log('  ✓ Swept collision clamped the trajectory.');
  else console.log('  (Scenario ran to completion; note spike terrain uses 1m sweep steps.)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: full roll and recover
// ─────────────────────────────────────────────────────────────────────────────

function scenarioRollAndRecover(): void {
  console.log('\n── Scenario 3: roll pulse and recover ──');

  for (const tier of ['raw', 'assist'] as const) {
    const af = new Airframe(new THREE.Vector3(0, 1200, 0), SKYRAIDER_AIRFRAME);
    af.resetAirborne(new THREE.Vector3(0, 1200, 0), 0, 80);

    const terrain = flatTerrain();
    const intent: AirframeIntent = {
      pitch: 0, roll: 1, yaw: 0,
      throttle: 0.8, brake: 0, tier,
    };

    // 1 second of full right-bank stick
    for (let i = 0; i < 60; i++) af.step(intent, terrain, 1 / 60);
    const peakRoll = af.getState().rollDeg;

    // Release stick
    intent.roll = 0;
    let tLevel = -1;
    for (let i = 0; i < 60 * 10; i++) {
      af.step(intent, terrain, 1 / 60);
      if (Math.abs(af.getState().rollDeg) < 3 && tLevel < 0) {
        tLevel = i / 60;
        break;
      }
    }
    console.log(`  [${tier}] peak rollDeg after 1s stick = ${peakRoll.toFixed(1)}°; time to <3° after release = ${tLevel >= 0 ? tLevel.toFixed(2) + 's' : 'not level in 10s'}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Microbench — frame time over 10 000 ticks of cruise
// ─────────────────────────────────────────────────────────────────────────────

function bench(): void {
  console.log('\n── Microbench: 10 000 fixed ticks ──');
  const af = new Airframe(new THREE.Vector3(0, 1200, 0), SKYRAIDER_AIRFRAME);
  af.resetAirborne(new THREE.Vector3(0, 1200, 0), 0, 80);
  const terrain = flatTerrain();
  const intent: AirframeIntent = { pitch: 0.1, roll: 0.2, yaw: 0, throttle: 0.7, brake: 0, tier: 'assist' };

  const t0 = performance.now();
  for (let i = 0; i < 10_000; i++) af.step(intent, terrain, 1 / 120);
  const t1 = performance.now();
  console.log(`  10 000 ticks: ${(t1 - t0).toFixed(2)} ms total, ${((t1 - t0) * 1000 / 10_000).toFixed(2)} µs/tick`);
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

scenarioArrowUpLowSpeed();
scenarioSweptCollision();
scenarioRollAndRecover();
bench();
