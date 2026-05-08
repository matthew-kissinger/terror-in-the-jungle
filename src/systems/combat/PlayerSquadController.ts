import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SquadCommand } from './types';
import { SquadManager } from './SquadManager';
import { Logger } from '../../utils/Logger';
import {
  getQuickCommandOption,
  getSquadCommandLabel,
  SQUAD_QUICK_COMMAND_OPTIONS,
  type SquadQuickCommandOption
} from './SquadCommandPresentation';
import { SquadCommandWorldMarker } from './SquadCommandWorldMarker';

export interface SquadCommandState {
  hasSquad: boolean;
  currentCommand: SquadCommand;
  isCommandModeOpen: boolean;
  memberCount: number;
  commandPosition?: THREE.Vector3;
  selectedSquadId?: string;
  selectedLeaderId?: string;
  selectedFormation?: string;
  selectedFaction?: string;
}

type SquadCommandStateListener = (state: SquadCommandState) => void;

interface PlayerSquadControllerOptions {
  scene?: THREE.Scene;
  terrainHeightAt?: (x: number, z: number) => number;
}

export class PlayerSquadController implements GameSystem {
  private squadManager: SquadManager;
  private playerSquadId?: string;
  private playerPosition = new THREE.Vector3();
  private currentCommand: SquadCommand = SquadCommand.NONE;
  private commandIndicatorElement?: HTMLElement;
  private readonly commandWorldMarker?: SquadCommandWorldMarker;
  private readonly commandStateListeners = new Set<SquadCommandStateListener>();

  constructor(squadManager: SquadManager, options: PlayerSquadControllerOptions = {}) {
    this.squadManager = squadManager;
    if (options.scene) {
      this.commandWorldMarker = new SquadCommandWorldMarker(options.scene, {
        terrainHeightAt: options.terrainHeightAt,
      });
    }
  }

  async init(): Promise<void> {
    Logger.info('squad', ' Initializing Player Squad Controller...');
    this.createCommandIndicator();
  }

  update(_deltaTime: number): void {
    if (this.commandWorldMarker?.isVisible()) {
      const state = this.getCommandState();
      this.commandWorldMarker.setCommand(state.currentCommand, state.commandPosition);
    }
  }

  dispose(): void {
    if (this.commandIndicatorElement && this.commandIndicatorElement.parentNode) {
      this.commandIndicatorElement.parentNode.removeChild(this.commandIndicatorElement);
    }
    this.commandWorldMarker?.dispose();
    this.commandStateListeners.clear();
  }

  assignPlayerSquad(squadId: string): void {
    const squad = this.squadManager.getSquad(squadId);
    if (squad) {
      Logger.info('squad', ` Player now commanding squad: ${squadId} (${squad.members.length} members)`);
      if (squad.currentCommand === undefined) {
        squad.currentCommand = SquadCommand.NONE;
      }
      this.selectSquad(squadId);
    }
  }

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /** Entry point for centralized input routing (Shift+Digit from PlayerInput/InputManager). */
  issueQuickCommand(slot: number): void {
    const option = getQuickCommandOption(slot);
    if (!option) return;
    this.issueCommand(option.command);
  }

  issueCommandAtPosition(command: SquadCommand, position: THREE.Vector3): void {
    this.issueCommand(command, position);
  }

  getQuickCommandOptions(): SquadQuickCommandOption[] {
    return SQUAD_QUICK_COMMAND_OPTIONS;
  }

  getCommandState(): SquadCommandState {
    const squad = this.playerSquadId ? this.squadManager.getSquad(this.playerSquadId) : undefined;
    return {
      hasSquad: Boolean(squad),
      currentCommand: this.currentCommand,
      isCommandModeOpen: false,
      memberCount: squad?.members.length ?? 0,
      commandPosition: squad?.commandPosition,
      selectedSquadId: squad?.id,
      selectedLeaderId: squad?.leaderId,
      selectedFormation: squad?.formation,
      selectedFaction: squad?.faction,
    };
  }

  onCommandStateChange(listener: SquadCommandStateListener): () => void {
    this.commandStateListeners.add(listener);
    listener(this.getCommandState());
    return () => this.commandStateListeners.delete(listener);
  }

  private issueCommand(command: SquadCommand, explicitPosition?: THREE.Vector3): void {
    if (!this.playerSquadId) return;

    const squad = this.squadManager.getSquad(this.playerSquadId);
    if (!squad) return;

    squad.currentCommand = command;
    squad.commandPosition = command === SquadCommand.FREE_ROAM || command === SquadCommand.NONE
      ? undefined
      : explicitPosition?.clone() ?? this.playerPosition.clone();
    this.currentCommand = command;
    const commandLabel = getSquadCommandLabel(command, 'full');
    Logger.info('squad', ` Squad Command Issued: ${commandLabel}`);
    this.showCommandFeedback(commandLabel);
    this.updateCommandIndicator();
    this.emitCommandState();
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
      font-family: var(--font-primary, 'Rajdhani', sans-serif);
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

  getPlayerSquadId(): string | undefined {
    return this.playerSquadId;
  }

  selectSquad(squadId: string): boolean {
    const squad = this.squadManager.getSquad(squadId);
    if (!squad) return false;

    const previousSquad = this.playerSquadId
      ? this.squadManager.getSquad(this.playerSquadId)
      : undefined;
    if (previousSquad && previousSquad.id !== squad.id) {
      previousSquad.isPlayerControlled = false;
    }

    this.playerSquadId = squad.id;
    squad.isPlayerControlled = true;
    squad.currentCommand ??= SquadCommand.NONE;
    this.currentCommand = squad.currentCommand;
    this.updateCommandIndicator();
    this.emitCommandState();
    return true;
  }

  getCurrentCommand(): SquadCommand {
    return this.currentCommand;
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
      font-family: var(--font-primary, 'Rajdhani', sans-serif);
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

    commandText.textContent = getSquadCommandLabel(this.currentCommand, 'short');

    const isActiveCommand = this.currentCommand !== SquadCommand.NONE && this.currentCommand !== SquadCommand.FREE_ROAM;
    commandText.style.color = isActiveCommand ? 'rgba(92, 184, 92, 0.9)' : 'rgba(220, 225, 230, 0.55)';
  }

  getCommandPosition(): THREE.Vector3 | undefined {
    if (!this.playerSquadId) return undefined;
    const squad = this.squadManager.getSquad(this.playerSquadId);
    return squad?.commandPosition;
  }

  private emitCommandState(): void {
    const state = this.getCommandState();
    this.commandWorldMarker?.setCommand(state.currentCommand, state.commandPosition);
    for (const listener of this.commandStateListeners) {
      listener(state);
    }
  }
}
