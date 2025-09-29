import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager, CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';

export class MinimapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private playerSquadId?: string;
  private commandPosition?: THREE.Vector3;

  // Canvas elements
  private minimapCanvas: HTMLCanvasElement;
  private minimapContext: CanvasRenderingContext2D;

  // Minimap settings
  private readonly MINIMAP_SIZE = 200;
  private WORLD_SIZE = 300;
  private readonly UPDATE_INTERVAL = 100;
  private lastUpdateTime = 0;

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerRotation = 0;

  private readonly MINIMAP_STYLES = `
    .minimap-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 200px;
      height: 200px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      overflow: hidden;
      background: rgba(10, 10, 14, 0.28);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 120;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
    }

    .minimap-canvas {
      width: 100%;
      height: 100%;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
    }

    .minimap-legend {
      position: absolute;
      bottom: 6px;
      left: 6px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 9px;
      font-family: 'Courier New', monospace;
      pointer-events: none;
    }
  `;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Create minimap container
    const container = document.createElement('div');
    container.className = 'minimap-container';

    // Create canvas
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'minimap-canvas';
    this.minimapCanvas.width = this.MINIMAP_SIZE;
    this.minimapCanvas.height = this.MINIMAP_SIZE;
    this.minimapContext = this.minimapCanvas.getContext('2d')!;

    // Add legend
    const legend = document.createElement('div');
    legend.className = 'minimap-legend';
    legend.innerHTML = `
      <div style="display: flex; align-items: center; gap: 3px;">
        <div style="width: 8px; height: 8px; background: #00ff66; border-radius: 50%;"></div>
        <span>SQUAD</span>
      </div>
      <div style="display: flex; align-items: center; gap: 3px;">
        <div style="width: 8px; height: 8px; background: #4488ff; border-radius: 50%;"></div>
        <span>US</span>
      </div>
      <div style="display: flex; align-items: center; gap: 3px;">
        <div style="width: 8px; height: 8px; background: #ff4444; border-radius: 50%;"></div>
        <span>OPFOR</span>
      </div>
    `;

    container.appendChild(this.minimapCanvas);
    container.appendChild(legend);

    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = this.MINIMAP_STYLES;
    document.head.appendChild(styleSheet);

    // Store container reference for disposal
    (this.minimapCanvas as any).containerElement = container;
  }

  async init(): Promise<void> {
    console.log('🗺️ Initializing Minimap System...');

    // Add to DOM
    const container = (this.minimapCanvas as any).containerElement;
    if (container) {
      document.body.appendChild(container);
    }

    console.log('✅ Minimap System initialized');
  }

  update(deltaTime: number): void {
    // Update player position and rotation
    this.playerPosition.copy(this.camera.position);

    // Get camera direction for rotation
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);
    // Yaw measured from true north (-Z) turning clockwise toward +X (east)
    this.playerRotation = Math.atan2(cameraDir.x, -cameraDir.z);

    // Throttle updates
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) return;
    this.lastUpdateTime = now;

    this.renderMinimap();
  }

  private renderMinimap(): void {
    const ctx = this.minimapContext;
    const size = this.MINIMAP_SIZE;
    const halfSize = size / 2;

    // Clear canvas with dark background
    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    ctx.fillRect(0, 0, size, size);

    // Compass is now a DOM element, no need to draw on canvas

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let i = 0; i <= size; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Draw zones
    if (this.zoneManager) {
      const zones = this.zoneManager.getAllZones();
      zones.forEach(zone => {
        this.drawZone(ctx, zone);
      });
    }

    // Draw combatants on minimap
    this.drawCombatantIndicators(ctx);

    // Draw command marker if exists
    if (this.commandPosition) {
      this.drawCommandMarker(ctx);
    }

    // Draw player (always in center)
    this.drawPlayer(ctx);

    // Draw view cone
    this.drawViewCone(ctx);
  }

  private drawZone(ctx: CanvasRenderingContext2D, zone: CaptureZone): void {
    // Convert world position to minimap position
    const relativePos = new THREE.Vector3()
      .subVectors(zone.position, this.playerPosition);

    // Rotate world -> player-local by -heading so forward points up
    const cos = Math.cos(this.playerRotation);
    const sin = Math.sin(this.playerRotation);
    const rotatedX = relativePos.x * cos + relativePos.z * sin;
    const rotatedZ = -relativePos.x * sin + relativePos.z * cos;

    // Scale to minimap
    const scale = this.MINIMAP_SIZE / this.WORLD_SIZE;
    const x = this.MINIMAP_SIZE / 2 + rotatedX * scale;
    const y = this.MINIMAP_SIZE / 2 + rotatedZ * scale;

    // Skip if outside minimap bounds
    if (x < -20 || x > this.MINIMAP_SIZE + 20 || y < -20 || y > this.MINIMAP_SIZE + 20) return;

    // Draw zone circle
    const zoneRadius = zone.radius * scale;

    // Zone fill color based on state
    switch (zone.state) {
      case ZoneState.US_CONTROLLED:
        ctx.fillStyle = 'rgba(68, 136, 255, 0.3)';
        ctx.strokeStyle = '#4488ff';
        break;
      case ZoneState.OPFOR_CONTROLLED:
        ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
        ctx.strokeStyle = '#ff4444';
        break;
      case ZoneState.CONTESTED:
        ctx.fillStyle = 'rgba(255, 255, 68, 0.3)';
        ctx.strokeStyle = '#ffff44';
        break;
      default:
        ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
        ctx.strokeStyle = '#888888';
    }

    // Draw zone area
    ctx.beginPath();
    ctx.arc(x, y, zoneRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw zone flag/marker
    if (zone.isHomeBase) {
      // Draw home base as square
      ctx.fillStyle = zone.state === ZoneState.US_CONTROLLED ? '#4488ff' : '#ff4444';
      ctx.fillRect(x - 6, y - 6, 12, 12);
    } else {
      // Draw capture point as flag
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y - 4);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    // Draw zone name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '10px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(zone.name, x, y + zoneRadius + 12);

    // Draw capture progress if contested
    if (zone.state === ZoneState.CONTESTED) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(x - 15, y + zoneRadius + 15, 30, 3);
      ctx.fillStyle = '#ffff44';
      ctx.fillRect(x - 15, y + zoneRadius + 15, 30 * (zone.captureProgress / 100), 3);
    }
  }

  private drawCombatantIndicators(ctx: CanvasRenderingContext2D): void {
    if (!this.combatantSystem) return;

    // Get all combatants and draw their positions
    const combatants = this.combatantSystem.getAllCombatants();
    const scale = this.MINIMAP_SIZE / this.WORLD_SIZE;

    combatants.forEach(combatant => {
      if (combatant.state === 'dead') return;

      // Convert world position to minimap position relative to player
      const relativePos = new THREE.Vector3()
        .subVectors(combatant.position, this.playerPosition);

      // Rotate world -> player-local by -heading so forward points up
      const cos = Math.cos(this.playerRotation);
      const sin = Math.sin(this.playerRotation);
      const rotatedX = relativePos.x * cos + relativePos.z * sin;
      const rotatedZ = -relativePos.x * sin + relativePos.z * cos;

      // Scale to minimap
      const x = this.MINIMAP_SIZE / 2 + rotatedX * scale;
      const y = this.MINIMAP_SIZE / 2 + rotatedZ * scale;

      // Skip if outside minimap bounds
      if (x < 0 || x > this.MINIMAP_SIZE || y < 0 || y > this.MINIMAP_SIZE) return;

      // Draw combatant dot with appropriate color
      const isPlayerSquad = combatant.squadId === this.playerSquadId && combatant.faction === Faction.US;
      if (isPlayerSquad) {
        ctx.fillStyle = 'rgba(0, 255, 102, 0.8)';
      } else {
        ctx.fillStyle = combatant.faction === Faction.US ? 'rgba(68, 136, 255, 0.6)' : 'rgba(255, 68, 68, 0.6)';
      }
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const centerX = this.MINIMAP_SIZE / 2;
    const centerY = this.MINIMAP_SIZE / 2;

    // Player dot
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Player outline
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawViewCone(ctx: CanvasRenderingContext2D): void {
    const centerX = this.MINIMAP_SIZE / 2;
    const centerY = this.MINIMAP_SIZE / 2;

    // Calculate player facing direction in world space (not rotated minimap space)
    const cameraDir = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDir);

    // Use the same heading angle used elsewhere
    // In rotated minimap space, forward is up: use 0 angle
    const angle = 0;

    // Draw view direction line pointing in actual facing direction
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);

    const lineLength = 25;
    const endX = centerX + Math.sin(angle) * lineLength;
    const endY = centerY - Math.cos(angle) * lineLength;
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw FOV cone as a filled wedge
    const fovAngle = Math.PI / 4; // 45 degrees each side
    const coneLength = 30;

    const leftAngle = angle - fovAngle;
    const rightAngle = angle + fovAngle;
    const leftX = centerX + Math.sin(leftAngle) * coneLength;
    const leftY = centerY - Math.cos(leftAngle) * coneLength;
    const rightX = centerX + Math.sin(rightAngle) * coneLength;
    const rightY = centerY - Math.cos(rightAngle) * coneLength;

    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
  }

  // System connections

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  // Game mode configuration
  setWorldScale(scale: number): void {
    this.WORLD_SIZE = scale;
    console.log(`🎮 Minimap world scale set to ${scale}`);
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    console.log(`🎮 Minimap tracking player squad: ${squadId}`);
  }

  setCommandPosition(position: THREE.Vector3 | undefined): void {
    this.commandPosition = position;
  }

  private drawCommandMarker(ctx: CanvasRenderingContext2D): void {
    if (!this.commandPosition) return;

    // Convert world position to minimap position
    const relativePos = new THREE.Vector3()
      .subVectors(this.commandPosition, this.playerPosition);

    // Rotate world -> player-local
    const cos = Math.cos(this.playerRotation);
    const sin = Math.sin(this.playerRotation);
    const rotatedX = relativePos.x * cos + relativePos.z * sin;
    const rotatedZ = -relativePos.x * sin + relativePos.z * cos;

    // Scale to minimap
    const scale = this.MINIMAP_SIZE / this.WORLD_SIZE;
    const x = this.MINIMAP_SIZE / 2 + rotatedX * scale;
    const y = this.MINIMAP_SIZE / 2 + rotatedZ * scale;

    // Skip if outside minimap bounds
    if (x < 0 || x > this.MINIMAP_SIZE || y < 0 || y > this.MINIMAP_SIZE) return;

    // Draw crosshair marker
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 2;

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.stroke();

    // Circle around it
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  dispose(): void {
    const container = (this.minimapCanvas as any).containerElement;
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }

    console.log('🧹 Minimap System disposed');
  }
}