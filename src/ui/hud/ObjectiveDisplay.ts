export class ObjectiveDisplay {
  public objectivesList: HTMLDivElement;
  public ticketDisplay: HTMLDivElement;

  constructor() {
    this.objectivesList = this.createObjectivesPanel();
    this.ticketDisplay = this.createTicketDisplay();
  }

  private createObjectivesPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'objectives-panel';
    panel.innerHTML = '<div class="objectives-title">Objectives</div>';
    return panel;
  }

  private createTicketDisplay(): HTMLDivElement {
    const display = document.createElement('div');
    display.className = 'ticket-display';
    return display;
  }
}
