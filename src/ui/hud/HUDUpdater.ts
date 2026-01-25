import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { Faction } from '../../systems/combat/types';
import { ZoneManager, ZoneState, CaptureZone } from '../../systems/world/ZoneManager';
import { TicketSystem } from '../../systems/world/TicketSystem';
import { HUDElements } from './HUDElements';
import { GameMode } from '../../config/gameModes';

export class HUDUpdater {
  private elements: HUDElements;
  private playerKills = 0;
  private playerDeaths = 0;

  constructor(elements: HUDElements) {
    this.elements = elements;
  }

  updateObjectivesDisplay(zoneManager: ZoneManager, isTDM: boolean = false): void {
    if (isTDM) {
      this.elements.objectivesList.style.display = 'none';
      return;
    }
    this.elements.objectivesList.style.display = 'block';

    const zones = zoneManager.getAllZones();
    const capturableZones = zones.filter(z => !z.isHomeBase);

    // Clear current display (keep title)
    while (this.elements.objectivesList.children.length > 1) {
      this.elements.objectivesList.removeChild(this.elements.objectivesList.lastChild!);
    }

    // Add each zone
    capturableZones.forEach(zone => {
      const zoneElement = this.createZoneElement(zone);
      this.elements.objectivesList.appendChild(zoneElement);
    });
  }

  private createZoneElement(zone: CaptureZone): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'zone-item';

    // Determine zone class
    let zoneClass = 'zone-neutral';
    let statusText = 'Neutral';

    switch (zone.state) {
      case ZoneState.US_CONTROLLED:
        zoneClass = 'zone-us';
        statusText = 'US';
        break;
      case ZoneState.OPFOR_CONTROLLED:
        zoneClass = 'zone-opfor';
        statusText = 'OPFOR';
        break;
      case ZoneState.CONTESTED:
        zoneClass = 'zone-contested';
        statusText = 'Contested';
        break;
    }

    // Calculate distance to player
    const distance = Math.round(zone.position.length());

    element.innerHTML = `
      <div>
        <span class="zone-name">${zone.name}</span>
        <span class="zone-distance">${distance}m</span>
      </div>
      <div class="zone-status">
        <div class="zone-icon ${zoneClass}"></div>
      </div>
    `;

