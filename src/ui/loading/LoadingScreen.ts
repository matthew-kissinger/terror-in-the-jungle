/**
 * LoadingScreen - thin facade over StartScreen for backward compatibility.
 * All code that references LoadingScreen continues to work unchanged.
 */

import { StartScreen } from './StartScreen';
import { GameMode } from '../../config/gameModes';

export class LoadingScreen {
  private screen: StartScreen;

  constructor() {
    this.screen = new StartScreen();
  }

  public updateProgress(phaseId: string, progress: number): void {
    this.screen.updateProgress(phaseId, progress);
  }

  public setPhaseComplete(phaseId: string): void {
    this.screen.setPhaseComplete(phaseId);
  }

  public showMainMenu(): void {
    this.screen.showMainMenu();
  }

  public hide(): void {
    this.screen.hide();
  }

  public show(): void {
    this.screen.show();
  }

  public onPlay(callback: (mode: GameMode) => void): void {
    this.screen.onPlay(callback);
  }

  public onSettings(callback: () => void): void {
    this.screen.onSettings(callback);
  }

  public onHowToPlay(callback: () => void): void {
    this.screen.onHowToPlay(callback);
  }

  public showError(title: string, message: string): void {
    this.screen.showError(title, message);
  }

  public startInitTimeout(): void {
    this.screen.startInitTimeout();
  }

  public clearInitTimeout(): void {
    this.screen.clearInitTimeout();
  }

  public markInitialized(): void {
    this.screen.markInitialized();
  }

  public dispose(): void {
    this.screen.dispose();
  }
}
