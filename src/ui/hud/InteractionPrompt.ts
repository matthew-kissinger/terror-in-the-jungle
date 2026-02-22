export class InteractionPrompt {
  public interactionPrompt: HTMLDivElement;

  constructor() {
    this.interactionPrompt = this.createInteractionPrompt();
  }

  private createInteractionPrompt(): HTMLDivElement {
    const prompt = document.createElement('div');
    prompt.className = 'interaction-prompt';
    prompt.style.cssText = `
      background: rgba(8, 12, 18, 0.7);
      border: 1px solid rgba(220, 225, 230, 0.2);
      color: rgba(220, 225, 230, 0.95);
      padding: 12px 24px;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      border-radius: 4px;
      backdrop-filter: blur(6px);
      display: none;
      letter-spacing: 0.5px;
      margin: 0 auto;
    `;
    return prompt;
  }

  showInteractionPrompt(text: string): void {
    this.interactionPrompt.textContent = text;
    this.interactionPrompt.style.display = 'block';
  }

  hideInteractionPrompt(): void {
    this.interactionPrompt.style.display = 'none';
  }
}
