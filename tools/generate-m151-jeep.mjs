/**
 * M151 MUTT Jeep GLB Generator
 *
 * Procedural geometry using Three.js primitives, exported to GLB.
 * Naming: Joint_* for animated pivots, Mesh_* for static geometry.
 * Orientation: Y-up, faces +Z, ground at Y=0.
 * Scale: ~3.4m L x 1.6m W x 1.8m H (real-world M151 dimensions).
 * Tri budget: ~3000
 */

import * as THREE from 'three';
import { Blob as NodeBlob } from 'buffer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill browser APIs for Three.js GLTFExporter in Node
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        const type = blob.type || 'application/octet-stream';
        this.result = `data:${type};base64,${b64}`;
        if (this.onloadend) this.onloadend();
        else if (this.onload) this.onload();
      });
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
        else if (this.onload) this.onload();
      });
    }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: (ns, tag) => {
      if (tag === 'canvas') {
        return { getContext: () => null, width: 0, height: 0, toDataURL: () => '' };
      }
      return {};
    },
  };
}

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Colors ---
const OD_GREEN = 0x4a5a2a;       // Olive drab
const OD_DARK = 0x3a4a1e;        // Darker OD for accents
const TIRE_BLACK = 0x222222;      // Tire rubber
const METAL_DARK = 0x333333;      // Dark metal (gun, axles)
const METAL_GRAY = 0x555555;      // Light metal (engine parts)
const GLASS_TINT = 0x8899aa;      // Windshield glass
const CANVAS_TAN = 0x8b7d5e;     // Canvas seat color
const WHITE_STAR = 0xddddcc;     // US star insignia

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: opts.roughness ?? 0.8,
    metalness: opts.metalness ?? 0.1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
  });
}

// --- Geometry helpers ---
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rTop, rBot, h, segs = 12) { return new THREE.CylinderGeometry(rTop, rBot, h, segs); }

function createWheel(radius = 0.35, width = 0.2) {
  const group = new THREE.Group();

  // Outer tire body (cylinder) - rotated so axle runs along X (left-right)
  const tireCyl = new THREE.Mesh(cyl(radius, radius, width, 12), mat(TIRE_BLACK));
  tireCyl.rotation.z = Math.PI / 2;
  group.add(tireCyl);

  // Tire tread ring
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 0.04, 0.06, 8, 16),
    mat(TIRE_BLACK)
  );
  tire.rotation.y = Math.PI / 2;
  group.add(tire);

  // Rim/hub (visible on both sides)
  const hub = new THREE.Mesh(cyl(radius * 0.45, radius * 0.45, width + 0.02, 8), mat(METAL_GRAY, { metalness: 0.4 }));
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  // Hub cap detail
  const hubCap = new THREE.Mesh(cyl(0.06, 0.06, width + 0.06, 6), mat(METAL_DARK, { metalness: 0.3 }));
  hubCap.rotation.z = Math.PI / 2;
  group.add(hubCap);

  return group;
}

