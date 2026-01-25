import { KillFeed } from './KillFeed';
import { Faction } from '../../systems/combat/types';
import { DamageNumberSystem } from './DamageNumberSystem';
import * as THREE from 'three';

export class HUDElements {
  // Main containers
  public hudContainer: HTMLDivElement;
  public objectivesList: HTMLDivElement;
  public ticketDisplay: HTMLDivElement;
  public combatStats: HTMLDivElement;
  public gameStatus: HTMLDivElement;
  public timerElement: HTMLDivElement;
  public hitMarkerContainer: HTMLDivElement;
  public killCounter: HTMLDivElement;
  public ammoDisplay: HTMLDivElement;
  public respawnButton: HTMLButtonElement;
  public interactionPrompt: HTMLDivElement;
  public elevationSlider: HTMLDivElement;
  public helicopterMouseIndicator: HTMLDivElement;
  public helicopterInstruments: HTMLDivElement;
  public grenadePowerMeter: HTMLDivElement;
  public killFeed: KillFeed;
  public damageNumbers?: DamageNumberSystem;

  constructor(camera?: THREE.Camera) {
    this.hudContainer = this.createHUDContainer();
    this.objectivesList = this.createObjectivesPanel();
    this.ticketDisplay = this.createTicketDisplay();
    this.combatStats = this.createCombatStats();
    this.gameStatus = this.createGameStatus();
    this.timerElement = this.createTimerElement();
    this.hitMarkerContainer = this.createHitMarkerContainer();
    this.killCounter = this.createKillCounter();
    this.ammoDisplay = this.createAmmoDisplay();
    this.respawnButton = this.createRespawnButton();
    this.interactionPrompt = this.createInteractionPrompt();
    this.elevationSlider = this.createElevationSlider();
    this.helicopterMouseIndicator = this.createHelicopterMouseIndicator();
    this.helicopterInstruments = this.createHelicopterInstruments();
    this.grenadePowerMeter = this.createGrenadePowerMeter();
    this.killFeed = new KillFeed();

    // Initialize damage number system if camera is provided
    if (camera) {
      this.damageNumbers = new DamageNumberSystem(camera);
    }

    // Assemble HUD structure
    this.hudContainer.appendChild(this.objectivesList);
    this.hudContainer.appendChild(this.ticketDisplay);
    this.hudContainer.appendChild(this.combatStats);
    this.hudContainer.appendChild(this.gameStatus);
    this.hudContainer.appendChild(this.timerElement);
    this.hudContainer.appendChild(this.hitMarkerContainer);
    this.hudContainer.appendChild(this.killCounter);
    this.hudContainer.appendChild(this.ammoDisplay);
    this.hudContainer.appendChild(this.interactionPrompt);
    this.hudContainer.appendChild(this.elevationSlider);
    this.hudContainer.appendChild(this.helicopterMouseIndicator);
    this.hudContainer.appendChild(this.helicopterInstruments);
    this.hudContainer.appendChild(this.grenadePowerMeter);
    // Removed respawn button from HUD
  }

  private createHUDContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hud-container';
    return container;
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

  private createCombatStats(): HTMLDivElement {
    const stats = document.createElement('div');
    stats.className = 'combat-stats';
    return stats;
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

  private createHitMarkerContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'hit-marker-container';
    return container;
  }

  private createKillCounter(): HTMLDivElement {
    const counter = document.createElement('div');
    counter.className = 'kill-counter';
    counter.innerHTML = `
      <div><span class="kill-count">0</span> Kills</div>
      <div><span class="death-count">0</span> Deaths</div>
      <div class="kd-ratio">K/D: 0.00</div>
    `;
    return counter;
  }

