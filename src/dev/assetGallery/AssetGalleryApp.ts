// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * War-asset review gallery (dev-only, `?mode=asset-gallery`).
 *
 * An isolated Three.js scene for reviewing every entry in the generated
 * `warAssetCatalog`: orbit camera, neutral ground plane, a 1.8m human-height
 * reference post, and a forward-axis arrow gizmo (+Z, or −Z for ground
 * vehicles per the catalog `forward`). A class-grouped sidebar selects assets;
 * an info chip reports the catalog metadata (dims / tris / size / materials /
 * budget status / grafted joints). REJECT assets are listed and flagged but
 * their GLB is not loaded (it may live at a package path the engine never
 * imported).
 *
 * Lighting here is a neutral review rig (hemisphere + key/fill), matching the
 * gun-range / terrain-sandbox dev-scene convention — it is NOT the in-game TOD
 * lighting rig, which is coupled to the full atmosphere/terrain pipeline.
 *
 * The Playwright walk (`scripts/check-asset-gallery.ts`) drives the scene via
 * the `window.__assetGallery` API exposed in the constructor.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelLoader } from '../../systems/assets/ModelLoader';
import { repairKnownAircraftRotorGeometry } from '../../systems/assets/AircraftRotorGeometryRepair';
import type { WarAssetEntry } from '../../config/generated/warAssetCatalog';
import {
  buildGalleryGroups,
  forwardSign,
  isLoadableEntry,
  orderedGallerySlugs,
  type GalleryGroup,
} from './galleryCatalog';
import {
  createControlsBar,
  createInfoChip,
  createSidebar,
  describeEntry,
  statusColor,
  type GallerySidebar,
} from './galleryHud';

const HUMAN_REFERENCE_HEIGHT = 1.8;
const JOINT_SPIN_RAD_PER_SEC = 2.4;

type LoadStatus = 'pending' | 'loading' | 'loaded' | 'rejected' | 'error';

interface SpinningJoint {
  object: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
}

export class AssetGalleryApp {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly groups: GalleryGroup[] = buildGalleryGroups();
  private readonly slugs: string[] = orderedGallerySlugs();
  private readonly catalogBySlug = new Map<string, WarAssetEntry>();

  private readonly assetRoot = new THREE.Group();
  private readonly gizmoRoot = new THREE.Group();
  private readonly bounds = new THREE.Box3();
  private readonly boundsSize = new THREE.Vector3();
  private readonly boundsCenter = new THREE.Vector3();

  private readonly sidebar: GallerySidebar;
  private readonly infoChip: HTMLDivElement;
  private readonly controlsBar: HTMLDivElement;

  private currentSlug: string | null = null;
  private currentModel: THREE.Group | null = null;
  private loadStatus: LoadStatus = 'pending';
  private loadGeneration = 0;
  private jointSpin = false;
  private spinningJoints: SpinningJoint[] = [];
  private animationFrameId: number | null = null;
  private disposed = false;

  private readonly onResize = () => this.handleResize();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(container: HTMLElement) {
    document.title = 'TIJ War Asset Gallery';
    document.getElementById('boot-splash')?.remove();

    for (const entry of Object.values(buildGalleryGroups()).flatMap((g) => g.entries)) {
      this.catalogBySlug.set(entry.slug, entry);
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / Math.max(window.innerHeight, 1), 0.02, 800);
    this.camera.position.set(4, 3, 6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1, 0);
    this.controls.update();

    this.buildStaticRig();
    this.scene.add(this.assetRoot);
    this.scene.add(this.gizmoRoot);

    this.sidebar = createSidebar(this.groups, (slug) => void this.selectAsset(slug));
    this.infoChip = createInfoChip();
    this.controlsBar = createControlsBar(
      'orbit: drag   zoom: wheel   J: toggle joint spin   [ ]: prev/next asset',
    );
    document.body.appendChild(this.sidebar.root);
    document.body.appendChild(this.infoChip);
    document.body.appendChild(this.controlsBar);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);

