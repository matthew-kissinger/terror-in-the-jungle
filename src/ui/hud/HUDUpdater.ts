import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { TicketSystem } from '../../systems/world/TicketSystem';
import { HUDElements } from './HUDElements';
import { HUDZoneDisplay } from './HUDZoneDisplay';

export class HUDUpdater {
  private elements: HUDElements;
  private playerKills = 0;
  private playerDeaths = 0;
  private zoneDisplay: HUDZoneDisplay;

  private ticketHeader!: HTMLDivElement;
  private usTicketName!: HTMLDivElement;
  private usTicketCount!: HTMLDivElement;
  private opforTicketName!: HTMLDivElement;
  private opforTicketCount!: HTMLDivElement;
  private ticketDisplayMode: 'tdm' | 'standard' | null = null;

  private combatStatsLines: HTMLDivElement[] = [];
  private killCountEl?: HTMLSpanElement;
  private deathCountEl?: HTMLSpanElement;
  private kdRatioEl?: HTMLDivElement;
  private gameStatusTextEl?: HTMLDivElement;
  private bleedIndicatorEl?: HTMLDivElement;
  private lastUsTicketsText = '';
  private lastOpforTicketsText = '';
  private lastTicketHeaderText = '';
  private lastCombatStats: { us: number; opfor: number; total: number } | null = null;
  private lastStatusText = '';
  private lastBleedText = '';
  private lastBleedVisible = false;
  private lastTimerText = '';
  private lastTimerColor = '';
  private lastTimerClass = '';

  constructor(elements: HUDElements) {
    this.elements = elements;
    this.zoneDisplay = new HUDZoneDisplay(elements);
    this.initializeTicketDisplay();
    this.initializeCombatStats();
    this.initializeKillCounter();
    this.initializeGameStatus();
  }

  updateObjectivesDisplay(zoneManager: ZoneManager, isTDM: boolean = false): void {
    this.zoneDisplay.updateObjectivesDisplay(zoneManager, isTDM);
  }

  updateTicketDisplay(usTickets: number, opforTickets: number, isTDM: boolean = false, target: number = 0): void {
    const mode: 'tdm' | 'standard' = isTDM ? 'tdm' : 'standard';
    if (this.ticketDisplayMode !== mode) {
      this.ticketDisplayMode = mode;
      if (isTDM) {
        this.ticketHeader.style.display = 'block';
        this.usTicketName.textContent = 'US Kills';
        this.opforTicketName.textContent = 'OPFOR Kills';
      } else {
        this.ticketHeader.style.display = 'none';
        this.usTicketName.textContent = 'US Forces';
        this.opforTicketName.textContent = 'OPFOR';
      }
    }

    if (isTDM) {
      const headerText = `FIRST TO ${target} KILLS`;
      if (this.lastTicketHeaderText !== headerText) {
        this.ticketHeader.textContent = headerText;
        this.lastTicketHeaderText = headerText;
      }
    }

    const usText = `${Math.round(usTickets)}`;
    const opforText = `${Math.round(opforTickets)}`;
    if (this.lastUsTicketsText !== usText) {
      this.usTicketCount.textContent = usText;
      this.lastUsTicketsText = usText;
    }
    if (this.lastOpforTicketsText !== opforText) {
      this.opforTicketCount.textContent = opforText;
      this.lastOpforTicketsText = opforText;
    }
  }

  updateCombatStats(combatantSystem: CombatantSystem): void {
    const stats = combatantSystem.getCombatStats();

    if (this.combatStatsLines.length === 0) {
      return;
    }

    if (
      this.lastCombatStats &&
      this.lastCombatStats.us === stats.us &&
      this.lastCombatStats.opfor === stats.opfor &&
      this.lastCombatStats.total === stats.total
    ) {
      return;
    }

    this.combatStatsLines[0].textContent = `Allies: ${stats.us}`;
    this.combatStatsLines[1].textContent = `Enemies: ${stats.opfor}`;
    this.combatStatsLines[2].textContent = `Total: ${stats.total}`;
    this.lastCombatStats = { us: stats.us, opfor: stats.opfor, total: stats.total };
  }

