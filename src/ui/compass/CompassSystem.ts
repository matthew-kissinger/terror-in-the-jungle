// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { createCompassDOM } from './CompassDOMBuilder';
import { updateZoneMarkers, type ZoneMarkerState } from './CompassZoneMarkers';
import {
  updateVehicleMarkers,
  createVehicleMarkerState,
  type VehicleMarkerState,
  type IVehicleMarkerQuery
} from './CompassVehicleMarkers';

export class CompassSystem implements GameSystem {
  private camera: THREE.Camera;
  private zoneQuery?: IZoneQuery;
  private vehicleQuery?: IVehicleMarkerQuery;

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

  private readonly vehicleMarkerState: VehicleMarkerState = createVehicleMarkerState();
  private lastHeadingText = '000°';
  private lastRoseTransform = '';

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
    // Park on <body> when no grid slot is supplied yet; stay hidden until
    // mountTo() reparents into the HUD grid, otherwise the compass flashes as
    // a loose box in the corner for the few frames before the grid is built.
    if (!parent) this.compassContainer.style.display = 'none';
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
    const headingText = `${displayDegrees.toString().padStart(3, '0')}°`;
    if (headingText !== this.lastHeadingText) {
      this.headingText.textContent = headingText;
      this.lastHeadingText = headingText;
    }

    const pixelsPerDegree = 2;
    const offset = -headingDegrees * pixelsPerDegree + 720;
    const roseTransform = `translate(calc(-50% + ${offset}px), -50%)`;
    if (roseTransform !== this.lastRoseTransform) {
      this.compassRose.style.transform = roseTransform;
      this.lastRoseTransform = roseTransform;
    }

    if (this.zoneQuery) {
      this.zoneUpdateTimer += deltaTime * 1000;
      if (this.zoneUpdateTimer >= CompassSystem.ZONE_UPDATE_INTERVAL) {
        updateZoneMarkers({
          camera: this.camera,
          zoneQuery: this.zoneQuery,
          markersContainer: this.markersContainer,
          playerHeadingDegrees: headingDegrees,
          state: this.zoneMarkerState
        });
        // Vehicle markers ride the same 100ms cadence as zones so the
        // compass refresh stays one bounded chunk of DOM work per tick.
        if (this.vehicleQuery) {
          updateVehicleMarkers({
            camera: this.camera,
            vehicleQuery: this.vehicleQuery,
            markersContainer: this.markersContainer,
            playerHeadingDegrees: headingDegrees,
            state: this.vehicleMarkerState
          });
        }
        this.zoneUpdateTimer = 0;
      }
    } else if (this.vehicleQuery) {
      // Vehicle-only refresh path for scenarios that wire vehicles but
      // not zones (e.g. free-roam playtests). Same cadence as zones.
      this.zoneUpdateTimer += deltaTime * 1000;
      if (this.zoneUpdateTimer >= CompassSystem.ZONE_UPDATE_INTERVAL) {
        updateVehicleMarkers({
          camera: this.camera,
          vehicleQuery: this.vehicleQuery,
          markersContainer: this.markersContainer,
          playerHeadingDegrees: headingDegrees,
          state: this.vehicleMarkerState
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
    // Reveal now that it sits in its grid slot (init() hid it while parked
    // on <body>). Visibility past this point is the HUD grid's concern.
    this.compassContainer.style.display = '';
  }

  setZoneQuery(query: IZoneQuery): void {
    this.zoneQuery = query;
  }

  setVehicleQuery(query: IVehicleMarkerQuery): void {
    this.vehicleQuery = query;
  }

  dispose(): void {
    if (this.compassContainer.parentNode) {
      this.compassContainer.parentNode.removeChild(this.compassContainer);
    }

    this.zoneMarkerState.zoneMarkers.clear();
    this.zoneMarkerState.seenZones.clear();
    this.vehicleMarkerState.markers.clear();
    this.vehicleMarkerState.seenCategories.clear();

    if (this.styleSheet && this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
    }

    Logger.info('compass', 'Compass System disposed');
  }
}
