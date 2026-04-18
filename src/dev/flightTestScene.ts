/**
 * Isolated fixed-wing test scene.
 *
 * Deliberately minimal: flat ground plane at y=0, single Skyraider (Airframe +
 * placeholder mesh), chase-cam, keyboard input, on-screen debug overlay. No AI,
 * combat, LOD, objectives, terrain streaming, HUD, or mode selection. The scene
 * lets a human feel the controls and an agent see the full input → physics →
 * render path in isolation.
 *
 * See docs/tasks/A1-plane-test-mode.md.
 */

import * as THREE from 'three';
import { Airframe } from '../systems/vehicle/airframe/Airframe';
import { createFlatTerrainProbe } from '../systems/vehicle/airframe/terrainProbe';
import type { AirframeIntent } from '../systems/vehicle/airframe/types';
import { FIXED_WING_CONFIGS } from '../systems/vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy, airframeStateToFixedWingSnapshot } from '../systems/vehicle/FixedWingTypes';

interface InputState {
  throttleUp: boolean;
  throttleDown: boolean;
  pitchUp: boolean;
  pitchDown: boolean;
  rollLeft: boolean;
  rollRight: boolean;
  yawLeft: boolean;
  yawRight: boolean;
  brake: boolean;
  reset: boolean;
}

const GROUND_SIZE = 1000; // 1km x 1km
const SPAWN_POSITION = new THREE.Vector3(0, 1.5, 0);
const CAMERA_DISTANCE = 30;
const CAMERA_HEIGHT = 8;
const THROTTLE_RAMP = 0.8;
const CONTROL_SMOOTH = 8.0;
const RESET_DEBOUNCE_MS = 300;

const CONFIG_KEY = 'A1_SKYRAIDER';

export class FlightTestScene {
  private readonly container: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly aircraftGroup = new THREE.Group();
  private readonly airframe: Airframe;
  private readonly terrainProbe = createFlatTerrainProbe(0);

  private readonly input: InputState = {
    throttleUp: false,
    throttleDown: false,
    pitchUp: false,
    pitchDown: false,
    rollLeft: false,
    rollRight: false,
    yawLeft: false,
    yawRight: false,
    brake: false,
    reset: false,
  };

  private throttleTarget = 0;
  private pitchCommand = 0;
  private rollCommand = 0;
  private yawCommand = 0;
  private lastResetMs = 0;

  private overlay!: HTMLDivElement;
  private legend!: HTMLDivElement;
  private clock = new THREE.Clock();
  private animationFrameId: number | null = null;
  private disposed = false;

  // Bound listeners (so we can remove them on dispose)
  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private readonly onResize = () => this.handleResize();

  constructor(container: HTMLElement) {
    this.container = container;

    const config = FIXED_WING_CONFIGS[CONFIG_KEY];
    if (!config) {
      throw new Error(`Flight test scene: missing config for ${CONFIG_KEY}`);
    }

    this.airframe = new Airframe(SPAWN_POSITION.clone(), airframeConfigFromLegacy(config.physics));

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / Math.max(window.innerHeight, 1),
      0.1,
      5000,
    );

