import * as THREE from 'three';
import { GameSystem, PlayerState } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { GameModeManager } from '../world/GameModeManager';
import { Faction } from '../combat/types';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { TicketSystem } from '../world/TicketSystem';
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
import type { IGameRenderer } from '../../types/SystemInterfaces';
import type { PlayerSquadController } from '../combat/PlayerSquadController';

export class PlayerController implements GameSystem {
  private static readonly SPAWN_STABILIZATION_MS = 2500;
  private static readonly SPAWN_STABILIZATION_MAX_DIST = 60;
  private camera: THREE.PerspectiveCamera;
  private chunkManager?: ImprovedChunkManager;
  private gameModeManager?: GameModeManager;
  private helicopterModel?: HelicopterModel;
  private firstPersonWeapon?: FirstPersonWeapon;
  private hudSystem?: HUDSystem;
  private ticketSystem?: TicketSystem;
  private gameRenderer?: IGameRenderer;
  private inventoryManager?: InventoryManager;
  private grenadeSystem?: GrenadeSystem;
  private mortarSystem?: MortarSystem;
  private sandbagSystem?: SandbagSystem;
  private cameraShakeSystem?: CameraShakeSystem;
  private rallyPointSystem?: RallyPointSystem;
  private footstepAudioSystem?: FootstepAudioSystem;
  private playerSquadController?: PlayerSquadController;
  private playerSquadId?: string;
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;
  private playerState: PlayerState;
  private spawnStabilizationUntilMs = 0;

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
  }

  update(deltaTime: number): void {
    // Poll gamepad before reading any input state
    this.input.pollGamepad();

    if (this.cameraShakeSystem) this.cameraShakeSystem.update(deltaTime);
    if (this.playerState.isInHelicopter) {
      this.updateHelicopterMode(deltaTime);
    } else {
      this.movement.updateMovement(deltaTime, this.input, this.camera);
    }
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
      onScoreboardTap: () => this.hudSystem?.toggleScoreboardVisibility(),
      onEnterExitHelicopter: () => this.handleEnterExitHelicopter(),
      onToggleAutoHover: () => this.movement.toggleAutoHover(),
      onToggleMouseControl: () => this.handleToggleMouseControl(),
      onSandbagRotateLeft: () => this.sandbagSystem?.rotatePlacementPreview(-Math.PI / 8),
      onSandbagRotateRight: () => this.sandbagSystem?.rotatePlacementPreview(Math.PI / 8),
      onRallyPointPlace: () => this.handleRallyPointPlacement(),
      onToggleMortarCamera: () => this.handleToggleMortarCamera(),
      onDeployMortar: () => this.handleDeployMortar(),
      onMortarFire: () => this.handleMortarFire(),
      onMortarAdjustPitch: (delta: number) => this.handleMortarAdjustPitch(delta),
      onMortarAdjustYaw: (delta: number) => this.handleMortarAdjustYaw(delta),
      onMouseDown: (button: number) => {
        if (button === 0) this.actionFireStart();
        else if (button === 2) this.actionADSStart();
      },
      onMouseUp: (button: number) => {
        if (button === 0) this.actionFireStop();
        else if (button === 2) this.actionADSStop();
      },
      onReload: () => this.actionReload(),
      onGrenadeSwitch: () => this.handleTouchGrenadeSwitch(),
      onWeaponSlotChange: (slot: WeaponSlot) => this.handleWeaponSlotChange(slot),
      onSquadCommand: () => this.playerSquadController?.toggleRadialMenu(),
      onMenuPause: () => this.handleMenuPause(),
      onMenuResume: () => this.handleMenuResume(),
    });
  }

  /**
   * Wire touch-specific controls that need direct references (mortar, weapon bar).
   * Called once when firstPersonWeapon becomes available.
   * Fire/ADS/reload all flow through unified action methods via PlayerInput callbacks.
   */
  private wireTouchExtras(): void {
    const touchControls = this.input.getTouchControls();
    if (!touchControls) return;

    // Wire weapon bar through HUDSystem (UnifiedWeaponBar replaces TouchWeaponBar)
    this.hudSystem?.setWeaponSelectCallback((slotIndex: number) => {
      this.inventoryManager?.setCurrentSlot(slotIndex as WeaponSlot);
    });

    // Mount touch controls into grid layout slots
    const layout = this.hudSystem?.getLayout();
    if (layout) {
      touchControls.mountToLayout(layout);
    }

    // Wire mortar button callbacks
    touchControls.mortarButton.setCallbacks({
      onDeploy: () => {
        this.handleDeployMortar();
        // Auto-start aiming after deploy on mobile
        if (this.mortarSystem?.isCurrentlyDeployed()) {
          this.mortarSystem.startAiming();
          touchControls.mortarButton.setDeployed(true);
          touchControls.fireButton.hide();
        }
      },
      onUndeploy: () => {
        this.handleDeployMortar(); // toggles undeploy
        touchControls.mortarButton.setDeployed(false);
        if (touchControls.isVisible()) {
          touchControls.fireButton.show();
        }
      },
      onFire: () => this.handleMortarFire(),
      onAdjustPitch: (delta: number) => this.handleMortarAdjustPitch(delta),
      onAdjustYaw: (delta: number) => this.handleMortarAdjustYaw(delta),
      onToggleMortarCamera: () => this.handleToggleMortarCamera(),
    });
  }

  // ---- Unified action methods (all input types route here) ----

  /** Start firing - routes to weapon system based on current weapon mode */
  private actionFireStart(): void {
    const isGameActive = this.ticketSystem ? this.ticketSystem.isGameActive() : true;
    if (!isGameActive) return;

    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (this.grenadeSystem) {
          this.grenadeSystem.startAiming();
          this.hudSystem?.showGrenadePowerMeter();
        }
        break;
      case WeaponSlot.SANDBAG:
        this.sandbagSystem?.placeSandbag();
        break;
      default:
        // Gun slots - delegate to WeaponInput
        this.firstPersonWeapon?.getWeaponInput()?.triggerFireStart();
        break;
    }
  }

  /** Stop firing - routes to weapon system based on current weapon mode */
  private actionFireStop(): void {
    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (this.grenadeSystem) {
          this.grenadeSystem.throwGrenade();
          this.hudSystem?.hideGrenadePowerMeter();
        }
        break;
      default:
        this.firstPersonWeapon?.getWeaponInput()?.triggerFireStop();
        break;
    }
  }

  /** Start ADS - delegates to WeaponInput */
  private actionADSStart(): void {
    this.firstPersonWeapon?.getWeaponInput()?.triggerADS(true);
  }

  /** Stop ADS - delegates to WeaponInput */
  private actionADSStop(): void {
    this.firstPersonWeapon?.getWeaponInput()?.triggerADS(false);
  }

  /** Reload - delegates to WeaponInput */
  private actionReload(): void {
    this.firstPersonWeapon?.getWeaponInput()?.triggerReload();
  }

  private handleTouchGrenadeSwitch(): void {
    this.inventoryManager?.setCurrentSlot(WeaponSlot.GRENADE);
  }

  private handleMenuPause(): void {
    this.input.setControlsEnabled(false);
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;
  }

  private handleMenuResume(): void {
    this.input.setControlsEnabled(true);
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
    if (this.playerState.isInHelicopter) {
      this.helicopterModel.exitHelicopter();
    } else {
      this.helicopterModel.tryEnterHelicopter();
    }
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

  private handleToggleMortarCamera(): void {
    if (this.mortarSystem) {
      this.mortarSystem.toggleMortarCamera();
    }
  }

  private handleDeployMortar(): void {
    if (!this.mortarSystem) return;

    if (this.mortarSystem.isCurrentlyDeployed()) {
      this.mortarSystem.undeployMortar();
    } else {
      // Get player direction from camera
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      direction.y = 0; // Keep horizontal
      direction.normalize();

      this.mortarSystem.deployMortar(this.playerState.position, direction);
    }
  }

  private handleMortarFire(): void {
    if (this.mortarSystem) {
      this.mortarSystem.fireMortarRound();
    }
  }

  private handleMortarAdjustPitch(delta: number): void {
    if (this.mortarSystem && this.mortarSystem.isCurrentlyDeployed()) {
      this.mortarSystem.adjustPitch(delta * 2);
    }
  }

  private handleMortarAdjustYaw(delta: number): void {
    if (this.mortarSystem && this.mortarSystem.isCurrentlyDeployed()) {
      this.mortarSystem.adjustYaw(delta * 2);
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
      case WeaponSlot.PISTOL:
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

    // Update unified weapon bar highlight (works for both desktop and touch)
    this.hudSystem?.setActiveWeaponSlot(slot as number);

    // Update touch-specific controls
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.adsButton.resetADS();

      // Show/hide sandbag rotation buttons
      if (slot === WeaponSlot.SANDBAG) {
        touchControls.sandbagButtons.showButton();
      } else {
        touchControls.sandbagButtons.hideButton();
      }
    }
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

  private isStabilizationBypassReason(reason: string): boolean {
    return reason.startsWith('startup')
      || reason.startsWith('respawn')
      || reason.startsWith('helicopter')
      || reason.startsWith('harness')
      || reason === 'teleport';
  }

  setPosition(position: THREE.Vector3, reason = 'unknown'): void {
    const now = performance.now();
    const dist = this.playerState.position.distanceTo(position);
    const inStabilizationWindow = now < this.spawnStabilizationUntilMs;
    if (
      inStabilizationWindow
      && !this.isStabilizationBypassReason(reason)
      && dist > PlayerController.SPAWN_STABILIZATION_MAX_DIST
    ) {
      Logger.warn(
        'player',
        `[spawn-stabilization] blocked position jump reason=${reason} dist=${dist.toFixed(1)} from=(${this.playerState.position.x.toFixed(1)}, ${this.playerState.position.y.toFixed(1)}, ${this.playerState.position.z.toFixed(1)}) to=(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
      );
      return;
    }

    this.playerState.position.copy(position);
    this.camera.position.copy(position);
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isGrounded = false;
    if (reason.startsWith('startup')) {
      this.spawnStabilizationUntilMs = now + PlayerController.SPAWN_STABILIZATION_MS;
    }

    // Large jumps can outpace chunk streaming; force immediate position sync.
    if (this.chunkManager && dist > 32) {
      this.chunkManager.updatePlayerPosition(this.playerState.position);
    }

    Logger.info(
      'player',
      `Player moved (${reason}) to ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)} dist=${dist.toFixed(1)}`
    );
  }

  updatePlayerPosition(position: THREE.Vector3): void { this.playerState.position.copy(position); }
  disableControls(): void {
    this.input.setControlsEnabled(false);
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;
    this.input.unlockPointer();

    // Ensure no high-frequency auxiliary-weapon loops remain active while dead/respawning.
    if (this.grenadeSystem?.isCurrentlyAiming()) {
      this.grenadeSystem.cancelThrow();
    }
    if (this.mortarSystem?.isCurrentlyAiming()) {
      this.mortarSystem.cancelAiming();
    }
    if (this.sandbagSystem) {
      this.sandbagSystem.showPlacementPreview(false);
    }
    if (this.hudSystem) {
      this.hudSystem.hideGrenadePowerMeter();
    }
  }
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
  teleport(position: THREE.Vector3): void { this.setPosition(position, 'teleport'); }

  equipWeapon(): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.showWeapon();
      this.firstPersonWeapon.setFireingEnabled(true);
    }
    if (this.gameRenderer) {
      this.gameRenderer.showCrosshair();
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

    this.setPosition(helicopterPosition, 'helicopter.enter');
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;

    this.input.setInHelicopter(true);
    this.unequipWeapon();

    if (this.hudSystem) {
      this.hudSystem.showHelicopterMouseIndicator();
      this.hudSystem.updateHelicopterMouseMode(this.cameraController.getHelicopterMouseControlEnabled());
      this.hudSystem.showHelicopterInstruments();
    }

    // Hide rally point button when in helicopter
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.rallyPointButton.hideButton();
      touchControls.helicopterCyclic.show();
    }

    Logger.info('player', ` Player entered helicopter at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    Logger.info('player', `  CAMERA MODE: Switched to helicopter camera (flight sim style)`);
  }

  exitHelicopter(exitPosition: THREE.Vector3): void {
    const helicopterId = this.playerState.helicopterId;
    Logger.info('player', `  EXITING HELICOPTER: ${helicopterId}`);

    this.playerState.isInHelicopter = false;
    this.playerState.helicopterId = null;

    this.setPosition(exitPosition, 'helicopter.exit');
    this.input.setInHelicopter(false);
    this.equipWeapon();

    if (this.hudSystem) {
      this.hudSystem.hideHelicopterMouseIndicator();
      this.hudSystem.hideHelicopterInstruments();
    }

    // Show rally point button when exiting helicopter
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.rallyPointButton.showButton();
      touchControls.helicopterCyclic.hide();
    }

    Logger.info('player', ` Player exited helicopter to position (${exitPosition.x.toFixed(1)}, ${exitPosition.y.toFixed(1)}, ${exitPosition.z.toFixed(1)})`);
    Logger.info('player', `  CAMERA MODE: Switched to first-person camera`);
  }

  isInHelicopter(): boolean { return this.playerState.isInHelicopter; }
  getHelicopterId(): string | null { return this.playerState.helicopterId; }

  // Dependency setters
  setChunkManager(chunkManager: ImprovedChunkManager): void { this.chunkManager = chunkManager; this.movement.setChunkManager(chunkManager); }
  setGameModeManager(gameModeManager: GameModeManager): void { this.gameModeManager = gameModeManager; }
  setTicketSystem(ticketSystem: TicketSystem): void { this.ticketSystem = ticketSystem; }
  setHelicopterModel(helicopterModel: HelicopterModel): void { this.helicopterModel = helicopterModel; this.movement.setHelicopterModel(helicopterModel); this.cameraController.setHelicopterModel(helicopterModel); helicopterModel.setPlayerInput(this.input); }
  setFirstPersonWeapon(firstPersonWeapon: FirstPersonWeapon): void {
    this.firstPersonWeapon = firstPersonWeapon;
    // Disable WeaponInput's direct mouse/key listeners - all input flows through PlayerController
    firstPersonWeapon.getWeaponInput().disableDirectListeners();
    // Wire touch-specific extras (weapon bar, mortar)
    this.wireTouchExtras();
  }
  setHUDSystem(hudSystem: HUDSystem): void { this.hudSystem = hudSystem; }
  setRenderer(renderer: IGameRenderer): void { this.gameRenderer = renderer; }
  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
    inventoryManager.onSlotChange((slot: WeaponSlot) => this.handleWeaponSlotChange(slot));
  }
  setGrenadeSystem(grenadeSystem: GrenadeSystem): void { this.grenadeSystem = grenadeSystem; }
  setMortarSystem(mortarSystem: MortarSystem): void { this.mortarSystem = mortarSystem; }
  setSandbagSystem(sandbagSystem: SandbagSystem): void { this.sandbagSystem = sandbagSystem; this.movement.setSandbagSystem(sandbagSystem); }
  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void { this.cameraShakeSystem = cameraShakeSystem; this.cameraController.setCameraShakeSystem(cameraShakeSystem); }
  setRallyPointSystem(rallyPointSystem: RallyPointSystem): void { this.rallyPointSystem = rallyPointSystem; }
  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void { this.footstepAudioSystem = footstepAudioSystem; this.movement.setFootstepAudioSystem(footstepAudioSystem); }
  setPlayerSquadId(squadId: string): void { this.playerSquadId = squadId; }
  setPlayerSquadController(playerSquadController: PlayerSquadController): void { this.playerSquadController = playerSquadController; }
}
