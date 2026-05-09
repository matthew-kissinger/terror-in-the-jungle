import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { createMinimapDOM } from './MinimapDOMBuilder';
import { DEFAULT_WORLD_SIZE, MINIMAP_SIZE } from './MinimapStyles';
import { renderMinimap, HelipadMarker } from './MinimapRenderer';
import { isMobileViewport } from '../../utils/DeviceDetector';
import type { WarSimulator } from '../../systems/strategy/WarSimulator';
import type { MapIntelPolicyConfig } from '../../config/gameModeTypes';
import type { TerrainFlowPath } from '../../systems/terrain/TerrainFeatureTypes';

// Reusable scratch vectors to avoid per-frame allocations
const _v1 = new THREE.Vector3();

export class MinimapSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneQuery?: IZoneQuery;
  private combatantSystem?: CombatantSystem;
  private warSimulator?: WarSimulator;
  private playerSquadId?: string;
  private commandPosition?: THREE.Vector3;
  private helipadMarkers: HelipadMarker[] = [];
  private terrainFlowPaths: TerrainFlowPath[] = [];
  private mapIntelPolicy: MapIntelPolicyConfig = {
    tacticalRangeOverride: null,
    showStrategicAgentsOnMinimap: false,
    showStrategicAgentsOnFullMap: false,
    strategicLayer: 'none',
  };

  // Canvas elements
  private minimapCanvas: HTMLCanvasElement;
  private minimapContext: CanvasRenderingContext2D;
  private minimapContainer: HTMLDivElement;

  // Minimap settings
  private MINIMAP_SIZE = MINIMAP_SIZE;
  private WORLD_SIZE = DEFAULT_WORLD_SIZE;
  private baseWorldSize = DEFAULT_WORLD_SIZE;
  private zoomLevel = 1.0;
  private readonly MIN_ZOOM = 0.5;
  private readonly MAX_ZOOM = 4.0;
  private readonly UPDATE_INTERVAL = 100;
  private lastUpdateTime = 0;

  // Pinch zoom state
  private activePointers: Map<number, { x: number; y: number }> = new Map();
  private lastPinchDist = 0;

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

  async init(parent?: HTMLElement): Promise<void> {
    Logger.info('minimap', ' Initializing Minimap System...');

    // Add to DOM (grid slot or body)
    (parent ?? document.body).appendChild(this.minimapContainer);

    // Prevent browser gestures on the minimap container
    this.minimapContainer.style.touchAction = 'none';

    // Pinch-to-zoom event listeners
    this.minimapContainer.addEventListener('pointerdown', (e: PointerEvent) => {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.activePointers.size === 2) {
        this.lastPinchDist = this.getPinchDistance();
      }
    });

    this.minimapContainer.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.activePointers.has(e.pointerId)) return;
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.activePointers.size === 2) {
        const dist = this.getPinchDistance();
        if (this.lastPinchDist > 0) {
          const scale = dist / this.lastPinchDist;
          this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoomLevel * scale));
          this.WORLD_SIZE = this.baseWorldSize / this.zoomLevel;
        }
        this.lastPinchDist = dist;
      }
    });

    const endPointer = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) {
        this.lastPinchDist = 0;
      }
    };
    this.minimapContainer.addEventListener('pointerup', endPointer);
    this.minimapContainer.addEventListener('pointercancel', endPointer);

    Logger.info('minimap', ' Minimap System initialized');
  }

  private getPinchDistance(): number {
    const pts = Array.from(this.activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  update(_deltaTime: number): void {
    this.playerPosition.copy(this.camera.position);

    this.camera.getWorldDirection(_v1);
    this.playerRotation = Math.atan2(_v1.x, -_v1.z);

    // Throttling is handled by SystemUpdater's tacticalUiAccumulator (20Hz).
    this.renderMinimap();
  }

  /** Re-parent minimap into a grid slot (called after init). */
  mountTo(parent: HTMLElement): void {
    if (this.minimapContainer.parentNode) {
      this.minimapContainer.parentNode.removeChild(this.minimapContainer);
    }
    parent.appendChild(this.minimapContainer);
  }

  // System connections

  setZoneQuery(query: IZoneQuery): void {
    this.zoneQuery = query;
  }

  /**
   * Backwards-compatible adapter retained for one cycle so wiring composers
   * keep working while consumers migrate to `setZoneQuery`. Delete after
   * Batch C of cycle-2026-05-10-zone-manager-decoupling.
   */
  setZoneManager(manager: ZoneManager): void {
    this.setZoneQuery(manager);
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setWarSimulator(simulator: WarSimulator): void {
    this.warSimulator = simulator;
  }

  // Game mode configuration
  setWorldScale(scale: number): void {
    this.baseWorldSize = scale;
    this.WORLD_SIZE = scale / this.zoomLevel;
    Logger.info('minimap', ` Minimap world scale set to ${scale}`);
  }

  /** Get current zoom level (1.0 = default, >1 = zoomed in). */
  getZoomLevel(): number {
    return this.zoomLevel;
  }

  /** Set zoom level programmatically. Clamped to min/max. */
  setZoomLevel(zoom: number): void {
    this.zoomLevel = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
    this.WORLD_SIZE = this.baseWorldSize / this.zoomLevel;
  }

  setPlayerSquadId(squadId: string | undefined): void {
    this.playerSquadId = squadId;
    Logger.info('minimap', ` Minimap tracking player squad: ${squadId}`);
  }

  setCommandPosition(position: THREE.Vector3 | undefined): void {
    this.commandPosition = position;
  }

  setHelipadMarkers(markers: HelipadMarker[]): void {
    this.helipadMarkers = markers;
  }

  setTerrainFlowPaths(paths: TerrainFlowPath[]): void {
    this.terrainFlowPaths = paths.slice();
  }

  setMapIntelPolicy(policy: MapIntelPolicyConfig): void {
    this.mapIntelPolicy = { ...policy };
  }

  private renderMinimap(): void {
    renderMinimap({
      ctx: this.minimapContext,
      size: this.MINIMAP_SIZE,
      worldSize: this.WORLD_SIZE,
      playerPosition: this.playerPosition,
      playerRotation: this.playerRotation,
      camera: this.camera,
      zoneQuery: this.zoneQuery,
      combatantSystem: this.combatantSystem,
      warSimulator: this.warSimulator,
      playerSquadId: this.playerSquadId,
      commandPosition: this.commandPosition,
      helipadMarkers: this.helipadMarkers,
      mapIntelPolicy: this.mapIntelPolicy,
      terrainFlowPaths: this.terrainFlowPaths,
    });
  }

  dispose(): void {
    if (this.minimapContainer.parentNode) {
      this.minimapContainer.parentNode.removeChild(this.minimapContainer);
    }

    Logger.info('minimap', 'Minimap System disposed');
  }
}