    // Skybox: simple color
    this.scene.background = new THREE.Color(0x87ceeb);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444422, 1.1);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(200, 500, 200);
    this.scene.add(dir);

    // Ground plane at y=0
    const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4c7a3a });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);

    // Runway centerline marker so orientation is visible
    const runwayGeom = new THREE.PlaneGeometry(20, GROUND_SIZE);
    const runwayMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const runway = new THREE.Mesh(runwayGeom, runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.y = 0.01;
    this.scene.add(runway);

    // Aircraft placeholder mesh: fuselage + wings + tail + nose-marker. GLB-free
    // so the test scene has no asset/network dependency. Inner mesh follows GLB
    // convention (+Z forward) and is rotated 180° on Y so visual forward matches
    // the physics forward (-Z).
    const inner = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x888855 });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0x666633 });
    const addPart = (geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      inner.add(m);
      return m;
    };
    addPart(new THREE.BoxGeometry(1.5, 1.5, 8), bodyMat, 0, 0.2, 0);
    addPart(new THREE.BoxGeometry(12, 0.3, 2), wingMat, 0, 0.2, 0);
    addPart(new THREE.BoxGeometry(3, 1.5, 0.4), wingMat, 0, 1.0, 3.2);
    const nose = addPart(
      new THREE.ConeGeometry(0.5, 1.5, 12),
      new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
      0, 0.2, -4.2,
    );
    nose.rotation.x = -Math.PI / 2;
    inner.rotation.y = Math.PI;
    this.aircraftGroup.add(inner);
    this.aircraftGroup.position.copy(SPAWN_POSITION);
    this.scene.add(this.aircraftGroup);

    // UI overlays
    this.createOverlay();
    this.createLegend();

    // Input
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 1 / 30);
      this.update(dt);
      this.render();
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    if (this.overlay?.parentElement) this.overlay.parentElement.removeChild(this.overlay);
    if (this.legend?.parentElement) this.legend.parentElement.removeChild(this.legend);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }

  // ── Main loop ──

  private update(dt: number): void {
    // Handle reset edge
    if (this.input.reset) {
      const nowMs = performance.now();
      if (nowMs - this.lastResetMs > RESET_DEBOUNCE_MS) {
        this.lastResetMs = nowMs;
        this.resetAircraft();
      }
    }

    // Throttle ramp (W/S)
    if (this.input.throttleUp) {
      this.throttleTarget = Math.min(1, this.throttleTarget + THROTTLE_RAMP * dt);
    } else if (this.input.throttleDown) {
      this.throttleTarget = Math.max(0, this.throttleTarget - THROTTLE_RAMP * dt);
    }

    // Control commands with gentle smoothing
    const targetPitch = this.input.pitchUp ? 1 : this.input.pitchDown ? -1 : 0;
    const targetRoll = this.input.rollRight ? 1 : this.input.rollLeft ? -1 : 0;
    const targetYaw = this.input.yawRight ? -1 : this.input.yawLeft ? 1 : 0;
    const k = Math.min(CONTROL_SMOOTH * dt, 1);
    this.pitchCommand = lerp(this.pitchCommand, targetPitch, k);
    this.rollCommand = lerp(this.rollCommand, targetRoll, k);
    this.yawCommand = lerp(this.yawCommand, targetYaw, k);

    // Drive physics — input-before-vehicle. Build intent from the smoothed
    // commanded values; the airframe config is feel-neutralized so these
    // values flow straight through to surface deflection in the raw tier.
    const intent: AirframeIntent = {
      pitch: this.pitchCommand,
      roll: this.rollCommand,
      yaw: this.yawCommand,
      throttle: this.throttleTarget,
      brake: this.input.brake ? 1 : 0,
      tier: 'raw',
    };
    this.airframe.step(intent, this.terrainProbe, dt);

    // Sync rendered transform from airframe
    this.aircraftGroup.position.copy(this.airframe.getPosition());
    this.aircraftGroup.quaternion.copy(this.airframe.getQuaternion());

    // Chase-cam follow (mirrors PlayerCamera.updateFixedWingCamera following
    // branch, simplified — no mouse orbit in the test scene).
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.airframe.getQuaternion());
    const camPos = this.airframe.getPosition().clone()
      .addScaledVector(forward, -CAMERA_DISTANCE);
    camPos.y += CAMERA_HEIGHT;
    this.camera.position.lerp(camPos, 0.08);
    const lookAt = this.airframe.getPosition().clone();
    lookAt.y += 2;
    this.camera.lookAt(lookAt);

    this.updateOverlay();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // ── Input ──

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code.toLowerCase();
    switch (code) {
      case 'keyw': this.input.throttleUp = down; break;
      case 'keys': this.input.throttleDown = down; break;
      case 'arrowup': this.input.pitchUp = down; break;
      case 'arrowdown': this.input.pitchDown = down; break;
      case 'arrowleft': this.input.rollLeft = down; break;
      case 'arrowright': this.input.rollRight = down; break;
      case 'keya': this.input.yawLeft = down; break;
      case 'keyd': this.input.yawRight = down; break;
      case 'space': this.input.brake = down; break;
      case 'keyr': this.input.reset = down; break;
      default: return;
    }
    // Prevent browser scroll on arrow keys
    if (code.startsWith('arrow') || code === 'space') {
      e.preventDefault();
    }
  }

  private resetAircraft(): void {
    this.airframe.resetToGround(SPAWN_POSITION.clone());
    this.throttleTarget = 0;
    this.pitchCommand = 0;
    this.rollCommand = 0;
    this.yawCommand = 0;
    this.aircraftGroup.position.copy(this.airframe.getPosition());
    this.aircraftGroup.quaternion.copy(this.airframe.getQuaternion());
  }

  // ── UI ──

  private createOverlay(): void {
    this.overlay = this.makePanel('top: 12px; left: 12px; color: #e7ffe0; font-size: 13px;');
    this.overlay.textContent = 'flight-test mode';
  }

  private createLegend(): void {
    this.legend = this.makePanel('bottom: 12px; left: 12px; color: #cfe7ff; font-size: 12px;');
    this.legend.textContent = [
      'W / S       throttle up / down',
      'Arrow Up/Dn pitch (elevator)',
      'Arrow L/R   roll (ailerons)',
      'A / D       yaw (rudder)',
      'Space       brake',
      'R           reset to spawn',
    ].join('\n');
  }

  private makePanel(positionCss: string): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      `position: fixed; ${positionCss} padding: 10px 14px;` +
      ' background: rgba(0,0,0,0.55);' +
      ' font-family: JetBrains Mono, Consolas, monospace;' +
      ' line-height: 1.45; white-space: pre;' +
      ' pointer-events: none; z-index: 9998;';
    document.body.appendChild(panel);
    return panel;
  }

  private updateOverlay(): void {
    const s = airframeStateToFixedWingSnapshot(this.airframe.getState());
    const lines = [
      'FLIGHT TEST MODE',
      '',
      `airspeed     ${s.forwardAirspeed.toFixed(1)} m/s`,
      `altitude AGL ${s.altitudeAGL.toFixed(1)} m`,
      `pitch        ${s.pitchDeg.toFixed(1)} deg`,
      `roll         ${s.rollDeg.toFixed(1)} deg`,
      `elevator_cmd ${this.pitchCommand.toFixed(2)}`,
      `aileron_cmd  ${this.rollCommand.toFixed(2)}`,
      `throttle     ${s.throttle.toFixed(2)}`,
      `wheels       ${s.weightOnWheels ? 'ON_GROUND' : 'AIRBORNE'}`,
      `phase        ${s.phase}`,
    ];
    this.overlay.textContent = lines.join('\n');
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = Math.max(window.innerHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
