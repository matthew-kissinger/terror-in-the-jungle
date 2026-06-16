// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { ZoneState, CaptureZone } from '../../systems/world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import { Alliance, getAlliance } from '../../systems/combat/types';
import { HUDElements } from './HUDElements';

export class HUDZoneDisplay {
  private static readonly MAX_VISIBLE_ZONES = 5;
  private elements: HUDElements;
  private readonly zoneElements = new Map<string, ZoneElementRefs>();
  private zoneOrder: string[] = [];
  private emptyStateEl?: HTMLDivElement;
  private overflowLabel?: HTMLDivElement;
  private dominanceBar?: DominanceBarRefs;
  private playerAlliance: Alliance = Alliance.BLUFOR;
  private readonly capturableZonesScratch: CaptureZone[] = [];
  private readonly sortedZonesScratch: CaptureZone[] = [];
  private readonly visibleZoneIdsScratch: string[] = [];
  private readonly zoneIdScratch = new Set<string>();

  constructor(elements: HUDElements) {
    this.elements = elements;
  }

  setPlayerAlliance(alliance: Alliance): void {
    this.playerAlliance = alliance;
  }

  updateObjectivesDisplay(zoneQuery: IZoneQuery, isTDM: boolean = false, playerPosition?: { x: number; y: number; z: number }): void {
    if (isTDM) {
      setDisplay(this.elements.objectivesList, 'none');
      return;
    }
    setDisplay(this.elements.objectivesList, 'block');

    const zones = zoneQuery.getAllZones();
    const capturableZones = this.collectCapturableZones(zones);
    const titleElement = this.elements.objectivesList.querySelector('.objectives-title');

    // Update zone dominance bar
    this.updateDominanceBar(capturableZones);

    if (capturableZones.length === 0) {
      this.zoneElements.forEach((element) => {
        if (element.root.parentElement === this.elements.objectivesList) {
          this.elements.objectivesList.removeChild(element.root);
        }
      });
      this.zoneElements.clear();
      this.zoneOrder = [];
      if (!this.emptyStateEl) {
        this.emptyStateEl = document.createElement('div');
        this.emptyStateEl.className = 'zone-empty';
        this.emptyStateEl.textContent = 'No objectives loaded';
      }
      if (titleElement && this.emptyStateEl.parentElement !== this.elements.objectivesList) {
        this.elements.objectivesList.appendChild(this.emptyStateEl);
      }
      return;
    } else if (this.emptyStateEl && this.emptyStateEl.parentElement === this.elements.objectivesList) {
      this.elements.objectivesList.removeChild(this.emptyStateEl);
    }

    const zoneIds = this.collectZoneIds(capturableZones);
    for (const [zoneId, element] of this.zoneElements.entries()) {
      if (!zoneIds.has(zoneId)) {
        if (element.root.parentElement === this.elements.objectivesList) {
          this.elements.objectivesList.removeChild(element.root);
        }
        this.zoneElements.delete(zoneId);
      }
    }

    // Priority sort: contested first, then by distance (nearest first)
    const sortedZones = this.prioritySortZones(capturableZones, playerPosition);
    const visibleIds = this.collectVisibleZoneIds(sortedZones);
    const hiddenCount = sortedZones.length - visibleIds.length;

    // Create/update elements for all zones (keep cached for when they rotate in)
    for (const zone of capturableZones) {
      let zoneElement = this.zoneElements.get(zone.id);
      if (!zoneElement) {
        zoneElement = this.createZoneElement(zone);
        this.zoneElements.set(zone.id, zoneElement);
      }
      this.updateZoneElement(zoneElement, zone, playerPosition);
    }

    const orderChanged = visibleIds.length !== this.zoneOrder.length
      || visibleIds.some((zoneId, index) => zoneId !== this.zoneOrder[index]);

    if (orderChanged) {
      const children = this.elements.objectivesList.children;
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index];
        if (child !== titleElement && child !== this.dominanceBar?.root) {
          this.elements.objectivesList.removeChild(child);
        }
      }

