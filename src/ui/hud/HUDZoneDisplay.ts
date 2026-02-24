import { ZoneManager, ZoneState, CaptureZone } from '../../systems/world/ZoneManager';
import { Faction, isBlufor, isOpfor } from '../../systems/combat/types';
import { HUDElements } from './HUDElements';

export class HUDZoneDisplay {
  private elements: HUDElements;
  private readonly zoneElements = new Map<string, ZoneElementRefs>();
  private zoneOrder: string[] = [];
  private emptyStateEl?: HTMLDivElement;

  constructor(elements: HUDElements) {
    this.elements = elements;
  }

  updateObjectivesDisplay(zoneManager: ZoneManager, isTDM: boolean = false, playerPosition?: { x: number; y: number; z: number }): void {
    if (isTDM) {
      this.elements.objectivesList.style.display = 'none';
      return;
    }
    this.elements.objectivesList.style.display = 'block';

    const zones = zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);
    const zoneIds = capturableZones.map(zone => zone.id);
    const titleElement = this.elements.objectivesList.querySelector('.objectives-title');

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

    for (const [zoneId, element] of this.zoneElements.entries()) {
      if (!zoneIds.includes(zoneId)) {
        if (element.root.parentElement === this.elements.objectivesList) {
          this.elements.objectivesList.removeChild(element.root);
        }
        this.zoneElements.delete(zoneId);
      }
    }

    capturableZones.forEach(zone => {
      let zoneElement = this.zoneElements.get(zone.id);
      if (!zoneElement) {
        zoneElement = this.createZoneElement(zone);
        this.zoneElements.set(zone.id, zoneElement);
      }
      this.updateZoneElement(zoneElement, zone, playerPosition);
    });

    const orderChanged = zoneIds.length !== this.zoneOrder.length
      || zoneIds.some((zoneId, index) => zoneId !== this.zoneOrder[index]);

    if (orderChanged) {
      Array.from(this.elements.objectivesList.children).forEach(child => {
        if (child !== titleElement) {
          this.elements.objectivesList.removeChild(child);
        }
      });

      const fragment = document.createDocumentFragment();
      zoneIds.forEach(zoneId => {
        const zoneElement = this.zoneElements.get(zoneId);
        if (zoneElement) {
          fragment.appendChild(zoneElement.root);
        }
      });
      this.elements.objectivesList.appendChild(fragment);
      this.zoneOrder = zoneIds;
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
    let zoneClass = 'zone-neutral';

    switch (zone.state) {
      case ZoneState.US_CONTROLLED:
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
    element.nameEl.textContent = zone.name;
    element.distanceEl.textContent = `${distance}m`;
    element.iconEl.className = `zone-icon ${zoneClass}`;
    element.statusTextEl.textContent = this.getStatusText(zone);

    const showProgress = zone.state === ZoneState.CONTESTED || (zone.owner === null && zone.captureProgress > 0);
    if (showProgress) {
      element.progressContainer.style.display = 'block';
      element.progressBar.style.width = `${zone.captureProgress}%`;
    } else {
      element.progressContainer.style.display = 'none';
    }
  }

  private getStatusText(zone: CaptureZone): string {
    if (zone.state === ZoneState.US_CONTROLLED) return 'US';
    if (zone.state === ZoneState.OPFOR_CONTROLLED) return 'OPFOR';
    if (zone.state === ZoneState.NEUTRAL && zone.captureProgress <= 0) return 'Neutral';
    if (zone.state === ZoneState.NEUTRAL && zone.captureProgress > 0) {
      const pct = Math.max(0, Math.min(100, Math.round(zone.captureProgress)));
      if (zone.owner !== null && isBlufor(zone.owner)) return `${zone.owner} ${pct}%`;
      if (zone.owner !== null && isOpfor(zone.owner)) return `${zone.owner} ${pct}%`;
      return `Capturing ${pct}%`;
    }
    const pct = Math.max(0, Math.min(100, Math.round(zone.captureProgress)));
    if (zone.owner !== null && isBlufor(zone.owner)) return `${zone.owner} ${pct}%`;
    if (zone.owner !== null && isOpfor(zone.owner)) return `${zone.owner} ${pct}%`;
    return `Contested ${pct}%`;
  }
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
