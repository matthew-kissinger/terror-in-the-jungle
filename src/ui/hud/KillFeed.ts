import { Faction } from '../../systems/combat/types';
import { colors } from '../design/tokens';
import { getWeaponIconElement, icon as iconUrl } from '../icons/IconRegistry';
import styles from './KillFeed.module.css';

export type WeaponType =
  | 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher'
  | 'grenade' | 'mortar' | 'melee'
  | 'helicopter_minigun' | 'helicopter_rocket' | 'helicopter_doorgun'
  | 'unknown';

interface KillEntry {
  id: string;
  killerName: string;
  killerFaction: Faction;
  victimName: string;
  victimFaction: Faction;
  isHeadshot: boolean;
  weaponType: WeaponType;
  isStreak: boolean;
  timestamp: number;
  opacity: number;
}

const EXPLOSIVE_TYPES: ReadonlySet<string> = new Set([
  'grenade', 'mortar', 'launcher', 'helicopter_rocket',
]);

export class KillFeed {
  private container: HTMLDivElement;
  private entries: KillEntry[] = [];
  private entryElements: Map<string, HTMLElement> = new Map();
  private entryIdCounter: number = 0;
  private readonly MAX_ENTRIES = 6;
  private readonly ENTRY_LIFETIME = 5000;
  private readonly FADE_START = 3000;
  private readonly SLIDE_OUT_DURATION = 250;

  constructor() {
    this.container = this.createContainer();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = styles.container;
    return container;
  }

  addKill(
    killerName: string,
    killerFaction: Faction,
    victimName: string,
    victimFaction: Faction,
    isHeadshot: boolean = false,
    weaponType: WeaponType = 'unknown',
    isStreak: boolean = false
  ): void {
    const entry: KillEntry = {
      id: `kill-${Date.now()}-${++this.entryIdCounter}`,
      killerName,
      killerFaction,
      victimName,
      victimFaction,
      isHeadshot,
      weaponType,
      isStreak,
      timestamp: Date.now(),
      opacity: 1.0,
    };

    this.entries.push(entry);

    if (this.entries.length > this.MAX_ENTRIES) {
      const removed = this.entries.shift();
      if (removed) {
        const element = this.entryElements.get(removed.id);
        if (element && element.parentNode) {
          element.parentNode.removeChild(element);
        }
        this.entryElements.delete(removed.id);
      }
    }

    this.render();
  }

  update(_deltaTime: number): void {
    const now = Date.now();
    let needsRender = false;

    this.entries.forEach(entry => {
      const age = now - entry.timestamp;

      if (age > this.FADE_START) {
        const fadeProgress = (age - this.FADE_START) / (this.ENTRY_LIFETIME - this.FADE_START);
        entry.opacity = Math.max(0, 1.0 - fadeProgress);
        needsRender = true;
      }
    });

    const originalLength = this.entries.length;
    const expiredIds: string[] = [];
    this.entries = this.entries.filter(entry => {
      const age = now - entry.timestamp;
      if (age >= this.ENTRY_LIFETIME) {
        expiredIds.push(entry.id);
        return false;
      }
      return true;
    });

    expiredIds.forEach(id => {
      const element = this.entryElements.get(id);
      if (element) {
        element.classList.add(styles.entrySlideOut);
        setTimeout(() => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
          this.entryElements.delete(id);
        }, this.SLIDE_OUT_DURATION);
      }
    });