    this.exposeApi();
  }

  start(): void {
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

  /** Load + frame one asset by slug. Resolves once the model is in the scene. */
  async selectAsset(slug: string): Promise<void> {
    const entry = this.catalogBySlug.get(slug);
    if (!entry) return;
    const generation = ++this.loadGeneration;
    this.currentSlug = slug;
    this.sidebar.setActive(slug);
    this.clearAsset();
    this.applyGizmo(entry);

    if (!isLoadableEntry(entry)) {
      this.loadStatus = 'rejected';
      this.updateChip(entry);
      this.frameView(entry);
      return;
    }

    this.loadStatus = 'loading';
    this.updateChip(entry);
    try {
      const model = await modelLoader.loadModel(entry.path);
      if (this.disposed || generation !== this.loadGeneration) {
        modelLoader.disposeInstance(model);
        return;
      }
      repairKnownAircraftRotorGeometry(model, entry.path);
      this.currentModel = model;
      this.assetRoot.add(model);
      this.collectSpinningJoints(model, entry);
      this.loadStatus = 'loaded';
    } catch {
      this.loadStatus = 'error';
    }
    this.updateChip(entry);
    this.frameView(entry);
  }

  setJointSpin(enabled: boolean): void {
    this.jointSpin = enabled;
    if (this.currentSlug) {
      const entry = this.catalogBySlug.get(this.currentSlug);
      if (entry) this.updateChip(entry);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.sidebar.root.remove();
    this.infoChip.remove();
    this.controlsBar.remove();
    this.clearAsset();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
    const api = window as unknown as { __assetGallery?: unknown };
    delete api.__assetGallery;
    delete (window as unknown as { render_game_to_text?: unknown }).render_game_to_text;
  }

  private step(deltaSeconds: number): void {
    this.controls.update();
    if (this.jointSpin) {
      const delta = JOINT_SPIN_RAD_PER_SEC * deltaSeconds;
      for (const joint of this.spinningJoints) {
        joint.object.rotation[joint.axis] += delta;
      }
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private buildStaticRig(): void {
    this.scene.background = new THREE.Color(0x222a30);
    this.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x404038, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(6, 10, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd0ff, 0.5);
    fill.position.set(-6, 4, -6);
    this.scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x4a5247, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(60, 60, 0x6f7d66, 0x40483c);
    this.scene.add(grid);

    // 1.8m human-height reference post (a thin marker the size of a soldier).
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, HUMAN_REFERENCE_HEIGHT, 12),
      new THREE.MeshStandardMaterial({ color: 0xe0d18a, roughness: 0.8 }),
    );
    post.position.set(-1.4, HUMAN_REFERENCE_HEIGHT / 2, 0);
    this.scene.add(post);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe0d18a, roughness: 0.8 }),
    );
    head.position.set(-1.4, HUMAN_REFERENCE_HEIGHT + 0.12, 0);
    this.scene.add(head);
  }

  /** Rebuild the forward-axis arrow for the selected asset's `forward`. */
  private applyGizmo(entry: WarAssetEntry): void {
    this.gizmoRoot.clear();
    const sign = forwardSign(entry);
    const direction = new THREE.Vector3(0, 0, sign);
    const arrow = new THREE.ArrowHelper(direction, new THREE.Vector3(0, 0.02, 0), 2.2, 0x4bd0ff, 0.5, 0.28);
    this.gizmoRoot.add(arrow);
  }

  private collectSpinningJoints(model: THREE.Object3D, entry: WarAssetEntry): void {
    this.spinningJoints = [];
    if (!entry.joints?.length) return;
    const wanted = new Map(entry.joints.map((joint) => [joint.name, joint.spinAxis ?? 'y'] as const));
    model.traverse((child) => {
      const axis = wanted.get(child.name);
      if (axis) this.spinningJoints.push({ object: child, axis });
    });
  }

  /** Center the asset on the ground and frame the camera to its bounds. */
  private frameView(entry: WarAssetEntry): void {
    const target = this.currentModel;
    if (target) {
      target.position.set(0, 0, 0);
      target.updateMatrixWorld(true);
      this.bounds.setFromObject(target);
      this.bounds.getSize(this.boundsSize);
      this.bounds.getCenter(this.boundsCenter);
      // Ground the model (sit minY on the floor) and re-center horizontally.
      target.position.x -= this.boundsCenter.x;
      target.position.z -= this.boundsCenter.z;
      target.position.y -= this.bounds.min.y;
      target.updateMatrixWorld(true);
      this.bounds.setFromObject(target);
    } else {
      const [w, h, d] = entry.dims;
      this.boundsSize.set(w, h, d);
    }

    const radius = Math.max(this.boundsSize.length() * 0.5, 0.6);
    const centerY = Math.max(this.boundsSize.y * 0.5, 0.4);
    this.controls.target.set(0, centerY, 0);
    this.camera.position.set(radius * 1.6, radius * 1.1 + 0.5, radius * 1.9);
    this.camera.near = Math.max(radius / 200, 0.01);
    this.camera.far = radius * 40 + 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private clearAsset(): void {
    if (this.currentModel) {
      modelLoader.disposeInstance(this.currentModel);
      this.currentModel = null;
    }
    this.assetRoot.clear();
    this.spinningJoints = [];
  }

  private updateChip(entry: WarAssetEntry): void {
    this.infoChip.style.borderColor = statusColor(entry.budgetStatus);
    this.infoChip.textContent = describeEntry(entry, this.loadStatus, this.jointSpin);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === 'j') {
      this.setJointSpin(!this.jointSpin);
    } else if (event.key === '[') {
      this.stepSelection(-1);
    } else if (event.key === ']') {
      this.stepSelection(1);
    }
  }

  private stepSelection(delta: number): void {
    if (this.slugs.length === 0) return;
    const current = this.currentSlug ? this.slugs.indexOf(this.currentSlug) : -1;
    const next = (current + delta + this.slugs.length) % this.slugs.length;
    void this.selectAsset(this.slugs[next]);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private renderToText(): string {
    const entry = this.currentSlug ? this.catalogBySlug.get(this.currentSlug) ?? null : null;
    return JSON.stringify({
      mode: 'asset-gallery',
      slug: this.currentSlug,
      class: entry?.class ?? null,
      forward: entry?.forward ?? null,
      budgetStatus: entry?.budgetStatus ?? null,
      loadStatus: this.loadStatus,
      meshCount: this.currentModel ? countMeshes(this.currentModel) : 0,
      jointSpin: this.jointSpin,
      spinningJoints: this.spinningJoints.map((joint) => joint.object.name),
      totalAssets: this.slugs.length,
    });
  }

  private exposeApi(): void {
    const api = {
      selectAsset: (slug: string) => this.selectAsset(slug),
      setJointSpin: (enabled: boolean) => this.setJointSpin(enabled),
      slugs: () => [...this.slugs],
      loadStatus: () => this.loadStatus,
      currentSlug: () => this.currentSlug,
    };
    (window as unknown as { __assetGallery?: typeof api }).__assetGallery = api;
    (window as unknown as { render_game_to_text?: () => string }).render_game_to_text = () =>
      this.renderToText();
  }
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count += 1;
  });
  return count;
}
