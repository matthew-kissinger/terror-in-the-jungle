import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
import { GameModeManager } from '../../systems/world/GameModeManager';

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
  private readonly MAP_SIZE = 800;
  private worldSize = 3200; // Will be updated based on game mode
  private isVisible = false;
  private readonly BASE_WORLD_SIZE = 400; // Zone Control world size as baseline for scaling

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerRotation = 0;

  // Controls
  private zoomLevel = 1;
  private defaultZoomLevel = 1; // Will be set based on game mode
  private readonly MIN_ZOOM = 0.5;
  private readonly MAX_ZOOM = 8; // Increased max zoom for Open Frontier

  private readonly MAP_STYLES = `
    .full-map-container {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      z-index: 200;
    }

    .full-map-container.visible {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .map-content {
      position: relative;
      width: 800px;
      height: 800px;
      background: rgba(20, 20, 25, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    }

    .map-canvas {
      width: 100%;
      height: 100%;
      border-radius: 10px;
    }

    .map-header {
      position: absolute;
      top: -50px;
      left: 0;
      right: 0;
      text-align: center;
      color: rgba(255, 255, 255, 0.9);
      font-size: 24px;
      font-weight: bold;
      font-family: 'Courier New', monospace;
      text-transform: uppercase;
      letter-spacing: 4px;
    }

    .map-legend {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      padding: 15px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .legend-icon {
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }

    .map-controls {
      position: absolute;
      top: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .map-control-button {
      width: 40px;
      height: 40px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 20px;
      font-family: 'Courier New', monospace;
      cursor: pointer;
      transition: all 0.2s;
    }

    .map-control-button:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.4);
    }

    .map-instructions {
      position: absolute;
      bottom: 20px;
      left: 20px;
      color: rgba(255, 255, 255, 0.5);
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }

    .compass-rose {
      position: absolute;
      top: 20px;
      left: 20px;
      width: 80px;
      height: 80px;
    }

    .compass-direction {
      position: absolute;
      color: rgba(255, 255, 255, 0.8);
      font-family: 'Courier New', monospace;
      font-weight: bold;
      font-size: 16px;
    }

    .compass-n { top: 0; left: 50%; transform: translateX(-50%); }
    .compass-s { bottom: 0; left: 50%; transform: translateX(-50%); }
    .compass-e { right: 0; top: 50%; transform: translateY(-50%); }
    .compass-w { left: 0; top: 50%; transform: translateY(-50%); }
  `;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

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
    this.mapCanvas.width = this.MAP_SIZE;
    this.mapCanvas.height = this.MAP_SIZE;
    this.mapContext = this.mapCanvas.getContext('2d')!;

    // Create legend
    const legend = this.createLegend();

    // Create controls
    const controls = this.createControls();

    // Create compass
    const compass = this.createCompass();

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
    styleSheet.textContent = this.MAP_STYLES;
    document.head.appendChild(styleSheet);

    // Setup event listeners
    this.setupEventListeners();
  }

  private createLegend(): HTMLDivElement {
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = `
      <div class="legend-item">
        <div class="legend-icon" style="background: #00ff00;"></div>
        <span>You</span>
      </div>
      <div class="legend-item">
        <div class="legend-icon" style="background: #4488ff;"></div>
        <span>US Forces</span>
      </div>
      <div class="legend-item">
        <div class="legend-icon" style="background: #ff4444;"></div>
        <span>OPFOR</span>
      </div>
      <div class="legend-item">
        <div class="legend-icon" style="background: #ffff44;"></div>
        <span>Contested</span>
      </div>
      <div class="legend-item">
        <div class="legend-icon" style="background: #888888;"></div>
        <span>Neutral</span>
      </div>
    `;
    return legend;
  }

  private createControls(): HTMLDivElement {
    const controls = document.createElement('div');
    controls.className = 'map-controls';

    const zoomIn = document.createElement('button');
    zoomIn.className = 'map-control-button';
    zoomIn.textContent = '+';
    zoomIn.onclick = () => this.zoom(0.2);

    const zoomOut = document.createElement('button');
    zoomOut.className = 'map-control-button';
    zoomOut.textContent = '-';
    zoomOut.onclick = () => this.zoom(-0.2);

    const reset = document.createElement('button');
    reset.className = 'map-control-button';
    reset.textContent = '⟲';
    reset.onclick = () => { this.zoomLevel = this.defaultZoomLevel; this.render(); };

    controls.appendChild(zoomIn);
    controls.appendChild(zoomOut);
    controls.appendChild(reset);

    return controls;
  }

  private createCompass(): HTMLDivElement {
    const compass = document.createElement('div');
    compass.className = 'compass-rose';
    compass.innerHTML = `
      <div class="compass-direction compass-n">N</div>
      <div class="compass-direction compass-s">S</div>
      <div class="compass-direction compass-e">E</div>
      <div class="compass-direction compass-w">W</div>
    `;
    return compass;
  }

  private setupEventListeners(): void {
    // M key to show/hide
    window.addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (!e.repeat) {
          this.show();
        }
      } else if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'm' || e.key === 'M') {
        this.hide();
      }
    });

    // Mouse wheel zoom
    this.mapCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.zoom(delta);
    });
  }

  async init(): Promise<void> {
    console.log('🗺️ Initializing Full Map System...');
    document.body.appendChild(this.mapContainer);
    console.log('✅ Full Map System initialized');
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
    this.mapContainer.classList.add('visible');
    // Auto-fit to show all zones when opening the map
    this.autoFitView();
    this.render();
  }

  private autoFitView(): void {
    // Calculate the optimal zoom to show all zones
    // For Open Frontier (3200 world size), we want to see everything
    // For Zone Control (400 world size), default zoom is fine

    if (this.worldSize > this.BASE_WORLD_SIZE) {
      // For larger worlds, calculate zoom to fit all content with some padding
      // We want the entire world to fit in about 80% of the map canvas
      const targetViewSize = this.MAP_SIZE * 0.8;
      const requiredScale = targetViewSize / this.worldSize;

      // The base scale is MAP_SIZE / worldSize, so we need to compensate
      const baseScale = this.MAP_SIZE / this.worldSize;
      this.zoomLevel = requiredScale / baseScale;

      // Clamp to reasonable bounds
      this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoomLevel));
    } else {
      // For Zone Control, use a comfortable default that shows all zones
      this.zoomLevel = 1.0;
    }

    // Update the default zoom level for reset button
    this.defaultZoomLevel = this.zoomLevel;
  }

  private hide(): void {
    this.isVisible = false;
    this.mapContainer.classList.remove('visible');
  }

  private zoom(delta: number): void {
    // Scale zoom speed based on current zoom level for smoother control
    const scaledDelta = delta * Math.sqrt(this.zoomLevel);
    this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoomLevel + scaledDelta));
    this.render();
  }

  private render(): void {
    const ctx = this.mapContext;
    const size = this.MAP_SIZE;

    // Clear canvas
    ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
    ctx.fillRect(0, 0, size, size);

    // Apply zoom transformation
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(this.zoomLevel, this.zoomLevel);
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
    const gridSize = 50;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= this.MAP_SIZE; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.MAP_SIZE);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(this.MAP_SIZE, i);
      ctx.stroke();
    }
  }

  private drawZone(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    const scale = this.MAP_SIZE / this.worldSize;
    // Fixed north-up map with flipped axes:
    // Flip X axis: -X is right (west on right side)
    // Flip Y axis: OPFOR (+Z) at top
    const x = (this.worldSize / 2 - zone.position.x) * scale;
    const y = (this.worldSize / 2 - zone.position.z) * scale;

    // Ensure minimum zone visibility with adaptive scaling
    const baseRadius = zone.radius * scale * 2;
    const minRadius = zone.isHomeBase ? 15 : 12; // Minimum pixel radius for visibility
    const radius = Math.max(baseRadius, minRadius / this.zoomLevel);

    // Zone area
    ctx.fillStyle = this.getZoneColor(zone.state, 0.2);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Zone border
    ctx.strokeStyle = this.getZoneColor(zone.state, 0.8);
    ctx.lineWidth = Math.max(2, 1 / this.zoomLevel);
    ctx.stroke();

    // Zone icon - scale appropriately
    const iconSize = Math.max(zone.isHomeBase ? 12 : 8, zone.isHomeBase ? 16 / this.zoomLevel : 10 / this.zoomLevel);
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
    const fontSize = Math.max(10, 12 / Math.sqrt(this.zoomLevel));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(zone.name, x, y - radius - 8);
  }

  private getZoneColor(state: ZoneState, alpha: number): string {
    switch (state) {
      case ZoneState.US_CONTROLLED:
        return `rgba(68, 136, 255, ${alpha})`;
      case ZoneState.OPFOR_CONTROLLED:
        return `rgba(255, 68, 68, ${alpha})`;
      case ZoneState.CONTESTED:
        return `rgba(255, 255, 68, ${alpha})`;
      default:
        return `rgba(136, 136, 136, ${alpha})`;
    }
  }

  private drawCombatants(ctx: CanvasRenderingContext2D): void {
    if (!this.combatantSystem) return;

    const scale = this.MAP_SIZE / this.worldSize;
    const combatants = this.combatantSystem.getAllCombatants();

    combatants.forEach(combatant => {
      if (combatant.state === 'dead') return;

      // Fixed north-up map with flipped axes:
      // Flip X axis: -X is right (west on right side)
      // Flip Y axis: OPFOR (+Z) at top
      const x = (this.worldSize / 2 - combatant.position.x) * scale;
      const y = (this.worldSize / 2 - combatant.position.z) * scale;

      ctx.fillStyle = combatant.faction === Faction.US ?
        'rgba(68, 136, 255, 0.6)' : 'rgba(255, 68, 68, 0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const scale = this.MAP_SIZE / this.worldSize;
    // Fixed north-up map with flipped axes:
    // Flip X axis: -X is right (west on right side)
    // Flip Y axis: OPFOR (+Z) at top
    const x = (this.worldSize / 2 - this.playerPosition.x) * scale;
    const y = (this.worldSize / 2 - this.playerPosition.z) * scale;

    // Player position
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Player direction indicator (just the line arrow)
    this.camera.getWorldDirection(_v1);
    const lineLength = 18;
    // On the double-flipped map: -X is right, -Z is up
    const endX = x - _v1.x * lineLength; // Negative because X is flipped
    const endY = y - _v1.z * lineLength; // Negative because +Z goes down

    ctx.strokeStyle = '#00ff00';
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
    if (this.mapContainer.parentNode) {
      this.mapContainer.parentNode.removeChild(this.mapContainer);
    }
    console.log('🧹 Full Map System disposed');
  }
}