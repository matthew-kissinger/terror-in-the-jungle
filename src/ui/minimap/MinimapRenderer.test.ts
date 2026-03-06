import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { renderMinimap } from './MinimapRenderer';

function createMockCtx() {
  const calls = {
    arc: 0
  };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: () => { calls.arc++; },
    fillText: vi.fn(),
    closePath: vi.fn()
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
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
    const prev = (globalThis as any).__MINIMAP_TACTICAL_RANGE__;
    (globalThis as any).__MINIMAP_TACTICAL_RANGE__ = 3000;
    try {
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

      // 1 player dot + 2 combatant dots (override permits both)
      expect(calls.arc).toBe(3);
    } finally {
      (globalThis as any).__MINIMAP_TACTICAL_RANGE__ = prev;
    }
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
