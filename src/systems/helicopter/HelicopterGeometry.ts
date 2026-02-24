import * as THREE from 'three';
import { modelLoader } from '../assets/ModelLoader';
import { AircraftModels } from '../assets/modelPaths';
import { Logger } from '../../utils/Logger';

/**
 * Aircraft metadata for display and identification.
 */
interface AircraftInfo {
  modelPath: string;
  displayName: string;
  faction: string;
}

const AIRCRAFT_INFO: Record<string, AircraftInfo> = {
  UH1_HUEY:      { modelPath: AircraftModels.UH1_HUEY,      displayName: 'UH-1 Huey',      faction: 'US' },
  UH1C_GUNSHIP:  { modelPath: AircraftModels.UH1C_GUNSHIP,  displayName: 'UH-1C Gunship',  faction: 'US' },
  AH1_COBRA:     { modelPath: AircraftModels.AH1_COBRA,      displayName: 'AH-1 Cobra',     faction: 'US' },
  AC47_SPOOKY:   { modelPath: AircraftModels.AC47_SPOOKY,    displayName: 'AC-47 Spooky',   faction: 'US' },
  F4_PHANTOM:    { modelPath: AircraftModels.F4_PHANTOM,      displayName: 'F-4 Phantom',    faction: 'US' },
  A1_SKYRAIDER:  { modelPath: AircraftModels.A1_SKYRAIDER,    displayName: 'A-1 Skyraider',  faction: 'US' },
};

/**
 * Load any aircraft GLB and wire rotor groups for animation.
 *
 * All GLBs face +Z (Y-up). Rotated -90° Y so nose faces forward.
 * HelicopterAnimation.updateRotors() looks for children with
 * userData.type === 'mainBlades' / 'tailBlades' and spins them.
 *
 * Blade meshes named MainRotor/MainBlade and TailRotor/TailBlade
 * are auto-grouped under spin parents. Synthetic blades are added as fallback.
 */
export async function createHelicopterGeometry(
  aircraftKey: string,
  helicopterId: string,
): Promise<THREE.Group> {
  const info = AIRCRAFT_INFO[aircraftKey];
  if (!info) {
    Logger.warn('helicopter', `Unknown aircraft key "${aircraftKey}", falling back to UH1_HUEY`);
  }
  const { modelPath, displayName, faction } = info ?? AIRCRAFT_INFO.UH1_HUEY;

  const scene = await modelLoader.loadModel(modelPath);

  // Rotate GLB -90 degrees so nose faces forward in game space
  scene.rotation.y = -Math.PI / 2;

  const helicopterGroup = new THREE.Group();
  helicopterGroup.add(scene);

  wireRotorGroups(scene, helicopterGroup);

  helicopterGroup.userData = {
    type: 'helicopter',
    model: displayName,
    faction,
    id: helicopterId,
  };

  return helicopterGroup;
}

/** Legacy wrapper kept for backward compatibility. */
export async function createUH1HueyGeometry(): Promise<THREE.Group> {
  return createHelicopterGeometry('UH1_HUEY', 'us_huey');
}

// ─── Rotor wiring ─────────────────────────────────────────────────────────

