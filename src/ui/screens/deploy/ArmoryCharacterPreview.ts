// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { modelLoader } from '../../../systems/assets/ModelLoader';
import {
  getPixelForgeNpcRuntimeFaction,
  type PixelForgeNpcFactionRuntimeConfig,
} from '../../../systems/combat/PixelForgeNpcRuntime';
import { Faction, isBlufor } from '../../../systems/combat/types';
import { LoadoutWeapon, type PlayerLoadout } from '../../loadout/LoadoutTypes';
import {
  createPreviewAnimationActions,
  createPreviewAnimationOptions,
  pickPreviewAnimationId,
  type PreviewAnimationOption,
} from './ArmoryPreviewAnimations';
import {
  FALLBACK_ARMORY_FACTION,
  getArmoryWeaponPreviewConfig,
  PREVIEW_CHARACTER_HEIGHT_M,
  type ArmoryWeaponPreviewConfig,
} from './ArmoryPreviewConfig';
import { cloneArmoryNpcMaterial } from './ArmoryPreviewMaterials';

interface PreviewInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  animationOptions: PreviewAnimationOption[];
  activeAnimationId?: string;
  bones: Map<string, THREE.Object3D>;
  factionConfig: PixelForgeNpcFactionRuntimeConfig;
  weaponPivot: THREE.Group;
  weaponRoot: THREE.Object3D;
  weaponConfig: ArmoryWeaponPreviewConfig;
}

