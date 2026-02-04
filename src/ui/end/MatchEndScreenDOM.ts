/**
 * DOM element creation and HTML generation for the Match End Screen
 */

import { Faction } from '../../systems/combat/types';
import { GameState } from '../../systems/world/TicketSystem';
import { MatchStats } from './MatchEndScreen';

interface Award {
  name: string;
  value: string;
}

function generateAwards(stats: MatchStats): Award[] {
  const awards: Award[] = [];

  // Kill Streak - Show if bestKillStreak >= 3
  if (stats.bestKillStreak >= 3) {
    awards.push({
      name: 'Kill Streak',
      value: `${stats.bestKillStreak} kills`
    });
  }

  // Sharpshooter - Show if accuracy >= 40%
  const accuracy = Math.round(stats.accuracy * 100);
  if (accuracy >= 40) {
    awards.push({
      name: 'Sharpshooter',
      value: `${accuracy}% accuracy`
    });
  }

  // Long Range - Show if longestKill >= 50m
  if (stats.longestKill >= 50) {
    awards.push({
      name: 'Long Range',
      value: `${stats.longestKill}m`
    });
  }

  // Grenade Expert - Show if grenadeKills >= 2
  if (stats.grenadeKills >= 2) {
    awards.push({
      name: 'Grenade Expert',
      value: `${stats.grenadeKills} grenade kills`
    });
  }

  // Untouchable - Show if deaths == 0
  if (stats.deaths === 0) {
    awards.push({
      name: 'Untouchable',
      value: 'No deaths'
    });
  }

  return awards;
}

export function createMatchEndScreenHTML(
  winner: Faction,
  gameState: GameState,
  stats: MatchStats
): string {
  const isVictory = winner === Faction.US;

  const minutes = Math.floor(gameState.matchDuration / 60);
  const seconds = Math.floor(gameState.matchDuration % 60);
  const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
  const headshotPct = stats.kills > 0 ? Math.round((stats.headshots / stats.kills) * 100) : 0;
  const accuracy = Math.round(stats.accuracy * 100);

  const awards = generateAwards(stats);
  const awardsHTML = awards.length > 0 ? `
    <div class="awards-section">
      <div class="awards-title">Match Awards</div>
      <div class="awards-container">
        ${awards.map(award => `
          <div class="award-badge">
            <div class="award-name">${award.name}</div>
            <div class="award-value">${award.value}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="end-screen-header">
      <div class="end-screen-title">${isVictory ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="end-screen-subtitle">${winner} wins the battle</div>
    </div>

    <div class="stats-panel">
      <div class="stats-column">
        <div class="stats-section">
          <div class="stats-section-title">Match Results</div>
          <div class="ticket-comparison">
            <div class="faction-score us">
              <div class="faction-name">US ${gameState.isTDM ? 'Kills' : 'Tickets'}</div>
              <div class="faction-tickets">${Math.round(stats.usTickets)}</div>
            </div>
            <div class="vs-divider">VS</div>
            <div class="faction-score opfor">
              <div class="faction-name">OPFOR ${gameState.isTDM ? 'Kills' : 'Tickets'}</div>
              <div class="faction-tickets">${Math.round(stats.opforTickets)}</div>
            </div>
          </div>
          <div class="stat-row">
            <span class="stat-label">Match Duration</span>
            <span class="stat-value">${durationText}</span>
          </div>
        </div>

        <div class="stats-section">
          <div class="stats-section-title">Team Combat Totals</div>
          <div class="ticket-comparison team-kd-comparison">
            <div class="faction-score us">
              <div class="faction-name">US K/D</div>
              <div class="faction-tickets">${stats.usTeamKills} / ${stats.usTeamDeaths}</div>
            </div>
            <div class="vs-divider">VS</div>
            <div class="faction-score opfor">
              <div class="faction-name">OPFOR K/D</div>
              <div class="faction-tickets">${stats.opforTeamKills} / ${stats.opforTeamDeaths}</div>
            </div>
          </div>
        </div>

        <div class="stats-section">
          <div class="stats-section-title">Combat Performance</div>
          <div class="stat-row">
            <span class="stat-label">Kills</span>
            <span class="stat-value highlight">${stats.kills}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Assists</span>
            <span class="stat-value highlight">${stats.assists}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Deaths</span>
            <span class="stat-value">${stats.deaths}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">K/D Ratio</span>
            <span class="stat-value">${kd}</span>
          </div>
          ${!gameState.isTDM ? `
          <div class="stat-row">
            <span class="stat-label">Zones Captured</span>
            <span class="stat-value highlight">${stats.zonesCaptured}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="stats-column">
        <div class="stats-section">
          <div class="stats-section-title">Accuracy & Damage</div>
          <div class="stat-row">
            <span class="stat-label">Total Damage</span>
            <span class="stat-value">${stats.damageDealt.toLocaleString()}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Accuracy</span>
            <span class="stat-value">${accuracy}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Headshots</span>
            <span class="stat-value">${stats.headshots} <span style="opacity:0.6; font-size:0.9em">(${headshotPct}%)</span></span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Longest Kill</span>
            <span class="stat-value">${stats.longestKill}m</span>
          </div>
        </div>

        <div class="stats-section">
          <div class="stats-section-title">Explosives</div>
          <div class="stat-row">
            <span class="stat-label">Grenades Thrown</span>
            <span class="stat-value">${stats.grenadesThrown}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Grenade Kills</span>
            <span class="stat-value">${stats.grenadeKills}</span>
          </div>
        </div>
      </div>
    </div>

    ${awardsHTML}

    <div class="end-screen-actions">
      <button class="end-screen-button primary play-again-btn">Play Again</button>
      <button class="end-screen-button return-menu-btn">Return to Menu</button>
    </div>
  `;
}
