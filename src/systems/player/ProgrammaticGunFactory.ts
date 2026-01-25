import * as THREE from 'three';

/**
 * Programmatically builds a low-poly rifle using simple boxes and cylinders.
 * Geometry is lightweight and suitable for a first-person overlay.
 */
export class ProgrammaticGunFactory {
  static createRifle(material?: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    const defaultMaterial = material || new THREE.MeshBasicMaterial({ color: 0x2b2b2b });

    // Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.2), defaultMaterial);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.18), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    handguard.position.set(0.75, 0, 0);
    group.add(handguard);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0x202020 }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.25, 0, 0);
    group.add(barrel);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.18), new THREE.MeshBasicMaterial({ color: 0x252525 }));
    stock.position.set(-0.6, -0.03, 0);
    stock.rotation.z = -0.05;
    group.add(stock);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.18), new THREE.MeshBasicMaterial({ color: 0x1f1f1f }));
    grip.position.set(0.1, -0.2, 0);
    grip.rotation.z = 0.35;
    group.add(grip);

    // Magazine (separate for reload animation)
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.25, 0.14),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
    );
    magazine.name = 'magazine';
    magazine.position.set(0.2, -0.25, 0);
    magazine.rotation.z = 0.1;
    group.add(magazine);

    // Rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    rearSight.position.set(-0.1, 0.12, 0);
    group.add(rearSight);

    // Front sight
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    frontSight.position.set(1.0, 0.1, 0);
    group.add(frontSight);

    // Muzzle point helper (for tracers) - before rotations
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(1.7, 0, 0); // near end of barrel
    group.add(muzzle);

    // Don't apply rotations here - they will be handled in FirstPersonWeapon
    // Just ensure the gun model is oriented with barrel along +X axis

    // Scale for better visibility
    group.scale.set(0.75, 0.75, 0.75);
    return group;
  }

  static createShotgun(material?: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    const defaultMaterial = material || new THREE.MeshBasicMaterial({ color: 0x2b2b2b });

    // Receiver - shorter and chunkier than rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.22), defaultMaterial);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Pump grip - distinctive shotgun feature (named for animation)
    const pumpGrip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    pumpGrip.name = 'pumpGrip';
    pumpGrip.position.set(0.6, 0, 0);
    group.add(pumpGrip);

    // Barrel - wider bore than rifle
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0x202020 }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.05, 0, 0);
    group.add(barrel);

    // Stock - similar to rifle but slightly thicker
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0x252525 }));
    stock.position.set(-0.55, -0.03, 0);
    stock.rotation.z = -0.05;
    group.add(stock);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.2), new THREE.MeshBasicMaterial({ color: 0x1f1f1f }));
    grip.position.set(0.05, -0.22, 0);
    grip.rotation.z = 0.4;
    group.add(grip);

    // Front sight
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.14), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    frontSight.position.set(1.3, 0.12, 0);
    group.add(frontSight);

    // Rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    rearSight.position.set(-0.05, 0.12, 0);
    group.add(rearSight);

    // Muzzle point helper (for tracers and muzzle flash)
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(1.5, 0, 0); // near end of barrel
    group.add(muzzle);

    // Scale for better visibility
    group.scale.set(0.75, 0.75, 0.75);
    return group;
  }

  static createSMG(material?: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    const defaultMaterial = material || new THREE.MeshBasicMaterial({ color: 0x1a1a1a });

    // Compact receiver - smaller and more compact than rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), defaultMaterial);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Short handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.16), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    handguard.position.set(0.5, 0, 0);
    group.add(handguard);

    // Shorter barrel - thinner for SMG profile
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0x181818 }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.95, 0, 0);
    group.add(barrel);

    // Folding stock - much smaller than rifle
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.12), new THREE.MeshBasicMaterial({ color: 0x1c1c1c }));
    stock.position.set(-0.4, 0, 0);
    stock.rotation.z = -0.03;
    group.add(stock);

    // Pistol grip - shorter and more compact
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0x151515 }));
    grip.position.set(0.05, -0.18, 0);
    grip.rotation.z = 0.4;
    group.add(grip);

    // Magazine - larger and more prominent for high-capacity look
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.3, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x0f0f0f })
    );
    magazine.name = 'magazine';
    magazine.position.set(0.15, -0.28, 0);
    magazine.rotation.z = 0.08;
    group.add(magazine);

    // Simple rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    rearSight.position.set(-0.05, 0.1, 0);
    group.add(rearSight);

    // Simple front sight
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    frontSight.position.set(0.7, 0.09, 0);
    group.add(frontSight);

    // Muzzle point helper (for tracers)
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(1.25, 0, 0); // shorter barrel, closer muzzle
    group.add(muzzle);

    // Scale for visibility
    group.scale.set(0.75, 0.75, 0.75);
    return group;
  }
}