  updateKillCounter(): void {
    const kd = this.playerDeaths > 0
      ? (this.playerKills / this.playerDeaths).toFixed(2)
      : this.playerKills.toFixed(2);

    if (!this.killCountEl || !this.deathCountEl || !this.kdRatioEl) {
      return;
    }

    this.killCountEl.textContent = `${this.playerKills}`;
    this.deathCountEl.textContent = `${this.playerDeaths}`;
    this.kdRatioEl.textContent = `K/D: ${kd}`;
  }

  updateGameStatus(ticketSystem: TicketSystem): void {
    const gameState = ticketSystem.getGameState();
    const bleedRate = ticketSystem.getTicketBleedRate();

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

    // Note: Time is shown in the main match-timer, not duplicated here
    let bleedText = '';
    if (bleedRate.bleedPerSecond > 0) {
      if (bleedRate.usTickets > bleedRate.opforTickets) {
        bleedText = `US -${bleedRate.usTickets.toFixed(1)}/s`;
      } else if (bleedRate.opforTickets > bleedRate.usTickets) {
        bleedText = `OPFOR -${bleedRate.opforTickets.toFixed(1)}/s`;
      }
    }

    if (this.gameStatusTextEl && this.lastStatusText !== statusText) {
      this.gameStatusTextEl.textContent = statusText;
      this.lastStatusText = statusText;
    }

    if (this.bleedIndicatorEl) {
      const bleedVisible = Boolean(bleedText);
      if (bleedVisible && this.lastBleedText !== bleedText) {
        this.bleedIndicatorEl.textContent = bleedText;
        this.lastBleedText = bleedText;
      }
      if (this.lastBleedVisible !== bleedVisible) {
        this.bleedIndicatorEl.style.display = bleedVisible ? 'block' : 'none';
        this.lastBleedVisible = bleedVisible;
      }
      if (!bleedVisible && this.lastBleedText !== '') {
        this.bleedIndicatorEl.textContent = '';
        this.lastBleedText = '';
      }
    }
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

    if (this.lastTimerText !== timeText) {
      timerDisplay.textContent = timeText;
      this.lastTimerText = timeText;
    }

    // Update color based on time remaining
    let color: string;
    let timerClass: 'timer-critical' | 'timer-warning' | '';
    if (timeRemaining <= 30) {
      color = 'rgba(201, 86, 74, 0.95)';
      timerClass = 'timer-critical';
    } else if (timeRemaining <= 60) {
      color = 'rgba(212, 163, 68, 0.95)';
      timerClass = 'timer-warning';
    } else {
      color = 'rgba(220, 225, 230, 0.9)';
      timerClass = '';
    }

    if (this.lastTimerColor !== color) {
      timerDisplay.style.color = color;
      this.lastTimerColor = color;
    }

    if (this.lastTimerClass !== timerClass) {
      this.elements.timerElement.classList.remove('timer-warning', 'timer-critical');
      if (timerClass) {
        this.elements.timerElement.classList.add(timerClass);
      }
      this.lastTimerClass = timerClass;
    }
  }

  getPlayerKills(): number {
    return this.playerKills;
  }

  getPlayerDeaths(): number {
    return this.playerDeaths;
  }

