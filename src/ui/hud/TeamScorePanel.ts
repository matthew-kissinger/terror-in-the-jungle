import { TicketSystem } from '../../systems/world/TicketSystem';
import { Faction } from '../../systems/combat/types';

export class TeamScorePanel {
  private container: HTMLDivElement;
  private usTicketsElement: HTMLSpanElement;
  private opforTicketsElement: HTMLSpanElement;

  constructor(private ticketSystem: TicketSystem) {
    this.container = this.createPanel();
    this.usTicketsElement = this.container.querySelector('.us-ticket-count') as HTMLSpanElement;
    this.opforTicketsElement = this.container.querySelector('.opfor-ticket-count') as HTMLSpanElement;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'team-score-panel';
    panel.style.cssText = `
      position: fixed;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 10, 14, 0.35);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 10px 20px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 10px;
      display: flex;
      gap: 20px;
      align-items: center;
      font-family: 'Courier New', monospace;
      pointer-events: none;
      z-index: 105;
    `;

    panel.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #4488ff; margin-bottom: 4px; font-weight: bold;">US</div>
        <div class="us-ticket-count" style="font-size: 22px; font-weight: bold; color: #4488ff;">300</div>
      </div>
      <div style="font-size: 20px; color: #666;">VS</div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #ff4444; margin-bottom: 4px; font-weight: bold;">OPFOR</div>
        <div class="opfor-ticket-count" style="font-size: 22px; font-weight: bold; color: #ff4444;">300</div>
      </div>
    `;

    return panel;
  }

  update(): void {
    const usTickets = Math.round(this.ticketSystem.getTickets(Faction.US));
    const opforTickets = Math.round(this.ticketSystem.getTickets(Faction.OPFOR));

    this.usTicketsElement.textContent = usTickets.toString();
    this.opforTicketsElement.textContent = opforTickets.toString();

    // Add visual warning when tickets are low
    if (usTickets < 50) {
      this.usTicketsElement.style.animation = 'ticketWarning 1s infinite';
    } else {
      this.usTicketsElement.style.animation = 'none';
    }

    if (opforTickets < 50) {
      this.opforTicketsElement.style.animation = 'ticketWarning 1s infinite';
    } else {
      this.opforTicketsElement.style.animation = 'none';
    }
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'team-score-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ticketWarning {
        0%, 100% {
          opacity: 1;
          text-shadow: 0 0 5px currentColor;
        }
        50% {
          opacity: 0.6;
          text-shadow: 0 0 10px currentColor;
        }
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    const styleEl = document.getElementById('team-score-panel-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }
}
