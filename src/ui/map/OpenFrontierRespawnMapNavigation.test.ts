/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behaviour tests for deploy/respawn map navigation (deploy-map-navigation).
 *
 * From the caller's perspective the deploy map must be navigable on a large
 * canvas: dragging can't fling the map off into empty space, the zoom controls
 * move the view in/out, and stepping through spawns advances the selection and
 * re-frames the chosen spawn. We assert those observable outcomes via the view
 * state the map hands to its renderer — NOT private fields or tuning constants.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { OpenFrontierRespawnMap } from './OpenFrontierRespawnMap';
import { OpenFrontierRespawnMapRenderer } from './OpenFrontierRespawnMapRenderer';
import { MAP_SIZE, maxPanOffset, setMapWorldSize } from './OpenFrontierRespawnMapUtils';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';

function spawn(id: string, x: number, z: number): RespawnSpawnPoint {
  return {
    id,
    name: id.toUpperCase(),
    position: new THREE.Vector3(x, 0, z),
    safe: true,
    kind: 'zone',
    selectionClass: 'default',
  };
}

/** The view state the map last handed to its renderer (zoom + pan). */
type ViewState = { zoomLevel: number; panOffset: { x: number; y: number } };

function lastViewState(renderSpy: ReturnType<typeof vi.spyOn>): ViewState {
  const calls = renderSpy.mock.calls;
  const state = calls[calls.length - 1][1] as ViewState;
  // Clone so later renders don't mutate a captured reference.
  return { zoomLevel: state.zoomLevel, panOffset: { ...state.panOffset } };
}

function dispatchDrag(canvas: HTMLCanvasElement, fromPx: number, toPx: number): void {
  // Drag along the diagonal so both axes move. Coordinates are CSS px on the
  // mocked 800px rect, which the map maps 1:1 into map-units.
  canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: fromPx, clientY: fromPx }));
  canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: toPx, clientY: toPx }));
  canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: toPx, clientY: toPx }));
}

describe('OpenFrontierRespawnMap navigation (deploy-map-navigation)', () => {
  let renderSpy: ReturnType<typeof vi.spyOn>;
  let map: OpenFrontierRespawnMap;

  beforeEach(() => {
    setMapWorldSize(21000); // A Shau-scale 21km canvas
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: MAP_SIZE, height: MAP_SIZE, right: MAP_SIZE, bottom: MAP_SIZE,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    // Render is a canvas-draw concern; stub it and read the state it receives.
    renderSpy = vi.spyOn(OpenFrontierRespawnMapRenderer, 'render').mockImplementation(() => {});
    map = new OpenFrontierRespawnMap();
  });

  afterEach(() => {
    map.dispose();
    vi.restoreAllMocks();
  });

  it('clamps a drag to the map bounds instead of flinging it into empty space', () => {
    // Zoom in so there is overhang to pan within, then drag far past the edge.
    map.zoomBy(3);
    const bound = maxPanOffset(lastViewState(renderSpy).zoomLevel);
    expect(bound).toBeGreaterThan(0);

    const canvas = map.getCanvas();
    dispatchDrag(canvas, 700, 100); // a large -600px drag on both axes

    const { panOffset } = lastViewState(renderSpy);
    // The pan never exceeds the bound on either axis — the map stays on-screen.
    expect(Math.abs(panOffset.x)).toBeLessThanOrEqual(bound + 1e-6);
    expect(Math.abs(panOffset.y)).toBeLessThanOrEqual(bound + 1e-6);
  });

  it('keeps the map centred (no pan) when zoomed all the way out', () => {
    map.resetView(); // default zoom — no overhang
    const canvas = map.getCanvas();
    dispatchDrag(canvas, 700, 100);

    const { panOffset } = lastViewState(renderSpy);
    expect(panOffset).toEqual({ x: 0, y: 0 });
  });

  it('zoom in / zoom out move the view in and back out within the ceiling', () => {
    map.resetView();
    const start = lastViewState(renderSpy).zoomLevel;

    map.zoomBy(1.4);
    const zoomedIn = lastViewState(renderSpy).zoomLevel;
    expect(zoomedIn).toBeGreaterThan(start);

    map.zoomBy(1 / 1.4);
    const zoomedBack = lastViewState(renderSpy).zoomLevel;
    expect(zoomedBack).toBeLessThan(zoomedIn);
  });

  it('cycling spawns advances the selection, wraps, and frames each spawn', () => {
    const spawns = [
      spawn('alpha', 9000, 9000),    // far NW corner of the 21km map
      spawn('bravo', -9000, -9000),  // far SE corner
      spawn('charlie', 0, 0),        // centre
    ];
    map.setSpawnPoints(spawns);

    const selected: string[] = [];
    map.setZoneSelectedCallback((id) => selected.push(id));

    // First forward step lands on the first spawn.
    expect(map.cycleSpawn(1)?.id).toBe('alpha');
    expect(map.getSelectedZoneId()).toBe('alpha');
    const framedAlpha = lastViewState(renderSpy);

    // Next forward step advances to the second spawn and re-frames the view.
    expect(map.cycleSpawn(1)?.id).toBe('bravo');
    const framedBravo = lastViewState(renderSpy);

    // Different spawns get a different framing (the view actually moved).
    expect(framedBravo.panOffset).not.toEqual(framedAlpha.panOffset);

    // Forward from the last wraps to the first.
    map.cycleSpawn(1); // charlie
    expect(map.cycleSpawn(1)?.id).toBe('alpha');

    // Stepping back from the first wraps to the last.
    expect(map.cycleSpawn(-1)?.id).toBe('charlie');

    // Every step fired the selection callback in order.
    expect(selected).toEqual(['alpha', 'bravo', 'charlie', 'alpha', 'charlie']);
  });

  it('does nothing when there are no spawns to cycle', () => {
    map.setSpawnPoints([]);
    expect(map.cycleSpawn(1)).toBeUndefined();
    expect(map.getSelectedZoneId()).toBeUndefined();
  });
});
