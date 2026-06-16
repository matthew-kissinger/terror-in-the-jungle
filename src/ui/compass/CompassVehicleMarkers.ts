// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../../systems/combat/types';

const _cameraPos = new THREE.Vector3();
const _diff = new THREE.Vector3();

/**
 * Drivable vehicle categories that get a compass marker. Aircraft are
 * intentionally excluded — they have their own HUD.
 */
export type VehicleMarkerCategory = 'ground' | 'watercraft' | 'emplacement';

/**
 * Minimal vehicle shape consumed by the compass marker layer. The full
 * `IVehicle` interface lives in `src/systems/vehicle/IVehicle.ts`; this
 * narrowed shape keeps the compass module free of vehicle-system imports
 * and lets the test mock vehicles with plain objects.
 */
export interface VehicleMarkerEntry {
  vehicleId: string;
  category: VehicleMarkerCategory;
  faction: Faction;
  /** World-space position. Read once per update; do not store. */
  position: THREE.Vector3;
}

/**
 * Query surface the compass uses to enumerate drivable vehicles. The
 * runtime supplies a thin adapter over `VehicleManager.getAllVehicles()`.
 */
export interface IVehicleMarkerQuery {
  getVehicleMarkers(): readonly VehicleMarkerEntry[];
}

type VehicleMarkerState = {
  markers: Map<VehicleMarkerCategory, HTMLDivElement>;
  seenCategories: Set<VehicleMarkerCategory>;
  nearestEntries: Map<VehicleMarkerCategory, VehicleMarkerEntry>;
  bestDistSq: Map<VehicleMarkerCategory, number>;
};

type UpdateVehicleMarkersParams = {
  camera: THREE.Camera;
  vehicleQuery: IVehicleMarkerQuery;
  markersContainer: HTMLDivElement;
  playerHeadingDegrees: number;
  state: VehicleMarkerState;
};

const CATEGORY_LABEL: Record<VehicleMarkerCategory, string> = {
  ground: 'G',
  watercraft: 'W',
  emplacement: 'E'
};

type MarkerLabelRefs = {
  letterNode: Text;
  distanceSpan: HTMLSpanElement;
};

const markerLabelRefs = new WeakMap<HTMLDivElement, MarkerLabelRefs>();

/**
 * Place a bearing chevron + distance label on the compass rose for the
 * nearest drivable vehicle in each category (ground / watercraft /
 * emplacement). Up to three markers, one per category.
 *
 * Mirrors `updateZoneMarkers` in `CompassZoneMarkers.ts`: same pixels-
 * per-degree scaling (2 px/deg), same 200 px rose width, same visibility
 * window (±90° relative to player heading).
 */
export function updateVehicleMarkers({
  camera,
  vehicleQuery,
  markersContainer,
  playerHeadingDegrees,
  state
}: UpdateVehicleMarkersParams): void {
  camera.getWorldPosition(_cameraPos);

  const entries = vehicleQuery.getVehicleMarkers();
  state.seenCategories.clear();

  if (entries.length === 0) {
    pruneStaleMarkers(state);
    return;
  }

  pickNearestPerCategory(entries, _cameraPos, state);

  const compassWidth = 200;
  const centerX = compassWidth / 2;

  state.nearestEntries.forEach((entry, category) => {
    state.seenCategories.add(category);

    _diff.subVectors(entry.position, _cameraPos);
    const distance = _diff.length();
    const directionAngle = Math.atan2(-_diff.x, _diff.z) * 180 / Math.PI;

    let angle = directionAngle;
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;

    let relativeAngle = angle - playerHeadingDegrees;
    while (relativeAngle < -180) relativeAngle += 360;
    while (relativeAngle > 180) relativeAngle -= 360;

    const isVisible = Math.abs(relativeAngle) <= 90;
    const markerX = centerX + relativeAngle * 2;

    let marker = state.markers.get(category);
    if (!marker) {
      marker = createMarkerElement(category);
      state.markers.set(category, marker);
      markersContainer.appendChild(marker);
    }

    setClassName(marker, factionMarkerClass(entry.faction, category));

    const distText = formatDistance(distance);
    setMarkerLabel(marker, CATEGORY_LABEL[category], distText);

    if (isVisible) {
      setDisplay(marker, 'flex');
      setLeft(marker, `${markerX}px`);
    } else {
      setDisplay(marker, 'none');
    }
  });

  pruneStaleMarkers(state);
}

