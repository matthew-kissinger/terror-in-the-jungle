import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HelipadSystem } from './HelipadSystem';
import { HelicopterPhysics, HelicopterControls } from './HelicopterPhysics';
import { Logger } from '../../utils/Logger';

export class HelicopterModel implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ImprovedChunkManager;
  private helipadSystem?: HelipadSystem;
  private playerController?: any;
  private hudSystem?: any;
  private helicopters: Map<string, THREE.Group> = new Map();
  private helicopterPhysics: Map<string, HelicopterPhysics> = new Map();
  private interactionRadius = 5.0; // Distance from helicopter to show prompt (around helicopter size)
  private isPlayerNearHelicopter = false;

  // Animation state
  private mainRotorSpeed: Map<string, number> = new Map();
  private tailRotorSpeed: Map<string, number> = new Map();
  private rotorAcceleration = 5.0; // How fast rotors spin up/down

  // Visual tilt system for realistic helicopter banking
  private visualTiltQuaternion: Map<string, THREE.Quaternion> = new Map();
  private targetTiltQuaternion: Map<string, THREE.Quaternion> = new Map();
  private readonly MAX_TILT_ANGLE = Math.PI / 10; // 18 degrees maximum tilt
  private readonly TILT_SMOOTH_RATE = 6.0; // How fast tilt responds to controls
  private readonly AUTO_LEVEL_RATE = 3.0; // How fast it returns to level

  // Audio system
  private audioListener?: THREE.AudioListener;
  private rotorAudio: Map<string, THREE.PositionalAudio> = new Map();
  private audioLoader = new THREE.AudioLoader();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.debug('🚁 Initializing Helicopter Model System...');
  }

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
    this.terrainManager = terrainManager;
  }

  setHelipadSystem(helipadSystem: HelipadSystem): void {
    this.helipadSystem = helipadSystem;
  }

  setPlayerController(playerController: any): void {
    this.playerController = playerController;
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem;
  }

  setAudioListener(listener: THREE.AudioListener): void {
    this.audioListener = listener;
  }

  createHelicopterWhenReady(): void {
    if (!this.helicopters.has('us_huey') && this.helipadSystem) {
      this.createUSHuey();
    }
  }

  private createUSHuey(): void {
    if (!this.helipadSystem || !this.terrainManager) {
      console.warn('⚠️ Cannot create helicopter - required systems not available');
      return;
    }

    // Get helipad position
    const helipadPosition = this.helipadSystem.getHelipadPosition('us_helipad');
    if (!helipadPosition) {
      console.warn('⚠️ Cannot create helicopter - helipad not found');
      return;
    }

    // Position helicopter on helipad center with safe height calculation
    const helicopterPosition = helipadPosition.clone();

    // Use safer height calculation - helicopter sits directly on helipad surface
    const baseHeight = Math.max(helipadPosition.y, this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z));
    helicopterPosition.y = baseHeight; // Helicopter sits directly on helipad, not floating

    const helicopter = this.createUH1HueyGeometry();
    helicopter.position.copy(helicopterPosition);

    this.scene.add(helicopter);
    this.helicopters.set('us_huey', helicopter);

    // Initialize physics for this helicopter
    const physics = new HelicopterPhysics(helicopterPosition);
    this.helicopterPhysics.set('us_huey', physics);

    // Initialize rotor speeds
    this.mainRotorSpeed.set('us_huey', 0);
    this.tailRotorSpeed.set('us_huey', 0);

    // Initialize visual tilt quaternions
    this.visualTiltQuaternion.set('us_huey', new THREE.Quaternion());
    this.targetTiltQuaternion.set('us_huey', new THREE.Quaternion());

    // Initialize helicopter audio
    Logger.debug('🚁🔊 Initializing helicopter audio for us_huey');
    this.initializeHelicopterAudio('us_huey', helicopter);

    // Register helicopter for collision detection
    if ('registerCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).registerCollisionObject('us_huey', helicopter);
    }

    Logger.debug(`🚁 ✅ Created US UH-1 Huey at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    Logger.debug(`🚁 DEBUG: Helipad position: (${helipadPosition.x.toFixed(1)}, ${helipadPosition.y.toFixed(1)}, ${helipadPosition.z.toFixed(1)})`);
    Logger.debug(`🚁 DEBUG: Base height: ${baseHeight.toFixed(2)}, Final height: ${helicopterPosition.y.toFixed(2)}`);
    Logger.debug(`🚁 DEBUG: Helicopter children count: ${helicopter.children.length}`);
    Logger.debug(`🚁 DEBUG: Scene children count: ${this.scene.children.length}`);
  }

  private createUH1HueyGeometry(): THREE.Group {
    const helicopterGroup = new THREE.Group();

    // Olive drab military colors
    const oliveDrab = 0x4B5320;
    const darkGreen = 0x2D3E1F;
    const metalGray = 0x555555;
    const blackMetal = 0x222222;
    const glassColor = 0x87CEEB;

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
    const cockpitGroup = new THREE.Group();
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
    helicopterGroup.add(mainRotorGroup);

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
    helicopterGroup.add(tailRotorGroup);

    // Store reference for animation
    tailRotorGroup.userData = { type: 'tailRotor' };
    tailBladesGroup.userData = { type: 'tailBlades' };

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

    // Add miniguns to both sides
    const leftMinigun = createMinigun('left');
    helicopterGroup.add(leftMinigun);

    const rightMinigun = createMinigun('right');
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

  getHelicopterPosition(id: string): THREE.Vector3 | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.position.clone() : null;
  }

  getHelicopterQuaternion(id: string): THREE.Quaternion | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.quaternion.clone() : null;
  }

  getAllHelicopters(): Array<{ id: string; position: THREE.Vector3; model: string }> {
    const result: Array<{ id: string; position: THREE.Vector3; model: string }> = []

    this.helicopters.forEach((helicopter, id) => {
      result.push({
        id,
        position: helicopter.position.clone(),
        model: helicopter.userData.model || 'unknown'
      });
    });

    return result;
  }

  update(deltaTime: number): void {
    // Create helicopter when helipad is ready - more robust checking
    if (!this.helicopters.has('us_huey') && this.helipadSystem && this.terrainManager) {
      const helipadPosition = this.helipadSystem.getHelipadPosition('us_helipad');
      if (helipadPosition) {
        // Wait for terrain to be fully loaded at helipad location
        const terrainHeight = this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z);

        // Check if terrain chunk is loaded using available getChunkAt method
        const chunk = this.terrainManager.getChunkAt(helipadPosition);
        const isChunkLoaded = chunk !== undefined;

        // Create helicopter only when we have valid terrain data and chunk is loaded
        if ((terrainHeight > -100 && isChunkLoaded) || terrainHeight > 0) {
          Logger.debug(`🚁 ⚡ CREATING HELICOPTER NOW! Helipad at (${helipadPosition.x}, ${helipadPosition.y}, ${helipadPosition.z}), terrain: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          this.createUSHuey();
        } else {
          // Optional: Log waiting status occasionally
          if (Math.random() < 0.01) {
            Logger.debug(`🚁 Waiting for terrain to load at helipad location - height: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          }
        }
      }
    }

    // Update helicopter physics and animations
    this.updateHelicopterPhysics(deltaTime);

    // Update rotor animations
    this.updateRotorAnimations(deltaTime);

    // Check player proximity to helicopter for interaction prompt
    this.checkPlayerProximity();
  }

  private checkPlayerProximity(): void {
    if (!this.playerController || !this.hudSystem) {
      return;
    }

    const helicopter = this.helicopters.get('us_huey');
    if (!helicopter) {
      return;
    }

    // If player is in helicopter, don't show interaction prompt
    if (this.playerController.isInHelicopter()) {
      if (this.isPlayerNearHelicopter) {
        this.isPlayerNearHelicopter = false;
        this.hudSystem.hideInteractionPrompt();
      }
      return;
    }

    // Get player position from camera (PlayerController uses camera position)
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      Logger.debug('🚁 DEBUG: No player position available');
      return;
    }

    const helicopterPosition = helicopter.position;

    // Use horizontal distance (X,Z) so it works when player is on top of helicopter
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPosition.x - helicopterPosition.x, 2) +
      Math.pow(playerPosition.z - helicopterPosition.z, 2)
    );

    // Always log distance for debugging
    if (Math.random() < 0.1) { // Log 10% of the time to avoid spam
      const fullDistance = playerPosition.distanceTo(helicopterPosition);
      Logger.debug(`🚁 DEBUG: Player pos: (${playerPosition.x.toFixed(1)}, ${playerPosition.y.toFixed(1)}, ${playerPosition.z.toFixed(1)}), Helicopter pos: (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)}), Horizontal distance: ${horizontalDistance.toFixed(1)}m, 3D distance: ${fullDistance.toFixed(1)}m`);
    }

    const isNearNow = horizontalDistance <= this.interactionRadius;

    // Only update UI if proximity state changed
    if (isNearNow !== this.isPlayerNearHelicopter) {
      this.isPlayerNearHelicopter = isNearNow;

      if (this.isPlayerNearHelicopter) {
        Logger.debug(`🚁 ⚡ Player near helicopter (${horizontalDistance.toFixed(1)}m horizontal) - SHOWING PROMPT!`);
        this.hudSystem.showInteractionPrompt('Press E to enter helicopter');
      } else {
        Logger.debug('🚁 ⚡ Player left helicopter area - HIDING PROMPT!');
        this.hudSystem.hideInteractionPrompt();
      }
    }
  }

  // Helicopter entry/exit methods
  tryEnterHelicopter(): void {
    if (!this.playerController) {
      console.warn('🚁 Cannot enter helicopter - no player controller');
      return;
    }

    // Check if player is already in a helicopter
    if (this.playerController.isInHelicopter()) {
      Logger.debug('🚁 Player is already in a helicopter');
      return;
    }

    const helicopter = this.helicopters.get('us_huey');
    if (!helicopter) {
      Logger.debug('🚁 No helicopter available for entry');
      return;
    }

    // Check if player is close enough
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      console.warn('🚁 Cannot get player position for helicopter entry');
      return;
    }

    const helicopterPosition = helicopter.position;
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPosition.x - helicopterPosition.x, 2) +
      Math.pow(playerPosition.z - helicopterPosition.z, 2)
    );

    if (horizontalDistance > this.interactionRadius) {
      Logger.debug(`🚁 Player too far from helicopter (${horizontalDistance.toFixed(1)}m) - must be within ${this.interactionRadius}m`);
      return;
    }

    // Enter the helicopter
    Logger.debug(`🚁 ⚡ PLAYER ENTERING HELICOPTER!`);
    this.playerController.enterHelicopter('us_huey', helicopterPosition.clone());

    // Hide interaction prompt
    if (this.hudSystem) {
      this.hudSystem.hideInteractionPrompt();
    }
  }

  exitHelicopter(): void {
    if (!this.playerController) {
      console.warn('🚁 Cannot exit helicopter - no player controller');
      return;
    }

    if (!this.playerController.isInHelicopter()) {
      Logger.debug('🚁 Player is not in a helicopter');
      return;
    }

    const helicopterId = this.playerController.getHelicopterId();
    const helicopter = helicopterId ? this.helicopters.get(helicopterId) : null;

    if (!helicopter) {
      console.warn('🚁 Cannot find helicopter for exit');
      return;
    }

    // Calculate exit position (beside the helicopter door)
    const helicopterPosition = helicopter.position;
    const exitPosition = helicopterPosition.clone();
    exitPosition.x += 3; // Move 3 units to the right (door side)
    exitPosition.y = helicopterPosition.y; // Same height as helicopter

    // Make sure exit position is above terrain
    if (this.terrainManager) {
      const terrainHeight = this.terrainManager.getHeightAt(exitPosition.x, exitPosition.z);
      exitPosition.y = Math.max(exitPosition.y, terrainHeight + 1.5); // Player height above terrain
    }

    Logger.debug(`🚁 ⚡ PLAYER EXITING HELICOPTER!`);
    this.playerController.exitHelicopter(exitPosition);
  }

  // New method: Update helicopter physics when player is controlling
  private updateHelicopterPhysics(deltaTime: number): void {
    if (!this.playerController || !this.playerController.isInHelicopter()) {
      return; // Only update physics when player is flying
    }

    const helicopterId = this.playerController.getHelicopterId();
    if (!helicopterId) return;

    const helicopter = this.helicopters.get(helicopterId);
    const physics = this.helicopterPhysics.get(helicopterId);

    if (!helicopter || !physics || !this.terrainManager) {
      return;
    }

    // Get control inputs from player controller
    const controls = this.getControlInputs();
    physics.setControls(controls);

    // Get terrain height at helicopter position
    const currentPos = physics.getState().position;
    const terrainHeight = this.terrainManager.getHeightAt(currentPos.x, currentPos.z);

    // Check if helicopter is over a helipad
    let helipadHeight: number | undefined;
    if (this.helipadSystem) {
      const helipadPos = this.helipadSystem.getHelipadPosition('us_helipad');
      if (helipadPos) {
        const distanceToHelipad = Math.sqrt(
          Math.pow(currentPos.x - helipadPos.x, 2) +
          Math.pow(currentPos.z - helipadPos.z, 2)
        );
        // If within helipad radius, use helipad height
        if (distanceToHelipad < 15) { // Helipad collision radius
          helipadHeight = helipadPos.y;
        }
      }
    }

    // Update physics
    physics.update(deltaTime, terrainHeight, helipadHeight);

    // Apply physics state to 3D model
    const state = physics.getState();
    helicopter.position.copy(state.position);

    // Get current control inputs for visual tilt calculation
    const currentControls = physics.getControls();

    // Calculate target visual tilt based on current controls
    const targetTilt = this.calculateVisualTilt(currentControls);
    this.targetTiltQuaternion.set(helicopterId, targetTilt);

    // Smooth interpolation of visual tilt
    const currentVisualTilt = this.visualTiltQuaternion.get(helicopterId)!;
    const targetVisualTilt = this.targetTiltQuaternion.get(helicopterId)!;

    // Use different interpolation rates based on whether we're tilting or leveling
    const hasInput = Math.abs(currentControls.cyclicPitch) > 0.01 || Math.abs(currentControls.cyclicRoll) > 0.01;
    const lerpRate = hasInput ? this.TILT_SMOOTH_RATE : this.AUTO_LEVEL_RATE;

    currentVisualTilt.slerp(targetVisualTilt, Math.min(deltaTime * lerpRate, 1.0));

    // Combine physics rotation with visual tilt
    const finalQuaternion = state.quaternion.clone();
    finalQuaternion.multiply(currentVisualTilt);
    helicopter.quaternion.copy(finalQuaternion);

    // Update player position without affecting camera (camera has its own logic)
    this.playerController.updatePlayerPosition(state.position);
  }

  // Calculate visual tilt quaternion based on control inputs
  private calculateVisualTilt(controls: HelicopterControls): THREE.Quaternion {
    // Convert cyclic control inputs to visual tilt angles
    // cyclicPitch: forward/backward movement -> pitch tilt (rotation around X-axis)
    // cyclicRoll: left/right movement -> roll tilt (rotation around Z-axis)

    // Fixed: 90-degree rotation in axis mapping
    // Arrow Up (cyclicPitch +1) → should tilt forward
    // Arrow Right (cyclicRoll +1) → should tilt right

    // Apply 90-degree rotation: pitch becomes roll, roll becomes pitch
    const pitchAngle = -controls.cyclicRoll * this.MAX_TILT_ANGLE;   // Right input → forward tilt
    const rollAngle = controls.cyclicPitch * this.MAX_TILT_ANGLE;    // Forward input → right tilt

    // Create quaternion from euler angles
    const euler = new THREE.Euler(pitchAngle, 0, rollAngle, 'YXZ');
    return new THREE.Quaternion().setFromEuler(euler);
  }

  // Get control inputs from keyboard/mouse
  private getControlInputs(): Partial<HelicopterControls> {
    // This will be called by the PlayerController to provide input
    // For now, return default values - we'll update PlayerController to provide these
    return {};
  }

  // Initialize helicopter audio system
  private initializeHelicopterAudio(helicopterId: string, helicopter: THREE.Group): void {
    if (!this.audioListener) {
      console.warn('🚁🔊 No audio listener available for helicopter audio');
      return;
    }

    // Create positional audio for helicopter rotor blades
    const rotorAudio = new THREE.PositionalAudio(this.audioListener);

    // Load rotor blade audio
    this.audioLoader.load(
      `${import.meta.env.BASE_URL}assets/RotorBlades.ogg`,
      (buffer) => {
        rotorAudio.setBuffer(buffer);
        rotorAudio.setLoop(true);
        rotorAudio.setVolume(0.0); // Start silent
        rotorAudio.setRefDistance(25); // Can be heard from 25 units away
        rotorAudio.setRolloffFactor(0.8); // Less aggressive rolloff for better audibility
        rotorAudio.setMaxDistance(100); // Ensure it can be heard at reasonable distance

        // Don't start playing immediately - wait for control
        Logger.debug('🚁🔊 Helicopter rotor audio loaded and ready - volume:', rotorAudio.getVolume());
      },
      undefined,
      (error) => {
        console.error('🚁🔊 Failed to load helicopter rotor audio:', error);
      }
    );

    // Attach audio to helicopter
    helicopter.add(rotorAudio);
    this.rotorAudio.set(helicopterId, rotorAudio);
  }

  // Update helicopter audio based on engine state
  private updateHelicopterAudio(helicopterId: string, deltaTime: number): void {
    const rotorAudio = this.rotorAudio.get(helicopterId);
    const physics = this.helicopterPhysics.get(helicopterId);

    if (!rotorAudio) return;

    // Check if player is controlling this helicopter
    const isPlayerControlling = this.playerController &&
                               this.playerController.isInHelicopter() &&
                               this.playerController.getHelicopterId() === helicopterId;

    let targetVolume: number;
    let targetPlaybackRate: number;

    if (isPlayerControlling && physics) {
      // Player is controlling - ensure audio is playing
      if (!rotorAudio.isPlaying) {
        rotorAudio.play();
        Logger.debug('🚁🔊 Starting helicopter rotor audio');
      }

      // Use physics data
      const controls = physics.getControls();
      const state = physics.getState();

      // Calculate volume primarily based on collective (thrust)
      const baseVolume = 0.3; // Always some idle sound
      const thrustVolume = controls.collective * 0.7; // Thrust contributes most to volume
      const engineVolume = state.engineRPM * 0.2; // Engine RPM adds some variation

      targetVolume = Math.min(1.0, baseVolume + thrustVolume + engineVolume);

      // Calculate playback rate based on total engine activity
      const basePlaybackRate = 0.9;
      const thrustRate = controls.collective * 0.3;
      const rpmRate = state.engineRPM * 0.2;

      targetPlaybackRate = basePlaybackRate + thrustRate + rpmRate;

      // Debug logging occasionally
      if (Math.random() < 0.02) { // 2% of frames
        Logger.debug(`🚁🔊 Controlled Audio: collective=${controls.collective.toFixed(2)}, RPM=${state.engineRPM.toFixed(2)}, volume=${targetVolume.toFixed(2)}, rate=${targetPlaybackRate.toFixed(2)}`);
      }
    } else {
      // Helicopter not controlled - stop audio
      if (rotorAudio.isPlaying) {
        rotorAudio.stop();
        Logger.debug('🚁🔊 Stopping helicopter rotor audio');
      }
      targetVolume = 0.0;
      targetPlaybackRate = 0.8;
    }

    // Faster transitions for more responsive audio
    const volumeTransitionSpeed = 4.0 * deltaTime;
    const rateTransitionSpeed = 3.0 * deltaTime;

    // Apply smooth volume changes
    const currentVolume = rotorAudio.getVolume();
    const newVolume = THREE.MathUtils.lerp(currentVolume, targetVolume, volumeTransitionSpeed);
    rotorAudio.setVolume(newVolume);

    // Apply smooth playback rate changes
    try {
      if (rotorAudio.source) {
        const currentRate = rotorAudio.getPlaybackRate();
        const newRate = THREE.MathUtils.lerp(currentRate, targetPlaybackRate, rateTransitionSpeed);
        rotorAudio.setPlaybackRate(newRate);
      }
    } catch (error) {
      // Playback rate control not supported or not ready, skip
    }
  }

  // New method: Update rotor animations
  private updateRotorAnimations(deltaTime: number): void {
    this.helicopters.forEach((helicopter, id) => {
      const physics = this.helicopterPhysics.get(id);
      let targetMainSpeed = 0;
      let targetTailSpeed = 0;

      if (physics) {
        const state = physics.getState();
        // Base rotor speed from engine RPM - more responsive
        targetMainSpeed = state.engineRPM * 20; // Increased for more visible rotation
        targetTailSpeed = targetMainSpeed * 4.5; // Tail rotor spins faster
      }

      // Smooth rotor acceleration
      const currentMainSpeed = this.mainRotorSpeed.get(id) || 0;
      const currentTailSpeed = this.tailRotorSpeed.get(id) || 0;

      const newMainSpeed = THREE.MathUtils.lerp(
        currentMainSpeed,
        targetMainSpeed,
        this.rotorAcceleration * deltaTime
      );

      const newTailSpeed = THREE.MathUtils.lerp(
        currentTailSpeed,
        targetTailSpeed,
        this.rotorAcceleration * deltaTime
      );

      this.mainRotorSpeed.set(id, newMainSpeed);
      this.tailRotorSpeed.set(id, newTailSpeed);

      // Apply rotations to rotor groups
      helicopter.traverse((child) => {
        if (child.userData.type === 'mainBlades') {
          child.rotation.y += newMainSpeed * deltaTime;
        } else if (child.userData.type === 'tailBlades') {
          child.rotation.z += newTailSpeed * deltaTime;
        }
      });

      // Always update helicopter audio (whether player is in it or not)
      this.updateHelicopterAudio(id, deltaTime);
    });
  }

  // Public method for PlayerController to set helicopter controls
  setHelicopterControls(helicopterId: string, controls: Partial<HelicopterControls>): void {
    const physics = this.helicopterPhysics.get(helicopterId);
    if (physics) {
      physics.setControls(controls);
    }
  }

  // Get helicopter physics state for external systems
  getHelicopterState(helicopterId: string) {
    const physics = this.helicopterPhysics.get(helicopterId);
    return physics ? physics.getState() : null;
  }

  dispose(): void {
    // Stop and dispose of audio
    this.rotorAudio.forEach(audio => {
      if (audio.isPlaying) {
        audio.stop();
      }
      audio.disconnect();
    });
    this.rotorAudio.clear();

    this.helicopters.forEach(helicopter => {
      this.scene.remove(helicopter);
      // Dispose of all geometries and materials
      helicopter.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.helicopters.clear();
    this.helicopterPhysics.clear();
    this.mainRotorSpeed.clear();
    this.tailRotorSpeed.clear();
    this.visualTiltQuaternion.clear();
    this.targetTiltQuaternion.clear();

    // Unregister collision objects
    if (this.terrainManager && 'unregisterCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).unregisterCollisionObject('us_huey');
    }

    Logger.debug('🧹 HelicopterModel disposed');
  }
}
