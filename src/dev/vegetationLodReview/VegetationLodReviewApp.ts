// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Vegetation LOD visual acceptance route (dev-only).
 *
 * Compares each vegetation-library source GLB against the far representation
 * used by runtime LOD: the current foliage-card static impostor path and the
 * previous surface-normal lighting path for sparse heroes, or the current
 * MeshStandardMaterial ground-card path for dense cover. The lighting/fog
 * presets update the same rig bindings that production TSL impostor materials
 * read, so screenshots exercise the real material graph instead of a 2D mock.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelLoader } from '../../systems/assets/ModelLoader';
import {
  LightingRigConfig,
  lightingRigBindings,
} from '../../systems/environment/LightingRig';
import {
  createStaticImpostorNodeMaterial,
  type StaticImpostorNodeMaterial,
  type StaticImpostorMaterialTextures,
} from '../../systems/world/staticImpostors/StaticImpostorMaterial';
import {
  createWebGPURenderer,
  initializeCommonRenderer,
  inspectResolvedRendererBackend,
  type CommonRenderer,
} from '../../core/RendererBackend';
import type { StaticImpostorArchetype } from '../../config/staticImpostorArchetypes';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import {
  buildVegetationLodReviewEntries,
  getVegetationLodReviewEntry,
  orderedVegetationLodReviewSlugs,
  type VegetationLodReviewEntry,
} from './vegetationLodReviewCatalog';
import { Logger } from '../../utils/Logger';

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
type ReviewStage = 'daylight' | 'low-sun' | 'humid-fog';
type ReviewColumn = 'source' | 'surface-normal' | 'foliage-card' | 'ground-card';

interface ReviewLightingPreset {
  readonly label: string;
  readonly background: THREE.ColorRepresentation;
  readonly sunDirection: THREE.Vector3;
  readonly sunRadiance: THREE.ColorRepresentation;
  readonly skyIrradiance: THREE.ColorRepresentation;
  readonly groundIrradiance: THREE.ColorRepresentation;
  readonly ambientRadiance: THREE.ColorRepresentation;
  readonly exposure: number;
  readonly fogColor: THREE.ColorRepresentation;
  readonly fogDensity: number;
}

interface ReviewApi {
  selectAsset(slug: string): Promise<void>;
  setStage(stage: string): void;
  slugs(): string[];
  stages(): string[];
  loadStatus(): LoadStatus;
  state(): ReviewState;
}

interface ReviewState {
  mode: 'vegetation-lod-review';
  slug: string | null;
  kind: string | null;
  stage: ReviewStage;
  loadStatus: LoadStatus;
  rendererBackend: string;
  sourceMeshCount: number;
  previewMeshCount: number;
  columns: ReviewColumn[];
  totalAssets: number;
}

const PRESETS: Record<ReviewStage, ReviewLightingPreset> = {
  daylight: {
    label: 'daylight haze',
    background: 0x8fa59d,
    sunDirection: new THREE.Vector3(0.42, 0.82, 0.28).normalize(),
    sunRadiance: new THREE.Color(1.15, 1.08, 0.88),
    skyIrradiance: new THREE.Color(0.56, 0.66, 0.86),
    groundIrradiance: new THREE.Color(0.22, 0.25, 0.18),
    ambientRadiance: new THREE.Color(0.02, 0.025, 0.022),
    exposure: 0.98,
    fogColor: 0x6d8378,
    fogDensity: 0.00035,
  },
  'low-sun': {
    label: 'low warm sun',
    background: 0x806f5d,
    sunDirection: new THREE.Vector3(0.78, 0.12, -0.34).normalize(),
    sunRadiance: new THREE.Color(1.75, 0.92, 0.38),
    skyIrradiance: new THREE.Color(0.34, 0.42, 0.58),
    groundIrradiance: new THREE.Color(0.24, 0.20, 0.14),
    ambientRadiance: new THREE.Color(0.045, 0.05, 0.055),
    exposure: 1.35,
    fogColor: 0x736551,
    fogDensity: 0.00075,
  },
  'humid-fog': {
    label: 'humid fog',
    background: 0x5f746e,
    sunDirection: new THREE.Vector3(0.22, 0.55, 0.42).normalize(),
    sunRadiance: new THREE.Color(0.82, 0.84, 0.72),
    skyIrradiance: new THREE.Color(0.42, 0.50, 0.55),
    groundIrradiance: new THREE.Color(0.18, 0.22, 0.18),
    ambientRadiance: new THREE.Color(0.045, 0.055, 0.052),
    exposure: 1.08,
    fogColor: 0x5f746e,
    fogDensity: 0.00135,
  },
};