  private initializeTicketDisplay(): void {
    while (this.elements.ticketDisplay.firstChild) {
      this.elements.ticketDisplay.removeChild(this.elements.ticketDisplay.firstChild);
    }

    this.ticketHeader = document.createElement('div');
    this.ticketHeader.style.cssText = [
      'position: absolute',
      'top: -25px',
      'left: 50%',
      'transform: translateX(-50%)',
      'width: 200px',
      'text-align: center',
      'color: rgba(220, 225, 230, 0.5)',
      'font-size: 10px',
      'letter-spacing: 1px',
      'font-weight: bold'
    ].join('; ');

    const usContainer = document.createElement('div');
    usContainer.className = 'faction-tickets';
    this.usTicketName = document.createElement('div');
    this.usTicketName.className = 'faction-name';
    this.usTicketCount = document.createElement('div');
    this.usTicketCount.className = 'ticket-count us-tickets';
    usContainer.appendChild(this.usTicketName);
    usContainer.appendChild(this.usTicketCount);

    const separator = document.createElement('div');
    separator.className = 'ticket-separator';
    separator.textContent = 'VS';

    const opforContainer = document.createElement('div');
    opforContainer.className = 'faction-tickets';
    this.opforTicketName = document.createElement('div');
    this.opforTicketName.className = 'faction-name';
    this.opforTicketCount = document.createElement('div');
    this.opforTicketCount.className = 'ticket-count opfor-tickets';
    opforContainer.appendChild(this.opforTicketName);
    opforContainer.appendChild(this.opforTicketCount);

    this.elements.ticketDisplay.appendChild(this.ticketHeader);
    this.elements.ticketDisplay.appendChild(usContainer);
    this.elements.ticketDisplay.appendChild(separator);
    this.elements.ticketDisplay.appendChild(opforContainer);
  }

  private initializeCombatStats(): void {
    while (this.elements.combatStats.firstChild) {
      this.elements.combatStats.removeChild(this.elements.combatStats.firstChild);
    }

    this.combatStatsLines = [
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div')
    ];

    this.combatStatsLines.forEach(line => {
      line.className = 'stat-line';
      this.elements.combatStats.appendChild(line);
    });
  }

  private initializeKillCounter(): void {
    const killCount = this.elements.killCounter.querySelector('.kill-count') as HTMLSpanElement | null;
    const deathCount = this.elements.killCounter.querySelector('.death-count') as HTMLSpanElement | null;
    const kdRatio = this.elements.killCounter.querySelector('.kd-ratio') as HTMLDivElement | null;

    if (killCount && deathCount && kdRatio) {
      this.killCountEl = killCount;
      this.deathCountEl = deathCount;
      this.kdRatioEl = kdRatio;
      return;
    }

    while (this.elements.killCounter.firstChild) {
      this.elements.killCounter.removeChild(this.elements.killCounter.firstChild);
    }

    const killsLine = document.createElement('div');
    const killsSpan = document.createElement('span');
    killsSpan.className = 'kill-count';
    killsSpan.textContent = '0';
    killsLine.appendChild(killsSpan);
    killsLine.append(' Kills');

    const deathsLine = document.createElement('div');
    const deathsSpan = document.createElement('span');
    deathsSpan.className = 'death-count';
    deathsSpan.textContent = '0';
    deathsLine.appendChild(deathsSpan);
    deathsLine.append(' Deaths');

    const kdLine = document.createElement('div');
    kdLine.className = 'kd-ratio';
    kdLine.textContent = 'K/D: 0.00';

    this.elements.killCounter.appendChild(killsLine);
    this.elements.killCounter.appendChild(deathsLine);
    this.elements.killCounter.appendChild(kdLine);

    this.killCountEl = killsSpan;
    this.deathCountEl = deathsSpan;
    this.kdRatioEl = kdLine;
  }

  private initializeGameStatus(): void {
    while (this.elements.gameStatus.firstChild) {
      this.elements.gameStatus.removeChild(this.elements.gameStatus.firstChild);
    }

    this.gameStatusTextEl = document.createElement('div');
    this.bleedIndicatorEl = document.createElement('div');
    this.bleedIndicatorEl.className = 'bleed-indicator';
    this.bleedIndicatorEl.style.display = 'none';

    this.elements.gameStatus.appendChild(this.gameStatusTextEl);
    this.elements.gameStatus.appendChild(this.bleedIndicatorEl);
  }
}
