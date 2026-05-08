import * as THREE from 'three';
import type { CombatantSystem } from '../../systems/combat/CombatantSystem';
import { getAlliance } from '../../systems/combat/types';
import type { ZoneManager } from '../../systems/world/ZoneManager';
import { renderMinimap } from '../minimap/MinimapRenderer';
import type { InputMode } from '../../systems/input/InputManager';

export interface CommandTacticalMapRenderState {
  playerPosition: THREE.Vector3;
  playerRotation: number;
  worldSize: number;
  zoneManager?: ZoneManager;
  combatantSystem?: CombatantSystem;
  playerSquadId?: string;
  commandPosition?: THREE.Vector3;
}

export class CommandTacticalMap {
  private static readonly STYLE_ID = 'command-tactical-map-styles';
  private readonly container: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly title: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly size = 320;
  private renderState: CommandTacticalMapRenderState = {
    playerPosition: new THREE.Vector3(),
    playerRotation: 0,
    worldSize: 320
  };
  private placementCommandLabel = 'HOLD POSITION';
  private placementArmed = false;
  private inputMode: InputMode = 'keyboardMouse';
  private cursorWorldPosition?: THREE.Vector3;
  private cursorPinnedToDefault = true;
  private onPointSelected?: (position: THREE.Vector3) => void;
  private onSquadSelected?: (squadId: string) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'command-tactical-map';

    const header = document.createElement('div');
    header.className = 'command-tactical-map__header';

    this.title = document.createElement('div');
    this.title.className = 'command-tactical-map__title';
    this.title.textContent = 'Tactical Radius';

    this.detail = document.createElement('div');
    this.detail.className = 'command-tactical-map__detail';
    this.detail.textContent = 'Select an order, then place it on the map.';

    header.appendChild(this.title);
    header.appendChild(this.detail);
    this.container.appendChild(header);

    const frame = document.createElement('div');
    frame.className = 'command-tactical-map__frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'command-tactical-map__canvas';
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.context = this.canvas.getContext('2d')!;
    frame.appendChild(this.canvas);
    this.container.appendChild(frame);

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const localX = (event.clientX - rect.left) * scaleX;
      const localY = (event.clientY - rect.top) * scaleY;
      const worldPoint = this.minimapToWorld(localX, localY);
      if (this.placementArmed) {
        this.onPointSelected?.(worldPoint);
        return;
      }

