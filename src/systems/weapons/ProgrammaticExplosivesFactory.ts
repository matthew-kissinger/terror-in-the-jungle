import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

  /** Total height of the sandbag wall (3 rows) - used by SandbagSystem for placement */
  static readonly SANDBAG_HEIGHT = 0.8 * 3; // bagH * rows

  static createSandbag(): THREE.Mesh {
    const bagW = 1.5;   // Width per bag
    const bagH = 0.8;   // Height per bag
    const bagD = 1.5;   // Depth per bag (thick wall)
    const halfH = (bagH * 3) / 2; // Center geometry at y=0

    // Row layout: bottom 3, middle 2 (brick offset), top 3
    const rows: { count: number; offsets: number[]; y: number }[] = [
      { count: 3, offsets: [-bagW, 0, bagW], y: bagH * 0.5 - halfH },
      { count: 2, offsets: [-bagW * 0.5, bagW * 0.5], y: bagH * 1.5 - halfH },
      { count: 3, offsets: [-bagW, 0, bagW], y: bagH * 2.5 - halfH },
    ];

    const geometries: THREE.BufferGeometry[] = [];
    const vertex = new THREE.Vector3();

    for (const row of rows) {
      for (let b = 0; b < row.count; b++) {
        const geo = new THREE.BoxGeometry(
          bagW * 0.93, bagH * 0.90, bagD * 0.93,
          2, 2, 2
        );
        const pos = geo.getAttribute('position');
        const ox = row.offsets[b];
        const oy = row.y;
        const halfBW = bagW * 0.465;
        const halfBH = bagH * 0.45;
        const halfBD = bagD * 0.465;

        for (let i = 0; i < pos.count; i++) {
          vertex.fromBufferAttribute(pos, i);

          // Pillowy bulge outward
          const nx = vertex.x / halfBW;
          const ny = vertex.y / halfBH;
          const nz = vertex.z / halfBD;
          const bulge = Math.max(0, (1 - nx * nx) * (1 - ny * ny) * (1 - nz * nz));
          vertex.x += nx * bulge * 0.12;
          vertex.y += ny * bulge * 0.08;
          vertex.z += nz * bulge * 0.10;

          // Cloth-like surface noise
          vertex.x += (Math.random() - 0.5) * 0.04;
          vertex.y += (Math.random() - 0.5) * 0.03;
          vertex.z += (Math.random() - 0.5) * 0.04;

          // Apply row/column offset
          vertex.x += ox;
          vertex.y += oy;

          pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }

        geo.computeVertexNormals();
        geometries.push(geo);
      }
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
    for (const geo of geometries) geo.dispose();

    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x4A3C28,
      emissiveIntensity: 0.1
    });

    const sandbag = new THREE.Mesh(merged, material);
    sandbag.castShadow = true;
    sandbag.receiveShadow = true;
    sandbag.name = 'sandbag';

    return sandbag;
  }
}