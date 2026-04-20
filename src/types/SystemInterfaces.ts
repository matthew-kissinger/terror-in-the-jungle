/**
 * System Interface Definitions — FENCED CONTRACTS
 *
 * Every exported interface in this file is a contract between subsystems.
 * Internals may churn freely; these interfaces may not change without a
 * `[interface-change]` PR and explicit human approval.
 *
 * See `docs/INTERFACE_FENCE.md` for rules, procedure, and rationale.
 *
 * Last fence review: 2026-04-16 (F1+F2 foundation pass).
 * Only interfaces actively imported by other modules belong here.
 */

import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import type { CameraShakeSystem } from '../systems/effects/CameraShakeSystem';
import type { GameModeManager } from '../systems/world/GameModeManager';
import type { HelicopterModel } from '../systems/helicopter/HelicopterModel';
import type { GrenadeSystem } from '../systems/weapons/GrenadeSystem';
import type { MortarSystem } from '../systems/weapons/MortarSystem';
import type { SandbagSystem } from '../systems/weapons/SandbagSystem';
import type { FootstepAudioSystem } from '../systems/audio/FootstepAudioSystem';
import type { RallyPointSystem } from '../systems/combat/RallyPointSystem';
import type { HUDSystem } from '../ui/hud/HUDSystem';
import type { FixedWingControlPhase } from '../systems/vehicle/FixedWingControlLaw';
import type { FixedWingOperationState } from '../systems/vehicle/FixedWingOperations';
import type { InventoryManager } from '../systems/player/InventoryManager';
import type { FirstPersonWeapon } from '../systems/player/FirstPersonWeapon';
import type { PlayerController } from '../systems/player/PlayerController';
import type { HelipadSystem } from '../systems/helicopter/HelipadSystem';
import type { AircraftRole } from '../systems/helicopter/AircraftConfigs';
import type { HelicopterControls } from '../systems/helicopter/HelicopterPhysics';
import type { CombatantSystem } from '../systems/combat/CombatantSystem';
import type { ZoneManager } from '../systems/world/ZoneManager';
import type {
  ActorMode,
  GameplayInputMode,
  GameplayOverlay,
  InteractionContext,
  VehicleUIContext,
} from '../ui/layout/types';

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
  updateHelicopterFlightData(airspeed: number, heading: number, verticalSpeed: number): void;
  setHelicopterAircraftRole(role: import('../systems/helicopter/AircraftConfigs').AircraftRole): void;
  setHelicopterWeaponStatus(name: string, ammo: number): void;
  setHelicopterDamage(healthPercent: number): void;
  showHelicopterMouseIndicator(): void;
  hideHelicopterMouseIndicator(): void;
  showHelicopterInstruments(): void;
  hideHelicopterInstruments(): void;
  spawnScorePopup(type: 'capture' | 'defend' | 'secured' | 'kill' | 'headshot' | 'assist', points: number, multiplier?: number): void;
  startMatch(): void;
  setPhase(phase: 'menu' | 'loading' | 'playing' | 'paused' | 'ended'): void;
  setVehicle(vehicle: ActorMode): void;
  setADS(ads: boolean): void;
  setOverlay(overlay: GameplayOverlay): void;
  setInputMode(inputMode: GameplayInputMode): void;
  setInteractionContext(context: InteractionContext | null): void;
  setVehicleContext(context: VehicleUIContext | null): void;
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
  showSquadDeployPrompt(): void;
  hideSquadDeployPrompt(): void;
  showFixedWingInstruments?(): void;
  hideFixedWingInstruments?(): void;
  updateFixedWingFlightData?(airspeed: number, heading: number, verticalSpeed: number): void;
  updateFixedWingThrottle?(throttle: number): void;
  setFixedWingStallWarning?(stalled: boolean): void;
  setFixedWingStallSpeed?(speed: number): void;
  setFixedWingFlightAssist?(active: boolean): void;
  setFixedWingAutoLevel?(active: boolean): void;
  setFixedWingPhase?(phase: FixedWingControlPhase): void;
  setFixedWingOperationState?(state: FixedWingOperationState): void;
  showFixedWingMouseIndicator?(): void;
  hideFixedWingMouseIndicator?(): void;
  updateFixedWingMouseMode?(controlMode: boolean): void;
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
  getIsTouchMode(): boolean;
  setGameStarted(started: boolean): void;
  setPlayerFaction(faction: Faction): void;

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
  setViewAngles(yaw: number, pitch?: number): void;

  // Weapon handling
  equipWeapon(): void;
  unequipWeapon(): void;

  // Helicopter lifecycle
  enterHelicopter(helicopterId: string, helicopterPosition: THREE.Vector3): void;
  exitHelicopter(exitPosition: THREE.Vector3): void;
  isInHelicopter(): boolean;
  getHelicopterId(): string | null;

  // Fixed-wing lifecycle
  enterFixedWing(aircraftId: string, aircraftPosition: THREE.Vector3): void;
  exitFixedWing(exitPosition: THREE.Vector3): void;
  isInFixedWing(): boolean;
  getFixedWingId(): string | null;

  // Dependency setters
  setTerrainSystem(terrainSystem: ITerrainRuntime): void;
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
  setTerrainManager(manager: ITerrainRuntime): void;
  setHelipadSystem(system: HelipadSystem): void;
  setPlayerController(controller: IPlayerController): void;
  setHUDSystem(system: IHUDSystem): void;
  setAudioListener(listener: THREE.AudioListener): void;
  setCombatantSystem(cs: CombatantSystem): void;
  setGrenadeSystem(gs: GrenadeSystem): void;
  exitHelicopter(): void;
  tryEnterHelicopter(): void;
  startFiring(helicopterId: string): void;
  stopFiring(helicopterId: string): void;
  switchHelicopterWeapon(helicopterId: string, index: number): void;
  getWeaponStatus(helicopterId: string): { name: string; ammo: number; maxAmmo: number } | null;
  getHelicopterPositionTo(id: string, target: THREE.Vector3): boolean;
  getHelicopterQuaternionTo(id: string, target: THREE.Quaternion): boolean;
  setHelicopterControls(helicopterId: string, controls: Partial<HelicopterControls>): void;
  getHelicopterState(helicopterId: string): { engineRPM: number } | null;
  getFlightData(helicopterId: string): { airspeed: number; heading: number; verticalSpeed: number } | null;
  getAircraftRole(helicopterId: string): AircraftRole;
}

