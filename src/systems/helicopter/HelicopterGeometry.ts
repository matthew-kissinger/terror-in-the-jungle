import * as THREE from 'three';
import { modelLoader } from '../assets/ModelLoader';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
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

type RotorAnimationType = 'mainBlades' | 'tailBlades';

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

  const { scene, animations } = await modelLoader.loadAnimatedModel(modelPath);

  // Rotate GLB -90 degrees so nose faces forward in game space
  scene.rotation.y = -Math.PI / 2;

  const helicopterGroup = new THREE.Group();
  helicopterGroup.add(scene);

  wireRotorGroups(scene, helicopterGroup, animations);
  optimizeAircraftScene(scene, aircraftKey);

  helicopterGroup.userData = {
    type: 'helicopter',
    model: displayName,
    faction,
    id: helicopterId,
  };

  return helicopterGroup;
}

// ─── Rotor wiring ─────────────────────────────────────────────────────────

function wireRotorGroups(
  scene: THREE.Group,
  helicopterGroup: THREE.Group,
  animations: THREE.AnimationClip[],
): void {
  const animationAxes = inferSpinAxesFromAnimationClips(animations);
  const mainBladeNodes: THREE.Object3D[] = [];
  const tailBladeNodes: THREE.Object3D[] = [];
  let rotorHub: THREE.Object3D | undefined;

  scene.traverse((child) => {
    const name = child.name.toLowerCase();
    const rotorType = getRotorAnimationType(name);

    if (rotorType) {
      child.userData.type = rotorType;
      child.userData.spinAxis = animationAxes.get(name) ?? (rotorType === 'mainBlades' ? 'y' : 'x');
    }

    if (isMainRotorPartName(name)) {
      mainBladeNodes.push(child);
    } else if (isTailRotorPartName(name)) {
      tailBladeNodes.push(child);
    }

    if (isRotorHubName(name)) {
      rotorHub = child;
    }
  });

  const hasGroupedMain = hasRotorAnimationRoot(scene, 'mainBlades');
  if (mainBladeNodes.length > 0 && !hasGroupedMain) {
    groupBladesUnderParent(scene, mainBladeNodes, 'mainBlades', rotorHub);
  }

  const hasGroupedTail = hasRotorAnimationRoot(scene, 'tailBlades');
  if (tailBladeNodes.length > 0 && !hasGroupedTail) {
    groupBladesUnderParent(scene, tailBladeNodes, 'tailBlades');
  }

  // Synthetic fallbacks if no blades found at all
  if (mainBladeNodes.length === 0 && !hasGroupedMain) {
    const mainBlades = createSyntheticMainRotor();
    mainBlades.userData.spinAxis = 'y';
    mainBlades.position.set(0, 4.5, 0);
    helicopterGroup.add(mainBlades);
    Logger.debug('helicopter', 'Added synthetic main rotor blades');
  }
  if (tailBladeNodes.length === 0 && !hasGroupedTail) {
    const tailBlades = createSyntheticTailRotor();
    tailBlades.userData.spinAxis = 'x';
    tailBlades.position.set(-6, 2.5, 0);
    helicopterGroup.add(tailBlades);
    Logger.debug('helicopter', 'Added synthetic tail rotor blades');
  }
}

function inferSpinAxesFromAnimationClips(animations: THREE.AnimationClip[]): Map<string, 'x' | 'y' | 'z'> {
  const axes = new Map<string, 'x' | 'y' | 'z'>();
  for (const clip of animations) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.quaternion') || track.values.length < 8) {
        continue;
      }
      const nodeName = track.name.slice(0, -'.quaternion'.length).toLowerCase();
      const axis = inferQuaternionTrackAxis(track.values);
      if (axis) {
        axes.set(nodeName, axis);
      }
    }
  }
  return axes;
}

function inferQuaternionTrackAxis(values: ArrayLike<number>): 'x' | 'y' | 'z' | null {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (let i = 0; i + 3 < values.length; i += 4) {
    maxX = Math.max(maxX, Math.abs(values[i]));
    maxY = Math.max(maxY, Math.abs(values[i + 1]));
    maxZ = Math.max(maxZ, Math.abs(values[i + 2]));
  }

  if (maxX < 0.5 && maxY < 0.5 && maxZ < 0.5) {
    return null;
  }
  if (maxX >= maxY && maxX >= maxZ) return 'x';
  if (maxY >= maxX && maxY >= maxZ) return 'y';
  return 'z';
}

function optimizeAircraftScene(scene: THREE.Group, aircraftKey: string): void {
  const result = optimizeStaticModelDrawCalls(scene, {
    batchNamePrefix: `${aircraftKey.toLowerCase()}_static`,
    excludeMesh: (mesh) => isHelicopterAnimatedRotorMesh(mesh),
  });

  if (result.sourceMeshCount > 0) {
    Logger.info(
      'helicopter',
      `Optimized ${aircraftKey} draw calls: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} batches`,
    );
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
  if (hub && !bladeNodes.includes(hub)) {
    const worldPos = hub.getWorldPosition(new THREE.Vector3());
    scene.worldToLocal(worldPos);
    hub.removeFromParent();
    hub.position.sub(pivot);
    group.add(hub);
  }
  scene.add(group);
  Logger.debug('helicopter', `Grouped ${bladeNodes.length} ${groupName} meshes under spin parent`);
}

function getRotorAnimationType(name: string): RotorAnimationType | null {
  if (
    name.includes('mainrotor')
    || name.includes('main_rotor')
    || name.includes('mainblades')
    || name.includes('main_blades')
  ) {
    return 'mainBlades';
  }

  if (
    name.includes('tailrotor')
    || name.includes('tail_rotor')
    || name.includes('tailblades')
    || name.includes('tail_blades')
  ) {
    return 'tailBlades';
  }

  return null;
}

function hasRotorAnimationRoot(scene: THREE.Object3D, rotorType: RotorAnimationType): boolean {
  let found = false;
  scene.traverse((child) => {
    if (child.userData.type === rotorType) {
      found = true;
    }
  });
  return found;
}

function isMainRotorPartName(name: string): boolean {
  return name.includes('mainblade')
    || name.includes('mainrotor')
    || name.includes('main_rotor')
    || name.includes('mrblade')
    || name.includes('mrhub')
    || name.includes('mrtip')
    || name.includes('rotormast');
}

function isTailRotorPartName(name: string): boolean {
  return name.includes('tailblade')
    || name.includes('tailrotor')
    || name.includes('tail_rotor')
    || name.includes('trblade')
    || name.includes('trhub')
    || name.includes('trtip');
}

function isRotorHubName(name: string): boolean {
  return name.includes('rotorhub')
    || name.includes('mrhub')
    || name.includes('trhub');
}

export function isHelicopterAnimatedRotorMesh(mesh: THREE.Mesh): boolean {
  const name = mesh.name.toLowerCase();
  if (isMainRotorPartName(name) || isTailRotorPartName(name) || isRotorHubName(name)) {
    return true;
  }

  let current: THREE.Object3D | null = mesh;
  while (current) {
    if (current.userData.type === 'mainBlades' || current.userData.type === 'tailBlades') {
      return true;
    }
    current = current.parent;
  }

  return false;
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
