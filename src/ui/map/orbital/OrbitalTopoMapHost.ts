// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Host adapter for the orbital topo map — keeps every mount's call-site to
 * 1-3 lines.
 *
 * It owns the boilerplate that the deploy screen, pause overlay, and hold-M
 * toggle would otherwise each duplicate: wiring a data source (live baked
 * heightmap vs a fetched coarse `.f32`), a marker provider (capture points
 * coloured by current owner + spawn points), and the shared renderer.
 *
 * Two data sources:
 *   - `liveDataSource(terrain)` reads `TerrainSystem.getBakedHeightmap()` each
 *     open (READ-ONLY over the terrain's internal buffer) — used by hold-M
 *     during combat where the terrain runtime is live.
 *   - `bakedDataSource(url, worldSize)` fetches a dedicated coarse topo `.f32`
 *     (downsampled NASADEM / seed DEM) — used by deploy / pause where the
 *     terrain runtime may not exist yet.
 */

import { fetchBinaryAsset } from '../../../utils/CompressedAssetFetch';
import { ZoneState } from '../../../systems/world/ZoneManager';
import type { CaptureZone } from '../../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../../types/SystemInterfaces';
import {
  OrbitalTopoMap,
  gridFromBuffer,
  makeGridSampler,
  type TopoDataSource,
  type OrbitalTopoMapOptions,
} from './OrbitalTopoMap';
import type { SharedRenderer } from './OrbitalTopoRenderer';
import type { HeightGrid } from './OrbitalTopoMeshBuilder';
import type { MarkerOwner, TopoMarkerInput } from './OrbitalTopoMarkers';

/** Minimal terrain facade the live source needs (concrete, non-fenced). */
export interface TopoTerrainSource {
  getBakedHeightmap(): { data: Float32Array; gridSize: number; worldSize: number } | null;
  getHeightAt(x: number, z: number): number;
}

/** A point the map can place: capture zone or spawn. */
export interface SpawnPointLike {
  id: string;
  name: string;
  position: { x: number; z: number };
}

/** Map a zone's state to the owner bucket the marker layer colours by. Pure. */
export function zoneOwner(zone: Pick<CaptureZone, 'state'>): MarkerOwner {
  switch (zone.state) {
    case ZoneState.BLUFOR_CONTROLLED:
      return 'blufor';
    case ZoneState.OPFOR_CONTROLLED:
      return 'opfor';
    case ZoneState.CONTESTED:
      return 'contested';
    default:
      return 'neutral';
  }
}

/** Build live marker inputs from zones + spawns. Pure (no THREE / DOM). */
export function buildMarkerInputs(
  zones: readonly Pick<CaptureZone, 'id' | 'name' | 'position' | 'state' | 'isHomeBase'>[],
  spawns: readonly SpawnPointLike[],
): TopoMarkerInput[] {
  const captureMarkers: TopoMarkerInput[] = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    worldX: zone.position.x,
    worldZ: zone.position.z,
    kind: 'capture',
    owner: zoneOwner(zone),
    isHomeBase: zone.isHomeBase,
  }));
  const spawnMarkers: TopoMarkerInput[] = spawns.map((spawn) => ({
    id: spawn.id,
    name: spawn.name,
    worldX: spawn.position.x,
    worldZ: spawn.position.z,
    kind: 'spawn',
    owner: 'neutral',
  }));
  return [...captureMarkers, ...spawnMarkers];
}

/** Live data source over a terrain runtime (read-only over the baked buffer). */
export function liveDataSource(terrain: TopoTerrainSource): TopoDataSource {
  let cachedGrid: HeightGrid | null = null;
  return {
    async loadGrid(): Promise<HeightGrid | null> {
      const baked = terrain.getBakedHeightmap();
      if (!baked) return null;
      // Reference the live internal buffer READ-ONLY; the mesh builder only
      // ever reads it (resampling into its own arrays).
      cachedGrid = { data: baked.data, gridSize: baked.gridSize, worldSize: baked.worldSize };
      return cachedGrid;
    },
    heightAt(worldX: number, worldZ: number): number {
      return terrain.getHeightAt(worldX, worldZ);
    },
  };
}

/** Baked data source over a fetched coarse topo `.f32`. */
export function bakedDataSource(url: string, worldSize: number): TopoDataSource {
  let grid: HeightGrid | null = null;
  let sampler: ((x: number, z: number) => number) | null = null;
  return {
    async loadGrid(): Promise<HeightGrid | null> {
      const bytes = await fetchBinaryAsset(url);
      if (!bytes) return null;
      const floats = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
      // Copy out of the fetch buffer so the grid owns a stable, mutable-free view.
      grid = gridFromBuffer(new Float32Array(floats), worldSize);
      if (grid) sampler = makeGridSampler(grid);
      return grid;
    },
    heightAt(worldX: number, worldZ: number): number {
      return sampler ? sampler(worldX, worldZ) : 0;
    },
  };
}

/** Convenience: build a map bound to a live terrain + zone query (hold-M / pause). */
export function createLiveOrbitalMap(opts: {
  renderer: SharedRenderer;
  terrain: TopoTerrainSource;
  zoneQuery: IZoneQuery;
  spawns?: () => readonly SpawnPointLike[];
  onZoneSelected?: (zoneId: string, zoneName: string) => void;
  ownsCanvas?: boolean;
}): OrbitalTopoMap {
  const options: OrbitalTopoMapOptions = {
    renderer: opts.renderer,
    dataSource: liveDataSource(opts.terrain),
    markerProvider: () => buildMarkerInputs(opts.zoneQuery.getAllZones(), opts.spawns ? opts.spawns() : []),
    onZoneSelected: opts.onZoneSelected,
    ownsCanvas: opts.ownsCanvas,
  };
  return new OrbitalTopoMap(options);
}

/** Convenience: build a map bound to a baked `.f32` + a static marker set (deploy). */
export function createBakedOrbitalMap(opts: {
  renderer: SharedRenderer;
  url: string;
  worldSize: number;
  markers: () => readonly TopoMarkerInput[];
  onZoneSelected?: (zoneId: string, zoneName: string) => void;
  ownsCanvas?: boolean;
}): OrbitalTopoMap {
  const options: OrbitalTopoMapOptions = {
    renderer: opts.renderer,
    dataSource: bakedDataSource(opts.url, opts.worldSize),
    markerProvider: opts.markers,
    onZoneSelected: opts.onZoneSelected,
    ownsCanvas: opts.ownsCanvas,
  };
  return new OrbitalTopoMap(options);
}
