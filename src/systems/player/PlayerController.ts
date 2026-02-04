import * as THREE from 'three';
import { GameSystem, PlayerState } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { GameModeManager } from '../world/GameModeManager';
import { Faction } from '../combat/types';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { GrenadeSystem } from '../weapons/GrenadeSystem';
import { MortarSystem } from '../weapons/MortarSystem';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { RallyPointSystem } from '../combat/RallyPointSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import { PlayerInput } from './PlayerInput';
import { PlayerMovement } from './PlayerMovement';
import { PlayerCamera } from './PlayerCamera';
import { Logger } from '../../utils/Logger';
import type { HelicopterModel } from '../helicopter/HelicopterModel';
import type { FirstPersonWeapon } from './FirstPersonWeapon';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import type { ISandboxRenderer } from '../../types/SystemInterfaces';

export class PlayerController implements GameSystem {
  private camera: THREE.PerspectiveCamera;
  private chunkManager?: ImprovedChunkManager;
  private gameModeManager?: GameModeManager;
  private helicopterModel?: HelicopterModel;
  private firstPersonWeapon?: FirstPersonWeapon;
  private hudSystem?: HUDSystem;
  private sandboxRenderer?: ISandboxRenderer;
  private inventoryManager?: InventoryManager;
  private grenadeSystem?: GrenadeSystem;
  private mortarSystem?: MortarSystem;
  private sandbagSystem?: SandbagSystem;
  private cameraShakeSystem?: CameraShakeSystem;
  private rallyPointSystem?: RallyPointSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private playerSquadId?: string;
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;
  private playerState: PlayerState;

  // New modules
  private input: PlayerInput;
  private movement: PlayerMovement;
  private cameraController: PlayerCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    // Default position - will be updated when game mode is set
    this.playerState = {
      position: new THREE.Vector3(0, 5, -50),
      velocity: new THREE.Vector3(0, 0, 0),
      speed: 10,
      runSpeed: 20,
      isRunning: false,
      isGrounded: false,
      isJumping: false,
      jumpForce: 12,
      gravity: -25,
      isInHelicopter: false,
      helicopterId: null
    };

    // Initialize modules
    this.input = new PlayerInput();
    this.movement = new PlayerMovement(this.playerState);
    this.cameraController = new PlayerCamera(camera, this.playerState);

