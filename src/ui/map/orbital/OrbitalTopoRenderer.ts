// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * On-demand renderer for the orbital relief scene.
 *
 * Renders a SEPARATE `THREE.Scene` (relief mesh + markers + lights) through the
 * EXISTING game renderer — NO second WebGPU device. The shared renderer is
 * injected; we render the orbital scene to its canvas inside a scissored
 * viewport rectangle only when the map is open and something changed
 * (render-on-demand), so steady-state combat cost is zero when the map is shut.
 *
 * Material selection follows the backend: WebGPU (incl. its WebGL2 fallback)
 * gets the rich TSL `MeshStandardNodeMaterial`; the legacy `?renderer=webgl`
 * path gets the first-class `MeshLambertMaterial` with baked hypsometric vertex
 * colours. Either way the relief reads correctly.
 *
 * Picking is screen-rect-relative: callers pass a client-space point and we
 * raycast the marker layer for zone selection.
 *
 * Frame ordering: the map's RAF pump re-draws the scissored region every frame
 * while open so it sits on top of the main loop's full-canvas repaint. Deploy /
 * pause render with the combat loop quiescent (no contention); the combat
 * hold-M toggle is opt-in and its on-top compositing is playtest-verified from
 * the main worktree (worktree perf/headed captures fail on Windows MAX_PATH).
 */

import * as THREE from 'three';
import { buildTopoGeometry, type HeightGrid, type HypsometricRamp } from './OrbitalTopoMeshBuilder';
import { buildTopoMeshData } from './OrbitalTopoMeshBuilder';
import { createTopoNodeMaterial, createTopoLambertMaterial } from './OrbitalTopoMaterial';
import { OrbitalTopoMarkers, type TopoMarkerInput } from './OrbitalTopoMarkers';
import { OrbitalTopoControls } from './OrbitalTopoControls';

/** Minimal renderer surface — the shared game renderer satisfies this. */
export interface SharedRenderer {
  domElement: HTMLCanvasElement;
  getPixelRatio(): number;
  getScissorTest(): boolean;
  setScissorTest(v: boolean): void;
  setViewport(x: number, y: number, w: number, h: number): void;
  setScissor(x: number, y: number, w: number, h: number): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  autoClear: boolean;
  isWebGPURenderer?: boolean;
}

/** Map background behind the relief mesh (manila topo paper, opaque). */
const MAP_BACKGROUND = new THREE.Color(0x2a2620);

const DISPLAY_SIZE = 100;
const VERTICAL_EXAGGERATION = 1.8;

export class OrbitalTopoRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
  private readonly renderer: SharedRenderer;
  private readonly markers: OrbitalTopoMarkers;
  private controls: OrbitalTopoControls | null = null;
  private reliefMesh: THREE.Mesh | null = null;
  private dirty = true;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private worldSize = 1;
  private verticalScale = 1;
  private minHeight = 0;

  constructor(renderer: SharedRenderer, grid: HeightGrid, ramp?: HypsometricRamp) {
    this.renderer = renderer;
    this.worldSize = grid.worldSize;
    this.scene.background = MAP_BACKGROUND;

    const meshData = buildTopoMeshData(grid, {
      resolution: 96,
      displaySize: DISPLAY_SIZE,
      verticalExaggeration: VERTICAL_EXAGGERATION,
      ramp,
    });
    this.minHeight = meshData.minHeight;
    this.verticalScale = (DISPLAY_SIZE / grid.worldSize) * VERTICAL_EXAGGERATION;

    const geometry = buildTopoGeometry(meshData);
    this.reliefMesh = new THREE.Mesh(geometry, createTopoLambertMaterial());
    this.scene.add(this.reliefMesh);

    // Upgrade to the rich TSL material on the WebGPU path; the Lambert mesh
    // stays as a correct first-frame fallback until the node material resolves.
    if (renderer.isWebGPURenderer) {
      void this.upgradeToNodeMaterial(meshData.maxHeight - meshData.minHeight, ramp);
    }

    this.markers = new OrbitalTopoMarkers({
      worldSize: grid.worldSize,
      displaySize: DISPLAY_SIZE,
      verticalScale: this.verticalScale,
      minHeight: this.minHeight,
    });
    this.scene.add(this.markers.group);

    const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
    key.position.set(-0.5, 0.85, 0.35).multiplyScalar(100);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x6b7a86, 0.9));
  }

  private async upgradeToNodeMaterial(heightRange: number, ramp?: HypsometricRamp): Promise<void> {
    try {
      const material = await createTopoNodeMaterial({ ramp, heightRange });
      if (!this.reliefMesh) return;
      const old = this.reliefMesh.material as THREE.Material;
      this.reliefMesh.material = material;
      old.dispose();
      this.markDirty();
    } catch {
      // Keep the Lambert fallback — already correct.
    }
  }

  /** Wire orbit controls onto a DOM element that overlays the render viewport. */
  attachControls(element: HTMLElement): void {
    this.controls?.dispose();
    this.controls = new OrbitalTopoControls({
      camera: this.camera,
      element,
      onChange: () => this.markDirty(),
      initialState: { radius: DISPLAY_SIZE * 1.5 },
    });
  }

  setMarkers(inputs: readonly TopoMarkerInput[], heightAt: (worldX: number, worldZ: number) => number): void {
    this.markers.setMarkers(inputs, heightAt);
    this.markDirty();
  }

  markDirty(): void {
    this.dirty = true;
  }

  resetView(): void {
    this.controls?.reset({ radius: DISPLAY_SIZE * 1.5 });
  }

  /**
   * Render into the screen rectangle `rect` (CSS pixels, top-left origin). Only
   * draws when dirty; clears its own dirty flag. Returns whether it drew.
   */
  renderTo(rect: { left: number; top: number; width: number; height: number }, force = false): boolean {
    if (!this.dirty && !force) return false;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const dpr = this.renderer.getPixelRatio();
    const canvasHeight = this.renderer.domElement.clientHeight;
    // Three viewport origin is bottom-left; rect is top-left.
    const x = rect.left * dpr;
    const y = (canvasHeight - rect.top - height) * dpr;
    const w = width * dpr;
    const h = height * dpr;

    const prevScissorTest = this.renderer.getScissorTest();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    // Scissor test confines BOTH the clear and the draw to our rect, so the
    // relief paints over a clean map background instead of the stale combat
    // frame, and the rest of the canvas is untouched.
    this.renderer.setScissorTest(true);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(prevScissorTest);
    this.renderer.autoClear = prevAutoClear;

    this.dirty = false;
    return true;
  }

  /** Pick a marker at a client point relative to the render rect. */
  pickMarker(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
  ): { id: string; name: string } | null {
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.markers.pick(this.raycaster);
  }

  dispose(): void {
    this.controls?.dispose();
    this.markers.dispose();
    if (this.reliefMesh) {
      this.reliefMesh.geometry.dispose();
      (this.reliefMesh.material as THREE.Material).dispose();
      this.scene.remove(this.reliefMesh);
      this.reliefMesh = null;
    }
  }
}
