import * as THREE from 'three';
import { getFixedWingDisplayInfo } from './FixedWingConfigs';

const TAU = Math.PI * 2;

interface PropellerState {
  nodes: Array<{
    node: THREE.Object3D;
    axis: PropellerSpinAxis;
  }>;
}

type PropellerSpinAxis = 'x' | 'y' | 'z';

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
  initialize(
    aircraftId: string,
    configKey: string,
    group: THREE.Group,
    animations: THREE.AnimationClip[] = [],
  ): void {
    const display = getFixedWingDisplayInfo(configKey);
    if (!display || !display.hasPropellers) return;

    const nodes: PropellerState['nodes'] = [];
    const targetNames = display.propellerNodes.map(n => n.toLowerCase());
    const animationAxes = inferSpinAxesFromAnimationClips(animations);

    group.traverse((child) => {
      const name = child.name.toLowerCase();
      for (const target of targetNames) {
        if (name.includes(target)) {
          nodes.push({
            node: child,
            axis: animationAxes.get(name) ?? 'z',
          });
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
   * When `isActive` is false (parked unpiloted aircraft), the propeller stops
   * entirely — no idle-floor spin.
   */
  update(aircraftId: string, throttle: number, dt: number, isActive: boolean = true): void {
    const state = this.propellers.get(aircraftId);
    if (!state) return;

    if (!isActive) return;

    // Propeller speed proportional to throttle, with minimum idle spin
    const speed = (0.1 + throttle * 0.9) * 80; // radians/sec at full throttle

    for (const propeller of state.nodes) {
      propeller.node.rotation[propeller.axis] = (propeller.node.rotation[propeller.axis] + speed * dt) % TAU;
    }
  }

  dispose(aircraftId: string): void {
    this.propellers.delete(aircraftId);
  }

  disposeAll(): void {
    this.propellers.clear();
  }
}

function inferSpinAxesFromAnimationClips(animations: THREE.AnimationClip[]): Map<string, PropellerSpinAxis> {
  const axes = new Map<string, PropellerSpinAxis>();
  for (const clip of animations) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion') || track.values.length < 8) {
        continue;
      }

      const nodeName = track.name.slice(0, -'.quaternion'.length).toLowerCase();
      const axis = inferQuaternionTrackAxis(track.values);
      if (axis) {
        axes.set(nodeName, axis);
      }
    }
  }
  return axes;
}

function inferQuaternionTrackAxis(values: ArrayLike<number>): PropellerSpinAxis | null {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (let i = 0; i + 3 < values.length; i += 4) {
    maxX = Math.max(maxX, Math.abs(values[i]));
    maxY = Math.max(maxY, Math.abs(values[i + 1]));
    maxZ = Math.max(maxZ, Math.abs(values[i + 2]));
  }

  if (maxX < 0.5 && maxY < 0.5 && maxZ < 0.5) {
    return null;
  }
  if (maxX >= maxY && maxX >= maxZ) return 'x';
  if (maxY >= maxX && maxY >= maxZ) return 'y';
  return 'z';
}
