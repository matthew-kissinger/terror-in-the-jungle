// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Image is not available in non-jsdom test environments; stub before module import
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class MockImage {
    src = '';
    complete = false;
    naturalWidth = 0;
  } as unknown as typeof Image;
}

import { renderMinimap, VehicleMarker } from './MinimapRenderer';
import { Faction } from '../../systems/combat/types';

function createMockCtx() {
  const calls = {
    arc: 0
  };
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  let fillStyleValue = '';
  let strokeStyleValue = '';
  const ctx = {
    get fillStyle() { return fillStyleValue; },
    set fillStyle(v: string) { fillStyleValue = v; fillStyles.push(v); },
    get strokeStyle() { return strokeStyleValue; },
    set strokeStyle(v: string) { strokeStyleValue = v; strokeStyles.push(v); },
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    font: '',
    textAlign: 'center',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: () => { calls.arc++; },
    fillText: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn()
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, fillStyles, strokeStyles };
}

function createMockCamera(): THREE.Camera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -1);
  return camera;
}

describe('MinimapRenderer tactical range filtering', () => {
  it('filters distant combatants on large worlds by default', () => {
    const { ctx, calls } = createMockCtx();
    const camera = createMockCamera();
    const playerPosition = new THREE.Vector3(0, 2, 0);

    const combatantSystem = {
      getAllCombatants: () => [
        { state: 'patrolling', position: new THREE.Vector3(100, 0, 0), faction: 'OPFOR', squadId: 's1' },
        { state: 'patrolling', position: new THREE.Vector3(1500, 0, 0), faction: 'OPFOR', squadId: 's2' }
      ]
    } as any;

    renderMinimap({
      ctx,
      size: 200,
      worldSize: 21136,
      playerPosition,
      playerRotation: 0,
      camera,
      combatantSystem
    });

    // 1 player dot + 1 in-range combatant dot
    expect(calls.arc).toBe(2);
  });

  it('allows explicit override range for diagnostics tuning', () => {
    const { ctx, calls } = createMockCtx();
    const camera = createMockCamera();
    const playerPosition = new THREE.Vector3(0, 2, 0);
    const combatantSystem = {
      getAllCombatants: () => [
        { state: 'patrolling', position: new THREE.Vector3(100, 0, 0), faction: 'OPFOR', squadId: 's1' },
        { state: 'patrolling', position: new THREE.Vector3(1500, 0, 0), faction: 'OPFOR', squadId: 's2' }
      ]
    } as any;

    renderMinimap({
      ctx,
      size: 200,
      worldSize: 21136,
      playerPosition,
      playerRotation: 0,
      camera,
      combatantSystem,
      mapIntelPolicy: {
        tacticalRangeOverride: 3000,
        showStrategicAgentsOnMinimap: false,
        showStrategicAgentsOnFullMap: false,
        strategicLayer: 'none',
      }
    });

    // 1 player dot + 2 combatant dots (override permits both)
    expect(calls.arc).toBe(3);
  });

  it('draws a guidance line when a command point is present', () => {
    const { ctx } = createMockCtx();
    const camera = createMockCamera();
    const playerPosition = new THREE.Vector3(0, 2, 0);

    renderMinimap({
      ctx,
      size: 200,
      worldSize: 400,
      playerPosition,
      playerRotation: 0,
      camera,
      commandPosition: new THREE.Vector3(40, 2, -20)
    });

    expect((ctx.moveTo as any).mock.calls.length).toBeGreaterThan(0);
    expect((ctx.lineTo as any).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('MinimapRenderer vehicle markers', () => {
  function baseState(vehicleMarkers: VehicleMarker[]) {
    const camera = createMockCamera();
    return {
      size: 200,
      worldSize: 400,
      playerPosition: new THREE.Vector3(0, 2, 0),
      playerRotation: 0,
      camera,
      vehicleMarkers,
    };
  }

  it('draws a glyph for a friendly ground vehicle inside the minimap window', () => {
    const { ctx, fillStyles } = createMockCtx();

    const markers: VehicleMarker[] = [
      {
        worldPos: new THREE.Vector3(40, 0, -20),
        category: 'ground',
        faction: Faction.US,
        vehicleType: 'm151_alpha',
      },
    ];

    renderMinimap({ ctx, ...baseState(markers) });

    // Stroke + fill calls grew, and the friendly blue fill landed in
    // the style history (matches the combatant friendly palette).
    expect((ctx.fill as any).mock.calls.length).toBeGreaterThan(0);
    expect(fillStyles.some(s => s.includes('79, 107, 58'))).toBe(true);
  });

  it('colors an enemy ground vehicle with the OPFOR palette', () => {
    const { ctx, fillStyles } = createMockCtx();

    const markers: VehicleMarker[] = [
      {
        worldPos: new THREE.Vector3(-30, 0, 10),
        category: 'ground',
        faction: Faction.NVA,
        vehicleType: 't54_alpha',
      },
    ];

    renderMinimap({ ctx, ...baseState(markers) });

    expect(fillStyles.some(s => s.includes('158, 59, 46'))).toBe(true);
    expect(fillStyles.some(s => s.includes('79, 107, 58'))).toBe(false);
  });

  it('skips vehicles outside the minimap window', () => {
    const { ctx } = createMockCtx();

    // worldSize=400 means the minimap window covers roughly +/-200 m
    // around the player. A vehicle 9 km away has no business being on
    // the minimap.
    const farMarkers: VehicleMarker[] = [
      {
        worldPos: new THREE.Vector3(9000, 0, 9000),
        category: 'ground',
        faction: Faction.US,
        vehicleType: 'm151_far',
      },
    ];

    const fillCallsBefore = (ctx.fill as any).mock.calls.length;
    renderMinimap({ ctx, ...baseState(farMarkers) });
    const fillCallsAfter = (ctx.fill as any).mock.calls.length;

    // Only the player marker can fill (it's a circle with arc+fill),
    // not the off-map vehicle. So the delta is small / zero for our
    // vehicle layer.
    expect(fillCallsAfter - fillCallsBefore).toBeLessThan(3);
  });

  it('draws different glyph primitives for emplacement vs ground category', () => {
    const groundMarkers: VehicleMarker[] = [
      { worldPos: new THREE.Vector3(20, 0, 20), category: 'ground', faction: Faction.US, vehicleType: 'm48_a' },
    ];
    const empMarkers: VehicleMarker[] = [
      { worldPos: new THREE.Vector3(20, 0, 20), category: 'emplacement', faction: Faction.US, vehicleType: 'm2hb_a' },
    ];

    const g = createMockCtx();
    renderMinimap({ ctx: g.ctx, ...baseState(groundMarkers) });
    const groundFills = (g.ctx.fill as any).mock.calls.length;

    const e = createMockCtx();
    renderMinimap({ ctx: e.ctx, ...baseState(empMarkers) });
    const empFills = (e.ctx.fill as any).mock.calls.length;

    // Ground glyph is a closed shape with fill+stroke; emplacement
    // glyph is an X (stroke-only), so the ground variant produces
    // strictly more fill calls.
    expect(groundFills).toBeGreaterThan(empFills);
  });

  it('renders nothing extra when vehicleMarkers is empty', () => {
    const { ctx: baseline } = createMockCtx();
    renderMinimap({
      ctx: baseline,
      size: 200,
      worldSize: 400,
      playerPosition: new THREE.Vector3(0, 2, 0),
      playerRotation: 0,
      camera: createMockCamera(),
    });
    const baselineFills = (baseline.fill as any).mock.calls.length;

    const { ctx: withEmpty } = createMockCtx();
    renderMinimap({ ctx: withEmpty, ...baseState([]) });
    const emptyFills = (withEmpty.fill as any).mock.calls.length;

    expect(emptyFills).toBe(baselineFills);
  });
});