  private createAmmoDisplay(): HTMLDivElement {
    const display = document.createElement('div');
    display.className = 'ammo-display';
    display.innerHTML = `
      <div class="ammo-counter">
        <span class="ammo-magazine">30</span>
        <span class="ammo-separator">/</span>
        <span class="ammo-reserve">90</span>
      </div>
      <div class="ammo-status"></div>
    `;
    return display;
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    const magElement = this.ammoDisplay.querySelector('.ammo-magazine') as HTMLElement;
    const resElement = this.ammoDisplay.querySelector('.ammo-reserve') as HTMLElement;
    const statusElement = this.ammoDisplay.querySelector('.ammo-status') as HTMLElement;

    if (magElement) magElement.textContent = magazine.toString();
    if (resElement) resElement.textContent = reserve.toString();

    // Show status messages
    if (magazine === 0 && reserve > 0) {
      statusElement.textContent = 'Press R to reload';
      statusElement.style.color = '#ff6b6b';
      magElement.style.color = '#ff6b6b';
    } else if (magazine <= 10 && magazine > 0) {
      statusElement.textContent = 'Low ammo';
      statusElement.style.color = '#ffd93d';
      magElement.style.color = '#ffd93d';
    } else if (magazine === 0 && reserve === 0) {
      statusElement.textContent = 'No ammo!';
      statusElement.style.color = '#ff0000';
      magElement.style.color = '#ff0000';
    } else {
      statusElement.textContent = '';
      magElement.style.color = 'white';
    }
  }

  showHitMarker(type: 'normal' | 'kill' | 'headshot' = 'normal'): void {
    const marker = document.createElement('div');
    marker.className = `hit-marker ${type}`;

    if (type === 'kill') {
      console.log('💀 Kill confirmed!');
    } else if (type === 'headshot') {
      console.log('🎯 Headshot!');
    }

    this.hitMarkerContainer.appendChild(marker);

    // Remove after animation completes (timing matches CSS animation duration)
    const duration = type === 'kill' ? 400 : type === 'headshot' ? 350 : 300;
    setTimeout(() => {
      if (marker.parentNode) {
        marker.parentNode.removeChild(marker);
      }
    }, duration);
  }

  private createRespawnButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'respawn-button';
    button.innerHTML = '🔄 RESPAWN<br><span style="font-size: 10px;">Press K</span>';
    button.style.cssText = `
      position: fixed;
      bottom: 120px;
      right: 20px;
      padding: 12px 20px;
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid rgba(255, 0, 0, 0.5);
      color: #ff6b6b;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.3s;
      z-index: 100;
      text-align: center;
      backdrop-filter: blur(5px);
    `;

    button.onmouseover = () => {
      button.style.background = 'rgba(255, 0, 0, 0.2)';
      button.style.borderColor = 'rgba(255, 0, 0, 0.8)';
      button.style.transform = 'scale(1.05)';
    };

    button.onmouseout = () => {
      button.style.background = 'rgba(255, 0, 0, 0.1)';
      button.style.borderColor = 'rgba(255, 0, 0, 0.5)';
      button.style.transform = 'scale(1)';
    };

    return button;
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


  private createElevationSlider(): HTMLDivElement {
    const slider = document.createElement('div');
    slider.className = 'elevation-slider';
    slider.style.cssText = `
      position: fixed;
      left: 20px;
      top: 50%;
      transform: translateY(-50%);
      width: 60px;
      height: auto;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.6), rgba(10, 10, 14, 0.3));
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 110;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
    `;

    // Current elevation display (center)
    const elevationDisplay = document.createElement('div');
    elevationDisplay.className = 'elevation-display';
    elevationDisplay.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 6px;
      border-radius: 4px;
      min-width: 40px;
    `;
    elevationDisplay.textContent = '5m';

    // Simple elevation label
    const label = document.createElement('div');
    label.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-top: 4px;
      text-transform: uppercase;
    `;
    label.textContent = 'ELEV';

    slider.appendChild(elevationDisplay);
    slider.appendChild(label);

    return slider;
  }

  private createHelicopterMouseIndicator(): HTMLDivElement {
    const indicator = document.createElement('div');
    indicator.className = 'helicopter-mouse-indicator';
    indicator.style.cssText = `
      position: fixed;
      left: 20px;
      top: calc(50% + 120px);
      width: 60px;
      height: auto;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.6), rgba(10, 10, 14, 0.3));
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 110;
      pointer-events: none;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
    `;

    // Mouse icon (simple representation)
    const mouseIcon = document.createElement('div');
    mouseIcon.className = 'mouse-icon';
    mouseIcon.style.cssText = `
      width: 20px;
      height: 26px;
      border: 2px solid rgba(255, 255, 255, 0.7);
      border-radius: 8px 8px 12px 12px;
      position: relative;
      margin-bottom: 4px;
      background: rgba(255, 255, 255, 0.1);
    `;

    // Mouse scroll wheel
    const scrollWheel = document.createElement('div');
    scrollWheel.style.cssText = `
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 6px;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 1px;
    `;
    mouseIcon.appendChild(scrollWheel);

    // Status text
    const statusText = document.createElement('div');
    statusText.className = 'mouse-status-text';
    statusText.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 9px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      line-height: 1.2;
    `;
    statusText.textContent = 'CONTROL';

    // Mode label
    const modeLabel = document.createElement('div');
    modeLabel.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-top: 2px;
      text-transform: uppercase;
    `;
    modeLabel.textContent = 'RCTRL';

    indicator.appendChild(mouseIcon);
    indicator.appendChild(statusText);
    indicator.appendChild(modeLabel);

    return indicator;
  }

