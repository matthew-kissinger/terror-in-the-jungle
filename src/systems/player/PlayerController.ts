import * as THREE from 'three';
import { GameSystem, PlayerState } from '../../types';
import { GameModeManager } from '../world/GameModeManager';
import { Faction, getAlliance } from '../combat/types';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { TicketSystem } from '../world/TicketSystem';
import { GrenadeSystem } from '../weapons/GrenadeSystem';
import { MortarSystem } from '../weapons/MortarSystem';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { RallyPointSystem } from '../combat/RallyPointSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import { InputManager } from '../input/InputManager';
import { PlayerMovement } from './PlayerMovement';
import { PlayerCamera } from './PlayerCamera';
import { SpectatorCamera, type SpectatorCandidate } from './SpectatorCamera';
import { InputContextManager } from '../input/InputContextManager';
import { Logger } from '../../utils/Logger';
import { resolveInitialSpawnPosition } from '../world/runtime/ModeSpawnResolver';
import type { HelicopterModel } from '../helicopter/HelicopterModel';
import type { FirstPersonWeapon } from './FirstPersonWeapon';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import type { IGameRenderer, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { CommandInputManager } from '../combat/CommandInputManager';
import type { PlayerSquadController } from '../combat/PlayerSquadController';

// ── Player physics defaults ──
const PLAYER_WALK_SPEED = 10;
const PLAYER_RUN_SPEED = 20;
const PLAYER_JUMP_FORCE = 12;
const PLAYER_GRAVITY = -25;

export class PlayerController implements GameSystem {
  private static readonly SPAWN_STABILIZATION_MS = 2500;
  private static readonly SPAWN_STABILIZATION_MAX_DIST = 60;
  private camera: THREE.PerspectiveCamera;
  private terrainSystem?: ITerrainRuntime;
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
  private commandInputManager?: CommandInputManager;
  private playerSquadId?: string;
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;
  private playerFaction: Faction = Faction.US;
  private playerState: PlayerState;
  private spawnStabilizationUntilMs = 0;

  // Spectator camera (activates after death presentation)
  private spectatorCamera: SpectatorCamera;
  private spectatorCandidateProvider?: () => SpectatorCandidate[];
  private spectatorClickHandler?: (e: MouseEvent) => void;

  // New modules
  private input: InputManager;
  private movement: PlayerMovement;
  private cameraController: PlayerCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    // Default position - will be updated when game mode is set
    this.playerState = {
      position: new THREE.Vector3(0, 5, -50),
      velocity: new THREE.Vector3(0, 0, 0),
      speed: PLAYER_WALK_SPEED,
      runSpeed: PLAYER_RUN_SPEED,
      isRunning: false,
      isGrounded: false,
      isJumping: false,
      jumpForce: PLAYER_JUMP_FORCE,
      gravity: PLAYER_GRAVITY,
      isCrouching: false,
      isInHelicopter: false,
      helicopterId: null
    };

    // Initialize modules
    this.input = new InputManager();
    this.movement = new PlayerMovement(this.playerState);
    this.cameraController = new PlayerCamera(camera, this.playerState);
    this.spectatorCamera = new SpectatorCamera(camera);

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

    // Spectator mode: only update spectator camera, skip normal gameplay
    if (this.spectatorCamera.isActive()) {
      const mouseMovement = this.input.getMouseMovement();
      if (mouseMovement.x !== 0) {
        this.spectatorCamera.applyMouseDelta(mouseMovement.x);
      }
      this.input.clearMouseMovement();
      const candidates = this.spectatorCandidateProvider?.() ?? [];
      this.spectatorCamera.update(deltaTime, candidates);
      return;
    }

    if (this.cameraShakeSystem) this.cameraShakeSystem.update(deltaTime);
    if (this.playerState.isInHelicopter) {
      this.updateHelicopterMode(deltaTime);
    } else {
      this.movement.updateMovement(deltaTime, this.input, this.camera);
    }
    this.cameraController.updateCamera(this.input);
    this.updateHUD();
    this.updateWeaponSystems();
    if (this.terrainSystem) this.terrainSystem.updatePlayerPosition(this.playerState.position);
  }

  dispose(): void {
    this.deactivateSpectator();
    this.input.dispose();
  }

  private setupInputCallbacks(): void {
    this.input.setCallbacks({
      onJump: () => {
        if (this.commandInputManager?.handlePrimaryConfirm()) return;
        this.movement.handleJump();
      },
      onRunStart: () => this.movement.setRunning(true),
      onRunStop: () => this.movement.setRunning(false),
      onEscape: () => this.handleEscape(),
      onScoreboardToggle: (visible: boolean) => this.hudSystem?.toggleScoreboard(visible),
      onScoreboardTap: () => this.hudSystem?.toggleScoreboardVisibility(),
      onEnterExitHelicopter: () => {
        if (this.commandInputManager?.handleSecondarySelect()) return;
        this.handleEnterExitHelicopter();
      },
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
      onReload: () => {
        if (this.commandInputManager?.handleGamepadCancel()) return;
        this.actionReload();
      },
      onGrenadeSwitch: () => this.handleTouchGrenadeSwitch(),
      onWeaponSlotChange: (slot: WeaponSlot) => {
        // Route through InventoryManager so FirstPersonWeapon's onSlotChange callback
        // fires and actually switches the weapon model/ammo (not just visibility).
        if (this.inventoryManager) {
          this.inventoryManager.setCurrentSlot(slot);
        }
      },
      onSquadDeploy: () => this.handleSquadDeploy(),
      onSquadCommand: () => this.commandInputManager?.toggleCommandMode(),
      onSquadQuickCommand: (slot: number) => this.commandInputManager?.issueQuickCommand(slot),
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

    // Note: weapon bar/pill callbacks are wired in setHUDSystem() since
    // wireTouchExtras() runs before hudSystem is available.

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
      case WeaponSlot.GRENADE: {
        const equipmentAction = this.inventoryManager?.getEquipmentActionForSlot(WeaponSlot.GRENADE);
        if (equipmentAction === 'grenade' && this.grenadeSystem) {
          this.grenadeSystem.startAiming();
          this.hudSystem?.showGrenadePowerMeter();
        } else if (equipmentAction === 'sandbag') {
          this.sandbagSystem?.placeSandbag();
        } else if (equipmentAction === 'mortar') {
          this.handleDeployMortar();
        }
        break;
      }
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
        if (this.inventoryManager?.getEquipmentActionForSlot(WeaponSlot.GRENADE) === 'grenade' && this.grenadeSystem) {
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
    this.input.setInputContext('menu');
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;
  }

  private handleMenuResume(): void {
    this.input.setControlsEnabled(true);
    this.input.setInputContext('gameplay');
  }

  private handleEscape(): void {
    if (this.commandInputManager?.handleCancel()) {
      return;
    }
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

  private handleSquadDeploy(): void {
    if (!this.helicopterModel || !this.playerState.isInHelicopter) return;
    this.helicopterModel.tryDeploySquad();
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
      this.playerFaction
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
    if (this.inventoryManager && !this.inventoryManager.hasMortarKit()) {
      this.hudSystem?.showMessage('Mortar kit not equipped', 2000);
      return;
    }

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
    const equipmentAction = this.inventoryManager?.getEquipmentActionForSlot(this.currentWeaponMode) ?? null;
    if ((this.currentWeaponMode === WeaponSlot.SANDBAG || equipmentAction === 'sandbag') && this.sandbagSystem) {
      this.sandbagSystem.updatePreviewPosition(this.camera);
    } else if ((this.currentWeaponMode === WeaponSlot.GRENADE && equipmentAction === 'grenade') && this.grenadeSystem) {
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

    const equippedWeapon = this.inventoryManager?.getWeaponTypeForSlot(slot) ?? null;
    const equipmentAction = this.inventoryManager?.getEquipmentActionForSlot(slot) ?? null;
    if (equippedWeapon && this.firstPersonWeapon) {
      this.firstPersonWeapon.setWeaponVisibility(true);
      this.firstPersonWeapon.setPrimaryWeapon(equippedWeapon);
    } else if (equipmentAction === 'grenade') {
      this.grenadeSystem?.showGrenadeInHand(true);
    } else if (equipmentAction === 'sandbag' || (slot === WeaponSlot.SANDBAG && this.inventoryManager?.hasSandbagKit())) {
      this.sandbagSystem?.showPlacementPreview(true);
    }

    this.currentWeaponMode = slot;
    this.input.setCurrentWeaponMode(slot);

    // Update unified weapon bar highlight (works for both desktop and touch)
    this.hudSystem?.setActiveWeaponSlot(slot as number);

    // Update touch-specific controls
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.adsButton.resetADS();
      touchControls.setActiveWeaponSlot(slot as number);

      // Show/hide sandbag rotation buttons
      if (equipmentAction === 'sandbag' || slot === WeaponSlot.SANDBAG) {
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

    const definition = this.gameModeManager.getCurrentDefinition();
    const spawnPos = resolveInitialSpawnPosition(definition, getAlliance(this.playerFaction));
    spawnPos.y = 5;
    Logger.info('player', ` Spawning at policy-resolved start: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
    return spawnPos;
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
    if (this.terrainSystem && dist > 32) {
      this.terrainSystem.updatePlayerPosition(this.playerState.position);
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
  enableControls(): void {
    this.deactivateSpectator();
    this.input.setControlsEnabled(true);
    this.input.relockPointer();
  }
  setPointerLockEnabled(enabled: boolean): void { this.input.setPointerLockEnabled(enabled); }
  setGameStarted(started: boolean): void {
    this.input.setGameStarted(started);
    this.input.setInputContext(started ? 'gameplay' : 'menu');
  }
  setPlayerFaction(faction: Faction): void {
    this.playerFaction = faction;
    this.firstPersonWeapon?.setPlayerFaction(faction);
  }

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

      if (this.helicopterModel) {
        const role = this.helicopterModel.getAircraftRole(helicopterId);
        this.hudSystem.setHelicopterAircraftRole(role);

        if (this.gameRenderer) {
          const crosshairMode = role === 'attack' ? 'helicopter_attack'
            : role === 'gunship' ? 'helicopter_gunship'
            : 'helicopter_transport';
          this.gameRenderer.setCrosshairMode(crosshairMode);
        }
      }
    }

    // Switch touch controls to helicopter dual-joystick mode
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.enterHelicopterMode();
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

    if (this.gameRenderer) {
      this.gameRenderer.setCrosshairMode('infantry');
    }

    // Restore touch controls to infantry mode
    const touchControls = this.input.getTouchControls();
    if (touchControls) {
      touchControls.exitHelicopterMode();
    }

    Logger.info('player', ` Player exited helicopter to position (${exitPosition.x.toFixed(1)}, ${exitPosition.y.toFixed(1)}, ${exitPosition.z.toFixed(1)})`);
    Logger.info('player', `  CAMERA MODE: Switched to first-person camera`);
  }

  isInHelicopter(): boolean { return this.playerState.isInHelicopter; }
  getHelicopterId(): string | null { return this.playerState.helicopterId; }

  // ── Spectator camera API ──

  /**
   * Activate spectator mode. Called after death presentation finishes.
   * Sets input context to 'spectator' and starts following a teammate.
   */
  activateSpectator(): void {
    const candidates = this.spectatorCandidateProvider?.() ?? [];
    this.spectatorCamera.activate(candidates);
    InputContextManager.getInstance().setContext('spectator');

    // Direct click listener for target cycling (bypasses InputManager gameplay gate)
    this.spectatorClickHandler = (e: MouseEvent) => {
      if (!this.spectatorCamera.isActive()) return;
      if (e.button === 0) this.spectatorCamera.nextTarget();
      else if (e.button === 2) this.spectatorCamera.prevTarget();
    };
    document.addEventListener('mousedown', this.spectatorClickHandler);
  }

  /**
   * Deactivate spectator mode. Called when respawning or deploying.
   * Restores input context to 'gameplay'.
   */
  deactivateSpectator(): void {
    if (!this.spectatorCamera.isActive()) return;
    this.spectatorCamera.deactivate();

    if (this.spectatorClickHandler) {
      document.removeEventListener('mousedown', this.spectatorClickHandler);
      this.spectatorClickHandler = undefined;
    }

    InputContextManager.getInstance().setContext('gameplay');
  }

  isSpectating(): boolean { return this.spectatorCamera.isActive(); }
  getSpectatorTargetId(): string | null { return this.spectatorCamera.getCurrentTargetId(); }

  /** Apply mouse look delta to spectator free-look rotation. */
  applySpectatorMouseDelta(deltaX: number): void { this.spectatorCamera.applyMouseDelta(deltaX); }

  // Dependency setters
  setTerrainSystem(terrainSystem: ITerrainRuntime): void { this.terrainSystem = terrainSystem; this.movement.setTerrainSystem(terrainSystem); }
  setWorldSize(worldSize: number): void { this.movement.setWorldSize(worldSize); }
  setGameModeManager(gameModeManager: GameModeManager): void { this.gameModeManager = gameModeManager; }
  setTicketSystem(ticketSystem: TicketSystem): void { this.ticketSystem = ticketSystem; }
  setHelicopterModel(helicopterModel: HelicopterModel): void { this.helicopterModel = helicopterModel; this.movement.setHelicopterModel(helicopterModel); this.cameraController.setHelicopterModel(helicopterModel); helicopterModel.setPlayerInput(this.input); }
  setFirstPersonWeapon(firstPersonWeapon: FirstPersonWeapon): void {
    this.firstPersonWeapon = firstPersonWeapon;
    firstPersonWeapon.setPlayerFaction(this.playerFaction);
    // Disable WeaponInput's direct mouse/key listeners - all input flows through PlayerController
    firstPersonWeapon.getWeaponInput().disableDirectListeners();
    // Wire touch-specific extras (weapon bar, mortar)
    this.wireTouchExtras();
  }
  setHUDSystem(hudSystem: HUDSystem): void {
    this.hudSystem = hudSystem;
    // Wire UnifiedWeaponBar and WeaponPill weapon-select callbacks through InventoryManager
    // so actual weapon switching occurs (model + ammo swap, not just UI highlight).
    hudSystem.setWeaponSelectCallback((slotIndex: number) => {
      this.inventoryManager?.setCurrentSlot(slotIndex as WeaponSlot);
    });
    this.syncLoadoutHud();
  }
  setRenderer(renderer: IGameRenderer): void { this.gameRenderer = renderer; }
  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
    inventoryManager.onSlotChange((slot: WeaponSlot) => this.handleWeaponSlotChange(slot));
    inventoryManager.onLoadoutChange(() => this.syncLoadoutHud());
    this.syncLoadoutHud();
  }
  setGrenadeSystem(grenadeSystem: GrenadeSystem): void { this.grenadeSystem = grenadeSystem; }
  setMortarSystem(mortarSystem: MortarSystem): void { this.mortarSystem = mortarSystem; }
  setSandbagSystem(sandbagSystem: SandbagSystem): void { this.sandbagSystem = sandbagSystem; this.movement.setSandbagSystem(sandbagSystem); }
  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void { this.cameraShakeSystem = cameraShakeSystem; this.cameraController.setCameraShakeSystem(cameraShakeSystem); }
  setRallyPointSystem(rallyPointSystem: RallyPointSystem): void { this.rallyPointSystem = rallyPointSystem; }
  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void { this.footstepAudioSystem = footstepAudioSystem; this.movement.setFootstepAudioSystem(footstepAudioSystem); }
  setPlayerSquadId(squadId: string): void { this.playerSquadId = squadId; }
  setPlayerSquadController(playerSquadController: PlayerSquadController): void { this.playerSquadController = playerSquadController; }
  setCommandInputManager(commandInputManager: CommandInputManager): void {
    this.commandInputManager = commandInputManager;
    commandInputManager.bindInputManager(this.input);
  }
  setSpectatorCandidateProvider(provider: () => SpectatorCandidate[]): void {
    this.spectatorCandidateProvider = provider;
  }

  private syncLoadoutHud(): void {
    if (!this.hudSystem || !this.inventoryManager) {
      return;
    }
    this.hudSystem.setWeaponBarLayout(this.inventoryManager.getSlotDefinitions(), this.inventoryManager.getWeaponCycleSlots());
    this.hudSystem.setActiveWeaponSlot(this.inventoryManager.getCurrentSlot());
  }
}