/**
 * First Person Weapon interface
 */
export interface IFirstPersonWeapon {
  setPlayerController(controller: PlayerController): void;
  setCombatantSystem(system: CombatantSystem): void;
  setHUDSystem(system: IHUDSystem): void;
  setZoneManager(system: ZoneManager): void;
  setInventoryManager(system: InventoryManager): void;
  setAudioManager(manager: IAudioManager): void;
  setPlayerFaction(faction: Faction): void;
  setPrimaryWeapon(weaponType: 'rifle' | 'shotgun' | 'smg' | 'pistol' | 'lmg' | 'launcher'): void;
  renderWeapon(renderer: THREE.WebGLRenderer): void;
  enable(): void;
  disable(): void;
}

/**
 * Terrain runtime interface - minimal truthful surface for systems that depend
 * on terrain presence and height.
 */
export interface ITerrainRuntime {
  getHeightAt(x: number, z: number): number;
  getEffectiveHeightAt(x: number, z: number): number;
  getSlopeAt(x: number, z: number): number;
  getNormalAt(x: number, z: number, target?: THREE.Vector3): THREE.Vector3;
  /** Playable world extent used for gameplay, collision, and movement boundaries. */
  getPlayableWorldSize(): number;
  /** Total visual terrain coverage, including render-only overflow beyond the playable map. */
  getVisualWorldSize?(): number;
  /** Render-only overflow beyond the playable map edge. */
  getVisualMargin?(): number;
  getWorldSize(): number;
  isTerrainReady(): boolean;
  isAreaReadyAt?(x: number, z: number): boolean;
  hasTerrainAt(x: number, z: number): boolean;
  getActiveTerrainTileCount(): number;
  setSurfaceWetness(wetness: number): void;
  updatePlayerPosition(position: THREE.Vector3): void;
  registerCollisionObject(
    id: string,
    object: THREE.Object3D,
    options?: {
      dynamic?: boolean;
    },
  ): void;
  unregisterCollisionObject(id: string): void;
  raycastTerrain(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): { hit: boolean; point?: THREE.Vector3; distance?: number };
}

/**
 * Terrain runtime controller surface for systems that tune runtime policy in
 * addition to querying terrain state.
 */
export interface ITerrainRuntimeController extends ITerrainRuntime {
  setRenderDistance(distance: number): void;
}

/**
 * Audio Manager interface
 */
export interface IAudioManager {
  getListener(): THREE.AudioListener;
  play(soundName: string, position?: THREE.Vector3, volume?: number): void;
  playDistantCombat?(volume: number): void;
  playThunder?(volume?: number): void;
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
 * Sky runtime interface - read-only atmosphere queries for systems that need
 * sun, sky, and ambient color information (fog tint, hemisphere coupling,
 * water reflection, weapon/vehicle PBR). Backed by a swappable `ISkyBackend`.
 *
 * All getters write into the caller-supplied `out` parameter and return it
 * so consumers can avoid per-frame allocation.
 */
export interface ISkyRuntime {
  /** Unit vector pointing from the world origin toward the sun. */
  getSunDirection(out: THREE.Vector3): THREE.Vector3;
  /** Linear-space sun color after atmospheric transmittance. */
  getSunColor(out: THREE.Color): THREE.Color;
  /** Sky color sampled along an arbitrary view direction (used by fog tint). */
  getSkyColorAtDirection(dir: THREE.Vector3, out: THREE.Color): THREE.Color;
  /** Sky color at the zenith (straight up). */
  getZenithColor(out: THREE.Color): THREE.Color;
  /** Sky color at the horizon (averaged ring). */
  getHorizonColor(out: THREE.Color): THREE.Color;
}

/**
 * Cloud runtime interface - coverage knob for weather and future volumetric
 * cloud backends. Stub for cycle 2026-04-20; not consumed yet.
 */
export interface ICloudRuntime {
  /** Cloud coverage in [0, 1]. */
  getCoverage(): number;
  /** Sets cloud coverage; values are clamped into [0, 1] by the implementation. */
  setCoverage(v: number): void;
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
  hideCrosshair(): void;
  showCrosshairAgain(): void;
  setCrosshairMode(mode: import('../ui/hud/CrosshairSystem').CrosshairMode): void;
  setCrosshairSpread(radius: number): void;
  onWindowResize(): void;
}
