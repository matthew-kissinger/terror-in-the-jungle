import * as THREE from 'three';
import { ZoneManager } from '../../systems/world/ZoneManager';

const _cameraPos = new THREE.Vector3();
const _dirToZone = new THREE.Vector3();

type ZoneMarkerState = {
  zoneMarkers: Map<string, HTMLDivElement>;
  seenZones: Set<string>;
};

type UpdateZoneMarkersParams = {
  camera: THREE.Camera;
  zoneManager: ZoneManager;
  markersContainer: HTMLDivElement;
  playerHeadingDegrees: number;
  state: ZoneMarkerState;
};

export function updateZoneMarkers({
  camera,
  zoneManager,
  markersContainer,
  playerHeadingDegrees,
  state
}: UpdateZoneMarkersParams): void {
  (camera as any).getWorldPosition(_cameraPos);

  const zones = (zoneManager as any).zones as Map<string, any>;
  if (!zones) return;

  const compassWidth = 200;
  const centerX = compassWidth / 2;
  state.seenZones.clear();

  zones.forEach((zone) => {
    const zoneId = zone.id as string;
    state.seenZones.add(zoneId);

    _dirToZone.subVectors(zone.position, _cameraPos);
    const directionAngle = Math.atan2(-_dirToZone.x, _dirToZone.z) * 180 / Math.PI;

    let angle = directionAngle;
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;

    let relativeAngle = angle - playerHeadingDegrees;
    while (relativeAngle < -180) relativeAngle += 360;
    while (relativeAngle > 180) relativeAngle -= 360;

    const isVisible = Math.abs(relativeAngle) <= 90;
    const markerX = centerX + relativeAngle * 2;

    let markerClass = 'compass-marker ';
    const displayText = zoneId.charAt(0).toUpperCase();

    const stateValue = zone.state;
    const Faction = (zoneManager as any).constructor.Faction;

    if (stateValue === 'contested') {
      markerClass += 'contested';
    } else if (zone.owner === Faction?.US) {
      markerClass += 'friendly';
    } else if (zone.owner === Faction?.OPFOR) {
      markerClass += 'enemy';
    } else {
      markerClass += 'neutral';
    }

    let marker = state.zoneMarkers.get(zoneId);
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'compass-marker neutral';
      marker.style.display = 'none';
      state.zoneMarkers.set(zoneId, marker);
      markersContainer.appendChild(marker);
    }

    if (isVisible) {
      marker.style.display = 'flex';
      marker.style.left = `${markerX}px`;
    } else {
      marker.style.display = 'none';
    }

    marker.className = markerClass;
    marker.textContent = displayText;
  });

  state.zoneMarkers.forEach((marker, zoneId) => {
    if (!state.seenZones.has(zoneId)) {
      if (marker.parentNode) {
        marker.parentNode.removeChild(marker);
      }
      state.zoneMarkers.delete(zoneId);
    }
  });
}

export type { ZoneMarkerState };
