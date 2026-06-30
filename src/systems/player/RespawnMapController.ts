// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameMode } from '../../config/gameModeTypes';
import { OpenFrontierRespawnMap } from '../../ui/map/OpenFrontierRespawnMap';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import type { RespawnSpawnPoint } from './RespawnSpawnPoint';
import type { VehicleMarker } from '../../ui/minimap/MinimapRenderer';
import { mountDeployOrbitalViewport, type DeployOrbitalHandle } from '../../ui/map/orbital/OrbitalDeployMount';
import { resolveTopoBakedUrl } from '../../ui/map/orbital/OrbitalTopoBakedUrl';

/**
 * Coordinates between the main game and the respawn map view.
 */
export class RespawnMapController {
  private openFrontierRespawnMap: OpenFrontierRespawnMap;
  private currentGameMode: GameMode = GameMode.ZONE_CONTROL;
  private gameModeManager?: GameModeManager;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;
  private updateInterval?: number;
  private zoneQuery?: IZoneQuery;
  private spawnPoints: RespawnSpawnPoint[] = [];
  // Embedded 3D relief viewport: a dedicated-renderer canvas layered inside the
  // deploy map panel (#respawn-map), above the 2D map. Default view; the deploy
  // chrome (tabs / Armory / spawn list / DEPLOY) stays visible at all times.
  private orbital3D: DeployOrbitalHandle | null = null;

  constructor() {
    this.openFrontierRespawnMap = new OpenFrontierRespawnMap();
    this.openFrontierRespawnMap.setOrbitalToggleCallback(() => this.toggleOrbital3D());
  }

  setZoneManager(query: IZoneQuery): void {
    this.zoneQuery = query;
    this.openFrontierRespawnMap.setZoneQuery(query);
  }

  private ensureOrbital3D(): DeployOrbitalHandle {
    if (!this.orbital3D) {
      const worldSize = this.gameModeManager?.getWorldSize() ?? 3200;
      this.orbital3D = mountDeployOrbitalViewport({
        zoneQuery: this.zoneQuery,
        spawns: () => this.spawnPoints.map((s) => ({ id: s.id, name: s.name, position: { x: s.position.x, z: s.position.z } })),
        worldSize,
        bakedUrl: resolveTopoBakedUrl(this.currentGameMode),
        onZoneSelected: (zoneId, zoneName) => this.onZoneSelected?.(zoneId, zoneName),
        onRequestClose: () => this.closeOrbital3DToTwoD(),
      });
    }
    return this.orbital3D;
  }

  /**
   * Default deploy view is the embedded 3D relief: show the 3D layer over the
   * 2D map inside the map panel — but only if the relief actually loads (a
   * missing baked DEM keeps the 2D map visible instead of a black box). The
   * deploy chrome stays visible; the player flips back to 2D via the in-viewport
   * "2D" control.
   */
  private async openOrbital3D(): Promise<void> {
    await this.ensureOrbital3D().show();
  }

  /** Flip back to the 2D deploy map (in-viewport "2D" control or the toggle). */
  private closeOrbital3DToTwoD(): void {
    this.orbital3D?.hide();
  }

  /** "3D" / "2D" controls toggle between the embedded 3D relief and the 2D map. */
  private toggleOrbital3D(): void {
    if (this.orbital3D?.isOpen()) {
      this.closeOrbital3DToTwoD();
    } else {
      void this.openOrbital3D();
    }
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
    if (manager) {
      this.currentGameMode = manager.getCurrentMode();
      const worldSize = manager.getWorldSize();
      Logger.info('respawn-map', ` RespawnMapController: Game mode detected as ${this.currentGameMode} (world size: ${worldSize})`);
      this.openFrontierRespawnMap.setWorldSize(worldSize);
    }
    this.openFrontierRespawnMap.setGameModeManager(manager);
  }

  setSpawnPoints(spawnPoints: RespawnSpawnPoint[]): void {
    this.spawnPoints = spawnPoints;
    this.openFrontierRespawnMap.setSpawnPoints(spawnPoints);
  }

  /**
   * Pass crewable-vehicle markers (tank / boat / emplacement) through to the
   * deploy map so the player can see where vehicles are before deploying.
   * Informational only -- selection does not crew the vehicle.
   */
  setVehicleMarkers(markers: VehicleMarker[]): void {
    this.openFrontierRespawnMap.setVehicleMarkers(markers);
  }

  setZoneSelectedCallback(callback: (zoneId: string, zoneName: string) => void): void {
    this.onZoneSelected = callback;
    this.openFrontierRespawnMap.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.onZoneSelected?.(zoneId, zoneName);
    });
  }

  showMap(mapContainer: HTMLElement | null): void {
    if (!mapContainer) return;

    if (this.gameModeManager) {
      this.currentGameMode = this.gameModeManager.getCurrentMode();
      const worldSize = this.gameModeManager.getWorldSize();
      Logger.info('respawn-map', ` Showing respawn map for mode: ${this.currentGameMode}, world size: ${worldSize}`);
    }

    mapContainer.innerHTML = '';

    Logger.info('respawn-map', ' Using map: OpenFrontierRespawnMap');
    const mapCanvas = this.openFrontierRespawnMap.getCanvas();

    mapCanvas.style.cssText = `
      width: 100%;
      height: 100%;
      max-width: 800px;
      max-height: 800px;
      object-fit: contain;
      display: block;
    `;

    mapContainer.appendChild(mapCanvas);

    this.openFrontierRespawnMap.clearSelection();
    this.openFrontierRespawnMap.focusSpawnPoints();

    this.startMapUpdateInterval();

    // Embed the 3D relief viewport into the map panel (above the 2D canvas) and
    // default to it. Falls back to the 2D map if the relief fails to load. The
    // deploy chrome (tabs / Armory / DEPLOY) stays visible either way.
    this.ensureOrbital3D().attach(mapContainer);
    void this.openOrbital3D();
  }

  focusSpawnPoints(preferredSpawnPointId?: string): void {
    this.openFrontierRespawnMap.focusSpawnPoints(preferredSpawnPointId);
  }

  setSelectedSpawnPoint(spawnPointId: string | undefined): void {
    this.openFrontierRespawnMap.setSelectedSpawnPoint(spawnPointId);
  }

  private startMapUpdateInterval(): void {
    this.stopMapUpdateInterval();

    this.updateInterval = window.setInterval(() => {
      this.openFrontierRespawnMap.render();
    }, 1000);
  }

  stopMapUpdateInterval(): void {
    if (this.updateInterval !== undefined) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    // The deploy screen is closing (deploy / cancel): hide the 3D relief layer
    // so its render pump stops. The layer lives inside #respawn-map, which the
    // deploy flow tears down, so nothing leaks into gameplay.
    this.orbital3D?.hide();
  }

  clearSelection(): void {
    this.openFrontierRespawnMap.clearSelection();
  }

  dispose(): void {
    this.stopMapUpdateInterval();
    this.orbital3D?.dispose();
    this.orbital3D = null;
  }
}
