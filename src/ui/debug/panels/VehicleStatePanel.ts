import * as THREE from 'three';
import { zIndex } from '../../design/tokens';
import type { DebugPanel } from '../DebugHudRegistry';
import type { IPlayerController } from '../../../types/SystemInterfaces';

/**
 * Thin panel showing the player's current vehicle (or on-foot) state:
 * type, id, position, velocity, altitude AGL. Updates at ~10Hz to save DOM work.
 */
export class VehicleStatePanel implements DebugPanel {
  readonly id = 'vehicle-state';
  readonly label = 'Vehicle State';
  readonly defaultVisible = true;

  private container: HTMLDivElement;
  private visible = false;
  private playerController?: IPlayerController;
  private getGroundY?: (x: number, z: number) => number;
  private accumDt = 0;
  private readonly _scratchPos = new THREE.Vector3();
  private readonly _scratchVel = new THREE.Vector3();

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'vehicle-state-panel';
    this.container.style.position = 'fixed';
    this.container.style.top = '16px';
    this.container.style.left = '50%';
    this.container.style.transform = 'translateX(-50%)';
    this.container.style.padding = '8px 12px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(79, 148, 120, 0.5)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '11px';
    this.container.style.color = '#a9f1d8';
    this.container.style.zIndex = String(zIndex.debug);
    this.container.style.pointerEvents = 'none';
    this.container.style.whiteSpace = 'pre';
    this.container.style.display = 'none';
    this.container.innerText = 'VEHICLE\n(no data)';
  }

  /** Wire read-only accessors. */
  setSources(
    playerController: IPlayerController,
    getGroundY: (x: number, z: number) => number,
  ): void {
    this.playerController = playerController;
    this.getGroundY = getGroundY;
  }

  mount(container: HTMLElement): void { container.appendChild(this.container); }
  unmount(): void {
    if (this.container.parentElement) this.container.parentElement.removeChild(this.container);
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }
  isVisible(): boolean { return this.visible; }

  update(dt: number): void {
    if (!this.visible) return;
    this.accumDt += dt;
    if (this.accumDt < 0.1) return;
    this.accumDt = 0;

    if (!this.playerController) {
      this.container.innerText = 'VEHICLE\n(no controller)';
      return;
    }

    const pos = this.playerController.getPosition(this._scratchPos);
    const vel = this.playerController.getVelocity(this._scratchVel);
    const speed = vel.length();

    let vehicleLine: string;
    if (this.playerController.isInHelicopter()) {
      vehicleLine = `helicopter ${this.playerController.getHelicopterId() ?? '?'}`;
    } else if (this.playerController.isInFixedWing()) {
      vehicleLine = `fixed_wing ${this.playerController.getFixedWingId() ?? '?'}`;
    } else {
      vehicleLine = 'on-foot';
    }

    let agl = '—';
    if (this.getGroundY) {
      const ground = this.getGroundY(pos.x, pos.z);
      if (Number.isFinite(ground)) {
        agl = `${(pos.y - ground).toFixed(1)} m`;
      }
    }

    this.container.innerText = [
      'VEHICLE',
      vehicleLine,
      `pos ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}`,
      `vel ${speed.toFixed(1)} m/s`,
      `agl ${agl}`,
    ].join('\n');
  }
}
