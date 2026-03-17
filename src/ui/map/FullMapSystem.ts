import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { isBlufor } from '../../systems/combat/types';
import { GameModeManager } from '../../systems/world/GameModeManager';
import { FullMapInput } from './FullMapInput';
import {
  MAP_STYLES,
  MAP_SIZE,
  BASE_WORLD_SIZE,
  ZONE_COLORS,
  COMBATANT_COLORS,
  GRID_SIZE,
  GRID_COLOR,
  GRID_LINE_WIDTH,
} from './FullMapStyles';
import { createLegend, createControls, createCompass } from './FullMapDOMHelpers';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import type { WarSimulator } from '../../systems/strategy/WarSimulator';
import type { HelipadMarker } from '../minimap/MinimapRenderer';
import type { MapIntelPolicyConfig } from '../../config/gameModeTypes';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import type { TerrainFlowPath } from '../../systems/terrain/TerrainFeatureTypes';

// Reusable scratch vector to avoid per-frame allocations
const _v1 = new THREE.Vector3();

export class FullMapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private gameModeManager?: GameModeManager;
  private warSimulator?: WarSimulator;
  private terrainRuntime?: ITerrainRuntime;
  private helipadMarkers: HelipadMarker[] = [];
  private terrainFlowPaths: TerrainFlowPath[] = [];
  private terrainBackdrop: HTMLCanvasElement | null = null;
  private terrainBackdropWorldSize = 0;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;
  private mapContainer: HTMLDivElement;

  // Mobile toggle button
  private mapToggleButton: HTMLDivElement | null = null;
  private mapCloseButton: HTMLDivElement | null = null;

  // Map settings
  private worldSize = 3200; // Will be updated based on game mode
  private isVisible = false;
  private playerSquadId?: string;
  private commandPosition?: THREE.Vector3;
  private mapIntelPolicy: MapIntelPolicyConfig = {
    tacticalRangeOverride: null,
    showStrategicAgentsOnMinimap: false,
    showStrategicAgentsOnFullMap: false,
    strategicLayer: 'none',
  };

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerRotation = 0;

  // Input handling
  private inputHandler: FullMapInput;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Initialize input handler with callbacks
    this.inputHandler = new FullMapInput({
      onShow: () => this.show(),
      onHide: () => this.hide(),
      onRender: () => this.render(),
    });

    // Create map container
    this.mapContainer = document.createElement('div');
    this.mapContainer.className = 'full-map-container';

    const mapContent = document.createElement('div');
    mapContent.className = 'map-content';

    // Create header
    const header = document.createElement('div');
    header.className = 'map-header';
    header.textContent = 'TACTICAL MAP';

    // Create canvas
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.className = 'map-canvas';
    this.mapCanvas.width = MAP_SIZE;
    this.mapCanvas.height = MAP_SIZE;
    this.mapContext = this.mapCanvas.getContext('2d')!;

    // Create legend
    const legend = createLegend();

    // Create controls
    const controls = createControls(this.inputHandler);

    // Create compass
    const compass = createCompass();

    // Create instructions
    const instructions = document.createElement('div');
    instructions.className = 'map-instructions';
    if (shouldUseTouchControls()) {
      instructions.innerHTML = `
        <strong>Drag</strong> to pan<br>
        <strong>Pinch</strong> to zoom<br>
        Tap <strong>✕</strong> to close
      `;
    } else {
      instructions.innerHTML = `
        Hold <strong>M</strong> to view map<br>
        <strong>Scroll</strong> to zoom<br>
        <strong>ESC</strong> to close
      `;
    }

    // Assemble
    mapContent.appendChild(header);
    mapContent.appendChild(this.mapCanvas);
    mapContent.appendChild(legend);
    mapContent.appendChild(controls);
    mapContent.appendChild(compass);
    mapContent.appendChild(instructions);

    // Add mobile close button inside map content
    if (shouldUseTouchControls()) {
      this.mapCloseButton = document.createElement('div');
      this.mapCloseButton.className = 'map-close-button';
      this.mapCloseButton.textContent = '✕';
      this.mapCloseButton.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.inputHandler.toggle();
      }, { passive: false });
      mapContent.appendChild(this.mapCloseButton);
    }

    this.mapContainer.appendChild(mapContent);

    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = MAP_STYLES;
    document.head.appendChild(styleSheet);

    // Setup event listeners
    this.inputHandler.setupEventListeners(this.mapCanvas);
  }

  async init(): Promise<void> {
    Logger.info('ui', 'Initializing Full Map System...');
    document.body.appendChild(this.mapContainer);

    // Map toggle button removed from mobile HUD — map is accessible via menu.

    Logger.info('ui', 'Full Map System initialized');
  }

  update(_deltaTime: number): void {
    // Update player position
    this.playerPosition.copy(this.camera.position);

    // Get camera direction for rotation
    this.camera.getWorldDirection(_v1);
    // Heading from true north (-Z), turning clockwise toward +X (east)
    this.playerRotation = Math.atan2(_v1.x, -_v1.z);

    // Update world size from game mode if needed
    if (this.gameModeManager) {
      const nextWorldSize = this.gameModeManager.getWorldSize();
      if (nextWorldSize !== this.worldSize) {
        this.worldSize = nextWorldSize;
        this.invalidateTerrainBackdrop();
      }
    }

    // Render map when visible
    if (this.isVisible) {
      this.render();
    }
  }

  /**
   * Returns whether the full map is currently visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  private show(): void {
    this.isVisible = true;
    this.inputHandler.setIsVisible(true);
    this.mapContainer.classList.add('visible');
    // Hide the mobile toggle button when map is open
    if (this.mapToggleButton) {
      this.mapToggleButton.style.display = 'none';
    }
    // Reset pan when opening
    this.inputHandler.resetPan();
    // Auto-fit to show all zones when opening the map
    this.autoFitView();
    this.render();
  }

  private autoFitView(): void {
    // Calculate the optimal zoom to show all zones at readable size.
    // Base rendering scale is MAP_SIZE / worldSize pixels per unit.
    // We want ~1 px/unit minimum so zone radii (50-100 units) are visible.

    const baseScale = MAP_SIZE / this.worldSize; // e.g. 0.038 for 21km

    if (this.worldSize > 5000) {
      // Very large worlds: zoom so 1 world-unit ~ 0.5 px (shows ~1600m across canvas)
      const targetPxPerUnit = 0.5;
      const zoomLevel = Math.max(1.0, targetPxPerUnit / baseScale);
      this.inputHandler.setZoomLevel(zoomLevel);

      // Center pan on player position
      const scale = MAP_SIZE / this.worldSize;
      const px = (this.worldSize / 2 - this.playerPosition.x) * scale;
      const py = (this.worldSize / 2 - this.playerPosition.z) * scale;
      const panX = (MAP_SIZE / 2 - px) * zoomLevel;
      const panY = (MAP_SIZE / 2 - py) * zoomLevel;
      this.inputHandler.setPanOffset(panX, panY);
    } else if (this.worldSize > BASE_WORLD_SIZE) {
      // Medium worlds (Open Frontier): fit entire world
      const targetViewSize = MAP_SIZE * 0.8;
      const requiredScale = targetViewSize / this.worldSize;
      const zoomLevel = requiredScale / baseScale;
      this.inputHandler.setZoomLevel(zoomLevel);
    } else {
      this.inputHandler.setZoomLevel(1.0);
    }

    this.inputHandler.setDefaultZoomLevel(this.inputHandler.getZoomLevel());
  }

  private hide(): void {
    this.isVisible = false;
    this.inputHandler.setIsVisible(false);
    this.mapContainer.classList.remove('visible');
    // Show the mobile toggle button when map is closed
    if (this.mapToggleButton) {
      this.mapToggleButton.style.display = 'flex';
    }
  }

  private render(): void {
    const ctx = this.mapContext;
    const size = MAP_SIZE;
    const zoomLevel = this.inputHandler.getZoomLevel();
    const pan = this.inputHandler.getPanOffset();

    // Clear canvas
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.fillRect(0, 0, size, size);

    // Apply zoom + pan transformation
    ctx.save();
    ctx.translate(size / 2 + pan.x, size / 2 + pan.y);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-size / 2, -size / 2);

    this.drawTerrainBackdrop(ctx);
    // Draw grid
    this.drawGrid(ctx);
    this.drawTerrainFlowPaths(ctx);

    // Draw zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      zones.forEach(zone => this.drawZone(ctx, zone));
    }

    // Draw strategic agents (non-materialized, dimmer)
    this.drawStrategicAgents(ctx);

    // Draw helipad markers
    this.drawHelipadMarkers(ctx);

    // Draw combatants (materialized, full brightness)
    if (this.combatantSystem) {
      this.drawCombatants(ctx);
    }

    if (this.commandPosition) {
      this.drawCommandMarker(ctx);
    }

    // Draw player
    this.drawPlayer(ctx);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = GRID_LINE_WIDTH;

    for (let i = 0; i <= MAP_SIZE; i += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, MAP_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(MAP_SIZE, i);
      ctx.stroke();
    }
  }

  private drawTerrainBackdrop(ctx: CanvasRenderingContext2D): void {
    const backdrop = this.getTerrainBackdrop();
    if (!backdrop) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(backdrop, 0, 0, MAP_SIZE, MAP_SIZE);
    ctx.restore();
  }

  private getTerrainBackdrop(): HTMLCanvasElement | null {
    if (!this.terrainRuntime) {
      return null;
    }
    if (this.terrainBackdrop && this.terrainBackdropWorldSize === this.worldSize) {
      return this.terrainBackdrop;
    }

    const canvas = document.createElement('canvas');
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const resolution = this.worldSize > 10000 ? 52 : this.worldSize > 3000 ? 68 : 84;
    const cellSize = MAP_SIZE / resolution;
    const heights: number[][] = [];
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;

    for (let row = 0; row <= resolution; row++) {
      heights[row] = [];
      for (let col = 0; col <= resolution; col++) {
        const worldX = this.sampleWorldX(col / resolution);
        const worldZ = this.sampleWorldZ(row / resolution);
        const height = this.terrainRuntime.getHeightAt(worldX, worldZ);
        heights[row][col] = height;
        if (height < minHeight) minHeight = height;
        if (height > maxHeight) maxHeight = height;
      }
    }

    const heightRange = Math.max(1, maxHeight - minHeight);
    const contourStep = chooseContourStep(heightRange);

    for (let row = 0; row < resolution; row++) {
      for (let col = 0; col < resolution; col++) {
        const height = heights[row][col];
        const east = heights[row][Math.min(col + 1, resolution)];
        const south = heights[Math.min(row + 1, resolution)][col];
        const slope = Math.min(1, Math.hypot(east - height, south - height) / 18);
        const normalized = (height - minHeight) / heightRange;
        const red = Math.round(24 + normalized * 38 + slope * 10);
        const green = Math.round(34 + normalized * 54 - slope * 4);
        const blue = Math.round(24 + normalized * 18);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.78)`;
        ctx.fillRect(col * cellSize, row * cellSize, cellSize + 1, cellSize + 1);

        const contourBand = Math.floor(height / contourStep);
        const eastBand = Math.floor(east / contourStep);
        const southBand = Math.floor(south / contourStep);
        if (contourBand !== eastBand || contourBand !== southBand) {
          ctx.fillStyle = 'rgba(220, 224, 196, 0.12)';
          ctx.fillRect(col * cellSize, row * cellSize, cellSize + 0.5, Math.max(1, cellSize * 0.15));
        }
      }
    }

    this.terrainBackdrop = canvas;
    this.terrainBackdropWorldSize = this.worldSize;
    return this.terrainBackdrop;
  }

  private drawTerrainFlowPaths(ctx: CanvasRenderingContext2D): void {
    if (this.terrainFlowPaths.length === 0) {
      return;
    }

    const scale = MAP_SIZE / this.worldSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(162, 130, 78, 0.42)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const path of this.terrainFlowPaths) {
      if (path.points.length < 2) continue;
      ctx.lineWidth = Math.max(1.5, path.width * scale * 0.34);
      ctx.beginPath();
      for (let i = 0; i < path.points.length; i++) {
        const point = path.points[i];
        const x = (this.worldSize / 2 - point.x) * scale;
        const y = (this.worldSize / 2 - point.z) * scale;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawZone(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = MAP_SIZE / this.worldSize;
    const zoomLevel = this.inputHandler.getZoomLevel();
    // Fixed north-up map with flipped axes:
    // Flip X axis: -X is right (west on right side)
    // Flip Y axis: OPFOR (+Z) at top
    const x = (this.worldSize / 2 - zone.position.x) * scale;
    const y = (this.worldSize / 2 - zone.position.z) * scale;

    // Ensure minimum zone visibility with adaptive scaling
    const baseRadius = zone.radius * scale * 2;
    const minRadius = zone.isHomeBase ? 15 : 12; // Minimum pixel radius for visibility
    const radius = Math.max(baseRadius, minRadius / zoomLevel);

    // Zone area
    ctx.fillStyle = this.getZoneColor(zone.state, 0.2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Zone border
    ctx.strokeStyle = this.getZoneColor(zone.state, 0.8);
    ctx.lineWidth = Math.max(2, 1 / zoomLevel);
    ctx.stroke();

    // Zone icon - scale appropriately
    const iconSize = Math.max(zone.isHomeBase ? 12 : 8, zone.isHomeBase ? 16 / zoomLevel : 10 / zoomLevel);
    if (zone.isHomeBase) {
      ctx.fillStyle = this.getZoneColor(zone.state, 1);
      ctx.fillRect(x - iconSize/2, y - iconSize/2, iconSize, iconSize);
    } else {
      ctx.fillStyle = this.getZoneColor(zone.state, 0.6);
      ctx.beginPath();
      ctx.arc(x, y, iconSize/2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Zone name - adjust font size for readability
    const fontSize = Math.max(10, 12 / Math.sqrt(zoomLevel));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `bold ${fontSize}px Rajdhani`;
    ctx.textAlign = 'center';
    ctx.fillText(zone.name, x, y - radius - 8);
  }

  private getZoneColor(state: ZoneState, alpha: number): string {
    let color;
    switch (state) {
      case ZoneState.BLUFOR_CONTROLLED:
        color = ZONE_COLORS.BLUFOR_CONTROLLED;
        break;
      case ZoneState.OPFOR_CONTROLLED:
        color = ZONE_COLORS.OPFOR_CONTROLLED;
        break;
      case ZoneState.CONTESTED:
        color = ZONE_COLORS.CONTESTED;
        break;
      default:
        color = ZONE_COLORS.NEUTRAL;
    }
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  }

  private drawCombatants(ctx: CanvasRenderingContext2D): void {
    if (!this.combatantSystem) return;

    const scale = MAP_SIZE / this.worldSize;
    const combatants = this.combatantSystem.getAllCombatants();

    combatants.forEach(combatant => {
      if (combatant.state === 'dead') return;

      // Fixed north-up map with flipped axes:
      // Flip X axis: -X is right (west on right side)
      // Flip Y axis: OPFOR (+Z) at top
      const x = (this.worldSize / 2 - combatant.position.x) * scale;
      const y = (this.worldSize / 2 - combatant.position.z) * scale;

      const isPlayerSquad = combatant.squadId === this.playerSquadId;
      ctx.fillStyle = isPlayerSquad
        ? 'rgba(92, 184, 92, 0.92)'
        : (isBlufor(combatant.faction) ? COMBATANT_COLORS.US : COMBATANT_COLORS.OPFOR);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawStrategicAgents(ctx: CanvasRenderingContext2D): void {
    if (this.mapIntelPolicy.showStrategicAgentsOnFullMap !== true) return;
    if (!this.warSimulator || !this.warSimulator.isEnabled()) return;

    const scale = MAP_SIZE / this.worldSize;
    const data = this.warSimulator.getAgentPositionsForMap();

    for (let i = 0; i < data.length; i += 4) {
      const faction = data[i];     // 0 = US, 1 = OPFOR
      const ax = data[i + 1];
      const az = data[i + 2];
      const tier = data[i + 3];    // 0 = materialized, 1 = simulated, 2 = strategic

      // Skip materialized - drawn by drawCombatants
      if (tier === 0) continue;

      // Flipped axes matching drawCombatants
      const x = (this.worldSize / 2 - ax) * scale;
      const y = (this.worldSize / 2 - az) * scale;

      const alpha = tier === 1 ? 0.4 : 0.2;
      ctx.fillStyle = faction === 0
        ? `rgba(91, 140, 201, ${alpha})`
        : `rgba(201, 86, 74, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const scale = MAP_SIZE / this.worldSize;
    // Fixed north-up map with flipped axes:
    // Flip X axis: -X is right (west on right side)
    // Flip Y axis: OPFOR (+Z) at top
    const x = (this.worldSize / 2 - this.playerPosition.x) * scale;
    const y = (this.worldSize / 2 - this.playerPosition.z) * scale;

    // Player position
    ctx.fillStyle = COMBATANT_COLORS.PLAYER;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Player direction indicator (just the line arrow)
    this.camera.getWorldDirection(_v1);
    const lineLength = 18;
    // On the double-flipped map: -X is right, -Z is up
    const endX = x - _v1.x * lineLength; // Negative because X is flipped
    const endY = y - _v1.z * lineLength; // Negative because +Z goes down

    ctx.strokeStyle = COMBATANT_COLORS.PLAYER;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Remove the direction cone - just keep the line indicator
  }

  // System connections
  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setWarSimulator(simulator: WarSimulator): void {
    this.warSimulator = simulator;
  }

  setTerrainRuntime(terrainRuntime: ITerrainRuntime): void {
    this.terrainRuntime = terrainRuntime;
    this.invalidateTerrainBackdrop();
  }

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
  }

  setCommandPosition(position: THREE.Vector3 | undefined): void {
    this.commandPosition = position;
  }

  setMapIntelPolicy(policy: MapIntelPolicyConfig): void {
    this.mapIntelPolicy = { ...policy };
  }

  setTerrainFlowPaths(paths: TerrainFlowPath[]): void {
    this.terrainFlowPaths = paths.slice();
  }

  setHelipadMarkers(markers: HelipadMarker[]): void {
    this.helipadMarkers = markers;
  }

  private drawCommandMarker(ctx: CanvasRenderingContext2D): void {
    if (!this.commandPosition) return;

    const scale = MAP_SIZE / this.worldSize;
    const playerX = (this.worldSize / 2 - this.playerPosition.x) * scale;
    const playerY = (this.worldSize / 2 - this.playerPosition.z) * scale;
    const x = (this.worldSize / 2 - this.commandPosition.x) * scale;
    const y = (this.worldSize / 2 - this.commandPosition.z) * scale;

    ctx.strokeStyle = 'rgba(92, 184, 92, 0.34)';
    ctx.lineWidth = Math.max(1.5, 0.8 / this.inputHandler.getZoomLevel());
    ctx.beginPath();
    ctx.moveTo(playerX, playerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(92, 184, 92, 0.92)';
    ctx.lineWidth = Math.max(2, 1 / this.inputHandler.getZoomLevel());

    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();

    const distanceMeters = Math.round(this.playerPosition.distanceTo(this.commandPosition));
    ctx.fillStyle = 'rgba(216, 236, 198, 0.92)';
    ctx.font = `bold ${Math.max(10, 12 / Math.sqrt(this.inputHandler.getZoomLevel()))}px Rajdhani`;
    ctx.textAlign = 'left';
    ctx.fillText(`${distanceMeters}m`, x + 14, y - 12);
  }

  private drawHelipadMarkers(ctx: CanvasRenderingContext2D): void {
    if (this.helipadMarkers.length === 0) return;

    const scale = MAP_SIZE / this.worldSize;
    const zoomLevel = this.inputHandler.getZoomLevel();
    const iconSize = Math.max(10, 12 / zoomLevel);

    for (const marker of this.helipadMarkers) {
      // Same flipped-axis coordinate system as zones/combatants
      const x = (this.worldSize / 2 - marker.position.x) * scale;
      const y = (this.worldSize / 2 - marker.position.z) * scale;

      // Circle background
      ctx.fillStyle = 'rgba(91, 140, 201, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y, iconSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(91, 140, 201, 0.9)';
      ctx.lineWidth = Math.max(1.5, 1 / zoomLevel);
      ctx.stroke();

      // H letter
      const fontSize = Math.max(10, 12 / Math.sqrt(zoomLevel));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = `bold ${fontSize}px Rajdhani`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', x, y);
    }
  }

  dispose(): void {
    this.inputHandler.dispose();
    if (this.mapContainer.parentNode) {
      this.mapContainer.parentNode.removeChild(this.mapContainer);
    }
    if (this.mapToggleButton && this.mapToggleButton.parentNode) {
      this.mapToggleButton.parentNode.removeChild(this.mapToggleButton);
    }
    Logger.info('ui', 'Full Map System disposed');
  }

  private invalidateTerrainBackdrop(): void {
    this.terrainBackdrop = null;
    this.terrainBackdropWorldSize = 0;
  }

  private sampleWorldX(normalizedX: number): number {
    return this.worldSize * 0.5 - normalizedX * this.worldSize;
  }

  private sampleWorldZ(normalizedZ: number): number {
    return this.worldSize * 0.5 - normalizedZ * this.worldSize;
  }
}

function chooseContourStep(heightRange: number): number {
  if (heightRange > 1000) return 100;
  if (heightRange > 500) return 50;
  if (heightRange > 200) return 25;
  if (heightRange > 80) return 10;
  return 5;
}
