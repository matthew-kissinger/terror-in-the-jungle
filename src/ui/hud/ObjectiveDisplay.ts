export class ObjectiveDisplay {
  public objectivesList: HTMLDivElement;

  constructor() {
    this.objectivesList = this.createObjectivesPanel();
  }

  private createObjectivesPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'objectives-panel';
    panel.innerHTML = '<div class="objectives-title">Objectives</div>';
    return panel;
  }
}
