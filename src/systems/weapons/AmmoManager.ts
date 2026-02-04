import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { ZoneManager, CaptureZone, ZoneState } from '../world/ZoneManager';
import { Faction } from '../combat/types';

export interface AmmoState {
  currentMagazine: number;
  reserveAmmo: number;
  maxMagazine: number;
  maxReserve: number;
  isReloading: boolean;
  reloadProgress: number;
  needsReload: boolean;
  lastResupplyTime: number;
}

export class AmmoManager {
  private state: AmmoState;
  private readonly RELOAD_TIME = 2.5; // seconds
  private readonly RESUPPLY_RATE = 30; // rounds per second
  private readonly LOW_AMMO_THRESHOLD = 10;
  private reloadStartTime = 0;
  private onReloadComplete?: () => void;
  private onAmmoChange?: (state: AmmoState) => void;
  private zoneManager?: ZoneManager;
  private isResupplying = false;
  private lastResupplyZone: CaptureZone | null = null;

  constructor(magazineSize: number = 30, maxReserve: number = 90) {
    this.state = {
      currentMagazine: magazineSize,
      reserveAmmo: maxReserve,
      maxMagazine: magazineSize,
      maxReserve: maxReserve,
      isReloading: false,
      reloadProgress: 0,
      needsReload: false,
      lastResupplyTime: 0
    };
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  canFire(): boolean {
    return this.state.currentMagazine > 0 && !this.state.isReloading;
  }

  consumeRound(): boolean {
    if (!this.canFire()) return false;

    this.state.currentMagazine--;
    this.state.needsReload = this.state.currentMagazine === 0;

    // Trigger callback for UI update
    this.onAmmoChange?.(this.state);

    return true;
  }

  startReload(): boolean {
    // Can't reload if already reloading, mag is full, or no reserve ammo
    if (this.state.isReloading ||
        this.state.currentMagazine === this.state.maxMagazine ||
        this.state.reserveAmmo === 0) {
      return false;
    }

    this.state.isReloading = true;
    this.state.reloadProgress = 0;
    this.reloadStartTime = performance.now();

    Logger.info('weapons', ' Reloading...');
    return true;
  }

  cancelReload(): void {
    if (this.state.isReloading) {
      this.state.isReloading = false;
      this.state.reloadProgress = 0;
      Logger.info('weapons', ' Reload cancelled');
    }
  }

  update(deltaTime: number, playerPosition?: THREE.Vector3): void {
    // Update reload progress
    if (this.state.isReloading) {
      const elapsed = (performance.now() - this.reloadStartTime) / 1000;
      this.state.reloadProgress = Math.min(1, elapsed / this.RELOAD_TIME);

      if (this.state.reloadProgress >= 1) {
        this.completeReload();
      }
    }

    // Check for resupply zones
    if (playerPosition && this.zoneManager) {
      this.checkResupplyZone(playerPosition, deltaTime);
    }
  }

  private completeReload(): void {
    // Save remaining rounds back to reserve (tactical reload)
    const remainingInMag = this.state.currentMagazine;
    this.state.reserveAmmo += remainingInMag;

    // Load a full magazine from reserve (or whatever is available)
    const roundsToLoad = Math.min(this.state.maxMagazine, this.state.reserveAmmo);
    this.state.currentMagazine = roundsToLoad;
    this.state.reserveAmmo -= roundsToLoad;

    this.state.isReloading = false;
    this.state.reloadProgress = 0;
    this.state.needsReload = false;

    Logger.info('weapons', ` Reload complete! Ammo: ${this.state.currentMagazine}/${this.state.reserveAmmo}`);

    // Trigger callbacks
    this.onReloadComplete?.();
    this.onAmmoChange?.(this.state);
  }

  private checkResupplyZone(playerPosition: THREE.Vector3, deltaTime: number): void {
    const currentZone = this.zoneManager!.getZoneAtPosition(playerPosition);

    // Check if we're in a friendly zone (HQ or captured)
    const canResupply = currentZone && (
      (currentZone.isHomeBase && currentZone.owner === Faction.US) ||
      (!currentZone.isHomeBase && currentZone.owner === Faction.US)
    );

    if (canResupply && currentZone) {
      // Start resupply if not already full
      const totalAmmo = this.state.currentMagazine + this.state.reserveAmmo;
      const maxTotal = this.state.maxMagazine + this.state.maxReserve;

      if (totalAmmo < maxTotal) {
        if (!this.isResupplying || this.lastResupplyZone !== currentZone) {
          this.isResupplying = true;
          this.lastResupplyZone = currentZone;
          Logger.info('weapons', `📦 Resupplying ammo at ${currentZone.name}...`);
        }

        // Resupply ammo gradually
        const resupplyAmount = Math.ceil(this.RESUPPLY_RATE * deltaTime);
        const ammoToAdd = Math.min(resupplyAmount, maxTotal - totalAmmo);

        // Add to reserve first
        this.state.reserveAmmo = Math.min(
          this.state.maxReserve,
          this.state.reserveAmmo + ammoToAdd
        );

        // If reserve is full and mag isn't, top off magazine
        if (this.state.reserveAmmo === this.state.maxReserve &&
            this.state.currentMagazine < this.state.maxMagazine) {
          const magToAdd = Math.min(
            ammoToAdd,
            this.state.maxMagazine - this.state.currentMagazine
          );
          this.state.currentMagazine += magToAdd;
        }

        this.state.lastResupplyTime = performance.now();
        this.onAmmoChange?.(this.state);

        // Check if fully resupplied
        if (this.state.currentMagazine === this.state.maxMagazine &&
            this.state.reserveAmmo === this.state.maxReserve) {
          Logger.info('weapons', ' Fully resupplied!');
          this.isResupplying = false;
        }
      }
    } else {
      // Left resupply zone
      if (this.isResupplying) {
        Logger.info('weapons', '📦 Left resupply zone');
        this.isResupplying = false;
        this.lastResupplyZone = null;
      }
    }
  }

  getState(): AmmoState {
    return { ...this.state };
  }

  isLowAmmo(): boolean {
    return this.state.currentMagazine <= this.LOW_AMMO_THRESHOLD &&
           this.state.currentMagazine > 0;
  }

  isEmpty(): boolean {
    return this.state.currentMagazine === 0;
  }

  getTotalAmmo(): number {
    return this.state.currentMagazine + this.state.reserveAmmo;
  }

  setOnReloadComplete(callback: () => void): void {
    this.onReloadComplete = callback;
  }

  setOnAmmoChange(callback: (state: AmmoState) => void): void {
    this.onAmmoChange = callback;
  }

  reset(): void {
    this.state = {
      currentMagazine: this.state.maxMagazine,
      reserveAmmo: this.state.maxReserve,
      maxMagazine: this.state.maxMagazine,
      maxReserve: this.state.maxReserve,
      isReloading: false,
      reloadProgress: 0,
      needsReload: false,
      lastResupplyTime: 0
    };
    this.isResupplying = false;
    this.lastResupplyZone = null;
    this.onAmmoChange?.(this.state);
  }
}