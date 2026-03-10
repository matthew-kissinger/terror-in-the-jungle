import { Logger } from './Logger';
import * as THREE from 'three';

const IN_USE_KEY = '__objectPoolInUse';

/**
 * Singleton object pool manager for allocation-free combat loops
 * Pre-allocates and reuses Vector3, Quaternion, and Raycaster objects
 * to eliminate GC pauses during hot combat updates
 */
class ObjectPoolManager {
  private static instance: ObjectPoolManager;

  private vector3Pool: THREE.Vector3[] = [];
  private vector3InUseCount = 0;

  private quaternionPool: THREE.Quaternion[] = [];
  private quaternionInUseCount = 0;

  private raycasterPool: THREE.Raycaster[] = [];
  private raycasterInUseCount = 0;

  private matrix4Pool: THREE.Matrix4[] = [];
  private matrix4InUseCount = 0;

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
    Logger.info('utils', `Warming up object pools: Vector3=${vector3Count}, Quaternion=${quaternionCount}, Raycaster=${raycasterCount}, Matrix4=${matrix4Count}`);

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

    Logger.info('utils', `Object pools warmed up and ready`);
  }

  // Vector3 Pool
  getVector3(): THREE.Vector3 {
    this.stats.vector3Borrowed++;

    if (this.vector3Pool.length > 0) {
      const v = this.vector3Pool.pop()!;
      this.markBorrowed(v);
      this.vector3InUseCount++;
      this.stats.peakVector3 = Math.max(this.stats.peakVector3, this.vector3InUseCount);
      return v.set(0, 0, 0); // Reset to zero
    }

    // Pool exhausted, create new (fallback)
    this.stats.vector3Created++;
    if (this.stats.vector3Created % 10 === 0) {
      Logger.warn('utils', `Vector3 pool exhausted, created ${this.stats.vector3Created} additional vectors`);
    }
    const v = new THREE.Vector3();
    this.markBorrowed(v);
    this.vector3InUseCount++;
    this.stats.peakVector3 = Math.max(this.stats.peakVector3, this.vector3InUseCount);
    return v;
  }

  releaseVector3(v: THREE.Vector3): void {
    if (!this.markReleased(v)) {
      return;
    }
    this.vector3InUseCount = Math.max(0, this.vector3InUseCount - 1);
    this.vector3Pool.push(v);
  }

  // Quaternion Pool
  getQuaternion(): THREE.Quaternion {
    this.stats.quaternionBorrowed++;

    if (this.quaternionPool.length > 0) {
      const q = this.quaternionPool.pop()!;
      this.markBorrowed(q);
      this.quaternionInUseCount++;
      this.stats.peakQuaternion = Math.max(this.stats.peakQuaternion, this.quaternionInUseCount);
      return q.set(0, 0, 0, 1); // Reset to identity
    }

    // Pool exhausted, create new (fallback)
    this.stats.quaternionCreated++;
    if (this.stats.quaternionCreated % 5 === 0) {
      Logger.warn('utils', `Quaternion pool exhausted, created ${this.stats.quaternionCreated} additional quaternions`);
    }
    const q = new THREE.Quaternion();
    this.markBorrowed(q);
    this.quaternionInUseCount++;
    this.stats.peakQuaternion = Math.max(this.stats.peakQuaternion, this.quaternionInUseCount);
    return q;
  }

  releaseQuaternion(q: THREE.Quaternion): void {
    if (!this.markReleased(q)) {
      return;
    }
    this.quaternionInUseCount = Math.max(0, this.quaternionInUseCount - 1);
    this.quaternionPool.push(q);
  }

  // Raycaster Pool
  getRaycaster(): THREE.Raycaster {
    this.stats.raycasterBorrowed++;

    if (this.raycasterPool.length > 0) {
      const r = this.raycasterPool.pop()!;
      this.markBorrowed(r);
      this.raycasterInUseCount++;
      this.stats.peakRaycaster = Math.max(this.stats.peakRaycaster, this.raycasterInUseCount);
      return r;
    }

    // Pool exhausted, create new (fallback)
    this.stats.raycasterCreated++;
    if (this.stats.raycasterCreated % 3 === 0) {
      Logger.warn('utils', `Raycaster pool exhausted, created ${this.stats.raycasterCreated} additional raycasters`);
    }
    const r = new THREE.Raycaster();
    this.markBorrowed(r);
    this.raycasterInUseCount++;
    this.stats.peakRaycaster = Math.max(this.stats.peakRaycaster, this.raycasterInUseCount);
    return r;
  }

  releaseRaycaster(r: THREE.Raycaster): void {
    if (!this.markReleased(r)) {
      return;
    }
    this.raycasterInUseCount = Math.max(0, this.raycasterInUseCount - 1);
    this.raycasterPool.push(r);
  }

  // Matrix4 Pool
  getMatrix4(): THREE.Matrix4 {
    this.stats.matrix4Borrowed++;

    if (this.matrix4Pool.length > 0) {
      const m = this.matrix4Pool.pop()!;
      this.markBorrowed(m);
      this.matrix4InUseCount++;
      this.stats.peakMatrix4 = Math.max(this.stats.peakMatrix4, this.matrix4InUseCount);
      return m.identity(); // Reset to identity
    }

    // Pool exhausted, create new (fallback)
    this.stats.matrix4Created++;
    if (this.stats.matrix4Created % 10 === 0) {
      Logger.warn('utils', `Matrix4 pool exhausted, created ${this.stats.matrix4Created} additional matrices`);
    }
    const m = new THREE.Matrix4();
    this.markBorrowed(m);
    this.matrix4InUseCount++;
    this.stats.peakMatrix4 = Math.max(this.stats.peakMatrix4, this.matrix4InUseCount);
    return m;
  }

  releaseMatrix4(m: THREE.Matrix4): void {
    if (!this.markReleased(m)) {
      return;
    }
    this.matrix4InUseCount = Math.max(0, this.matrix4InUseCount - 1);
    this.matrix4Pool.push(m);
  }

  /**
   * Get pool utilization statistics for debugging
   */
  getStats() {
    return {
      ...this.stats,
      vector3Available: this.vector3Pool.length,
      vector3InUse: this.vector3InUseCount,
      quaternionAvailable: this.quaternionPool.length,
      quaternionInUse: this.quaternionInUseCount,
      raycasterAvailable: this.raycasterPool.length,
      raycasterInUse: this.raycasterInUseCount,
      matrix4Available: this.matrix4Pool.length,
      matrix4InUse: this.matrix4InUseCount
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

  reset(): void {
    this.vector3Pool.length = 0;
    this.quaternionPool.length = 0;
    this.raycasterPool.length = 0;
    this.matrix4Pool.length = 0;
    this.vector3InUseCount = 0;
    this.quaternionInUseCount = 0;
    this.raycasterInUseCount = 0;
    this.matrix4InUseCount = 0;
    this.stats = {
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
  }

  private markBorrowed(obj: object): void {
    const record = obj as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, IN_USE_KEY)) {
      Object.defineProperty(record, IN_USE_KEY, {
        value: true,
        writable: true,
        configurable: true,
        enumerable: false
      });
      return;
    }
    record[IN_USE_KEY] = true;
  }

  private markReleased(obj: object): boolean {
    const record = obj as Record<string, unknown>;
    if (record[IN_USE_KEY] !== true) {
      return false;
    }
    record[IN_USE_KEY] = false;
    return true;
  }
}

// Export class for testing and singleton instance
export { ObjectPoolManager };
export const objectPool = ObjectPoolManager.getInstance();
