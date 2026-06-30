// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Deploy-screen 3D orbital map — EMBEDDED VIEWPORT (not a full-screen takeover).
 *
 * Mounts a small dedicated WebGL renderer + canvas INSIDE the deploy map panel
 * (`#respawn-map`), layered above the 2D map canvas. The deploy chrome (tabs,
 * Armory, spawn list, DEPLOY) stays visible at all times — the 3D view simply
 * occupies the same map box as the 2D map and the player flips between them.
 *
 * Why a dedicated renderer (not the shared game renderer): the deploy screen
 * shows before the world is resident, and embedding the shared full-screen
 * canvas into a sub-panel needs a transparent-hole + per-frame scissor/DPR
 * alignment that is fragile on resize/retina. A panel-local canvas sits in
 * normal DOM flow, sizes responsively (ResizeObserver), and tears down cleanly.
 * This matches the 2026-06-28 deploy-3D spike's "dedicated scene + camera"
 * recommendation. A `THREE.WebGLRenderer` already satisfies the orbital's
 * `SharedRenderer` interface, so the relief renderer is reused as-is (Lambert
 * relief on the WebGL path, which is the correct first-frame look anyway).
 *
 * Default 3D with 2D fallback: `show()` resolves false if the relief fails to
 * load (e.g. A Shau baked DEM absent before terrain is live), and the host
 * keeps the 2D map visible instead of a black box.
 */

import * as THREE from 'three';
import type { IZoneQuery } from '../../../types/SystemInterfaces';
import { createLiveOrbitalMap, createBakedOrbitalMap, buildMarkerInputs, type SpawnPointLike } from './OrbitalTopoMapHost';
import { getOrbitalLiveTerrain } from './OrbitalRendererRegistry';
import type { OrbitalTopoMap } from './OrbitalTopoMap';

export interface DeployOrbitalHandle {
  /** Attach the 3D viewport layer into the deploy map panel (idempotent). */
  attach(host: HTMLElement): void;
  /** Build + open the relief. Resolves true iff it loaded and is now shown. */
  show(): Promise<boolean>;
  /** Hide the 3D layer (reveals the 2D map beneath). */
  hide(): void;
  /** Whether the 3D layer is currently shown. */
  isOpen(): boolean;
  dispose(): void;
}

export interface DeployOrbitalOptions {
  zoneQuery?: IZoneQuery;
  spawns: () => readonly SpawnPointLike[];
  worldSize: number;
  /** Fallback baked topo `.f32` URL when no live terrain is registered. */
  bakedUrl: string;
  onZoneSelected?: (zoneId: string, zoneName: string) => void;
  /**
   * Invoked by the in-viewport "2D" control. The host (deploy controller) uses
   * this to flip back to the 2D map.
   */
  onRequestClose?: () => void;
}

const MAX_DEPLOY_PIXEL_RATIO = 2;

class DeployOrbitalViewport implements DeployOrbitalHandle {
  private host: HTMLElement | null = null;
  private layer: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private map: OrbitalTopoMap | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private open = false;

  constructor(private readonly options: DeployOrbitalOptions) {}

