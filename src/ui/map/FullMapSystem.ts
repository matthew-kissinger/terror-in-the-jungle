import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction, isBlufor } from '../../systems/combat/types';
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
import type { HydrologyChannelPolyline } from '../../systems/terrain/hydrology/HydrologyBake';
import type { IVehicle } from '../../systems/vehicle/IVehicle';

// Reusable scratch vector to avoid per-frame allocations
const _v1 = new THREE.Vector3();

/**
 * Drivable vehicle marker rendered on both the minimap and the full
 * map. Defined locally here for now; the sibling minimap task may
 * land its own copy. If both land independently a small follow-up
 * will move this to a shared module.
 */
export type VehicleMarker = {
  worldPos: THREE.Vector3;
  category: 'ground' | 'watercraft' | 'emplacement';
  faction: Faction;
  vehicleType: string;
};

export interface FullMapVehicleSource {
  getVehiclesByCategory(category: 'ground' | 'watercraft' | 'emplacement'): readonly IVehicle[];
}

const VEHICLE_MARKER_CATEGORIES: ReadonlyArray<'ground' | 'watercraft' | 'emplacement'> = [
  'ground',
  'watercraft',
  'emplacement',
];

export class FullMapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneQuery?: IZoneQuery;
  private combatantSystem?: CombatantSystem;
  private gameModeManager?: GameModeManager;
  private warSimulator?: WarSimulator;
  private terrainRuntime?: ITerrainRuntime;
  private helipadMarkers: HelipadMarker[] = [];
  private vehicleMarkers: VehicleMarker[] = [];
  private vehicleSource?: FullMapVehicleSource;
  private terrainFlowPaths: TerrainFlowPath[] = [];
  private hydrologyChannels: HydrologyChannelPolyline[] = [];
  private terrainBackdrop: HTMLCanvasElement | null = null;
  private terrainBackdropWorldSize = 0;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;
  private mapContainer: HTMLDivElement;

  // Mobile toggle button
  private mapToggleButton: HTMLDivElement | null = null;
  private mapCloseButton: HTMLButtonElement | null = null;

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
  private visibilityListeners = new Set<(visible: boolean) => void>();

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
      this.mapCloseButton = document.createElement('button');
      this.mapCloseButton.type = 'button';
      this.mapCloseButton.className = 'map-close-button';
      this.mapCloseButton.textContent = '✕';
      this.mapCloseButton.setAttribute('aria-label', 'Close map');
      this.mapCloseButton.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.inputHandler.toggle();
      }, { passive: false });
      this.mapContainer.appendChild(this.mapCloseButton);
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

    if (this.vehicleSource) {
      this.refreshVehicleMarkers(this.vehicleSource);
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

  toggleVisibility(): void {
    this.inputHandler.toggle();
  }

  onVisibilityChange(listener: (visible: boolean) => void): () => void {
    this.visibilityListeners.add(listener);
    listener(this.isVisible);
    return () => this.visibilityListeners.delete(listener);
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
    this.emitVisibility();
  }

  private autoFitView(): void {
    if (this.worldSize > 5000) {
      // Very large worlds must open as an overview. The previous player-
      // centered auto-zoom made A Shau open at ~13x, hiding rivers, boats,
      // and strategic context and making zoom-out painful on PC/mobile.
      this.inputHandler.setZoomLevel(1.0);
      this.inputHandler.resetPan();
    } else if (this.worldSize > BASE_WORLD_SIZE) {
      // Medium worlds (Open Frontier): fit entire world
      const baseScale = MAP_SIZE / this.worldSize;
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
    this.emitVisibility();
  }

  private render(): void {
    const ctx = this.mapContext;
    const size = MAP_SIZE;
    const zoomLevel = this.inputHandler.getZoomLevel();
    const pan = this.inputHandler.getPanOffset();

    // Clear canvas with manila topo background (Field Journal)
    ctx.fillStyle = '#cdba8e';
    ctx.fillRect(0, 0, size, size);

    // Apply zoom + pan transformation
    ctx.save();
    ctx.translate(size / 2 + pan.x, size / 2 + pan.y);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-size / 2, -size / 2);

    this.drawTerrainBackdrop(ctx);
    this.drawGrid(ctx);
    this.drawTerrainFlowPaths(ctx);
    this.drawHydrologyChannels(ctx);

    // Draw zones
    if (this.zoneQuery) {
      const zones = this.zoneQuery.getAllZones();
      zones.forEach(zone => this.drawZone(ctx, zone));
    }

    // Draw strategic agents (non-materialized, dimmer)
    this.drawStrategicAgents(ctx);

    // Draw helipad markers
    this.drawHelipadMarkers(ctx);

    // Draw drivable vehicle markers (above combatant dots, below player marker)
    this.drawVehicleMarkers(ctx);

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

  private emitVisibility(): void {
    for (const listener of this.visibilityListeners) {
      listener(this.isVisible);
    }
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
        // Sepia shaded relief on parchment: low ground = light, high ground +
        // steep ridges = darker bistre. Keeps the map within the manila family.
        const red = Math.round(206 - normalized * 60 - slope * 34);
        const green = Math.round(186 - normalized * 70 - slope * 30);
        const blue = Math.round(140 - normalized * 66 - slope * 24);
        ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.85)`;
        ctx.fillRect(col * cellSize, row * cellSize, cellSize + 1, cellSize + 1);

        const contourBand = Math.floor(height / contourStep);
        const eastBand = Math.floor(east / contourStep);
        const southBand = Math.floor(south / contourStep);
        if (contourBand !== eastBand || contourBand !== southBand) {
          ctx.fillStyle = 'rgba(74, 56, 30, 0.22)';
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

  private drawHydrologyChannels(ctx: CanvasRenderingContext2D): void {
    if (this.hydrologyChannels.length === 0) {
      return;
    }

    const scale = MAP_SIZE / this.worldSize;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const maxAccumulation = Math.max(
      1,
      ...this.hydrologyChannels.map(channel => channel.maxAccumulationCells),
    );

    for (const channel of this.hydrologyChannels) {
      if (channel.points.length < 2) continue;
      const t = Math.min(1, Math.max(0, channel.maxAccumulationCells / maxAccumulation));
      const width = Math.max(2.5, (8 + 18 * t) * scale);

      ctx.strokeStyle = 'rgba(38, 60, 74, 0.85)';
      ctx.lineWidth = width + Math.max(2, 1.2 / this.inputHandler.getZoomLevel());
      this.strokeHydrologyChannel(ctx, channel);

      ctx.strokeStyle = 'rgba(82, 120, 140, 0.95)';
      ctx.lineWidth = Math.max(1.25, width * 0.55);
      this.strokeHydrologyChannel(ctx, channel);
    }

    ctx.restore();
  }

  private strokeHydrologyChannel(
    ctx: CanvasRenderingContext2D,
    channel: HydrologyChannelPolyline,
  ): void {
    const scale = MAP_SIZE / this.worldSize;
    ctx.beginPath();
    for (let i = 0; i < channel.points.length; i++) {
      const point = channel.points[i];
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

    // Zone name on a small parchment chip so it stays legible over the sepia
    // shaded-relief backdrop.
    const fontSize = Math.max(10, 12 / Math.sqrt(zoomLevel));
    ctx.font = `bold ${fontSize}px "Courier Prime", monospace`;
    ctx.textAlign = 'center';
    const label = zone.name;
    const labelWidth = ctx.measureText(label).width;
    const labelPad = 4;
    ctx.fillStyle = 'rgba(231, 217, 186, 0.85)';
    ctx.fillRect(
      x - labelWidth / 2 - labelPad,
      y - radius - 8 - fontSize,
      labelWidth + labelPad * 2,
      fontSize + 4,
    );
    ctx.fillStyle = 'rgba(43, 38, 32, 0.92)';
    ctx.fillText(label, x, y - radius - 8);
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
        ? 'rgba(125, 154, 90, 0.95)'
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
        ? `rgba(79, 107, 58, ${alpha})`
        : `rgba(158, 59, 46, ${alpha})`;
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
  setZoneQuery(query: IZoneQuery): void {
    this.zoneQuery = query;
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

  setHydrologyChannels(channels: readonly HydrologyChannelPolyline[] | null): void {
    this.hydrologyChannels = channels ? channels.slice() : [];
  }

  setHelipadMarkers(markers: HelipadMarker[]): void {
    this.helipadMarkers = markers;
  }

  setVehicleMarkers(markers: VehicleMarker[]): void {
    this.vehicleMarkers = markers;
  }

  setVehicleManager(source: FullMapVehicleSource | undefined): void {
    this.vehicleSource = source;
    if (!source) {
      this.vehicleMarkers.length = 0;
    }
  }

  private refreshVehicleMarkers(source: FullMapVehicleSource): void {
    this.vehicleMarkers.length = 0;
    for (const category of VEHICLE_MARKER_CATEGORIES) {
      const vehicles = source.getVehiclesByCategory(category);
      for (const vehicle of vehicles) {
        if (vehicle.isDestroyed()) continue;
        this.vehicleMarkers.push({
          worldPos: vehicle.getPosition().clone(),
          category,
          faction: vehicle.faction,
          vehicleType: vehicle.vehicleId,
        });
      }
    }
  }

  private drawCommandMarker(ctx: CanvasRenderingContext2D): void {
    if (!this.commandPosition) return;

    const scale = MAP_SIZE / this.worldSize;
    const playerX = (this.worldSize / 2 - this.playerPosition.x) * scale;
    const playerY = (this.worldSize / 2 - this.playerPosition.z) * scale;
    const x = (this.worldSize / 2 - this.commandPosition.x) * scale;
    const y = (this.worldSize / 2 - this.commandPosition.z) * scale;

    ctx.strokeStyle = 'rgba(125, 154, 90, 0.4)';
    ctx.lineWidth = Math.max(1.5, 0.8 / this.inputHandler.getZoomLevel());
    ctx.beginPath();
    ctx.moveTo(playerX, playerY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 154, 90, 0.95)';
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
    ctx.fillStyle = 'rgba(58, 79, 42, 0.95)';
    ctx.font = `bold ${Math.max(10, 12 / Math.sqrt(this.inputHandler.getZoomLevel()))}px "Courier Prime", monospace`;
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
      ctx.fillStyle = 'rgba(79, 107, 58, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y, iconSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(79, 107, 58, 0.9)';
      ctx.lineWidth = Math.max(1.5, 1 / zoomLevel);
      ctx.stroke();

      // H letter
      const fontSize = Math.max(10, 12 / Math.sqrt(zoomLevel));
      ctx.fillStyle = 'rgba(43, 38, 32, 0.9)';
      ctx.font = `bold ${fontSize}px "Courier Prime", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('H', x, y);
    }
  }

  private drawVehicleMarkers(ctx: CanvasRenderingContext2D): void {
    if (this.vehicleMarkers.length === 0) return;

    const scale = MAP_SIZE / this.worldSize;
    const zoomLevel = this.inputHandler.getZoomLevel();
    const iconSize = Math.max(8, 10 / zoomLevel);
    const strokeWidth = Math.max(1.25, 0.9 / zoomLevel);

    for (const marker of this.vehicleMarkers) {
      // Same flipped-axis coordinate system as zones/combatants/helipads
      const x = (this.worldSize / 2 - marker.worldPos.x) * scale;
      const y = (this.worldSize / 2 - marker.worldPos.z) * scale;

      const factionFill = isBlufor(marker.faction)
        ? 'rgba(79, 107, 58, 0.5)'
        : 'rgba(158, 59, 46, 0.5)';
      const factionStroke = 'rgba(43, 38, 32, 0.85)';

      ctx.fillStyle = factionFill;
      ctx.strokeStyle = factionStroke;
      ctx.lineWidth = strokeWidth;

      this.drawVehicleCategoryIcon(ctx, marker.category, x, y, iconSize);
    }
  }

  /**
   * Category icon palette:
   *   ground       — filled square (jeep / tank silhouette stand-in)
   *   watercraft   — filled diamond (boat hull stand-in)
   *   emplacement  — X cross (matches the "static gun" mental model)
   *
   * Stroke + fill are pre-set by the caller (faction-aware coloring).
   */
  private drawVehicleCategoryIcon(
    ctx: CanvasRenderingContext2D,
    category: 'ground' | 'watercraft' | 'emplacement',
    x: number,
    y: number,
    iconSize: number,
  ): void {
    if (category === 'ground') {
      const half = iconSize;
      ctx.beginPath();
      ctx.rect(x - half, y - half, half * 2, half * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }

    if (category === 'watercraft') {
      const half = iconSize * 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y - half);
      ctx.lineTo(x + half, y);
      ctx.lineTo(x, y + half);
      ctx.lineTo(x - half, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }

    // emplacement → X cross with a small filled centre disc so it stays
    // legible against busy terrain backdrops.
    const arm = iconSize;
    ctx.beginPath();
    ctx.arc(x, y, arm * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - arm, y - arm);
    ctx.lineTo(x + arm, y + arm);
    ctx.moveTo(x + arm, y - arm);
    ctx.lineTo(x - arm, y + arm);
    ctx.stroke();
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
