// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { SquadCommand } from './types';
import { SquadManager } from './SquadManager';
import { Logger } from '../../utils/Logger';
import {
  getQuickCommandOption,
  getSquadCommandLabel,
  requiresCommandTarget,
  SQUAD_QUICK_COMMAND_OPTIONS,
  type SquadQuickCommandOption
} from './SquadCommandPresentation';
import { SquadCommandWorldMarker } from './SquadCommandWorldMarker';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

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

/**
 * Resolve the persistence-leash radius for a command at issue time from
 * SquadCommandConfig (SVYAZ-4 Stage 2). Only the leashed standing orders
 * (HOLD/ATTACK/PATROL) get a radius; non-leashed orders leave it undefined so
 * the acquisition gate stays inert off the commanded path.
 */
function resolveCommandLeashRadius(command: SquadCommand): number | undefined {
  switch (command) {
    case SquadCommand.HOLD_POSITION:
      return SquadCommandConfig.holdLeashRadius;
    case SquadCommand.ATTACK_HERE:
      return SquadCommandConfig.attackLeashRadius;
    case SquadCommand.PATROL_HERE:
      return SquadCommandConfig.patrolRoamRadius;
    default:
      return undefined;
  }
}

/**
 * Leashed standing orders (HOLD/ATTACK/PATROL) anchor an acquisition leash on
 * their `commandPosition`. A leashed anchor that lands off the navmesh / inside
 * geometry / on an unwalkable slope makes the commanded NPC path toward an
 * unreachable point — StuckDetector escalates and clears the destination, and
 * the unit loops forever (SVYAZ-4 Stage 4 watch-item). Only these orders need
 * the navmesh snap; FREE_ROAM / STAND DOWN / FALL BACK carry no leash anchor.
 */
function isLeashedAnchorCommand(command: SquadCommand): boolean {
  return (
    command === SquadCommand.HOLD_POSITION ||
    command === SquadCommand.ATTACK_HERE ||
    command === SquadCommand.PATROL_HERE
  );
}

interface PlayerSquadControllerOptions {
  scene?: THREE.Scene;
  terrainHeightAt?: (x: number, z: number) => number;
  /**
   * Project a marked world point onto the nearest REACHABLE navmesh point
   * (SVYAZ-4 Stage 4 unreachable-anchor snap). Returns null when the navmesh is
   * not ready / nothing reachable within the snap radius — the caller then
   * stores the RAW point (fail-open: better an approximate anchor than a dropped
   * command). Wired from the NavmeshSystem at startup; left undefined off the
   * commanded path (tests, headless) so behavior is byte-identical there.
   */
  snapToNavmesh?: (point: THREE.Vector3) => THREE.Vector3 | null;
}

export class PlayerSquadController implements GameSystem {
  private squadManager: SquadManager;
  private playerSquadId?: string;
  private playerPosition = new THREE.Vector3();
  private currentCommand: SquadCommand = SquadCommand.NONE;
  private commandIndicatorElement?: HTMLElement;
  private readonly commandWorldMarker?: SquadCommandWorldMarker;
  private readonly commandStateListeners = new Set<SquadCommandStateListener>();
  private readonly snapToNavmesh?: (point: THREE.Vector3) => THREE.Vector3 | null;

  constructor(squadManager: SquadManager, options: PlayerSquadControllerOptions = {}) {
    this.squadManager = squadManager;
    this.snapToNavmesh = options.snapToNavmesh;
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

    if (requiresCommandTarget(command) && !explicitPosition) {
      // A target-requiring order (hold/patrol/attack/fall-back) must carry an
      // explicit marked point. Without one — e.g. a bare hotkey before the
      // look-to-mark pick resolved — drop it rather than silently anchoring on
      // the player's own feet (the old default that made these commands feel
      // broken). The look-to-mark / map-click point is resolved upstream.
      return;
    }

    squad.currentCommand = command;
    squad.commandPosition = explicitPosition
      ? this.resolveAnchorPosition(command, explicitPosition)
      : undefined;
    squad.commandLeashRadius = resolveCommandLeashRadius(command);
    this.currentCommand = command;
    const commandLabel = getSquadCommandLabel(command, 'full');
    Logger.info('squad', ` Squad Command Issued: ${commandLabel}`);
    this.showCommandFeedback(commandLabel);
    this.updateCommandIndicator();
    this.emitCommandState();
  }

  /**
   * Resolve the stored anchor for a marked command (SVYAZ-4 Stage 4
   * unreachable-anchor navmesh snap). For a leashed standing order
   * (HOLD/ATTACK/PATROL) the marked point is projected onto the nearest
   * REACHABLE navmesh point so the commanded NPC paths toward a walkable goal
   * rather than an unreachable point that StuckDetector escalates + clears
   * (the loop-forever watch-item). Fail-open: when no snapper is wired or the
   * navmesh yields nothing reachable, the RAW marked point is stored (current
   * behavior) — never drop the command. Non-leashed orders are never snapped;
   * off the commanded path (no snapper) every order stores the raw clone, so
   * behavior is byte-identical there.
   */
  private resolveAnchorPosition(command: SquadCommand, marked: THREE.Vector3): THREE.Vector3 {
    if (this.snapToNavmesh && isLeashedAnchorCommand(command)) {
      const snapped = this.snapToNavmesh(marked);
      if (snapped) {
        return snapped.clone();
      }
    }
    return marked.clone();
  }

  private showCommandFeedback(commandName: string): void {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(79, 107, 58, 0.15);
      border: 1px solid rgba(79, 107, 58, 0.5);
      padding: 20px 40px;
      border-radius: 6px;
      color: rgba(79, 107, 58, 0.9);
      font-family: var(--font-primary);
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
      color: rgba(231, 217, 186, 0.55);
      font-family: var(--font-primary);
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
    commandText.style.color = isActiveCommand ? 'rgba(79, 107, 58, 0.9)' : 'rgba(231, 217, 186, 0.55)';
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
