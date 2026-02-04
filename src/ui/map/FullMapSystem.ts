import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
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

// Reusable scratch vector to avoid per-frame allocations
const _v1 = new THREE.Vector3();

export class FullMapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private gameModeManager?: GameModeManager;

  // Canvas elements
  private mapCanvas: HTMLCanvasElement;
  private mapContext: CanvasRenderingContext2D;
  private mapContainer: HTMLDivElement;

  // Map settings
  private worldSize = 3200; // Will be updated based on game mode
  private isVisible = false;

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
    instructions.innerHTML = `
      Hold <strong>M</strong> to view map<br>
      <strong>Scroll</strong> to zoom<br>
      <strong>ESC</strong> to close
    `;

    // Assemble
    mapContent.appendChild(header);
    mapContent.appendChild(this.mapCanvas);
    mapContent.appendChild(legend);
    mapContent.appendChild(controls);
    mapContent.appendChild(compass);
    mapContent.appendChild(instructions);
    this.mapContainer.appendChild(mapContent);

    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = MAP_STYLES;
    document.head.appendChild(styleSheet);

    // Setup event listeners
    this.inputHandler.setupEventListeners(this.mapCanvas);
  }

  async init(): Promise<void> {
    Logger.info('ui', '🗺️ Initializing Full Map System...');
    document.body.appendChild(this.mapContainer);
    Logger.info('ui', '✅ Full Map System initialized');
  }

  update(deltaTime: number): void {
    // Update player position
    this.playerPosition.copy(this.camera.position);

    // Get camera direction for rotation
    this.camera.getWorldDirection(_v1);
    // Heading from true north (-Z), turning clockwise toward +X (east)
    this.playerRotation = Math.atan2(_v1.x, -_v1.z);

    // Update world size from game mode if needed
    if (this.gameModeManager) {
      this.worldSize = this.gameModeManager.getWorldSize();
    }

    // Render map when visible
    if (this.isVisible) {
      this.render();
    }
  }

  private show(): void {
    this.isVisible = true;
    this.inputHandler.setIsVisible(true);
    this.mapContainer.classList.add('visible');
    // Auto-fit to show all zones when opening the map
    this.autoFitView();
    this.render();
  }

  private autoFitView(): void {
    // Calculate the optimal zoom to show all zones
    // For Open Frontier (3200 world size), we want to see everything
    // For Zone Control (400 world size), default zoom is fine

    if (this.worldSize > BASE_WORLD_SIZE) {
      // For larger worlds, calculate zoom to fit all content with some padding
      // We want the entire world to fit in about 80% of the map canvas
      const targetViewSize = MAP_SIZE * 0.8;
      const requiredScale = targetViewSize / this.worldSize;

      // The base scale is MAP_SIZE / worldSize, so we need to compensate
      const baseScale = MAP_SIZE / this.worldSize;
      const zoomLevel = requiredScale / baseScale;

      // Clamp to reasonable bounds and set
      this.inputHandler.setZoomLevel(zoomLevel);
    } else {
      // For Zone Control, use a comfortable default that shows all zones
      this.inputHandler.setZoomLevel(1.0);
    }

    // Update the default zoom level for reset button
    this.inputHandler.setDefaultZoomLevel(this.inputHandler.getZoomLevel());
  }

  private hide(): void {
    this.isVisible = false;
    this.inputHandler.setIsVisible(false);
    this.mapContainer.classList.remove('visible');
  }

  private render(): void {
    const ctx = this.mapContext;
    const size = MAP_SIZE;
    const zoomLevel = this.inputHandler.getZoomLevel();

    // Clear canvas
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.fillRect(0, 0, size, size);

    // Apply zoom transformation
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-size / 2, -size / 2);

    // Draw grid
    this.drawGrid(ctx);

    // Draw zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      zones.forEach(zone => this.drawZone(ctx, zone));
    }

    // Draw combatants
    if (this.combatantSystem) {
      this.drawCombatants(ctx);
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
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(zone.name, x, y - radius - 8);
  }

  private getZoneColor(state: ZoneState, alpha: number): string {
    let color;
    switch (state) {
      case ZoneState.US_CONTROLLED:
        color = ZONE_COLORS.US_CONTROLLED;
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

      ctx.fillStyle = combatant.faction === Faction.US ?
        COMBATANT_COLORS.US : COMBATANT_COLORS.OPFOR;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
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

  setGameModeManager(manager: GameModeManager): void {
    this.gameModeManager = manager;
  }

  dispose(): void {
    this.inputHandler.dispose();
    if (this.mapContainer.parentNode) {
      this.mapContainer.parentNode.removeChild(this.mapContainer);
    }
    Logger.info('ui', '🧹 Full Map System disposed');
  }
}