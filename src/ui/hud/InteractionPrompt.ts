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
      background: rgba(8, 12, 18, 0.7);
      border: 1px solid rgba(220, 225, 230, 0.2);
      color: rgba(220, 225, 230, 0.95);
      padding: 12px 24px;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      border-radius: 4px;
      z-index: 1000;
      backdrop-filter: blur(6px);
      display: none;
      letter-spacing: 0.5px;
    `;
    return prompt;
  }

  showInteractionPrompt(text: string): void {
    Logger.info('hud', ' HUD: SHOWING interaction prompt:', text);
    this.interactionPrompt.textContent = text;
    this.interactionPrompt.style.display = 'block';
    Logger.info('hud', ' HUD: Prompt display style set to:', this.interactionPrompt.style.display);
  }

  hideInteractionPrompt(): void {
    Logger.info('hud', ' HUD: HIDING interaction prompt');
    this.interactionPrompt.style.display = 'none';
  }
}
