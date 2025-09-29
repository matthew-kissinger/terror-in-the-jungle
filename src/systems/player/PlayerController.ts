import * as THREE from 'three';
import { GameSystem, PlayerState } from '../../types';
import { MathUtils } from '../../utils/Math';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { GameModeManager } from '../world/GameModeManager';
import { Faction } from '../combat/types';
import { HelicopterControls } from '../helicopter/HelicopterPhysics';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { GrenadeSystem } from '../weapons/GrenadeSystem';
import { MortarSystem } from '../weapons/MortarSystem';
import { SandbagSystem } from '../weapons/SandbagSystem';

export class PlayerController implements GameSystem {
  private camera: THREE.PerspectiveCamera;
  private chunkManager?: ImprovedChunkManager;
  private gameModeManager?: GameModeManager;
  private helicopterModel?: any;
  private firstPersonWeapon?: any;
  private hudSystem?: any;
  private sandboxRenderer?: any;
  private inventoryManager?: InventoryManager;
  private grenadeSystem?: GrenadeSystem;
  private mortarSystem?: MortarSystem;
  private sandbagSystem?: SandbagSystem;
  private currentWeaponMode: WeaponSlot = WeaponSlot.PRIMARY;
  private isInMortarMode = false;
  private playerState: PlayerState;
  private keys: Set<string> = new Set();
  private mouseMovement = { x: 0, y: 0 };
  private isPointerLocked = false;
  private isControlsEnabled = true; // For death system
  private gameStarted = false; // Don't lock pointer until game starts

  // Camera settings
  private pitch = 0;
  private yaw = Math.PI; // Face toward negative X (opposite of yaw=0)
  private maxPitch = Math.PI / 2 - 0.1; // Prevent full vertical rotation

  // Helicopter camera settings - chase cam style
  private helicopterCameraDistance = 25; // Distance behind helicopter for full view
  private helicopterCameraHeight = 8; // Height above helicopter for good overview
  private helicopterCameraAngle = -0.1; // Very slight downward angle

  // Helicopter controls state
  private helicopterControls: HelicopterControls = {
    collective: 0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: true
  };

  // Mouse control mode for helicopter
  private helicopterMouseControlEnabled = true; // True = mouse affects controls, False = free orbital look

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

