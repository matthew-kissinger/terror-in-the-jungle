import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SquadCommand } from './types';
import { SquadManager } from './SquadManager';
import { Logger } from '../../utils/Logger';
import { SquadRadialMenu } from '../../ui/hud/SquadRadialMenu';

export class PlayerSquadController implements GameSystem {
  private squadManager: SquadManager;
  private playerSquadId?: string;
  private playerPosition = new THREE.Vector3();
  private currentCommand: SquadCommand = SquadCommand.NONE;
  private commandUIElement?: HTMLElement;
  private commandIndicatorElement?: HTMLElement;
  private isUIVisible = false;
  private boundOnKeyDown!: (event: KeyboardEvent) => void;
  private boundOnKeyUp!: (event: KeyboardEvent) => void;
  private radialMenu: SquadRadialMenu;

  constructor(squadManager: SquadManager) {
    this.squadManager = squadManager;
    this.radialMenu = new SquadRadialMenu();
    this.radialMenu.setCommandSelectedCallback((command) => this.issueCommand(command));
    this.setupEventListeners();
    this.createCommandUI();
  }

  async init(): Promise<void> {
    Logger.info('squad', ' Initializing Player Squad Controller...');
    this.createCommandIndicator();
  }

  update(_deltaTime: number): void {
  }

  dispose(): void {
    this.removeEventListeners();
    this.radialMenu.dispose();
    if (this.commandUIElement && this.commandUIElement.parentNode) {
      this.commandUIElement.parentNode.removeChild(this.commandUIElement);
    }
    if (this.commandIndicatorElement && this.commandIndicatorElement.parentNode) {
      this.commandIndicatorElement.parentNode.removeChild(this.commandIndicatorElement);
    }
  }

  assignPlayerSquad(squadId: string): void {
    this.playerSquadId = squadId;
    const squad = this.squadManager.getSquad(squadId);
    if (squad) {
      squad.isPlayerControlled = true;
      squad.currentCommand = SquadCommand.NONE;
      this.currentCommand = SquadCommand.NONE;
      Logger.info('squad', ` Player now commanding squad: ${squadId} (${squad.members.length} members)`);
      this.updateCommandIndicator();
    }
  }

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  private setupEventListeners(): void {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
  }

  private removeEventListeners(): void {
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.playerSquadId) return;

    const squad = this.squadManager.getSquad(this.playerSquadId);
    if (!squad) return;

    // Note: Z key is now handled via PlayerInput callback -> toggleRadialMenu()
    // This handler only processes Shift+Digit shortcuts for direct command issuing

    if (event.shiftKey) {
      switch (event.code) {
        case 'Digit1':
          this.issueCommand(SquadCommand.FOLLOW_ME);
          break;
        case 'Digit2':
          this.issueCommand(SquadCommand.HOLD_POSITION);
          break;
        case 'Digit3':
          this.issueCommand(SquadCommand.PATROL_HERE);
          break;
        case 'Digit4':
          this.issueCommand(SquadCommand.RETREAT);
          break;
        case 'Digit5':
          this.issueCommand(SquadCommand.FREE_ROAM);
          break;
      }
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    // Z key release is now handled via toggleRadialMenu()
    // This method can be kept for future key-up events if needed
  }

  private issueCommand(command: SquadCommand): void {
    if (!this.playerSquadId) return;

    const squad = this.squadManager.getSquad(this.playerSquadId);
    if (!squad) return;

    squad.currentCommand = command;
    squad.commandPosition = this.playerPosition.clone();
    this.currentCommand = command;

    const commandNames: Record<SquadCommand, string> = {
      [SquadCommand.FOLLOW_ME]: 'FOLLOW ME',
      [SquadCommand.HOLD_POSITION]: 'HOLD POSITION',
      [SquadCommand.PATROL_HERE]: 'PATROL HERE',
      [SquadCommand.RETREAT]: 'RETREAT',
      [SquadCommand.FREE_ROAM]: 'FREE ROAM',
      [SquadCommand.NONE]: 'AUTO (NPC)'
    };

    Logger.info('squad', ` Squad Command Issued: ${commandNames[command]}`);
    this.showCommandFeedback(commandNames[command]);
    this.updateCommandIndicator();
  }