      const fragment = document.createDocumentFragment();
      for (const zoneId of visibleIds) {
        const zoneElement = this.zoneElements.get(zoneId);
        if (zoneElement) {
          fragment.appendChild(zoneElement.root);
        }
      }

      // Show overflow count when zones are hidden
      if (hiddenCount > 0) {
        if (!this.overflowLabel) {
          this.overflowLabel = document.createElement('div');
          this.overflowLabel.className = 'zone-overflow';
        }
        setTextContent(this.overflowLabel, `+${hiddenCount} more zones`);
        fragment.appendChild(this.overflowLabel);
      } else if (this.overflowLabel?.parentElement) {
        this.overflowLabel.parentElement.removeChild(this.overflowLabel);
      }

      this.elements.objectivesList.appendChild(fragment);
      this.copyZoneOrder(visibleIds);
    } else if (hiddenCount > 0 && this.overflowLabel) {
      setTextContent(this.overflowLabel, `+${hiddenCount} more zones`);
    }
  }

  private prioritySortZones(
    zones: readonly CaptureZone[],
    playerPosition?: { x: number; y: number; z: number }
  ): CaptureZone[] {
    this.sortedZonesScratch.length = 0;
    for (const zone of zones) {
      this.sortedZonesScratch.push(zone);
    }
    this.sortedZonesScratch.sort((a, b) => {
      // Contested zones first (most actionable)
      const aContested = a.state === ZoneState.CONTESTED ? 1 : 0;
      const bContested = b.state === ZoneState.CONTESTED ? 1 : 0;
      if (aContested !== bContested) return bContested - aContested;

      // Then player-owned zones being attacked (urgent)
      const aUrgent = a.state === ZoneState.CONTESTED && a.owner !== null && getAlliance(a.owner) === this.playerAlliance ? 1 : 0;
      const bUrgent = b.state === ZoneState.CONTESTED && b.owner !== null && getAlliance(b.owner) === this.playerAlliance ? 1 : 0;
      if (aUrgent !== bUrgent) return bUrgent - aUrgent;

      // Then by distance (nearest first)
      if (playerPosition) {
        const aDist = Math.hypot(
          Number(a.position.x) - Number(playerPosition.x),
          Number(a.position.z) - Number(playerPosition.z)
        );
        const bDist = Math.hypot(
          Number(b.position.x) - Number(playerPosition.x),
          Number(b.position.z) - Number(playerPosition.z)
        );
        return aDist - bDist;
      }

      return 0;
    });
    return this.sortedZonesScratch;
  }

  private collectCapturableZones(zones: readonly CaptureZone[]): CaptureZone[] {
    this.capturableZonesScratch.length = 0;
    for (const zone of zones) {
      if (!zone.isHomeBase) {
        this.capturableZonesScratch.push(zone);
      }
    }
    return this.capturableZonesScratch;
  }

  private collectZoneIds(zones: CaptureZone[]): Set<string> {
    this.zoneIdScratch.clear();
    for (const zone of zones) {
      this.zoneIdScratch.add(zone.id);
    }
    return this.zoneIdScratch;
  }

  private collectVisibleZoneIds(zones: CaptureZone[]): string[] {
    this.visibleZoneIdsScratch.length = 0;
    const visibleCount = Math.min(zones.length, HUDZoneDisplay.MAX_VISIBLE_ZONES);
    for (let index = 0; index < visibleCount; index++) {
      this.visibleZoneIdsScratch.push(zones[index].id);
    }
    return this.visibleZoneIdsScratch;
  }

  private copyZoneOrder(visibleIds: string[]): void {
    this.zoneOrder.length = visibleIds.length;
    for (let index = 0; index < visibleIds.length; index++) {
      this.zoneOrder[index] = visibleIds[index];
    }
  }

  private createZoneElement(zone: CaptureZone): ZoneElementRefs {
    const root = document.createElement('div');
    root.className = 'zone-item';

    const nameRow = document.createElement('div');
    const nameEl = document.createElement('span');
    nameEl.className = 'zone-name';
    const distanceEl = document.createElement('span');
    distanceEl.className = 'zone-distance';
    nameRow.appendChild(nameEl);
    nameRow.appendChild(distanceEl);

    const statusContainer = document.createElement('div');
    statusContainer.className = 'zone-status';
    const iconEl = document.createElement('div');
    iconEl.className = 'zone-icon zone-neutral';
    const statusTextEl = document.createElement('span');
    statusTextEl.className = 'zone-status-text';
    statusContainer.appendChild(iconEl);
    statusContainer.appendChild(statusTextEl);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'capture-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'capture-bar';
    progressContainer.appendChild(progressBar);
    progressContainer.style.display = 'none';

    root.appendChild(nameRow);
    root.appendChild(statusContainer);
    root.appendChild(progressContainer);

    const elementRefs: ZoneElementRefs = {
      root,
      nameEl,
      distanceEl,
      iconEl,
      statusTextEl,
      progressContainer,
      progressBar
    };

    this.updateZoneElement(elementRefs, zone);
    return elementRefs;
  }

  private updateZoneElement(element: ZoneElementRefs, zone: CaptureZone, playerPosition?: { x: number; y: number; z: number }): void {
    const playerOwned = zone.owner !== null && getAlliance(zone.owner) === this.playerAlliance;
    const enemyOwned = zone.owner !== null && getAlliance(zone.owner) !== this.playerAlliance;

    let zoneClass = 'zone-neutral';
    switch (zone.state) {
      case ZoneState.BLUFOR_CONTROLLED:
        zoneClass = 'zone-us';
        break;
      case ZoneState.OPFOR_CONTROLLED:
        zoneClass = 'zone-opfor';
        break;
      case ZoneState.CONTESTED:
        zoneClass = 'zone-contested';
        break;
    }

    let distance = Math.round(zone.position.length());
    if (playerPosition) {
      const dx = Number(zone.position.x) - Number(playerPosition.x);
      const dz = Number(zone.position.z) - Number(playerPosition.z);
      distance = Math.round(Math.hypot(dx, dz));
    }
    setTextContent(element.nameEl, zone.name);
    setTextContent(element.distanceEl, `${distance}m`);
    setClassName(element.iconEl, `zone-icon ${zoneClass}`);

    const statusText = this.getStatusText(zone);
    setTextContent(element.statusTextEl, statusText);

    // Tactical status coloring
    element.statusTextEl.classList.toggle('status-losing', statusText === 'LOSING');
    element.statusTextEl.classList.toggle('status-attacking', statusText === 'ATTACKING');
    element.statusTextEl.classList.toggle('status-secured', statusText === 'SECURED');
    element.statusTextEl.classList.toggle('status-hostile', statusText === 'HOSTILE');

    // Highlight contested/losing zones
    element.root.classList.toggle('zone-urgent', zone.state === ZoneState.CONTESTED && playerOwned);

    const showProgress = zone.state === ZoneState.CONTESTED || (zone.owner === null && zone.captureProgress > 0);
    if (showProgress) {
      setDisplay(element.progressContainer, 'block');
      setWidth(element.progressBar, `${zone.captureProgress}%`);
      // Color the progress bar contextually
      if (playerOwned) {
        setClassName(element.progressBar, 'capture-bar capture-bar-losing');
      } else if (enemyOwned) {
        setClassName(element.progressBar, 'capture-bar capture-bar-attacking');
      } else {
        setClassName(element.progressBar, 'capture-bar');
      }
    } else {
      setDisplay(element.progressContainer, 'none');
    }
  }

  private ensureDominanceBar(): DominanceBarRefs {
    if (this.dominanceBar) return this.dominanceBar;

    const root = document.createElement('div');
    root.className = 'dominance-bar';

    const track = document.createElement('div');
    track.className = 'dominance-track';

    const bluforFill = document.createElement('div');
    bluforFill.className = 'dominance-fill dominance-blufor';
    const contestedFill = document.createElement('div');
    contestedFill.className = 'dominance-fill dominance-contested';

    track.appendChild(bluforFill);
    track.appendChild(contestedFill);

    const label = document.createElement('div');
    label.className = 'dominance-label';

    root.appendChild(track);
    root.appendChild(label);

    // Insert after the title element
    const titleElement = this.elements.objectivesList.querySelector('.objectives-title');
    if (titleElement && titleElement.nextSibling) {
      this.elements.objectivesList.insertBefore(root, titleElement.nextSibling);
    } else {
      this.elements.objectivesList.appendChild(root);
    }

    this.dominanceBar = { root, bluforFill, contestedFill, label };
    return this.dominanceBar;
  }

  private updateDominanceBar(capturableZones: CaptureZone[]): void {
    if (capturableZones.length === 0) {
      if (this.dominanceBar?.root.parentElement) {
        this.dominanceBar.root.parentElement.removeChild(this.dominanceBar.root);
        this.dominanceBar = undefined;
      }
      return;
    }

    const bar = this.ensureDominanceBar();
    const total = capturableZones.length;

    let blufor = 0;
    let opfor = 0;
    let contested = 0;
    for (const zone of capturableZones) {
      switch (zone.state) {
        case ZoneState.BLUFOR_CONTROLLED: blufor++; break;
        case ZoneState.OPFOR_CONTROLLED: opfor++; break;
        case ZoneState.CONTESTED: contested++; break;
      }
    }

    const bluforPct = (blufor / total) * 100;
    const contestedPct = (contested / total) * 100;

    setWidth(bar.bluforFill, `${bluforPct}%`);
    setWidth(bar.contestedFill, `${contestedPct}%`);

    // Label: show zone counts from player perspective
    const friendly = this.playerAlliance === Alliance.BLUFOR ? blufor : opfor;
    const enemy = this.playerAlliance === Alliance.BLUFOR ? opfor : blufor;
    const parts: string[] = [];
    if (friendly > 0) parts.push(`${friendly} HELD`);
    if (contested > 0) parts.push(`${contested} CONTESTED`);
    if (enemy > 0) parts.push(`${enemy} HOSTILE`);
    setTextContent(bar.label, parts.join(' \u2022 '));
  }

  private getStatusText(zone: CaptureZone): string {
    const playerOwned = zone.owner !== null && getAlliance(zone.owner) === this.playerAlliance;
    const enemyOwned = zone.owner !== null && getAlliance(zone.owner) !== this.playerAlliance;

    if (zone.state === ZoneState.CONTESTED) {
      if (playerOwned) return 'LOSING';
      if (enemyOwned) return 'ATTACKING';
      return 'CONTESTED';
    }

    if (zone.state === ZoneState.NEUTRAL) {
      if (zone.captureProgress <= 0) return 'NEUTRAL';
      const pct = Math.max(0, Math.min(100, Math.round(zone.captureProgress)));
      return `CAPTURING ${pct}%`;
    }

    if (playerOwned) return 'SECURED';
    if (enemyOwned) return 'HOSTILE';
    return 'NEUTRAL';
  }
}

function setTextContent(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function setClassName(element: HTMLElement, className: string): void {
  if (element.className !== className) element.className = className;
}

function setDisplay(element: HTMLElement, display: string): void {
  if (element.style.display !== display) element.style.display = display;
}

function setWidth(element: HTMLElement, width: string): void {
  if (element.style.width !== width) element.style.width = width;
}

interface DominanceBarRefs {
  root: HTMLDivElement;
  bluforFill: HTMLDivElement;
  contestedFill: HTMLDivElement;
  label: HTMLDivElement;
}

interface ZoneElementRefs {
  root: HTMLDivElement;
  nameEl: HTMLSpanElement;
  distanceEl: HTMLSpanElement;
  iconEl: HTMLDivElement;
  statusTextEl: HTMLSpanElement;
  progressContainer: HTMLDivElement;
  progressBar: HTMLDivElement;
}
