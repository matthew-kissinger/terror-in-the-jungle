export class GameStatusDisplay {
  public gameStatus: HTMLDivElement;
  public timerElement: HTMLDivElement;

  constructor() {
    this.gameStatus = this.createGameStatus();
    this.timerElement = this.createTimerElement();
  }

  private createGameStatus(): HTMLDivElement {
    const status = document.createElement('div');
    status.className = 'game-status';
    return status;
  }

  private createTimerElement(): HTMLDivElement {
    const timer = document.createElement('div');
    timer.className = 'match-timer';
    timer.innerHTML = '<div class="timer-display">0:00</div>';
    return timer;
  }
}
