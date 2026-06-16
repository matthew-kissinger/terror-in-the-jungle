/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Faction } from '../../systems/combat/types';
import { CaptureZone, ZoneState } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { HUDElements } from './HUDElements';
import { HUDZoneDisplay } from './HUDZoneDisplay';

describe('HUDZoneDisplay', () => {
  it('prioritizes visible zones without mutating the source zone order', () => {
    const objectivesList = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'objectives-title';
    objectivesList.appendChild(title);

    const zones = [
      createZone({ id: 'far', name: 'Far', position: new THREE.Vector3(900, 0, 0), state: ZoneState.NEUTRAL, owner: null }),
      createZone({ id: 'contested', name: 'Contested', position: new THREE.Vector3(500, 0, 0), state: ZoneState.CONTESTED, owner: Faction.NVA }),
      createZone({ id: 'near', name: 'Near', position: new THREE.Vector3(25, 0, 0), state: ZoneState.NEUTRAL, owner: null }),
      createZone({ id: 'mid', name: 'Mid', position: new THREE.Vector3(150, 0, 0), state: ZoneState.NEUTRAL, owner: null }),
      createZone({ id: 'home', name: 'Home', position: new THREE.Vector3(1, 0, 0), isHomeBase: true }),
      createZone({ id: 'held', name: 'Held', position: new THREE.Vector3(250, 0, 0), state: ZoneState.BLUFOR_CONTROLLED, owner: Faction.US }),
      createZone({ id: 'hostile', name: 'Hostile', position: new THREE.Vector3(350, 0, 0), state: ZoneState.OPFOR_CONTROLLED, owner: Faction.NVA }),
      createZone({ id: 'rear', name: 'Rear', position: new THREE.Vector3(700, 0, 0), state: ZoneState.NEUTRAL, owner: null }),
    ];
    const originalOrder = zones.map((zone) => zone.id);
    const display = new HUDZoneDisplay({ objectivesList } as unknown as HUDElements);

    display.updateObjectivesDisplay(createZoneQuery(zones), false, { x: 0, y: 0, z: 0 });

    const visibleNames = Array.from(objectivesList.querySelectorAll('.zone-name'))
      .map((element) => element.textContent);
    expect(visibleNames).toEqual(['Contested', 'Near', 'Mid', 'Held', 'Hostile']);
    expect(objectivesList.textContent).toContain('+2 more zones');
    expect(objectivesList.textContent).not.toContain('Home');
    expect(zones.map((zone) => zone.id)).toEqual(originalOrder);
  });

  it('does not rewrite stable objective DOM strings or styles', () => {
    const objectivesList = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'objectives-title';
    objectivesList.appendChild(title);

    const zone = createZone();
    const display = new HUDZoneDisplay({ objectivesList } as unknown as HUDElements);
    const zoneQuery = createZoneQuery([zone]);
    const playerPosition = { x: 0, y: 0, z: 0 };

    display.updateObjectivesDisplay(zoneQuery, false, playerPosition);

    const name = requireElement(objectivesList, '.zone-name');
    const distance = requireElement(objectivesList, '.zone-distance');
    const icon = requireElement(objectivesList, '.zone-icon');
    const status = requireElement(objectivesList, '.zone-status-text');
    const progressContainer = requireElement(objectivesList, '.capture-progress');
    const progressBar = requireElement(objectivesList, '.capture-bar');
    const bluforFill = requireElement(objectivesList, '.dominance-blufor');
    const contestedFill = requireElement(objectivesList, '.dominance-contested');
    const dominanceLabel = requireElement(objectivesList, '.dominance-label');

    const observed = [
      observeText(name),
      observeText(distance),
      observeText(status),
      observeText(dominanceLabel),
      observeClassName(icon),
      observeClassName(progressBar),
      observeStyle(objectivesList.style, 'display'),
      observeStyle(progressContainer.style, 'display'),
      observeStyle(progressBar.style, 'width'),
      observeStyle(bluforFill.style, 'width'),
      observeStyle(contestedFill.style, 'width'),
    ];

    display.updateObjectivesDisplay(zoneQuery, false, playerPosition);
    display.updateObjectivesDisplay(zoneQuery, false, playerPosition);

    expect(observed.map((entry) => entry.writes)).toEqual(new Array(observed.length).fill(0));
    expect(name.textContent).toBe('Alpha');
    expect(distance.textContent).toBe('100m');
    expect(icon.className).toBe('zone-icon zone-contested');
    expect(status.textContent).toBe('LOSING');
    expect(progressContainer.style.display).toBe('block');
    expect(progressBar.className).toBe('capture-bar capture-bar-losing');
    expect(progressBar.style.width).toBe('50%');
    expect(bluforFill.style.width).toBe('0%');
    expect(contestedFill.style.width).toBe('100%');
    expect(dominanceLabel.textContent).toBe('1 CONTESTED');
  });
});

function createZone(overrides: Partial<CaptureZone> = {}): CaptureZone {
  return {
    id: 'alpha',
    name: 'Alpha',
    position: new THREE.Vector3(100, 0, 0),
    radius: 50,
    height: 12,
    owner: Faction.US,
    state: ZoneState.CONTESTED,
    captureProgress: 50,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase: false,
    ticketBleedRate: 1,
    ...overrides,
  };
}

function createZoneQuery(zones: CaptureZone[]): IZoneQuery {
  return {
    getAllZones: () => zones,
    getCapturableZones: () => zones.filter((zone) => !zone.isHomeBase),
    getZoneAt: () => null,
    getZoneById: (id) => zones.find((zone) => zone.id === id) ?? null,
    getZonesByOwner: (faction) => zones.filter((zone) => zone.owner === faction),
    getNearestCapturableZone: () => zones[0] ?? null,
  };
}

function requireElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Expected ${selector} to exist`);
  return element;
}

interface WriteObserver {
  readonly writes: number;
}

function observeText(element: HTMLElement): WriteObserver {
  let writes = 0;
  let value = element.textContent;
  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get: () => value,
    set: (next: string | null) => {
      writes++;
      value = next;
    },
  });
  return { get writes() { return writes; } };
}

function observeClassName(element: HTMLElement): WriteObserver {
  let writes = 0;
  let value = element.className;
  Object.defineProperty(element, 'className', {
    configurable: true,
    get: () => value,
    set: (next: string) => {
      writes++;
      value = next;
    },
  });
  return { get writes() { return writes; } };
}

function observeStyle(style: CSSStyleDeclaration, property: 'display' | 'width'): WriteObserver {
  let writes = 0;
  let value = style[property];
  Object.defineProperty(style, property, {
    configurable: true,
    get: () => value,
    set: (next: string) => {
      writes++;
      value = next;
    },
  });
  return { get writes() { return writes; } };
}
