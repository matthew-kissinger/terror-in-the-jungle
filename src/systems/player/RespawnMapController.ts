import { GameMode } from '../../config/gameModeTypes';
import { OpenFrontierRespawnMap } from '../../ui/map/OpenFrontierRespawnMap';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';
import type { RespawnSpawnPoint } from './RespawnSpawnPoint';

/**
 * Coordinates between the main game and the respawn map view.
 */
export class RespawnMapController {
  private openFrontierRespawnMap: OpenFrontierRespawnMap;
  private currentGameMode: GameMode = GameMode.ZONE_CONTROL;
  private gameModeManager?: GameModeManager;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;
  private updateInterval?: number;

  constructor() {
    this.openFrontierRespawnMap = new OpenFrontierRespawnMap();
  }

  setZoneManager(manager: ZoneManager): void {
    this.openFrontierRespawnMap.setZoneManager(manager);
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
    this.openFrontierRespawnMap.setSpawnPoints(spawnPoints);
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
  }
}
