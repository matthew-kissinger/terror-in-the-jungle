import * as THREE from 'three';

export interface ExplosionEffect {
  flashSprite: THREE.Sprite;
  smokeParticles: THREE.Points;
  fireParticles: THREE.Points;
  debrisParticles: THREE.Points;
  shockwaveRing: THREE.Mesh;
  smokeVelocities: THREE.Vector3[];
  fireVelocities: THREE.Vector3[];
  debrisVelocities: THREE.Vector3[];
  aliveUntil: number;
  startTime: number;
}

/**
 * Creates a complete explosion effect with all visual components
 */
export function createExplosionEffect(
  smokeTexture: THREE.Texture,
  flashTexture: THREE.Texture,
  debrisTexture: THREE.Texture
): ExplosionEffect {
  // Flash sprite for visual burst - larger initial size
  const flashSpriteMaterial = new THREE.SpriteMaterial({
    map: flashTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 1
  });
  const flashSprite = new THREE.Sprite(flashSpriteMaterial);
  flashSprite.scale.set(12, 12, 1);
  flashSprite.visible = false;
  flashSprite.matrixAutoUpdate = true;

  // Smoke particles (80 particles for denser cloud)
  const smokeCount = 80;
  const smokeGeometry = new THREE.BufferGeometry();
  const smokePositions = new Float32Array(smokeCount * 3);
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));

  const smokeMaterial = new THREE.PointsMaterial({
    map: smokeTexture,
    size: 4,
    transparent: true,
    opacity: 0.8,
    blending: THREE.NormalBlending,
    depthWrite: false
  });
  const smokeParticles = new THREE.Points(smokeGeometry, smokeMaterial);
  smokeParticles.visible = false;
  smokeParticles.matrixAutoUpdate = true;

  // Fire particles (60 bright particles for more intensity)
  const fireCount = 60;
  const fireGeometry = new THREE.BufferGeometry();
  const firePositions = new Float32Array(fireCount * 3);
  fireGeometry.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));

  const fireMaterial = new THREE.PointsMaterial({
    color: 0xff6600,
    size: 1.2,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const fireParticles = new THREE.Points(fireGeometry, fireMaterial);
  fireParticles.visible = false;
  fireParticles.matrixAutoUpdate = true;

  // Debris particles (50 dark particles flying outward)
  const debrisCount = 50;
  const debrisGeometry = new THREE.BufferGeometry();
  const debrisPositions = new Float32Array(debrisCount * 3);
  debrisGeometry.setAttribute('position', new THREE.BufferAttribute(debrisPositions, 3));

  const debrisMaterial = new THREE.PointsMaterial({
    map: debrisTexture,
    size: 0.5,
    transparent: true,
    opacity: 1,
    blending: THREE.NormalBlending,
    depthWrite: false
  });
  const debrisParticles = new THREE.Points(debrisGeometry, debrisMaterial);
  debrisParticles.visible = false;
  debrisParticles.matrixAutoUpdate = true;

  // Shockwave ring on ground
  const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const shockwaveRing = new THREE.Mesh(ringGeometry, ringMaterial);
  shockwaveRing.rotation.x = -Math.PI / 2;
  shockwaveRing.visible = false;
  shockwaveRing.matrixAutoUpdate = true;

  // Velocity arrays
  const smokeVelocities: THREE.Vector3[] = [];
  const fireVelocities: THREE.Vector3[] = [];
  const debrisVelocities: THREE.Vector3[] = [];

  for (let i = 0; i < smokeCount; i++) {
    smokeVelocities.push(new THREE.Vector3());
  }
  for (let i = 0; i < fireCount; i++) {
    fireVelocities.push(new THREE.Vector3());
  }
  for (let i = 0; i < debrisCount; i++) {
    debrisVelocities.push(new THREE.Vector3());
  }

  return {
    flashSprite,
    smokeParticles,
    fireParticles,
    debrisParticles,
    shockwaveRing,
    smokeVelocities,
    fireVelocities,
    debrisVelocities,
    aliveUntil: 0,
    startTime: 0
  };
}
