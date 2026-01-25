import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ZoneManager, CaptureZone } from '../world/ZoneManager';
import { InventoryManager } from '../player/InventoryManager';
import { FirstPersonWeapon } from '../player/FirstPersonWeapon';
import { Faction } from '../combat/types';

interface AmmoCrate {
  position: THREE.Vector3;
  zone: CaptureZone;
  mesh: THREE.Group;
  glowMesh: THREE.Mesh;
  isActive: boolean;
  playerCooldowns: Map<string, number>; // Track cooldown per player
}

export class AmmoSupplySystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private crates: Map<string, AmmoCrate> = new Map();
  private zoneManager?: ZoneManager;
  private inventoryManager?: InventoryManager;
  private firstPersonWeapon?: FirstPersonWeapon;

  private readonly CRATE_SIZE = 1.5;
  private readonly PROXIMITY_RANGE = 5.0;
  private readonly RESUPPLY_COOLDOWN = 30; // seconds
  private readonly GLOW_PULSE_SPEED = 2.0;
  private readonly GRENADE_REFILL_AMOUNT = 3;
  private readonly SANDBAG_REFILL_AMOUNT = 5;

  private playerPosition = new THREE.Vector3();
  private glowTime = 0;
  private lastResupplyTime = 0;
  private popupElement?: HTMLDivElement;
  private popupTimeout?: number;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  async init(): Promise<void> {
    console.log('📦 Initializing Ammo Supply System...');
    this.createPopupElement();
    console.log('✅ Ammo Supply System initialized');
  }

  update(deltaTime: number): void {
    if (!this.zoneManager) return;

    // Update player position
    this.camera.getWorldPosition(this.playerPosition);

    // Update glow animation
    this.glowTime += deltaTime;

    // Update all crates
    const zones = this.zoneManager.getAllZones();
    for (const zone of zones) {
      this.updateCrate(zone, deltaTime);
    }

    // Check proximity to crates
    this.checkProximity(deltaTime);
  }

  dispose(): void {
    // Remove all crate meshes
    for (const crate of this.crates.values()) {
      if (crate.mesh.parent) {
        this.scene.remove(crate.mesh);
      }
      crate.mesh.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    this.crates.clear();

    // Remove popup element
    if (this.popupElement && this.popupElement.parentNode) {
      this.popupElement.parentNode.removeChild(this.popupElement);
    }

    console.log('🧹 Ammo Supply System disposed');
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setFirstPersonWeapon(weapon: FirstPersonWeapon): void {
    this.firstPersonWeapon = weapon;
  }

  private updateCrate(zone: CaptureZone, deltaTime: number): void {
    const crateId = zone.id;
    let crate = this.crates.get(crateId);

    // Check if zone is friendly-controlled
    const isFriendly = zone.owner === Faction.US;

    // Create crate if it doesn't exist
    if (!crate) {
      crate = this.createCrate(zone);
      this.crates.set(crateId, crate);
    }

    // Update crate state based on zone ownership
    crate.isActive = isFriendly;
    crate.mesh.visible = isFriendly;
    crate.zone = zone; // Update zone reference

    // Update crate position to match zone
    crate.position.copy(zone.position);
    crate.mesh.position.copy(zone.position);

    // Update glow effect
    if (isFriendly && crate.glowMesh) {
      const pulseIntensity = 0.3 + Math.sin(this.glowTime * this.GLOW_PULSE_SPEED) * 0.2;
      (crate.glowMesh.material as THREE.MeshBasicMaterial).opacity = pulseIntensity;
    }

    // Update cooldowns
    const now = performance.now() / 1000;
    for (const [playerId, cooldownEnd] of crate.playerCooldowns.entries()) {
      if (now >= cooldownEnd) {
        crate.playerCooldowns.delete(playerId);
      }
    }
  }

  private createCrate(zone: CaptureZone): AmmoCrate {
    const crateGroup = new THREE.Group();

    // Main crate box (brown/tan color)
    const boxGeometry = new THREE.BoxGeometry(this.CRATE_SIZE, this.CRATE_SIZE, this.CRATE_SIZE);
    const boxMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      metalness: 0.2
    });
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    crateGroup.add(boxMesh);

    // Ammo markings (yellow stripes)
    const stripeGeometry = new THREE.BoxGeometry(this.CRATE_SIZE + 0.02, 0.1, this.CRATE_SIZE + 0.02);
    const stripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffff00,
      roughness: 0.6,
      emissive: 0xffff00,
      emissiveIntensity: 0.3
    });

    // Two horizontal stripes
    const stripe1 = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe1.position.y = this.CRATE_SIZE * 0.3;
    crateGroup.add(stripe1);

    const stripe2 = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe2.position.y = -this.CRATE_SIZE * 0.3;
    crateGroup.add(stripe2);

    // Glow mesh for proximity indicator
    const glowGeometry = new THREE.BoxGeometry(
      this.CRATE_SIZE * 1.2,
      this.CRATE_SIZE * 1.2,
      this.CRATE_SIZE * 1.2
    );
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    crateGroup.add(glowMesh);

    // Position crate at zone height
    crateGroup.position.copy(zone.position);
    crateGroup.position.y += this.CRATE_SIZE / 2; // Sit on ground

    this.scene.add(crateGroup);

    const crate: AmmoCrate = {
      position: zone.position.clone(),
      zone,
      mesh: crateGroup,
      glowMesh,
      isActive: false,
      playerCooldowns: new Map()
    };

    return crate;
  }

  private checkProximity(deltaTime: number): void {
    const now = performance.now() / 1000;
    const playerId = 'player'; // Single player for now

    for (const crate of this.crates.values()) {
      if (!crate.isActive) continue;

      const distance = this.playerPosition.distanceTo(crate.position);
      const isInRange = distance <= this.PROXIMITY_RANGE;

      // Check if player is on cooldown
      const cooldownEnd = crate.playerCooldowns.get(playerId);
      const isOnCooldown = cooldownEnd !== undefined && now < cooldownEnd;

      // Update glow intensity based on range and cooldown
      if (crate.glowMesh) {
        if (isInRange && !isOnCooldown) {
          // Bright pulsing glow when in range and ready
          const pulseIntensity = 0.5 + Math.sin(this.glowTime * this.GLOW_PULSE_SPEED * 2) * 0.3;
          (crate.glowMesh.material as THREE.MeshBasicMaterial).opacity = pulseIntensity;
          (crate.glowMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
        } else if (isInRange && isOnCooldown) {
          // Dim red glow when on cooldown
          (crate.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.2;
          (crate.glowMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
        } else {
          // Normal glow when out of range
          const pulseIntensity = 0.3 + Math.sin(this.glowTime * this.GLOW_PULSE_SPEED) * 0.2;
          (crate.glowMesh.material as THREE.MeshBasicMaterial).opacity = pulseIntensity;
          (crate.glowMesh.material as THREE.MeshBasicMaterial).color.setHex(0x00ff00);
        }
      }

      // Trigger resupply when in range and not on cooldown
      if (isInRange && !isOnCooldown) {
        const didResupply = this.tryResupply(crate, playerId);
        if (didResupply) {
          // Set cooldown
          crate.playerCooldowns.set(playerId, now + this.RESUPPLY_COOLDOWN);
        }
      }
    }
  }

  private tryResupply(crate: AmmoCrate, playerId: string): boolean {
    if (!this.inventoryManager || !this.firstPersonWeapon) return false;

    // Check if player needs any supplies
    const currentState = this.inventoryManager.getState();
    const ammoState = this.firstPersonWeapon.getAmmoState();

    const needsAmmo = ammoState.currentMagazine < ammoState.maxMagazine ||
                      ammoState.reserveAmmo < ammoState.maxReserve;
    const needsGrenades = currentState.grenades < currentState.maxGrenades;
    const needsSandbags = currentState.sandbags < currentState.maxSandbags;

    if (!needsAmmo && !needsGrenades && !needsSandbags) {
      return false; // Already fully supplied
    }

    // Resupply everything
    let resupplyItems: string[] = [];

    // Refill ammo (handled by AmmoManager in FirstPersonWeapon)
    if (needsAmmo) {
      // AmmoManager will handle ammo resupply automatically when in zone
      resupplyItems.push('AMMO');
    }

    // Refill grenades
    if (needsGrenades) {
      this.inventoryManager.addGrenades(this.GRENADE_REFILL_AMOUNT);
      resupplyItems.push('GRENADES');
    }

    // Refill sandbags
    if (needsSandbags) {
      this.inventoryManager.addSandbags(this.SANDBAG_REFILL_AMOUNT);
      resupplyItems.push('SANDBAGS');
    }

    // Show feedback
    if (resupplyItems.length > 0) {
      this.showResupplyPopup(resupplyItems.join(' + '));
      console.log(`📦 Resupplied at ${crate.zone.name}: ${resupplyItems.join(', ')}`);
      return true;
    }

    return false;
  }

  private createPopupElement(): void {
    this.popupElement = document.createElement('div');
    this.popupElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Courier New', monospace;
      font-size: 32px;
      font-weight: bold;
      color: #00ff00;
      text-shadow:
        1px 1px 2px rgba(0, 0, 0, 0.9),
        0 0 12px rgba(0, 255, 0, 0.8);
      pointer-events: none;
      z-index: 500;
      display: none;
      white-space: nowrap;
    `;
    document.body.appendChild(this.popupElement);
  }

  private showResupplyPopup(items: string): void {
    if (!this.popupElement) return;

    // Clear existing timeout
    if (this.popupTimeout) {
      clearTimeout(this.popupTimeout);
    }

    // Show popup
    this.popupElement.textContent = `+${items}`;
    this.popupElement.style.display = 'block';

    // Fade out after 2 seconds
    this.popupTimeout = window.setTimeout(() => {
      if (this.popupElement) {
        this.popupElement.style.display = 'none';
      }
    }, 2000);
  }
}
