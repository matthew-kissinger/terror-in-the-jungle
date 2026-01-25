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
    const mortar = new THREE.Group();
    mortar.name = 'mortar_tube';

    // Base plate - sits on ground
    const basePlateGeometry = new THREE.CylinderGeometry(1.5, 1.8, 0.2, 16);
    const basePlateMaterial = new THREE.MeshStandardMaterial({
      color: 0x404040,
      metalness: 0.8,
      roughness: 0.3
    });
    const basePlate = new THREE.Mesh(basePlateGeometry, basePlateMaterial);
    basePlate.position.y = 0.1;
    basePlate.castShadow = true;
    mortar.add(basePlate);

    // Tube - angled upward
    const tubeGeometry = new THREE.CylinderGeometry(0.4, 0.45, 3.5, 12);
    const tubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3a2a,
      metalness: 0.7,
      roughness: 0.4
    });
    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tube.position.set(0, 2.0, 0);
    tube.rotation.x = THREE.MathUtils.degToRad(45); // Default angle
    tube.castShadow = true;
    tube.name = 'tube'; // For rotation control
    mortar.add(tube);

    // Support struts
    const strutGeometry = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8);
    const strutMaterial = new THREE.MeshStandardMaterial({
      color: 0x505050,
      metalness: 0.6,
      roughness: 0.5
    });

    // Front strut
    const frontStrut = new THREE.Mesh(strutGeometry, strutMaterial);
    frontStrut.position.set(0, 1.0, 0.8);
    frontStrut.rotation.x = THREE.MathUtils.degToRad(25);
    frontStrut.castShadow = true;
    mortar.add(frontStrut);

    // Left strut
    const leftStrut = new THREE.Mesh(strutGeometry, strutMaterial);
    leftStrut.position.set(-0.7, 0.8, -0.4);
    leftStrut.rotation.z = THREE.MathUtils.degToRad(20);
    leftStrut.rotation.x = THREE.MathUtils.degToRad(-10);
    leftStrut.castShadow = true;
    mortar.add(leftStrut);

    // Right strut
    const rightStrut = new THREE.Mesh(strutGeometry, strutMaterial);
    rightStrut.position.set(0.7, 0.8, -0.4);
    rightStrut.rotation.z = THREE.MathUtils.degToRad(-20);
    rightStrut.rotation.x = THREE.MathUtils.degToRad(-10);
    rightStrut.castShadow = true;
    mortar.add(rightStrut);

    return mortar;
  }

  static createMortarRound(): THREE.Group {
    const round = new THREE.Group();
    round.name = 'mortar_round';

    // Main body - cylindrical
    const bodyGeometry = new THREE.CylinderGeometry(0.35, 0.35, 1.5, 12);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4A5D23,
      metalness: 0.5,
      roughness: 0.6
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    round.add(body);

    // Nose cone - pointed
    const noseGeometry = new THREE.ConeGeometry(0.35, 0.6, 12);
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: 0x606060,
      metalness: 0.8,
      roughness: 0.3
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.position.y = 1.05;
    nose.castShadow = true;
    round.add(nose);

    // Tail fins
    const finGeometry = new THREE.BoxGeometry(0.15, 0.8, 0.05);
    const finMaterial = new THREE.MeshStandardMaterial({
      color: 0x505050,
      metalness: 0.7,
      roughness: 0.4
    });

    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeometry, finMaterial);
      const angle = (i / 4) * Math.PI * 2;
      fin.position.set(
        Math.cos(angle) * 0.35,
        -0.9,
        Math.sin(angle) * 0.35
      );
      fin.rotation.y = angle;
      fin.castShadow = true;
      round.add(fin);
    }

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