// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { GameEventBus } from '../../core/GameEventBus';
import type { IHUDSystem, IPlayerController, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { InventoryManager } from '../player/InventoryManager';
import type { FirstPersonWeapon } from '../player/FirstPersonWeapon';

/**
 * L1 looting — resupply drops on NPC death (owner decision F4).
 *
 * Subscribes to `npc_killed` (via the composer, which forwards the event
 * position), rolls a 30% drop chance, and spawns a small emissive resupply
 * pack at the terrain-clamped death position. Walking within
 * {@link PICKUP_RADIUS} and pressing `E` on foot grants one magazine of reserve
 * ammo for the current weapon, one grenade (clamped), and one bandage (if the
 * inventory exposes a bandage surface — sibling `healing-mvp` task). Packs
 * expire after {@link PACK_LIFETIME_MS}; a hard cap of {@link MAX_PACKS} live
 * packs evicts the oldest.
 *
 * All meshes are pooled — no per-frame allocation. The `E` handler gates on
 * {@link IPlayerController.getPosition} plus a "not seated" predicate so it
 * never collides with the universal `E` vehicle-exit binding (the two are
 * mutually exclusive: pickup needs on-foot + proximity, exit needs seated).
 */

interface ResupplyPack {
  id: number;
  active: boolean;
  spawnTime: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  rotation: number;
}

// A minimal InventoryManager surface that may expose bandages once the
// sibling `healing-mvp` task lands. Kept structural so this system compiles
// whether or not bandage methods exist on master.
type BandageCapableInventory = InventoryManager & {
  canUseBandage?: () => boolean;
  addBandages?: (count: number) => void;
};

export const PICKUP_RADIUS = 1.8; // meters
export const PACK_LIFETIME_MS = 60000; // 60 seconds
export const MAX_PACKS = 24;
const DROP_CHANCE = 0.30; // 30%

export class LootResupplySystem implements GameSystem {
  private scene: THREE.Scene;

  private packs: ResupplyPack[] = [];
  private pool: ResupplyPack[] = [];
  private nextPackId = 0;

  private geometry?: THREE.BoxGeometry;
  private material?: THREE.MeshStandardMaterial;

  private readonly PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS;
  private readonly PACK_SIZE = 0.5;
  private readonly PACK_HEIGHT = 0.5; // rest height above terrain
  private readonly BOB_SPEED = 2.0; // Hz
  private readonly BOB_AMOUNT = 0.12; // meters
  private readonly ROTATION_SPEED = Math.PI / 2; // rad/s
  private readonly GRENADE_REFILL = 1;

  private playerController?: IPlayerController;
  private isPlayerSeated: () => boolean = () => false;
  private inventoryManager?: BandageCapableInventory;
  private firstPersonWeapon?: FirstPersonWeapon;
  private hudSystem?: IHUDSystem;
  private terrain?: ITerrainRuntime;

  private readonly playerPosition = new THREE.Vector3();
  private nearestPack?: ResupplyPack;
  private promptShown = false;

  // Injectable for deterministic tests; defaults to the real clock / RNG.
  private random: () => number = Math.random;
  private now: () => number = () => Date.now();

  private boundOnKeyDown!: (event: KeyboardEvent) => void;
  private unsubscribeNpcKilled?: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('weapons', 'Initializing Loot Resupply System...');
    // Shared geometry/material across all pooled packs — one allocation total.
    this.geometry = new THREE.BoxGeometry(this.PACK_SIZE, this.PACK_SIZE * 0.7, this.PACK_SIZE);
    this.material = new THREE.MeshStandardMaterial({
      color: 0x5a6b3a,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x8fd44a,
      emissiveIntensity: 0.55,
    });
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.boundOnKeyDown);
    // Spawn-on-death hook. `npc_killed` carries the death position and fires
    // from both rifle and explosion death paths (player-proxy kills are
    // excluded there to avoid double-counting).
    this.unsubscribeNpcKilled = GameEventBus.subscribe('npc_killed', (event) => {
      this.onCombatantDeath(event.position);
    });
    Logger.info('weapons', 'Loot Resupply System initialized');
  }

  update(deltaTime: number): void {
    if (this.packs.length === 0) {
      // No live packs: keep the prompt hidden and skip all work.
      if (this.promptShown) this.hidePrompt();
      return;
    }

    const now = this.now();

    // Expire aged packs (iterate backwards so splice-to-pool is stable).
    for (let i = this.packs.length - 1; i >= 0; i--) {
      if (now - this.packs[i].spawnTime > PACK_LIFETIME_MS) {
        this.recyclePackAt(i);
      }
    }

    // Animate + find the nearest pack the player can reach on foot.
    const hasPlayer = !!this.playerController && !this.isPlayerSeated();
    if (hasPlayer) {
      this.playerPosition.copy(this.playerController!.getPosition());
    }

    this.nearestPack = undefined;
    let nearestDistSq = this.PICKUP_RADIUS_SQ;
    const bob = Math.sin((now / 1000) * this.BOB_SPEED * Math.PI * 2) * this.BOB_AMOUNT;

    for (const pack of this.packs) {
      pack.rotation += this.ROTATION_SPEED * deltaTime;
      pack.mesh.rotation.y = pack.rotation;
      pack.mesh.position.y = pack.position.y + bob;

      if (!hasPlayer) continue;
      const distSq = pack.position.distanceToSquared(this.playerPosition);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        this.nearestPack = pack;
      }
    }

    this.updatePrompt();
  }

  dispose(): void {
    for (const pack of this.packs) {
      this.scene.remove(pack.mesh);
    }
    this.packs.length = 0;
    this.pool.length = 0;
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = undefined;
    this.material = undefined;
    if (this.promptShown) this.hidePrompt();
    if (this.boundOnKeyDown) {
      window.removeEventListener('keydown', this.boundOnKeyDown);
    }
    this.unsubscribeNpcKilled?.();
    this.unsubscribeNpcKilled = undefined;
    Logger.info('weapons', 'Loot Resupply System disposed');
  }

  setPlayerController(controller: IPlayerController): void {
    this.playerController = controller;
  }

  /** Predicate the composer wires so pickup is suppressed while seated. */
  setSeatedPredicate(isSeated: () => boolean): void {
    this.isPlayerSeated = isSeated;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager as BandageCapableInventory;
  }

  setFirstPersonWeapon(weapon: FirstPersonWeapon): void {
    this.firstPersonWeapon = weapon;
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  setTerrain(terrain: ITerrainRuntime): void {
    this.terrain = terrain;
  }

  /** Test seam: override the RNG used by the drop roll. */
  setRandomSource(random: () => number): void {
    this.random = random;
  }

  /** Test seam: override the clock used for spawn/expiry timing. */
  setClock(now: () => number): void {
    this.now = now;
  }

  /**
   * Roll the drop chance for a slain combatant and, on success, spawn a
   * terrain-clamped pack. Returns true when a pack was spawned.
   */
  onCombatantDeath(position: THREE.Vector3): boolean {
    if (this.random() >= DROP_CHANCE) {
      return false;
    }
    this.spawnPack(position);
    return true;
  }

  getLivePackCount(): number {
    return this.packs.length;
  }

  private spawnPack(position: THREE.Vector3): void {
    // Hard cap: evict the oldest live pack (packs are appended in spawn order).
    if (this.packs.length >= MAX_PACKS) {
      this.recyclePackAt(0);
    }

    const pack = this.pool.pop() ?? this.createPack();
    pack.id = this.nextPackId++;
    pack.active = true;
    pack.spawnTime = this.now();
    pack.rotation = 0;

    const restY = this.groundHeight(position.x, position.z) + this.PACK_HEIGHT;
    pack.position.set(position.x, restY, position.z);
    pack.mesh.position.copy(pack.position);
    pack.mesh.rotation.y = 0;
    pack.mesh.visible = true;
    this.scene.add(pack.mesh);

    this.packs.push(pack);
  }

  private createPack(): ResupplyPack {
    const mesh = new THREE.Mesh(this.geometry!, this.material!);
    mesh.name = 'ResupplyPack';
    mesh.userData.perfCategory = 'weapons';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return {
      id: -1,
      active: false,
      spawnTime: 0,
      position: new THREE.Vector3(),
      mesh,
      rotation: 0,
    };
  }

  private recyclePackAt(index: number): void {
    const pack = this.packs[index];
    if (!pack) return;
    this.scene.remove(pack.mesh);
    pack.mesh.visible = false;
    pack.active = false;
    if (this.nearestPack === pack) {
      this.nearestPack = undefined;
    }
    this.packs.splice(index, 1);
    this.pool.push(pack);
  }

  private groundHeight(x: number, z: number): number {
    if (this.terrain && this.terrain.isTerrainReady()) {
      return this.terrain.getHeightAt(x, z);
    }
    return 0;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code !== 'KeyE') return;
    // On foot only. When seated, `E` is the vehicle-exit binding; the seated
    // predicate makes these mutually exclusive so there is no double-trigger.
    if (!this.nearestPack || this.isPlayerSeated()) return;
    this.collectPack(this.nearestPack);
  }

  private collectPack(pack: ResupplyPack): void {
    const granted: string[] = [];

    const ammoAdded = this.firstPersonWeapon?.resupplyCurrentWeaponMagazine() ?? 0;
    if (ammoAdded > 0) granted.push('AMMO');

    if (this.inventoryManager) {
      this.inventoryManager.addGrenades(this.GRENADE_REFILL);
      granted.push('GRENADE');
      // Bandage grant is opt-in: only fires if the sibling healing-mvp task
      // has added a bandage surface to InventoryManager.
      if (typeof this.inventoryManager.addBandages === 'function') {
        this.inventoryManager.addBandages(1);
        granted.push('BANDAGE');
      }
    }

    this.removePack(pack);
    Logger.info('weapons', `Looted resupply pack: ${granted.join(' + ') || 'nothing'}`);
  }

  private removePack(pack: ResupplyPack): void {
    const index = this.packs.indexOf(pack);
    if (index >= 0) {
      this.recyclePackAt(index);
    }
  }

  private updatePrompt(): void {
    if (this.nearestPack) {
      if (!this.promptShown) {
        this.hudSystem?.showInteractionPrompt('E: Resupply');
        this.promptShown = true;
      }
    } else if (this.promptShown) {
      this.hidePrompt();
    }
  }

  private hidePrompt(): void {
    this.hudSystem?.hideInteractionPrompt();
    this.promptShown = false;
  }
}
