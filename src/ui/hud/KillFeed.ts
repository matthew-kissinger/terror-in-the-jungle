import { Faction } from '../../systems/combat/types';

export type WeaponType = 'rifle' | 'shotgun' | 'smg' | 'grenade' | 'mortar' | 'melee' | 'unknown';

interface KillEntry {
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
  private readonly MAX_ENTRIES = 6;
  private readonly ENTRY_LIFETIME = 5000; // 5 seconds
  private readonly FADE_START = 3000; // Start fading after 3 seconds

  constructor() {
    this.container = this.createContainer();
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'kill-feed';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 280px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 100;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    `;
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
      this.entries.shift();
    }

    this.render();
  }

  update(deltaTime: number): void {
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
    this.entries = this.entries.filter(entry => {
      const age = now - entry.timestamp;
      return age < this.ENTRY_LIFETIME;
    });

    if (this.entries.length !== originalLength || needsRender) {
      this.render();
    }
  }

  private render(): void {
    // Clear container
    this.container.innerHTML = '';

    // Render each entry (newest at bottom)
    this.entries.forEach(entry => {
      const entryElement = this.createEntryElement(entry);
      this.container.appendChild(entryElement);
    });
  }

  private createEntryElement(entry: KillEntry): HTMLDivElement {
    const element = document.createElement('div');
    const isExplosive = entry.weaponType === 'grenade' || entry.weaponType === 'mortar';

    element.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, ${0.6 * entry.opacity});
      border: 1px solid ${isExplosive ? `rgba(255, 100, 50, ${0.3 * entry.opacity})` : `rgba(255, 255, 255, ${0.2 * entry.opacity})`};
      border-radius: 3px;
      opacity: ${entry.opacity};
      transition: opacity 0.3s ease;
      backdrop-filter: blur(3px);
      animation: slideIn 0.2s ease-out;
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
      headshotSpan.textContent = '☠';
      headshotSpan.style.cssText = `
        color: #ff6b6b;
        font-size: 14px;
        filter: drop-shadow(0 0 3px #ff0000);
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

  private getWeaponIcon(weaponType: WeaponType): { text: string; color: string; size: string } {
    switch (weaponType) {
      case 'rifle':
        return { text: '▸', color: 'rgba(255, 255, 255, 0.8)', size: '12px' };
      case 'shotgun':
        return { text: '◈', color: '#ff9933', size: '14px' };
      case 'smg':
        return { text: '≫', color: '#ffcc33', size: '12px' };
      case 'grenade':
        return { text: '💥', color: '#ff6b35', size: '14px' };
      case 'mortar':
        return { text: '💣', color: '#ff3333', size: '14px' };
      case 'melee':
        return { text: '⚔', color: '#cccccc', size: '14px' };
      default:
        return { text: '•', color: 'rgba(255, 255, 255, 0.6)', size: '12px' };
    }
  }

  private getFactionColor(faction: Faction): string {
    switch (faction) {
      case Faction.US:
        return '#4a9eff'; // Blue for US
      case Faction.OPFOR:
        return '#ff4a4a'; // Red for OPFOR
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
      @keyframes slideIn {
        from {
          transform: translateX(100px);
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

    this.entries = [];
  }
}
