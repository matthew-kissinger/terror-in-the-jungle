import { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { ZoneManager } from '../../systems/world/ZoneManager';
import { TicketSystem } from '../../systems/world/TicketSystem';
import { HUDElements } from './HUDElements';
import { HUDZoneDisplay } from './HUDZoneDisplay';
import type { GamePhase } from './GameStatusPanel';

export class HUDUpdater {
  private elements: HUDElements;
  private zoneDisplay: HUDZoneDisplay;

  constructor(elements: HUDElements) {
    this.elements = elements;
    this.zoneDisplay = new HUDZoneDisplay(elements);
  }

  updateObjectivesDisplay(zoneManager: ZoneManager, isTDM: boolean = false, playerPosition?: { x: number; y: number; z: number }): void {
    this.zoneDisplay.updateObjectivesDisplay(zoneManager, isTDM, playerPosition);
  }

  updateTicketDisplay(usTickets: number, opforTickets: number, isTDM: boolean = false, target: number = 0): void {
    // Delegate to TicketDisplay UIComponent - signals handle dedup internally
    this.elements.ticketDisplay.setMode(isTDM, target);
    this.elements.ticketDisplay.setTickets(usTickets, opforTickets);
  }

  updateCombatStats(_combatantSystem: CombatantSystem): void {
    // Combat stats panel is hidden (display: none in CSS) - skip DOM updates.
    // Data remains available via combatantSystem.getCombatStats() if needed later.
  }

  updateGameStatus(ticketSystem: TicketSystem): void {
    const gameState = ticketSystem.getGameState();
    const bleedRate = ticketSystem.getTicketBleedRate();

    // Compute bleed text
    let bleedText = '';
    if (bleedRate.bleedPerSecond > 0) {
      if (bleedRate.usTickets > bleedRate.opforTickets) {
        bleedText = `US -${bleedRate.usTickets.toFixed(1)}/s`;
      } else if (bleedRate.opforTickets > bleedRate.usTickets) {
        bleedText = `OPFOR -${bleedRate.opforTickets.toFixed(1)}/s`;
      }
    }

    // Delegate to GameStatusPanel UIComponent - signals handle dedup internally
    this.elements.gameStatusPanel.setGameState(
      gameState.phase as GamePhase,
      gameState.winner ?? null,
      bleedText
    );
  }

  addKill(): void {
    this.elements.killCounter.addKill();
    this.elements.showHitMarker('kill');
  }

  addDeath(): void {
    this.elements.killCounter.addDeath();
  }

  updateTimer(timeRemaining: number): void {
    // Delegate to MatchTimer UIComponent - signals handle dedup internally
    this.elements.matchTimer.setTime(timeRemaining);
  }

  getPlayerKills(): number {
    return this.elements.killCounter.getKills();
  }

  getPlayerDeaths(): number {
    return this.elements.killCounter.getDeaths();
  }
}