const COLUMN_LABELS: Record<ReviewColumn, string> = {
  source: 'source GLB',
  'surface-normal': 'old surface-normal impostor',
  'foliage-card': 'current foliage-card impostor',
  'ground-card': 'current ground card',
};

const STAGES = Object.keys(PRESETS) as ReviewStage[];
const HUMAN_REFERENCE_HEIGHT = 1.8;

export class VegetationLodReviewApp {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly entries: VegetationLodReviewEntry[] = buildVegetationLodReviewEntries();
  private readonly slugs: string[] = orderedVegetationLodReviewSlugs(this.entries);
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly previewRoot = new THREE.Group();
  private readonly sourceRoot = new THREE.Group();
  private readonly helperRoot = new THREE.Group();
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, 2);
  private readonly hemiLight = new THREE.HemisphereLight(0xffffff, 0x404040, 0.8);
  private readonly ambientLight = new THREE.AmbientLight(0xffffff, 1);
  private readonly infoChip = document.createElement('div');
  private readonly controlsBar = document.createElement('div');
  private readonly staticMaterials: StaticImpostorNodeMaterial[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly columns: ReviewColumn[] = [];
  private readonly bounds = new THREE.Box3();
  private readonly boundsSize = new THREE.Vector3();
  private readonly boundsCenter = new THREE.Vector3();

  private currentEntry: VegetationLodReviewEntry | null = null;
  private currentSource: THREE.Object3D | null = null;
  private loadStatus: LoadStatus = 'idle';
  private rendererBackend = 'unknown';
  private stage: ReviewStage = 'daylight';
  private animationFrameId: number | null = null;
  private disposed = false;
  private loadGeneration = 0;

  private readonly onResize = () => this.handleResize();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  private constructor(
    private readonly container: HTMLElement,
    private readonly renderer: CommonRenderer,
  ) {
    document.title = 'TIJ Vegetation LOD Review';
    document.getElementById('boot-splash')?.remove();

    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / Math.max(window.innerHeight, 1), 0.05, 900);
    this.camera.position.set(9, 5, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 2, 0);

    this.scene.add(this.previewRoot);
    this.scene.add(this.sourceRoot);
    this.scene.add(this.helperRoot);
    this.buildStaticScene();
    this.buildHud();
    this.applyStage('daylight');

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    this.exposeApi();
  }

  static async create(container: HTMLElement): Promise<VegetationLodReviewApp> {
    const { renderer } = await createWebGPURenderer('webgpu');
    await initializeCommonRenderer(renderer);
    const app = new VegetationLodReviewApp(container, renderer);
    app.rendererBackend = inspectResolvedRendererBackend(renderer);
    return app;
  }

  start(initialSlug?: string | null, initialStage?: string | null): void {
    this.applyStage(normalizeStage(initialStage));
    const initial = getVegetationLodReviewEntry(initialSlug, this.entries) ?? this.entries[0] ?? null;
    if (initial) void this.selectAsset(initial.slug);

    let last = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      this.step((now - last) / 1000);
      last = now;
      this.render();
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  async selectAsset(slug: string): Promise<void> {
    const entry = getVegetationLodReviewEntry(slug, this.entries);
    if (!entry) return;

    const generation = ++this.loadGeneration;
    this.currentEntry = entry;
    this.loadStatus = 'loading';
    this.clearPreview();
    this.updateHud();

    try {
      const spacing = this.spacingFor(entry);
      const source = await modelLoader.loadModelFromUrl(entry.meshPath);
      if (this.disposed || generation !== this.loadGeneration) {
        modelLoader.disposeInstance(source);
        return;
      }
      this.currentSource = source;
      this.prepareSourceModel(source, -spacing);
      this.sourceRoot.add(source);
      this.columns.push('source');

      if (entry.kind === 'octaImpostor' && entry.staticArchetype) {
        await this.addStaticImpostorPreview(entry.staticArchetype, 0, 'surface-normal');
        await this.addStaticImpostorPreview(entry.staticArchetype, spacing, 'foliage-card');
      } else if (entry.kind === 'groundCard' && entry.groundCard) {
        await this.addGroundCardPreview(entry.groundCard, 0);
      }

      if (this.disposed || generation !== this.loadGeneration) return;
      this.frameView(entry, spacing);
      this.loadStatus = 'loaded';
    } catch (error) {
      Logger.error('vegetation-lod-review', 'Asset load failed', error);
      this.loadStatus = 'error';
    }
    this.updateHud();
  }

  setStage(stage: string): void {
    this.applyStage(normalizeStage(stage));
    this.updateHud();
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.clearPreview();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.infoChip.remove();
    this.controlsBar.remove();
    delete (window as unknown as { __vegetationLodReview?: unknown }).__vegetationLodReview;
    delete (window as unknown as { render_game_to_text?: unknown }).render_game_to_text;
  }

  private buildStaticScene(): void {
    this.scene.add(this.sunLight);
    this.scene.add(this.hemiLight);
    this.scene.add(this.ambientLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 40),
      new THREE.MeshStandardMaterial({ color: 0x465044, roughness: 0.96, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.helperRoot.add(floor);

    const grid = new THREE.GridHelper(80, 40, 0x6f7d66, 0x40483c);
    this.helperRoot.add(grid);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, HUMAN_REFERENCE_HEIGHT, 10),
      new THREE.MeshStandardMaterial({ color: 0xd6c588, roughness: 0.8 }),
    );
    post.position.set(-1.2, HUMAN_REFERENCE_HEIGHT / 2, -3.2);
    this.helperRoot.add(post);
  }

  private buildHud(): void {
    Object.assign(this.infoChip.style, {
      position: 'fixed',
      right: '14px',
      top: '14px',
      width: '360px',
      padding: '12px 14px',
      background: 'rgba(12, 14, 13, 0.84)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px',
      fontFamily: '"Courier Prime", Consolas, monospace',
      fontSize: '12px',
      lineHeight: '1.45',
      color: '#e7ffe0',
      whiteSpace: 'pre-wrap',
      zIndex: '9998',
    } as CSSStyleDeclaration);

    Object.assign(this.controlsBar.style, {
      position: 'fixed',
      left: '14px',
      bottom: '14px',
      padding: '8px 12px',
      background: 'rgba(12, 14, 13, 0.74)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      fontFamily: '"Courier Prime", Consolas, monospace',
      fontSize: '11px',
      color: '#cfe9c4',
      whiteSpace: 'pre',
      zIndex: '9998',
    } as CSSStyleDeclaration);
    this.controlsBar.textContent = 'drag: orbit   wheel: zoom   [ ]: asset   1/2/3: lighting stage';

    document.body.appendChild(this.infoChip);
    document.body.appendChild(this.controlsBar);
    this.updateHud();
  }

  private applyStage(stage: ReviewStage): void {
    const preset = PRESETS[stage];
    this.stage = stage;
    LightingRigConfig.enabled = true;
    lightingRigBindings.rigEnabled.value = 1;
    lightingRigBindings.sunDirection.value.copy(preset.sunDirection);
    lightingRigBindings.sunRadiance.value.copy(toColor(preset.sunRadiance));
    lightingRigBindings.skyIrradiance.value.copy(toColor(preset.skyIrradiance));
    lightingRigBindings.groundIrradiance.value.copy(toColor(preset.groundIrradiance));
    lightingRigBindings.ambientRadiance.value.copy(toColor(preset.ambientRadiance));
    lightingRigBindings.exposure.value = preset.exposure;
    lightingRigBindings.sunElevationSin.value = preset.sunDirection.y;
    lightingRigBindings.fogColor.value.copy(toColor(preset.fogColor));

    this.scene.background = toColor(preset.background);
    this.scene.fog = new THREE.FogExp2(toColor(preset.fogColor), preset.fogDensity);
    this.sunLight.position.copy(preset.sunDirection).multiplyScalar(80);
    this.sunLight.color.copy(toColor(preset.sunRadiance)).multiplyScalar(preset.exposure / 2);
    this.hemiLight.color.copy(toColor(preset.skyIrradiance)).multiplyScalar(preset.exposure / 0.8);
    this.hemiLight.groundColor.copy(toColor(preset.groundIrradiance)).multiplyScalar(preset.exposure / 0.8);
    this.ambientLight.color.copy(toColor(preset.ambientRadiance)).multiplyScalar(preset.exposure);
    for (const material of this.staticMaterials) {
      this.applyFogUniforms(material);
    }
  }

  private async addStaticImpostorPreview(
    archetype: StaticImpostorArchetype,
    x: number,
    column: Extract<ReviewColumn, 'surface-normal' | 'foliage-card'>,
  ): Promise<void> {
    const textures = await this.loadStaticTextures(archetype);
    const geometry = buildInstancedPlaneGeometry();
    this.ownedGeometries.push(geometry);

    const width = Math.hypot(archetype.bounds.size[0], archetype.bounds.size[2]) * archetype.planePaddingScale;
    const height = Math.max(archetype.bounds.size[1], 0.1) * archetype.planePaddingScale;
    const positionAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array([x, Math.max(height * 0.5, archetype.bounds.center[1]), 0]),
      3,
    );
    const scaleAttribute = new THREE.InstancedBufferAttribute(new Float32Array([width, height]), 2);
    const yawAttribute = new THREE.InstancedBufferAttribute(new Float32Array([0]), 1);
    geometry.setAttribute('instancePosition', positionAttribute);
    geometry.setAttribute('instanceScale', scaleAttribute);
    geometry.setAttribute('instanceYaw', yawAttribute);
    geometry.instanceCount = 1;

    const reviewArchetype: StaticImpostorArchetype = {
      ...archetype,
      lightingProfile: column === 'foliage-card' ? 'foliage-card' : 'surface-normal',
    };
    const material = createStaticImpostorNodeMaterial(
      reviewArchetype,
      textures,
      positionAttribute,
      scaleAttribute,
      yawAttribute,
    );
    this.applyFogUniforms(material);
    this.staticMaterials.push(material);
    this.ownedMaterials.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `vegetation-review:${archetype.slug}:${column}`;
    mesh.frustumCulled = false;
    this.previewRoot.add(mesh);
    this.columns.push(column);
  }

  private async addGroundCardPreview(archetype: VegetationGroundCardArchetype, x: number): Promise<void> {
    const map = await this.loadTexture(archetype.card.baseColor, THREE.SRGBColorSpace);
    const material = new THREE.MeshStandardMaterial({
      map,
      alphaTest: 0.5,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    material.fog = true;
    this.ownedMaterials.push(material);

    const geometry = buildGroundCardCrossGeometry();
    this.ownedGeometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `vegetation-review:${archetype.slug}:ground-card`;
    mesh.position.set(x, 0, 0);
    mesh.scale.set(archetype.cardWorldSize[0], archetype.cardWorldSize[1], archetype.cardWorldSize[0]);
    this.previewRoot.add(mesh);
    this.columns.push('ground-card');
  }

  private async loadStaticTextures(archetype: StaticImpostorArchetype): Promise<StaticImpostorMaterialTextures> {
    const [baseColorMap, normalMap, depthMap] = await Promise.all([
      this.loadTexture(archetype.maps.baseColor, THREE.SRGBColorSpace),
      this.loadTexture(archetype.maps.normal, THREE.NoColorSpace),
      this.loadTexture(archetype.maps.depth, THREE.NoColorSpace),
    ]);
    return { baseColorMap, normalMap, depthMap };
  }

  private loadTexture(path: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => {
          texture.colorSpace = colorSpace;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          texture.needsUpdate = true;
          this.ownedTextures.push(texture);
          resolve(texture);
        },
        undefined,
        (error) => reject(error),
      );
    });
  }

  private prepareSourceModel(model: THREE.Object3D, x: number): void {
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    this.bounds.setFromObject(model);
    this.bounds.getCenter(this.boundsCenter);
    model.position.x -= this.boundsCenter.x;
    model.position.z -= this.boundsCenter.z;
    model.position.y -= this.bounds.min.y;
    model.position.x += x;
    model.updateMatrixWorld(true);
  }

  private spacingFor(entry: VegetationLodReviewEntry): number {
    const size = entry.staticArchetype?.bounds.size ?? entry.groundCard?.bounds.size ?? [3, 3, 3];
    const radius = Math.hypot(size[0], size[1], size[2]) * 0.5;
    return Math.max(5, radius * 1.55);
  }

  private frameView(entry: VegetationLodReviewEntry, spacing: number): void {
    const size = entry.staticArchetype?.bounds.size ?? entry.groundCard?.bounds.size ?? [3, 3, 3];
    this.boundsSize.set(size[0], size[1], size[2]);
    const height = Math.max(this.boundsSize.y, 1);
    const span = entry.kind === 'octaImpostor' ? spacing * 2 : spacing;
    const radius = Math.max(span * 0.8, height * 1.8, 6);
    this.controls.target.set(0, height * 0.48, 0);
    // Keep the comparison columns nearly equidistant from the camera so fog
    // differences come from the material/preset, not side-by-side placement.
    this.camera.position.set(0, height * 0.72 + 2.2, radius * 2.45);
    this.camera.near = Math.max(0.02, radius / 300);
    this.camera.far = Math.max(300, radius * 60);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private clearPreview(): void {
    if (this.currentSource) {
      modelLoader.disposeInstance(this.currentSource);
      this.currentSource = null;
    }
    this.sourceRoot.clear();
    this.previewRoot.clear();
    this.staticMaterials.length = 0;
    this.columns.length = 0;
    for (const material of this.ownedMaterials.splice(0)) material.dispose();
    for (const texture of this.ownedTextures.splice(0)) texture.dispose();
    for (const geometry of this.ownedGeometries.splice(0)) geometry.dispose();
  }

  private applyFogUniforms(material: StaticImpostorNodeMaterial): void {
    const preset = PRESETS[this.stage];
    material.uniforms.fogEnabled.value = true;
    material.uniforms.fogColor.value.copy(toColor(preset.fogColor));
    material.uniforms.fogDensity.value = preset.fogDensity;
  }

  private step(_deltaSeconds: number): void {
    this.controls.update();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === '[') {
      this.stepAsset(-1);
    } else if (event.key === ']') {
      this.stepAsset(1);
    } else if (event.key === '1') {
      this.setStage('daylight');
    } else if (event.key === '2') {
      this.setStage('low-sun');
    } else if (event.key === '3') {
      this.setStage('humid-fog');
    }
  }

  private stepAsset(delta: number): void {
    if (this.slugs.length === 0) return;
    const current = this.currentEntry ? this.slugs.indexOf(this.currentEntry.slug) : -1;
    const next = (current + delta + this.slugs.length) % this.slugs.length;
    void this.selectAsset(this.slugs[next]);
  }

  private updateHud(): void {
    const preset = PRESETS[this.stage];
    const entry = this.currentEntry;
    const lines = [
      'VEGETATION LOD REVIEW',
      `asset      ${entry?.slug ?? 'none'}`,
      `kind       ${entry?.kind ?? 'n/a'}`,
      `stage      ${this.stage} (${preset.label})`,
      `load       ${this.loadStatus}`,
      `renderer   ${this.rendererBackend}`,
      `columns    ${this.columns.map((column) => COLUMN_LABELS[column]).join(' | ') || 'pending'}`,
      '',
      'This is proof-generation only; owner visual acceptance gates deploy.',
    ];
    this.infoChip.textContent = lines.join('\n');
  }

  private renderToText(): string {
    return JSON.stringify(this.state());
  }

  private state(): ReviewState {
    return {
      mode: 'vegetation-lod-review',
      slug: this.currentEntry?.slug ?? null,
      kind: this.currentEntry?.kind ?? null,
      stage: this.stage,
      loadStatus: this.loadStatus,
      rendererBackend: this.rendererBackend,
      sourceMeshCount: this.currentSource ? countMeshes(this.currentSource) : 0,
      previewMeshCount: countMeshes(this.previewRoot),
      columns: [...this.columns],
      totalAssets: this.entries.length,
    };
  }

  private exposeApi(): void {
    const api: ReviewApi = {
      selectAsset: (slug: string) => this.selectAsset(slug),
      setStage: (stage: string) => this.setStage(stage),
      slugs: () => [...this.slugs],
      stages: () => [...STAGES],
      loadStatus: () => this.loadStatus,
      state: () => this.state(),
    };
    (window as unknown as { __vegetationLodReview?: ReviewApi }).__vegetationLodReview = api;
    (window as unknown as { render_game_to_text?: () => string }).render_game_to_text = () =>
      this.renderToText();
  }
}

function normalizeStage(stage: string | null | undefined): ReviewStage {
  return STAGES.includes(stage as ReviewStage) ? stage as ReviewStage : 'daylight';
}

function toColor(value: THREE.ColorRepresentation): THREE.Color {
  return value instanceof THREE.Color ? value : new THREE.Color(value);
}

function buildInstancedPlaneGeometry(): THREE.InstancedBufferGeometry {
  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(plane.index);
  for (const [name, attribute] of Object.entries(plane.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = 1;
  plane.dispose();
  return geometry;
}

function buildGroundCardCrossGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
    0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 1, -0.5,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]), 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeBoundingSphere();
  return geometry;
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count++;
  });
  return count;
}
