import { Faction } from '../../systems/combat/types';
import { colors } from '../design/tokens';

export type WeaponType = 'rifle' | 'shotgun' | 'smg' | 'grenade' | 'mortar' | 'melee' | 'unknown';

interface KillEntry {
  id: string;
  killerName: string;
  killerFaction: Faction;
  victimName: string;
  victimFaction: Faction;
  isHeadshot: boolean;
  weaponType: WeaponType;
  timestamp: number;
  opacity: number;
}

export class KillFeed {
  private container: HTMLDivElement;
  private entries: KillEntry[] = [];
  private entryElements: Map<string, HTMLElement> = new Map();
  private entryIdCounter: number = 0;
  private readonly MAX_ENTRIES = 6;
  private readonly ENTRY_LIFETIME = 5000; // 5 seconds
  private readonly FADE_START = 3000; // Start fading after 3 seconds

  constructor() {
    this.container = this.createContainer();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'kill-feed';
    return container;
  }

  addKill(
    killerName: string,
    killerFaction: Faction,
    victimName: string,
    victimFaction: Faction,
    isHeadshot: boolean = false,
    weaponType: WeaponType = 'unknown'
  ): void {
    const entry: KillEntry = {
      id: `kill-${Date.now()}-${++this.entryIdCounter}`,
      killerName,
      killerFaction,
      victimName,
      victimFaction,
      isHeadshot,
      weaponType,
      timestamp: Date.now(),
      opacity: 1.0
    };

    this.entries.push(entry);

    // Remove oldest entries if we exceed max
    if (this.entries.length > this.MAX_ENTRIES) {
      const removed = this.entries.shift();
      if (removed) {
        // Clean up DOM element for removed entry
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

    // Update opacity for fading entries
    this.entries.forEach(entry => {
      const age = now - entry.timestamp;

      if (age > this.FADE_START) {
        const fadeProgress = (age - this.FADE_START) / (this.ENTRY_LIFETIME - this.FADE_START);
        entry.opacity = Math.max(0, 1.0 - fadeProgress);
        needsRender = true;
      }
    });

    // Remove expired entries
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

    // Clean up DOM elements for expired entries
    expiredIds.forEach(id => {
      const element = this.entryElements.get(id);
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.entryElements.delete(id);
    });

    if (this.entries.length !== originalLength || needsRender) {
      this.render();
    }
  }

  private render(): void {
    // Build set of current entry IDs
    const currentIds = new Set(this.entries.map(entry => entry.id));

    // Remove DOM elements for entries that no longer exist
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

    // Update or create elements for each entry (newest at bottom)
    this.entries.forEach((entry, index) => {
      const existingElement = this.entryElements.get(entry.id);

      if (existingElement) {
        // Update existing element opacity and styles
        this.updateEntryElement(existingElement, entry);
        
        // Ensure correct order - move element if needed
        const currentIndex = Array.from(this.container.children).indexOf(existingElement);
        if (currentIndex !== index) {
          // Insert at correct position
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
        // Create new element
        const entryElement = this.createEntryElement(entry);
        entryElement.setAttribute('data-entry-id', entry.id);
        
        // Insert at correct position (newest at bottom)
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
    const isExplosive = entry.weaponType === 'grenade' || entry.weaponType === 'mortar';

    element.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 5px;
      padding: 3px 6px;
      background: rgba(8, 12, 18, ${0.45 * entry.opacity});
      border-left: 2px solid ${isExplosive ? `rgba(212, 163, 68, ${0.4 * entry.opacity})` : `rgba(220, 225, 230, ${0.1 * entry.opacity})`};
      border-radius: 0 2px 2px 0;
      opacity: ${entry.opacity};
      transition: opacity 0.3s ease;
      backdrop-filter: blur(4px);
      animation: slideIn 0.15s ease-out;
    `;

    // Killer name
    const killerSpan = document.createElement('span');
    killerSpan.textContent = entry.killerName;
    killerSpan.style.cssText = `
      color: ${this.getFactionColor(entry.killerFaction)};
      font-weight: bold;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    `;

    // Weapon icon
    const weaponSpan = document.createElement('span');
    const weaponIcon = this.getWeaponIcon(entry.weaponType);
    weaponSpan.textContent = weaponIcon.text;
    weaponSpan.style.cssText = `
      color: ${weaponIcon.color};
      font-size: ${weaponIcon.size};
      font-weight: bold;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    `;

    // Headshot indicator (after weapon, before victim)
    let headshotSpan: HTMLSpanElement | null = null;
    if (entry.isHeadshot) {
      headshotSpan = document.createElement('span');
      headshotSpan.textContent = 'HS';
      headshotSpan.style.cssText = `
        color: rgba(255, 200, 120, 0.9);
        font-size: 9px;
        font-weight: 700;
        font-family: 'Rajdhani', sans-serif;
        letter-spacing: 0.5px;
      `;
    }

    // Victim name
    const victimSpan = document.createElement('span');
    victimSpan.textContent = entry.victimName;
    victimSpan.style.cssText = `
      color: ${this.getFactionColor(entry.victimFaction)};
      font-weight: bold;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    `;

    element.appendChild(killerSpan);
    element.appendChild(weaponSpan);
    if (headshotSpan) {
      element.appendChild(headshotSpan);
    }
    element.appendChild(victimSpan);

    return element;
  }

  private updateEntryElement(element: HTMLElement, entry: KillEntry): void {
    const isExplosive = entry.weaponType === 'grenade' || entry.weaponType === 'mortar';
    
    // Update opacity and styles
    element.style.opacity = `${entry.opacity}`;
    element.style.background = `rgba(0, 0, 0, ${0.6 * entry.opacity})`;
    element.style.border = `1px solid ${isExplosive ? `rgba(255, 100, 50, ${0.3 * entry.opacity})` : `rgba(255, 255, 255, ${0.2 * entry.opacity})`}`;
  }

  private getWeaponIcon(weaponType: WeaponType): { text: string; color: string; size: string } {
    switch (weaponType) {
      case 'rifle':
        return { text: '[AR]', color: 'rgba(255, 255, 255, 0.6)', size: '10px' };
      case 'shotgun':
        return { text: '[SG]', color: 'rgba(255, 255, 255, 0.6)', size: '10px' };
      case 'smg':
        return { text: '[SM]', color: 'rgba(255, 255, 255, 0.6)', size: '10px' };
      case 'grenade':
        return { text: '[GR]', color: 'rgba(255, 180, 100, 0.7)', size: '10px' };
      case 'mortar':
        return { text: '[MT]', color: 'rgba(255, 140, 100, 0.7)', size: '10px' };
      case 'melee':
        return { text: '[ML]', color: 'rgba(255, 255, 255, 0.6)', size: '10px' };
      default:
        return { text: '--', color: 'rgba(255, 255, 255, 0.4)', size: '10px' };
    }
  }

  private getFactionColor(faction: Faction): string {
    switch (faction) {
      case Faction.US:
        return colors.us;
      case Faction.OPFOR:
        return colors.opfor;
      default:
        return '#ffffff';
    }
  }

  attachToDOM(parent: HTMLElement): void {
    parent.appendChild(this.container);
    this.injectStyles();
  }

  private injectStyles(): void {
    // Check if styles already exist
    if (document.getElementById('kill-feed-styles')) return;

    const style = document.createElement('style');
    style.id = 'kill-feed-styles';
    style.textContent = `
      .kill-feed {
        position: fixed;
        bottom: max(120px, calc(120px + env(safe-area-inset-bottom, 0px)));
        right: max(var(--hud-edge-inset, 16px), env(safe-area-inset-right, 0px));
        width: 220px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 100;
        pointer-events: none;
        font-family: 'Rajdhani', sans-serif;
        font-size: 11px;
        font-weight: 600;
      }

      @media (max-width: 1024px) {
        .kill-feed {
          bottom: max(100px, calc(100px + env(safe-area-inset-bottom, 0px)));
          width: 180px;
          font-size: 10px;
        }
      }

      @media (max-width: 480px) {
        .kill-feed {
          bottom: calc(200px + env(safe-area-inset-bottom, 0px));
          width: 160px;
          font-size: 9px;
        }
      }

      @keyframes slideIn {
        from {
          transform: translateX(60px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // Clean up injected styles
    const styleElement = document.getElementById('kill-feed-styles');
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }

    // Clean up DOM elements map
    this.entryElements.clear();
    this.entries = [];
  }
}
