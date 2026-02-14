import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { AssetLoader } from '../assets/AssetLoader';
import type { IPlayerController } from '../../types/SystemInterfaces';

export enum WeaponType {
  RIFLE = 'rifle',
  SHOTGUN = 'shotgun',
  SMG = 'smg'
}

interface WeaponPickup {
  id: string;
  type: WeaponType;
  position: THREE.Vector3;
  spawnTime: number;
  billboard: THREE.Mesh;
  rotation: number;
}

export class WeaponPickupSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private assetLoader: AssetLoader;

  private pickups: Map<string, WeaponPickup> = new Map();
  private nextPickupId = 0;

  // Constants
  private readonly PICKUP_RADIUS = 2.0; // meters
  private readonly PICKUP_LIFETIME = 60000; // 60 seconds
  private readonly DROP_CHANCE = 0.30; // 30% chance
  private readonly BILLBOARD_HEIGHT = 1.5;
  private readonly BOB_SPEED = 2.0; // Hz
  private readonly BOB_AMOUNT = 0.15; // meters
  private readonly ROTATION_SPEED = Math.PI / 2; // 90 degrees per second

  // Player tracking
  private playerPosition = new THREE.Vector3();
  private playerController?: IPlayerController;

  // Interaction state
  private nearestPickup?: WeaponPickup;
  private showPrompt = false;
  private promptElement?: HTMLElement;

  // Weapon change callback
  private onWeaponPickedUp?: (type: WeaponType, oldType: WeaponType) => void;
  private boundOnKeyDown!: (event: KeyboardEvent) => void;

  // Materials for each weapon type
  private materials: Map<WeaponType, THREE.MeshBasicMaterial> = new Map();

  constructor(scene: THREE.Scene, camera: THREE.Camera, assetLoader: AssetLoader) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
  }

  async init(): Promise<void> {
    Logger.info('weapons', ' Initializing Weapon Pickup System...');

    // Create materials for each weapon type
    this.createWeaponMaterials();

    // Create prompt UI
    this.createPromptUI();

    // Listen for E key
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    window.addEventListener('keydown', this.boundOnKeyDown);

    Logger.info('weapons', ' Weapon Pickup System initialized');
  }

  private createWeaponMaterials(): void {
    // Create colored billboards for each weapon type
    // Rifle: green, Shotgun: red, SMG: blue
    const colors = {
      [WeaponType.RIFLE]: 0x00ff00,
      [WeaponType.SHOTGUN]: 0xff0000,
      [WeaponType.SMG]: 0x0088ff
    };

    Object.entries(colors).forEach(([type, color]) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
      });
      this.materials.set(type as WeaponType, material);
    });
  }

  private createPromptUI(): void {
    this.promptElement = document.createElement('div');
    this.promptElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translateY(80px);
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Rajdhani', 'Segoe UI', sans-serif;
      font-size: 16px;
      font-weight: bold;
      border: 2px solid rgba(255, 255, 255, 0.3);
      z-index: 1000;
      pointer-events: none;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(this.promptElement);
  }

  update(deltaTime: number): void {
    if (!this.playerController) return;

    const now = Date.now();

    // Update player position
    this.playerPosition.copy(this.playerController.getPosition());

    // Cleanup expired pickups
    const toRemove: string[] = [];
    this.pickups.forEach((pickup, id) => {
      if (now - pickup.spawnTime > this.PICKUP_LIFETIME) {
        toRemove.push(id);
      }
    });

    toRemove.forEach(id => this.removePickup(id));

    // Update pickup animations
    this.pickups.forEach(pickup => {
      // Bobbing animation
      const bobOffset = Math.sin((now / 1000) * this.BOB_SPEED * Math.PI * 2) * this.BOB_AMOUNT;
      pickup.billboard.position.y = this.BILLBOARD_HEIGHT + bobOffset;

      // Rotation
      pickup.rotation += this.ROTATION_SPEED * deltaTime;
      pickup.billboard.rotation.y = pickup.rotation;
    });

    // Check for nearby pickups
    this.nearestPickup = undefined;
    let nearestDist = this.PICKUP_RADIUS;

    this.pickups.forEach(pickup => {
      const dist = pickup.position.distanceTo(this.playerPosition);
      if (dist < nearestDist) {
        nearestDist = dist;
        this.nearestPickup = pickup;
      }
    });

    // Update prompt
    this.updatePrompt();
  }

  private updatePrompt(): void {
    if (!this.promptElement) return;

    if (this.nearestPickup) {
      const weaponName = this.nearestPickup.type.toUpperCase();
      this.promptElement.textContent = `[E] Pick up ${weaponName}`;
      this.promptElement.style.display = 'block';
    } else {
      this.promptElement.style.display = 'none';
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyE' && this.nearestPickup) {
      this.pickupWeapon(this.nearestPickup);
    }
  }

  private pickupWeapon(pickup: WeaponPickup): void {
    if (!this.onWeaponPickedUp) return;

    // Determine current weapon (simplified - would normally check inventory)
    const currentWeapon = WeaponType.RIFLE; // Placeholder

    // Trigger weapon swap callback
    this.onWeaponPickedUp(pickup.type, currentWeapon);

    // Visual feedback
    this.spawnPickupEffect(pickup.position);

    // Remove pickup
    this.removePickup(pickup.id);

    Logger.info('weapons', ` Picked up ${pickup.type.toUpperCase()}`);
  }

  private spawnPickupEffect(position: THREE.Vector3): void {
    // Flash effect
    const flash = new THREE.PointLight(0x00ff00, 2, 5);
    flash.position.copy(position);
    this.scene.add(flash);

    setTimeout(() => {
      this.scene.remove(flash);
    }, 150);
  }

  /**
   * Spawn a weapon pickup at a position
   * @param type Weapon type to spawn
   * @param position World position
   * @returns Pickup ID if spawned, undefined if failed
   */
  spawnPickup(type: WeaponType, position: THREE.Vector3): string | undefined {
    // Create billboard geometry
    const geometry = new THREE.PlaneGeometry(0.8, 0.8);
    const material = this.materials.get(type);

    if (!material) {
      Logger.error('weapons', `No material for weapon type: ${type}`);
      return undefined;
    }

    const billboard = new THREE.Mesh(geometry, material);
    billboard.position.copy(position);
    billboard.position.y = this.BILLBOARD_HEIGHT;
    this.scene.add(billboard);

    const id = `pickup_${this.nextPickupId++}`;

    const pickup: WeaponPickup = {
      id,
      type,
      position: position.clone(),
      spawnTime: Date.now(),
      billboard,
      rotation: 0
    };

    this.pickups.set(id, pickup);

    Logger.info('weapons', ` Spawned ${type} pickup at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);

    return id;
  }

  /**
   * Called when a combatant dies - may spawn a weapon pickup
   * @param position Death position
   * @returns True if pickup was spawned
   */
  onCombatantDeath(position: THREE.Vector3): boolean {
    if (Math.random() > this.DROP_CHANCE) {
      return false;
    }

    // Random weapon type
    const types = [WeaponType.RIFLE, WeaponType.SHOTGUN, WeaponType.SMG];
    const type = types[Math.floor(Math.random() * types.length)];

    // Offset slightly so it doesn't clip into terrain
    const spawnPos = position.clone();
    spawnPos.y += 0.5;

    const id = this.spawnPickup(type, spawnPos);
    return id !== undefined;
  }

  private removePickup(id: string): void {
    const pickup = this.pickups.get(id);
    if (!pickup) return;

    this.scene.remove(pickup.billboard);
    pickup.billboard.geometry.dispose();

    this.pickups.delete(id);
  }

  setPlayerController(controller: IPlayerController): void {
    this.playerController = controller;
  }

  onWeaponPickup(callback: (type: WeaponType, oldType: WeaponType) => void): void {
    this.onWeaponPickedUp = callback;
  }

  dispose(): void {
    // Remove all pickups
    this.pickups.forEach(pickup => {
      this.scene.remove(pickup.billboard);
      pickup.billboard.geometry.dispose();
    });
    this.pickups.clear();

    // Dispose materials
    this.materials.forEach(material => material.dispose());
    this.materials.clear();

    // Remove prompt UI
    if (this.promptElement && this.promptElement.parentNode) {
      this.promptElement.parentNode.removeChild(this.promptElement);
    }

    window.removeEventListener('keydown', this.boundOnKeyDown);

    Logger.info('weapons', 'Weapon Pickup System disposed');
  }
}