function pickNearestPerCategory(
  entries: readonly VehicleMarkerEntry[],
  origin: THREE.Vector3,
  state: VehicleMarkerState
): void {
  state.bestDistSq.clear();
  state.nearestEntries.clear();

  for (const entry of entries) {
    if (!isDrivableCategory(entry.category)) continue;
    const dx = entry.position.x - origin.x;
    const dy = entry.position.y - origin.y;
    const dz = entry.position.z - origin.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const prior = state.bestDistSq.get(entry.category);
    if (prior === undefined || distSq < prior) {
      state.bestDistSq.set(entry.category, distSq);
      state.nearestEntries.set(entry.category, entry);
    }
  }
}

function isDrivableCategory(c: string): c is VehicleMarkerCategory {
  return c === 'ground' || c === 'watercraft' || c === 'emplacement';
}

function factionMarkerClass(faction: Faction, category: VehicleMarkerCategory): string {
  const factionClass = faction === Faction.US || faction === Faction.ARVN
    ? 'friendly'
    : 'enemy';
  return `compass-marker compass-marker-vehicle compass-marker-vehicle-${category} ${factionClass}`;
}

function createMarkerElement(category: VehicleMarkerCategory): HTMLDivElement {
  const marker = document.createElement('div');
  marker.className = `compass-marker compass-marker-vehicle compass-marker-vehicle-${category} neutral`;
  marker.style.display = 'none';
  const letterNode = document.createTextNode('');
  const distanceSpan = document.createElement('span');
  distanceSpan.className = 'compass-marker-distance';
  marker.appendChild(letterNode);
  marker.appendChild(distanceSpan);
  markerLabelRefs.set(marker, { letterNode, distanceSpan });
  return marker;
}

function setClassName(marker: HTMLDivElement, className: string): void {
  if (marker.className !== className) marker.className = className;
}

function setDisplay(marker: HTMLDivElement, display: string): void {
  if (marker.style.display !== display) marker.style.display = display;
}

function setLeft(marker: HTMLDivElement, left: string): void {
  if (marker.style.left !== left) marker.style.left = left;
}

/**
 * Set the marker's letter (G/W/E) plus a small distance suffix on a
 * separate child span so the chevron stays round.
 */
function setMarkerLabel(marker: HTMLDivElement, letter: string, distText: string): void {
  const { letterNode, distanceSpan } = getMarkerLabelRefs(marker);
  if (distanceSpan.textContent !== distText) {
    distanceSpan.textContent = distText;
  }
  if (letterNode.nodeValue !== letter) {
    letterNode.nodeValue = letter;
  }
}

function getMarkerLabelRefs(marker: HTMLDivElement): MarkerLabelRefs {
  const existing = markerLabelRefs.get(marker);
  if (existing) return existing;

  marker.textContent = '';
  const letterNode = document.createTextNode('');
  const distanceSpan = document.createElement('span');
  distanceSpan.className = 'compass-marker-distance';
  marker.appendChild(letterNode);
  marker.appendChild(distanceSpan);
  const refs = { letterNode, distanceSpan };
  markerLabelRefs.set(marker, refs);
  return refs;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

function pruneStaleMarkers(state: VehicleMarkerState): void {
  state.markers.forEach((marker, category) => {
    if (!state.seenCategories.has(category)) {
      if (marker.parentNode) {
        marker.parentNode.removeChild(marker);
      }
      state.markers.delete(category);
    }
  });
}

export function createVehicleMarkerState(): VehicleMarkerState {
  return {
    markers: new Map<VehicleMarkerCategory, HTMLDivElement>(),
    seenCategories: new Set<VehicleMarkerCategory>(),
    nearestEntries: new Map<VehicleMarkerCategory, VehicleMarkerEntry>(),
    bestDistSq: new Map<VehicleMarkerCategory, number>()
  };
}

export type { VehicleMarkerState };