  private createHelicopterInstruments(): HTMLDivElement {
    const instruments = document.createElement('div');
    instruments.className = 'helicopter-instruments';
    instruments.style.cssText = `
      position: fixed;
      left: 20px;
      top: calc(50% + 200px);
      width: 60px;
      height: auto;
      background: linear-gradient(to bottom, rgba(10, 10, 14, 0.6), rgba(10, 10, 14, 0.3));
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      z-index: 110;
      pointer-events: none;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      gap: 6px;
    `;

    // Collective (Thrust) Indicator
    const collectiveContainer = document.createElement('div');
    collectiveContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    `;

    const collectiveLabel = document.createElement('div');
    collectiveLabel.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-bottom: 2px;
      text-transform: uppercase;
    `;
    collectiveLabel.textContent = 'THRU';

    const collectiveBar = document.createElement('div');
    collectiveBar.className = 'collective-bar';
    collectiveBar.style.cssText = `
      width: 12px;
      height: 30px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      position: relative;
      border-radius: 2px;
      background: rgba(0, 0, 0, 0.3);
    `;

    const collectiveFill = document.createElement('div');
    collectiveFill.className = 'collective-fill';
    collectiveFill.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 0%;
      background: linear-gradient(to top, #00ff44, #88ff44);
      border-radius: 1px;
      transition: height 0.1s ease;
    `;

    collectiveBar.appendChild(collectiveFill);
    collectiveContainer.appendChild(collectiveLabel);
    collectiveContainer.appendChild(collectiveBar);

    // RPM Indicator
    const rpmContainer = document.createElement('div');
    rpmContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    `;

    const rpmLabel = document.createElement('div');
    rpmLabel.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.6);
      text-align: center;
      margin-bottom: 2px;
      text-transform: uppercase;
    `;
    rpmLabel.textContent = 'RPM';

    const rpmValue = document.createElement('div');
    rpmValue.className = 'rpm-value';
    rpmValue.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
    `;
    rpmValue.textContent = '0%';

    rpmContainer.appendChild(rpmLabel);
    rpmContainer.appendChild(rpmValue);

    // Status Indicators
    const statusContainer = document.createElement('div');
    statusContainer.style.cssText = `
      display: flex;
      gap: 4px;
      width: 100%;
      justify-content: center;
    `;

    const hoverIndicator = document.createElement('div');
    hoverIndicator.className = 'hover-indicator';
    hoverIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 2px;
      background: rgba(0, 100, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.7);
      font-weight: bold;
    `;
    hoverIndicator.textContent = 'H';

    const boostIndicator = document.createElement('div');
    boostIndicator.className = 'boost-indicator';
    boostIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 2px;
      background: rgba(100, 50, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Courier New', monospace;
      font-size: 8px;
      color: rgba(255, 255, 255, 0.7);
      font-weight: bold;
    `;
    boostIndicator.textContent = 'B';

    statusContainer.appendChild(hoverIndicator);
    statusContainer.appendChild(boostIndicator);

    instruments.appendChild(collectiveContainer);
    instruments.appendChild(rpmContainer);
    instruments.appendChild(statusContainer);

    return instruments;
  }

  private createGrenadePowerMeter(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'grenade-power-meter';
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, 120px);
      width: 200px;
      height: 30px;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      pointer-events: none;
    `;

    // Label
    const label = document.createElement('div');
    label.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
      text-transform: uppercase;
      text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    `;
    label.textContent = 'THROW POWER';

