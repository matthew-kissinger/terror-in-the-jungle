import * as THREE from 'three';
import type { CombatantSystem } from '../../systems/combat/CombatantSystem';
import type { ZoneManager } from '../../systems/world/ZoneManager';
import { renderMinimap } from '../minimap/MinimapRenderer';

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
  private onPointSelected?: (position: THREE.Vector3) => void;

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
      if (!this.placementArmed) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const localX = (event.clientX - rect.left) * scaleX;
      const localY = (event.clientY - rect.top) * scaleY;
      this.onPointSelected?.(this.minimapToWorld(localX, localY));
    });

    this.injectStyles();
    this.render();
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  setCallbacks(callbacks: { onPointSelected?: (position: THREE.Vector3) => void }): void {
    this.onPointSelected = callbacks.onPointSelected;
  }

  setPlacementCommandLabel(label: string, armed = true): void {
    this.placementCommandLabel = label;
    this.placementArmed = armed;
    this.render();
  }

  setRenderState(state: CommandTacticalMapRenderState): void {
    this.renderState = state;
    this.render();
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
    this.detail.textContent = hasPlacementOrder
      ? `${Math.round(this.renderState.worldSize)}m tactical window centered on player`
      : 'Choose Hold, Patrol, or Retreat, then place it on the map.';

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
