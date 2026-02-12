export class RespawnUI {
  private respawnUIContainer?: HTMLDivElement;
  private onRespawnClick?: () => void;

  constructor() {
    this.injectResponsiveStyles();
    this.createRespawnUI();
  }

  private injectResponsiveStyles(): void {
    const styleId = 'respawn-ui-responsive-styles';
    if (!document.head || document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media (max-width: 768px) {
        #respawn-ui .content-area {
          flex-direction: column !important;
          padding: 15px !important;
          gap: 15px !important;
        }
        #respawn-ui .map-panel {
          min-width: 0 !important;
        }
        #respawn-ui .map-container {
          min-height: 40vh !important;
        }
        #respawn-ui .info-panel {
          max-width: 100% !important;
        }
        #respawn-ui .header {
          padding: 15px !important;
        }
      }
      @media (max-width: 480px) {
        #respawn-ui .map-title {
          font-size: 16px !important;
        }
        #respawn-ui .selected-title {
          font-size: 14px !important;
        }
        #respawn-ui .legend-title {
          font-size: 12px !important;
        }
        #respawn-ui .legend-item span {
          font-size: 11px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private createRespawnUI(): void {
    this.respawnUIContainer = document.createElement('div');
    this.respawnUIContainer.id = 'respawn-ui';
    this.respawnUIContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      display: none;
      z-index: 10000;
      font-family: 'Courier New', monospace;
    `;

    const mainLayout = document.createElement('div');
    mainLayout.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.className = 'header';
    header.style.cssText = `
      background: linear-gradient(180deg, rgba(20,0,0,0.95) 0%, rgba(10,0,0,0.8) 100%);
      border-bottom: 2px solid #ff0000;
      padding: 20px;
      text-align: center;
    `;

    const kiaText = document.createElement('h1');
    kiaText.style.cssText = `
      color: #ff0000;
      font-size: clamp(24px, 6vw, 48px);
      font-weight: bold;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: clamp(2px, 1vw, 8px);
      text-shadow: 0 0 20px rgba(255,0,0,0.5);
    `;
    kiaText.textContent = 'K.I.A.';
    header.appendChild(kiaText);

    const statusText = document.createElement('div');
    statusText.style.cssText = `
      color: #999;
      font-size: 16px;
      margin-top: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    statusText.textContent = 'KILLED IN ACTION';
    header.appendChild(statusText);

    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';
    contentArea.style.cssText = `
      flex: 1;
      display: flex;
      padding: 30px;
      gap: 30px;
      overflow: auto;
    `;

    const mapPanel = document.createElement('div');
    mapPanel.className = 'map-panel';
    mapPanel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    `;

    const mapTitle = document.createElement('h2');
    mapTitle.className = 'map-title';
    mapTitle.style.cssText = `
      color: #00ff00;
      font-size: 20px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 2px;
    `;
    mapTitle.textContent = 'TACTICAL MAP - SELECT DEPLOYMENT';
    mapPanel.appendChild(mapTitle);

    const mapContainer = document.createElement('div');
    mapContainer.id = 'respawn-map';
    mapContainer.className = 'map-container';
    mapContainer.style.cssText = `
      flex: 1;
      background: #0a0a0a;
      border: 2px solid #00ff00;
      border-radius: 4px;
      position: relative;
      min-height: 500px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    mapPanel.appendChild(mapContainer);

    const infoPanel = document.createElement('div');
    infoPanel.style.cssText = `
      width: 100%;
      max-width: 350px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    const selectedInfo = document.createElement('div');
    selectedInfo.style.cssText = `
      background: rgba(0, 50, 0, 0.3);
      border: 1px solid #00ff00;
      border-radius: 4px;
      padding: 20px;
    `;

    const selectedTitle = document.createElement('h3');
    selectedTitle.className = 'selected-title';
    selectedTitle.style.cssText = `
      color: #00ff00;
      font-size: 16px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 1px;
    `;
    selectedTitle.textContent = 'SELECTED SPAWN POINT';
    selectedInfo.appendChild(selectedTitle);

    const selectedName = document.createElement('div');
    selectedName.id = 'selected-spawn-name';
    selectedName.style.cssText = `
      color: white;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    `;
    selectedName.textContent = 'NONE';
    selectedInfo.appendChild(selectedName);

    const selectedStatus = document.createElement('div');
    selectedStatus.id = 'selected-spawn-status';
    selectedStatus.style.cssText = `
      color: #999;
      font-size: 14px;
    `;
    selectedStatus.textContent = 'Select a spawn point on the map';
    selectedInfo.appendChild(selectedStatus);

    infoPanel.appendChild(selectedInfo);

    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
      background: rgba(20, 20, 20, 0.8);
      border: 1px solid #666;
      border-radius: 4px;
      padding: 20px;
      text-align: center;
    `;

    const timerDisplay = document.createElement('div');
    timerDisplay.id = 'respawn-timer';
    timerDisplay.style.cssText = `
      color: #ff6600;
      font-size: 16px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    controlsContainer.appendChild(timerDisplay);

    const respawnButton = document.createElement('button');
    respawnButton.id = 'respawn-button';
    respawnButton.style.cssText = `
      background: linear-gradient(180deg, #00ff00 0%, #00cc00 100%);
      border: 2px solid #00ff00;
      color: #000;
      font-size: 18px;
      font-weight: bold;
      padding: 15px 40px;
      border-radius: 4px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 2px;
      transition: all 0.2s;
      width: 100%;
      min-height: 44px;
      box-shadow: 0 4px 10px rgba(0,255,0,0.3);
      touch-action: manipulation;
    `;
    respawnButton.textContent = 'DEPLOY';
    respawnButton.disabled = true;
    controlsContainer.appendChild(respawnButton);

    respawnButton.onmouseover = () => {
      if (!respawnButton.disabled) {
        respawnButton.style.transform = 'scale(1.05)';
        respawnButton.style.boxShadow = '0 6px 20px rgba(0,255,0,0.5)';
      }
    };
    respawnButton.onmouseout = () => {
      respawnButton.style.transform = 'scale(1)';
      respawnButton.style.boxShadow = '0 4px 10px rgba(0,255,0,0.3)';
    };
    respawnButton.ontouchstart = () => {
      if (!respawnButton.disabled) {
        respawnButton.style.transform = 'scale(0.95)';
      }
    };
    respawnButton.ontouchend = () => {
      respawnButton.style.transform = 'scale(1)';
    };

    respawnButton.onclick = () => {
      if (!respawnButton.disabled && this.onRespawnClick) {
        this.onRespawnClick();
      }
    };

    infoPanel.appendChild(controlsContainer);

    const legend = document.createElement('div');
    legend.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 4px;
      padding: 15px;
    `;

    const legendTitle = document.createElement('h4');
    legendTitle.className = 'legend-title';
    legendTitle.style.cssText = `
      color: #888;
      font-size: 14px;
      text-transform: uppercase;
      margin: 0 0 10px 0;
      letter-spacing: 1px;
    `;
    legendTitle.textContent = 'MAP LEGEND';
    legend.appendChild(legendTitle);

    const legendItems = [
      { color: '#0080ff', label: 'HQ / Main Base' },
      { color: '#00ff00', label: 'Controlled Zone' },
      { color: '#ffff00', label: 'Contested Zone' },
      { color: '#ff0000', label: 'Enemy Zone' }
    ];

    legendItems.forEach(item => {
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      legendItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 5px;
      `;

      const colorBox = document.createElement('div');
      colorBox.style.cssText = `
        width: 24px;
        height: 24px;
        min-width: 24px;
        background: ${item.color};
        border: 1px solid rgba(255,255,255,0.3);
      `;

      const label = document.createElement('span');
      label.style.cssText = `
        color: #999;
        font-size: 12px;
      `;
      label.textContent = item.label;

      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legend.appendChild(legendItem);
    });

    infoPanel.appendChild(legend);

    contentArea.appendChild(mapPanel);
    contentArea.appendChild(infoPanel);

    mainLayout.appendChild(header);
    mainLayout.appendChild(contentArea);

    this.respawnUIContainer.appendChild(mainLayout);
    document.body.appendChild(this.respawnUIContainer);
  }

  getContainer(): HTMLDivElement | undefined {
    return this.respawnUIContainer;
  }

  getMapContainer(): HTMLElement | null {
    return document.getElementById('respawn-map');
  }

  show(): void {
    if (this.respawnUIContainer) {
      this.respawnUIContainer.style.display = 'flex';
    }
  }

  hide(): void {
    if (this.respawnUIContainer) {
      this.respawnUIContainer.style.display = 'none';
    }
  }

  updateTimerDisplay(respawnTimer: number, hasSelectedSpawn: boolean): void {
    const timerElement = document.getElementById('respawn-timer');
    const respawnButton = document.getElementById('respawn-button') as HTMLButtonElement;

    if (timerElement) {
      if (respawnTimer > 0) {
        timerElement.textContent = `Deployment available in ${Math.ceil(respawnTimer)}s`;
        timerElement.style.color = '#ff6600';
      } else {
        timerElement.textContent = 'Ready for deployment';
        timerElement.style.color = '#00ff00';
      }
    }

    if (respawnButton) {
      if (respawnTimer > 0 || !hasSelectedSpawn) {
        respawnButton.disabled = true;
        respawnButton.style.opacity = '0.5';
        respawnButton.style.cursor = 'not-allowed';
      } else {
        respawnButton.disabled = false;
        respawnButton.style.opacity = '1';
        respawnButton.style.cursor = 'pointer';
      }
    }
  }

  updateSelectedSpawn(zoneName: string): void {
    const nameElement = document.getElementById('selected-spawn-name');
    const statusElement = document.getElementById('selected-spawn-status');

    if (nameElement) nameElement.textContent = zoneName;
    if (statusElement) statusElement.textContent = 'Ready to deploy';
  }

  resetSelectedSpawn(): void {
    const nameElement = document.getElementById('selected-spawn-name');
    const statusElement = document.getElementById('selected-spawn-status');
    if (nameElement) nameElement.textContent = 'NONE';
    if (statusElement) statusElement.textContent = 'Select a spawn point on the map';
  }

  setRespawnClickCallback(callback: () => void): void {
    this.onRespawnClick = callback;
  }

  dispose(): void {
    if (this.respawnUIContainer?.parentElement) {
      this.respawnUIContainer.parentElement.removeChild(this.respawnUIContainer);
    }
  }
}
