import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { ZoneManager, ZoneState } from '../world/ZoneManager';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { GameModeManager } from '../world/GameModeManager';
import { RespawnMapView } from '../../ui/map/RespawnMapView';
import { OpenFrontierRespawnMap } from '../../ui/map/OpenFrontierRespawnMap';
import { GameMode } from '../../config/gameModes';
import { InventoryManager } from './InventoryManager';
import { getHeightQueryCache } from '../terrain/HeightQueryCache';

export class PlayerRespawnManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private playerHealthSystem?: PlayerHealthSystem;
  private gameModeManager?: GameModeManager;
  private playerController?: any;
  private firstPersonWeapon?: any;
  private inventoryManager?: InventoryManager;

  // Respawn state
  private isRespawnUIVisible = false;
  private respawnTimer = 0;
  private selectedSpawnPoint?: string;
  private respawnUIContainer?: HTMLDivElement;
  private availableSpawnPoints: Array<{ id: string; name: string; position: THREE.Vector3; safe: boolean }> = [];
  private respawnMapView: RespawnMapView;
  private openFrontierRespawnMap: OpenFrontierRespawnMap;
  private currentGameMode: GameMode = GameMode.ZONE_CONTROL;

  private onRespawnCallback?: (position: THREE.Vector3) => void;
  private onDeathCallback?: () => void;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.respawnMapView = new RespawnMapView();
    this.openFrontierRespawnMap = new OpenFrontierRespawnMap();
  }

  async init(): Promise<void> {
    console.log('🏥 Initializing Player Respawn Manager...');
    this.createRespawnUI();
  }

  private createRespawnUI(): void {
    // Create container for respawn UI
    this.respawnUIContainer = document.createElement('div');
    this.respawnUIContainer.id = 'respawn-ui';
    this.respawnUIContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      display: none;
      z-index: 10000;
      font-family: 'Courier New', monospace;
    `;

    // Create main layout container
    const mainLayout = document.createElement('div');
    mainLayout.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    `;

    // KIA Header
    const header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(180deg, rgba(20,0,0,0.95) 0%, rgba(10,0,0,0.8) 100%);
      border-bottom: 2px solid #ff0000;
      padding: 20px;
      text-align: center;
    `;

    const kiaText = document.createElement('h1');
    kiaText.style.cssText = `
      color: #ff0000;
      font-size: 48px;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 8px;
      text-shadow: 0 0 20px rgba(255,0,0,0.5);
    `;
    kiaText.textContent = 'K.I.A.';
    header.appendChild(kiaText);

    const statusText = document.createElement('div');
    statusText.style.cssText = `
      color: #999;
      font-size: 16px;
      margin-top: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    statusText.textContent = 'KILLED IN ACTION';
    header.appendChild(statusText);

    // Content area with map and controls
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      flex: 1;
      display: flex;
      padding: 30px;
      gap: 30px;
      overflow: hidden;
    `;

    // Left panel - Map
    const mapPanel = document.createElement('div');
    mapPanel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 600px;
    `;

    const mapTitle = document.createElement('h2');
    mapTitle.style.cssText = `
      color: #00ff00;
      font-size: 20px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 2px;
    `;
    mapTitle.textContent = 'TACTICAL MAP - SELECT DEPLOYMENT';
    mapPanel.appendChild(mapTitle);

    // Map container with canvas
    const mapContainer = document.createElement('div');
    mapContainer.id = 'respawn-map';
    mapContainer.style.cssText = `
      flex: 1;
      background: #0a0a0a;
      border: 2px solid #00ff00;
      border-radius: 4px;
      position: relative;
      min-height: 500px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    mapPanel.appendChild(mapContainer);

    // Set up map selection callbacks for both maps
    this.respawnMapView.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.selectSpawnPointOnMap(zoneId, zoneName);
    });

    this.openFrontierRespawnMap.setZoneSelectedCallback((zoneId: string, zoneName: string) => {
      this.selectSpawnPointOnMap(zoneId, zoneName);
    });

    // Right panel - Info and controls
    const infoPanel = document.createElement('div');
    infoPanel.style.cssText = `
      width: 350px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    // Selected spawn info
    const selectedInfo = document.createElement('div');
    selectedInfo.style.cssText = `
      background: rgba(0, 50, 0, 0.3);
      border: 1px solid #00ff00;
      border-radius: 4px;
      padding: 20px;
    `;

    const selectedTitle = document.createElement('h3');
    selectedTitle.style.cssText = `
      color: #00ff00;
      font-size: 16px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 1px;
    `;
    selectedTitle.textContent = 'SELECTED SPAWN POINT';
    selectedInfo.appendChild(selectedTitle);

    const selectedName = document.createElement('div');
    selectedName.id = 'selected-spawn-name';
    selectedName.style.cssText = `
      color: white;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    `;
    selectedName.textContent = 'NONE';
    selectedInfo.appendChild(selectedName);

    const selectedStatus = document.createElement('div');
    selectedStatus.id = 'selected-spawn-status';
    selectedStatus.style.cssText = `
      color: #999;
      font-size: 14px;
    `;
    selectedStatus.textContent = 'Select a spawn point on the map';
    selectedInfo.appendChild(selectedStatus);

    infoPanel.appendChild(selectedInfo);

    // Timer and respawn button
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
      background: rgba(20, 20, 20, 0.8);
      border: 1px solid #666;
      border-radius: 4px;
      padding: 20px;
      text-align: center;
    `;

    const timerDisplay = document.createElement('div');
    timerDisplay.id = 'respawn-timer';
    timerDisplay.style.cssText = `
      color: #ff6600;
      font-size: 16px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    controlsContainer.appendChild(timerDisplay);

    const respawnButton = document.createElement('button');
    respawnButton.id = 'respawn-button';
    respawnButton.style.cssText = `
      background: linear-gradient(180deg, #00ff00 0%, #00cc00 100%);
      border: 2px solid #00ff00;
      color: #000;
      font-size: 18px;
      font-weight: bold;
      padding: 15px 40px;
      border-radius: 4px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 2px;
      transition: all 0.2s;
      width: 100%;
      box-shadow: 0 4px 10px rgba(0,255,0,0.3);
    `;
    respawnButton.textContent = 'DEPLOY';
    respawnButton.disabled = true;
    controlsContainer.appendChild(respawnButton);

    // Add hover effect for button
    respawnButton.onmouseover = () => {
      if (!respawnButton.disabled) {
        respawnButton.style.transform = 'scale(1.05)';
        respawnButton.style.boxShadow = '0 6px 20px rgba(0,255,0,0.5)';
      }
    };
    respawnButton.onmouseout = () => {
      respawnButton.style.transform = 'scale(1)';
      respawnButton.style.boxShadow = '0 4px 10px rgba(0,255,0,0.3)';
    };

    respawnButton.onclick = () => {
      if (this.selectedSpawnPoint && !respawnButton.disabled) {
        this.confirmRespawn();
      }
    };

    infoPanel.appendChild(controlsContainer);

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 4px;
      padding: 15px;
    `;

    const legendTitle = document.createElement('h4');
    legendTitle.style.cssText = `
      color: #888;
      font-size: 14px;
      text-transform: uppercase;
      margin: 0 0 10px 0;
      letter-spacing: 1px;
    `;
    legendTitle.textContent = 'MAP LEGEND';
    legend.appendChild(legendTitle);

    const legendItems = [
      { color: '#0080ff', label: 'HQ / Main Base' },
      { color: '#00ff00', label: 'Controlled Zone' },
      { color: '#ffff00', label: 'Contested Zone' },
      { color: '#ff0000', label: 'Enemy Zone' }
    ];

    legendItems.forEach(item => {
      const legendItem = document.createElement('div');
      legendItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 5px;
      `;

      const colorBox = document.createElement('div');
      colorBox.style.cssText = `
        width: 16px;
        height: 16px;
        background: ${item.color};
        border: 1px solid rgba(255,255,255,0.3);
      `;

      const label = document.createElement('span');
      label.style.cssText = `
        color: #999;
        font-size: 12px;
      `;
      label.textContent = item.label;

      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legend.appendChild(legendItem);
    });

    infoPanel.appendChild(legend);

    // Assemble the layout
    contentArea.appendChild(mapPanel);
    contentArea.appendChild(infoPanel);

    mainLayout.appendChild(header);
    mainLayout.appendChild(contentArea);

    this.respawnUIContainer.appendChild(mainLayout);
    document.body.appendChild(this.respawnUIContainer);
  }


  update(deltaTime: number): void {
    if (this.isRespawnUIVisible && this.respawnTimer > 0) {
      this.respawnTimer -= deltaTime;
      this.updateTimerDisplay();
      if (this.respawnTimer <= 0) {
        this.enableSpawnButtons();
      }
    }
  }

  dispose(): void {
    this.hideRespawnUI();
    if (this.respawnUIContainer?.parentElement) {
      this.respawnUIContainer.parentElement.removeChild(this.respawnUIContainer);
    }
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
    this.respawnMapView.setZoneManager(manager);
    this.openFrontierRespawnMap.setZoneManager(manager);
  }

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;

    // Determine current game mode based on the actual mode
    if (manager) {
      // Now currentMode is public
      this.currentGameMode = manager.currentMode;
      const worldSize = manager.getWorldSize();
      console.log(`🗺️ PlayerRespawnManager: Game mode detected as ${this.currentGameMode} (world size: ${worldSize})`);
    }

    // Configure both maps
    this.respawnMapView.setGameModeManager(manager);
    this.openFrontierRespawnMap.setGameModeManager(manager);
  }

  setPlayerController(controller: any): void {
    this.playerController = controller;
  }

  setFirstPersonWeapon(weapon: any): void {
    this.firstPersonWeapon = weapon;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setRespawnCallback(callback: (position: THREE.Vector3) => void): void {
    this.onRespawnCallback = callback;
  }

  setDeathCallback(callback: () => void): void {
    this.onDeathCallback = callback;
  }

  getSpawnableZones(): Array<{ id: string; name: string; position: THREE.Vector3 }> {
    if (!this.zoneManager) {
      return [];
    }

    // Check if game mode allows spawning at zones
    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;

    // Filter zones - only US controlled zones (not OPFOR or contested)
    const zones = this.zoneManager.getAllZones().filter(z => {
      // Only allow US bases (not OPFOR bases)
      if (z.isHomeBase && z.owner === Faction.US) return true;
      // Only allow fully US-captured zones (not contested or OPFOR controlled)
      if (canSpawnAtZones && !z.isHomeBase && z.state === ZoneState.US_CONTROLLED) return true;
      return false;
    });

    console.log(`🚩 Found ${zones.length} spawnable zones:`, zones.map(z => `${z.name} (${z.state})`));

    return zones.map(z => ({
      id: z.id,
      name: z.name,
      position: z.position.clone()
    }));
  }

  canSpawnAtZone(): boolean {
    if (!this.zoneManager || !this.gameModeManager) return false;

    // Check if game mode allows spawning at zones
    if (!this.gameModeManager.canPlayerSpawnAtZones()) {
      return false;
    }

    const zones = this.zoneManager.getAllZones();
    // Only non-base zones that are fully US controlled (not contested or OPFOR)
    return zones.some(zone => zone.state === ZoneState.US_CONTROLLED && !zone.isHomeBase);
  }

  respawnAtBase(): void {
    if (!this.zoneManager) {
      this.respawn(new THREE.Vector3(0, 5, -50));
      return;
    }

    const usBase = this.zoneManager.getAllZones().find(
      z => z.id === 'us_base' || (z.isHomeBase && z.owner === Faction.US)
    );

    const basePos = usBase ? usBase.position.clone() : new THREE.Vector3(0, 5, -50);
    basePos.y = 5;
    this.respawn(basePos);
  }

  respawnAtSpecificZone(zoneId: string): void {
    if (!this.zoneManager) return;

    const zone = this.zoneManager.getAllZones().find(z => z.id === zoneId);
    if (!zone) return;

    const target = zone.position.clone().add(new THREE.Vector3(5, 2, 5));
    this.respawn(target);
  }

  private respawn(position: THREE.Vector3): void {
    // Ensure spawn position is at correct terrain height
    const terrainHeight = getHeightQueryCache().getHeightAt(position.x, position.z);
    position.y = terrainHeight + 2; // Add player height offset

    // Move player to spawn position
    if (this.playerController) {
      if (typeof this.playerController.setPosition === 'function') {
        this.playerController.setPosition(position);
      }
      if (typeof this.playerController.enableControls === 'function') {
        this.playerController.enableControls();
      }
    }

    // Reset inventory (including grenades)
    if (this.inventoryManager) {
      this.inventoryManager.reset();
    }

    // Re-enable weapon
    if (this.firstPersonWeapon && typeof this.firstPersonWeapon.enable === 'function') {
      this.firstPersonWeapon.enable();
    }

    // Apply spawn protection per game mode
    const protection = this.gameModeManager?.getSpawnProtectionDuration() ?? 0;
    if (this.playerHealthSystem && protection > 0 && typeof (this.playerHealthSystem as any).applySpawnProtection === 'function') {
      (this.playerHealthSystem as any).applySpawnProtection(protection);
    }

    console.log(`🏥 Player respawned at ${position.x}, ${position.y}, ${position.z}`);

    // Trigger callback
    if (this.onRespawnCallback) {
      this.onRespawnCallback(position);
    }
  }

  onPlayerDeath(): void {
    console.log('💀 Player eliminated!');

    // Re-check game mode when player dies in case it changed
    if (this.gameModeManager) {
      this.currentGameMode = this.gameModeManager.currentMode;
      const worldSize = this.gameModeManager.getWorldSize();
      console.log(`🗺️ Death screen: Current game mode is ${this.currentGameMode}, world size: ${worldSize}`);
    }

    // Disable player controls
    if (this.playerController && typeof this.playerController.disableControls === 'function') {
      this.playerController.disableControls();
    }

    // Hide weapon
    if (this.firstPersonWeapon && typeof this.firstPersonWeapon.disable === 'function') {
      this.firstPersonWeapon.disable();
    }

    // Start respawn timer
    const respawnTime = this.gameModeManager?.getRespawnTime() ?? 5;
    this.respawnTimer = respawnTime;

    // Show respawn UI immediately
    this.showRespawnUI();

    // Trigger callback
    if (this.onDeathCallback) {
      this.onDeathCallback();
    }
  }

  private showRespawnUI(): void {
    if (this.isRespawnUIVisible || !this.respawnUIContainer) return;

    this.isRespawnUIVisible = true;

    // Update available spawn points
    this.updateAvailableSpawnPoints();

    // Show the UI
    this.respawnUIContainer.style.display = 'flex';

    // Swap map canvas based on game mode
    const mapContainer = document.getElementById('respawn-map');
    if (mapContainer) {
      // Clear container
      mapContainer.innerHTML = '';

      // Add appropriate map canvas
      const isOpenFrontier = this.currentGameMode === GameMode.OPEN_FRONTIER;
      console.log(`🗺️ Showing respawn map for mode: ${this.currentGameMode}, isOpenFrontier: ${isOpenFrontier}`);

      const activeMap = isOpenFrontier ? this.openFrontierRespawnMap : this.respawnMapView;
      const mapCanvas = activeMap.getCanvas();

      console.log(`🗺️ Using map: ${isOpenFrontier ? 'OpenFrontierRespawnMap' : 'RespawnMapView'}`);

      // Set canvas style
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

      // Clear previous selection and update map
      activeMap.clearSelection();
      activeMap.updateSpawnableZones();
      activeMap.render();

      // Reset view for Open Frontier map
      if (isOpenFrontier) {
        this.openFrontierRespawnMap.resetView();
      }
    }

    this.selectedSpawnPoint = undefined;

    // Reset selected spawn info
    const nameElement = document.getElementById('selected-spawn-name');
    const statusElement = document.getElementById('selected-spawn-status');
    if (nameElement) nameElement.textContent = 'NONE';
    if (statusElement) statusElement.textContent = 'Select a spawn point on the map';

    // Update buttons and timer
    this.disableSpawnButtons();
    this.updateTimerDisplay();

    // Start updating the UI periodically to show zone status changes
    const updateInterval = setInterval(() => {
      if (!this.isRespawnUIVisible) {
        clearInterval(updateInterval);
        return;
      }
      this.respawnMapView.updateSpawnableZones();
      this.respawnMapView.render();
    }, 1000);
  }

  private updateAvailableSpawnPoints(): void {
    if (!this.zoneManager) {
      this.availableSpawnPoints = [{
        id: 'default',
        name: 'Base',
        position: new THREE.Vector3(0, 5, -50),
        safe: true
      }];
      return;
    }

    const canSpawnAtZones = this.gameModeManager?.canPlayerSpawnAtZones() ?? false;
    const zones = this.zoneManager.getAllZones();

    this.availableSpawnPoints = zones
      .filter(z => {
        // Can only spawn at US-owned bases (not OPFOR bases)
        if (z.isHomeBase && z.owner === Faction.US) return true;
        // Can spawn at fully captured zones if game mode allows (must be US controlled, not contested or OPFOR)
        if (canSpawnAtZones && !z.isHomeBase && z.state === ZoneState.US_CONTROLLED) return true;
        return false;
      })
      .map(z => ({
        id: z.id,
        name: z.name,
        position: z.position.clone(),
        safe: true
      }));
  }

  private updateSpawnPointDisplay(): void {
    // This method is no longer needed as the map is handled by RespawnMapView
    // Keep empty for compatibility
  }

  private selectSpawnPointOnMap(zoneId: string, zoneName: string): void {
    this.selectedSpawnPoint = zoneId;

    // Update selected spawn info
    const nameElement = document.getElementById('selected-spawn-name');
    const statusElement = document.getElementById('selected-spawn-status');

    if (nameElement) nameElement.textContent = zoneName;
    if (statusElement) statusElement.textContent = 'Ready to deploy';

    // Enable respawn button if timer is done
    const respawnButton = document.getElementById('respawn-button') as HTMLButtonElement;
    if (respawnButton && this.respawnTimer <= 0) {
      respawnButton.disabled = false;
      respawnButton.style.opacity = '1';
      respawnButton.style.cursor = 'pointer';
    }
  }

  private confirmRespawn(): void {
    if (!this.selectedSpawnPoint) return;

    const spawnPoint = this.availableSpawnPoints.find(p => p.id === this.selectedSpawnPoint);
    if (!spawnPoint) return;

    console.log(`🎯 Deploying at ${spawnPoint.name}`);
    this.hideRespawnUI();

    // Add slight randomization to avoid spawn camping
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      2,
      (Math.random() - 0.5) * 10
    );
    const finalPosition = spawnPoint.position.clone().add(offset);

    this.respawn(finalPosition);
  }


  private hideRespawnUI(): void {
    this.isRespawnUIVisible = false;
    if (this.respawnUIContainer) {
      this.respawnUIContainer.style.display = 'none';
    }
    this.selectedSpawnPoint = undefined;
    this.respawnMapView.clearSelection();
  }

  private updateTimerDisplay(): void {
    const timerElement = document.getElementById('respawn-timer');
    const respawnButton = document.getElementById('respawn-button') as HTMLButtonElement;

    if (timerElement) {
      if (this.respawnTimer > 0) {
        timerElement.textContent = `Deployment available in ${Math.ceil(this.respawnTimer)}s`;
        timerElement.style.color = '#ff6600';
      } else {
        timerElement.textContent = 'Ready for deployment';
        timerElement.style.color = '#00ff00';
      }
    }

    // Update button state
    if (respawnButton) {
      if (this.respawnTimer > 0 || !this.selectedSpawnPoint) {
        respawnButton.disabled = true;
        respawnButton.style.opacity = '0.5';
        respawnButton.style.cursor = 'not-allowed';
      } else {
        respawnButton.disabled = false;
        respawnButton.style.opacity = '1';
        respawnButton.style.cursor = 'pointer';
      }
    }
  }

  private disableSpawnButtons(): void {
    const respawnButton = document.getElementById('respawn-button') as HTMLButtonElement;
    if (respawnButton) {
      respawnButton.disabled = true;
      respawnButton.style.opacity = '0.5';
      respawnButton.style.cursor = 'not-allowed';
    }
  }

  private enableSpawnButtons(): void {
    const respawnButton = document.getElementById('respawn-button') as HTMLButtonElement;
    if (respawnButton && this.selectedSpawnPoint) {
      respawnButton.disabled = false;
      respawnButton.style.opacity = '1';
      respawnButton.style.cursor = 'pointer';
    }
    this.updateTimerDisplay();
  }
}