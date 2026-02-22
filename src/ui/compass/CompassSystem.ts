import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { createCompassDOM } from './CompassDOMBuilder';
import { updateZoneMarkers, type ZoneMarkerState } from './CompassZoneMarkers';

export class CompassSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneManager?: ZoneManager;

  private compassContainer!: HTMLDivElement;
  private compassRose!: HTMLDivElement;
  private headingText!: HTMLElement;
  private markersContainer!: HTMLDivElement;
  private styleSheet!: HTMLStyleElement;

  private playerHeading = 0;

  private readonly cameraDir = new THREE.Vector3();

  private zoneUpdateTimer = 0;
  private static readonly ZONE_UPDATE_INTERVAL = 100;

  private readonly zoneMarkerState: ZoneMarkerState = {
    zoneMarkers: new Map<string, HTMLDivElement>(),
    seenZones: new Set<string>()
  };

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    const dom = createCompassDOM();
    this.compassContainer = dom.compassContainer;
    this.compassRose = dom.compassRose;
    this.headingText = dom.headingText;
    this.markersContainer = dom.markersContainer;
    this.styleSheet = dom.styleSheet;
  }

  async init(parent?: HTMLElement): Promise<void> {
    Logger.info('compass', 'Initializing Compass System...');
    (parent ?? document.body).appendChild(this.compassContainer);
    Logger.info('compass', 'Compass System initialized');
  }

  update(deltaTime: number): void {
    this.camera.getWorldDirection(this.cameraDir);

    this.playerHeading = Math.atan2(-this.cameraDir.x, this.cameraDir.z);

    let headingDegrees = this.playerHeading * 180 / Math.PI;
    while (headingDegrees < 0) headingDegrees += 360;
    while (headingDegrees >= 360) headingDegrees -= 360;

    const displayDegrees = Math.round(headingDegrees);
    this.headingText.textContent = `${displayDegrees.toString().padStart(3, '0')}°`;

    const pixelsPerDegree = 2;
    const offset = -headingDegrees * pixelsPerDegree + 720;
    this.compassRose.style.transform = `translate(calc(-50% + ${offset}px), -50%)`;

    if (this.zoneManager) {
      this.zoneUpdateTimer += deltaTime * 1000;
      if (this.zoneUpdateTimer >= CompassSystem.ZONE_UPDATE_INTERVAL) {
        updateZoneMarkers({
          camera: this.camera,
          zoneManager: this.zoneManager,
          markersContainer: this.markersContainer,
          playerHeadingDegrees: headingDegrees,
          state: this.zoneMarkerState
        });
        this.zoneUpdateTimer = 0;
      }
    }
  }

  /** Re-parent compass into a grid slot (called after init). */
  mountTo(parent: HTMLElement): void {
    if (this.compassContainer.parentNode) {
      this.compassContainer.parentNode.removeChild(this.compassContainer);
    }
    parent.appendChild(this.compassContainer);
  }

  setZoneManager(manager: ZoneManager): void {
    this.zoneManager = manager;
  }

  dispose(): void {
    if (this.compassContainer.parentNode) {
      this.compassContainer.parentNode.removeChild(this.compassContainer);
    }

    this.zoneMarkerState.zoneMarkers.clear();
    this.zoneMarkerState.seenZones.clear();

    if (this.styleSheet && this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
    }

    Logger.info('compass', 'Compass System disposed');
  }
}