    // Bar container
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      width: 100%;
      height: 12px;
      background: rgba(0, 0, 0, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.5);
      border-radius: 6px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    `;

    // Power fill bar
    const powerFill = document.createElement('div');
    powerFill.className = 'power-fill';
    powerFill.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 30%;
      background: linear-gradient(to right, #00ff44, #88ff44);
      transition: width 0.05s linear, background 0.1s ease;
      border-radius: 3px;
    `;

    // Power percentage text
    const powerText = document.createElement('div');
    powerText.className = 'power-text';
    powerText.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Courier New', monospace;
      font-size: 10px;
      font-weight: bold;
      color: white;
      text-shadow: 0 0 3px rgba(0, 0, 0, 1);
      z-index: 1;
    `;
    powerText.textContent = '30%';

    barContainer.appendChild(powerFill);
    barContainer.appendChild(powerText);
    container.appendChild(label);
    container.appendChild(barContainer);

    return container;
  }

  showMessage(message: string, duration: number = 3000): void {
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px;
      font-size: 24px;
      border-radius: 5px;
      text-align: center;
      animation: fadeIn 0.3s ease;
    `;
    messageElement.textContent = message;

    this.hudContainer.appendChild(messageElement);

    setTimeout(() => {
      messageElement.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        if (messageElement.parentNode) {
          this.hudContainer.removeChild(messageElement);
        }
      }, 300);
    }, duration);
  }

  showInteractionPrompt(text: string): void {
    console.log('🎮 HUD: SHOWING interaction prompt:', text);
    this.interactionPrompt.textContent = text;
    this.interactionPrompt.style.display = 'block';
    console.log('🎮 HUD: Prompt display style set to:', this.interactionPrompt.style.display);
  }

  hideInteractionPrompt(): void {
    console.log('🎮 HUD: HIDING interaction prompt');
    this.interactionPrompt.style.display = 'none';
  }


  updateElevation(elevation: number): void {
    const elevationDisplay = this.elevationSlider.querySelector('.elevation-display') as HTMLElement;
    if (elevationDisplay) {
      elevationDisplay.textContent = `${Math.round(elevation)}m`;
    }
  }

  // Helicopter mouse control indicator methods
  showHelicopterMouseIndicator(): void {
    this.helicopterMouseIndicator.style.display = 'flex';
  }

  hideHelicopterMouseIndicator(): void {
    this.helicopterMouseIndicator.style.display = 'none';
  }

  updateHelicopterMouseMode(controlMode: boolean): void {
    const statusText = this.helicopterMouseIndicator.querySelector('.mouse-status-text') as HTMLElement;
    const mouseIcon = this.helicopterMouseIndicator.querySelector('.mouse-icon') as HTMLElement;

    if (statusText) {
      statusText.textContent = controlMode ? 'CONTROL' : 'FREE LOOK';
      statusText.style.color = controlMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(100, 200, 255, 0.9)';
    }

    if (mouseIcon) {
      mouseIcon.style.borderColor = controlMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(100, 200, 255, 0.7)';
      mouseIcon.style.background = controlMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(100, 200, 255, 0.1)';
    }
  }

  // Helicopter instruments methods (only visible in helicopter)
  showHelicopterInstruments(): void {
    this.helicopterInstruments.style.display = 'flex';
  }

  hideHelicopterInstruments(): void {
    this.helicopterInstruments.style.display = 'none';
  }

  // Grenade power meter methods
  showGrenadePowerMeter(): void {
    this.grenadePowerMeter.style.display = 'flex';
  }

  hideGrenadePowerMeter(): void {
    this.grenadePowerMeter.style.display = 'none';
  }

  updateGrenadePower(power: number): void {
    const powerFill = this.grenadePowerMeter.querySelector('.power-fill') as HTMLElement;
    const powerText = this.grenadePowerMeter.querySelector('.power-text') as HTMLElement;

    if (powerFill && powerText) {
      // Power ranges from 0.3 to 1.0, normalize to 0-100%
      const normalizedPower = ((power - 0.3) / 0.7) * 100;
      const displayPercent = Math.round(power * 100);

      powerFill.style.width = `${normalizedPower}%`;
      powerText.textContent = `${displayPercent}%`;

      // Color gradient: green (low) -> yellow (mid) -> red (max)
      if (normalizedPower < 40) {
        powerFill.style.background = 'linear-gradient(to right, #00ff44, #88ff44)'; // Green
      } else if (normalizedPower < 75) {
        powerFill.style.background = 'linear-gradient(to right, #ffff44, #ffaa44)'; // Yellow
      } else {
        powerFill.style.background = 'linear-gradient(to right, #ff8844, #ff4444)'; // Red
      }
    }
  }

  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void {
    // Update collective (thrust) bar
    const collectiveFill = this.helicopterInstruments.querySelector('.collective-fill') as HTMLElement;
    if (collectiveFill) {
      const percentage = Math.round(collective * 100);
      collectiveFill.style.height = `${percentage}%`;

      // Color coding for collective
      if (percentage > 80) {
        collectiveFill.style.background = 'linear-gradient(to top, #ff4444, #ff8844)'; // Red for high thrust
      } else if (percentage > 50) {
        collectiveFill.style.background = 'linear-gradient(to top, #ffff44, #88ff44)'; // Yellow for medium
      } else {
        collectiveFill.style.background = 'linear-gradient(to top, #00ff44, #88ff44)'; // Green for normal
      }
    }

    // Update RPM display
    const rpmValue = this.helicopterInstruments.querySelector('.rpm-value') as HTMLElement;
    if (rpmValue) {
      const rpmPercentage = Math.round(rpm * 100);
      rpmValue.textContent = `${rpmPercentage}%`;

      // Color coding for RPM
      if (rpmPercentage < 30) {
        rpmValue.style.color = 'rgba(255, 100, 100, 0.9)'; // Red for low RPM
      } else if (rpmPercentage > 90) {
        rpmValue.style.color = 'rgba(255, 255, 100, 0.9)'; // Yellow for high RPM
      } else {
        rpmValue.style.color = 'rgba(255, 255, 255, 0.9)'; // White for normal
      }
    }

    // Update hover assist indicator
    const hoverIndicator = this.helicopterInstruments.querySelector('.hover-indicator') as HTMLElement;
    if (hoverIndicator) {
      if (autoHover) {
        hoverIndicator.style.background = 'rgba(0, 200, 0, 0.6)';
        hoverIndicator.style.borderColor = 'rgba(0, 255, 0, 0.8)';
        hoverIndicator.style.color = 'rgba(255, 255, 255, 1)';
      } else {
        hoverIndicator.style.background = 'rgba(100, 100, 100, 0.3)';
        hoverIndicator.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        hoverIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    }

    // Update boost indicator
    const boostIndicator = this.helicopterInstruments.querySelector('.boost-indicator') as HTMLElement;
    if (boostIndicator) {
      if (engineBoost) {
        boostIndicator.style.background = 'rgba(255, 150, 0, 0.6)';
        boostIndicator.style.borderColor = 'rgba(255, 200, 0, 0.8)';
        boostIndicator.style.color = 'rgba(255, 255, 255, 1)';
      } else {
        boostIndicator.style.background = 'rgba(100, 100, 100, 0.3)';
        boostIndicator.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        boostIndicator.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    }
  }

  attachToDOM(): void {
    document.body.appendChild(this.hudContainer);
    this.killFeed.attachToDOM(document.body);
    if (this.damageNumbers) {
      this.damageNumbers.attachToDOM();
    }
  }

  updateKillFeed(deltaTime: number): void {
    this.killFeed.update(deltaTime);
  }

  updateDamageNumbers(): void {
    if (this.damageNumbers) {
      this.damageNumbers.update();
    }
  }

  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot: boolean = false, isKill: boolean = false): void {
    if (this.damageNumbers) {
      this.damageNumbers.spawn(worldPos, damage, isHeadshot, isKill);
    }
  }

  addKillToFeed(
    killerName: string,
    killerFaction: Faction,
    victimName: string,
    victimFaction: Faction,
    isHeadshot: boolean = false
  ): void {
    this.killFeed.addKill(killerName, killerFaction, victimName, victimFaction, isHeadshot);
  }

  dispose(): void {
    if (this.hudContainer.parentNode) {
      this.hudContainer.parentNode.removeChild(this.hudContainer);
    }
    this.killFeed.dispose();
    if (this.damageNumbers) {
      this.damageNumbers.dispose();
    }
  }
}