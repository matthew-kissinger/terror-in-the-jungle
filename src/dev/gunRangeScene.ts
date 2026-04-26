/**
 * Lightweight gun range for Pixel Forge hitbox validation.
 *
 * This scene intentionally avoids GameEngine, terrain, AI, vegetation, HUD,
 * audio, and combat120. The visible targets are the Pixel Forge close NPC GLBs,
 * while the wire overlays are driven by the same CombatantBodyMetrics proxy
 * helper used by player hit registration.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CombatantHitDetection } from '../systems/combat/CombatantHitDetection';
import { modelLoader } from '../systems/assets/ModelLoader';
import {
  createCombatantHitProxyScratch,
  writeCombatantHitProxies,
  type CombatantHitProxy,
} from '../systems/combat/CombatantBodyMetrics';
import { CombatantState, Faction, type Combatant } from '../systems/combat/types';
import { NPC_PIXEL_FORGE_VISUAL_HEIGHT, NPC_Y_OFFSET } from '../config/CombatantConfig';
import {
  getPixelForgeNpcRuntimeFaction,
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  sanitizePixelForgeNpcAnimationClip,
  type PixelForgeNpcFactionRuntimeConfig,
} from '../systems/combat/PixelForgeNpcRuntime';

const MAX_RANGE = 90;
const SHOT_LINE_START_DISTANCE = 1.35;
const BARREL_MUZZLE_LOCAL_RIGHT = 0.18;
const BARREL_MUZZLE_LOCAL_UP = -0.14;
const BARREL_MUZZLE_LOCAL_FORWARD = -1.35;

interface GunRangeTargetSpec {
  id: string;
  label: string;
  faction: Faction;
  position: THREE.Vector3;
  scaleY: number;
}

interface GunRangeTarget {
  label: string;
  combatant: Combatant;
  group: THREE.Group;
  modelRoot?: THREE.Group;
  mixer?: THREE.AnimationMixer;
  modelPath?: string;
  modelStatus: 'pending' | 'loaded' | 'error';
}

interface LastShotSummary {
  hit: boolean;
  label: string | null;
  headshot: boolean;
  distance: number | null;
  point: { x: number; y: number; z: number } | null;
}

const TARGET_SPECS: GunRangeTargetSpec[] = [
  { id: 'range-nva-12m', label: 'NVA 12m', faction: Faction.NVA, position: new THREE.Vector3(-2.2, 0, -12), scaleY: 1.0 },
  { id: 'range-vc-22m', label: 'VC 22m', faction: Faction.VC, position: new THREE.Vector3(1.8, 0, -22), scaleY: 1.0 },
  { id: 'range-nva-34m', label: 'NVA tall 34m', faction: Faction.NVA, position: new THREE.Vector3(-0.4, 0, -34), scaleY: 1.15 },
  { id: 'range-vc-48m', label: 'VC small 48m', faction: Faction.VC, position: new THREE.Vector3(3.2, 0, -48), scaleY: 0.85 },
];

export class GunRangeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly hitDetection = new CombatantHitDetection();
  private readonly combatants = new Map<string, Combatant>();
  private readonly targets: GunRangeTarget[] = [];
  private readonly hitProxyScratch = createCombatantHitProxyScratch();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly damageRay = new THREE.Ray();
  private readonly cameraPos = new THREE.Vector3();
  private readonly cameraQuat = new THREE.Quaternion();
  private readonly barrelStart = new THREE.Vector3();
  private readonly damageDisplayStart = new THREE.Vector3();
  private readonly shotFallbackEnd = new THREE.Vector3();
  private readonly bounds = new THREE.Box3();
  private readonly boundsSize = new THREE.Vector3();
  private readonly barrelRig = new THREE.Group();
  private readonly barrelMuzzle = new THREE.Object3D();

  private readonly targetRoot = new THREE.Group();
  private readonly proxyRoot = new THREE.Group();
  private readonly shotRoot = new THREE.Group();
  private readonly overlay: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private animationFrameId: number | null = null;
  private disposed = false;
  private proxiesVisible = true;
  private lastShot: LastShotSummary = { hit: false, label: null, headshot: false, distance: null, point: null };

  private readonly onResize = () => this.handleResize();
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(container: HTMLElement) {
    document.title = 'TIJ Gun Range';
    document.getElementById('boot-splash')?.remove();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / Math.max(window.innerHeight, 1), 0.05, 160);
    this.camera.position.set(0, 2.1, 7.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 2.1, -24);
    this.controls.enableDamping = true;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 70;
    this.controls.update();

    this.scene.background = new THREE.Color(0x20242a);
    this.scene.add(new THREE.HemisphereLight(0xf6fff0, 0x343030, 1.15));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(8, 14, 8);
    this.scene.add(keyLight);

    this.scene.add(this.targetRoot);
    this.scene.add(this.proxyRoot);
    this.scene.add(this.shotRoot);
    this.buildDebugBarrelRig();
    this.buildRange();
    void this.loadGlbTargets();

    this.hitDetection.setQueryProvider(() => TARGET_SPECS.map((target) => target.id));

    this.overlay = this.createOverlay();
    this.crosshair = this.createCrosshair();
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.crosshair);
    this.updateOverlay();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);

    (window as any).advanceTime = (ms: number) => {
      this.step(ms / 1000);
      this.render();
    };
    (window as any).render_game_to_text = () => this.renderToText();
    (window as any).__gunRangeScene = this;
  }

  start(): void {
    const tick = () => {
      if (this.disposed) return;
      this.step(1 / 60);
      this.render();
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = null;
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.overlay.parentElement?.removeChild(this.overlay);
    this.crosshair.parentElement?.removeChild(this.crosshair);
    this.targets.forEach((target) => {
      if (target.modelRoot) {
        modelLoader.disposeInstance(target.modelRoot);
        target.modelRoot = undefined;
      }
    });
    this.disposeObject(this.scene);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
    delete (window as any).__gunRangeScene;
  }

  private step(deltaSeconds: number): void {
    this.controls.update();
    this.syncDebugBarrelRig();
    this.targets.forEach((target) => target.mixer?.update(deltaSeconds));
  }

  private render(): void {
    this.syncDebugBarrelRig();
    this.renderer.render(this.scene, this.camera);
  }

  private buildRange(): void {
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x6f725f, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 72, 8, 24), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -25);
    this.scene.add(floor);

    const grid = new THREE.GridHelper(72, 24, 0x93b879, 0x515c49);
    grid.position.z = -25;
    this.scene.add(grid);

    const backstop = new THREE.Mesh(
      new THREE.BoxGeometry(24, 8, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x4f4a3f, roughness: 0.85 })
    );
    backstop.position.set(0, 4, -56);
    this.scene.add(backstop);

    for (const spec of TARGET_SPECS) {
      const combatant = createRangeCombatant(spec);
      this.combatants.set(combatant.id, combatant);
      const proxies = writeCombatantHitProxies(this.hitProxyScratch, combatant, 'visual');
      const group = this.buildTarget(spec, proxies);
      this.targetRoot.add(group);
      this.targets.push({ label: spec.label, combatant, group, modelStatus: 'pending' });
    }
  }

  private buildDebugBarrelRig(): void {
    this.barrelRig.name = 'GunRangeDebugBarrelRig';
    this.barrelMuzzle.name = 'GunRangeDebugMuzzle';
    this.barrelMuzzle.position.set(
      BARREL_MUZZLE_LOCAL_RIGHT,
      BARREL_MUZZLE_LOCAL_UP,
      BARREL_MUZZLE_LOCAL_FORWARD,
    );

    this.barrelRig.add(this.barrelMuzzle);
    this.scene.add(this.barrelRig);
    this.syncDebugBarrelRig();
  }

  private buildTarget(spec: GunRangeTargetSpec, proxies: CombatantHitProxy[]): THREE.Group {
    const group = new THREE.Group();
    const headProxyMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd257,
      transparent: true,
      opacity: 0.28,
      wireframe: true,
      depthWrite: false,
    });
    const bodyProxyMaterial = new THREE.MeshBasicMaterial({
      color: 0x4bf7ff,
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
    });

    for (const proxy of proxies) {
      const proxyMesh = buildProxyMesh(proxy, proxy.isHead ? headProxyMaterial : bodyProxyMaterial, 1);
      this.proxyRoot.add(proxyMesh);
    }

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.65, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x2e332e, roughness: 0.9 })
    );
    base.position.set(spec.position.x, 0.025, spec.position.z);
    group.add(base);

    return group;
  }

  private async loadGlbTargets(): Promise<void> {
    await Promise.all(this.targets.map((target) => this.loadGlbTarget(target)));
    this.updateOverlay();
  }

  private async loadGlbTarget(target: GunRangeTarget): Promise<void> {
    try {
      const factionConfig = getPixelForgeNpcRuntimeFaction(target.combatant.faction);
      const model = await modelLoader.loadAnimatedModel(factionConfig.modelPath);
      const root = model.scene;
      target.modelPath = factionConfig.modelPath;
      target.modelRoot = root;
      target.mixer = new THREE.AnimationMixer(root);
      root.name = `${target.label} PixelForge GLB`;
      root.traverse((child) => {
        child.frustumCulled = false;
      });
      this.applyCloseModelMaterialTuning(root, factionConfig);
      const metrics = this.measureGlbMetrics(root);
      this.placeGlbTarget(root, target.combatant, metrics);

      const idleClip = model.animations.find((clip) => clip.name === 'idle');
      if (idleClip) {
        target.mixer.clipAction(sanitizePixelForgeNpcAnimationClip(idleClip)).reset().play();
        target.mixer.update(0);
      }

      target.group.add(root);
      target.modelStatus = 'loaded';
    } catch {
      target.modelStatus = 'error';
    }
  }

  private applyCloseModelMaterialTuning(
    root: THREE.Object3D,
    factionConfig: PixelForgeNpcFactionRuntimeConfig,
  ): void {
    const tuning = PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING[factionConfig.packageFaction];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => cloneTunedCloseMaterial(material, tuning));
      } else {
        child.material = cloneTunedCloseMaterial(child.material, tuning);
      }
    });
  }

  private measureGlbMetrics(root: THREE.Object3D): { boundsMinY: number; visualScale: number } {
    root.updateMatrixWorld(true);
    this.bounds.setFromObject(root);
    this.bounds.getSize(this.boundsSize);
    const height = this.boundsSize.y;
    if (!Number.isFinite(height) || height <= 0.01 || !Number.isFinite(this.bounds.min.y)) {
      return { boundsMinY: 0, visualScale: NPC_PIXEL_FORGE_VISUAL_HEIGHT / 1.8 };
    }
    return { boundsMinY: this.bounds.min.y, visualScale: NPC_PIXEL_FORGE_VISUAL_HEIGHT / height };
  }

  private placeGlbTarget(
    root: THREE.Group,
    combatant: Combatant,
    metrics: { boundsMinY: number; visualScale: number },
  ): void {
    const sourcePosition = combatant.renderedPosition ?? combatant.position;
    const terrainY = sourcePosition.y - NPC_Y_OFFSET;
    const scaledMinY = metrics.boundsMinY * metrics.visualScale * combatant.scale.y;
    root.position.set(sourcePosition.x, terrainY - scaledMinY, sourcePosition.z);
    root.rotation.set(0, Math.PI / 2 - combatant.visualRotation, 0);
    root.scale.set(
      combatant.scale.x * metrics.visualScale,
      combatant.scale.y * metrics.visualScale,
      combatant.scale.z * metrics.visualScale,
    );
    root.updateMatrixWorld(true);
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
    );
    this.shootCurrentRay();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
      this.pointerNdc.set(0, 0);
      this.shootCurrentRay();
      return;
    }
    if (event.key.toLowerCase() === 'p') {
      this.proxiesVisible = !this.proxiesVisible;
      this.proxyRoot.visible = this.proxiesVisible;
      this.updateOverlay();
      return;
    }
    if (event.key.toLowerCase() === 'r') {
      this.camera.position.set(0, 2.1, 7.5);
      this.controls.target.set(0, 2.1, -24);
      this.controls.update();
    }
  }

  private shootCurrentRay(): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.damageRay.copy(this.raycaster.ray);
    const result = this.hitDetection.raycastCombatants(this.damageRay, Faction.US, this.combatants, { positionMode: 'visual' });
    const hitPoint = result?.point ?? null;

    this.shotFallbackEnd.copy(this.damageRay.origin).addScaledVector(this.damageRay.direction, MAX_RANGE);
    this.resolveBarrelStart(this.barrelStart);
    this.damageDisplayStart.copy(this.damageRay.origin).addScaledVector(this.damageRay.direction, SHOT_LINE_START_DISTANCE);
    this.drawShot(this.damageDisplayStart, hitPoint ?? this.shotFallbackEnd, this.barrelStart, hitPoint ?? this.shotFallbackEnd, hitPoint);

    this.lastShot = {
      hit: !!result,
      label: result ? this.targets.find((target) => target.combatant.id === result.combatant.id)?.label ?? result.combatant.id : null,
      headshot: result?.headshot ?? false,
      distance: result ? Number(result.distance.toFixed(2)) : null,
      point: hitPoint ? roundPoint(hitPoint) : null,
    };
    this.updateOverlay();
  }

  private resolveBarrelStart(target: THREE.Vector3): THREE.Vector3 {
    this.syncDebugBarrelRig();
    return this.barrelMuzzle.getWorldPosition(target);
  }

  private syncDebugBarrelRig(): void {
    this.camera.getWorldPosition(this.cameraPos);
    this.camera.getWorldQuaternion(this.cameraQuat);
    this.barrelRig.position.copy(this.cameraPos);
    this.barrelRig.quaternion.copy(this.cameraQuat);
    this.barrelRig.updateMatrixWorld(true);
  }

  private drawShot(
    damageStart: THREE.Vector3,
    damageEnd: THREE.Vector3,
    tracerStart: THREE.Vector3,
    tracerEnd: THREE.Vector3,
    hitPoint: THREE.Vector3 | null,
  ): void {
    this.clearGroup(this.shotRoot);
    this.shotRoot.add(buildLine(damageStart, damageEnd, 0xff4c4c));
    this.shotRoot.add(buildLine(tracerStart, tracerEnd, 0x5ca8ff));
    if (hitPoint) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      marker.position.copy(hitPoint);
      this.shotRoot.add(marker);
    }
  }

  private updateOverlay(): void {
    const shot = this.lastShot.hit
      ? `${this.lastShot.headshot ? 'HEAD' : 'BODY'} ${this.lastShot.label} @ ${this.lastShot.distance}m`
      : 'MISS';
    this.overlay.textContent = [
      'PIXEL FORGE GUN RANGE',
      'GLB targets use production Pixel Forge close NPC models.',
      'Left click: mouse ray   Space: crosshair ray',
      'P: toggle proxies   R: reset camera',
      `proxies=${this.proxiesVisible ? 'on' : 'off'}  targets=${this.targets.length}  GLBs=${this.countLoadedModels()}/${this.targets.length}`,
      `last=${shot}`,
      'red=damage/camera ray  blue=debug muzzle/barrel tracer ray',
    ].join('\n');
  }

  private countLoadedModels(): number {
    return this.targets.filter((target) => target.modelStatus === 'loaded').length;
  }

  private renderToText(): string {
    return JSON.stringify({
      mode: 'gun-range',
      coordSystem: 'x=right, y=up, z=forward/back; targets are down negative z',
      proxiesVisible: this.proxiesVisible,
      targetCount: this.targets.length,
      lastShot: this.lastShot,
      camera: roundPoint(this.camera.position),
      targets: this.targets.map((target) => ({
        id: target.combatant.id,
        label: target.label,
        faction: target.combatant.faction,
        position: roundPoint(target.combatant.renderedPosition ?? target.combatant.position),
        scaleY: Number(target.combatant.scale.y.toFixed(2)),
        modelStatus: target.modelStatus,
        modelPath: target.modelPath ?? null,
      })),
    });
  }

  private createOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '12px',
      top: '12px',
      padding: '10px 12px',
      background: 'rgba(7, 9, 10, 0.72)',
      color: '#e7ffe0',
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: '12px',
      lineHeight: '1.45',
      whiteSpace: 'pre',
      pointerEvents: 'none',
      zIndex: '9998',
      border: '1px solid rgba(255,255,255,0.18)',
    } as CSSStyleDeclaration);
    return overlay;
  }

  private createCrosshair(): HTMLDivElement {
    const crosshair = document.createElement('div');
    Object.assign(crosshair.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '18px',
      height: '18px',
      marginLeft: '-9px',
      marginTop: '-9px',
      pointerEvents: 'none',
      zIndex: '9997',
    } as CSSStyleDeclaration);
    crosshair.innerHTML = '<div style="position:absolute;left:8px;top:0;width:2px;height:18px;background:#ffffffcc"></div><div style="position:absolute;left:0;top:8px;width:18px;height:2px;background:#ffffffcc"></div>';
    return crosshair;
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      this.disposeObject(child);
    }
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material?.dispose?.();
      }
    });
  }
}

function createRangeCombatant(spec: GunRangeTargetSpec): Combatant {
  const position = new THREE.Vector3(spec.position.x, NPC_Y_OFFSET, spec.position.z);
  return {
    id: spec.id,
    faction: spec.faction,
    position,
    renderedPosition: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: Math.PI,
    scale: new THREE.Vector3(1, spec.scaleY, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.ENGAGING,
    isDying: false,
  } as unknown as Combatant;
}

function cloneTunedCloseMaterial(
  material: THREE.Material,
  tuning: Record<string, number> | undefined,
): THREE.Material {
  const cloned = material.clone();
  if (cloned instanceof THREE.MeshStandardMaterial) {
    const materialNameParts = cloned.name.split('_');
    const materialToken = materialNameParts[materialNameParts.length - 1];
    const tunedColor = materialToken && tuning ? tuning[materialToken] : undefined;
    if (tunedColor !== undefined) {
      cloned.color.setHex(tunedColor);
    }
    const isUniformSurface =
      materialToken === 'uniform' ||
      materialToken === 'trousers' ||
      materialToken === 'headgear' ||
      materialToken === 'accent';
    if (isUniformSurface) {
      cloned.color.offsetHSL(0, 0.08, 0.1);
    }
    cloned.emissive.copy(cloned.color).multiplyScalar(isUniformSurface ? 0.16 : 0.06);
    cloned.emissiveIntensity = isUniformSurface ? 0.28 : 0.1;
    cloned.roughness = Math.max(cloned.roughness, 0.9);
    cloned.metalness = 0;
    cloned.needsUpdate = true;
  }
  return cloned;
}

function buildProxyMesh(proxy: CombatantHitProxy, material: THREE.Material, radiusScale: number): THREE.Mesh {
  if (proxy.kind === 'sphere') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(proxy.radius * radiusScale, 16, 10), material);
    mesh.position.copy(proxy.center);
    return mesh;
  }

  const direction = new THREE.Vector3().subVectors(proxy.end, proxy.start);
  const length = Math.max(direction.length(), 0.001);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(proxy.radius * radiusScale, length, 6, 12),
    material
  );
  mesh.position.copy(proxy.start).add(proxy.end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildLine(start: THREE.Vector3, end: THREE.Vector3, color: number): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 })
  );
}

function roundPoint(point: THREE.Vector3): { x: number; y: number; z: number } {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2)),
    z: Number(point.z.toFixed(2)),
  };
}