function wireRotorGroups(scene: THREE.Group, helicopterGroup: THREE.Group): void {
  const mainBladeNodes: THREE.Object3D[] = [];
  const tailBladeNodes: THREE.Object3D[] = [];
  let rotorHub: THREE.Object3D | undefined;

  scene.traverse((child) => {
    const name = child.name.toLowerCase();

    // Match grouped rotor parts (if model already has a spin group)
    if (name.includes('mainrotor') || name.includes('main_rotor') || name.includes('mainblades') || name.includes('main_blades')) {
      child.userData.type = 'mainBlades';
    } else if (name.includes('tailrotor') || name.includes('tail_rotor') || name.includes('tailblades') || name.includes('tail_blades')) {
      child.userData.type = 'tailBlades';
    }

    // Match individual blade/rotor meshes
    if (name.includes('mainblade') || name.includes('mainrotor')) {
      mainBladeNodes.push(child);
    } else if (name.includes('tailblade') || name.includes('tailrotor')) {
      tailBladeNodes.push(child);
    } else if (name.includes('rotorhub')) {
      rotorHub = child;
    }
  });

  // Group individual main blades under a single spin parent
  const hasGroupedMain = !!helicopterGroup.getObjectByName('mainBlades') ||
    Array.from(helicopterGroup.children).some(c => c.userData.type === 'mainBlades');
  if (mainBladeNodes.length > 0 && !hasGroupedMain) {
    groupBladesUnderParent(scene, mainBladeNodes, 'mainBlades', rotorHub);
  }

  // Group individual tail blades
  const hasGroupedTail = Array.from(helicopterGroup.children).some(c => c.userData.type === 'tailBlades');
  if (tailBladeNodes.length > 0 && !hasGroupedTail) {
    groupBladesUnderParent(scene, tailBladeNodes, 'tailBlades');
  }

  // Synthetic fallbacks if no blades found at all
  if (mainBladeNodes.length === 0 && !hasGroupedMain) {
    const mainBlades = createSyntheticMainRotor();
    mainBlades.position.set(0, 4.5, 0);
    helicopterGroup.add(mainBlades);
    Logger.debug('helicopter', 'Added synthetic main rotor blades');
  }
  if (tailBladeNodes.length === 0 && !hasGroupedTail) {
    const tailBlades = createSyntheticTailRotor();
    tailBlades.position.set(-6, 2.5, 0);
    helicopterGroup.add(tailBlades);
    Logger.debug('helicopter', 'Added synthetic tail rotor blades');
  }
}

function groupBladesUnderParent(
  scene: THREE.Group,
  bladeNodes: THREE.Object3D[],
  groupName: string,
  hub?: THREE.Object3D,
): void {
  const group = new THREE.Group();
  group.name = groupName;
  group.userData.type = groupName;

  const pivot = hub
    ? hub.getWorldPosition(new THREE.Vector3())
    : bladeNodes[0].getWorldPosition(new THREE.Vector3());
  scene.worldToLocal(pivot);
  group.position.copy(pivot);

  for (const blade of bladeNodes) {
    const worldPos = blade.getWorldPosition(new THREE.Vector3());
    scene.worldToLocal(worldPos);
    blade.removeFromParent();
    blade.position.sub(pivot);
    group.add(blade);
  }
  if (hub) {
    const worldPos = hub.getWorldPosition(new THREE.Vector3());
    scene.worldToLocal(worldPos);
    hub.removeFromParent();
    hub.position.sub(pivot);
    group.add(hub);
  }
  scene.add(group);
  Logger.debug('helicopter', `Grouped ${bladeNodes.length} ${groupName} meshes under spin parent`);
}

// ─── Synthetic fallback rotors ────────────────────────────────────────────

function createSyntheticMainRotor(): THREE.Group {
  const bladesGroup = new THREE.Group();
  bladesGroup.userData = { type: 'mainBlades' };

  const blackMetal = 0x222222;
  const bladeGeometry = new THREE.BoxGeometry(8.5, 0.06, 0.28);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  bladesGroup.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade2.rotation.y = Math.PI / 2;
  bladesGroup.add(blade2);

  return bladesGroup;
}

function createSyntheticTailRotor(): THREE.Group {
  const bladesGroup = new THREE.Group();
  bladesGroup.userData = { type: 'tailBlades' };

  const blackMetal = 0x222222;
  const bladeGeometry = new THREE.BoxGeometry(0.04, 1.4, 0.06);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade1.position.set(0, 0.7, 0);
  bladesGroup.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade2.position.set(0, -0.7, 0);
  bladesGroup.add(blade2);

  return bladesGroup;
}
