/**
 * ScoreboardPanel - Full-screen match scoreboard overlay.
 *
 * Shows faction-split tables with K/A/D/KD/Score for all combatants.
 * Player's own row is highlighted. Sorted by score descending.
 *
 * Replaces: Scoreboard (old class with inline styles + innerHTML)
 */

import { UIComponent } from '../engine/UIComponent';
import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import { Faction } from '../../systems/combat/types';
import { isTouchDevice } from '../../utils/DeviceDetector';
import styles from './ScoreboardPanel.module.css';

interface PlayerScore {
  name: string;
  kills: number;
  assists: number;
  deaths: number;
  score: number;
  isPlayer: boolean;
  faction: Faction;
}

export class ScoreboardPanel extends UIComponent {
  private isVisible = false;

  constructor(
    private statsTracker: PlayerStatsTracker,
    private combatantSystem: CombatantSystem
  ) {
    super();
  }

  protected build(): void {
    this.root.className = styles.overlay;
    this.root.innerHTML = `<div class="${styles.content}"></div>`;
  }

  // --- Public API ---

  toggle(visible: boolean): void {
    this.isVisible = visible;
    this.toggleClass(styles.visible, visible);
    if (visible) {
      this.refresh();
    }
  }

  // --- Private ---

  private refresh(): void {
    const content = this.root.querySelector(`.${styles.content}`) as HTMLDivElement;
    if (!content) return;

    const playerStats = this.statsTracker.getStats();
    const playerScore: PlayerScore = {
      name: 'You',
      kills: playerStats.kills,
      assists: playerStats.assists,
      deaths: playerStats.deaths,
      score: playerStats.kills * 100 + playerStats.assists * 50 + playerStats.zonesCaptured * 50,
      isPlayer: true,
      faction: Faction.US,
    };

    const npcScores = this.getNPCScores();
    const all = [playerScore, ...npcScores];

    const usScores = all.filter(s => s.faction === Faction.US).sort((a, b) => b.score - a.score);
    const opforScores = all.filter(s => s.faction === Faction.OPFOR).sort((a, b) => b.score - a.score);

    const teamStats = this.combatantSystem.getTeamKillStats();
    const usTotals = {
      kills: teamStats.usKills + playerStats.kills,
      deaths: teamStats.usDeaths + playerStats.deaths,
    };
    const opforTotals = {
      kills: teamStats.opforKills,
      deaths: teamStats.opforDeaths,
    };

    const closeHint = isTouchDevice() ? 'Tap outside to close' : 'Press TAB to close';

    content.innerHTML = `
      <div class="${styles.title}">Match Scoreboard</div>
      <div class="${styles.grid}">
        <div>
          <div class="${styles.teamLabel} ${styles.teamLabelUS}">US Forces</div>
          ${this.renderTable(usScores, usTotals)}
        </div>
        <div>
          <div class="${styles.teamLabel} ${styles.teamLabelOPFOR}">OPFOR</div>
          ${this.renderTable(opforScores, opforTotals)}
        </div>
      </div>
      <div class="${styles.hint}">${closeHint}</div>
    `;
  }

  private renderTable(scores: PlayerScore[], totals: { kills: number; deaths: number }): string {
    const rows = scores.map((p, i) => {
      const kd = p.deaths === 0 ? p.kills.toFixed(2) : (p.kills / p.deaths).toFixed(2);
      const rowClass = p.isPlayer ? styles.playerRow : '';
      return `
        <tr class="${rowClass}">
          <td>${i + 1}</td>
          <td>${p.name}</td>
          <td>${p.kills}</td>
          <td>${p.assists}</td>
          <td>${p.deaths}</td>
          <td>${kd}</td>
          <td>${p.score}</td>
        </tr>
      `;
    }).join('');

    const totalKd = totals.deaths === 0 ? totals.kills.toFixed(2) : (totals.kills / totals.deaths).toFixed(2);

    return `
      <table class="${styles.table}">
        <thead>
          <tr>
            <th>#</th><th>Name</th><th>K</th><th>A</th><th>D</th><th>K/D</th><th>Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="${styles.totalRow}">
            <td>-</td>
            <td>Team Total</td>
            <td>${totals.kills}</td>
            <td>-</td>
            <td>${totals.deaths}</td>
            <td>${totalKd}</td>
            <td>-</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  private getNPCScores(): PlayerScore[] {
    const combatants = this.combatantSystem.getAllCombatants();
    const scores: PlayerScore[] = [];

    combatants.forEach(combatant => {
      scores.push({
        name: `${combatant.faction}-${combatant.id.slice(-4)}`,
        kills: combatant.kills || 0,
        assists: 0,
        deaths: combatant.deaths || 0,
        score: (combatant.kills || 0) * 100,
        isPlayer: false,
        faction: combatant.faction,
      });
    });

    return scores;
  }
}
