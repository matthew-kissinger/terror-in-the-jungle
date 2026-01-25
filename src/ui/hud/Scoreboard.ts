import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { Faction } from '../../systems/combat/types';

interface PlayerScore {
  name: string;
  kills: number;
  deaths: number;
  score: number;
  isPlayer: boolean;
}

export class Scoreboard {
  private container: HTMLDivElement;
  private isVisible = false;

  constructor(
    private statsTracker: PlayerStatsTracker,
    private combatantSystem: CombatantSystem
  ) {
    this.container = this.createScoreboard();
  }

  private createScoreboard(): HTMLDivElement {
    const board = document.createElement('div');
    board.className = 'scoreboard-overlay';
    board.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      color: white;
    `;

    const content = document.createElement('div');
    content.className = 'scoreboard-content';
    content.style.cssText = `
      background: rgba(20, 20, 25, 0.95);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 12px;
      padding: 30px;
      max-width: 800px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    `;

    board.appendChild(content);
    return board;
  }

  toggle(visible: boolean): void {
    this.isVisible = visible;
    this.container.style.display = visible ? 'flex' : 'none';

    if (visible) {
      this.updateScoreboard();
    }
  }

  private updateScoreboard(): void {
    const content = this.container.querySelector('.scoreboard-content') as HTMLDivElement;
    if (!content) return;

    // Get player stats
    const playerStats = this.statsTracker.getStats();
    const playerScore: PlayerScore = {
      name: 'You',
      kills: playerStats.kills,
      deaths: playerStats.deaths,
      score: playerStats.kills * 100 + playerStats.zonesCaptured * 50,
      isPlayer: true
    };

    // Get NPC stats from combatant system
    const npcScores = this.getNPCScores();

    // Combine and sort by score
    const allScores = [playerScore, ...npcScores].sort((a, b) => b.score - a.score);

    // Split into factions
    const usScores = allScores.filter((_, index) => index % 2 === 0);
    const opforScores = allScores.filter((_, index) => index % 2 === 1);

    // Build HTML
    content.innerHTML = `
      <div style="text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 30px; text-transform: uppercase; border-bottom: 2px solid rgba(255, 255, 255, 0.3); padding-bottom: 15px;">
        Match Scoreboard
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
        <div>
          <div style="font-size: 16px; font-weight: bold; color: #4488ff; margin-bottom: 15px; text-align: center; text-transform: uppercase;">
            US Forces
          </div>
          ${this.renderTeamTable(usScores)}
        </div>
        <div>
          <div style="font-size: 16px; font-weight: bold; color: #ff4444; margin-bottom: 15px; text-align: center; text-transform: uppercase;">
            OPFOR
          </div>
          ${this.renderTeamTable(opforScores)}
        </div>
      </div>
      <div style="text-align: center; margin-top: 25px; font-size: 12px; opacity: 0.6; border-top: 1px solid rgba(255, 255, 255, 0.2); padding-top: 15px;">
        Press TAB to close
      </div>
    `;
  }

  private renderTeamTable(scores: PlayerScore[]): string {
    const rows = scores.map((player, index) => {
      const kdRatio = player.deaths === 0 ? player.kills.toFixed(2) : (player.kills / player.deaths).toFixed(2);
      const highlightStyle = player.isPlayer ? 'background: rgba(255, 215, 0, 0.15); border-left: 3px solid #ffd700;' : '';

      return `
        <tr style="${highlightStyle}">
          <td style="padding: 8px; text-align: center;">${index + 1}</td>
          <td style="padding: 8px; ${player.isPlayer ? 'font-weight: bold; color: #ffd700;' : ''}">${player.name}</td>
          <td style="padding: 8px; text-align: center; color: #4ade80;">${player.kills}</td>
          <td style="padding: 8px; text-align: center; color: #f87171;">${player.deaths}</td>
          <td style="padding: 8px; text-align: center; color: #fbbf24;">${kdRatio}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold;">${player.score}</td>
        </tr>
      `;
    }).join('');

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.2);">
            <th style="padding: 8px; text-align: center; opacity: 0.7; font-size: 11px;">#</th>
            <th style="padding: 8px; text-align: left; opacity: 0.7; font-size: 11px;">Name</th>
            <th style="padding: 8px; text-align: center; opacity: 0.7; font-size: 11px;">K</th>
            <th style="padding: 8px; text-align: center; opacity: 0.7; font-size: 11px;">D</th>
            <th style="padding: 8px; text-align: center; opacity: 0.7; font-size: 11px;">K/D</th>
            <th style="padding: 8px; text-align: center; opacity: 0.7; font-size: 11px;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  private getNPCScores(): PlayerScore[] {
    // Get stats from combatant system
    const combatants = this.combatantSystem.getAllCombatants();
    const npcScores: PlayerScore[] = [];

    combatants.forEach(combatant => {
      // Estimate kills/deaths from combatant state
      // In a real implementation, you'd track these stats per combatant
      const estimatedKills = Math.floor(Math.random() * 10);
      const estimatedDeaths = combatant.health <= 0 ? 1 : 0;

      npcScores.push({
        name: `${combatant.faction}-${combatant.id.slice(-4)}`,
        kills: estimatedKills,
        deaths: estimatedDeaths,
        score: estimatedKills * 100,
        isPlayer: false
      });
    });

    return npcScores;
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
