import * as THREE from 'three';
import { Logger } from '../../utils/Logger';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';

// ── Health config per aircraft role ──
const HEALTH_BY_ROLE: Record<string, number> = {
  transport: 500,
  gunship: 600,
  attack: 400,
};

const DEFAULT_HEALTH = 500;
const HELIPAD_REPAIR_RATE = 50; // HP per second when grounded on helipad
const CRITICAL_HEALTH_PERCENT = 0.25;
const WARNING_HEALTH_PERCENT = 0.5;
const SMOKE_START_PERCENT = 0.5;

interface HelicopterHealth {
  current: number;
  max: number;
  isDestroyed: boolean;
}

export class HelicopterHealthSystem {
  private health = new Map<string, HelicopterHealth>();
  private hudSystem?: IHUDSystem;
  private audioManager?: IAudioManager;

  // Callback when a helicopter is destroyed
  private onDestroyedCallback?: (heliId: string, position: THREE.Vector3) => void;

  setHUDSystem(hud: IHUDSystem): void { this.hudSystem = hud; }
  setAudioManager(am: IAudioManager): void { this.audioManager = am; }
  onDestroyed(cb: (heliId: string, position: THREE.Vector3) => void): void { this.onDestroyedCallback = cb; }

  initHealth(heliId: string, role: string): void {
    const maxHP = HEALTH_BY_ROLE[role] ?? DEFAULT_HEALTH;
    this.health.set(heliId, { current: maxHP, max: maxHP, isDestroyed: false });
  }

  applyDamage(heliId: string, damage: number, position: THREE.Vector3): void {
    const h = this.health.get(heliId);
    if (!h || h.isDestroyed) return;

    h.current = Math.max(0, h.current - damage);
    const percent = h.current / h.max;

    Logger.debug('helicopter', `${heliId} took ${damage.toFixed(0)} damage (${h.current.toFixed(0)}/${h.max} HP)`);

    if (h.current <= 0) {
      h.isDestroyed = true;
      Logger.info('helicopter', `${heliId} DESTROYED`);

      if (this.audioManager) {
        this.audioManager.play('grenadeExplosion', position);
      }

      this.onDestroyedCallback?.(heliId, position);
    }
  }

  /** Repair when grounded on helipad. Returns true if fully repaired. */
  repair(heliId: string, dt: number): boolean {
    const h = this.health.get(heliId);
    if (!h || h.isDestroyed) return false;
    if (h.current >= h.max) return true;

    h.current = Math.min(h.max, h.current + HELIPAD_REPAIR_RATE * dt);
    return h.current >= h.max;
  }

  getHealthPercent(heliId: string): number {
    const h = this.health.get(heliId);
    if (!h) return 1;
    return h.current / h.max;
  }

  isDestroyed(heliId: string): boolean {
    return this.health.get(heliId)?.isDestroyed ?? false;
  }

  isCritical(heliId: string): boolean {
    return this.getHealthPercent(heliId) <= CRITICAL_HEALTH_PERCENT;
  }

  isSmoking(heliId: string): boolean {
    return this.getHealthPercent(heliId) <= SMOKE_START_PERCENT;
  }

  isWarning(heliId: string): boolean {
    return this.getHealthPercent(heliId) <= WARNING_HEALTH_PERCENT;
  }

  /** Push health to HUD for piloted helicopter. */
  updateHUD(heliId: string): void {
    if (!this.hudSystem) return;
    this.hudSystem.setHelicopterDamage(this.getHealthPercent(heliId));
  }

  dispose(heliId: string): void {
    this.health.delete(heliId);
  }

  disposeAll(): void {
    this.health.clear();
  }
}
