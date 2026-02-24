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
  private radialMenu: SquadRadialMenu;

  constructor(squadManager: SquadManager) {
    this.squadManager = squadManager;
    this.radialMenu = new SquadRadialMenu();
    this.radialMenu.setCommandSelectedCallback((command) => this.issueCommand(command));
    this.createCommandUI();
  }

  async init(): Promise<void> {
    Logger.info('squad', ' Initializing Player Squad Controller...');
    this.createCommandIndicator();
  }

  update(_deltaTime: number): void {
  }

  dispose(): void {
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

  /** Entry point for centralized input routing (Shift+Digit from PlayerInput/InputManager). */
  issueQuickCommand(slot: number): void {
    if (slot === 1) {
      this.issueCommand(SquadCommand.FOLLOW_ME);
    } else if (slot === 2) {
      this.issueCommand(SquadCommand.HOLD_POSITION);
    } else if (slot === 3) {
      this.issueCommand(SquadCommand.PATROL_HERE);
    } else if (slot === 4) {
      this.issueCommand(SquadCommand.RETREAT);
    } else if (slot === 5) {
      this.issueCommand(SquadCommand.FREE_ROAM);
    }
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
      display: flex;
      align-items: baseline;
      gap: 5px;
      pointer-events: none;
      user-select: none;
      color: rgba(220, 225, 230, 0.55);
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 9px;
      font-weight: bold;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      padding: 2px 4px;
    `;

    this.commandIndicatorElement.innerHTML = `
      <span style="opacity: 0.45; font-size: 8px;">SQD</span>
      <span id="current-command-text">AUTO</span>
    `;

    this.updateCommandIndicator();
  }

  /**
   * Move the indicator into a grid slot (e.g. stats).
   * Called from SystemConnector after layout is available.
   */
  mountIndicatorTo(parent: HTMLElement): void {
    if (!this.commandIndicatorElement) return;
    if (this.commandIndicatorElement.parentNode) {
      this.commandIndicatorElement.parentNode.removeChild(this.commandIndicatorElement);
    }
    parent.appendChild(this.commandIndicatorElement);
  }

  private updateCommandIndicator(): void {
    if (!this.commandIndicatorElement) return;

    const commandText = this.commandIndicatorElement.querySelector<HTMLElement>('#current-command-text');
    if (!commandText) return;

    const commandNames: Record<SquadCommand, string> = {
      [SquadCommand.FOLLOW_ME]: 'FOLLOW',
      [SquadCommand.HOLD_POSITION]: 'HOLD',
      [SquadCommand.PATROL_HERE]: 'PATROL',
      [SquadCommand.RETREAT]: 'RETREAT',
      [SquadCommand.FREE_ROAM]: 'FREE',
      [SquadCommand.NONE]: 'AUTO'
    };

    commandText.textContent = commandNames[this.currentCommand] ?? 'AUTO';

    const isActiveCommand = this.currentCommand !== SquadCommand.NONE && this.currentCommand !== SquadCommand.FREE_ROAM;
    commandText.style.color = isActiveCommand ? 'rgba(92, 184, 92, 0.9)' : 'rgba(220, 225, 230, 0.55)';
  }

  getCommandPosition(): THREE.Vector3 | undefined {
    if (!this.playerSquadId) return undefined;
    const squad = this.squadManager.getSquad(this.playerSquadId);
    return squad?.commandPosition;
  }
}
