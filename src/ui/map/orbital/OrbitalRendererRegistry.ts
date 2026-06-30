// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Module-level registry for the shared game renderer the orbital topo map
 * renders through (render-on-demand, no second WebGPU device).
 *
 * Bootstrap sets this once after `engine.initialize()`; the three map mounts
 * (deploy / pause / hold-M) read it through the host so their call-sites stay
 * thin and do not have to thread the renderer down through every UI layer. It
 * is a plain non-fenced facade over the concrete THREE renderer — NOT the
 * fenced `IGameRenderer`.
 */

import type { SharedRenderer } from './OrbitalTopoRenderer';
import type { TopoTerrainSource } from './OrbitalTopoMapHost';

let sharedRenderer: SharedRenderer | null = null;
let liveTerrain: TopoTerrainSource | null = null;

/** Register the live renderer (called once from bootstrap). */
export function setOrbitalSharedRenderer(renderer: SharedRenderer | null): void {
  sharedRenderer = renderer;
}

/** Get the registered renderer, or null before bootstrap wires it. */
export function getOrbitalSharedRenderer(): SharedRenderer | null {
  return sharedRenderer;
}

/**
 * Register the live terrain source (concrete TerrainSystem) for the hold-M
 * orbital map. Set per-mode where the terrain runtime becomes live; the
 * `getBakedHeightmap` facade is non-fenced, so this avoids an ITerrainRuntime
 * change while still giving the orbital map the live 1024² grid (read-only).
 */
export function setOrbitalLiveTerrain(terrain: TopoTerrainSource | null): void {
  liveTerrain = terrain;
}

/** Get the registered live terrain source, or null. */
export function getOrbitalLiveTerrain(): TopoTerrainSource | null {
  return liveTerrain;
}
