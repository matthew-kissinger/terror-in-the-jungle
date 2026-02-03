export class CombatStatsDisplay {
  public combatStats: HTMLDivElement;
  public killCounter: HTMLDivElement;

  constructor() {
    this.combatStats = this.createCombatStats();
    this.killCounter = this.createKillCounter();
  }

  private createCombatStats(): HTMLDivElement {
    const stats = document.createElement('div');
    stats.className = 'combat-stats';
    return stats;
  }

  private createKillCounter(): HTMLDivElement {
    const counter = document.createElement('div');
    counter.className = 'kill-counter';
    counter.innerHTML = `
      <div><span class="kill-count">0</span> Kills</div>
      <div><span class="death-count">0</span> Deaths</div>
      <div class="kd-ratio">K/D: 0.00</div>
    `;
    return counter;
  }
}
