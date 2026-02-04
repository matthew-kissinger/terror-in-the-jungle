import * as THREE from 'three';

/**
 * Helper module for creating helicopter geometry parts.
 * Extracted from HelicopterGeometry.ts to keep the main file under 400 lines.
 */

/**
 * Creates the cockpit section including floor, roof, walls, nose, windshield, and interior.
 */
export function createCockpitGeometry(): THREE.Group {
  const cockpitGroup = new THREE.Group();
  
  const oliveDrab = 0x4B5320;
  const darkGreen = 0x2D3E1F;
  const blackMetal = 0x222222;
  const glassColor = 0x87CEEB;
  const wallThickness = 0.1;
  
  const cockpitWidth = 2.4;
  const cockpitHeight = 2.2;
  const cockpitLength = 2.2;

  // Cockpit floor
  const cockpitFloor = new THREE.Mesh(
    new THREE.BoxGeometry(cockpitLength, wallThickness, cockpitWidth),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  cockpitFloor.position.set(-3.6, 0.8, 0);
  cockpitGroup.add(cockpitFloor);

  // Cockpit roof - slightly angled for better aerodynamics
  const cockpitRoof = new THREE.Mesh(
    new THREE.BoxGeometry(cockpitLength, wallThickness, cockpitWidth),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  cockpitRoof.position.set(-3.6, 3.0, 0);
  cockpitGroup.add(cockpitRoof);

  // Cockpit side walls
  const leftCockpitWall = new THREE.Mesh(
    new THREE.BoxGeometry(cockpitLength, cockpitHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  leftCockpitWall.position.set(-3.6, 1.9, -1.2);
  cockpitGroup.add(leftCockpitWall);

  const rightCockpitWall = new THREE.Mesh(
    new THREE.BoxGeometry(cockpitLength, cockpitHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  rightCockpitWall.position.set(-3.6, 1.9, 1.2);
  cockpitGroup.add(rightCockpitWall);

  // HUEY NOSE - simple rounded greenhouse design
  const noseGeometry = new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI, 0, Math.PI);
  const noseMaterial = new THREE.MeshLambertMaterial({ color: oliveDrab });
  const nose = new THREE.Mesh(noseGeometry, noseMaterial);
  nose.rotation.y = Math.PI / 2;
  nose.position.set(-4.8, 1.9, 0);
  cockpitGroup.add(nose);

  // Window material
  const windowMaterial = new THREE.MeshLambertMaterial({
    color: glassColor,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });

  // Single front windscreen only
  const frontWindscreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.8),
    windowMaterial
  );
  frontWindscreen.position.set(-4.7, 2.1, 0);
  frontWindscreen.rotation.x = 0; // No tilt
  frontWindscreen.rotation.y = Math.PI / 2; // Face front, aligned properly
  cockpitGroup.add(frontWindscreen);

  // Lower front panel (metal, not glass) - cuts off bottom of windscreen
  const lowerPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  lowerPanel.position.set(-4.69, 1.4, 0);
  lowerPanel.rotation.x = 0; // No tilt, aligned
  lowerPanel.rotation.y = Math.PI / 2; // Same rotation as windscreen
  cockpitGroup.add(lowerPanel);

  // MINIMAL COCKPIT INTERIOR
  const interiorGroup = new THREE.Group();

  // Simple pilot seats
  const seatGeometry = new THREE.BoxGeometry(0.35, 0.5, 0.35);
  const seatMaterial = new THREE.MeshLambertMaterial({ color: darkGreen });

  const leftSeat = new THREE.Mesh(seatGeometry, seatMaterial);
  leftSeat.position.set(-3.7, 1.35, -0.5);
  interiorGroup.add(leftSeat);

  const rightSeat = new THREE.Mesh(seatGeometry, seatMaterial);
  rightSeat.position.set(-3.7, 1.35, 0.5);
  interiorGroup.add(rightSeat);

  // Simple dashboard
  const dashboardGeometry = new THREE.BoxGeometry(1.6, 0.25, 0.06);
  const dashboardMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
  const dashboard = new THREE.Mesh(dashboardGeometry, dashboardMaterial);
  dashboard.position.set(-3.1, 2.0, 0);
  interiorGroup.add(dashboard);

  cockpitGroup.add(interiorGroup);
  
  return cockpitGroup;
}

/**
 * Creates both main and tail rotor systems.
 */
export function createRotorSystems(): { mainRotor: THREE.Group; tailRotor: THREE.Group } {
  const blackMetal = 0x222222;
  const metalGray = 0x555555;
  const oliveDrab = 0x4B5320;

  // MAIN ROTOR SYSTEM - improved and ready for animation
  const mainRotorGroup = new THREE.Group();

  // Main rotor mast
  const mainMastGeometry = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 12);
  const mainMastMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
  const mainMast = new THREE.Mesh(mainMastGeometry, mainMastMaterial);
  mainMast.position.set(0, 0.7, 0);
  mainRotorGroup.add(mainMast);

  // Main rotor hub - more detailed
  const hubGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  const hubMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
  const mainHub = new THREE.Mesh(hubGeometry, hubMaterial);
  mainHub.position.set(0, 1.5, 0);
  mainRotorGroup.add(mainHub);

  // Hub detail rings
  const hubRingGeometry = new THREE.TorusGeometry(0.4, 0.03, 6, 16);
  const hubRing = new THREE.Mesh(hubRingGeometry, new THREE.MeshLambertMaterial({ color: metalGray }));
  hubRing.position.set(0, 1.5, 0);
  mainRotorGroup.add(hubRing);

  // Main rotor blades group (for easy animation)
  const mainBladesGroup = new THREE.Group();

  // Main rotor blades (2 blades) - improved shape
  const bladeGeometry = new THREE.BoxGeometry(8.5, 0.06, 0.28);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade1.position.set(0, 0, 0);
  mainBladesGroup.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade2.position.set(0, 0, 0);
  blade2.rotation.y = Math.PI / 2;
  mainBladesGroup.add(blade2);

  mainBladesGroup.position.set(0, 1.55, 0);
  mainRotorGroup.add(mainBladesGroup);

  mainRotorGroup.position.set(0.5, 3.2, 0);

  // Store reference for animation
  mainRotorGroup.userData = { type: 'mainRotor' };
  mainBladesGroup.userData = { type: 'mainBlades' };

  // TAIL ROTOR SYSTEM - proper 2-blade sideways rotor
  const tailRotorGroup = new THREE.Group();

  // Tail fin/vertical stabilizer
  const tailFinGeometry = new THREE.BoxGeometry(0.12, 1.6, 1.0);
  const tailFinMaterial = new THREE.MeshLambertMaterial({ color: oliveDrab });
  const tailFin = new THREE.Mesh(tailFinGeometry, tailFinMaterial);
  tailFin.position.set(0, 0.2, 0);
  tailRotorGroup.add(tailFin);

  // Simple tail rotor hub on left side
  const tailHubGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 6);
  const tailHubMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
  const tailHub = new THREE.Mesh(tailHubGeometry, tailHubMaterial);
  tailHub.rotation.x = Math.PI / 2; // Face sideways
  tailHub.position.set(0, 0.2, -0.55);
  tailRotorGroup.add(tailHub);

  // Tail rotor blades - 2 blades extending vertically
  const tailBladesGroup = new THREE.Group();

  const tailBladeGeometry = new THREE.BoxGeometry(0.04, 1.4, 0.06);
  const tailBladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  // Blade 1 - extends up
  const tailBlade1 = new THREE.Mesh(tailBladeGeometry, tailBladeMaterial);
  tailBlade1.position.set(0, 0.7, 0);
  tailBladesGroup.add(tailBlade1);

  // Blade 2 - extends down
  const tailBlade2 = new THREE.Mesh(tailBladeGeometry, tailBladeMaterial);
  tailBlade2.position.set(0, -0.7, 0);
  tailBladesGroup.add(tailBlade2);

  tailBladesGroup.position.set(0, 0.2, -0.55);
  tailRotorGroup.add(tailBladesGroup);

  tailRotorGroup.position.set(8.5, 1.5, 0);

  // Store reference for animation
  tailRotorGroup.userData = { type: 'tailRotor' };
  tailBladesGroup.userData = { type: 'tailBlades' };

  return { mainRotor: mainRotorGroup, tailRotor: tailRotorGroup };
}

/**
 * Creates door-mounted M60 machine guns for both sides of the helicopter.
 */
export function createDoorGuns(): THREE.Group[] {
  const blackMetal = 0x222222;
  const metalGray = 0x555555;

  const createMinigun = (side: 'left' | 'right') => {
    const minigunGroup = new THREE.Group();
    const sideMultiplier = side === 'left' ? -1 : 1;

    // Large prominent gun barrel sticking out
    const barrelGeometry = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 12);
    const barrelMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(1.25, 0, 0); // Extended further out
    minigunGroup.add(barrel);

    // Flash hider at end of longer barrel
    const flashHiderGeometry = new THREE.CylinderGeometry(0.1, 0.08, 0.15, 8);
    const flashHider = new THREE.Mesh(flashHiderGeometry, barrelMaterial);
    flashHider.rotation.z = Math.PI / 2;
    flashHider.position.set(2.5, 0, 0); // At end of longer barrel
    minigunGroup.add(flashHider);

    // Gun receiver - larger and more detailed
    const receiverGeometry = new THREE.BoxGeometry(0.6, 0.2, 0.12);
    const receiverMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
    const receiver = new THREE.Mesh(receiverGeometry, receiverMaterial);
    receiver.position.set(0, 0, 0);
    minigunGroup.add(receiver);

    // Trigger guard
    const triggerGuardGeometry = new THREE.TorusGeometry(0.08, 0.02, 6, 12);
    const triggerGuard = new THREE.Mesh(triggerGuardGeometry, receiverMaterial);
    triggerGuard.rotation.z = Math.PI / 2;
    triggerGuard.position.set(-0.15, -0.08, 0);
    minigunGroup.add(triggerGuard);

    // Bipod legs
    const bipodLegGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6);
    const bipodMaterial = new THREE.MeshLambertMaterial({ color: metalGray });

    const leftBipodLeg = new THREE.Mesh(bipodLegGeometry, bipodMaterial);
    leftBipodLeg.position.set(0.4, -0.3, -0.1);
    leftBipodLeg.rotation.z = Math.PI / 6;
    minigunGroup.add(leftBipodLeg);

    const rightBipodLeg = new THREE.Mesh(bipodLegGeometry, bipodMaterial);
    rightBipodLeg.position.set(0.4, -0.3, 0.1);
    rightBipodLeg.rotation.z = Math.PI / 6;
    minigunGroup.add(rightBipodLeg);

    // Ammunition belt
    const beltGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6);
    const beltMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown brass
    const ammoBelt = new THREE.Mesh(beltGeometry, beltMaterial);
    ammoBelt.rotation.x = Math.PI / 2;
    ammoBelt.position.set(-0.2, 0.1, -0.15);
    minigunGroup.add(ammoBelt);

    // Pintle mount - more detailed
    const pintleBaseGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 8);
    const pintleMaterial = new THREE.MeshLambertMaterial({ color: metalGray });
    const pintleBase = new THREE.Mesh(pintleBaseGeometry, pintleMaterial);
    pintleBase.position.set(0, -0.2, 0);
    minigunGroup.add(pintleBase);

    const pintlePostGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8);
    const pintlePost = new THREE.Mesh(pintlePostGeometry, pintleMaterial);
    pintlePost.position.set(0, -0.4, 0);
    minigunGroup.add(pintlePost);

    // Position the gun group at door opening
    minigunGroup.position.set(0.8, 2.0, sideMultiplier * 1.65);
    minigunGroup.rotation.y = sideMultiplier * -Math.PI / 2; // Point outward (negative to flip direction)

    // Store reference for animation
    minigunGroup.userData = { type: 'minigun', side: side };

    return minigunGroup;
  };

  // Return both miniguns
  return [createMinigun('left'), createMinigun('right')];
}