function build() {
  const root = new THREE.Group();
  root.name = 'M151_Jeep';

  // ==========================================
  // Mesh_Body - main chassis/body
  // ==========================================
  const body = new THREE.Group();
  body.name = 'Mesh_Body';

  // Main chassis frame
  const chassis = new THREE.Mesh(box(1.5, 0.15, 3.2), mat(OD_GREEN));
  chassis.position.set(0, 0.45, 0);
  body.add(chassis);

  // Lower body / underbody
  const underbody = new THREE.Mesh(box(1.4, 0.12, 2.8), mat(OD_DARK));
  underbody.position.set(0, 0.35, 0);
  body.add(underbody);

  // Front fenders - wrap around wheel arch with top, outer side, and inner connection
  // Left front fender
  const fTopL = new THREE.Mesh(box(0.35, 0.06, 1.1), mat(OD_GREEN));  // top panel over wheel
  fTopL.position.set(-0.68, 0.72, -1.0);
  body.add(fTopL);
  const fOuterL = new THREE.Mesh(box(0.06, 0.35, 1.1), mat(OD_GREEN));  // outer side wall
  fOuterL.position.set(-0.84, 0.55, -1.0);
  body.add(fOuterL);
  const fInnerL = new THREE.Mesh(box(0.06, 0.25, 0.5), mat(OD_DARK));  // inner splash guard
  fInnerL.position.set(-0.52, 0.50, -1.0);
  body.add(fInnerL);

  // Right front fender (mirror)
  const fTopR = fTopL.clone();
  fTopR.position.x = 0.68;
  body.add(fTopR);
  const fOuterR = fOuterL.clone();
  fOuterR.position.x = 0.84;
  body.add(fOuterR);
  const fInnerR = fInnerL.clone();
  fInnerR.position.x = 0.52;
  body.add(fInnerR);

  // Rear fenders - similar wrap
  const rTopL = new THREE.Mesh(box(0.32, 0.06, 0.8), mat(OD_GREEN));
  rTopL.position.set(-0.68, 0.72, 1.0);
  body.add(rTopL);
  const rOuterL = new THREE.Mesh(box(0.06, 0.30, 0.8), mat(OD_GREEN));
  rOuterL.position.set(-0.84, 0.57, 1.0);
  body.add(rOuterL);

  const rTopR = rTopL.clone();
  rTopR.position.x = 0.68;
  body.add(rTopR);
  const rOuterR = rOuterL.clone();
  rOuterR.position.x = 0.84;
  body.add(rOuterR);

  // Engine bay side walls (close off the gap between fenders and cabin)
  const engineSideL = new THREE.Mesh(box(0.06, 0.42, 1.0), mat(OD_GREEN));
  engineSideL.position.set(-0.52, 0.72, -1.0);
  body.add(engineSideL);
  const engineSideR = engineSideL.clone();
  engineSideR.position.x = 0.52;
  body.add(engineSideR);

  // Engine block (visible through open top between hood edges, fills the bay)
  const engineBlock = new THREE.Mesh(box(0.7, 0.3, 0.7), mat(METAL_GRAY, { metalness: 0.2 }));
  engineBlock.position.set(0, 0.68, -1.0);
  body.add(engineBlock);

  // Valve cover
  const valveCover = new THREE.Mesh(box(0.5, 0.08, 0.4), mat(OD_DARK));
  valveCover.position.set(0, 0.85, -1.0);
  body.add(valveCover);

  // Radiator (behind grille)
  const radiator = new THREE.Mesh(box(0.9, 0.35, 0.06), mat(METAL_DARK, { metalness: 0.3 }));
  radiator.position.set(0, 0.65, -1.48);
  body.add(radiator);

  // Front grille
  const grille = new THREE.Mesh(box(1.2, 0.5, 0.08), mat(OD_DARK));
  grille.position.set(0, 0.65, -1.55);
  body.add(grille);

  // Grille slats (3 horizontal bars)
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(box(1.1, 0.04, 0.1), mat(METAL_GRAY, { metalness: 0.3 }));
    slat.position.set(0, 0.52 + i * 0.12, -1.55);
    body.add(slat);
  }

  // Headlights
  const headlightL = new THREE.Mesh(cyl(0.08, 0.08, 0.06, 8), mat(0xffffcc, { metalness: 0.3 }));
  headlightL.rotation.x = Math.PI / 2;
  headlightL.position.set(-0.4, 0.7, -1.58);
  body.add(headlightL);
  const headlightR = headlightL.clone();
  headlightR.position.x = 0.4;
  body.add(headlightR);

  // Side panels (cabin area)
  const sidePanelL = new THREE.Mesh(box(0.06, 0.35, 1.6), mat(OD_GREEN));
  sidePanelL.position.set(-0.75, 0.72, 0.0);
  body.add(sidePanelL);
  const sidePanelR = sidePanelL.clone();
  sidePanelR.position.x = 0.75;
  body.add(sidePanelR);

  // Rear panel
  const rearPanel = new THREE.Mesh(box(1.5, 0.4, 0.06), mat(OD_GREEN));
  rearPanel.position.set(0, 0.65, 1.55);
  body.add(rearPanel);

  // Floor pan
  const floorPan = new THREE.Mesh(box(1.4, 0.04, 1.6), mat(OD_DARK));
  floorPan.position.set(0, 0.52, 0.0);
  body.add(floorPan);

  // Dashboard
  const dashboard = new THREE.Mesh(box(1.3, 0.25, 0.1), mat(OD_DARK));
  dashboard.position.set(0, 0.85, -0.7);
  body.add(dashboard);

  // Front bumper
  const bumper = new THREE.Mesh(box(1.5, 0.1, 0.12), mat(METAL_DARK, { metalness: 0.4 }));
  bumper.position.set(0, 0.38, -1.6);
  body.add(bumper);

  // Rear bumper
  const rBumper = new THREE.Mesh(box(1.5, 0.1, 0.12), mat(METAL_DARK, { metalness: 0.4 }));
  rBumper.position.set(0, 0.38, 1.6);
  body.add(rBumper);

  // Seats (2 front bucket seats) - seat backs behind (+Z) the seat cushion
  const seatL = new THREE.Mesh(box(0.4, 0.08, 0.4), mat(CANVAS_TAN));
  seatL.position.set(-0.35, 0.58, -0.15);
  body.add(seatL);
  const seatBackL = new THREE.Mesh(box(0.4, 0.35, 0.06), mat(CANVAS_TAN));
  seatBackL.position.set(-0.35, 0.78, 0.04);  // behind seat (+Z = toward rear)
  body.add(seatBackL);

  const seatR = seatL.clone();
  seatR.position.x = 0.35;
  body.add(seatR);
  const seatBackR = seatBackL.clone();
  seatBackR.position.x = 0.35;
  body.add(seatBackR);

  // Rear bench seat
  const rearSeat = new THREE.Mesh(box(1.2, 0.08, 0.35), mat(CANVAS_TAN));
  rearSeat.position.set(0, 0.58, 0.6);
  body.add(rearSeat);
  const rearSeatBack = new THREE.Mesh(box(1.2, 0.35, 0.06), mat(CANVAS_TAN));
  rearSeatBack.position.set(0, 0.78, 0.76);
  body.add(rearSeatBack);

  // Taillights
  const tailL = new THREE.Mesh(box(0.06, 0.06, 0.04), mat(0xaa2222));
  tailL.position.set(-0.65, 0.6, 1.57);
  body.add(tailL);
  const tailR = tailL.clone();
  tailR.position.x = 0.65;
  body.add(tailR);

  root.add(body);

  // ==========================================
  // Mesh_Hood - engine hood with star insignia
  // ==========================================
  const hood = new THREE.Group();
  hood.name = 'Mesh_Hood';

  const hoodPanel = new THREE.Mesh(box(1.2, 0.06, 1.0), mat(OD_GREEN));
  hoodPanel.position.set(0, 0.92, -1.0);
  hood.add(hoodPanel);

  // Star insignia (simplified as a white circle on hood)
  const star = new THREE.Mesh(cyl(0.15, 0.15, 0.01, 5), mat(WHITE_STAR));
  star.rotation.x = 0;
  star.position.set(0, 0.96, -1.0);
  hood.add(star);

  root.add(hood);

  // ==========================================
  // Mesh_Windshield - foldable windshield frame
  // ==========================================
  const windshield = new THREE.Group();
  windshield.name = 'Mesh_Windshield';

  // Outer frame (thin border)
  const wsFrameTop = new THREE.Mesh(box(1.3, 0.04, 0.04), mat(OD_DARK));
  wsFrameTop.position.set(0, 1.37, -0.55);
  windshield.add(wsFrameTop);
  const wsFrameBot = new THREE.Mesh(box(1.3, 0.04, 0.04), mat(OD_DARK));
  wsFrameBot.position.set(0, 0.88, -0.55);
  windshield.add(wsFrameBot);
  const wsFrameL = new THREE.Mesh(box(0.04, 0.53, 0.04), mat(OD_DARK));
  wsFrameL.position.set(-0.64, 1.12, -0.55);
  windshield.add(wsFrameL);
  const wsFrameR = wsFrameL.clone();
  wsFrameR.position.x = 0.64;
  windshield.add(wsFrameR);
  // Center divider
  const wsFrameCenter = new THREE.Mesh(box(0.03, 0.49, 0.04), mat(OD_DARK));
  wsFrameCenter.position.set(0, 1.12, -0.55);
  windshield.add(wsFrameCenter);

  // Glass panes (transparent, visible from both sides)
  const glassMat = mat(GLASS_TINT, { transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide });
  const wsGlassL = new THREE.Mesh(box(0.58, 0.45, 0.01), glassMat);
  wsGlassL.position.set(-0.32, 1.12, -0.55);
  windshield.add(wsGlassL);
  const wsGlassR = new THREE.Mesh(box(0.58, 0.45, 0.01), glassMat);
  wsGlassR.position.set(0.32, 1.12, -0.55);
  windshield.add(wsGlassR);

  root.add(windshield);

  // ==========================================
  // Mesh_SteeringWheel
  // ==========================================
  const steeringWheel = new THREE.Group();
  steeringWheel.name = 'Mesh_SteeringWheel';

  const swRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.015, 6, 16),
    mat(METAL_DARK, { metalness: 0.3 })
  );
  swRing.position.set(-0.3, 0.95, -0.42);  // in front of driver, behind dashboard
  swRing.rotation.x = -Math.PI * 0.3;
  steeringWheel.add(swRing);

  const swColumn = new THREE.Mesh(cyl(0.02, 0.02, 0.2, 6), mat(METAL_DARK));
  swColumn.position.set(-0.3, 0.88, -0.52);  // column angled into dashboard
  swColumn.rotation.x = -Math.PI * 0.3;
  steeringWheel.add(swColumn);

  root.add(steeringWheel);

  // ==========================================
  // Mesh_SpareTire - mounted on rear
  // ==========================================
  const spareTire = new THREE.Group();
  spareTire.name = 'Mesh_SpareTire';

  const spTire = createWheel(0.32, 0.16);
  spTire.rotation.y = Math.PI / 2;  // face flat against rear
  spTire.position.set(0, 0.75, 1.65);
  spareTire.add(spTire);

  // Mounting bracket
  const bracket = new THREE.Mesh(box(0.06, 0.3, 0.06), mat(METAL_DARK));
  bracket.position.set(0, 0.6, 1.58);
  spareTire.add(bracket);

  root.add(spareTire);

  // ==========================================
  // Wheels - Joint_WheelFL/FR/RL/RR
  // Pivot at axle center for rotation
  // ==========================================
  const wheelRadius = 0.35;
  const wheelWidth = 0.2;
  const trackWidth = 0.75; // half-width (center to wheel)
  const frontAxleZ = -1.0;
  const rearAxleZ = 1.0;
  const axleY = wheelRadius;

  // Front-left wheel
  const wheelFL = new THREE.Group();
  wheelFL.name = 'Joint_WheelFL';
  const wFL = createWheel(wheelRadius, wheelWidth);
  wheelFL.add(wFL);
  wheelFL.position.set(-trackWidth, axleY, frontAxleZ);
  root.add(wheelFL);

  // Front-right wheel
  const wheelFR = new THREE.Group();
  wheelFR.name = 'Joint_WheelFR';
  const wFR = createWheel(wheelRadius, wheelWidth);
  wheelFR.add(wFR);
  wheelFR.position.set(trackWidth, axleY, frontAxleZ);
  root.add(wheelFR);

  // Rear-left wheel
  const wheelRL = new THREE.Group();
  wheelRL.name = 'Joint_WheelRL';
  const wRL = createWheel(wheelRadius, wheelWidth);
  wheelRL.add(wRL);
  wheelRL.position.set(-trackWidth, axleY, rearAxleZ);
  root.add(wheelRL);

  // Rear-right wheel
  const wheelRR = new THREE.Group();
  wheelRR.name = 'Joint_WheelRR';
  const wRR = createWheel(wheelRadius, wheelWidth);
  wheelRR.add(wRR);
  wheelRR.position.set(trackWidth, axleY, rearAxleZ);
  root.add(wheelRR);

  // Front axle beam (visual)
  const frontAxle = new THREE.Mesh(cyl(0.03, 0.03, 1.4, 6), mat(METAL_DARK));
  frontAxle.rotation.z = Math.PI / 2;
  frontAxle.position.set(0, axleY, frontAxleZ);
  body.add(frontAxle);

  // Rear axle beam (visual)
  const rearAxle = new THREE.Mesh(cyl(0.03, 0.03, 1.4, 6), mat(METAL_DARK));
  rearAxle.rotation.z = Math.PI / 2;
  rearAxle.position.set(0, axleY, rearAxleZ);
  body.add(rearAxle);

  // ==========================================
  // Joint_GunMount - rear M60 pedestal (yaw 360)
  // ==========================================
  const gunMount = new THREE.Group();
  gunMount.name = 'Joint_GunMount';
  gunMount.position.set(0, 0.9, 0.9);

  // Pedestal post
  const pedestal = new THREE.Mesh(cyl(0.06, 0.08, 0.45, 8), mat(METAL_DARK, { metalness: 0.3 }));
  pedestal.position.y = 0.22;
  gunMount.add(pedestal);

  // Mounting ring
  const mountRing = new THREE.Mesh(cyl(0.12, 0.12, 0.05, 8), mat(METAL_DARK, { metalness: 0.4 }));
  mountRing.position.y = 0.45;
  gunMount.add(mountRing);

  // ==========================================
  // Joint_GunBarrel - M60 barrel (pitch), child of GunMount
  // ==========================================
  const gunBarrel = new THREE.Group();
  gunBarrel.name = 'Joint_GunBarrel';
  gunBarrel.position.set(0, 0.5, 0);

  // M60 receiver body
  const receiver = new THREE.Mesh(box(0.12, 0.12, 0.4), mat(METAL_DARK, { metalness: 0.3 }));
  receiver.position.set(0, 0, -0.05);
  gunBarrel.add(receiver);

  // Barrel - thick enough to read at distance
  const barrel = new THREE.Mesh(cyl(0.035, 0.03, 0.7, 8), mat(METAL_DARK, { metalness: 0.4 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.5);
  gunBarrel.add(barrel);

  // Barrel shroud / heat shield
  const shroud = new THREE.Mesh(cyl(0.045, 0.045, 0.35, 8), mat(METAL_GRAY, { metalness: 0.2 }));
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(0, 0.02, -0.4);
  gunBarrel.add(shroud);

  // Gas tube (above barrel)
  const gasTube = new THREE.Mesh(cyl(0.02, 0.02, 0.3, 6), mat(METAL_DARK));
  gasTube.rotation.x = Math.PI / 2;
  gasTube.position.set(0, 0.06, -0.35);
  gunBarrel.add(gasTube);

  // Ammo box
  const ammoBox = new THREE.Mesh(box(0.1, 0.08, 0.12), mat(OD_GREEN));
  ammoBox.position.set(0.1, -0.05, 0.05);
  gunBarrel.add(ammoBox);

  // Pistol grip / handle
  const grip = new THREE.Mesh(box(0.03, 0.1, 0.03), mat(METAL_DARK));
  grip.position.set(0, -0.08, 0.1);
  grip.rotation.x = 0.2;
  gunBarrel.add(grip);

  gunMount.add(gunBarrel);
  root.add(gunMount);

  // ==========================================
  // Antenna whip
  // ==========================================
  const antenna = new THREE.Mesh(cyl(0.005, 0.003, 1.5, 4), mat(METAL_DARK));
  antenna.position.set(-0.6, 1.5, 1.2);
  antenna.name = 'Mesh_Antenna';
  root.add(antenna);

  return root;
}

// --- Export ---
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (glb) => {
      const outPath = path.join(__dirname, '..', 'public', 'models', 'vehicles', 'ground', 'm151-jeep.glb');
      fs.writeFileSync(outPath, Buffer.from(glb));
      const size = fs.statSync(outPath).size;
      console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

      // Count tris
      let tris = 0;
      scene.traverse((child) => {
        if (child.isMesh) {
          const geo = child.geometry;
          if (geo.index) tris += geo.index.count / 3;
          else if (geo.attributes.position) tris += geo.attributes.position.count / 3;
        }
      });
      console.log(`Triangles: ${tris}`);

      // List named parts
      console.log('\nNamed parts:');
      scene.traverse((child) => {
        if (child.name && child.name !== 'M151_Jeep') {
          const type = child.isMesh ? 'Mesh' : 'Group';
          const depth = getDepth(child, scene);
          const indent = '  '.repeat(depth);
          console.log(`${indent}${child.name} (${type})`);
        }
      });
      resolve();
    }, (err) => reject(err), { binary: true });
  });
}

function getDepth(obj, root) {
  let depth = 0;
  let current = obj.parent;
  while (current && current !== root) {
    depth++;
    current = current.parent;
  }
  return depth;
}

const scene = new THREE.Scene();
const jeep = build();
scene.add(jeep);
await exportGLB(jeep);
