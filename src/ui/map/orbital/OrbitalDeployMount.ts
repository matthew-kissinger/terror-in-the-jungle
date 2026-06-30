// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Deploy-screen + pause-overlay mount for the 3D orbital map.
 *
 * Same reusable component as hold-M, but driven from a deploy/respawn context:
 * markers are capture zones (coloured by current owner) plus the deployable
 * spawn points, and selecting a spawn marker fires `onZoneSelected` so the
 * deploy flow can pick it. Terrain comes from the live baked heightmap when the
 * runtime is up (respawn mid-match); otherwise it falls back to a baked coarse
 * `.f32` so the deploy screen still shows relief before the world loads.
 *
 * One thin `toggle()` keeps the deploy/pause call-sites to 1-3 lines.
 */

import type { IZoneQuery } from '../../../types/SystemInterfaces';
import { createLiveOrbitalMap, createBakedOrbitalMap, buildMarkerInputs, type SpawnPointLike } from './OrbitalTopoMapHost';
import { getOrbitalSharedRenderer, getOrbitalLiveTerrain } from './OrbitalRendererRegistry';
import type { OrbitalTopoMap } from './OrbitalTopoMap';
import type { SharedRenderer } from './OrbitalTopoRenderer';

export interface DeployOrbitalHandle {
  toggle(): void;
  dispose(): void;
}

export interface DeployOrbitalOptions {
  zoneQuery?: IZoneQuery;
  spawns: () => readonly SpawnPointLike[];
  worldSize: number;
  /** Fallback baked topo `.f32` URL when no live terrain is registered. */
  bakedUrl: string;
  onZoneSelected?: (zoneId: string, zoneName: string) => void;
}

class DeployOrbitalMount implements DeployOrbitalHandle {
  private overlay: HTMLDivElement | null = null;
  private map: OrbitalTopoMap | null = null;
  private open = false;

  constructor(private readonly options: DeployOrbitalOptions) {}

  toggle(): void {
    if (this.open) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show(): void {
    const renderer = getOrbitalSharedRenderer();
    if (!renderer) return;
    if (!this.overlay) {
      this.overlay = this.buildOverlay();
      document.body.appendChild(this.overlay);
    }
    if (!this.map) {
      this.map = this.buildMap(renderer);
      if (!this.map) return;
      this.map.mountInto(this.overlay);
    }
    this.overlay.style.display = 'block';
    this.open = true;
    void this.map.open_();
  }

  private buildMap(renderer: SharedRenderer): OrbitalTopoMap | null {
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
      });
    }
    return createBakedOrbitalMap({
      renderer,
      url: this.options.bakedUrl,
      worldSize: this.options.worldSize,
      markers,
      onZoneSelected: this.options.onZoneSelected,
    });
  }

  private hide(): void {
    this.open = false;
    this.map?.close();
    if (this.overlay) this.overlay.style.display = 'none';
  }

  private buildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'orbital-deploy-overlay';
    // Transparent: the relief renders into the shared canvas BEHIND this DOM
    // layer, so a solid background would occlude it. Only DOM chrome (the close
    // button) lives here; the interaction container is transparent too.
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:70',
      'background:transparent',
      'display:none',
    ].join(';');
    overlay.appendChild(this.buildCloseButton());
    return overlay;
  }

  private buildCloseButton(): HTMLButtonElement {
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕ 2D';
    close.title = 'Back to 2D map';
    close.style.cssText = [
      'position:absolute',
      'top:14px',
      'right:14px',
      'z-index:2',
      'padding:6px 12px',
      'border:1px solid rgba(43,38,32,0.5)',
      'border-radius:6px',
      'background:rgba(231,217,186,0.92)',
      'color:rgba(43,38,32,0.95)',
      'font:bold 14px "Courier Prime", monospace',
      'cursor:pointer',
    ].join(';');
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    });
    return close;
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

/** Build a deploy/pause orbital toggle handle. Thin factory the callers use. */
export function mountDeployOrbitalToggle(options: DeployOrbitalOptions): DeployOrbitalHandle {
  return new DeployOrbitalMount(options);
}
