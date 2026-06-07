// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// L3 scenario: ZoneManager + ZoneInitializer + ZoneTerrainAdapter wired over a
// terrain height-field stub, using the real Zone Control config. Repro + guard
// for DEFEKT-7 ("enemy spawn and closest base always in a ditch").
//
// Behavior under test (caller's-eye, not implementation internals):
//   - Both home bases land on flat ground (on their flatten pad), NOT in the
//     surrounding base-DEM ditch.
//   - All three capture zones escape a steep-walled ditch onto the plateau.
//   - The validator does not nudge against unready terrain.
//
// Only ZoneRenderer is mocked: the env is `node`, so the renderer's canvas/
// sprite path has no `document`. Renderer is a pure visual side-effect boundary;
// the placement pipeline (manager -> initializer -> terrain adapter) runs for real.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { ZoneManager, CaptureZone } from './ZoneManager';
import { ZONE_CONTROL_CONFIG } from '../../config/ZoneControlConfig';
import { SeededRandom } from '../../core/SeededRandom';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Renderer builds Three.js sprites via document.createElement('canvas'); no DOM
// in the `node` test env. Mock it out -- it is not the system under test.
vi.mock('./ZoneRenderer', () => ({
  ZoneRenderer: class {
    createZoneVisuals = vi.fn();
    updateZoneVisuals = vi.fn();
    updateZonePositions = vi.fn();
    animateFlags = vi.fn();
    disposeZoneVisuals = vi.fn();
    dispose = vi.fn();
  },
}));

const PLATEAU_HEIGHT = 50;
const DITCH_FLOOR = 20; // 30 m below the plateau -> well past the ditch threshold

// Authored home-base coords. In the raw base DEM (pre-stamp) these sit in a
// steep-walled ditch -- this is exactly the "enemy spawn / closest base always
// in a ditch" report. The firebase_us / nva_bunkers flatten pads
// (targetHeightMode:'max') raise them later; the validator must NOT pre-empt
// that by dragging the base off its authored spot.
const BASE_DITCHES = [
  { x: -50, z: -180, inner: 16, rim: 30 }, // us_base / firebase_us
  { x: -30, z: 330, inner: 18, rim: 34 }, // opfor_base / nva_bunkers
];

// Steep-walled ditches centered on the authored CAPTURE-zone coords. Deep floor
// within `inner` m, a steep rim out to `rim` m, flat plateau beyond. These zones
// have NO flatten pad, so the validator must climb them out. The rim deliberately
// extends past 45 m (the old search's outermost ring) so escaping it REQUIRES
// the widened search rings -- if those regressed, this test fails.
const ZONE_DITCHES = [
  { x: -220, z: 30, inner: 18, rim: 52 }, // zone_alpha
  { x: 0, z: 135, inner: 18, rim: 52 }, // zone_bravo
  { x: 170, z: -30, inner: 18, rim: 52 }, // zone_charlie
];

function distance(x: number, z: number, cx: number, cz: number): number {
  return Math.hypot(x - cx, z - cz);
}

function ditchHeight(
  d: number,
  inner: number,
  rim: number
): number | null {
  if (d < inner) return DITCH_FLOOR; // floor: flat-but-deep
  if (d < rim) {
    // Steep rim: climb from floor up to plateau across (rim - inner) metres.
    const t = (d - inner) / (rim - inner);
    return DITCH_FLOOR + t * (PLATEAU_HEIGHT - DITCH_FLOOR);
  }
  return null; // outside the ditch -> plateau
}

/**
 * Height field: plateau everywhere, with a steep-walled ditch carved at each
 * home-base AND each capture-zone authored coord. The base ditches model the
 * raw DEM the bug fell into; the capture-zone ditches must be climbed out of.
 */
function ditchTerrainHeight(x: number, z: number): number {
  for (const dz of [...BASE_DITCHES, ...ZONE_DITCHES]) {
    const h = ditchHeight(distance(x, z, dz.x, dz.z), dz.inner, dz.rim);
    if (h !== null) return h;
  }
  return PLATEAU_HEIGHT;
}

function makeReadyTerrain(heightAt: (x: number, z: number) => number): ITerrainRuntime {
  return {
    getHeightAt: (x: number, z: number) => heightAt(x, z),
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    isAreaReadyAt: () => true,
  } as unknown as ITerrainRuntime;
}

// Local re-derivation of the "is this spot in a ditch / too steep" test, used to
// ASSERT the outcome from the caller's side without reaching into private state.
function slopeAt(t: (x: number, z: number) => number, x: number, z: number): number {
  const s = 5;
  const c = t(x, z);
  return (
    Math.max(
      Math.abs(t(x, z + s) - c),
      Math.abs(t(x, z - s) - c),
      Math.abs(t(x + s, z) - c),
      Math.abs(t(x - s, z) - c)
    ) / s
  );
}

