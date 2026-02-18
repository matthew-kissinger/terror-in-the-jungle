import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { createMinimapDOM } from './MinimapDOMBuilder';
import { DEFAULT_WORLD_SIZE, MINIMAP_SIZE } from './MinimapStyles';
import { renderMinimap } from './MinimapRenderer';
import { isMobileViewport } from '../../utils/DeviceDetector';
import type { WarSimulator } from '../../systems/strategy/WarSimulator';

// Reusable scratch vectors to avoid per-frame allocations
const _v1 = new THREE.Vector3();

export class MinimapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private warSimulator?: WarSimulator;
  private playerSquadId?: string;
  private commandPosition?: THREE.Vector3;

  // Canvas elements
  private minimapCanvas: HTMLCanvasElement;
  private minimapContext: CanvasRenderingContext2D;
  private minimapContainer: HTMLDivElement;

  // Minimap settings
  private MINIMAP_SIZE = MINIMAP_SIZE;
  private WORLD_SIZE = DEFAULT_WORLD_SIZE;
  private readonly UPDATE_INTERVAL = 100;
  private lastUpdateTime = 0;

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerRotation = 0;

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Adjust size for mobile viewports
    if (isMobileViewport()) {
      this.MINIMAP_SIZE = 120;
    }

    const dom = createMinimapDOM(this.MINIMAP_SIZE);
    this.minimapCanvas = dom.canvas;
    this.minimapContext = dom.context;
    this.minimapContainer = dom.container;
  }

  async init(): Promise<void> {
    Logger.info('minimap', ' Initializing Minimap System...');

    // Add to DOM
    document.body.appendChild(this.minimapContainer);

    Logger.info('minimap', ' Minimap System initialized');
  }

  update(_deltaTime: number): void {
    // Update player position and rotation
    this.playerPosition.copy(this.camera.position);

    // Get camera direction for rotation
    this.camera.getWorldDirection(_v1);
    // Yaw measured from true north (-Z) turning clockwise toward +X (east)
    this.playerRotation = Math.atan2(_v1.x, -_v1.z);

    // Throttle updates
    const now = Date.now();
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) return;
    this.lastUpdateTime = now;

    this.renderMinimap();
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

  // Game mode configuration
  setWorldScale(scale: number): void {
    this.WORLD_SIZE = scale;
    Logger.info('minimap', ` Minimap world scale set to ${scale}`);
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    Logger.info('minimap', ` Minimap tracking player squad: ${squadId}`);
  }

  setCommandPosition(position: THREE.Vector3 | undefined): void {
    this.commandPosition = position;
  }

  private renderMinimap(): void {
    renderMinimap({
      ctx: this.minimapContext,
      size: this.MINIMAP_SIZE,
      worldSize: this.WORLD_SIZE,
      playerPosition: this.playerPosition,
      playerRotation: this.playerRotation,
      camera: this.camera,
      zoneManager: this.zoneManager,
      combatantSystem: this.combatantSystem,
      warSimulator: this.warSimulator,
      playerSquadId: this.playerSquadId,
      commandPosition: this.commandPosition
    });
  }

  dispose(): void {
    if (this.minimapContainer.parentNode) {
      this.minimapContainer.parentNode.removeChild(this.minimapContainer);
    }

    Logger.info('minimap', 'Minimap System disposed');
  }
}