  attach(host: HTMLElement): void {
    if (!this.layer) this.buildLayer();
    // The deploy controller clears #respawn-map (innerHTML = '') on every show,
    // which detaches our layer — re-append it (the canvas + its GL context
    // survive detach/re-attach). Also re-point the resize observer if the host
    // element changed between deploys.
    if (this.host !== host || this.layer!.parentElement !== host) {
      this.host = host;
      if (getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      host.appendChild(this.layer!);
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(host);
    }
  }

  /** Build the (reusable) 3D layer DOM once: opaque relief box above the 2D map. */
  private buildLayer(): void {
    this.layer = document.createElement('div');
    this.layer.className = 'orbital-deploy-viewport';
    // Sits above the 2D map canvas (z 0) and its controls overlay (z 5). The
    // opaque relief background covers the 2D map when shown; hidden by default
    // until show() confirms the relief loaded.
    this.layer.style.cssText = [
      'position:absolute',
      'inset:0',
      'z-index:8',
      'display:none',
      'overflow:hidden',
      'background:#2a2620',
    ].join(';');

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%';
    this.layer.appendChild(this.canvas);

    this.layer.appendChild(this.buildHint());
    this.layer.appendChild(this.build2DButton());
  }

  async show(): Promise<boolean> {
    if (this.open) return true;
    if (!this.layer || !this.canvas) return false;
    // Reveal the layer first so the canvas has a non-zero size before the
    // renderer sizes and the relief's first frame renders.
    this.layer.style.display = 'block';
    const renderer = this.ensureRenderer();
    if (!renderer) { this.layer.style.display = 'none'; return false; }
    if (!this.map) {
      this.map = this.buildMap(renderer);
      if (!this.map) { this.layer.style.display = 'none'; return false; }
      this.map.mountInto(this.layer);
    }
    this.syncSize();
    await this.map.open_();
    if (!this.map.isLoaded()) {
      // No relief available — fall back to the 2D map rather than a black box.
      this.map.close();
      this.layer.style.display = 'none';
      this.open = false;
      return false;
    }
    this.open = true;
    return true;
  }

  hide(): void {
    this.open = false;
    this.map?.close();
    if (this.layer) this.layer.style.display = 'none';
  }

  isOpen(): boolean {
    return this.open;
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    if (!this.canvas) return null;
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DEPLOY_PIXEL_RATIO));
      this.renderer = r;
      this.syncSize();
      return r;
    } catch {
      return null;
    }
  }

  /** Match the drawing buffer to the panel box (CSS size is 100% via style). */
  private syncSize(): void {
    if (!this.renderer || !this.host) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w > 0 && h > 0) this.renderer.setSize(w, h, false);
  }

  private buildMap(renderer: THREE.WebGLRenderer): OrbitalTopoMap | null {
    const terrain = getOrbitalLiveTerrain();
    const markers = (): ReturnType<typeof buildMarkerInputs> =>
      buildMarkerInputs(this.options.zoneQuery?.getAllZones() ?? [], this.options.spawns());
    if (terrain && this.options.zoneQuery) {
      return createLiveOrbitalMap({
        renderer,
        terrain,
        zoneQuery: this.options.zoneQuery,
        spawns: this.options.spawns,
        onZoneSelected: this.options.onZoneSelected,
        ownsCanvas: true,
      });
    }
    return createBakedOrbitalMap({
      renderer,
      url: this.options.bakedUrl,
      worldSize: this.options.worldSize,
      markers,
      onZoneSelected: this.options.onZoneSelected,
      ownsCanvas: true,
    });
  }

  private buildHint(): HTMLDivElement {
    const hint = document.createElement('div');
    hint.textContent = 'TOPOGRAPHIC RELIEF — drag to orbit, scroll to zoom, tap a sector to pick a spawn';
    hint.style.cssText = [
      'position:absolute',
      'top:10px',
      'left:50%',
      'transform:translateX(-50%)',
      'max-width:92%',
      'text-align:center',
      'color:rgba(231,217,186,0.95)',
      'font:bold 11px "Courier Prime", monospace',
      'letter-spacing:0.4px',
      'text-shadow:0 1px 3px rgba(0,0,0,0.6)',
      'pointer-events:none',
      'z-index:2',
    ].join(';');
    return hint;
  }

  private build2DButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'respawn-map-2d';
    btn.textContent = '2D';
    btn.title = 'Back to the flat tactical map';
    btn.setAttribute('aria-label', 'Switch to 2D map');
    btn.style.cssText = [
      'position:absolute',
      'top:10px',
      'right:10px',
      'z-index:3',
      'padding:5px 12px',
      'border:1px solid rgba(43,38,32,0.5)',
      'border-radius:6px',
      'background:rgba(231,217,186,0.92)',
      'color:rgba(43,38,32,0.95)',
      'font:bold 13px "Courier Prime", monospace',
      'cursor:pointer',
      'pointer-events:auto',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.options.onRequestClose) this.options.onRequestClose();
      else this.hide();
    });
    return btn;
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.dispose();
    this.map = null;
    this.renderer?.dispose();
    this.renderer = null;
    if (this.layer?.parentElement) {
      this.layer.parentElement.removeChild(this.layer);
    }
    this.layer = null;
    this.canvas = null;
    this.host = null;
    this.open = false;
  }
}

/** Build an embedded deploy orbital viewport handle. Thin factory the controller calls. */
export function mountDeployOrbitalViewport(options: DeployOrbitalOptions): DeployOrbitalHandle {
  return new DeployOrbitalViewport(options);
}
