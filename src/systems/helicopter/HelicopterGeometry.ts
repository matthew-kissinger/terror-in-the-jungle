import * as THREE from 'three';
import { createCockpitGeometry, createRotorSystems, createDoorGuns } from './HelicopterGeometryParts';

/**
 * Creates the 3D geometry for a UH-1 Huey helicopter.
 * This module handles all mesh creation, materials, and geometry assembly.
 */
export function createUH1HueyGeometry(): THREE.Group {
  const helicopterGroup = new THREE.Group();

  // Olive drab military colors
  const oliveDrab = 0x4B5320;
  const metalGray = 0x555555;
  const blackMetal = 0x222222;

  // Create properly proportioned cabin and cockpit
  const wallThickness = 0.1;

  // MAIN CABIN - larger troop/cargo area
  const cabinWidth = 3.2;
  const cabinHeight = 2.8;
  const cabinLength = 6;

  // Cabin bottom panel
  const cabinBottom = new THREE.Mesh(
    new THREE.BoxGeometry(cabinLength, wallThickness, cabinWidth),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  cabinBottom.position.set(0.5, 0.8, 0);
  helicopterGroup.add(cabinBottom);

  // Cabin top panel
  const cabinTop = new THREE.Mesh(
    new THREE.BoxGeometry(cabinLength, wallThickness, cabinWidth),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  cabinTop.position.set(0.5, 3.6, 0);
  helicopterGroup.add(cabinTop);

  // Cabin back wall
  const cabinBack = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, cabinHeight, cabinWidth),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  cabinBack.position.set(3.5, 2.2, 0);
  helicopterGroup.add(cabinBack);

  // COCKPIT SECTION - proper Huey nose design
  const cockpitGroup = createCockpitGeometry();
  helicopterGroup.add(cockpitGroup);

  // Cabin side walls with large door openings for troop access

  // Left cabin wall with door opening
  const leftWallFront = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, cabinHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  leftWallFront.position.set(-1.1, 2.2, -1.6);
  helicopterGroup.add(leftWallFront);

  const leftWallRear = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, cabinHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  leftWallRear.position.set(2.15, 2.2, -1.6);
  helicopterGroup.add(leftWallRear);

  // Right cabin wall with door opening
  const rightWallFront = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, cabinHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  rightWallFront.position.set(-1.1, 2.2, 1.6);
  helicopterGroup.add(rightWallFront);

  const rightWallRear = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, cabinHeight, wallThickness),
    new THREE.MeshLambertMaterial({ color: oliveDrab })
  );
  rightWallRear.position.set(2.15, 2.2, 1.6);
  helicopterGroup.add(rightWallRear);

  // Tail boom - extending from rear
  const tailBoomGeometry = new THREE.CylinderGeometry(0.4, 0.6, 6, 8);
  const tailBoomMaterial = new THREE.MeshLambertMaterial({ color: oliveDrab });
  const tailBoom = new THREE.Mesh(tailBoomGeometry, tailBoomMaterial);
  tailBoom.rotation.z = Math.PI / 2;
  tailBoom.position.set(5.5, 1.5, 0);
  helicopterGroup.add(tailBoom);

  // ROTOR SYSTEMS - main and tail rotors
  const { mainRotor, tailRotor } = createRotorSystems();
  helicopterGroup.add(mainRotor);
  helicopterGroup.add(tailRotor);

  // Landing skids - lowered and better proportioned
  const skidGeometry = new THREE.BoxGeometry(5, 0.15, 0.25);
  const skidMaterial = new THREE.MeshLambertMaterial({ color: metalGray });

  const leftSkid = new THREE.Mesh(skidGeometry, skidMaterial);
  leftSkid.position.set(-0.5, 0.2, -1.5);
  helicopterGroup.add(leftSkid);

  const rightSkid = new THREE.Mesh(skidGeometry, skidMaterial);
  rightSkid.position.set(-0.5, 0.2, 1.5);
  helicopterGroup.add(rightSkid);

  // Skid supports - adjusted for lower height
  const supportGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6);
  const supportMaterial = new THREE.MeshLambertMaterial({ color: metalGray });

  for (let i = 0; i < 4; i++) {
    const support = new THREE.Mesh(supportGeometry, supportMaterial);
    const x = i < 2 ? -2 : 1;
    const z = i % 2 === 0 ? -1.5 : 1.5;
    support.position.set(x, 0.6, z);
    helicopterGroup.add(support);
  }

  // Engine exhaust
  const exhaustGeometry = new THREE.CylinderGeometry(0.3, 0.2, 1, 6);
  const exhaustMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });
  const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
  exhaust.position.set(1.5, 3.2, 0);
  exhaust.rotation.z = Math.PI / 4;
  helicopterGroup.add(exhaust);

  // Add some interior detail for hollow effect
  const interiorFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2),
    new THREE.MeshLambertMaterial({
      color: 0x333333,
      side: THREE.DoubleSide
    })
  );
  interiorFloor.rotation.x = -Math.PI / 2;
  interiorFloor.position.set(0, 0.85, 0);
  helicopterGroup.add(interiorFloor);

  // Door-mounted M60 machine guns - improved Vietnam Huey design
  const [leftMinigun, rightMinigun] = createDoorGuns();
  helicopterGroup.add(leftMinigun);
  helicopterGroup.add(rightMinigun);

  // US Army star markings (simplified) - positioned on the rear walls
  const starGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.02, 5);
  const starMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

  const leftStar = new THREE.Mesh(starGeometry, starMaterial);
  leftStar.position.set(1.65, 1.8, -1.26);
  leftStar.rotation.x = Math.PI / 2;
  leftStar.rotation.z = Math.PI / 2;
  helicopterGroup.add(leftStar);

  const rightStar = new THREE.Mesh(starGeometry, starMaterial);
  rightStar.position.set(1.65, 1.8, 1.26);
  rightStar.rotation.x = -Math.PI / 2;
  rightStar.rotation.z = Math.PI / 2;
  helicopterGroup.add(rightStar);

  helicopterGroup.userData = {
    type: 'helicopter',
    model: 'UH-1 Huey',
    faction: 'US',
    id: 'us_huey'
  };

  return helicopterGroup;
}
