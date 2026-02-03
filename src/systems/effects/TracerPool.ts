import * as THREE from 'three';

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
export class TracerPool {
  private scene: THREE.Scene;
  private pool: Tracer[] = [];
  private active: Tracer[] = [];
  private maxTracers: number;
  private tracerMaterial: THREE.LineBasicMaterial;
  private glowMaterial: THREE.LineBasicMaterial;

  constructor(scene: THREE.Scene, maxTracers = 64) {
    this.scene = scene;
    this.maxTracers = maxTracers;
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
      // Create shared geometry per tracer - core and glow lines share it
      // All tracers update vertex positions via setAttribute anyway
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      
      // Create a group with multiple lines for enhanced visibility
      const group = new THREE.Group();

      // Core tracer line - share geometry with glow line within same tracer
      const coreMaterial = this.tracerMaterial.clone();
      const coreLine = new THREE.Line(geometry, coreMaterial);
      group.add(coreLine);

      // Glow effect line (slightly larger) - shares same geometry as core line
      const glowMaterial = this.glowMaterial.clone();
      const glowLine = new THREE.Line(geometry, glowMaterial);
      glowLine.scale.set(1.1, 1.1, 1.1);
      group.add(glowLine);

      group.visible = false;
      this.pool.push({ group, coreLine, glowLine, aliveUntil: 0 });
      this.scene.add(group);
    }
  }

  spawn(start: THREE.Vector3, end: THREE.Vector3, lifetimeMs = 150): void {
    const tracer = this.pool.pop() || this.active.shift();
    if (!tracer) return;

    const positions = (tracer.coreLine.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;

    (tracer.coreLine.material as THREE.LineBasicMaterial).opacity = 0.9;
    (tracer.glowLine.material as THREE.LineBasicMaterial).opacity = 0.5;
    tracer.group.visible = true;
    tracer.aliveUntil = performance.now() + lifetimeMs;
    this.active.push(tracer);
  }

  update(): void {
    const now = performance.now();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const tracer = this.active[i];
      const timeLeft = tracer.aliveUntil - now;

      if (timeLeft <= 0) {
        tracer.group.visible = false;
        const last = this.active[this.active.length - 1];
        this.active[i] = last;
        this.active.pop();
        if (this.pool.length < this.maxTracers) this.pool.push(tracer);
      } else {
        // Fade out effect for last 50ms
        const fadeTime = 50;
        if (timeLeft < fadeTime) {
          const opacity = timeLeft / fadeTime;
          (tracer.coreLine.material as THREE.LineBasicMaterial).opacity = opacity * 0.9;
          (tracer.glowLine.material as THREE.LineBasicMaterial).opacity = opacity * 0.3;
        }
      }
    }
  }

  dispose(): void {
    // Dispose geometries from all tracers (active and pool)
    const allTracers = [...this.active, ...this.pool];
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    
    allTracers.forEach(t => {
      this.scene.remove(t.group);
      const geometry = t.coreLine.geometry as THREE.BufferGeometry;
      if (!disposedGeometries.has(geometry)) {
        geometry.dispose();
        disposedGeometries.add(geometry);
      }
      (t.coreLine.material as THREE.Material).dispose();
      (t.glowLine.material as THREE.Material).dispose();
    });
    
    this.active.length = 0;
    this.pool.length = 0;
    this.tracerMaterial.dispose();
    this.glowMaterial.dispose();
  }
}