    // Setup input callbacks
    this.setupInputCallbacks();
  }

  async init(): Promise<void> {
    if (this.gameModeManager) this.playerState.position.copy(this.getSpawnPosition());
    this.camera.position.copy(this.playerState.position);
    Logger.info('player', `Player controller initialized at ${this.playerState.position.x.toFixed(1)}, ${this.playerState.position.y.toFixed(1)}, ${this.playerState.position.z.toFixed(1)}`);
    if (this.inventoryManager) this.inventoryManager.onSlotChange((slot: WeaponSlot) => this.handleWeaponSlotChange(slot));
  }

  update(deltaTime: number): void {
    if (this.cameraShakeSystem) this.cameraShakeSystem.update(deltaTime);
    this.playerState.isInHelicopter ? this.updateHelicopterMode(deltaTime) : this.movement.updateMovement(deltaTime, this.input, this.camera);
    this.cameraController.updateCamera(this.input);
    this.updateHUD();
    this.updateWeaponSystems();
    if (this.chunkManager) this.chunkManager.updatePlayerPosition(this.playerState.position);
  }

  dispose(): void {
    this.input.dispose();
  }

  private setupInputCallbacks(): void {
    this.input.setCallbacks({
      onJump: () => this.movement.handleJump(),
      onRunStart: () => this.movement.setRunning(true),
      onRunStop: () => this.movement.setRunning(false),
      onEscape: () => this.handleEscape(),
      onScoreboardToggle: (visible: boolean) => this.hudSystem?.toggleScoreboard(visible),
      onEnterExitHelicopter: () => this.handleEnterExitHelicopter(),
      onToggleAutoHover: () => this.movement.toggleAutoHover(),
      onToggleMouseControl: () => this.handleToggleMouseControl(),
      onSandbagRotateLeft: () => this.sandbagSystem?.rotatePlacementPreview(-Math.PI / 8),
      onSandbagRotateRight: () => this.sandbagSystem?.rotatePlacementPreview(Math.PI / 8),
      onRallyPointPlace: () => this.handleRallyPointPlacement(),
      onMouseDown: (button: number) => this.handleMouseDown(button),
      onMouseUp: (button: number) => this.handleMouseUp(button)
    });
  }

  private handleEscape(): void {
    if (this.playerState.isInHelicopter && this.helicopterModel) {
      this.helicopterModel.exitHelicopter();
    } else {
      document.exitPointerLock();
    }
  }

  private handleEnterExitHelicopter(): void {
    if (!this.helicopterModel) return;
    this.playerState.isInHelicopter ? this.helicopterModel.exitHelicopter() : this.helicopterModel.tryEnterHelicopter();
  }

  private handleToggleMouseControl(): void {
    const enabled = this.cameraController.toggleHelicopterMouseControl();
    if (this.hudSystem) this.hudSystem.updateHelicopterMouseMode(enabled);
  }

  private handleRallyPointPlacement(): void {
    if (!this.rallyPointSystem || !this.playerSquadId) return;

    const result = this.rallyPointSystem.placeRallyPoint(
      this.playerState.position.clone(),
      this.playerSquadId,
      Faction.US
    );

    if (this.hudSystem) {
      if (result.success) {
        this.hudSystem.showMessage(result.message, 3000);
      } else {
        this.hudSystem.showMessage(result.message, 3000);
      }
    }

    Logger.info('player', ` Rally point placement: ${result.message}`);
  }

  private handleMouseDown(button: number): void {
    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (button === 0 && this.grenadeSystem) {
          this.grenadeSystem.startAiming();
          if (this.hudSystem) {
            this.hudSystem.showGrenadePowerMeter();
          }
        }
        break;

      case WeaponSlot.SANDBAG:
        if (button === 0 && this.sandbagSystem) {
          this.sandbagSystem.placeSandbag();
        }
        break;
    }
  }

  private handleMouseUp(button: number): void {
    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (button === 0 && this.grenadeSystem) {
          this.grenadeSystem.throwGrenade();
          if (this.hudSystem) {
            this.hudSystem.hideGrenadePowerMeter();
          }
        }
        break;
    }
  }

  private updateHelicopterMode(deltaTime: number): void {
    this.movement.updateHelicopterControls(deltaTime, this.input, this.hudSystem);

    // Add mouse control if enabled
    if (this.cameraController.getHelicopterMouseControlEnabled() && this.input.getIsPointerLocked()) {
      const mouseMovement = this.input.getMouseMovement();
      this.movement.addMouseControlToHelicopter(mouseMovement);
      this.input.clearMouseMovement();
    }
  }

  private updateHUD(): void {
    if (this.hudSystem) this.hudSystem.updateElevation(this.playerState.position.y);
  }

  private updateWeaponSystems(): void {
    if (this.currentWeaponMode === WeaponSlot.SANDBAG && this.sandbagSystem) {
      this.sandbagSystem.updatePreviewPosition(this.camera);
    } else if (this.currentWeaponMode === WeaponSlot.GRENADE && this.grenadeSystem) {
      if (this.grenadeSystem.isCurrentlyAiming()) {
        this.grenadeSystem.updateArc();
        if (this.hudSystem) {
          const aimingState = this.grenadeSystem.getAimingState();
          this.hudSystem.updateGrenadePower(aimingState.power);
        }
      }
    }
  }

  private handleWeaponSlotChange(slot: WeaponSlot): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.setWeaponVisibility(false);
    }
    if (this.grenadeSystem) {
      this.grenadeSystem.showGrenadeInHand(false);
    }
    if (this.sandbagSystem) {
      this.sandbagSystem.showPlacementPreview(false);
    }

    switch (slot) {
      case WeaponSlot.PRIMARY:
      case WeaponSlot.SHOTGUN:
      case WeaponSlot.SMG:
        if (this.firstPersonWeapon) {
          this.firstPersonWeapon.setWeaponVisibility(true);
        }
        break;
      case WeaponSlot.GRENADE:
        if (this.grenadeSystem) {
          this.grenadeSystem.showGrenadeInHand(true);
        }
        break;
      case WeaponSlot.SANDBAG:
        if (this.sandbagSystem) {
          this.sandbagSystem.showPlacementPreview(true);
        }
        break;
    }

    this.currentWeaponMode = slot;
    this.input.setCurrentWeaponMode(slot);
  }

  private getSpawnPosition(): THREE.Vector3 {
    if (!this.gameModeManager) {
      return new THREE.Vector3(0, 5, -50);
    }

    const config = this.gameModeManager.getCurrentConfig();

    const usMainHQ = config.zones.find(z =>
      z.isHomeBase &&
      z.owner === Faction.US &&
      (z.id.includes('main') || z.id === 'us_base')
    );

    if (usMainHQ) {
      const spawnPos = usMainHQ.position.clone();
      spawnPos.y = 5;
      Logger.info('player', ` Spawning at US main HQ: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
      return spawnPos;
    }

    Logger.warn('player', 'Could not find US main HQ, using default spawn');
    return new THREE.Vector3(0, 5, -50);
  }

  // Public API methods

  setPosition(position: THREE.Vector3): void {
    this.playerState.position.copy(position);
    this.camera.position.copy(position);
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isGrounded = false;
    Logger.info('player', `Player teleported to ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);
  }

  updatePlayerPosition(position: THREE.Vector3): void { this.playerState.position.copy(position); }
  disableControls(): void { this.input.setControlsEnabled(false); this.playerState.velocity.set(0, 0, 0); this.playerState.isRunning = false; this.input.unlockPointer(); }
  enableControls(): void { this.input.setControlsEnabled(true); this.input.relockPointer(); }
  setPointerLockEnabled(enabled: boolean): void { this.input.setPointerLockEnabled(enabled); }
  setGameStarted(started: boolean): void { this.input.setGameStarted(started); }

  applyRecoil(pitchDeltaRad: number, yawDeltaRad: number): void { this.cameraController.applyRecoil(pitchDeltaRad, yawDeltaRad); }
  applyScreenShake(intensity: number, duration: number = 0.2): void { if (this.cameraShakeSystem) this.cameraShakeSystem.shake(intensity, duration); }
  applyDamageShake(damageAmount: number): void { if (this.cameraShakeSystem) this.cameraShakeSystem.shakeFromDamage(damageAmount); }
  applyExplosionShake(explosionPos: THREE.Vector3, maxRadius: number): void { if (this.cameraShakeSystem) this.cameraShakeSystem.shakeFromExplosion(explosionPos, this.playerState.position, maxRadius); }
  applyRecoilShake(): void { if (this.cameraShakeSystem) this.cameraShakeSystem.shakeFromRecoil(); }
  getPosition(target?: THREE.Vector3): THREE.Vector3 {
    return (target ?? new THREE.Vector3()).copy(this.playerState.position);
  }
  getVelocity(target?: THREE.Vector3): THREE.Vector3 {
    return (target ?? new THREE.Vector3()).copy(this.playerState.velocity);
  }
  getCamera(): THREE.PerspectiveCamera { return this.camera; }
  isMoving(): boolean { return this.playerState.velocity.length() > 0.1; }
  teleport(position: THREE.Vector3): void { this.playerState.position.copy(position); this.playerState.velocity.set(0, 0, 0); }

  equipWeapon(): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.showWeapon();
      this.firstPersonWeapon.setFireingEnabled(true);
    }
    if (this.sandboxRenderer) {
      this.sandboxRenderer.showCrosshair();
    }
  }

  unequipWeapon(): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.hideWeapon();
      this.firstPersonWeapon.setFireingEnabled(false);
    }
  }

  enterHelicopter(helicopterId: string, helicopterPosition: THREE.Vector3): void {
    Logger.info('player', `  ENTERING HELICOPTER: ${helicopterId}`);
    this.playerState.isInHelicopter = true;
    this.playerState.helicopterId = helicopterId;

    this.setPosition(helicopterPosition);
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;

    this.input.setInHelicopter(true);
    this.unequipWeapon();

    if (this.hudSystem) {
      this.hudSystem.showHelicopterMouseIndicator();
      this.hudSystem.updateHelicopterMouseMode(this.cameraController.getHelicopterMouseControlEnabled());
      this.hudSystem.showHelicopterInstruments();
    }

    Logger.info('player', ` Player entered helicopter at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    Logger.info('player', `  CAMERA MODE: Switched to helicopter camera (flight sim style)`);
  }

  exitHelicopter(exitPosition: THREE.Vector3): void {
    const helicopterId = this.playerState.helicopterId;
    Logger.info('player', `  EXITING HELICOPTER: ${helicopterId}`);

    this.playerState.isInHelicopter = false;
    this.playerState.helicopterId = null;

    this.setPosition(exitPosition);
    this.input.setInHelicopter(false);
    this.equipWeapon();

    if (this.hudSystem) {
      this.hudSystem.hideHelicopterMouseIndicator();
      this.hudSystem.hideHelicopterInstruments();
    }

    Logger.info('player', ` Player exited helicopter to position (${exitPosition.x.toFixed(1)}, ${exitPosition.y.toFixed(1)}, ${exitPosition.z.toFixed(1)})`);
    Logger.info('player', `  CAMERA MODE: Switched to first-person camera`);
  }

  isInHelicopter(): boolean { return this.playerState.isInHelicopter; }
  getHelicopterId(): string | null { return this.playerState.helicopterId; }

  // Dependency setters
  setChunkManager(chunkManager: ImprovedChunkManager): void { this.chunkManager = chunkManager; this.movement.setChunkManager(chunkManager); }
  setGameModeManager(gameModeManager: GameModeManager): void { this.gameModeManager = gameModeManager; }
  setHelicopterModel(helicopterModel: HelicopterModel): void { this.helicopterModel = helicopterModel; this.movement.setHelicopterModel(helicopterModel); this.cameraController.setHelicopterModel(helicopterModel); }
  setFirstPersonWeapon(firstPersonWeapon: FirstPersonWeapon): void { this.firstPersonWeapon = firstPersonWeapon; }
  setHUDSystem(hudSystem: HUDSystem): void { this.hudSystem = hudSystem; }
  setSandboxRenderer(sandboxRenderer: ISandboxRenderer): void { this.sandboxRenderer = sandboxRenderer; }
  setInventoryManager(inventoryManager: InventoryManager): void { this.inventoryManager = inventoryManager; }
  setGrenadeSystem(grenadeSystem: GrenadeSystem): void { this.grenadeSystem = grenadeSystem; }
  setMortarSystem(mortarSystem: MortarSystem): void { this.mortarSystem = mortarSystem; }
  setSandbagSystem(sandbagSystem: SandbagSystem): void { this.sandbagSystem = sandbagSystem; this.movement.setSandbagSystem(sandbagSystem); }
  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void { this.cameraShakeSystem = cameraShakeSystem; this.cameraController.setCameraShakeSystem(cameraShakeSystem); }
  setRallyPointSystem(rallyPointSystem: RallyPointSystem): void { this.rallyPointSystem = rallyPointSystem; }
  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void { this.footstepAudioSystem = footstepAudioSystem; this.movement.setFootstepAudioSystem(footstepAudioSystem); }
  setPlayerSquadId(squadId: string): void { this.playerSquadId = squadId; }
}
