import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { TracerPool } from '../effects/TracerPool';
import type { HelicopterModel } from '../helicopter/HelicopterModel';
import type { IAudioManager, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';

// ── Configuration ──

interface AAEmplacementConfig {
  type: 'zpu4' | '37mm';
  position: THREE.Vector3;
  faction: 'NVA' | 'VC';
  range: number;
  fireRate: number;
  damage: number;
  spreadDeg: number;
  burstLength: number;
  burstCooldown: number;
  health: number;
  respawnDelay: number;
}

const ZPU4_DEFAULTS: Omit<AAEmplacementConfig, 'position' | 'faction'> = {
  type: 'zpu4',
  range: 1400,
  fireRate: 10,
  damage: 8,
  spreadDeg: 4,
  burstLength: 15,
  burstCooldown: 1.5,
  health: 200,
  respawnDelay: 120,
};

// ── Internal state ──

interface AAState {
  config: AAEmplacementConfig;
  mesh: THREE.Group | null;
  currentHealth: number;
  isDestroyed: boolean;
  destroyedAt: number;
  // Targeting
  targetHeliId: string | null;
  scanAccum: number;
  // Firing
  burstRemaining: number;
  fireAccum: number;
  burstCooldownAccum: number;
}

// ── Scratch vectors ──
const _aaPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _leadPos = new THREE.Vector3();
const _tracerStart = new THREE.Vector3();
const _tracerEnd = new THREE.Vector3();
const _dir = new THREE.Vector3();

const SCAN_INTERVAL = 0.5; // seconds between target scans
const MIN_TARGET_ALTITUDE = 10; // only shoot at helicopters above this height
const LEAD_BULLET_SPEED = 500; // m/s for lead calculation
export class AAEmplacementSystem implements GameSystem {
  private scene: THREE.Scene;
  private emplacements: AAState[] = [];
  private tracerPool: TracerPool;

  // Dependencies
  private helicopterModel?: HelicopterModel;
  private audioManager?: IAudioManager;
  private terrainSystem?: ITerrainRuntime;
  private explosionEffectsPool?: ExplosionEffectsPool;

  private gameElapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tracerPool = new TracerPool(scene, 48);
  }

  async init(): Promise<void> {
    Logger.debug('aa', 'Initializing AA Emplacement System...');
  }

  // ── Dependency setters ──

  setHelicopterModel(hm: HelicopterModel): void {
    this.helicopterModel = hm;
  }

  setAudioManager(am: IAudioManager): void {
    this.audioManager = am;
  }

  setTerrainSystem(terrain: ITerrainRuntime): void {
    this.terrainSystem = terrain;
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
  }

  // ── Public API ──

  addEmplacement(position: THREE.Vector3, faction: 'NVA' | 'VC' = 'NVA', type: 'zpu4' | '37mm' = 'zpu4'): void {
    const config: AAEmplacementConfig = {
      ...ZPU4_DEFAULTS,
      type,
      position: position.clone(),
      faction,
    };

    // Create placeholder mesh
    const mesh = createAAMesh(type);
    mesh.position.copy(position);

    // Snap to terrain
    if (this.terrainSystem) {
      const h = this.terrainSystem.getHeightAt(position.x, position.z);
      mesh.position.y = h;
    }

    mesh.matrixAutoUpdate = true;
    this.scene.add(mesh);

    this.emplacements.push({
      config,
      mesh,
      currentHealth: config.health,
      isDestroyed: false,
      destroyedAt: 0,
      targetHeliId: null,
      scanAccum: Math.random() * SCAN_INTERVAL, // stagger initial scans
      burstRemaining: 0,
      fireAccum: 0,
      burstCooldownAccum: 0,
    });
  }

  getEmplacementCount(): number {
    return this.emplacements.length;
  }

  getActiveCount(): number {
    return this.emplacements.filter(e => !e.isDestroyed).length;
  }

  applyDamageAt(position: THREE.Vector3, damage: number, radius: number): void {
    for (const emp of this.emplacements) {
      if (emp.isDestroyed) continue;
      const dx = emp.config.position.x - position.x;
      const dz = emp.config.position.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius) {
        const falloff = 1 - dist / radius;
        const effectiveDamage = damage * falloff;
        this.damageEmplacement(emp, effectiveDamage);
      }
    }
  }

  // ── Update loop ──

  update(deltaTime: number): void {
    this.gameElapsed += deltaTime;

    for (const emp of this.emplacements) {
      if (emp.isDestroyed) {
        this.updateDestroyed(emp);
        continue;
      }
      this.updateTargeting(emp, deltaTime);
      this.updateFiring(emp, deltaTime);
    }

    this.tracerPool.update();
  }

  dispose(): void {
    for (const emp of this.emplacements) {
      if (emp.mesh) {
        this.scene.remove(emp.mesh);
      }
    }
    this.emplacements.length = 0;
    this.tracerPool.dispose();
  }

  // ── Private ──

  private updateTargeting(emp: AAState, dt: number): void {
    emp.scanAccum += dt;
    if (emp.scanAccum < SCAN_INTERVAL) return;
    emp.scanAccum = 0;

    if (!this.helicopterModel) {
      emp.targetHeliId = null;
      return;
    }

    const helis = this.helicopterModel.getAllHelicopters();
    let bestId: string | null = null;
    let bestDist = Infinity;

    _aaPos.copy(emp.config.position);

    for (const heli of helis) {
      // Check if destroyed
      if (this.helicopterModel.isHelicopterDestroyed(heli.id)) continue;

      // Check altitude (only shoot at flying helicopters)
      const terrainH = this.terrainSystem?.getHeightAt(heli.position.x, heli.position.z) ?? 0;
      if (heli.position.y - terrainH < MIN_TARGET_ALTITUDE) continue;

      // Check range
      const dx = heli.position.x - _aaPos.x;
      const dz = heli.position.z - _aaPos.z;
      const dy = heli.position.y - _aaPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > emp.config.range) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = heli.id;
      }
    }

    emp.targetHeliId = bestId;
  }

  private updateFiring(emp: AAState, dt: number): void {
    if (!emp.targetHeliId || !this.helicopterModel) return;

    // Get target position
    const gotPos = this.helicopterModel.getHelicopterPositionTo(emp.targetHeliId, _targetPos);
    if (!gotPos) {
      emp.targetHeliId = null;
      return;
    }

    // Compute lead target
    _aaPos.copy(emp.config.position);
    const dist = _aaPos.distanceTo(_targetPos);
    const flightTime = dist / LEAD_BULLET_SPEED;

    // Get target velocity for lead prediction
    const flightData = this.helicopterModel.getFlightData(emp.targetHeliId);
    if (flightData) {
      // Estimate velocity from airspeed and heading
      const headingRad = (flightData.heading * Math.PI) / 180;
      _leadPos.set(
        _targetPos.x + Math.sin(headingRad) * flightData.airspeed * flightTime,
        _targetPos.y + flightData.verticalSpeed * flightTime,
        _targetPos.z + Math.cos(headingRad) * flightData.airspeed * flightTime,
      );
    } else {
      _leadPos.copy(_targetPos);
    }

    // Burst cooldown
    if (emp.burstRemaining <= 0) {
      emp.burstCooldownAccum += dt;
      if (emp.burstCooldownAccum >= emp.config.burstCooldown) {
        emp.burstCooldownAccum = 0;
        emp.burstRemaining = emp.config.burstLength;
      }
      return;
    }

    // Fire rounds
    emp.fireAccum += dt;
    const fireInterval = 1 / emp.config.fireRate;

    while (emp.fireAccum >= fireInterval && emp.burstRemaining > 0) {
      emp.fireAccum -= fireInterval;
      emp.burstRemaining--;

      // Direction with spread
      _dir.subVectors(_leadPos, _aaPos).normalize();
      const spreadRad = (emp.config.spreadDeg * Math.PI) / 180;
      _dir.x += (Math.random() - 0.5) * spreadRad;
      _dir.y += (Math.random() - 0.5) * spreadRad;
      _dir.z += (Math.random() - 0.5) * spreadRad;
      _dir.normalize();

      // Tracer from AA position to predicted target
      _tracerStart.copy(_aaPos);
      _tracerStart.y += 1.5; // gun barrel height
      _tracerEnd.copy(_tracerStart).add(_dir.clone().multiplyScalar(Math.min(dist + 50, emp.config.range)));

      this.tracerPool.spawn(_tracerStart, _tracerEnd, 250);

      // Check hit (simplified: ray vs helicopter sphere)
      const ray = new THREE.Ray(_tracerStart.clone(), _dir.clone());
      const hit = this.helicopterModel.checkRayHit(ray, emp.config.range);
      if (hit) {
        this.helicopterModel.applyDamage(hit.heliId, emp.config.damage);
      }
    }

    // Audio
    if (emp.burstRemaining === emp.config.burstLength - 1) {
      this.audioManager?.play('doorGunBurst', emp.config.position, 0.5);
    }
  }

  private damageEmplacement(emp: AAState, damage: number): void {
    emp.currentHealth -= damage;
    if (emp.currentHealth <= 0) {
      emp.isDestroyed = true;
      emp.destroyedAt = this.gameElapsed;
      if (emp.mesh) emp.mesh.visible = false;

      // Explosion VFX at position
      this.explosionEffectsPool?.spawn(emp.config.position);
      this.audioManager?.play('grenadeExplosion', emp.config.position, 0.8);
    }
  }

  private updateDestroyed(emp: AAState): void {
    if (this.gameElapsed - emp.destroyedAt > emp.config.respawnDelay) {
      emp.isDestroyed = false;
      emp.currentHealth = emp.config.health;
      emp.targetHeliId = null;
      emp.burstRemaining = 0;
      if (emp.mesh) emp.mesh.visible = true;
    }
  }
}

function createAAMesh(type: 'zpu4' | '37mm'): THREE.Group {
  const group = new THREE.Group();
  const color = type === 'zpu4' ? 0x445544 : 0x554444;
  // Base platform
  const baseGeom = new THREE.CylinderGeometry(1.2, 1.5, 0.4, 8);
  const baseMat = new THREE.MeshStandardMaterial({ color, flatShading: true });
  const base = new THREE.Mesh(baseGeom, baseMat);
  group.add(base);
  // Gun barrels (4 for ZPU-4)
  const barrelCount = type === 'zpu4' ? 4 : 1;
  const barrelGeom = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 4);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333, flatShading: true });
  for (let i = 0; i < barrelCount; i++) {
    const barrel = new THREE.Mesh(barrelGeom, barrelMat);
    const angle = (i / barrelCount) * Math.PI * 2;
    barrel.position.set(Math.cos(angle) * 0.15, 1.0, Math.sin(angle) * 0.15);
    barrel.rotation.x = Math.PI / 6; // Angled up
    group.add(barrel);
  }
  return group;
}
