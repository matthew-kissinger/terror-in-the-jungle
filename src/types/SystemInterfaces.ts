/**
 * System Interface Definitions
 * Replaces `any` types with proper typed interfaces for system dependencies
 */

import * as THREE from 'three';
import { Combatant, Faction, Squad } from '../systems/combat/types';
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
 * Impact Effects Pool interface - blood/debris effects on hit
 */
export interface IImpactEffectsPool {
  spawn(position: THREE.Vector3): void;
  update(deltaTime: number): void;
  dispose(): void;
}

/**
 * Explosion Effects Pool interface - explosion visual effects
 */
export interface IExplosionEffectsPool {
  spawn(position: THREE.Vector3): void;
  update(deltaTime: number): void;
  dispose(): void;
}

/**
 * Combatant Combat interface - handles NPC combat behavior
 */
export interface ICombatantCombat {
  hitDetection: IHitDetection;
  setSandbagSystem(system: ISandbagSystem): void;
}

/**
 * Combatant AI interface - handles NPC AI behavior
 */
export interface ICombatantAI {
  setSandbagSystem(system: ISandbagSystem): void;
  setZoneManager(manager: IZoneManager): void;
  setSmokeCloudSystem(system: ISmokeCloudSystem): void;
}

/**
 * Squad Manager interface - manages NPC squads
 */
export interface ISquadManager {
  setInfluenceMap(map: IInfluenceMapSystem): void;
  getSquad(squadId: string): Squad | undefined;
  getAllSquads(): Map<string, Squad>;
}

/**
 * Influence Map System interface - strategic AI targeting
 */
export interface IInfluenceMapSystem {
  update(deltaTime: number): void;
}

/**
 * Smoke Cloud System interface - smoke grenade effects
 */
export interface ISmokeCloudSystem {
  isLineBlocked(start: THREE.Vector3, end: THREE.Vector3): boolean;
  update(deltaTime: number): void;
}

/**
 * HUD System interface - handles all UI display and feedback
 */
export interface IHUDSystem {
  addKill(isHeadshot?: boolean): void;
  addDeath(): void;
  addZoneCapture(): void;
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
  toggleScoreboard(visible: boolean): void;
  updateTickets(usTickets: number, opforTickets: number): void;
  showMessage(message: string, duration?: number): void;
  updateAmmoDisplay(magazine: number, reserve: number): void;
  showInteractionPrompt(text: string): void;
  hideInteractionPrompt(): void;
  spawnDamageNumber(worldPos: THREE.Vector3, damage: number, isHeadshot?: boolean, isKill?: boolean): void;
  showWeaponSwitch(weaponName: string, weaponIcon: string, ammo: string): void;
}

/**
 * Player Health System interface
 */
export interface IPlayerHealthSystem {
  takeDamage(amount: number, source?: string): boolean;
  heal(amount: number): void;
  isAlive(): boolean;
  voluntaryRespawn(): void;
  applySpawnProtection(durationSeconds: number): void;
}

/**
 * Grenade System interface
 */
export interface IGrenadeSystem {
  isCurrentlyAiming(): boolean;
  updateArc(): void;
  getAimingState(): {
    isAiming: boolean;
    power: number;
    estimatedDistance: number;
  };
  startAiming(): void;
  throwGrenade(): void;
  showGrenadeInHand(show: boolean): void;
}

/**
 * Player Controller interface - main player control system
 */
export interface IPlayerController {
  // Movement / state
  setPosition(position: THREE.Vector3): void;
  updatePlayerPosition(position: THREE.Vector3): void;
  disableControls(): void;
  enableControls(): void;
  setPointerLockEnabled(enabled: boolean): void;
  setGameStarted(started: boolean): void;

  // Camera / feedback
  applyRecoil(pitchDeltaRad: number, yawDeltaRad: number): void;
  applyScreenShake(intensity: number, duration?: number): void;
  applyDamageShake(damageAmount: number): void;
  applyExplosionShake(position: THREE.Vector3, magnitude: number): void;
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
  setSandboxRenderer(sandboxRenderer: ISandboxRenderer): void;
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
 * Combatant System interface - NPC management
 */
export interface ICombatantSystem {
  getCombatants(): Map<string, any>;
  getCombatantAt(id: string): any;
  getClosestEnemy(position: THREE.Vector3, faction: string): any;

  // Internal subsystems exposed for system wiring
  readonly impactEffectsPool: IImpactEffectsPool;
  readonly explosionEffectsPool: IExplosionEffectsPool;
  readonly combatantCombat: ICombatantCombat;
  readonly combatantAI: ICombatantAI;
  readonly squadManager: ISquadManager;
  readonly combatantRenderer: ICombatantRenderer;
  readonly combatants: Map<string, any>;

  // Player squad controls
  shouldCreatePlayerSquad: boolean;
  playerSquadId?: string;

  // Internal properties for influence map and sandbag system wiring
  influenceMap?: IInfluenceMapSystem;
  sandbagSystem?: ISandbagSystem;
}

/**
 * Zone Manager interface
 */
export interface IZoneManager {
  getAllZones(): any[];
  getZoneAtPosition(position: THREE.Vector3): any;
}

/**
 * Ticket System interface - game state and scoring
 */
export interface ITicketSystem {
  getTickets(faction: string): number;
  getMatchTimeRemaining(): number;
  getGameState(): string;
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
 * Inventory Manager interface
 */
export interface IInventoryManager {
  getCurrentWeapon(): any;
  getAmmo(slot: number): number;
  switchWeapon(slot: number): void;
}

/**
 * Sandbox Renderer interface - main rendering system
 */
export interface ISandboxRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  postProcessing?: any;
  fog?: THREE.FogExp2;
  ambientLight?: THREE.AmbientLight;
  moonLight?: THREE.DirectionalLight;
  jungleLight?: THREE.HemisphereLight;
  getPerformanceStats(): any;
  showSpawnLoadingIndicator(): void;
  hideSpawnLoadingIndicator(): void;
  showRenderer(): void;
  showCrosshair(): void;
  onWindowResize(): void;
}

/**
 * Sandbag System interface
 */
export interface ISandbagSystem {
  placeSandbag(position: THREE.Vector3, rotation: number): void;
  getSandbags(): any[];
}

/**
 * Suppression System interface
 */
export interface IPlayerSuppressionSystem {
  applySuppression(intensity: number): void;
  clearSuppression(): void;
}

/**
 * Combatant Renderer interface
 */
export interface ICombatantRenderer {
  setPlayerSquadId(squadId: string | undefined): void;
  updateBillboards(combatants: Map<string, Combatant>, playerPosition: THREE.Vector3): void;
}

/**
 * Hit Detection interface
 */
export interface IHitDetection {
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): any;
}

/**
 * Camera Shake System interface
 */
export interface ICameraShakeSystem {
  addShake(magnitude: number, duration: number): void;
  update(deltaTime: number): void;
  apply(camera: THREE.Camera): void;
}

/**
 * Helicopter Dropship interface
 */
export interface IHelicopterDropship {
  position: THREE.Vector3;
  isDocked: boolean;
  board(player: any): void;
  release(player: any): void;
}

/**
 * Game Mode Manager interface
 */
export interface IGameModeManager {
  getCurrentGameMode(): string;
  startMatch(): void;
  endMatch(): void;
}