    this.setupEventListeners();
  }

  async init(): Promise<void> {
    // Get spawn position from game mode if available
    if (this.gameModeManager) {
      const spawnPos = this.getSpawnPosition();
      this.playerState.position.copy(spawnPos);
    }

    // Set initial camera position
    this.camera.position.copy(this.playerState.position);
    console.log(`Player controller initialized at ${this.playerState.position.x.toFixed(1)}, ${this.playerState.position.y.toFixed(1)}, ${this.playerState.position.z.toFixed(1)}`);

    // Connect inventory callback
    if (this.inventoryManager) {
      this.inventoryManager.onSlotChange((slot: WeaponSlot) => {
        this.handleWeaponSlotChange(slot);
      });
    }
  }

  update(deltaTime: number): void {
    if (!this.isControlsEnabled) return; // Skip updates when dead

    if (this.playerState.isInHelicopter) {
      this.updateHelicopterControls(deltaTime);
    } else {
      this.updateMovement(deltaTime);
    }

    this.updateCamera();
    this.updateHUD();

    // Update weapon-specific systems
    if (this.currentWeaponMode === WeaponSlot.SANDBAG && this.sandbagSystem) {
      this.sandbagSystem.updatePreviewPosition(this.camera);
    } else if (this.currentWeaponMode === WeaponSlot.GRENADE && this.grenadeSystem && this.grenadeSystem.isCurrentlyAiming()) {
      this.grenadeSystem.updateArc();
    // Mortar system disabled - to be reimplemented
    // } else if (this.currentWeaponMode === WeaponSlot.MORTAR && this.mortarSystem && this.mortarSystem.isCurrentlyAiming()) {
    //   this.mortarSystem.updateArc();
    }

    // Update chunk manager with player position
    if (this.chunkManager) {
      this.chunkManager.updatePlayerPosition(this.playerState.position);
    }
  }

  private updateHUD(): void {
    // Update elevation display
    if (this.hudSystem) {
      this.hudSystem.updateElevation(this.playerState.position.y);
    }
  }

  dispose(): void {
    this.removeEventListeners();
  }

  private setupEventListeners(): void {
    // Keyboard events
    document.addEventListener('keydown', this.onKeyDown.bind(this));
    document.addEventListener('keyup', this.onKeyUp.bind(this));

    // Mouse events
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Store bound function to avoid duplicate listeners
    this.boundRequestPointerLock = this.requestPointerLock.bind(this);

    // Instructions for user
    this.showControls();
  }

  private removeEventListeners(): void {
    document.removeEventListener('keydown', this.onKeyDown.bind(this));
    document.removeEventListener('keyup', this.onKeyUp.bind(this));
    document.removeEventListener('mousedown', this.onMouseDown.bind(this));
    document.removeEventListener('mouseup', this.onMouseUp.bind(this));
    document.removeEventListener('click', this.requestPointerLock.bind(this));
    document.removeEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
    document.removeEventListener('mousemove', this.onMouseMove.bind(this));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isControlsEnabled) return; // Ignore input when dead
    this.keys.add(event.code.toLowerCase());

    // Handle special keys
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.playerState.isRunning = true;
    }

    if (event.code === 'Space' && this.playerState.isGrounded && !this.playerState.isJumping) {
      this.playerState.velocity.y = this.playerState.jumpForce;
      this.playerState.isJumping = true;
      this.playerState.isGrounded = false;
    }

    if (event.code === 'Escape') {
      // If in helicopter, exit helicopter first
      if (this.playerState.isInHelicopter && this.helicopterModel) {
        this.helicopterModel.exitHelicopter();
      } else {
        document.exitPointerLock();
      }
    }

    // Handle helicopter entry/exit with E key
    if (event.code === 'KeyE') {
      if (this.helicopterModel) {
        if (this.playerState.isInHelicopter) {
          // Exit helicopter
          this.helicopterModel.exitHelicopter();
        } else {
          // Try to enter helicopter if near one
          this.helicopterModel.tryEnterHelicopter();
        }
      }
    }

    // Helicopter-specific controls
    if (this.playerState.isInHelicopter) {
      // Toggle auto-hover with Space
      if (event.code === 'Space') {
        this.helicopterControls.autoHover = !this.helicopterControls.autoHover;
        console.log(`🚁 Auto-hover ${this.helicopterControls.autoHover ? 'enabled' : 'disabled'}`);
      }

      // Engine boost with Shift
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        this.helicopterControls.engineBoost = true;
      }

      // Toggle mouse control mode with Right Ctrl
      if (event.code === 'ControlRight') {
        this.helicopterMouseControlEnabled = !this.helicopterMouseControlEnabled;
        console.log(`🚁 Mouse control ${this.helicopterMouseControlEnabled ? 'enabled (affects controls)' : 'disabled (free orbital look)'}`);

        // Update HUD indicator
        if (this.hudSystem) {
          this.hudSystem.updateHelicopterMouseMode(this.helicopterMouseControlEnabled);
        }
      }
    }

    // Sandbag rotation controls (when not in helicopter)
    if (!this.playerState.isInHelicopter && this.currentWeaponMode === WeaponSlot.SANDBAG && this.sandbagSystem) {
      if (event.code === 'KeyR') {
        this.sandbagSystem.rotatePlacementPreview(-Math.PI / 8);
      } else if (event.code === 'KeyT') {
        this.sandbagSystem.rotatePlacementPreview(Math.PI / 8);
      }
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code.toLowerCase());

    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.playerState.isRunning = false;
      // Also disable helicopter engine boost
      if (this.playerState.isInHelicopter) {
        this.helicopterControls.engineBoost = false;
      }
    }
  }

  private boundRequestPointerLock?: () => void;

  private requestPointerLock(): void {
    // Don't lock if controls are disabled (dead/respawning)
    if (this.gameStarted && !this.isPointerLocked && this.isControlsEnabled) {
      document.body.requestPointerLock();
    }
  }

  setGameStarted(started: boolean): void {
    this.gameStarted = started;
    if (started && this.boundRequestPointerLock) {
      // Remove any existing listener first
      document.removeEventListener('click', this.boundRequestPointerLock);
      // Add click listener for pointer lock
      document.addEventListener('click', this.boundRequestPointerLock);
      console.log('🎮 Game started - click to enable mouse look');
    }
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === document.body;
    
    if (this.isPointerLocked) {
      console.log('Pointer locked - mouse look enabled');
    } else {
      console.log('Pointer lock released - click to re-enable mouse look');
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isPointerLocked) return;

    const sensitivity = 0.002;
    this.mouseMovement.x = event.movementX * sensitivity;
    this.mouseMovement.y = event.movementY * sensitivity;
  }

  private onMouseDown(event: MouseEvent): void {
    if (!this.isPointerLocked || !this.isControlsEnabled) return;

    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (event.button === 0 && this.grenadeSystem) {
          this.grenadeSystem.startAiming();
        }
        break;

      case WeaponSlot.MORTAR:
        // Mortar system disabled - to be reimplemented
        console.log('⚠️ Mortar system is temporarily disabled');
        break;

      case WeaponSlot.SANDBAG:
        if (event.button === 0 && this.sandbagSystem) {
          this.sandbagSystem.placeSandbag();
        }
        break;
    }
  }

  private onMouseUp(event: MouseEvent): void {
    if (!this.isPointerLocked || !this.isControlsEnabled) return;

    switch (this.currentWeaponMode) {
      case WeaponSlot.GRENADE:
        if (event.button === 0 && this.grenadeSystem) {
          this.grenadeSystem.throwGrenade();
        }
        break;

      case WeaponSlot.MORTAR:
        // Mortar system disabled - to be reimplemented
        break;
    }
  }

  private updateMovement(deltaTime: number): void {
    // Don't allow movement when in helicopter
    if (this.playerState.isInHelicopter) {
      this.playerState.velocity.set(0, 0, 0);
      return;
    }

    const moveVector = new THREE.Vector3();
    const baseSpeed = this.playerState.isRunning ? this.playerState.runSpeed : this.playerState.speed;
    const speedMultiplier = this.getMovementSpeedMultiplier();
    const currentSpeed = baseSpeed * speedMultiplier;

    // Calculate movement direction based on camera orientation
    if (this.keys.has('keyw')) {
      moveVector.z -= 1;
    }
    if (this.keys.has('keys')) {
      moveVector.z += 1;
    }
    if (this.keys.has('keya')) {
      moveVector.x -= 1;
    }
    if (this.keys.has('keyd')) {
      moveVector.x += 1;
    }

    // Normalize movement vector
    if (moveVector.length() > 0) {
      moveVector.normalize();
      
      // Apply camera rotation to movement
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Keep movement horizontal
      cameraDirection.normalize();
      
      const cameraRight = new THREE.Vector3();
      cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
      
      const worldMoveVector = new THREE.Vector3();
      worldMoveVector.addScaledVector(cameraDirection, -moveVector.z);
      worldMoveVector.addScaledVector(cameraRight, moveVector.x);
      
      // Apply movement with acceleration (only horizontal components)
      const acceleration = currentSpeed * 5; // Acceleration factor
      const targetVelocity = worldMoveVector.multiplyScalar(currentSpeed);
      const horizontalVelocity = new THREE.Vector3(this.playerState.velocity.x, 0, this.playerState.velocity.z);
      
      horizontalVelocity.lerp(targetVelocity, Math.min(deltaTime * acceleration, 1));
      
      // Update only horizontal components, preserve Y velocity for jumping/gravity
      this.playerState.velocity.x = horizontalVelocity.x;
      this.playerState.velocity.z = horizontalVelocity.z;
    } else {
      // Apply friction when not moving (only horizontal components)
      const frictionFactor = Math.max(0, 1 - deltaTime * 8);
      this.playerState.velocity.x *= frictionFactor;
      this.playerState.velocity.z *= frictionFactor;
    }

    // Apply gravity
    this.playerState.velocity.y += this.playerState.gravity * deltaTime;

    // Update position
    const movement = this.playerState.velocity.clone().multiplyScalar(deltaTime);
    const newPosition = this.playerState.position.clone().add(movement);

    // Check sandbag collision before applying movement
    if (this.sandbagSystem && this.sandbagSystem.checkCollision(newPosition, 0.5)) {
      // Try to slide along the obstacle
      const slideX = this.playerState.position.clone();
      slideX.x = newPosition.x;
      const slideZ = this.playerState.position.clone();
      slideZ.z = newPosition.z;

      // Try moving only in X direction
      if (!this.sandbagSystem.checkCollision(slideX, 0.5)) {
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.z = 0;
      }
      // Try moving only in Z direction
      else if (!this.sandbagSystem.checkCollision(slideZ, 0.5)) {
        newPosition.x = this.playerState.position.x;
        this.playerState.velocity.x = 0;
      }
      // Can't move at all - stop completely
      else {
        newPosition.x = this.playerState.position.x;
        newPosition.z = this.playerState.position.z;
        this.playerState.velocity.x = 0;
        this.playerState.velocity.z = 0;
      }
    }

    // No bounds clamping for infinite world
    // Remove the old terrain bounds limitation

    // Check ground collision using ImprovedChunkManager if available, otherwise use flat baseline
    let groundHeight = 2; // Default player height above ground (flat world fallback)
    if (this.chunkManager) {
      const effectiveHeight = this.chunkManager.getEffectiveHeightAt(newPosition.x, newPosition.z);
      groundHeight = effectiveHeight + 2;
    }

    if (newPosition.y <= groundHeight) {
      // Player is on or below ground
      newPosition.y = groundHeight;
      this.playerState.velocity.y = 0;
      this.playerState.isGrounded = true;
      this.playerState.isJumping = false;
    } else {
      // Player is in the air
      this.playerState.isGrounded = false;
    }

    this.playerState.position.copy(newPosition);
  }

  private updateHelicopterControls(deltaTime: number): void {
    // Update helicopter controls based on keyboard input

    // Collective (W/S) - vertical thrust
    if (this.keys.has('keyw')) {
      this.helicopterControls.collective = Math.min(1.0, this.helicopterControls.collective + 2.0 * deltaTime);
    } else if (this.keys.has('keys')) {
      this.helicopterControls.collective = Math.max(0.0, this.helicopterControls.collective - 2.0 * deltaTime);
    } else {
      // Auto-stabilize collective for hover only when enabled
      if (this.helicopterControls.autoHover) {
        this.helicopterControls.collective = THREE.MathUtils.lerp(this.helicopterControls.collective, 0.4, deltaTime * 2.0);
      }
      // When auto-hover is off, collective decays naturally to allow descent
    }

    // Yaw (A/D) - tail rotor, turning
    if (this.keys.has('keya')) {
      this.helicopterControls.yaw = Math.min(1.0, this.helicopterControls.yaw + 3.0 * deltaTime); // Turn left
    } else if (this.keys.has('keyd')) {
      this.helicopterControls.yaw = Math.max(-1.0, this.helicopterControls.yaw - 3.0 * deltaTime); // Turn right
    } else {
      // Return to center
      this.helicopterControls.yaw = THREE.MathUtils.lerp(this.helicopterControls.yaw, 0, deltaTime * 8.0);
    }

    // Cyclic Pitch (Arrow Up/Down) - forward/backward movement
    if (this.keys.has('arrowup')) {
      this.helicopterControls.cyclicPitch = Math.min(1.0, this.helicopterControls.cyclicPitch + 2.0 * deltaTime); // Forward
    } else if (this.keys.has('arrowdown')) {
      this.helicopterControls.cyclicPitch = Math.max(-1.0, this.helicopterControls.cyclicPitch - 2.0 * deltaTime); // Backward
    } else {
      // Auto-level pitch
      this.helicopterControls.cyclicPitch = THREE.MathUtils.lerp(this.helicopterControls.cyclicPitch, 0, deltaTime * 4.0);
    }

    // Cyclic Roll (Arrow Left/Right) - left/right banking
    if (this.keys.has('arrowleft')) {
      this.helicopterControls.cyclicRoll = Math.max(-1.0, this.helicopterControls.cyclicRoll - 2.0 * deltaTime);
    } else if (this.keys.has('arrowright')) {
      this.helicopterControls.cyclicRoll = Math.min(1.0, this.helicopterControls.cyclicRoll + 2.0 * deltaTime);
    } else {
      // Auto-level roll
      this.helicopterControls.cyclicRoll = THREE.MathUtils.lerp(this.helicopterControls.cyclicRoll, 0, deltaTime * 4.0);
    }

    // Add mouse control input when enabled
    if (this.helicopterMouseControlEnabled && this.isPointerLocked) {
      const mouseSensitivity = 0.5;

      // Mouse X controls roll (banking)
      this.helicopterControls.cyclicRoll = THREE.MathUtils.clamp(
        this.helicopterControls.cyclicRoll + this.mouseMovement.x * mouseSensitivity,
        -1.0, 1.0
      );

      // Mouse Y controls pitch (forward/backward) - inverted for intuitive control
      this.helicopterControls.cyclicPitch = THREE.MathUtils.clamp(
        this.helicopterControls.cyclicPitch - this.mouseMovement.y * mouseSensitivity,
        -1.0, 1.0
      );

      // Clear mouse movement since we've used it for controls
      this.mouseMovement.x = 0;
      this.mouseMovement.y = 0;
    }

    // Send controls to helicopter model
    if (this.helicopterModel && this.playerState.helicopterId) {
      this.helicopterModel.setHelicopterControls(this.playerState.helicopterId, this.helicopterControls);
    }

    // Update helicopter instruments HUD
    if (this.hudSystem) {
      this.hudSystem.updateHelicopterInstruments(
        this.helicopterControls.collective,
        this.helicopterControls.collective * 0.8 + 0.2, // Simple RPM simulation based on collective
        this.helicopterControls.autoHover,
        this.helicopterControls.engineBoost
      );
    }
  }

  private updateCamera(): void {
    if (this.playerState.isInHelicopter) {
      this.updateHelicopterCamera();
    } else {
      this.updateFirstPersonCamera();
    }
  }

  private updateFirstPersonCamera(): void {
    // Update camera rotation from mouse movement
    if (this.isPointerLocked) {
      this.yaw -= this.mouseMovement.x;
      this.pitch -= this.mouseMovement.y;
      this.pitch = MathUtils.clamp(this.pitch, -this.maxPitch, this.maxPitch);

      // Reset mouse movement
      this.mouseMovement.x = 0;
      this.mouseMovement.y = 0;
    }

    // Apply rotation to camera
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Update camera position
    this.camera.position.copy(this.playerState.position);
  }

  private updateHelicopterCamera(): void {
    // Get helicopter position and rotation
    const helicopterId = this.playerState.helicopterId;
    if (!helicopterId || !this.helicopterModel) {
      // Fallback to first-person if helicopter not found
      this.updateFirstPersonCamera();
      return;
    }

    const helicopterPosition = this.helicopterModel.getHelicopterPosition(helicopterId);
    const helicopterQuaternion = this.helicopterModel.getHelicopterQuaternion(helicopterId);
    if (!helicopterPosition || !helicopterQuaternion) {
      // Fallback to first-person if helicopter data not found
      this.updateFirstPersonCamera();
      return;
    }

    const distanceBack = this.helicopterCameraDistance;
    const heightAbove = this.helicopterCameraHeight;

    if (!this.helicopterMouseControlEnabled && this.isPointerLocked) {
      // Free orbital look mode - mouse controls camera orbital position around helicopter
      const mouseSensitivity = 0.01; // Much higher sensitivity for responsive free look

      this.yaw -= this.mouseMovement.x * mouseSensitivity;
      this.pitch -= this.mouseMovement.y * mouseSensitivity;

      // Allow full 360-degree horizontal rotation
      // Clamp vertical rotation to prevent flipping (slightly above/below helicopter)
      this.pitch = MathUtils.clamp(this.pitch, -Math.PI * 0.4, Math.PI * 0.4); // -72° to +72° vertical range

      // Reset mouse movement
      this.mouseMovement.x = 0;
      this.mouseMovement.y = 0;

      // Spherical coordinate orbital camera positioning
      const radius = distanceBack;
      const x = radius * Math.cos(this.pitch) * Math.sin(this.yaw);
      const y = radius * Math.sin(this.pitch) + heightAbove; // Add base height offset
      const z = radius * Math.cos(this.pitch) * Math.cos(this.yaw);

      // Position camera in orbit around helicopter
      const cameraPosition = new THREE.Vector3(x, y, z);
      cameraPosition.add(helicopterPosition);

      this.camera.position.copy(cameraPosition);

      // Always look at helicopter center regardless of orbital position
      const lookTarget = helicopterPosition.clone();
      lookTarget.y += 2; // Look at helicopter body center
      this.camera.lookAt(lookTarget);
    } else {
      // Following mode - camera follows behind helicopter based on its rotation
      // Helicopter model components are rotated 90 degrees, so forward is actually -X in local space
      const helicopterForward = new THREE.Vector3(-1, 0, 0); // Local forward direction (negative X)
      helicopterForward.applyQuaternion(helicopterQuaternion); // Transform to world space

      // Camera position: behind helicopter (opposite of forward direction)
      const cameraPosition = helicopterPosition.clone();
      cameraPosition.add(helicopterForward.clone().multiplyScalar(-distanceBack)); // Behind
      cameraPosition.y += heightAbove;

      this.camera.position.copy(cameraPosition);

      // Look at helicopter center
      const lookTarget = helicopterPosition.clone();
      lookTarget.y += 2;
      this.camera.lookAt(lookTarget);

      // When in following mode, let camera naturally follow helicopter without forced reset
    }
  }

  // Apply recoil to camera by adjusting internal yaw/pitch so effect persists
  applyRecoil(pitchDeltaRad: number, yawDeltaRad: number): void {
    this.pitch = MathUtils.clamp(this.pitch + pitchDeltaRad, -this.maxPitch, this.maxPitch);
    this.yaw += yawDeltaRad;
  }

  setPosition(position: THREE.Vector3): void {
    this.playerState.position.copy(position);
    this.camera.position.copy(position);
    // Reset velocity to prevent carrying momentum
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isGrounded = false;
    console.log(`Player teleported to ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);
  }

  // Update position without affecting camera (for helicopter physics)
  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerState.position.copy(position);
    // Don't update camera position - let helicopter camera handle it
  }

  // Disable controls (for death)
  disableControls(): void {
    this.isControlsEnabled = false;
    this.keys.clear();
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;

    // Unlock mouse cursor for respawn UI
    if (document.pointerLockElement === document.body) {
      document.exitPointerLock();
    }
  }

  // Enable controls (for respawn)
  enableControls(): void {
    this.isControlsEnabled = true;

    // Re-lock mouse cursor after respawn
    if (this.gameStarted && !document.pointerLockElement) {
      // Small delay to avoid conflict with UI interaction
      setTimeout(() => {
        document.body.requestPointerLock();
      }, 100);
    }
  }

  private showControls(): void {
    console.log(`
🎮 CONTROLS:
WASD - Move / Helicopter Controls (W/S = Collective, A/D = Yaw)
Arrow Keys - Helicopter Cyclic (↑↓ = Pitch, ←→ = Roll)
Shift - Run / Engine Boost (in helicopter)
Space - Jump / Toggle Auto-Hover (in helicopter)
Right Ctrl - Toggle Mouse Control Mode (helicopter: control vs free look)
E - Enter/Exit Helicopter
Mouse - Look around (click to enable pointer lock)
Escape - Release pointer lock / Exit helicopter
    `);
  }

  private handleWeaponSlotChange(slot: WeaponSlot): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.setWeaponVisibility(false);
    }
    if (this.grenadeSystem) {
      this.grenadeSystem.showGrenadeInHand(false);
    }
    // Mortar system disabled - to be reimplemented
    // if (this.mortarSystem && this.mortarSystem.isCurrentlyDeployed()) {
    //   this.mortarSystem.undeployMortar();
    // }
    if (this.sandbagSystem) {
      this.sandbagSystem.showPlacementPreview(false);
    }

    switch(slot) {
      case WeaponSlot.PRIMARY:
        if (this.firstPersonWeapon) {
          this.firstPersonWeapon.setWeaponVisibility(true);
        }
        this.isInMortarMode = false;
        break;
      case WeaponSlot.MORTAR:
        // Mortar system disabled - to be reimplemented
        console.log('⚠️ Mortar system is temporarily disabled and will be reimplemented');
        this.isInMortarMode = false;
        break;
      case WeaponSlot.GRENADE:
        if (this.grenadeSystem) {
          this.grenadeSystem.showGrenadeInHand(true);
        }
        this.isInMortarMode = false;
        break;
      case WeaponSlot.SANDBAG:
        if (this.sandbagSystem) {
          this.sandbagSystem.showPlacementPreview(true);
        }
        this.isInMortarMode = false;
        break;
    }

    this.currentWeaponMode = slot;
  }

  private getMovementSpeedMultiplier(): number {
    // Mortar system disabled - to be reimplemented
    if (false) { // this.isInMortarMode && this.mortarSystem && this.mortarSystem.isCurrentlyDeployed()
      return 0.0;
    }
    return 1.0;
  }

  getPosition(): THREE.Vector3 {
    return this.playerState.position.clone();
  }

  getVelocity(): THREE.Vector3 {
    return this.playerState.velocity.clone();
  }
  
  isMoving(): boolean {
    return this.playerState.velocity.length() > 0.1;
  }

  teleport(position: THREE.Vector3): void {
    this.playerState.position.copy(position);
    this.playerState.velocity.set(0, 0, 0);
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setHelicopterModel(helicopterModel: any): void {
    this.helicopterModel = helicopterModel;
  }

  setFirstPersonWeapon(firstPersonWeapon: any): void {
    this.firstPersonWeapon = firstPersonWeapon;
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem;
  }

  setSandboxRenderer(sandboxRenderer: any): void {
    this.sandboxRenderer = sandboxRenderer;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setGrenadeSystem(grenadeSystem: GrenadeSystem): void {
    this.grenadeSystem = grenadeSystem;
  }

  setMortarSystem(mortarSystem: MortarSystem): void {
    this.mortarSystem = mortarSystem;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  equipWeapon(): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.showWeapon();
      this.firstPersonWeapon.setFireingEnabled(true);
    }
    if (this.sandboxRenderer) {
      this.sandboxRenderer.showCrosshairAgain();
    }
  }

  unequipWeapon(): void {
    if (this.firstPersonWeapon) {
      this.firstPersonWeapon.hideWeapon();
      this.firstPersonWeapon.setFireingEnabled(false);
    }
    if (this.sandboxRenderer) {
      this.sandboxRenderer.hideCrosshair();
    }
  }

  private getSpawnPosition(): THREE.Vector3 {
    if (!this.gameModeManager) {
      return new THREE.Vector3(0, 5, -50); // Default fallback
    }

    const config = this.gameModeManager.getCurrentConfig();

    // Find the main US HQ
    const usMainHQ = config.zones.find(z =>
      z.isHomeBase &&
      z.owner === Faction.US &&
      (z.id.includes('main') || z.id === 'us_base')
    );

    if (usMainHQ) {
      // Spawn at main HQ with player height
      const spawnPos = usMainHQ.position.clone();
      spawnPos.y = 5; // Player height
      console.log(`🎯 Spawning at US main HQ: ${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}`);
      return spawnPos;
    }

    // Fallback to default
    console.warn('Could not find US main HQ, using default spawn');
    return new THREE.Vector3(0, 5, -50);
  }

  // Helicopter state management
  enterHelicopter(helicopterId: string, helicopterPosition: THREE.Vector3): void {
    console.log(`🚁 ⚡ ENTERING HELICOPTER: ${helicopterId}`);
    this.playerState.isInHelicopter = true;
    this.playerState.helicopterId = helicopterId;

    // Teleport player to helicopter position
    this.setPosition(helicopterPosition);

    // Stop all movement
    this.playerState.velocity.set(0, 0, 0);
    this.playerState.isRunning = false;
    this.keys.clear();

    // Unequip weapon when entering helicopter
    this.unequipWeapon();

    // Show helicopter mouse control indicator and instruments
    if (this.hudSystem) {
      this.hudSystem.showHelicopterMouseIndicator();
      this.hudSystem.updateHelicopterMouseMode(this.helicopterMouseControlEnabled);
      this.hudSystem.showHelicopterInstruments();
    }

    console.log(`🚁 Player entered helicopter at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    console.log(`🚁 📹 CAMERA MODE: Switched to helicopter camera (flight sim style)`);
  }

  exitHelicopter(exitPosition: THREE.Vector3): void {
    const helicopterId = this.playerState.helicopterId;
    console.log(`🚁 ⚡ EXITING HELICOPTER: ${helicopterId}`);

    this.playerState.isInHelicopter = false;
    this.playerState.helicopterId = null;

    // Teleport player to exit position
    this.setPosition(exitPosition);

    // Equip weapon when exiting helicopter
    this.equipWeapon();

    // Hide helicopter mouse control indicator and instruments
    if (this.hudSystem) {
      this.hudSystem.hideHelicopterMouseIndicator();
      this.hudSystem.hideHelicopterInstruments();
    }

    console.log(`🚁 Player exited helicopter to position (${exitPosition.x.toFixed(1)}, ${exitPosition.y.toFixed(1)}, ${exitPosition.z.toFixed(1)})`);
    console.log(`🚁 📹 CAMERA MODE: Switched to first-person camera`);
  }

  isInHelicopter(): boolean {
    return this.playerState.isInHelicopter;
  }

  getHelicopterId(): string | null {
    return this.playerState.helicopterId;
  }
}