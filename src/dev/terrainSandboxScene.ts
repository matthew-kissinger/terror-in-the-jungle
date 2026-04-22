/**
 * Isolated terrain parameter sandbox scene.
 *
 * One generated heightmap rendered as a static PlaneGeometry with displaced
 * vertices, OrbitControls camera, one directional light. No combat, AI,
 * atmosphere, audio, HUD, vehicles, or player controller.
 *
 * Built off the CDLOD streaming pipeline deliberately: that system is
 * threaded through the full GameEngine (AssetLoader, SystemManager,
 * TerrainWorkerPool, biome material config) and extracting a stand-alone
 * factory exceeds the task budget. A static mesh is sufficient for tuning
 * noise / shape parameters — the point of the sandbox. See
 * docs/tasks/terrain-param-sandbox.md.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  DEFAULT_HEIGHTMAP_PARAMS,
  generateHeightmap,
  type GeneratedHeightmap,
  type HeightmapParams,
} from './terrainSandbox/heightmapGenerator';
import {
  DEFAULT_PREVIEW_TOGGLES,
  buildSandboxPane,
  type PreviewToggles,
  type SandboxPaneLike,
} from './terrainSandbox/terrainTuning';
import {
  buildExportBundle,
  copyToClipboard,
  downloadExportBundle,
  formatRegistryLiteral,
  buildRegistryEntry,
} from './terrainSandbox/heightmapExport';
import { Logger } from '../utils/Logger';

const REGENERATE_DEBOUNCE_MS = 500;

export class TerrainSandboxScene {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly paneContainer: HTMLDivElement;
  private readonly params: HeightmapParams = { ...DEFAULT_HEIGHTMAP_PARAMS };
  private readonly preview: PreviewToggles = { ...DEFAULT_PREVIEW_TOGGLES };

  private terrainMesh: THREE.Mesh | null = null;
  private currentHeightmap: GeneratedHeightmap | null = null;
  private pane?: SandboxPaneLike;
  private overlay!: HTMLDivElement;
  private regenerateTimer: ReturnType<typeof setTimeout> | null = null;
  private animationFrameId: number | null = null;
  private disposed = false;
  private readonly onResize = () => this.handleResize();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / Math.max(window.innerHeight, 1), 0.5, 20000);
    this.camera.position.set(0, 800, 1200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.background = new THREE.Color(0x2a3140);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x303028, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1200, 2000, 800);
    this.scene.add(dir);

    this.paneContainer = document.createElement('div');
    Object.assign(this.paneContainer.style, {
      position: 'fixed', top: '16px', right: '16px', width: '340px',
      maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', pointerEvents: 'auto',
      zIndex: '9999', fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: '11px',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.paneContainer);

    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '12px', left: '12px', padding: '10px 14px',
      background: 'rgba(0,0,0,0.55)', color: '#e7ffe0',
      fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: '12px',
      lineHeight: '1.45', whiteSpace: 'pre', pointerEvents: 'none', zIndex: '9998',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.overlay);

    window.addEventListener('resize', this.onResize);
    this.regenerateNow();
  }

  async start(): Promise<void> {
    await this.ensurePane();
    const tick = () => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.regenerateTimer) clearTimeout(this.regenerateTimer);
    this.animationFrameId = null;
    this.regenerateTimer = null;
    window.removeEventListener('resize', this.onResize);
    this.pane?.dispose?.();
    this.pane = undefined;
    this.paneContainer.parentElement?.removeChild(this.paneContainer);
    this.overlay.parentElement?.removeChild(this.overlay);
    this.disposeMesh();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
  }

  private regenerateNow(): void {
    this.disposeMesh();
    const heightmap = generateHeightmap(this.params);
    this.currentHeightmap = heightmap;
    const mesh = buildTerrainMesh(heightmap, this.preview);
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    this.updateOverlay();
  }

  private scheduleRegenerate(): void {
    if (this.regenerateTimer) clearTimeout(this.regenerateTimer);
    this.regenerateTimer = setTimeout(() => {
      this.regenerateTimer = null;
      if (!this.disposed) this.regenerateNow();
    }, REGENERATE_DEBOUNCE_MS);
  }

  private disposeMesh(): void {
    if (!this.terrainMesh) return;
    this.scene.remove(this.terrainMesh);
    this.terrainMesh.geometry.dispose();
    const mat = this.terrainMesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose()); else mat.dispose();
    this.terrainMesh = null;
  }

  private updatePreviewOnly(): void {
    if (!this.terrainMesh || !this.currentHeightmap) return;
    this.disposeMesh();
    const mesh = buildTerrainMesh(this.currentHeightmap, this.preview);
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    this.updateOverlay();
  }

  private async ensurePane(): Promise<void> {
    if (this.pane) return;
    // Dynamic import keeps Tweakpane out of the retail bundle via Vite DCE.
    const { Pane } = await import('tweakpane');
    const pane = new Pane({ container: this.paneContainer, title: 'Terrain Sandbox' }) as unknown as SandboxPaneLike;
    this.pane = pane;
    buildSandboxPane(pane, this.params, this.preview, {
      onParamsChange: () => this.scheduleRegenerate(),
      onPreviewChange: () => this.updatePreviewOnly(),
      onExport: () => { void this.handleExport(); },
      onCopyRegistryEntry: () => { void this.handleCopyRegistryEntry(); },
      onResetDefaults: () => {
        Object.assign(this.params, DEFAULT_HEIGHTMAP_PARAMS);
        Object.assign(this.preview, DEFAULT_PREVIEW_TOGGLES);
        this.pane?.refresh?.();
        this.regenerateNow();
      },
    });
  }

  private updateOverlay(): void {
    const h = this.currentHeightmap;
    const p = this.params;
    const tris = this.terrainMesh?.geometry.index ? this.terrainMesh.geometry.index.count / 3 : 0;
    const mb = ((h?.data.byteLength ?? 0) / (1024 * 1024)).toFixed(2);
    this.overlay.textContent = [
      'TERRAIN SANDBOX',
      `seed=${p.seed} octaves=${p.octaves} res=${p.resolution}`,
      `freq=${p.frequency.toFixed(4)} lac=${p.lacunarity.toFixed(2)} pers=${p.persistence.toFixed(2)}`,
      `amp=${p.amplitude.toFixed(0)}m warp=${p.warpStrength.toFixed(0)}@${p.warpFrequency.toFixed(4)}`,
      `size=${p.mapSizeMeters}m  tris=${tris.toLocaleString()}  grid=${mb}MB`,
      `h=[${h?.min.toFixed(1) ?? '-'} .. ${h?.max.toFixed(1) ?? '-'}]m  gen=${h?.generationTimeMs.toFixed(1) ?? '-'}ms`,
    ].join('\n');
  }

  private async handleExport(): Promise<void> {
    if (!this.currentHeightmap) return;
    try {
      downloadExportBundle(await buildExportBundle(this.currentHeightmap, this.params));
    } catch (err) {
      Logger.error('terrain-sandbox', 'export failed', err);
    }
  }

  private async handleCopyRegistryEntry(): Promise<void> {
    const literal = formatRegistryLiteral(buildRegistryEntry(this.params));
    const ok = await copyToClipboard(literal);
    if (!ok) Logger.warn('terrain-sandbox', 'clipboard copy failed; literal', literal);
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

/**
 * Build a single static mesh from a heightmap grid. Exported for tests.
 * PlaneGeometry(res-1, res-1) rotated so +Y is up, heights feed into the Y
 * attribute. Normalized height is stashed in vertex color for the contour
 * overlay.
 */
