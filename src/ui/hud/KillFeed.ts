import { Faction } from '../../systems/combat/types';

interface KillEntry {
  killerName: string;
  killerFaction: Faction;
  victimName: string;
  victimFaction: Faction;
  isHeadshot: boolean;
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
    isHeadshot: boolean = false
  ): void {
    const entry: KillEntry = {
      killerName,
      killerFaction,
      victimName,
      victimFaction,
      isHeadshot,
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
    element.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, ${0.6 * entry.opacity});
      border: 1px solid rgba(255, 255, 255, ${0.2 * entry.opacity});
      border-radius: 3px;
      opacity: ${entry.opacity};
      transition: opacity 0.3s ease;
      backdrop-filter: blur(3px);
    `;

    // Killer name
    const killerSpan = document.createElement('span');
    killerSpan.textContent = entry.killerName;
    killerSpan.style.cssText = `
      color: ${this.getFactionColor(entry.killerFaction)};
      font-weight: bold;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
    `;

    // Weapon/kill icon
    const iconSpan = document.createElement('span');
    if (entry.isHeadshot) {
      iconSpan.textContent = '[HS]';
      iconSpan.style.cssText = `
        color: #ff6b6b;
        font-weight: bold;
        font-size: 10px;
      `;
    } else {
      iconSpan.textContent = '>';
      iconSpan.style.cssText = `
        color: rgba(255, 255, 255, 0.6);
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
    element.appendChild(iconSpan);
    element.appendChild(victimSpan);

    return element;
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
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.entries = [];
  }
}
