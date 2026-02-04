import { ZoneManager, ZoneState, CaptureZone } from '../../systems/world/ZoneManager';
import { HUDElements } from './HUDElements';

export class HUDZoneDisplay {
  private elements: HUDElements;
  private readonly zoneElements = new Map<string, ZoneElementRefs>();
  private zoneOrder: string[] = [];

  constructor(elements: HUDElements) {
    this.elements = elements;
  }

  updateObjectivesDisplay(zoneManager: ZoneManager, isTDM: boolean = false): void {
    if (isTDM) {
      this.elements.objectivesList.style.display = 'none';
      return;
    }
    this.elements.objectivesList.style.display = 'block';

    const zones = zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);
    const zoneIds = capturableZones.map(zone => zone.id);

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
      this.updateZoneElement(zoneElement, zone);
    });

    const orderChanged = zoneIds.length !== this.zoneOrder.length
      || zoneIds.some((zoneId, index) => zoneId !== this.zoneOrder[index]);

    if (orderChanged) {
      const titleElement = this.elements.objectivesList.querySelector('.objectives-title');
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
    statusContainer.appendChild(iconEl);

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
      progressContainer,
      progressBar
    };

    this.updateZoneElement(elementRefs, zone);
    return elementRefs;
  }

  private updateZoneElement(element: ZoneElementRefs, zone: CaptureZone): void {
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

    const distance = Math.round(zone.position.length());
    element.nameEl.textContent = zone.name;
    element.distanceEl.textContent = `${distance}m`;
    element.iconEl.className = `zone-icon ${zoneClass}`;

    if (zone.state === ZoneState.CONTESTED) {
      element.progressContainer.style.display = 'block';
      element.progressBar.style.width = `${zone.captureProgress}%`;
    } else {
      element.progressContainer.style.display = 'none';
    }
  }
}

interface ZoneElementRefs {
  root: HTMLDivElement;
  nameEl: HTMLSpanElement;
  distanceEl: HTMLSpanElement;
  iconEl: HTMLDivElement;
  progressContainer: HTMLDivElement;
  progressBar: HTMLDivElement;
}
