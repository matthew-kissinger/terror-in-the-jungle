// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameMode } from '../../config/gameModeTypes';
import { OpenFrontierRespawnMap } from '../../ui/map/OpenFrontierRespawnMap';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import type { RespawnSpawnPoint } from './RespawnSpawnPoint';
import type { VehicleMarker } from '../../ui/minimap/MinimapRenderer';
import { mountDeployOrbitalToggle, type DeployOrbitalHandle } from '../../ui/map/orbital/OrbitalDeployMount';
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
  private orbital3D: DeployOrbitalHandle | null = null;

  constructor() {
    this.openFrontierRespawnMap = new OpenFrontierRespawnMap();
    this.openFrontierRespawnMap.setOrbitalToggleCallback(() => this.toggleOrbital3D());
  }

  setZoneManager(query: IZoneQuery): void {
    this.zoneQuery = query;
    this.openFrontierRespawnMap.setZoneQuery(query);
  }

  /**
   * Open/close the opt-in 3D orbital deploy map. The 2D deploy map stays the
   * default; this is a toggle from the map's "3D" control. Lazily mounted.
   */
  private toggleOrbital3D(): void {
    if (!this.orbital3D) {
      const worldSize = this.gameModeManager?.getWorldSize() ?? 3200;
      this.orbital3D = mountDeployOrbitalToggle({
        zoneQuery: this.zoneQuery,
        spawns: () => this.spawnPoints.map((s) => ({ id: s.id, name: s.name, position: { x: s.position.x, z: s.position.z } })),
        worldSize,
        bakedUrl: resolveTopoBakedUrl(this.currentGameMode),
        onZoneSelected: (zoneId, zoneName) => this.onZoneSelected?.(zoneId, zoneName),
      });
    }
    this.orbital3D.toggle();
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
