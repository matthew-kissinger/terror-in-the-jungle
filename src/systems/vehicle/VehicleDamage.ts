// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface VehicleDamageResult {
  newHp: number;
  destroyed: boolean;
}

export class VehicleDamageState {
  private hp: number;
  private destroyed = false;

  constructor(private readonly maxHp: number) {
    if (!Number.isFinite(maxHp) || maxHp <= 0) {
      throw new Error('VehicleDamageState maxHp must be positive');
    }
    this.hp = maxHp;
  }

  getHp(): number {
    return this.destroyed ? 0 : this.hp;
  }

  getMaxHp(): number {
    return this.maxHp;
  }

  getHealthPercent(): number {
    return this.destroyed ? 0 : this.hp / this.maxHp;
  }

  isDestroyed(): boolean {
    return this.destroyed || this.hp <= 0;
  }

  applyDamage(amount: number): VehicleDamageResult {
    if (this.isDestroyed() || amount <= 0) {
      return { newHp: this.getHp(), destroyed: this.isDestroyed() };
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.destroyed = true;
    return { newHp: this.hp, destroyed: this.isDestroyed() };
  }

  destroy(): void {
    this.hp = 0;
    this.destroyed = true;
  }
}