export class ArmoryCharacterPreview {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly animationControls?: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);
  private readonly modelGroup = new THREE.Group();
  private renderer?: THREE.WebGLRenderer;
  private resizeObserver?: ResizeObserver;
  private animationFrame = 0;
  private running = false;
  private visible = false;
  private lastFrameTimeMs = 0;
  private instance?: PreviewInstance;
  private pendingLoadout?: PlayerLoadout;
  private pendingFaction: Faction = FALLBACK_ARMORY_FACTION;
  private pendingFocusWeapon?: LoadoutWeapon;
  private currentKey = '';
  private requestToken = 0;
  private readonly bounds = new THREE.Box3();
  private readonly boundsSize = new THREE.Vector3();
  private viewerYawRad = 0;
  private dragPointerId: number | undefined;
  private dragStartX = 0;
  private dragStartYaw = 0;
  private selectedAnimationId: string | undefined;
  private hasUserRotatedPreview = false;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, status: HTMLElement, animationControls?: HTMLElement) {
    this.host = host;
    this.canvas = canvas;
    this.status = status;
    this.animationControls = animationControls;
    this.camera.position.set(0, 1.18, 5.2);
    this.camera.lookAt(0, 1.03, 0);
    this.scene.add(this.modelGroup);
    this.scene.add(new THREE.HemisphereLight(0xf3ead4, 0x263323, 2.8));
    const key = new THREE.DirectionalLight(0xfff1cc, 2.2);
    key.position.set(2.8, 3.2, 2.4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb58a, 1.3);
    rim.position.set(-2.6, 2.0, -2.2);
    this.scene.add(rim);
    this.scene.add(this.createGroundMarker());
    this.installRotationInput();
  }

  setLoadout(loadout: PlayerLoadout, factionValue: string | Faction | undefined, focusWeapon?: LoadoutWeapon): void {
    this.pendingLoadout = loadout;
    this.pendingFaction = this.normalizeFaction(factionValue);
    this.pendingFocusWeapon = focusWeapon;
    if (this.renderer && this.visible) {
      void this.loadCurrentPreview();
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.stop();
      return;
    }
    if (!this.ensureRenderer()) return;
    void this.loadCurrentPreview();
    this.start();
  }

  dispose(): void {
    this.stop();
    this.requestToken++;
    this.disposeInstance();
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.removeRotationInput();
    this.canvas.parentNode?.removeChild(this.canvas);
  }

  private ensureRenderer(): boolean {
    if (this.renderer) return true;
    if (!this.canUseWebGl()) {
      this.status.textContent = '3D kit preview unavailable';
      this.host.dataset.previewStatus = 'unavailable';
      return false;
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
      this.resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => this.resize())
        : undefined;
      this.resizeObserver?.observe(this.host);
      this.resize();
      return true;
    } catch {
      this.renderer = undefined;
      this.status.textContent = '3D kit preview unavailable';
      this.host.dataset.previewStatus = 'unavailable';
      return false;
    }
  }

  private canUseWebGl(): boolean {
    return typeof window !== 'undefined'
      && typeof document !== 'undefined'
      && (typeof WebGLRenderingContext !== 'undefined' || typeof WebGL2RenderingContext !== 'undefined');
  }

  private async loadCurrentPreview(): Promise<void> {
    const loadout = this.pendingLoadout;
    if (!loadout) return;
    const faction = this.pendingFaction;
    const previewWeapon = this.pendingFocusWeapon ?? loadout.primaryWeapon;
    const key = `${faction}:${previewWeapon}`;
    if (key === this.currentKey && this.instance) return;

    const token = ++this.requestToken;
    this.host.dataset.previewStatus = 'loading';
    this.status.textContent = 'Loading kit preview';

    try {
      const factionConfig = getPixelForgeNpcRuntimeFaction(faction);
      const weaponConfig = getArmoryWeaponPreviewConfig(previewWeapon, faction);
      const [model, weaponRoot] = await Promise.all([
        modelLoader.loadAnimatedModel(factionConfig.modelPath),
        modelLoader.loadModel(weaponConfig.modelPath),
      ]);
      if (token !== this.requestToken) {
        modelLoader.disposeInstance(model.scene);
        modelLoader.disposeInstance(weaponRoot);
        return;
      }

      this.disposeInstance();
      const root = model.scene;
      this.configureCharacter(root, factionConfig);
      this.normalizeWeaponRoot(weaponRoot, weaponConfig);

      const weaponPivot = new THREE.Group();
      weaponPivot.name = `${weaponConfig.id}_armory_weapon_socket`;
      weaponPivot.add(weaponRoot);
      root.add(weaponPivot);

      const mixer = new THREE.AnimationMixer(root);
      const animationOptions = createPreviewAnimationOptions(model.animations);
      const actions = createPreviewAnimationActions(mixer, animationOptions);

      const instance: PreviewInstance = {
        root,
        mixer,
        actions,
        animationOptions,
        bones: this.collectBones(root),
        factionConfig,
        weaponPivot,
        weaponRoot,
        weaponConfig,
      };
      this.instance = instance;
      this.currentKey = key;
      this.modelGroup.add(root);
      this.applyInitialViewerYaw(instance);
      const animationId = pickPreviewAnimationId(animationOptions, this.selectedAnimationId);
      if (animationId) {
        this.playAnimation(instance, animationId, false);
        mixer.update(0);
      }
      this.updateWeaponSocket(instance);
      this.renderAnimationControls(instance);
      this.host.dataset.previewStatus = 'ready';
      this.status.textContent = '';
    } catch {
      if (token === this.requestToken) {
        this.host.dataset.previewStatus = 'error';
        this.status.textContent = 'Kit preview failed to load';
      }
    }
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTimeMs = performance.now();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  private stop(): void {
    this.running = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  private frame(timeMs: number): void {
    if (!this.running || !this.renderer) return;
    const delta = Math.min(0.05, Math.max(0, (timeMs - this.lastFrameTimeMs) / 1000));
    this.lastFrameTimeMs = timeMs;
    this.resize();
    this.instance?.mixer.update(delta);
    if (this.instance) {
      this.updateWeaponSocket(this.instance);
    }
    this.modelGroup.rotation.y = this.viewerYawRad;
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  private resize(): void {
    if (!this.renderer) return;
    const width = Math.max(1, Math.floor(this.host.clientWidth || 1));
    const height = Math.max(1, Math.floor(this.host.clientHeight || 1));
    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  private configureCharacter(root: THREE.Group, factionConfig: PixelForgeNpcFactionRuntimeConfig): void {
    root.name = `Armory ${factionConfig.runtimeFaction} soldier`;
    root.traverse((child) => {
      child.frustumCulled = false;
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        if (Array.isArray(child.material)) {
          child.material = child.material.map(material => cloneArmoryNpcMaterial(material, factionConfig));
        } else {
          child.material = cloneArmoryNpcMaterial(child.material, factionConfig);
        }
      }
    });
    root.updateMatrixWorld(true);
    this.bounds.setFromObject(root);
    this.bounds.getSize(this.boundsSize);
    const height = this.boundsSize.y;
    const visualScale = Number.isFinite(height) && height > 0.01
      ? PREVIEW_CHARACTER_HEIGHT_M / height
      : 1;
    root.scale.setScalar(visualScale);
    root.position.set(0, -this.bounds.min.y * visualScale, 0);
    root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
  }

  private normalizeFaction(value: string | Faction | undefined): Faction {
    const token = String(value ?? FALLBACK_ARMORY_FACTION).toUpperCase();
    return Object.values(Faction).find(faction => faction === token) ?? FALLBACK_ARMORY_FACTION;
  }

  private normalizeWeaponRoot(root: THREE.Group, weapon: ArmoryWeaponPreviewConfig): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const longAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = weapon.lengthMeters / longAxis;
    root.scale.setScalar(scale);

    const gripObject = this.findNamed(root, weapon.gripNames);
    const supportObject = this.findNamed(root, weapon.supportNames);
    const muzzleObject = this.findNamed(root, weapon.muzzleNames);
    const stockObject = this.findNamed(root, weapon.stockNames);
    const grip = this.centerOfObject(root, gripObject) ?? new THREE.Vector3();
    const support = this.centerOfObject(root, supportObject);
    const muzzle = this.centerOfObject(root, muzzleObject);
    const stock = this.centerOfObject(root, stockObject);
    const muzzleDirection = muzzle ? muzzle.clone().sub(grip) : new THREE.Vector3(1, 0, 0);
    const alignment = muzzleDirection.lengthSq() > 0.0001
      ? new THREE.Quaternion().setFromUnitVectors(muzzleDirection.normalize(), new THREE.Vector3(1, 0, 0))
      : new THREE.Quaternion();
    root.quaternion.copy(alignment);

    const transformLocal = (point: THREE.Vector3): THREE.Vector3 =>
      point.clone().multiplyScalar(scale).applyQuaternion(root.quaternion);
    const transformedGrip = transformLocal(grip);
    root.position.copy(transformedGrip.multiplyScalar(-1));
    root.userData.stockOffset = stock
      ? transformLocal(stock).sub(transformLocal(grip))
      : new THREE.Vector3(-0.28, 0.04, 0);
    root.userData.supportOffset = support
      ? transformLocal(support).sub(transformLocal(grip))
      : new THREE.Vector3(0.28, 0.02, 0);
    root.updateMatrixWorld(true);
  }

  private playAnimation(instance: PreviewInstance, animationId: string, fade = true): void {
    const nextAction = instance.actions.get(animationId);
    if (!nextAction || instance.activeAnimationId === animationId) return;
    const previousAction = instance.activeAnimationId
      ? instance.actions.get(instance.activeAnimationId)
      : undefined;
    previousAction?.fadeOut(fade ? 0.16 : 0);
    nextAction.reset().fadeIn(fade ? 0.16 : 0).play();
    instance.activeAnimationId = animationId;
    this.selectedAnimationId = animationId;
    this.renderAnimationControls(instance);
  }

  private renderAnimationControls(instance: PreviewInstance): void {
    const container = this.animationControls;
    if (!container) return;
    container.replaceChildren();
    for (const option of instance.animationOptions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.title = option.id;
      button.dataset.animation = option.id;
      button.dataset.active = String(option.id === instance.activeAnimationId);
      button.setAttribute('aria-pressed', String(option.id === instance.activeAnimationId));
      button.addEventListener('click', () => this.playAnimation(instance, option.id));
      container.appendChild(button);
    }
  }

  private applyInitialViewerYaw(instance: PreviewInstance): void {
    if (!this.hasUserRotatedPreview) {
      this.viewerYawRad = this.deriveCameraFacingYaw(instance) ?? this.viewerYawRad;
    }
    this.modelGroup.rotation.y = this.viewerYawRad;
    this.modelGroup.updateMatrixWorld(true);
  }

  private deriveCameraFacingYaw(instance: PreviewInstance): number | undefined {
    const previousYaw = this.modelGroup.rotation.y;
    this.modelGroup.rotation.y = 0;
    this.modelGroup.updateMatrixWorld(true);
    instance.root.updateMatrixWorld(true);

    try {
      const center = instance.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0));
      const cameraDirection = this.camera.position.clone().sub(center);
      cameraDirection.y = 0;
      if (cameraDirection.lengthSq() < 0.0001) return undefined;
      cameraDirection.normalize();

      const bodyForward = this.getRootForward(instance.root);
      bodyForward.y = 0;
      if (bodyForward.lengthSq() < 0.0001) return undefined;
      bodyForward.normalize();

      return this.normalizeYaw(this.yawOf(cameraDirection) - this.yawOf(bodyForward));
    } finally {
      this.modelGroup.rotation.y = previousYaw;
      this.modelGroup.updateMatrixWorld(true);
    }
  }

  private installRotationInput(): void {
    this.host.addEventListener('pointerdown', this.handlePointerDown);
    this.host.addEventListener('pointermove', this.handlePointerMove);
    this.host.addEventListener('pointerup', this.handlePointerEnd);
    this.host.addEventListener('pointercancel', this.handlePointerEnd);
  }

  private removeRotationInput(): void {
    this.host.removeEventListener('pointerdown', this.handlePointerDown);
    this.host.removeEventListener('pointermove', this.handlePointerMove);
    this.host.removeEventListener('pointerup', this.handlePointerEnd);
    this.host.removeEventListener('pointercancel', this.handlePointerEnd);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button[data-animation]')) return;
    this.dragPointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartYaw = this.viewerYawRad;
    this.host.setPointerCapture(event.pointerId);
    this.host.dataset.dragging = 'true';
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId) return;
    const deltaX = event.clientX - this.dragStartX;
    this.viewerYawRad = this.normalizeYaw(this.dragStartYaw + deltaX * 0.01);
    this.modelGroup.rotation.y = this.viewerYawRad;
    this.modelGroup.updateMatrixWorld(true);
    this.hasUserRotatedPreview = true;
    event.preventDefault();
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId) return;
    this.dragPointerId = undefined;
    if (this.host.hasPointerCapture(event.pointerId)) {
      this.host.releasePointerCapture(event.pointerId);
    }
    this.host.dataset.dragging = 'false';
    event.preventDefault();
  };

  private updateWeaponSocket(instance: PreviewInstance): void {
    const right = this.getBoneWorldPosition(instance, instance.factionConfig.rightHandSocket);
    const leftShoulder = this.getBoneWorldPosition(instance, 'LeftArm')
      ?? this.getBoneWorldPosition(instance, 'LeftShoulder');
    const rightShoulder = this.getBoneWorldPosition(instance, 'RightArm')
      ?? this.getBoneWorldPosition(instance, 'RightShoulder');
    if (!right) return;

    const up = new THREE.Vector3(0, 1, 0);
    const travelForward = this.getRootForward(instance.root);
    travelForward.y = 0;
    if (travelForward.lengthSq() < 0.0001) travelForward.set(0, 0, 1);
    travelForward.normalize();

    const torsoForward = this.getBodyForward(instance);
    torsoForward.y = 0;
    if (torsoForward.lengthSq() < 0.0001) torsoForward.set(0, 0, 1);
    torsoForward.normalize();

    const forward = instance.weaponConfig.socketMode === 'shouldered-forward' ? travelForward : torsoForward;
    if (instance.weaponConfig.socketMode === 'shouldered-forward' && !this.hasUserRotatedPreview) {
      const aimSource = leftShoulder && rightShoulder
        ? leftShoulder.clone().lerp(rightShoulder, 0.5)
        : right.clone();
      const aimForward = this.getCameraAimForward(aimSource);
      if (aimForward.lengthSq() > 0.0001) forward.copy(aimForward);
    }
    let actorRight = new THREE.Vector3().crossVectors(forward, up).normalize();
    if (leftShoulder && rightShoulder) {
      const shoulderSpan = rightShoulder.clone().sub(leftShoulder);
      shoulderSpan.y = 0;
      if (shoulderSpan.lengthSq() > 0.0001) {
        shoulderSpan.normalize();
        if (shoulderSpan.dot(actorRight) < 0) shoulderSpan.multiplyScalar(-1);
        actorRight = shoulderSpan;
      }
    }

    const cleanUp = new THREE.Vector3().crossVectors(actorRight, forward).normalize();
    const worldMatrix = new THREE.Matrix4().makeBasis(forward, cleanUp, actorRight);
    const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);
    if (instance.weaponConfig.pitchTrimDeg) {
      worldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        THREE.MathUtils.degToRad(instance.weaponConfig.pitchTrimDeg),
      ));
    }

    const parent = instance.weaponPivot.parent ?? instance.root;
    parent.updateMatrixWorld(true);
    const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
    instance.weaponPivot.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));

    const shoulder = rightShoulder ?? right;
    const shoulderCenter = leftShoulder && rightShoulder
      ? leftShoulder.clone().lerp(rightShoulder, 0.5)
      : shoulder.clone().sub(actorRight.clone().multiplyScalar(0.12));
    const shoulderPocket = instance.weaponConfig.socketMode === 'hand-forward'
      ? right.clone().add(cleanUp.clone().multiplyScalar(-0.015))
      : shoulder.clone()
        .lerp(shoulderCenter, 0.42)
        .add(cleanUp.clone().multiplyScalar(-0.035));
    const stockOffset = this.getWeaponOffset(instance.weaponRoot, 'stockOffset', new THREE.Vector3(-0.28, 0.04, 0));
    const stockWorldOffset = instance.weaponConfig.socketMode === 'hand-forward'
      ? new THREE.Vector3()
      : stockOffset.applyQuaternion(worldQuaternion);
    const desiredWorldPosition = shoulderPocket
      .add(forward.clone().multiplyScalar(instance.weaponConfig.forwardHold + instance.weaponConfig.gripOffset))
      .sub(stockWorldOffset)
      .add(actorRight.clone().multiplyScalar(0.006));
    instance.weaponPivot.position.copy(parent.worldToLocal(desiredWorldPosition.clone()));
    instance.weaponPivot.updateMatrixWorld(true);

    const supportOffset = this.getWeaponOffset(instance.weaponRoot, 'supportOffset', new THREE.Vector3(0.28, 0.02, 0));
    const supportTarget = desiredWorldPosition.clone().add(supportOffset.applyQuaternion(worldQuaternion));
    const axes = { forward, cleanUp, actorRight };
    this.solveArmToTarget(instance, 'Right', desiredWorldPosition, axes);
    if (instance.weaponConfig.socketMode === 'shouldered-forward') {
      this.solveArmToTarget(instance, 'Left', supportTarget, axes);
    }
    instance.root.updateMatrixWorld(true);
    instance.weaponPivot.updateMatrixWorld(true);
  }

  private solveArmToTarget(
    instance: PreviewInstance,
    side: 'Right' | 'Left',
    target: THREE.Vector3,
    axes: { forward: THREE.Vector3; cleanUp: THREE.Vector3; actorRight: THREE.Vector3 },
  ): void {
    const upper = instance.bones.get(`${side}Arm`);
    const fore = instance.bones.get(`${side}ForeArm`);
    const hand = instance.bones.get(`${side}Hand`);
    if (!upper || !fore || !hand) return;

    instance.root.updateMatrixWorld(true);
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const elbowNow = fore.getWorldPosition(new THREE.Vector3());
    const handNow = hand.getWorldPosition(new THREE.Vector3());
    const upperLength = Math.max(0.001, shoulder.distanceTo(elbowNow));
    const foreLength = Math.max(0.001, elbowNow.distanceTo(handNow));
    const reach = Math.max(0.08, upperLength + foreLength - 0.025);
    const targetVector = target.clone().sub(shoulder);
    const distance = targetVector.length();
    if (distance < 0.001) return;

    const direction = targetVector.clone().normalize();
    const clampedTarget = distance > reach
      ? shoulder.clone().add(direction.clone().multiplyScalar(reach))
      : target.clone();
    const clampedDistance = Math.min(distance, reach);
    const sideSign = side === 'Right' ? 1 : -1;
    const pole = shoulder.clone()
      .add(axes.cleanUp.clone().multiplyScalar(-0.24))
      .add(axes.actorRight.clone().multiplyScalar(0.22 * sideSign))
      .add(axes.forward.clone().multiplyScalar(0.04));
    let planeNormal = direction.clone().cross(pole.clone().sub(shoulder)).normalize();
    if (planeNormal.lengthSq() < 0.0001) {
      planeNormal = axes.actorRight.clone().multiplyScalar(sideSign);
    }
    const bendDirection = planeNormal.clone().cross(direction).normalize();
    const along = (upperLength * upperLength - foreLength * foreLength + clampedDistance * clampedDistance)
      / (2 * clampedDistance);
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    const elbow = shoulder.clone()
      .add(direction.clone().multiplyScalar(along))
      .add(bendDirection.multiplyScalar(height));

    this.setBoneDirectionWorld(upper, elbow.clone().sub(shoulder));
    instance.root.updateMatrixWorld(true);
    const elbowWorld = fore.getWorldPosition(new THREE.Vector3());
    this.setBoneDirectionWorld(fore, clampedTarget.clone().sub(elbowWorld));
    instance.root.updateMatrixWorld(true);
  }

  private setBoneDirectionWorld(bone: THREE.Object3D, directionWorld: THREE.Vector3): void {
    if (!bone.parent) return;
    const direction = directionWorld.clone().normalize();
    if (direction.lengthSq() < 0.0001) return;
    const parentInv = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const targetLocal = direction.applyQuaternion(parentInv).normalize();
    bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetLocal);
    bone.updateMatrixWorld(true);
  }

  private getWeaponOffset(root: THREE.Object3D, key: 'stockOffset' | 'supportOffset', fallback: THREE.Vector3): THREE.Vector3 {
    const value = root.userData[key];
    return value instanceof THREE.Vector3 ? value.clone() : fallback;
  }

  private yawOf(vector: THREE.Vector3): number {
    return Math.atan2(vector.x, vector.z);
  }

  private normalizeYaw(value: number): number {
    let normalized = value;
    while (normalized > Math.PI) normalized -= Math.PI * 2;
    while (normalized < -Math.PI) normalized += Math.PI * 2;
    return normalized;
  }

  private getCameraAimForward(source: THREE.Vector3): THREE.Vector3 {
    const forward = this.camera.position.clone().sub(source);
    forward.y *= 0.18;
    return forward.normalize();
  }

  private getBoneWorldPosition(instance: PreviewInstance, name: string): THREE.Vector3 | undefined {
    const bone = instance.bones.get(name);
    return bone ? bone.getWorldPosition(new THREE.Vector3()) : undefined;
  }

  private getRootForward(root: THREE.Object3D): THREE.Vector3 {
    const quaternion = root.getWorldQuaternion(new THREE.Quaternion());
    return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private getBodyForward(instance: PreviewInstance): THREE.Vector3 {
    const body = instance.bones.get('Hips') ?? instance.bones.get('Spine') ?? instance.root;
    const quaternion = body.getWorldQuaternion(new THREE.Quaternion());
    return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  }

  private collectBones(root: THREE.Object3D): Map<string, THREE.Object3D> {
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((child) => {
      if (child instanceof THREE.Bone) bones.set(child.name, child);
    });
    return bones;
  }

  private centerOfObject(root: THREE.Object3D, object: THREE.Object3D | undefined): THREE.Vector3 | undefined {
    if (!object) return undefined;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return undefined;
    return root.worldToLocal(box.getCenter(new THREE.Vector3()));
  }

  private findNamed(root: THREE.Object3D, names: readonly string[]): THREE.Object3D | undefined {
    for (const name of names) {
      const found = root.getObjectByName(name);
      if (found) return found;
    }
    return undefined;
  }

  private createGroundMarker(): THREE.Object3D {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 48),
      new THREE.MeshStandardMaterial({
        color: 0x4f6b3a,
        roughness: 0.92,
        metalness: 0,
        transparent: true,
        opacity: 0.28,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.012;
    group.add(disc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.76, 0.79, 48),
      new THREE.MeshBasicMaterial({
        color: isBlufor(this.pendingFaction) ? 0x4f6b3a : 0x9e3b2e,
        transparent: true,
        opacity: 0.46,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.01;
    group.add(ring);
    return group;
  }

  private disposeInstance(): void {
    if (!this.instance) return;
    this.modelGroup.remove(this.instance.root);
    modelLoader.disposeInstance(this.instance.root);
    modelLoader.disposeInstance(this.instance.weaponRoot);
    this.instance.mixer.stopAllAction();
    this.instance = undefined;
    this.currentKey = '';
  }
}
