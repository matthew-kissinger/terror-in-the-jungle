/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../../systems/combat/types';
import { CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { updateZoneMarkers, type ZoneMarkerState } from './CompassZoneMarkers';

function makeCamera(position: THREE.Vector3): THREE.Camera {
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(position);
  return cam;
}

function makeZone(id: string, position: THREE.Vector3): CaptureZone {
  return {
    id,
    name: id,
    position,
    radius: 30,
    height: 0,
    owner: Faction.US,
    state: ZoneState.BLUFOR_CONTROLLED,
    captureProgress: 0,
    captureSpeed: 0,
    currentFlagHeight: 0,
  } as CaptureZone;
}

function makeQuery(zones: CaptureZone[]): IZoneQuery {
  return {
    getAllZones: () => zones,
  } as unknown as IZoneQuery;
}

describe('updateZoneMarkers', () => {
  let container: HTMLDivElement;
  let state: ZoneMarkerState;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    state = {
      zoneMarkers: new Map<string, HTMLDivElement>(),
      seenZones: new Set<string>(),
    };
  });

  it('does not rewrite stable marker text, class, or position styles', () => {
    const camera = makeCamera(new THREE.Vector3(0, 0, 0));
    const query = makeQuery([
      makeZone('alpha', new THREE.Vector3(0, 0, 50)),
    ]);

    updateZoneMarkers({
      camera,
      zoneQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state,
    });

    const marker = state.zoneMarkers.get('alpha')!;
    let text = marker.textContent;
    let className = marker.className;
    let display = marker.style.display;
    let left = marker.style.left;
    let textWrites = 0;
    let classWrites = 0;
    let displayWrites = 0;
    let leftWrites = 0;

    Object.defineProperty(marker, 'textContent', {
      configurable: true,
      get: () => text,
      set: (value: string | null) => {
        textWrites++;
        text = value;
      },
    });
    Object.defineProperty(marker, 'className', {
      configurable: true,
      get: () => className,
      set: (value: string) => {
        classWrites++;
        className = value;
      },
    });
    Object.defineProperty(marker.style, 'display', {
      configurable: true,
      get: () => display,
      set: (value: string) => {
        displayWrites++;
        display = value;
      },
    });
    Object.defineProperty(marker.style, 'left', {
      configurable: true,
      get: () => left,
      set: (value: string) => {
        leftWrites++;
        left = value;
      },
    });

    updateZoneMarkers({
      camera,
      zoneQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state,
    });
    updateZoneMarkers({
      camera,
      zoneQuery: query,
      markersContainer: container,
      playerHeadingDegrees: 0,
      state,
    });

    expect(textWrites).toBe(0);
    expect(classWrites).toBe(0);
    expect(displayWrites).toBe(0);
    expect(leftWrites).toBe(0);
    expect(text).toBe('A');
    expect(className).toBe('compass-marker friendly');
    expect(display).toBe('flex');
    expect(left).toBe('100px');
  });
});
