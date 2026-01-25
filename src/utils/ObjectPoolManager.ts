import * as THREE from 'three';

/**
 * Singleton object pool manager for allocation-free combat loops
 * Pre-allocates and reuses Vector3, Quaternion, and Raycaster objects
 * to eliminate GC pauses during hot combat updates
 */
class ObjectPoolManager {
  private static instance: ObjectPoolManager;

  private vector3Pool: THREE.Vector3[] = [];
  private vector3InUse: Set<THREE.Vector3> = new Set();

  private quaternionPool: THREE.Quaternion[] = [];
  private quaternionInUse: Set<THREE.Quaternion> = new Set();

  private raycasterPool: THREE.Raycaster[] = [];
  private raycasterInUse: Set<THREE.Raycaster> = new Set();

  private matrix4Pool: THREE.Matrix4[] = [];
  private matrix4InUse: Set<THREE.Matrix4> = new Set();

  // Telemetry
  private stats = {
    vector3Borrowed: 0,
    vector3Created: 0,
    quaternionBorrowed: 0,
    quaternionCreated: 0,
    raycasterBorrowed: 0,
    raycasterCreated: 0,
    matrix4Borrowed: 0,
    matrix4Created: 0,
    peakVector3: 0,
    peakQuaternion: 0,
    peakRaycaster: 0,
    peakMatrix4: 0
  };

  private constructor() {}

  static getInstance(): ObjectPoolManager {
    if (!ObjectPoolManager.instance) {
      ObjectPoolManager.instance = new ObjectPoolManager();
    }
    return ObjectPoolManager.instance;
  }

  /**
   * Pre-allocate pools at startup to avoid allocations during gameplay
   * Recommended: 50 Vector3, 20 Quaternion, 10 Raycaster, 30 Matrix4
   */
  warmup(vector3Count: number, quaternionCount: number, raycasterCount: number, matrix4Count: number = 30): void {
    console.log(`🔥 Warming up object pools: Vector3=${vector3Count}, Quaternion=${quaternionCount}, Raycaster=${raycasterCount}, Matrix4=${matrix4Count}`);

    for (let i = 0; i < vector3Count; i++) {
      this.vector3Pool.push(new THREE.Vector3());
    }

    for (let i = 0; i < quaternionCount; i++) {
      this.quaternionPool.push(new THREE.Quaternion());
    }

    for (let i = 0; i < raycasterCount; i++) {
      this.raycasterPool.push(new THREE.Raycaster());
    }

    for (let i = 0; i < matrix4Count; i++) {
      this.matrix4Pool.push(new THREE.Matrix4());
    }

    console.log(`✅ Object pools warmed up and ready`);
  }

  // Vector3 Pool
  getVector3(): THREE.Vector3 {
    this.stats.vector3Borrowed++;

    if (this.vector3Pool.length > 0) {
      const v = this.vector3Pool.pop()!;
      this.vector3InUse.add(v);
      this.stats.peakVector3 = Math.max(this.stats.peakVector3, this.vector3InUse.size);
      return v.set(0, 0, 0); // Reset to zero
    }

    // Pool exhausted, create new (fallback)
    this.stats.vector3Created++;
    if (this.stats.vector3Created % 10 === 0) {
      console.warn(`⚠️ Vector3 pool exhausted, created ${this.stats.vector3Created} additional vectors`);
    }
    const v = new THREE.Vector3();
    this.vector3InUse.add(v);
    return v;
  }

  releaseVector3(v: THREE.Vector3): void {
    if (this.vector3InUse.has(v)) {
      this.vector3InUse.delete(v);
      this.vector3Pool.push(v);
    }
  }

  // Quaternion Pool
  getQuaternion(): THREE.Quaternion {
    this.stats.quaternionBorrowed++;

    if (this.quaternionPool.length > 0) {
      const q = this.quaternionPool.pop()!;
      this.quaternionInUse.add(q);
      this.stats.peakQuaternion = Math.max(this.stats.peakQuaternion, this.quaternionInUse.size);
      return q.set(0, 0, 0, 1); // Reset to identity
    }

    // Pool exhausted, create new (fallback)
    this.stats.quaternionCreated++;
    if (this.stats.quaternionCreated % 5 === 0) {
      console.warn(`⚠️ Quaternion pool exhausted, created ${this.stats.quaternionCreated} additional quaternions`);
    }
    const q = new THREE.Quaternion();
    this.quaternionInUse.add(q);
    return q;
  }

  releaseQuaternion(q: THREE.Quaternion): void {
    if (this.quaternionInUse.has(q)) {
      this.quaternionInUse.delete(q);
      this.quaternionPool.push(q);
    }
  }

  // Raycaster Pool
  getRaycaster(): THREE.Raycaster {
    this.stats.raycasterBorrowed++;

    if (this.raycasterPool.length > 0) {
      const r = this.raycasterPool.pop()!;
      this.raycasterInUse.add(r);
      this.stats.peakRaycaster = Math.max(this.stats.peakRaycaster, this.raycasterInUse.size);
      return r;
    }

    // Pool exhausted, create new (fallback)
    this.stats.raycasterCreated++;
    if (this.stats.raycasterCreated % 3 === 0) {
      console.warn(`⚠️ Raycaster pool exhausted, created ${this.stats.raycasterCreated} additional raycasters`);
    }
    const r = new THREE.Raycaster();
    this.raycasterInUse.add(r);
    return r;
  }

  releaseRaycaster(r: THREE.Raycaster): void {
    if (this.raycasterInUse.has(r)) {
      this.raycasterInUse.delete(r);
      this.raycasterPool.push(r);
    }
  }

  // Matrix4 Pool
  getMatrix4(): THREE.Matrix4 {
    this.stats.matrix4Borrowed++;

    if (this.matrix4Pool.length > 0) {
      const m = this.matrix4Pool.pop()!;
      this.matrix4InUse.add(m);
      this.stats.peakMatrix4 = Math.max(this.stats.peakMatrix4, this.matrix4InUse.size);
      return m.identity(); // Reset to identity
    }

    // Pool exhausted, create new (fallback)
    this.stats.matrix4Created++;
    if (this.stats.matrix4Created % 10 === 0) {
      console.warn(`⚠️ Matrix4 pool exhausted, created ${this.stats.matrix4Created} additional matrices`);
    }
    const m = new THREE.Matrix4();
    this.matrix4InUse.add(m);
    return m;
  }

  releaseMatrix4(m: THREE.Matrix4): void {
    if (this.matrix4InUse.has(m)) {
      this.matrix4InUse.delete(m);
      this.matrix4Pool.push(m);
    }
  }

  /**
   * Get pool utilization statistics for debugging
   */
  getStats() {
    return {
      ...this.stats,
      vector3Available: this.vector3Pool.length,
      vector3InUse: this.vector3InUse.size,
      quaternionAvailable: this.quaternionPool.length,
      quaternionInUse: this.quaternionInUse.size,
      raycasterAvailable: this.raycasterPool.length,
      raycasterInUse: this.raycasterInUse.size,
      matrix4Available: this.matrix4Pool.length,
      matrix4InUse: this.matrix4InUse.size
    };
  }

  /**
   * Reset telemetry counters (useful for frame-based measurements)
   */
  resetStats(): void {
    this.stats.vector3Borrowed = 0;
    this.stats.quaternionBorrowed = 0;
    this.stats.raycasterBorrowed = 0;
    this.stats.matrix4Borrowed = 0;
  }
}

// Export singleton instance
export const objectPool = ObjectPoolManager.getInstance();
