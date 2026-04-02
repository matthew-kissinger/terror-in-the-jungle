import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import { EffectPool } from './EffectPool';

interface Tracer {
  group: THREE.Group;
  coreLine: THREE.Line;
  glowLine: THREE.Line;
  aliveUntil: number;
}

/**
 * Simple pooled tracer system using THREE.Line (keeps deps minimal).
 * For thicker lines, swap to Line2 later.
 */
export class TracerPool extends EffectPool<Tracer> {
  private tracerMaterial: THREE.LineBasicMaterial;
  private glowMaterial: THREE.LineBasicMaterial;

  constructor(scene: THREE.Scene, maxTracers = 64) {
    super(scene, maxTracers);
    // Enhanced tracers for night combat visibility
    this.tracerMaterial = new THREE.LineBasicMaterial({
      color: 0xff9944, // Orange-red tracer
      linewidth: 2,
      opacity: 0.9,  // Highly visible in darkness
      transparent: true
    });
    // Secondary glow for enhanced night visibility
    this.glowMaterial = new THREE.LineBasicMaterial({
      color: 0xffdd66, // Bright yellow-orange glow
      linewidth: 3,
      opacity: 0.5,  // Visible glow effect
      transparent: true
    });

    for (let i = 0; i < maxTracers; i++) {
      const tracer = this.createEffect();
      this.scene.add(tracer.group);
      this.pool.push(tracer);
    }
  }

  protected createEffect(): Tracer {
    // Create shared geometry per tracer - core and glow lines share it
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);

    const group = new THREE.Group();

    // Core tracer line
    const coreMaterial = this.tracerMaterial.clone();
    const coreLine = new THREE.Line(geometry, coreMaterial);
    group.add(coreLine);

    // Glow effect line (slightly larger) - shares same geometry as core line
    const glowMat = this.glowMaterial.clone();
    const glowLine = new THREE.Line(geometry, glowMat);
    glowLine.scale.set(1.1, 1.1, 1.1);
    group.add(glowLine);

    group.visible = false;
    group.matrixAutoUpdate = true;
    return { group, coreLine, glowLine, aliveUntil: 0 };
  }

  protected isExpired(tracer: Tracer, now: number): boolean {
    return tracer.aliveUntil <= now;
  }

  protected deactivateEffect(tracer: Tracer): void {
    tracer.group.visible = false;
  }

  protected disposeEffect(tracer: Tracer): void {
    this.scene.remove(tracer.group);
    (tracer.coreLine.geometry as THREE.BufferGeometry).dispose();
    (tracer.coreLine.material as THREE.Material).dispose();
    (tracer.glowLine.material as THREE.Material).dispose();
  }

  spawn(start: THREE.Vector3, end: THREE.Vector3, lifetimeMs = 150): void {
    if (import.meta.env.DEV && lifetimeMs > 0 && lifetimeMs < 1) {
      Logger.warn('effects', `TracerPool.spawn received suspicious lifetimeMs=${lifetimeMs}. Did the caller pass seconds instead of milliseconds?`);
    }

    const tracer = this.acquire();
    if (!tracer) return;

    const positions = (tracer.coreLine.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;

    (tracer.coreLine.material as THREE.LineBasicMaterial).opacity = 0.9;
    (tracer.glowLine.material as THREE.LineBasicMaterial).opacity = 0.5;
    tracer.group.visible = true;
    tracer.aliveUntil = performance.now() + Math.max(1, lifetimeMs);
    this.pushActive(tracer);
  }

  update(): void {
    const now = performance.now();

    // Update fade on active tracers before sweeping expired ones
    for (const tracer of this.active) {
      const timeLeft = tracer.aliveUntil - now;
      if (timeLeft > 0 && timeLeft < 50) {
        const opacity = timeLeft / 50;
        (tracer.coreLine.material as THREE.LineBasicMaterial).opacity = opacity * 0.9;
        (tracer.glowLine.material as THREE.LineBasicMaterial).opacity = opacity * 0.3;
      }
    }

    this.sweep(now);
  }

  dispose(): void {
    super.dispose();
    this.tracerMaterial.dispose();
    this.glowMaterial.dispose();
  }
}
