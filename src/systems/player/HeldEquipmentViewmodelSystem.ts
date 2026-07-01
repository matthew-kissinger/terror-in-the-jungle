// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import { PropModels } from '../assets/modelPaths';
import { modelLoader } from '../assets/ModelLoader';
import { Logger } from '../../utils/Logger';

export type HeldEquipmentMode = 'none' | 'radio' | 'smoke-marker';

export class HeldEquipmentViewmodelSystem implements GameSystem {
  private readonly overlayScene = new THREE.Scene();
  private readonly overlayCamera: THREE.OrthographicCamera;
  private readonly radioRoot = new THREE.Group();
  private readonly smokeRoot = new THREE.Group();
  private mode: HeldEquipmentMode = 'none';
  private time = 0;

  constructor() {
    const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
    this.overlayCamera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.overlayCamera.position.z = 1;
    this.buildRadioFallback();
    this.buildSmokeMarker();
    this.radioRoot.visible = false;
    this.smokeRoot.visible = false;
    this.overlayScene.add(this.radioRoot);
    this.overlayScene.add(this.smokeRoot);
  }

  async init(): Promise<void> {
    void this.loadRadioModel();
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    const bob = Math.sin(this.time * 2.4) * 0.008;
    if (this.radioRoot.visible) {
      this.radioRoot.position.y = -0.48 + bob;
      this.radioRoot.rotation.z = -0.06 + Math.sin(this.time * 1.7) * 0.008;
    }
    if (this.smokeRoot.visible) {
      this.smokeRoot.position.y = -0.55 + bob;
      this.smokeRoot.rotation.x = 0.1 + Math.sin(this.time * 2.2) * 0.018;
    }
  }

  setMode(mode: HeldEquipmentMode): void {
    this.mode = mode;
    this.radioRoot.visible = mode === 'radio';
    this.smokeRoot.visible = mode === 'smoke-marker';
  }

  getMode(): HeldEquipmentMode {
    return this.mode;
  }

  canRenderOverlay(): boolean {
    return this.mode !== 'none';
  }

  getOverlayScene(): THREE.Scene {
    return this.overlayScene;
  }

  getOverlayCamera(): THREE.Camera {
    return this.overlayCamera;
  }

  dispose(): void {
    this.radioRoot.removeFromParent();
    this.smokeRoot.removeFromParent();
    this.disposeOwned(this.radioRoot);
    this.disposeOwned(this.smokeRoot);
  }

  private async loadRadioModel(): Promise<void> {
    try {
      const loaded = await modelLoader.loadModel(PropModels.FIELD_RADIO_VIEWMODEL);
      this.disposeOwned(this.radioRoot);
      this.radioRoot.clear();
      loaded.position.set(0, 0, 0);
      loaded.rotation.set(0.1, -0.18, 0.02);
      loaded.scale.setScalar(2.1);
      this.radioRoot.add(loaded);
    } catch (error) {
      Logger.warn('player', 'Radio viewmodel GLB failed to load; using fallback geometry', error);
    }
  }

  private buildRadioFallback(): void {
    this.radioRoot.position.set(-0.32, -0.48, -0.68);
    this.radioRoot.rotation.set(0.05, -0.18, -0.06);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x3d462e, roughness: 0.82, metalness: 0.18 }),
    );
    body.userData.ownedHeldEquipmentGeometry = true;
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.018, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.55, metalness: 0.2 }),
    );
    dial.userData.ownedHeldEquipmentGeometry = true;
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.055, 0.08, 0.09);
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x26251f, roughness: 0.65, metalness: 0.5 }),
    );
    antenna.userData.ownedHeldEquipmentGeometry = true;
    antenna.rotation.z = -0.38;
    antenna.position.set(-0.11, 0.37, -0.01);
    this.radioRoot.add(body, dial, antenna);
  }

  private buildSmokeMarker(): void {
    this.smokeRoot.position.set(0.36, -0.55, -0.54);
    this.smokeRoot.rotation.set(0.1, 0.3, -0.32);

    const canister = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.34, 16),
      new THREE.MeshStandardMaterial({ color: 0x79806d, roughness: 0.74, metalness: 0.34 }),
    );
    canister.userData.ownedHeldEquipmentGeometry = true;
    canister.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.057, 0.057, 0.045, 16),
      new THREE.MeshStandardMaterial({ color: 0xdad7bd, roughness: 0.8, metalness: 0.1 }),
    );
    band.userData.ownedHeldEquipmentGeometry = true;
    band.rotation.z = Math.PI / 2;
    band.position.x = 0.04;
    this.smokeRoot.add(canister, band);
  }

  private disposeOwned(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData.ownedHeldEquipmentGeometry !== true) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    });
  }
}