      const squadId = this.findSelectableSquadId(worldPoint);
      if (squadId) {
        this.onSquadSelected?.(squadId);
      }
    });

    this.injectStyles();
    this.render();
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  setCallbacks(callbacks: {
    onPointSelected?: (position: THREE.Vector3) => void;
    onSquadSelected?: (squadId: string) => void;
  }): void {
    this.onPointSelected = callbacks.onPointSelected;
    this.onSquadSelected = callbacks.onSquadSelected;
  }

  setPlacementCommandLabel(label: string, armed = true): void {
    this.placementCommandLabel = label;
    this.placementArmed = armed;
    this.render();
  }

  setInputMode(inputMode: InputMode): void {
    if (this.inputMode === inputMode) return;
    this.inputMode = inputMode;
    this.render();
  }

  setRenderState(state: CommandTacticalMapRenderState): void {
    this.renderState = state;
    if (!this.cursorWorldPosition || this.cursorPinnedToDefault) {
      this.cursorWorldPosition = state.commandPosition?.clone() ?? state.playerPosition.clone();
      this.cursorPinnedToDefault = true;
    }
    this.render();
  }

  nudgeGamepadCursor(x: number, z: number, deltaTime: number): void {
    if (this.inputMode !== 'gamepad') return;
    if (x === 0 && z === 0) return;

    this.ensureCursorWorldPosition();

    const speed = Math.max(90, this.renderState.worldSize * 0.75);
    const rotatedX = x * speed * deltaTime;
    const rotatedZ = z * speed * deltaTime;
    const cos = Math.cos(this.renderState.playerRotation);
    const sin = Math.sin(this.renderState.playerRotation);

    this.cursorWorldPosition!.x += rotatedX * cos - rotatedZ * sin;
    this.cursorWorldPosition!.z += rotatedX * sin + rotatedZ * cos;
    this.cursorWorldPosition!.y = this.renderState.playerPosition.y;
    this.cursorPinnedToDefault = false;
    this.clampCursorToWindow();
    this.render();
  }

  confirmGamepadAction(): boolean {
    if (this.inputMode !== 'gamepad') return false;
    this.ensureCursorWorldPosition();

    if (this.placementArmed) {
      this.onPointSelected?.(this.cursorWorldPosition!.clone());
      return true;
    }

    return this.selectSquadAtCursor();
  }

  selectSquadAtCursor(): boolean {
    this.ensureCursorWorldPosition();
    const squadId = this.findSelectableSquadId(this.cursorWorldPosition!);
    if (!squadId) return false;
    this.onSquadSelected?.(squadId);
    return true;
  }

  dispose(): void {
    this.container.remove();
    document.getElementById(CommandTacticalMap.STYLE_ID)?.remove();
  }

  private render(): void {
    const hasPlacementOrder = this.placementArmed;
    this.container.dataset.armed = hasPlacementOrder ? 'true' : 'false';
    this.title.textContent = hasPlacementOrder
      ? `Place ${this.placementCommandLabel}`
      : 'Select Ground Order';
    if (hasPlacementOrder) {
      this.detail.textContent = this.inputMode === 'gamepad'
        ? `${Math.round(this.renderState.worldSize)}m window. Move the cursor with the left stick, then press A.`
        : `${Math.round(this.renderState.worldSize)}m tactical window centered on player`;
    } else {
      this.detail.textContent = this.inputMode === 'gamepad'
        ? 'Select a friendly squad with X or A, or arm Hold, Patrol, Fall Back, or Attack with the D-pad.'
        : 'Choose Hold, Patrol, Fall Back, or Attack, then place it on the map.';
    }

    renderMinimap({
      ctx: this.context,
      size: this.size,
      worldSize: this.renderState.worldSize,
      playerPosition: this.renderState.playerPosition,
      playerRotation: this.renderState.playerRotation,
      camera: {
        getWorldDirection: (target: THREE.Vector3) => {
          target.set(
            Math.sin(this.renderState.playerRotation),
            0,
            -Math.cos(this.renderState.playerRotation)
          );
          return target;
        }
      } as THREE.Camera,
      zoneManager: this.renderState.zoneManager,
      combatantSystem: this.renderState.combatantSystem,
      playerSquadId: this.renderState.playerSquadId,
      commandPosition: this.renderState.commandPosition
    });

    if (this.inputMode === 'gamepad') {
      this.drawGamepadCursor();
    }
  }

  private minimapToWorld(localX: number, localY: number): THREE.Vector3 {
    const scale = this.size / this.renderState.worldSize;
    const rotatedX = (localX - this.size / 2) / scale;
    const rotatedZ = (localY - this.size / 2) / scale;
    const cos = Math.cos(this.renderState.playerRotation);
    const sin = Math.sin(this.renderState.playerRotation);
    const dx = rotatedX * cos - rotatedZ * sin;
    const dz = rotatedX * sin + rotatedZ * cos;

    return new THREE.Vector3(
      this.renderState.playerPosition.x + dx,
      this.renderState.playerPosition.y,
      this.renderState.playerPosition.z + dz
    );
  }

  private ensureCursorWorldPosition(): void {
    if (!this.cursorWorldPosition) {
      this.cursorWorldPosition = this.renderState.commandPosition?.clone() ?? this.renderState.playerPosition.clone();
    }
  }

  private clampCursorToWindow(): void {
    if (!this.cursorWorldPosition) return;

    const dx = this.cursorWorldPosition.x - this.renderState.playerPosition.x;
    const dz = this.cursorWorldPosition.z - this.renderState.playerPosition.z;
    const cos = Math.cos(this.renderState.playerRotation);
    const sin = Math.sin(this.renderState.playerRotation);
    const rotatedX = dx * cos + dz * sin;
    const rotatedZ = -dx * sin + dz * cos;
    const halfWindow = this.renderState.worldSize * 0.5;
    const clampedRotatedX = THREE.MathUtils.clamp(rotatedX, -halfWindow, halfWindow);
    const clampedRotatedZ = THREE.MathUtils.clamp(rotatedZ, -halfWindow, halfWindow);
    const worldDx = clampedRotatedX * cos - clampedRotatedZ * sin;
    const worldDz = clampedRotatedX * sin + clampedRotatedZ * cos;

    this.cursorWorldPosition.set(
      this.renderState.playerPosition.x + worldDx,
      this.renderState.playerPosition.y,
      this.renderState.playerPosition.z + worldDz
    );
  }

  private findSelectableSquadId(worldPoint: THREE.Vector3): string | null {
    if (!this.renderState.combatantSystem || !this.renderState.playerSquadId) {
      return null;
    }

    const combatants = this.renderState.combatantSystem.getAllCombatants();
    const activeSquadLeader = combatants.find(
      combatant => combatant.squadId === this.renderState.playerSquadId && combatant.state !== 'dead'
    );
    if (!activeSquadLeader) return null;

    const friendlyAlliance = getAlliance(activeSquadLeader.faction);
    const centroids = new Map<string, { count: number; x: number; z: number }>();
    for (const combatant of combatants) {
      if (combatant.state === 'dead' || !combatant.squadId) continue;
      if (getAlliance(combatant.faction) !== friendlyAlliance) continue;

      const entry = centroids.get(combatant.squadId) ?? { count: 0, x: 0, z: 0 };
      entry.count += 1;
      entry.x += combatant.position.x;
      entry.z += combatant.position.z;
      centroids.set(combatant.squadId, entry);
    }

    const selectionRadius = (this.renderState.worldSize / this.size) * 18;
    const selectionRadiusSq = selectionRadius * selectionRadius;
    let nearestSquadId: string | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const [squadId, centroid] of centroids) {
      const centerX = centroid.x / centroid.count;
      const centerZ = centroid.z / centroid.count;
      const dx = centerX - worldPoint.x;
      const dz = centerZ - worldPoint.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > selectionRadiusSq || distanceSq >= nearestDistanceSq) {
        continue;
      }
      nearestDistanceSq = distanceSq;
      nearestSquadId = squadId;
    }

    return nearestSquadId;
  }

  private drawGamepadCursor(): void {
    this.ensureCursorWorldPosition();
    if (!this.cursorWorldPosition) return;

    const scale = this.size / this.renderState.worldSize;
    const dx = this.cursorWorldPosition.x - this.renderState.playerPosition.x;
    const dz = this.cursorWorldPosition.z - this.renderState.playerPosition.z;
    const cos = Math.cos(this.renderState.playerRotation);
    const sin = Math.sin(this.renderState.playerRotation);
    const rotatedX = dx * cos + dz * sin;
    const rotatedZ = -dx * sin + dz * cos;
    const cursorX = this.size / 2 + rotatedX * scale;
    const cursorY = this.size / 2 + rotatedZ * scale;

    this.context.strokeStyle = this.placementArmed
      ? 'rgba(214, 165, 89, 0.92)'
      : 'rgba(92, 184, 92, 0.92)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(cursorX, cursorY, 8, 0, Math.PI * 2);
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(cursorX - 10, cursorY);
    this.context.lineTo(cursorX + 10, cursorY);
    this.context.stroke();

    this.context.beginPath();
    this.context.moveTo(cursorX, cursorY - 10);
    this.context.lineTo(cursorX, cursorY + 10);
    this.context.stroke();
  }

  private injectStyles(): void {
    if (document.getElementById(CommandTacticalMap.STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = CommandTacticalMap.STYLE_ID;
    style.textContent = `
      .command-tactical-map {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .command-tactical-map__header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .command-tactical-map__title {
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(244, 241, 231, 0.94);
      }

      .command-tactical-map__detail {
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(203, 197, 181, 0.68);
      }

      .command-tactical-map__frame {
        position: relative;
        border: 1px solid rgba(214, 165, 89, 0.25);
        border-radius: 16px;
        overflow: hidden;
        background: rgba(12, 14, 16, 0.92);
      }

      .command-tactical-map__frame::after {
        content: '';
        position: absolute;
        inset: 0;
        background:
          linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.08)),
          radial-gradient(circle at center, transparent 52%, rgba(0, 0, 0, 0.2));
        pointer-events: none;
      }

      .command-tactical-map__canvas {
        display: block;
        width: 100%;
        max-width: 320px;
        aspect-ratio: 1;
        cursor: default;
        touch-action: manipulation;
        image-rendering: auto;
      }

      .command-tactical-map[data-armed="true"] .command-tactical-map__canvas {
        cursor: crosshair;
      }

      @media (max-width: 620px) {
        .command-tactical-map__canvas {
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
