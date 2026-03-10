import * as THREE from 'three';

export interface AssetInfo {
  name: string;
  path: string;
  category: AssetCategory;
  texture?: THREE.Texture;
}

export enum AssetCategory {
  GROUND = 'ground',
  FOLIAGE = 'foliage',
  ENEMY = 'enemy',
  SKYBOX = 'skybox',
  MODEL = 'model',
  UNKNOWN = 'unknown'
}

export interface BillboardInstance {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotation: number;
  velocity?: THREE.Vector3;
}

export interface PlayerState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  runSpeed: number;
  isRunning: boolean;
  isGrounded: boolean;
  isJumping: boolean;
  jumpForce: number;
  gravity: number;
  isCrouching: boolean;
  isInHelicopter: boolean;
  helicopterId: string | null;
}

export interface GameSystem {
  init(): Promise<void>;
  update(deltaTime: number): void;
  dispose(): void;
}



/**

 * Terrain types for footstep sound variation

 */

export enum TerrainType {

  GRASS = 'grass',

  MUD = 'mud',

  WATER = 'water',

  ROCK = 'rock'

}
