import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { Faction } from '../../systems/combat/types';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { colors } from '../design/tokens';

interface PlayerScore {
  name: string;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  isPlayer: boolean;
  faction: Faction;
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
      background: rgba(8, 12, 18, 0.85);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 200;
      pointer-events: none;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      color: rgba(220, 225, 230, 0.95);
      backdrop-filter: blur(6px);
    `;

    const content = document.createElement('div');
    content.className = 'scoreboard-content';
    content.style.cssText = `
      background: rgba(8, 12, 18, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 24px;
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
      assists: playerStats.assists,
      deaths: playerStats.deaths,
      score: playerStats.kills * 100 + playerStats.assists * 50 + playerStats.zonesCaptured * 50,
      isPlayer: true,
      faction: Faction.US
    };

    // Get NPC stats from combatant system
    const npcScores = this.getNPCScores();

    // Combine and split by faction
    const allScores = [playerScore, ...npcScores];

    // Split into factions
    const usScores = allScores
      .filter(score => score.faction === Faction.US)
      .sort((a, b) => b.score - a.score);
    const opforScores = allScores
      .filter(score => score.faction === Faction.OPFOR)
      .sort((a, b) => b.score - a.score);

    const teamKillStats = this.combatantSystem.getTeamKillStats();
    const usTotals = {
      kills: teamKillStats.usKills + playerStats.kills,
      deaths: teamKillStats.usDeaths + playerStats.deaths
    };
    const opforTotals = {
      kills: teamKillStats.opforKills,
      deaths: teamKillStats.opforDeaths
    };

    const closeHint = isTouchDevice() ? 'Tap outside to close' : 'Press TAB to close';

    // Build HTML
    content.innerHTML = `
      <div class="scoreboard-title">
        Match Scoreboard
      </div>
      <div class="scoreboard-grid">
        <div>
          <div class="scoreboard-team-label" style="font-weight: bold; color: ${colors.us}; text-align: center; text-transform: uppercase;">
            US Forces
          </div>
          ${this.renderTeamTable(usScores, usTotals)}
        </div>
        <div>
          <div class="scoreboard-team-label" style="font-weight: bold; color: ${colors.opfor}; text-align: center; text-transform: uppercase;">
            OPFOR
          </div>
          ${this.renderTeamTable(opforScores, opforTotals)}
        </div>
      </div>
      <div class="scoreboard-hint">
        ${closeHint}
      </div>
    `;
  }

  private renderTeamTable(scores: PlayerScore[], totals: { kills: number; deaths: number }): string {
    const rows = scores.map((player, index) => {
      const kdRatio = player.deaths === 0 ? player.kills.toFixed(2) : (player.kills / player.deaths).toFixed(2);
      const highlightStyle = player.isPlayer ? 'background: rgba(220, 225, 230, 0.08); border-left: 2px solid rgba(220, 225, 230, 0.5);' : '';

      return `
        <tr style="${highlightStyle}">
          <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.4);">${index + 1}</td>
          <td style="padding: 6px 8px; ${player.isPlayer ? 'font-weight: 700; color: rgba(220, 225, 230, 0.95);' : 'color: rgba(220, 225, 230, 0.7);'}">${player.name}</td>
          <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.8);">${player.kills}</td>
          <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.5);">${player.assists}</td>
          <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.5);">${player.deaths}</td>
          <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.6);">${kdRatio}</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: 700;">${player.score}</td>
        </tr>
      `;
    }).join('');

    const totalKd = totals.deaths === 0 ? totals.kills.toFixed(2) : (totals.kills / totals.deaths).toFixed(2);

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">#</th>
            <th style="padding: 6px 8px; text-align: left; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Name</th>
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600;">K</th>
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600;">A</th>
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600;">D</th>
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600;">K/D</th>
            <th style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.35); font-size: 10px; font-weight: 600;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="border-top: 1px solid rgba(255, 255, 255, 0.1); font-weight: 700;">
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.3);">-</td>
            <td style="padding: 6px 8px; color: rgba(220, 225, 230, 0.6);">Team Total</td>
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.8);">${totals.kills}</td>
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.4);">-</td>
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.5);">${totals.deaths}</td>
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.6);">${totalKd}</td>
            <td style="padding: 6px 8px; text-align: center; color: rgba(220, 225, 230, 0.3);">-</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private getNPCScores(): PlayerScore[] {
    // Get stats from combatant system
    const combatants = this.combatantSystem.getAllCombatants();
    const npcScores: PlayerScore[] = [];

    combatants.forEach(combatant => {
      // Use real tracked stats per combatant
      const kills = combatant.kills || 0;
      const deaths = combatant.deaths || 0;
      // Assists are not yet tracked per-combatant (only player assists tracked)
      const assists = 0;

      npcScores.push({
        name: `${combatant.faction}-${combatant.id.slice(-4)}`,
        kills: kills,
        assists: assists,
        deaths: deaths,
        score: kills * 100 + assists * 50,
        isPlayer: false,
        faction: combatant.faction
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
