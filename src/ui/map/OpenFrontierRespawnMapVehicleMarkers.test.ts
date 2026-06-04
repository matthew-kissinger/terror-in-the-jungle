// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behaviour tests for crewable-vehicle markers on the deploy/respawn map.
 *
 * Caller-visible behaviour we care about:
 *  - A ground vehicle (tank) draws a "TANK" tag so the player can see
 *    where the tank is before deploying.
 *  - Watercraft and emplacements get their own tags.
 *  - Friendly and enemy markers render in visibly different colors.
 *  - No markers means nothing extra is drawn (the map is unchanged).
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { OpenFrontierRespawnMapRenderer } from './OpenFrontierRespawnMapRenderer';
import type { VehicleMarker } from '../minimap/MinimapRenderer';
import { Faction } from '../../systems/combat/types';

function createMockCtx() {
  const texts: string[] = [];
  const fillStyles: string[] = [];
  let fillStyleValue = '';
  const ctx = {
    get fillStyle() { return fillStyleValue; },
    set fillStyle(v: string) { fillStyleValue = v; fillStyles.push(v); },
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    rect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    measureText: () => ({ width: 24 }),
    fillText: (text: string) => { texts.push(text); },
    setLineDash: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texts, fillStyles };
}

function marker(overrides: Partial<VehicleMarker> = {}): VehicleMarker {
  return {
    worldPos: new THREE.Vector3(0, 0, 0),
    category: 'ground',
    faction: Faction.US,
    vehicleType: 'm48_patton',
    ...overrides,
  };
}

const baseState = { zoomLevel: 1, panOffset: { x: 0, y: 0 } };

describe('OpenFrontierRespawnMapRenderer vehicle markers', () => {
  it('tags a ground vehicle as TANK', () => {
    const { ctx, texts } = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(ctx, baseState, undefined, [], [marker({ category: 'ground' })]);
    expect(texts).toContain('TANK');
  });

  it('tags watercraft and emplacements distinctly', () => {
    const boat = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(boat.ctx, baseState, undefined, [], [marker({ category: 'watercraft' })]);
    expect(boat.texts).toContain('BOAT');

    const gun = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(gun.ctx, baseState, undefined, [], [marker({ category: 'emplacement' })]);
    expect(gun.texts).toContain('GUN');
  });

  it('colors friendly and enemy markers differently', () => {
    const friendly = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(friendly.ctx, baseState, undefined, [], [marker({ faction: Faction.US })]);

    const enemy = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(enemy.ctx, baseState, undefined, [], [marker({ faction: Faction.NVA })]);

    // The two factions should not share a fill palette.
    const friendlyFills = new Set(friendly.fillStyles);
    const enemyFills = new Set(enemy.fillStyles);
    expect([...enemyFills].some(c => !friendlyFills.has(c))).toBe(true);
  });

  it('draws no vehicle tags when there are no markers', () => {
    const { ctx, texts } = createMockCtx();
    OpenFrontierRespawnMapRenderer.render(ctx, baseState, undefined, [], []);
    expect(texts).not.toContain('TANK');
    expect(texts).not.toContain('BOAT');
    expect(texts).not.toContain('GUN');
  });
});
