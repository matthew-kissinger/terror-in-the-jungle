// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * The reusable 3D orbital topographic map component.
 *
 * Owns a DOM overlay (transparent interaction layer over the shared render
 * canvas) + an `OrbitalTopoRenderer`. Three mounts (deploy / pause / hold-M)
 * use the same component through `OrbitalTopoMapHost`.
 *
 * Render-on-demand: a short RAF pump runs ONLY while the panel is open AND the
 * renderer reports a dirty frame (orbit/zoom/marker change or a periodic live
 * ownership refresh). When idle and shut it schedules nothing, so combat pays
 * zero steady-state cost when the map is closed.
 *
 * Height data is supplied by a `TopoDataSource`:
 *   - the LIVE source reads `TerrainSystem.getBakedHeightmap()` (read-only) for
 *     hold-M during combat,
 *   - the BAKED source fetches a dedicated coarse `*-topo-*.f32` for deploy /
 *     pause where the terrain runtime may not be live.
 */

import * as THREE from 'three';
import type { HeightGrid, HypsometricRamp } from './OrbitalTopoMeshBuilder';
import { OrbitalTopoRenderer, type SharedRenderer } from './OrbitalTopoRenderer';
import type { TopoMarkerInput } from './OrbitalTopoMarkers';

/** Supplies a square height grid + a full-resolution height sampler. */
export interface TopoDataSource {
  loadGrid(): Promise<HeightGrid | null>;
  /** Full-res world height for marker placement (falls back to grid sample). */
  heightAt(worldX: number, worldZ: number): number;
}

/** Pulls the live capture-points + spawns each refresh (recoloured by owner). */
export type MarkerProvider = () => readonly TopoMarkerInput[];

export interface OrbitalTopoMapOptions {
  renderer: SharedRenderer;
  dataSource: TopoDataSource;
  markerProvider?: MarkerProvider;
  ramp?: HypsometricRamp;
  onZoneSelected?: (zoneId: string, zoneName: string) => void;
  /** Live ownership refresh cadence (ms) while open. */
  refreshIntervalMs?: number;
}

export class OrbitalTopoMap {
  readonly container: HTMLDivElement;
  private readonly options: OrbitalTopoMapOptions;
  private topoRenderer: OrbitalTopoRenderer | null = null;
  private open = false;
  private rafId = 0;
  private refreshTimer = 0;
  private loadPromise: Promise<void> | null = null;

  constructor(options: OrbitalTopoMapOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.className = 'orbital-topo-map';
    this.container.style.cssText = [
      'position:absolute',
      'inset:0',
      'touch-action:none',
      'cursor:grab',
    ].join(';');
    this.container.addEventListener('click', this.handleClick);
  }

  /** Mount the interaction overlay into a host element (1-line call-site). */
  mountInto(host: HTMLElement): void {
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.appendChild(this.container);
  }

  /** Open + ensure data is loaded, then start the render-on-demand pump. */
  async open_(): Promise<void> {
    this.open = true;
    this.container.style.display = 'block';
    await this.ensureLoaded();
    this.refreshMarkers();
    this.topoRenderer?.markDirty();
    this.startPump();
    this.startRefresh();
  }

  close(): void {
    this.open = false;
    this.container.style.display = 'none';
    this.stopPump();
    this.stopRefresh();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.topoRenderer) return;
    if (!this.loadPromise) {
      this.loadPromise = this.load();
    }
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    const grid = await this.options.dataSource.loadGrid();
    if (!grid) return;
    this.topoRenderer = new OrbitalTopoRenderer(this.options.renderer, grid, this.options.ramp);
    this.topoRenderer.attachControls(this.container);
  }

  private refreshMarkers(): void {
    if (!this.topoRenderer || !this.options.markerProvider) return;
    const inputs = this.options.markerProvider();
    this.topoRenderer.setMarkers(inputs, (x, z) => this.options.dataSource.heightAt(x, z));
  }

  private startRefresh(): void {
    this.stopRefresh();
    const interval = this.options.refreshIntervalMs ?? 1000;
    this.refreshTimer = window.setInterval(() => this.refreshMarkers(), interval);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = 0;
    }
  }

  private startPump(): void {
    if (this.rafId) return;
    const pump = (): void => {
      if (!this.open) {
        this.rafId = 0;
        return;
      }
      // Force each frame while open: the main render loop repaints the full
      // canvas every frame, so our scissored region must be re-drawn on top.
      // The render-on-demand guarantee (zero cost when closed) holds because
      // the pump only runs while the panel is open.
      this.topoRenderer?.renderTo(this.viewportRect(), true);
      this.rafId = requestAnimationFrame(pump);
    };
    this.rafId = requestAnimationFrame(pump);
  }

  private stopPump(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private viewportRect(): { left: number; top: number; width: number; height: number } {
    const r = this.container.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  private handleClick = (e: MouseEvent): void => {
    if (!this.topoRenderer || !this.options.onZoneSelected) return;
    const hit = this.topoRenderer.pickMarker(e.clientX, e.clientY, this.viewportRect());
    if (hit) this.options.onZoneSelected(hit.id, hit.name);
  };

  resetView(): void {
    this.topoRenderer?.resetView();
  }

  isOpen(): boolean {
    return this.open;
  }

  dispose(): void {
    this.close();
    this.container.removeEventListener('click', this.handleClick);
    this.topoRenderer?.dispose();
    this.topoRenderer = null;
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}

/**
 * Wrap a raw square `Float32Array` height buffer as a `HeightGrid`. The buffer
 * is referenced, not copied — only call this with a buffer you own or one you
 * promise to read-only (e.g. a freshly decoded baked `.f32`).
 */
export function gridFromBuffer(data: Float32Array, worldSize: number): HeightGrid | null {
  const gridSize = Math.round(Math.sqrt(data.length));
  if (gridSize < 2 || gridSize * gridSize !== data.length) return null;
  return { data, gridSize, worldSize };
}

/** Bilinear full-res sampler over a grid (shared by live + baked sources). */
export function makeGridSampler(grid: HeightGrid): (worldX: number, worldZ: number) => number {
  const { data, gridSize, worldSize } = grid;
  return (worldX: number, worldZ: number): number => {
    const u = THREE.MathUtils.clamp(worldX / worldSize + 0.5, 0, 1) * (gridSize - 1);
    const v = THREE.MathUtils.clamp(worldZ / worldSize + 0.5, 0, 1) * (gridSize - 1);
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, gridSize - 1);
    const y1 = Math.min(y0 + 1, gridSize - 1);
    const tx = u - x0;
    const ty = v - y0;
    const h00 = data[y0 * gridSize + x0];
    const h10 = data[y0 * gridSize + x1];
    const h01 = data[y1 * gridSize + x0];
    const h11 = data[y1 * gridSize + x1];
    return (h00 + (h10 - h00) * tx) + ((h01 + (h11 - h01) * tx) - (h00 + (h10 - h00) * tx)) * ty;
  };
}
