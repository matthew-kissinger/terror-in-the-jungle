// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * In-combat mount for the 3D orbital map (plain M, default).
 *
 * Keeps `FullMapSystem`'s call-site to a single `toggle()`: this helper builds
 * the full-screen overlay, reads the shared renderer + live terrain from the
 * registries, wires the live orbital map (capture points coloured by current
 * owner + spawn points), and returns a small toggle/dispose handle.
 *
 * Owner decision 2026-06-30: plain M opens this 3D relief (toggle); the fast 2D
 * tactical map moved to Shift+M.
 */

import type * as THREE from 'three';
import type { IZoneQuery } from '../../../types/SystemInterfaces';
import { createLiveOrbitalMap } from './OrbitalTopoMapHost';
import { getOrbitalSharedRenderer, getOrbitalLiveTerrain } from './OrbitalRendererRegistry';
import type { OrbitalTopoMap } from './OrbitalTopoMap';

export interface HoldMOrbitalHandle {
  toggle(): void;
  dispose(): void;
}

export interface HoldMOrbitalOptions {
  camera: THREE.Camera;
  zoneQuery?: IZoneQuery;
  worldSize: number;
}

class HoldMOrbitalMount implements HoldMOrbitalHandle {
  private overlay: HTMLDivElement | null = null;
  private map: OrbitalTopoMap | null = null;
  private open = false;

  constructor(private readonly options: HoldMOrbitalOptions) {}

  toggle(): void {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show(): void {
    const renderer = getOrbitalSharedRenderer();
    const terrain = getOrbitalLiveTerrain();
    if (!renderer || !terrain || !this.options.zoneQuery) {
      return; // Quietly no-op if the live runtime isn't available.
    }
    if (!this.overlay) {
      this.overlay = this.buildOverlay();
      document.body.appendChild(this.overlay);
    }
    if (!this.map) {
      this.map = createLiveOrbitalMap({
        renderer,
        terrain,
        zoneQuery: this.options.zoneQuery,
      });
      this.map.mountInto(this.overlay);
    }
    this.overlay.style.display = 'block';
    this.open = true;
    void this.map.open_();
  }

  private hide(): void {
    this.open = false;
    this.map?.close();
    if (this.overlay) this.overlay.style.display = 'none';
  }

  private buildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'orbital-holdm-overlay';
    // Transparent: the orbital relief renders into the shared canvas BEHIND
    // this DOM layer, so a solid background would occlude it. Only DOM chrome
    // (the hint text) lives here; the interaction container is also transparent.
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:60',
      'background:transparent',
      'display:none',
    ].join(';');

    const hint = document.createElement('div');
    hint.textContent = 'TOPOGRAPHIC MAP — drag to orbit, scroll/pinch to zoom, M to close (Shift+M for 2D map)';
    hint.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:50%',
      'transform:translateX(-50%)',
      'color:rgba(231,217,186,0.95)',
      'font:bold 13px "Courier Prime", monospace',
      'letter-spacing:0.5px',
      'pointer-events:none',
      'z-index:1',
    ].join(';');
    overlay.appendChild(hint);
    return overlay;
  }

  dispose(): void {
    this.map?.dispose();
    this.map = null;
    if (this.overlay?.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.open = false;
  }
}

/** Build a hold-M orbital toggle handle. Thin factory the FullMapSystem calls. */
export function mountHoldMOrbitalToggle(options: HoldMOrbitalOptions): HoldMOrbitalHandle {
  return new HoldMOrbitalMount(options);
}
