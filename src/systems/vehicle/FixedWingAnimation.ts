import * as THREE from 'three';
import { getFixedWingDisplayInfo } from './FixedWingConfigs';

const TAU = Math.PI * 2;

interface PropellerState {
  nodes: THREE.Object3D[];
}

/**
 * Animates propellers on fixed-wing aircraft based on throttle.
 * Jets (F-4 Phantom) have no propellers and are skipped.
 */
export class FixedWingAnimation {
  private propellers = new Map<string, PropellerState>();

  /**
   * Wire propeller nodes from a loaded GLB group.
   * Searches for named parts matching the config's propellerNodes list.
   */
  initialize(aircraftId: string, configKey: string, group: THREE.Group): void {
    const display = getFixedWingDisplayInfo(configKey);
    if (!display || !display.hasPropellers) return;

    const nodes: THREE.Object3D[] = [];
    const targetNames = display.propellerNodes.map(n => n.toLowerCase());

    group.traverse((child) => {
      const name = child.name.toLowerCase();
      for (const target of targetNames) {
        if (name.includes(target)) {
          nodes.push(child);
          break;
        }
      }
    });

    if (nodes.length > 0) {
      this.propellers.set(aircraftId, { nodes });
    }
  }

  /**
   * Spin propellers based on throttle. Called each frame.
   * Propeller rotation axis is Z (forward-facing prop spins around its local Z).
   */
  update(aircraftId: string, throttle: number, dt: number): void {
    const state = this.propellers.get(aircraftId);
    if (!state) return;

    // Propeller speed proportional to throttle, with minimum idle spin
    const speed = (0.1 + throttle * 0.9) * 80; // radians/sec at full throttle

    for (const node of state.nodes) {
      node.rotation.z = (node.rotation.z + speed * dt) % TAU;
    }
  }

  dispose(aircraftId: string): void {
    this.propellers.delete(aircraftId);
  }

  disposeAll(): void {
    this.propellers.clear();
  }
}