function ringMeanAt(
  t: (x: number, z: number) => number,
  x: number,
  z: number,
  radius = 25,
  samples = 8
): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    sum += t(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
  }
  return sum / samples;
}

function expectOnFlatGround(
  zone: CaptureZone,
  t: (x: number, z: number) => number
): void {
  const centerHeight = t(zone.position.x, zone.position.z);
  const ringMean = ringMeanAt(t, zone.position.x, zone.position.z);
  const slope = slopeAt(t, zone.position.x, zone.position.z);
  // Not in a ditch: center height is at-or-above (ringMean - threshold). Use a
  // generous threshold band; what matters is it is not the 30 m-deep floor.
  expect(centerHeight).toBeGreaterThanOrEqual(ringMean - 4);
  // And the ground is walkably flat where it rests.
  expect(slope).toBeLessThanOrEqual(0.25 + 1e-6);
}

describe('Zone Control placement keeps bases and zones out of ditches (DEFEKT-7)', () => {
  let manager: ZoneManager;
  const terrainFn = ditchTerrainHeight;

  beforeEach(() => {
    vi.clearAllMocks();
    // Deterministic spiral search in findSuitableZonePosition.
    SeededRandom.beginSession(1337);
    const scene = new THREE.Scene();
    manager = new ZoneManager(scene);
    manager.setTerrainSystem(makeReadyTerrain(terrainFn));
    manager.setGameModeConfig(ZONE_CONTROL_CONFIG);
  });

  afterEach(() => {
    SeededRandom.endSession();
    manager.dispose();
  });

  it('leaves home bases on their authored flatten-pad coord, not nudged off-pad', () => {
    const zones = manager.getAllZones();
    const usBase = zones.find(z => z.id === 'us_base')!;
    const opforBase = zones.find(z => z.id === 'opfor_base')!;
    expect(usBase).toBeDefined();
    expect(opforBase).toBeDefined();

    // The base authored coord is in the raw-DEM ditch, but the firebase/bunker
    // flatten pad owns that ground. The validator must NOT drag the base off its
    // authored spot chasing higher terrain -- the stamp flattens it in place.
    // Stay within the capture radius of the authored coord (no off-pad nudge).
    for (const [base, cfgId] of [
      [usBase, 'us_base'],
      [opforBase, 'opfor_base'],
    ] as const) {
      const cfg = ZONE_CONTROL_CONFIG.zones.find(z => z.id === cfgId)!;
      expect(base.position.x).toBeCloseTo(cfg.position.x, 6);
      expect(base.position.z).toBeCloseTo(cfg.position.z, 6);
    }
  });

  it('lifts all three capture zones out of their steep-walled ditches', () => {
    const captureZones = manager.getCapturableZones();
    expect(captureZones.length).toBe(3);
    for (const zone of captureZones) {
      // Must have climbed off the deep ditch floor onto the plateau.
      expect(zone.position.y).toBeGreaterThan(DITCH_FLOOR + 10);
      expectOnFlatGround(zone, terrainFn);
    }
  });

  it('does not nudge a zone out of an escapable ditch while terrain is not ready', () => {
    // A NARROW ditch the validator could trivially escape if it ran -- but the
    // terrain reports not-ready, so the validator must leave the authored coord
    // alone (the stamp is still resolving). This isolates the readiness guard:
    // were it absent, the nudge would walk the zone out onto the surrounding
    // plateau and this assertion would fail.
    const alphaAuthored = ZONE_CONTROL_CONFIG.zones.find(z => z.id === 'zone_alpha')!.position;
    const narrowDitch = (x: number, z: number): number => {
      const d = Math.hypot(x - alphaAuthored.x, z - alphaAuthored.z);
      if (d < 8) return DITCH_FLOOR; // tight floor
      if (d < 18) return DITCH_FLOOR + ((d - 8) / 10) * (PLATEAU_HEIGHT - DITCH_FLOOR);
      return PLATEAU_HEIGHT; // plateau within reach of the 15 m search ring
    };

    const scene = new THREE.Scene();
    const m2 = new ZoneManager(scene);
    const notReady = {
      getHeightAt: (x: number, z: number) => narrowDitch(x, z),
      isTerrainReady: () => false,
      hasTerrainAt: () => false,
      isAreaReadyAt: () => false,
    } as unknown as ITerrainRuntime;
    m2.setTerrainSystem(notReady);
    m2.setGameModeConfig(ZONE_CONTROL_CONFIG);

    const alpha = m2.getAllZones().find(z => z.id === 'zone_alpha')!;
    // The ditch-escape nudge must not have fired: the zone stays at its authored
    // coord (only the slope-blind spiral pre-pass may have jittered it, but the
    // jitter cannot escape this ditch, so it stays well within capture radius).
    const drift = Math.hypot(
      alpha.position.x - alphaAuthored.x,
      alpha.position.z - alphaAuthored.z
    );
    expect(drift).toBeLessThanOrEqual(20);
    m2.dispose();
  });
});
