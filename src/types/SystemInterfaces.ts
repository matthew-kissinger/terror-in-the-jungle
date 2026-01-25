/**
 * System Interface Definitions
 * Replaces `any` types with proper typed interfaces for system dependencies
 */

import * as THREE from 'three';

/**
 * HUD System interface - handles all UI display and feedback
 */
export interface IHUDSystem {
  addKill(): void;
  addDeath(): void;
  addZoneCapture(): void;
  addKillToFeed(killerName: string, victimName: string, weaponType?: string): void;
  showHitMarker(type: 'hit' | 'kill' | 'headshot'): void;
  updateGrenadePower(power: number, distance?: number): void;
  updateElevation(elevation: number): void;
  updateHelicopterMouseMode(enabled: boolean): void;
  showGrenadePowerMeter(): void;
  hideGrenadePowerMeter(): void;
  updateHelicopterInstruments(pitch: number, yaw: number, altitude: number, speed: number): void;
  showHelicopterMouseIndicator(): void;
  hideHelicopterMouseIndicator(): void;
  showHelicopterInstruments(): void;
  hideHelicopterInstruments(): void;
  spawnScorePopup(type: 'capture' | 'defend' | 'secured', points: number): void;
  startMatch(): void;
  toggleScoreboard(visible: boolean): void;
}

/**
 * Player Health System interface
 */
export interface IPlayerHealthSystem {
  takeDamage(amount: number, source?: string): boolean;
  heal(amount: number): void;
  isAlive(): boolean;
  voluntaryRespawn(): void;
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
  applyExplosionShake(position: THREE.Vector3, magnitude: number): void;
  tryEnterHelicopter(): void;
  exitHelicopter(): void;
  position: THREE.Vector3;
  camera: THREE.PerspectiveCamera;
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
}

/**
 * First Person Weapon interface
 */
export interface IFirstPersonWeapon {
  setPlayerController(controller: IPlayerController): void;
  setCombatantSystem(system: any): void;
  setHUDSystem(system: IHUDSystem): void;
  setZoneManager(system: any): void;
  setInventoryManager(system: any): void;
  setAudioManager(manager: any): void;
  renderWeapon(renderer: THREE.WebGLRenderer): void;
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
}

/**
 * Zone Manager interface
 */
export interface IZoneManager {
  getZones(): any[];
  getZoneAt(position: THREE.Vector3): any;
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
  updateBillboards(combatants: any[], camera: THREE.Camera): void;
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
