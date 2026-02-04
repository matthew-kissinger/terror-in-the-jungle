import { Logger } from '../../utils/Logger';
export class InteractionPrompt {
  public interactionPrompt: HTMLDivElement;

  constructor() {
    this.interactionPrompt = this.createInteractionPrompt();
  }

  private createInteractionPrompt(): HTMLDivElement {
    const prompt = document.createElement('div');
    prompt.className = 'interaction-prompt';
    prompt.style.cssText = `
      position: fixed;
      bottom: 50%;
      left: 50%;
      transform: translate(-50%, 50%);
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid rgba(255, 255, 255, 0.6);
      color: white;
      padding: 15px 25px;
      font-family: 'Courier New', monospace;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      border-radius: 8px;
      z-index: 1000;
      backdrop-filter: blur(5px);
      display: none;
      animation: pulse 2s infinite;
    `;
    return prompt;
  }

  showInteractionPrompt(text: string): void {
    Logger.info('hud', '🎮 HUD: SHOWING interaction prompt:', text);
    this.interactionPrompt.textContent = text;
    this.interactionPrompt.style.display = 'block';
    Logger.info('hud', '🎮 HUD: Prompt display style set to:', this.interactionPrompt.style.display);
  }

  hideInteractionPrompt(): void {
    Logger.info('hud', '🎮 HUD: HIDING interaction prompt');
    this.interactionPrompt.style.display = 'none';
  }
}