export function buildTerrainMesh(heightmap: GeneratedHeightmap, preview: PreviewToggles): THREE.Mesh {
  const { resolution, mapSizeMeters, data, min, max } = heightmap;
  const segments = Math.max(1, resolution - 1);
  const geometry = new THREE.PlaneGeometry(mapSizeMeters, mapSizeMeters, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const span = Math.max(1e-6, max - min);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = data[i];
    pos.setY(i, h);
    const n = (h - min) / span;
    colors[i * 3] = n; colors[i * 3 + 1] = n; colors[i * 3 + 2] = n;
  }
  pos.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return new THREE.Mesh(geometry, buildPreviewMaterial(preview));
}

function buildPreviewMaterial(preview: PreviewToggles): THREE.Material {
  if (preview.normals) {
    return new THREE.MeshNormalMaterial({ wireframe: preview.wireframe });
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0x5c7a3c, metalness: 0, roughness: 0.95,
    wireframe: preview.wireframe, vertexColors: preview.contours,
  });
  if (preview.contours) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float banded = fract(vColor.r * 12.0);
        float line = smoothstep(0.0, 0.05, banded) * (1.0 - smoothstep(0.05, 0.1, banded));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.08), line * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(vColor.r), 0.35);`,
      );
    };
  }
  return material;
}
