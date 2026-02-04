export class LoadingPanels {
  private settingsPanel: HTMLDivElement;
  private howToPlayPanel: HTMLDivElement;
  private transitionOverlay: HTMLDivElement;

  // Handler references for cleanup
  private handleSettingsClose = () => this.hideSettingsPanel();
  private handleHowToPlayClose = () => this.hideHowToPlayPanel();
  private handleSettingsBgClick = (e: MouseEvent) => {
    if (e.target === this.settingsPanel) {
      this.hideSettingsPanel();
    }
  };
  private handleHowToPlayBgClick = (e: MouseEvent) => {
    if (e.target === this.howToPlayPanel) {
      this.hideHowToPlayPanel();
    }
  };

  constructor() {
    this.settingsPanel = this.createSettingsPanel();
    this.howToPlayPanel = this.createHowToPlayPanel();
    this.transitionOverlay = this.createTransitionOverlay();
  }

  private createSettingsPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10001;
      justify-content: center;
      align-items: center;
    `;

    panel.innerHTML = `
      <div style="
        background: rgba(20, 35, 50, 0.9);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(127, 180, 217, 0.3);
        border-radius: 20px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        color: #e8f4f8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <h2 style="color: #7fb4d9; margin-bottom: 1.5rem; font-weight: 300; letter-spacing: 0.1em;">SETTINGS</h2>

        <div style="margin: 1rem 0;">
          <label style="display: block; margin-bottom: 0.5rem; color: #b8d4e3; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em;">Graphics Quality</label>
          <select style="width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); color: #e8f4f8; border: 1px solid rgba(127, 180, 217, 0.3); border-radius: 8px; font-family: inherit;">
            <option>Low</option>
            <option selected>Medium</option>
            <option>High</option>
            <option>Ultra</option>
          </select>
        </div>

        <div style="margin: 1rem 0;">
          <label style="display: block; margin-bottom: 0.5rem; color: #b8d4e3; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em;">Master Volume</label>
          <input type="range" min="0" max="100" value="70" style="width: 100%; appearance: none; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; outline: none;">
        </div>

        <div style="margin: 1rem 0;">
          <label style="display: block; margin-bottom: 0.5rem; color: #b8d4e3; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em;">Mouse Sensitivity</label>
          <input type="range" min="1" max="10" value="5" style="width: 100%; appearance: none; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; outline: none;">
        </div>

        <div style="margin: 1rem 0;">
          <label style="color: #b8d4e3; cursor: pointer; display: flex; align-items: center;">
            <input type="checkbox" checked style="margin-right: 0.5rem;"> Show FPS Counter
          </label>
        </div>

        <div style="margin: 1rem 0;">
          <label style="color: #b8d4e3; cursor: pointer; display: flex; align-items: center;">
            <input type="checkbox" checked style="margin-right: 0.5rem;"> Enable Shadows
          </label>
        </div>

        <button class="close-settings" style="
          margin-top: 1.5rem;
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, #5a8fb5, #7fb4d9);
          color: white;
          border: 1px solid rgba(127, 180, 217, 0.3);
          border-radius: 50px;
          cursor: pointer;
          font-family: inherit;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.3s;
        ">CLOSE</button>
      </div>
    `;

    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('.close-settings');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.handleSettingsClose);
    }

    // Close on background click
    panel.addEventListener('click', this.handleSettingsBgClick);

    return panel;
  }

  private createHowToPlayPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'how-to-play-panel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 10001;
      justify-content: center;
      align-items: center;
      overflow-y: auto;
    `;

    panel.innerHTML = `
      <div style="
        background: rgba(20, 35, 50, 0.9);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(127, 180, 217, 0.3);
        border-radius: 20px;
        padding: 2rem;
        max-width: 600px;
        width: 90%;
        color: #e8f4f8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
        margin: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <h2 style="color: #7fb4d9; margin-bottom: 1.5rem; font-weight: 300; letter-spacing: 0.1em;">HOW TO PLAY</h2>

        <h3 style="color: #9fcfeb; margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1rem; font-weight: 500; letter-spacing: 0.05em;">CONTROLS</h3>
        <ul style="list-style: none; padding: 0; color: #b8d4e3; line-height: 1.8;">
          <li>⌨️ WASD - Move</li>
          <li>⌨️ SHIFT - Sprint</li>
          <li>⌨️ SPACE - Jump</li>
          <li>🖱️ MOUSE - Look around</li>
          <li>🖱️ LEFT CLICK - Fire weapon</li>
          <li>🖱️ RIGHT CLICK - Aim down sights</li>
          <li>⌨️ ESC - Release mouse lock</li>
        </ul>

        <h3 style="color: #9fcfeb; margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1rem; font-weight: 500; letter-spacing: 0.05em;">OBJECTIVE</h3>
        <p style="color: #b8d4e3; line-height: 1.6;">Capture and hold zones to drain enemy tickets. The team that runs out of tickets first loses!</p>

        <h3 style="color: #9fcfeb; margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1rem; font-weight: 500; letter-spacing: 0.05em;">ZONES</h3>
        <p style="color: #b8d4e3; line-height: 1.6;">Stand in neutral or enemy zones to capture them. More teammates in a zone = faster capture!</p>

        <h3 style="color: #9fcfeb; margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1rem; font-weight: 500; letter-spacing: 0.05em;">COMBAT TIPS</h3>
        <ul style="list-style: none; padding: 0; color: #b8d4e3; line-height: 1.8;">
          <li> Headshots deal 70% more damage</li>
          <li>🌲 Use vegetation for cover</li>
          <li>👂 Listen for enemy gunfire</li>
          <li>🏃 Stay mobile to avoid being hit</li>
        </ul>

        <button class="close-how-to-play" style="
          margin-top: 1.5rem;
          padding: 0.75rem 2rem;
          background: linear-gradient(135deg, #5a8fb5, #7fb4d9);
          color: white;
          border: 1px solid rgba(127, 180, 217, 0.3);
          border-radius: 50px;
          cursor: pointer;
          font-family: inherit;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.3s;
        ">CLOSE</button>
      </div>
    `;

    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('.close-how-to-play');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.handleHowToPlayClose);
    }

    // Close on background click
    panel.addEventListener('click', this.handleHowToPlayBgClick);

    return panel;
  }

  private createTransitionOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'transition-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #000;
      z-index: 10002;
      display: none;
      pointer-events: none;
    `;

    overlay.innerHTML = `
      <div class="scanlines" style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: repeating-linear-gradient(
          0deg,
          rgba(0,255,0,0.03),
          rgba(0,255,0,0.03) 1px,
          transparent 1px,
          transparent 2px
        );
        pointer-events: none;
        animation: scanlines 8s linear infinite;
      "></div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  showSettingsPanel(): void {
    this.settingsPanel.style.display = 'flex';
  }

  hideSettingsPanel(): void {
    this.settingsPanel.style.display = 'none';
  }

  showHowToPlayPanel(): void {
    this.howToPlayPanel.style.display = 'flex';
  }

  hideHowToPlayPanel(): void {
    this.howToPlayPanel.style.display = 'none';
  }

  startGameTransition(container: HTMLDivElement): void {
    this.transitionOverlay.style.display = 'block';
    this.transitionOverlay.style.opacity = '0';
    this.transitionOverlay.style.transition = 'opacity 0.3s ease-in';

    setTimeout(() => {
      this.transitionOverlay.style.opacity = '1';
    }, 10);

    container.style.transition = 'filter 0.3s ease-out';
    container.style.filter = 'blur(5px) brightness(1.5)';

    setTimeout(() => {
      this.transitionOverlay.style.transition = 'opacity 0.8s ease-out';
      this.transitionOverlay.style.opacity = '0';
      setTimeout(() => {
        this.transitionOverlay.style.display = 'none';
      }, 800);
    }, 500);
  }

  dispose(): void {
    // Remove listeners from settings panel
    const settingsCloseBtn = this.settingsPanel.querySelector('.close-settings');
    if (settingsCloseBtn) {
      settingsCloseBtn.removeEventListener('click', this.handleSettingsClose);
    }
    this.settingsPanel.removeEventListener('click', this.handleSettingsBgClick);

    // Remove listeners from how to play panel
    const howToPlayCloseBtn = this.howToPlayPanel.querySelector('.close-how-to-play');
    if (howToPlayCloseBtn) {
      howToPlayCloseBtn.removeEventListener('click', this.handleHowToPlayClose);
    }
    this.howToPlayPanel.removeEventListener('click', this.handleHowToPlayBgClick);

    if (this.settingsPanel?.parentElement) {
      this.settingsPanel.parentElement.removeChild(this.settingsPanel);
    }
    if (this.howToPlayPanel?.parentElement) {
      this.howToPlayPanel.parentElement.removeChild(this.howToPlayPanel);
    }
    if (this.transitionOverlay?.parentElement) {
      this.transitionOverlay.parentElement.removeChild(this.transitionOverlay);
    }
  }
}