/**
 * System Interface Definitions
 * Only interfaces actively imported by other modules belong here.
 */

import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import type { CameraShakeSystem } from '../systems/effects/CameraShakeSystem';
import type { ImprovedChunkManager } from '../systems/terrain/ImprovedChunkManager';
import type { GameModeManager } from '../systems/world/GameModeManager';
import type { HelicopterModel } from '../systems/helicopter/HelicopterModel';
import type { GrenadeSystem } from '../systems/weapons/GrenadeSystem';
import type { MortarSystem } from '../systems/weapons/MortarSystem';
import type { SandbagSystem } from '../systems/weapons/SandbagSystem';
import type { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';
import type { RallyPointSystem } from '../systems/combat/RallyPointSystem';
import type { HUDSystem } from '../ui/hud/HUDSystem';
import type { InventoryManager } from '../systems/player/InventoryManager';
import type { FirstPersonWeapon } from '../systems/player/FirstPersonWeapon';
import type { PlayerController } from '../systems/player/PlayerController';

/**
 * HUD System interface - handles all UI display and feedback
 */
export interface IHUDSystem {
  addKill(isHeadshot?: boolean): void;
  addDeath(): void;
  addZoneCapture(zoneName?: string, isLost?: boolean): void;
  addAssist(): void;
  addCaptureAssist(): void;
  addKillToFeed(killerName: string, killerFaction: Faction, victimName: string, victimFaction: Faction, isHeadshot?: boolean, weaponType?: string): void;
  showHitMarker(type: 'hit' | 'kill' | 'headshot'): void;
  updateGrenadePower(power: number, distance?: number, cookingTime?: number): void;
  updateElevation(elevation: number): void;
  updateHelicopterMouseMode(enabled: boolean): void;
  showGrenadePowerMeter(): void;
  hideGrenadePowerMeter(): void;
  updateHelicopterInstruments(collective: number, rpm: number, autoHover: boolean, engineBoost: boolean): void;
  showHelicopterMouseIndicator(): void;
  hideHelicopterMouseIndicator(): void;
  showHelicopterInstruments(): void;
  hideHelicopterInstruments(): void;
  spawnScorePopup(type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist', points: number, multiplier?: number): void;
  startMatch(): void;
  setPhase(phase: 'menu' | 'loading' | 'playing' | 'paused' | 'ended'): void;
  setVehicle(vehicle: 'infantry' | 'helicopter'): void;
  setADS(ads: boolean): void;
  toggleScoreboard(visible: boolean): void;
  toggleScoreboardVisibility(): void;
  updateTickets(usTickets: number, opforTickets: number): void;
  showMessage(message: string, duration?: number): void;
  updateAmmoDisplay(magazine: number, reserve: number): void;
  showInteractionPrompt(text: string): void;
  hideInteractionPrompt(): void;
  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot?: boolean, isKill?: boolean): void;
  showWeaponSwitch(weaponName: string, weaponIcon: string, ammo: string): void;
  setWeaponSelectCallback(callback: (slotIndex: number) => void): void;
  setActiveWeaponSlot(slot: number): void;
  showMortarIndicator(): void;
  hideMortarIndicator(): void;
  updateMortarState(pitch: number, yaw: number, power: number, isAiming: boolean): void;
}

/**
 * Player Controller interface - main player control system
 */
export interface IPlayerController {
  // Lifecycle
  init(): Promise<void>;
  update(deltaTime: number): void;
  dispose(): void;

  // Movement / state
  setPosition(position: THREE.Vector3, reason?: string): void;
  updatePlayerPosition(position: THREE.Vector3): void;
  disableControls(): void;
  enableControls(): void;
  setPointerLockEnabled(enabled: boolean): void;
  setGameStarted(started: boolean): void;

  // Camera / feedback
  applyRecoil(pitchDeltaRad: number, yawDeltaRad: number): void;
  applyScreenShake(intensity: number, duration?: number): void;
  applyDamageShake(damageAmount: number): void;
  applyExplosionShake(explosionPos: THREE.Vector3, maxRadius: number): void;
  applyRecoilShake(): void;
  getPosition(target?: THREE.Vector3): THREE.Vector3;
  getVelocity(target?: THREE.Vector3): THREE.Vector3;
  getCamera(): THREE.PerspectiveCamera;
  isMoving(): boolean;
  teleport(position: THREE.Vector3): void;

  // Weapon handling
  equipWeapon(): void;
  unequipWeapon(): void;

  // Helicopter lifecycle
  enterHelicopter(helicopterId: string, helicopterPosition: THREE.Vector3): void;
  exitHelicopter(exitPosition: THREE.Vector3): void;
  isInHelicopter(): boolean;
  getHelicopterId(): string | null;

  // Dependency setters
  setChunkManager(chunkManager: ImprovedChunkManager): void;
  setGameModeManager(gameModeManager: GameModeManager): void;
  setHelicopterModel(helicopterModel: HelicopterModel): void;
  setFirstPersonWeapon(firstPersonWeapon: FirstPersonWeapon): void;
  setHUDSystem(hudSystem: HUDSystem): void;
  setRenderer(renderer: IGameRenderer): void;
  setInventoryManager(inventoryManager: InventoryManager): void;
  setGrenadeSystem(grenadeSystem: GrenadeSystem): void;
  setMortarSystem(mortarSystem: MortarSystem): void;
  setSandbagSystem(sandbagSystem: SandbagSystem): void;
  setCameraShakeSystem(cameraShakeSystem: CameraShakeSystem): void;
  setRallyPointSystem(rallyPointSystem: RallyPointSystem): void;
  setFootstepAudioSystem(footstepAudioSystem: FootstepAudioSystem): void;
  setPlayerSquadId(squadId: string): void;
}

/**
 * Helicopter Model interface
 */
export interface IHelicopterModel {
  setTerrainManager(manager: any): void;
  setHelipadSystem(system: any): void;
  setPlayerController(controller: IPlayerController): void;
  setHUDSystem(system: IHUDSystem): void;
  setAudioListener(listener: THREE.AudioListener): void;
  exitHelicopter(): void;
  tryEnterHelicopter(): void;
  getHelicopterPositionTo(id: string, target: THREE.Vector3): boolean;
  getHelicopterQuaternionTo(id: string, target: THREE.Quaternion): boolean;
  setHelicopterControls(helicopterId: string, controls: any): void;
}

/**
 * First Person Weapon interface
 */
export interface IFirstPersonWeapon {
  setPlayerController(controller: PlayerController): void;
  setCombatantSystem(system: any): void;
  setHUDSystem(system: IHUDSystem): void;
  setZoneManager(system: any): void;
  setInventoryManager(system: any): void;
  setAudioManager(manager: any): void;
  renderWeapon(renderer: THREE.WebGLRenderer): void;
  enable(): void;
  disable(): void;
}

/**
 * Chunk Manager interface - terrain queries and management
 */
export interface IChunkManager {
  getTerrainHeightAt(x: number, z: number): number;
  getChunkAt(worldPos: THREE.Vector3): any;
  isChunkLoaded(x: number, z: number): boolean;
}

/**
 * Audio Manager interface
 */
export interface IAudioManager {
  getListener(): THREE.AudioListener;
  play(soundName: string, position?: THREE.Vector3, volume?: number): void;
  playWeaponSwitchSound(): void;
}

/**
 * Ammo Manager interface
 */
export interface IAmmoManager {
  getState(): {
    currentMagazine: number;
    reserveAmmo: number;
  };
}

/**
 * Flashbang Screen Effect interface
 */
export interface IFlashbangScreenEffect {
  triggerFlash(
    flashPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    playerLookDirection: THREE.Vector3
  ): void;
}

/**
 * Game Renderer interface - main rendering system
 */
export interface IGameRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  postProcessing?: any;
  fog?: THREE.FogExp2;
  ambientLight?: THREE.AmbientLight;
  moonLight?: THREE.DirectionalLight;
  hemisphereLight?: THREE.HemisphereLight;
  getPerformanceStats(): any;
  showSpawnLoadingIndicator(): void;
  hideSpawnLoadingIndicator(): void;
  showRenderer(): void;
  showCrosshair(): void;
  onWindowResize(): void;
}
