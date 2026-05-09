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

  constructor(elements: HUDElements) {
    this.elements = elements;
  }

  setPlayerAlliance(alliance: Alliance): void {
    this.playerAlliance = alliance;
  }

  updateObjectivesDisplay(zoneQuery: IZoneQuery, isTDM: boolean = false, playerPosition?: { x: number; y: number; z: number }): void {
    if (isTDM) {
      this.elements.objectivesList.style.display = 'none';
      return;
    }
    this.elements.objectivesList.style.display = 'block';

    const zones = zoneQuery.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);
    const zoneIds = capturableZones.map(zone => zone.id);
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

    for (const [zoneId, element] of this.zoneElements.entries()) {
      if (!zoneIds.includes(zoneId)) {
        if (element.root.parentElement === this.elements.objectivesList) {
          this.elements.objectivesList.removeChild(element.root);
        }
        this.zoneElements.delete(zoneId);
      }
    }

    // Priority sort: contested first, then by distance (nearest first)
    const sortedZones = this.prioritySortZones(capturableZones, playerPosition);
    const visibleZones = sortedZones.slice(0, HUDZoneDisplay.MAX_VISIBLE_ZONES);
    const hiddenCount = sortedZones.length - visibleZones.length;
    const visibleIds = visibleZones.map(z => z.id);

    // Create/update elements for all zones (keep cached for when they rotate in)
    capturableZones.forEach(zone => {
      let zoneElement = this.zoneElements.get(zone.id);
      if (!zoneElement) {
        zoneElement = this.createZoneElement(zone);
        this.zoneElements.set(zone.id, zoneElement);
      }
      this.updateZoneElement(zoneElement, zone, playerPosition);
    });

    const orderChanged = visibleIds.length !== this.zoneOrder.length
      || visibleIds.some((zoneId, index) => zoneId !== this.zoneOrder[index]);

    if (orderChanged) {
      Array.from(this.elements.objectivesList.children).forEach(child => {
        if (child !== titleElement && child !== this.dominanceBar?.root) {
          this.elements.objectivesList.removeChild(child);
        }
      });

      const fragment = document.createDocumentFragment();
      visibleIds.forEach(zoneId => {
        const zoneElement = this.zoneElements.get(zoneId);
        if (zoneElement) {
          fragment.appendChild(zoneElement.root);
        }
      });

      // Show overflow count when zones are hidden
      if (hiddenCount > 0) {
        if (!this.overflowLabel) {
          this.overflowLabel = document.createElement('div');
          this.overflowLabel.className = 'zone-overflow';
        }
        this.overflowLabel.textContent = `+${hiddenCount} more zones`;
        fragment.appendChild(this.overflowLabel);
      } else if (this.overflowLabel?.parentElement) {
        this.overflowLabel.parentElement.removeChild(this.overflowLabel);
      }

      this.elements.objectivesList.appendChild(fragment);
      this.zoneOrder = visibleIds;
    } else if (hiddenCount > 0 && this.overflowLabel) {
      this.overflowLabel.textContent = `+${hiddenCount} more zones`;
    }
  }

  private prioritySortZones(
    zones: CaptureZone[],
    playerPosition?: { x: number; y: number; z: number }
  ): CaptureZone[] {
    return zones.slice().sort((a, b) => {
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
    element.nameEl.textContent = zone.name;
    element.distanceEl.textContent = `${distance}m`;
    element.iconEl.className = `zone-icon ${zoneClass}`;

    const statusText = this.getStatusText(zone);
    element.statusTextEl.textContent = statusText;

    // Tactical status coloring
    element.statusTextEl.classList.toggle('status-losing', statusText === 'LOSING');
    element.statusTextEl.classList.toggle('status-attacking', statusText === 'ATTACKING');
    element.statusTextEl.classList.toggle('status-secured', statusText === 'SECURED');
    element.statusTextEl.classList.toggle('status-hostile', statusText === 'HOSTILE');

    // Highlight contested/losing zones
    element.root.classList.toggle('zone-urgent', zone.state === ZoneState.CONTESTED && playerOwned);

    const showProgress = zone.state === ZoneState.CONTESTED || (zone.owner === null && zone.captureProgress > 0);
    if (showProgress) {
      element.progressContainer.style.display = 'block';
      element.progressBar.style.width = `${zone.captureProgress}%`;
      // Color the progress bar contextually
      if (playerOwned) {
        element.progressBar.className = 'capture-bar capture-bar-losing';
      } else if (enemyOwned) {
        element.progressBar.className = 'capture-bar capture-bar-attacking';
      } else {
        element.progressBar.className = 'capture-bar';
      }
    } else {
      element.progressContainer.style.display = 'none';
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

    bar.bluforFill.style.width = `${bluforPct}%`;
    bar.contestedFill.style.width = `${contestedPct}%`;

    // Label: show zone counts from player perspective
    const friendly = this.playerAlliance === Alliance.BLUFOR ? blufor : opfor;
    const enemy = this.playerAlliance === Alliance.BLUFOR ? opfor : blufor;
    const parts: string[] = [];
    if (friendly > 0) parts.push(`${friendly} HELD`);
    if (contested > 0) parts.push(`${contested} CONTESTED`);
    if (enemy > 0) parts.push(`${enemy} HOSTILE`);
    bar.label.textContent = parts.join(' \u2022 ');
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
