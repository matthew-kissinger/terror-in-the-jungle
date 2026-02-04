import * as THREE from 'three';

export function worldToChunkCoord(worldPos: THREE.Vector3, chunkSize: number): THREE.Vector2 {
  return new THREE.Vector2(
    Math.floor(worldPos.x / chunkSize),
    Math.floor(worldPos.z / chunkSize)
  );
}

export function getChunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

export function getChunkDistanceFromPlayer(
  playerPosition: THREE.Vector3,
  chunkX: number,
  chunkZ: number,
  chunkSize: number
): number {
  const playerChunk = worldToChunkCoord(playerPosition, chunkSize);
  return Math.max(Math.abs(chunkX - playerChunk.x), Math.abs(chunkZ - playerChunk.y));
}
