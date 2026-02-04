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

    // Darker wood/metal look for shotgun
    const metalMaterial = material || new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const woodMaterial = new THREE.MeshBasicMaterial({ color: 0x3d2817 }); // Brown wood

    // Receiver - chunky shotgun receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.2), metalMaterial);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Barrel - wider bore than rifle, longer
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0x151515 }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.8, 0.04, 0);
    group.add(barrel);

    // Tube magazine under barrel (distinctive shotgun feature)
    const tubeMag = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0x181818 }));
    tubeMag.rotation.z = Math.PI / 2;
    tubeMag.position.set(0.7, -0.06, 0);
    group.add(tubeMag);

    // Pump grip - slides on tube mag (named for animation)
    const pumpGrip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22), woodMaterial);
    pumpGrip.name = 'pumpGrip';
    pumpGrip.position.set(0.5, -0.06, 0);
    group.add(pumpGrip);

    // Wooden forend wrap
    const forend = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), new THREE.MeshBasicMaterial({ color: 0x4a3020 }));
    forend.position.set(0.35, -0.06, 0);
    group.add(forend);

    // Stock - wooden stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.16), woodMaterial);
    stock.position.set(-0.55, -0.02, 0);
    stock.rotation.z = -0.08;
    group.add(stock);

    // Stock butt plate
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.18), new THREE.MeshBasicMaterial({ color: 0x0f0f0f }));
    buttPlate.position.set(-0.88, -0.05, 0);
    group.add(buttPlate);

    // Pistol grip area
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.16), woodMaterial);
    grip.position.set(-0.05, -0.18, 0);
    grip.rotation.z = 0.35;
    group.add(grip);

    // Trigger guard
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.1), metalMaterial);
    triggerGuard.position.set(0.05, -0.12, 0);
    group.add(triggerGuard);

    // Front bead sight - small brass bead
    const frontSight = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), new THREE.MeshBasicMaterial({ color: 0x8B7333 }));
    frontSight.position.set(1.3, 0.08, 0);
    group.add(frontSight);

    // Muzzle point helper (for tracers and muzzle flash)
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(1.35, 0.04, 0);
    group.add(muzzle);

    // Scale for better visibility
    group.scale.set(0.75, 0.75, 0.75);
    return group;
  }

  static createSMG(material?: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    // Use similar brightness to rifle for visibility
    const defaultMaterial = material || new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

    // Compact receiver - smaller and more compact than rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), defaultMaterial);
    receiver.position.set(0, 0, 0);
    group.add(receiver);

    // Short handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.16), new THREE.MeshBasicMaterial({ color: 0x323232 }));
    handguard.position.set(0.5, 0, 0);
    group.add(handguard);

    // Shorter barrel - thinner for SMG profile
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0x1e1e1e }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.95, 0, 0);
    group.add(barrel);

    // Folding stock - much smaller than rifle
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.12), new THREE.MeshBasicMaterial({ color: 0x242424 }));
    stock.position.set(-0.4, 0, 0);
    stock.rotation.z = -0.03;
    group.add(stock);

    // Pistol grip - shorter and more compact
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0x1e1e1e }));
    grip.position.set(0.05, -0.18, 0);
    grip.rotation.z = 0.4;
    group.add(grip);

    // Magazine - larger and more prominent for high-capacity look
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.3, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
    );
    magazine.name = 'magazine';
    magazine.position.set(0.15, -0.28, 0);
    magazine.rotation.z = 0.08;
    group.add(magazine);

    // Simple rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    rearSight.position.set(-0.05, 0.1, 0);
    group.add(rearSight);

    // Simple front sight
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
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

  static createPistol(material?: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    // Compact handgun materials
    const metalMaterial = material || new THREE.MeshBasicMaterial({ color: 0x1c1c1c });

    // Slide - top portion of pistol
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.12), metalMaterial);
    slide.position.set(0.1, 0.02, 0);
    group.add(slide);

    // Frame/receiver - slightly larger than slide
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0x252525 }));
    frame.position.set(0, -0.01, 0);
    group.add(frame);

    // Short barrel - protruding from slide
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8), new THREE.MeshBasicMaterial({ color: 0x161616 }));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.35, 0.02, 0);
    group.add(barrel);

    // Pistol grip - angled downward
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.12), new THREE.MeshBasicMaterial({ color: 0x1e1e1e }));
    grip.position.set(-0.05, -0.15, 0);
    grip.rotation.z = 0.15;
    group.add(grip);

    // Magazine - smaller than rifle/SMG
    const magazine = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.16, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x191919 })
    );
    magazine.name = 'magazine';
    magazine.position.set(-0.03, -0.22, 0);
    group.add(magazine);

    // Trigger guard
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.08), metalMaterial);
    triggerGuard.position.set(-0.02, -0.08, 0);
    group.add(triggerGuard);

    // Front sight
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), new THREE.MeshBasicMaterial({ color: 0x0f0f0f }));
    frontSight.position.set(0.22, 0.08, 0);
    group.add(frontSight);

    // Rear sight
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), new THREE.MeshBasicMaterial({ color: 0x0f0f0f }));
    rearSight.position.set(-0.05, 0.08, 0);
    group.add(rearSight);

    // Muzzle point helper (for tracers)
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle';
    muzzle.position.set(0.43, 0.02, 0);
    group.add(muzzle);

    // Scale for visibility - slightly larger than other weapons for compensation
    group.scale.set(0.85, 0.85, 0.85);

    return group;
  }
}