    if (this.entries.length !== originalLength || needsRender) {
      this.render();
    }
  }

  private render(): void {
    const currentIds = new Set(this.entries.map(entry => entry.id));

    const idsToRemove: string[] = [];
    this.entryElements.forEach((element, id) => {
      if (!currentIds.has(id)) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        idsToRemove.push(id);
      }
    });
    idsToRemove.forEach(id => this.entryElements.delete(id));

    this.entries.forEach((entry, index) => {
      const existingElement = this.entryElements.get(entry.id);

      if (existingElement) {
        this.updateEntryElement(existingElement, entry);

        const currentIndex = Array.from(this.container.children).indexOf(existingElement);
        if (currentIndex !== index) {
          if (index === this.container.children.length) {
            this.container.appendChild(existingElement);
          } else {
            const referenceNode = this.container.children[index];
            if (referenceNode !== existingElement) {
              this.container.insertBefore(existingElement, referenceNode);
            }
          }
        }
      } else {
        const entryElement = this.createEntryElement(entry);
        entryElement.setAttribute('data-entry-id', entry.id);

        if (index === this.container.children.length) {
          this.container.appendChild(entryElement);
        } else {
          this.container.insertBefore(entryElement, this.container.children[index]);
        }

        this.entryElements.set(entry.id, entryElement);
      }
    });
  }

  private createEntryElement(entry: KillEntry): HTMLDivElement {
    const element = document.createElement('div');
    const isExplosive = EXPLOSIVE_TYPES.has(entry.weaponType);

    const entryClasses = [styles.entry];
    if (isExplosive) entryClasses.push(styles.entryExplosive);
    if (entry.isStreak) entryClasses.push(styles.entryStreak);
    element.className = entryClasses.join(' ');
    element.style.opacity = `${entry.opacity}`;

    const killerSpan = document.createElement('span');
    killerSpan.className = styles.killerName;
    killerSpan.textContent = entry.killerName;
    killerSpan.style.color = this.getFactionColor(entry.killerFaction);

    const killArrow = document.createElement('img');
    killArrow.src = iconUrl('icon-kill-arrow');
    killArrow.alt = '';
    killArrow.width = 10;
    killArrow.height = 10;
    killArrow.draggable = false;
    killArrow.style.cssText = 'display:inline-block;vertical-align:middle;object-fit:contain;image-rendering:pixelated;opacity:0.5;margin:0 2px;';

    const weaponContainer = document.createElement('span');
    const weaponClasses = [styles.weaponIcon];
    if (entry.isHeadshot) weaponClasses.push(styles.weaponIconHeadshot);
    weaponContainer.className = weaponClasses.join(' ');
    const iconElement = getWeaponIconElement(entry.weaponType);
    weaponContainer.appendChild(iconElement);

    let headshotSpan: HTMLSpanElement | null = null;
    if (entry.isHeadshot) {
      headshotSpan = document.createElement('span');
      headshotSpan.className = styles.headshotTag;
      const hsIcon = document.createElement('img');
      hsIcon.src = iconUrl('icon-headshot');
      hsIcon.alt = 'Headshot';
      hsIcon.width = 12;
      hsIcon.height = 12;
      hsIcon.draggable = false;
      hsIcon.style.cssText = 'vertical-align: middle; object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 0 2px rgba(0,0,0,0.8));';
      headshotSpan.appendChild(hsIcon);
    }

    const victimSpan = document.createElement('span');
    victimSpan.className = styles.victimName;
    victimSpan.textContent = entry.victimName;
    victimSpan.style.color = this.getFactionColor(entry.victimFaction);

    element.appendChild(killerSpan);
    element.appendChild(weaponContainer);
    if (headshotSpan) {
      element.appendChild(headshotSpan);
    }
    element.appendChild(killArrow);
    element.appendChild(victimSpan);

    return element;
  }

  private updateEntryElement(element: HTMLElement, entry: KillEntry): void {
    element.style.opacity = `${entry.opacity}`;
  }

  private getFactionColor(faction: Faction): string {
    switch (faction) {
      case Faction.US:
        return colors.us;
      case Faction.ARVN:
        return '#5ab8b8';
      case Faction.NVA:
        return colors.opfor;
      case Faction.VC:
        return '#d4943c';
      default:
        return '#ffffff';
    }
  }

  attachToDOM(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.entryElements.clear();
    this.entries = [];
  }
}
