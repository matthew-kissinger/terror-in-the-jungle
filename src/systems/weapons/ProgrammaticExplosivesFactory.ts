import * as THREE from 'three';

export class ProgrammaticExplosivesFactory {
  static createGrenade(): THREE.Group {
    const grenade = new THREE.Group();
    grenade.name = 'grenade';

    const bodyGeometry = new THREE.SphereGeometry(0.75, 16, 16);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A5D23,
      metalness: 0.6,
      roughness: 0.5
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    grenade.add(body);

    const leverGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.1);
    const leverMaterial = new THREE.MeshStandardMaterial({
      color: 0x606060,
      metalness: 0.8,
      roughness: 0.3
    });
    const lever = new THREE.Mesh(leverGeometry, leverMaterial);
    lever.position.set(0, 0.85, 0);
    grenade.add(lever);

    const ringGeometry = new THREE.TorusGeometry(0.3, 0.05, 12, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x606060,
      metalness: 0.9,
      roughness: 0.2
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0.5, 0.85, 0);
    ring.rotation.y = Math.PI / 2;
    grenade.add(ring);

    grenade.castShadow = true;
    body.castShadow = true;
    lever.castShadow = true;
    ring.castShadow = true;

    return grenade;
  }

  static createMortarTube(): THREE.Group {
    // Mortar system disabled - returning empty group
    // TO BE REIMPLEMENTED: Will create proper mortar tube mesh
    const mortar = new THREE.Group();
    mortar.name = 'mortar_tube_disabled';
    return mortar;
  }

  static createMortarRound(): THREE.Group {
    // Mortar system disabled - returning empty group
    // TO BE REIMPLEMENTED: Will create proper mortar round mesh
    const round = new THREE.Group();
    round.name = 'mortar_round_disabled';
    return round;
  }

  static createSandbag(): THREE.Mesh {
    const width = 4;
    const height = 3; // Increased height for better cover
    const depth = 2.5;

    const geometry = new THREE.BoxGeometry(width, height, depth, 4, 3, 3);

    const positionAttribute = geometry.getAttribute('position');
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);

      const normalizedY = (vertex.y + height / 2) / height;
      const sagAmount = Math.pow(normalizedY, 2) * 0.3;
      vertex.y -= sagAmount;

      if (vertex.y > height * 0.3) {
        const topFactor = (vertex.y - height * 0.3) / (height * 0.7);
        vertex.x *= 1 - topFactor * 0.2;
        vertex.z *= 1 - topFactor * 0.15;
      }

      const randomOffset = (Math.random() - 0.5) * 0.1;
      vertex.x += randomOffset;
      vertex.z += randomOffset;

      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7355, // Sandy tan color
      roughness: 0.95, // Very rough texture
      metalness: 0.0, // No metallic sheen
      emissive: 0x4A3C28, // Slight self-illumination to ensure visibility
      emissiveIntensity: 0.1
    });

    const sandbag = new THREE.Mesh(geometry, material);
    sandbag.castShadow = true;
    sandbag.receiveShadow = true;
    sandbag.name = 'sandbag';

    return sandbag;
  }
}