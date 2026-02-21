import { GameMode } from '../../config/gameModes';
import { RespawnMapView } from '../../ui/map/RespawnMapView';
import { OpenFrontierRespawnMap } from '../../ui/map/OpenFrontierRespawnMap';
import { ZoneManager } from '../world/ZoneManager';
import { GameModeManager } from '../world/GameModeManager';
import { Logger } from '../../utils/Logger';

/**
 * Coordinates between the main game and the respawn map view.
 */
export class RespawnMapController {
  private respawnMapView: RespawnMapView;
  private openFrontierRespawnMap: OpenFrontierRespawnMap;
  private currentGameMode: GameMode = GameMode.ZONE_CONTROL;
  private gameModeManager?: GameModeManager;
  private onZoneSelected?: (zoneId: string, zoneName: string) => void;
  private updateInterval?: number;
  private activeMap: RespawnMapView | OpenFrontierRespawnMap;

  constructor() {
    this.respawnMapView = new RespawnMapView();
    this.openFrontierRespawnMap = new OpenFrontierRespawnMap();
    this.activeMap = this.respawnMapView;
  }

  setZoneManager(manager: ZoneManager): void {
    this.respawnMapView.setZoneManager(manager);
    this.openFrontierRespawnMap.setZoneManager(manager);
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
    if (manager) {
      this.currentGameMode = manager.currentMode;
      const worldSize = manager.getWorldSize();
      Logger.info('respawn-map', ` RespawnMapController: Game mode detected as ${this.currentGameMode} (world size: ${worldSize})`);
    }
    this.respawnMapView.setGameModeManager(manager);
    this.openFrontierRespawnMap.setGameModeManager(manager);
  }

  setZoneSelectedCallback(callback: (zoneId: string, zoneName: string) => void): void {
    this.onZoneSelected = callback;
    this.respawnMapView.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.onZoneSelected?.(zoneId, zoneName);
    });
    this.openFrontierRespawnMap.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.onZoneSelected?.(zoneId, zoneName);
    });
  }

  showMap(mapContainer: HTMLElement | null): void {
    if (!mapContainer) return;

    if (this.gameModeManager) {
      this.currentGameMode = this.gameModeManager.currentMode;
      const worldSize = this.gameModeManager.getWorldSize();
      Logger.info('respawn-map', ` Showing respawn map for mode: ${this.currentGameMode}, world size: ${worldSize}`);
    }

    mapContainer.innerHTML = '';

    const isOpenFrontier = this.currentGameMode === GameMode.OPEN_FRONTIER;
    Logger.info('respawn-map', ` Using map: ${isOpenFrontier ? 'OpenFrontierRespawnMap' : 'RespawnMapView'}`);

    const activeMap = isOpenFrontier ? this.openFrontierRespawnMap : this.respawnMapView;
    this.activeMap = activeMap;
    const mapCanvas = activeMap.getCanvas();

    mapCanvas.style.cssText = isOpenFrontier ? `
      width: 100%;
      height: 100%;
      max-width: 800px;
      max-height: 800px;
    ` : `
      width: 100%;
      height: 100%;
      max-width: 600px;
      max-height: 600px;
    `;

    mapContainer.appendChild(mapCanvas);

    activeMap.clearSelection();
    activeMap.updateSpawnableZones();
    activeMap.render();

    if (isOpenFrontier) {
      this.openFrontierRespawnMap.resetView();
    }

    this.startMapUpdateInterval();
  }

  private startMapUpdateInterval(): void {
    this.stopMapUpdateInterval();

    this.updateInterval = window.setInterval(() => {
      this.activeMap.updateSpawnableZones();
      this.activeMap.render();
    }, 1000);
  }

  stopMapUpdateInterval(): void {
    if (this.updateInterval !== undefined) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  clearSelection(): void {
    this.respawnMapView.clearSelection();
    this.openFrontierRespawnMap.clearSelection();
  }

  dispose(): void {
    this.stopMapUpdateInterval();
  }
}