  private showCommandFeedback(commandName: string): void {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(92, 184, 92, 0.15);
      border: 1px solid rgba(92, 184, 92, 0.5);
      padding: 20px 40px;
      border-radius: 6px;
      color: rgba(92, 184, 92, 0.9);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 24px;
      font-weight: bold;
      z-index: 10000;
      pointer-events: none;
      animation: fadeOut 2s forwards;
    `;
    feedback.textContent = `SQUAD: ${commandName}`;
    document.body.appendChild(feedback);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeOut {
        0% { opacity: 1; }
        70% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.parentNode.removeChild(feedback);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 2000);
  }

  private createCommandUI(): void {
    this.commandUIElement = document.createElement('div');
    this.commandUIElement.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 16px;
      background: rgba(10, 10, 14, 0.28);
      border: 1px solid rgba(92, 184, 92, 0.2);
      border-radius: 4px;
      padding: 8px 10px;
      color: rgba(92, 184, 92, 0.8);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 10px;
      z-index: 1000;
      backdrop-filter: blur(6px);
      display: none;
      min-width: 120px;
    `;

    this.commandUIElement.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: rgba(92, 184, 92, 0.7); font-size: 9px;">SQUAD</div>
      <div style="line-height: 1.4;">
        <div>Shift+1 Follow Me</div>
        <div>Shift+2 Hold Pos</div>
        <div>Shift+3 Patrol</div>
        <div>Shift+4 Retreat</div>
        <div>Shift+5 Auto</div>
        <div style="margin-top: 4px; opacity: 0.5; font-size: 9px;">Z Toggle</div>
      </div>
    `;

    document.body.appendChild(this.commandUIElement);
  }

  private toggleCommandUI(): void {
    if (!this.commandUIElement) return;

    this.isUIVisible = !this.isUIVisible;
    this.commandUIElement.style.display = this.isUIVisible ? 'block' : 'none';

    if (this.isUIVisible) {
      Logger.info('squad', ' Squad command UI opened');
    }
  }

  getPlayerSquadId(): string | undefined {
    return this.playerSquadId;
  }

  getCurrentCommand(): SquadCommand {
    return this.currentCommand;
  }

  toggleRadialMenu(): void {
    if (this.radialMenu.isOpen()) {
      this.radialMenu.executeCommand();
    } else {
      this.radialMenu.show();
    }
  }

  private createCommandIndicator(): void {
    this.commandIndicatorElement = document.createElement('div');
    this.commandIndicatorElement.style.cssText = `
      position: fixed;
      top: 90px;
      left: 16px;
      background: rgba(8, 12, 18, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      padding: 4px 8px;
      color: rgba(220, 225, 230, 0.6);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 9px;
      font-weight: bold;
      z-index: 1000;
      backdrop-filter: blur(6px);
      text-align: center;
      min-width: 90px;
    `;

    this.commandIndicatorElement.innerHTML = `
      <div style="font-size: 8px; opacity: 0.6; margin-bottom: 2px;">SQUAD</div>
      <div id="current-command-text">AUTO (NPC)</div>
    `;

    document.body.appendChild(this.commandIndicatorElement);
    this.updateCommandIndicator();
  }

  private updateCommandIndicator(): void {
    if (!this.commandIndicatorElement) return;

    const commandText = this.commandIndicatorElement.querySelector('#current-command-text');
    if (!commandText) return;

    const commandNames: Record<SquadCommand, string> = {
      [SquadCommand.FOLLOW_ME]: 'FOLLOW ME',
      [SquadCommand.HOLD_POSITION]: 'HOLD POSITION',
      [SquadCommand.PATROL_HERE]: 'PATROL HERE',
      [SquadCommand.RETREAT]: 'RETREAT',
      [SquadCommand.FREE_ROAM]: 'FREE ROAM',
      [SquadCommand.NONE]: 'AUTO (NPC)'
    };

    const commandName = commandNames[this.currentCommand] || 'AUTO (NPC)';
    commandText.textContent = commandName;

    // Change color based on command
    if (this.currentCommand === SquadCommand.NONE || this.currentCommand === SquadCommand.FREE_ROAM) {
      this.commandIndicatorElement.style.borderColor = 'rgba(100, 100, 100, 0.6)';
      this.commandIndicatorElement.style.background = 'rgba(100, 100, 100, 0.2)';
      this.commandIndicatorElement.style.color = '#aaaaaa';
    } else {
      this.commandIndicatorElement.style.borderColor = 'rgba(92, 184, 92, 0.4)';
      this.commandIndicatorElement.style.background = 'rgba(92, 184, 92, 0.12)';
      this.commandIndicatorElement.style.color = 'rgba(92, 184, 92, 0.9)';
    }
  }

  getCommandPosition(): THREE.Vector3 | undefined {
    if (!this.playerSquadId) return undefined;
    const squad = this.squadManager.getSquad(this.playerSquadId);
    return squad?.commandPosition;
  }
}