    // Add capture progress bar if contested
    if (zone.state === ZoneState.CONTESTED) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'capture-progress';
      const progressBar = document.createElement('div');
      progressBar.className = 'capture-bar';
      progressBar.style.width = `${zone.captureProgress}%`;
      progressContainer.appendChild(progressBar);
      element.appendChild(progressContainer);
    }

    return element;
  }

  updateTicketDisplay(usTickets: number, opforTickets: number, isTDM: boolean = false, target: number = 0): void {
    if (isTDM) {
      this.elements.ticketDisplay.innerHTML = `
        <div style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); width: 200px; text-align: center; color: #aaa; font-size: 10px; letter-spacing: 1px; font-weight: bold;">FIRST TO ${target} KILLS</div>
        <div class="faction-tickets">
          <div class="faction-name">US Kills</div>
          <div class="ticket-count us-tickets">${Math.round(usTickets)}</div>
        </div>
        <div class="ticket-separator">VS</div>
        <div class="faction-tickets">
          <div class="faction-name">OPFOR Kills</div>
          <div class="ticket-count opfor-tickets">${Math.round(opforTickets)}</div>
        </div>
      `;
      return;
    }

    this.elements.ticketDisplay.innerHTML = `
      <div class="faction-tickets">
        <div class="faction-name">US Forces</div>
        <div class="ticket-count us-tickets">${Math.round(usTickets)}</div>
      </div>
      <div class="ticket-separator">VS</div>
      <div class="faction-tickets">
        <div class="faction-name">OPFOR</div>
        <div class="ticket-count opfor-tickets">${Math.round(opforTickets)}</div>
      </div>
    `;
  }

  updateCombatStats(combatantSystem: CombatantSystem): void {
    const stats = combatantSystem.getCombatStats();

    this.elements.combatStats.innerHTML = `
      <div class="stat-line">Allies: ${stats.us}</div>
      <div class="stat-line">Enemies: ${stats.opfor}</div>
      <div class="stat-line">Total: ${stats.total}</div>
    `;
  }

  updateKillCounter(): void {
    const kd = this.playerDeaths > 0
      ? (this.playerKills / this.playerDeaths).toFixed(2)
      : this.playerKills.toFixed(2);

    this.elements.killCounter.innerHTML = `
      <div><span class="kill-count">${this.playerKills}</span> Kills</div>
      <div><span class="death-count">${this.playerDeaths}</span> Deaths</div>
      <div class="kd-ratio">K/D: ${kd}</div>
    `;
  }

  updateGameStatus(ticketSystem: TicketSystem): void {
    const gameState = ticketSystem.getGameState();
    const bleedRate = ticketSystem.getTicketBleedRate();
    const timeRemaining = ticketSystem.getMatchTimeRemaining();

    // Update game status class
    this.elements.gameStatus.className = `game-status phase-${gameState.phase.toLowerCase()}`;

    let statusText = '';
    switch (gameState.phase) {
      case 'SETUP':
        statusText = 'PREPARE FOR BATTLE';
        break;
      case 'COMBAT':
        statusText = 'IN COMBAT';
        break;
      case 'OVERTIME':
        statusText = 'OVERTIME!';
        break;
      case 'ENDED':
        statusText = gameState.winner ? `${gameState.winner} VICTORY!` : 'GAME ENDED';
        break;
    }

    let timeText = '';
    if (timeRemaining > 0) {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = Math.floor(timeRemaining % 60);
      timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    let bleedText = '';
    if (bleedRate.bleedPerSecond > 0) {
      if (bleedRate.usTickets > bleedRate.opforTickets) {
        bleedText = `US bleeding ${bleedRate.usTickets.toFixed(1)}/sec`;
      } else if (bleedRate.opforTickets > bleedRate.usTickets) {
        bleedText = `OPFOR bleeding ${bleedRate.opforTickets.toFixed(1)}/sec`;
      }
    }

    this.elements.gameStatus.innerHTML = `
      <div>${statusText}</div>
      ${timeText ? `<div class="time-remaining">${timeText}</div>` : ''}
      ${bleedText ? `<div class="bleed-indicator">${bleedText}</div>` : ''}
    `;
  }

  addKill(): void {
    this.playerKills++;
    this.updateKillCounter();
    this.elements.showHitMarker('kill');
  }

  addDeath(): void {
    this.playerDeaths++;
    this.updateKillCounter();
  }

  updateTimer(timeRemaining: number): void {
    const timerDisplay = this.elements.timerElement.querySelector('.timer-display') as HTMLElement;
    if (!timerDisplay) return;

    const minutes = Math.floor(Math.max(0, timeRemaining) / 60);
    const seconds = Math.floor(Math.max(0, timeRemaining) % 60);
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    timerDisplay.textContent = timeText;

    // Update color based on time remaining
    if (timeRemaining <= 0) {
      timerDisplay.style.color = '#ff0000';
      this.elements.timerElement.classList.add('timer-critical');
    } else if (timeRemaining <= 30) {
      timerDisplay.style.color = '#ff0000';
      this.elements.timerElement.classList.add('timer-critical');
      this.elements.timerElement.classList.remove('timer-warning');
    } else if (timeRemaining <= 60) {
      timerDisplay.style.color = '#ffff00';
      this.elements.timerElement.classList.add('timer-warning');
      this.elements.timerElement.classList.remove('timer-critical');
    } else {
      timerDisplay.style.color = '#ffffff';
      this.elements.timerElement.classList.remove('timer-warning', 'timer-critical');
    }
  }

  getPlayerKills(): number {
    return this.playerKills;
  }

  getPlayerDeaths(): number {
    return this.playerDeaths;
  }
}