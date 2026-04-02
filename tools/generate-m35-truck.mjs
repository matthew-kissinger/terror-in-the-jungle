/**
 * M35 2.5-ton Cargo Truck ("Deuce-and-a-Half") GLB Generator
 *
 * Naming: Joint_* for animated pivots, Mesh_* for static geometry.
 * Orientation: Y-up, faces +Z, ground at Y=0.
 * Scale: ~6.7m L x 2.4m W x ~3.2m H (with canvas cover).
 * Tri budget: ~4000
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
const OD_GREEN = 0x4a5a2a;
const OD_DARK = 0x3a4a1e;
const TIRE_BLACK = 0x222222;
const METAL_DARK = 0x333333;
const METAL_GRAY = 0x555555;
const GLASS_TINT = 0x8899aa;
const CANVAS_TAN = 0x8b7d5e;
const CANVAS_DARK = 0x6b5d3e;
const WHITE_STAR = 0xddddcc;

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

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rTop, rBot, h, segs = 12) { return new THREE.CylinderGeometry(rTop, rBot, h, segs); }

function createWheel(radius = 0.45, width = 0.25) {
  const group = new THREE.Group();
  const tireCyl = new THREE.Mesh(cyl(radius, radius, width, 12), mat(TIRE_BLACK));
  tireCyl.rotation.z = Math.PI / 2;
  group.add(tireCyl);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.05, 0.07, 8, 16), mat(TIRE_BLACK));
  tire.rotation.y = Math.PI / 2;
  group.add(tire);
  const hub = new THREE.Mesh(cyl(radius * 0.4, radius * 0.4, width + 0.02, 8), mat(METAL_GRAY, { metalness: 0.4 }));
  hub.rotation.z = Math.PI / 2;
  group.add(hub);
  const hubCap = new THREE.Mesh(cyl(0.07, 0.07, width + 0.06, 6), mat(METAL_DARK, { metalness: 0.3 }));
  hubCap.rotation.z = Math.PI / 2;
  group.add(hubCap);
  return group;
}

function build() {
  const root = new THREE.Group();
  root.name = 'M35_Truck';

  // Dimensions reference:
  // Total length ~6.7m, cab front at z ~ -3.35, rear at z ~ +3.35
  // Cab: z = -3.35 to -1.2 (about 2.15m)
  // Cargo bed: z = -1.0 to +3.35 (about 4.35m)
  // Width: ~2.4m, trackWidth half = 1.0m
  // Cab top: ~2.5m, canvas top: ~3.2m

  const cabFrontZ = -3.1;
  const cabRearZ = -1.1;
  const cargoFrontZ = -0.9;
  const cargoRearZ = 3.1;

  // ==========================================
  // Mesh_Cab - driver cab
  // ==========================================
  const cab = new THREE.Group();
  cab.name = 'Mesh_Cab';

  // Cab main body (passenger area behind firewall)
  const cabBody = new THREE.Mesh(box(2.2, 1.0, 1.4), mat(OD_GREEN));
  cabBody.position.set(0, 1.3, -1.8);  // z = -2.5 to -1.1
  cab.add(cabBody);

  // Cab roof
  const cabRoof = new THREE.Mesh(box(2.2, 0.08, 1.4), mat(OD_GREEN));
  cabRoof.position.set(0, 1.84, -1.8);
  cab.add(cabRoof);

  // Firewall (separates engine from cab, closes front face)
  const firewall = new THREE.Mesh(box(2.2, 1.0, 0.06), mat(OD_DARK));
  firewall.position.set(0, 1.3, -2.5);
  cab.add(firewall);

  // Cowl panel (below windshield, above hood, transitions engine bay to cab)
  const cowl = new THREE.Mesh(box(2.2, 0.3, 0.5), mat(OD_GREEN));
  cowl.position.set(0, 1.55, -2.75);
  cab.add(cowl);

  // Engine hood (forward of firewall)
  const hood = new THREE.Mesh(box(2.0, 0.06, 1.1), mat(OD_GREEN));
  hood.position.set(0, 1.4, -3.15);
  cab.add(hood);

  // Hood sides (engine bay walls - full height, flush with cab)
  const hoodSideL = new THREE.Mesh(box(0.06, 0.6, 1.1), mat(OD_GREEN));
  hoodSideL.position.set(-0.97, 1.12, -3.15);
  cab.add(hoodSideL);
  const hoodSideR = hoodSideL.clone();
  hoodSideR.position.x = 0.97;
  cab.add(hoodSideR);

  // Engine block (fills the bay)
  const engineBlock = new THREE.Mesh(box(1.4, 0.55, 0.8), mat(METAL_GRAY, { metalness: 0.2 }));
  engineBlock.position.set(0, 1.1, -3.15);
  cab.add(engineBlock);

  // Grille (flush with front of hood area)
  const grilleFrontZ = -3.72;
  const grille = new THREE.Mesh(box(1.8, 0.7, 0.08), mat(OD_DARK));
  grille.position.set(0, 1.1, grilleFrontZ);
  cab.add(grille);

  // Grille slats
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(box(1.6, 0.04, 0.1), mat(METAL_GRAY, { metalness: 0.3 }));
    slat.position.set(0, 0.85 + i * 0.14, grilleFrontZ);
    cab.add(slat);
  }

  // Front bumper
  const fBumper = new THREE.Mesh(box(2.3, 0.12, 0.14), mat(METAL_DARK, { metalness: 0.4 }));
  fBumper.position.set(0, 0.55, grilleFrontZ - 0.05);
  cab.add(fBumper);

  // Lower front panel (below grille, closes off underbody)
  const lowerFront = new THREE.Mesh(box(2.0, 0.35, 0.06), mat(OD_DARK));
  lowerFront.position.set(0, 0.65, grilleFrontZ);
  cab.add(lowerFront);

  // Headlights
  const hlL = new THREE.Mesh(cyl(0.1, 0.1, 0.07, 8), mat(0xffffcc, { metalness: 0.3 }));
  hlL.rotation.x = Math.PI / 2;
  hlL.position.set(-0.65, 1.15, grilleFrontZ - 0.02);
  cab.add(hlL);
  const hlR = hlL.clone();
  hlR.position.x = 0.65;
  cab.add(hlR);

  // Windshield frame (at front face of passenger cab)
  const wsZ = -2.5;
  const wsFrameTop = new THREE.Mesh(box(2.1, 0.05, 0.04), mat(OD_DARK));
  wsFrameTop.position.set(0, 1.78, wsZ);
  cab.add(wsFrameTop);
  const wsFrameBot = new THREE.Mesh(box(2.1, 0.05, 0.04), mat(OD_DARK));
  wsFrameBot.position.set(0, 1.42, wsZ);
  cab.add(wsFrameBot);
  const wsFrameCenter = new THREE.Mesh(box(0.04, 0.36, 0.04), mat(OD_DARK));
  wsFrameCenter.position.set(0, 1.6, wsZ);
  cab.add(wsFrameCenter);

  // Windshield glass
  const glassMat = mat(GLASS_TINT, { transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide });
  const wsGlassL = new THREE.Mesh(box(1.0, 0.32, 0.01), glassMat);
  wsGlassL.position.set(-0.52, 1.6, wsZ);
  cab.add(wsGlassL);
  const wsGlassR = new THREE.Mesh(box(1.0, 0.32, 0.01), glassMat);
  wsGlassR.position.set(0.52, 1.6, wsZ);
  cab.add(wsGlassR);

  // Cab side windows (glass)
  const sideWinL = new THREE.Mesh(box(0.01, 0.3, 0.6), glassMat);
  sideWinL.position.set(-1.11, 1.6, -1.8);
  cab.add(sideWinL);
  const sideWinR = sideWinL.clone();
  sideWinR.position.x = 1.11;
  cab.add(sideWinR);

  // Dashboard (behind windshield)
  const dash = new THREE.Mesh(box(1.8, 0.3, 0.12), mat(OD_DARK));
  dash.position.set(0, 1.2, -2.35);
  cab.add(dash);

  // Seats (backs face rear)
  const seatL = new THREE.Mesh(box(0.55, 0.08, 0.45), mat(CANVAS_TAN));
  seatL.position.set(-0.45, 0.95, -1.7);
  cab.add(seatL);
  const seatBackL = new THREE.Mesh(box(0.55, 0.45, 0.06), mat(CANVAS_TAN));
  seatBackL.position.set(-0.45, 1.22, -1.48);
  cab.add(seatBackL);
  const seatR = seatL.clone(); seatR.position.x = 0.45; cab.add(seatR);
  const seatBackR = seatBackL.clone(); seatBackR.position.x = 0.45; cab.add(seatBackR);

  // Steering wheel (left side, behind dashboard)
  const swRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 6, 16), mat(METAL_DARK, { metalness: 0.3 }));
  swRing.position.set(-0.45, 1.35, -2.1);
  swRing.rotation.x = -Math.PI * 0.3;
  cab.add(swRing);

  // Star insignia on door
  const starL = new THREE.Mesh(cyl(0.18, 0.18, 0.01, 5), mat(WHITE_STAR));
  starL.rotation.z = Math.PI / 2;
  starL.position.set(-1.12, 1.3, -1.8);
  cab.add(starL);
  const starR = new THREE.Mesh(cyl(0.18, 0.18, 0.01, 5), mat(WHITE_STAR));
  starR.rotation.z = Math.PI / 2;
  starR.position.set(1.12, 1.3, -1.8);
  cab.add(starR);

  // Side mirrors
  const mirrorL = new THREE.Mesh(box(0.12, 0.1, 0.02), mat(METAL_GRAY));
  mirrorL.position.set(-1.25, 1.65, -2.4);
  cab.add(mirrorL);
  const mirrorR = mirrorL.clone(); mirrorR.position.x = 1.25; cab.add(mirrorR);

  // Cab rear wall
  const cabRear = new THREE.Mesh(box(2.2, 1.0, 0.06), mat(OD_GREEN));
  cabRear.position.set(0, 1.3, cabRearZ);
  cab.add(cabRear);

  root.add(cab);

  // ==========================================
  // Mesh_CargoBed - rear cargo area
  // ==========================================
  const cargoBed = new THREE.Group();
  cargoBed.name = 'Mesh_CargoBed';

  // Bed floor
  const bedFloor = new THREE.Mesh(box(2.2, 0.08, 4.0), mat(OD_DARK));
  bedFloor.position.set(0, 0.85, (cargoFrontZ + cargoRearZ) / 2);
  cargoBed.add(bedFloor);

  // Side walls (short stake sides)
  const sideWallL = new THREE.Mesh(box(0.06, 0.5, 4.0), mat(OD_GREEN));
  sideWallL.position.set(-1.1, 1.15, (cargoFrontZ + cargoRearZ) / 2);
  cargoBed.add(sideWallL);
  const sideWallR = sideWallL.clone();
  sideWallR.position.x = 1.1;
  cargoBed.add(sideWallR);

  // Stake uprights (3 per side)
  for (let i = 0; i < 3; i++) {
    const z = cargoFrontZ + 0.5 + i * 1.5;
    const stakeL = new THREE.Mesh(box(0.06, 1.2, 0.06), mat(OD_DARK));
    stakeL.position.set(-1.1, 1.5, z);
    cargoBed.add(stakeL);
    const stakeR = stakeL.clone(); stakeR.position.x = 1.1; cargoBed.add(stakeR);
  }

  // Front wall of cargo bed
  const bedFront = new THREE.Mesh(box(2.2, 0.5, 0.06), mat(OD_GREEN));
  bedFront.position.set(0, 1.15, cargoFrontZ);
  cargoBed.add(bedFront);

  // Cross-members under bed
  for (let i = 0; i < 3; i++) {
    const cross = new THREE.Mesh(box(2.0, 0.06, 0.06), mat(METAL_DARK));
    cross.position.set(0, 0.78, cargoFrontZ + 0.8 + i * 1.3);
    cargoBed.add(cross);
  }

  // Frame rails (run full length under both cab and bed)
  const frameL = new THREE.Mesh(box(0.1, 0.12, 6.2), mat(METAL_DARK));
  frameL.position.set(-0.45, 0.68, 0);
  cargoBed.add(frameL);
  const frameR = frameL.clone(); frameR.position.x = 0.45; cargoBed.add(frameR);

  root.add(cargoBed);

  // ==========================================
  // Mesh_CanvasCover - removable cargo cover
  // ==========================================
  const canvasCover = new THREE.Group();
  canvasCover.name = 'Mesh_CanvasCover';

  // Hoops (canvas support bows)
  for (let i = 0; i < 4; i++) {
    const z = cargoFrontZ + 0.3 + i * 1.15;
    const hoop = new THREE.Mesh(box(2.2, 0.04, 0.04), mat(METAL_GRAY));
    hoop.position.set(0, 2.2, z);
    canvasCover.add(hoop);
    // Vertical legs
    const legL = new THREE.Mesh(box(0.04, 0.8, 0.04), mat(METAL_GRAY));
    legL.position.set(-1.08, 1.8, z);
    canvasCover.add(legL);
    const legR = legL.clone(); legR.position.x = 1.08; canvasCover.add(legR);
  }

  // Canvas top
  const canvasTop = new THREE.Mesh(box(2.2, 0.03, 3.8), mat(CANVAS_TAN, { roughness: 0.95 }));
  canvasTop.position.set(0, 2.22, (cargoFrontZ + cargoRearZ) / 2);
  canvasCover.add(canvasTop);

  // Canvas sides
  const canvasSideL = new THREE.Mesh(box(0.03, 0.8, 3.8), mat(CANVAS_TAN, { roughness: 0.95 }));
  canvasSideL.position.set(-1.1, 1.82, (cargoFrontZ + cargoRearZ) / 2);
  canvasCover.add(canvasSideL);
  const canvasSideR = canvasSideL.clone(); canvasSideR.position.x = 1.1; canvasCover.add(canvasSideR);

  // Canvas rear flap (partially open)
  const canvasRear = new THREE.Mesh(box(2.0, 0.5, 0.03), mat(CANVAS_DARK, { roughness: 0.95 }));
  canvasRear.position.set(0, 2.0, cargoRearZ);
  canvasCover.add(canvasRear);

  root.add(canvasCover);

  // ==========================================
  // Mesh_Windshield (already part of cab but named for consistency)
  // ==========================================

  // ==========================================
  // Joint_Tailgate - rear drop gate
  // ==========================================
  const tailgate = new THREE.Group();
  tailgate.name = 'Joint_Tailgate';
  tailgate.position.set(0, 0.89, cargoRearZ);

  const tgPanel = new THREE.Mesh(box(2.1, 0.5, 0.06), mat(OD_GREEN));
  tgPanel.position.set(0, 0.25, 0);
  tailgate.add(tgPanel);

  // Tailgate hinges
  const hingeL = new THREE.Mesh(cyl(0.03, 0.03, 0.08, 6), mat(METAL_DARK));
  hingeL.rotation.z = Math.PI / 2;
  hingeL.position.set(-0.8, 0, 0);
  tailgate.add(hingeL);
  const hingeR = hingeL.clone(); hingeR.position.x = 0.8; tailgate.add(hingeR);

  // Tail lights
  const tailLightL = new THREE.Mesh(box(0.08, 0.08, 0.04), mat(0xaa2222));
  tailLightL.position.set(-1.0, 0.3, 0.04);
  tailgate.add(tailLightL);
  const tailLightR = tailLightL.clone(); tailLightR.position.x = 1.0; tailgate.add(tailLightR);

  root.add(tailgate);

  // ==========================================
  // Wheels
  // ==========================================
  const wheelR = 0.45;
  const wheelW = 0.25;
  const trackHalf = 1.0;
  const frontAxleZ = -2.8;
  const rearAxle1Z = 1.6;
  const rearAxle2Z = 2.6;
  const axleY = wheelR;

  // Front wheels (steering)
  const wheelFL = new THREE.Group(); wheelFL.name = 'Joint_WheelFL';
  wheelFL.add(createWheel(wheelR, wheelW));
  wheelFL.position.set(-trackHalf, axleY, frontAxleZ);
  root.add(wheelFL);

  const wheelFR = new THREE.Group(); wheelFR.name = 'Joint_WheelFR';
  wheelFR.add(createWheel(wheelR, wheelW));
  wheelFR.position.set(trackHalf, axleY, frontAxleZ);
  root.add(wheelFR);

  // Rear axle 1 (drive)
  const wheelRL1 = new THREE.Group(); wheelRL1.name = 'Joint_WheelRL1';
  wheelRL1.add(createWheel(wheelR, wheelW));
  wheelRL1.position.set(-trackHalf, axleY, rearAxle1Z);
  root.add(wheelRL1);

  const wheelRR1 = new THREE.Group(); wheelRR1.name = 'Joint_WheelRR1';
  wheelRR1.add(createWheel(wheelR, wheelW));
  wheelRR1.position.set(trackHalf, axleY, rearAxle1Z);
  root.add(wheelRR1);

  // Rear axle 2 (drive)
  const wheelRL2 = new THREE.Group(); wheelRL2.name = 'Joint_WheelRL2';
  wheelRL2.add(createWheel(wheelR, wheelW));
  wheelRL2.position.set(-trackHalf, axleY, rearAxle2Z);
  root.add(wheelRL2);

  const wheelRR2 = new THREE.Group(); wheelRR2.name = 'Joint_WheelRR2';
  wheelRR2.add(createWheel(wheelR, wheelW));
  wheelRR2.position.set(trackHalf, axleY, rearAxle2Z);
  root.add(wheelRR2);

  // Front fenders (flush with cab body at x=±1.1)
  const fTopL = new THREE.Mesh(box(0.3, 0.06, 1.2), mat(OD_GREEN));
  fTopL.position.set(-0.95, 0.9, frontAxleZ);
  root.add(fTopL);
  const fOuterL = new THREE.Mesh(box(0.06, 0.5, 1.2), mat(OD_GREEN));
  fOuterL.position.set(-1.1, 0.7, frontAxleZ);
  root.add(fOuterL);
  const fTopR = fTopL.clone(); fTopR.position.x = 0.95; root.add(fTopR);
  const fOuterR = fOuterL.clone(); fOuterR.position.x = 1.1; root.add(fOuterR);

  // Rear wheel fender / mud flaps (flush, covers dual axles)
  const rearFenderMidZ = (rearAxle1Z + rearAxle2Z) / 2;
  const rFenderL = new THREE.Mesh(box(0.06, 0.5, 2.0), mat(OD_GREEN));
  rFenderL.position.set(-1.1, 0.7, rearFenderMidZ);
  root.add(rFenderL);
  const rFenderTopL = new THREE.Mesh(box(0.3, 0.06, 2.0), mat(OD_GREEN));
  rFenderTopL.position.set(-0.95, 0.9, rearFenderMidZ);
  root.add(rFenderTopL);
  const rFenderR = rFenderL.clone(); rFenderR.position.x = 1.1; root.add(rFenderR);
  const rFenderTopR = rFenderTopL.clone(); rFenderTopR.position.x = 0.95; root.add(rFenderTopR);

  // Axle beams (visual)
  const axleBeam1 = new THREE.Mesh(cyl(0.04, 0.04, 1.9, 6), mat(METAL_DARK));
  axleBeam1.rotation.z = Math.PI / 2;
  axleBeam1.position.set(0, axleY, frontAxleZ);
  root.add(axleBeam1);
  const axleBeam2 = axleBeam1.clone(); axleBeam2.position.z = rearAxle1Z; root.add(axleBeam2);
  const axleBeam3 = axleBeam1.clone(); axleBeam3.position.z = rearAxle2Z; root.add(axleBeam3);

  // Rear bumper
  const rBumper = new THREE.Mesh(box(2.3, 0.12, 0.14), mat(METAL_DARK, { metalness: 0.4 }));
  rBumper.position.set(0, 0.55, cargoRearZ + 0.15);
  root.add(rBumper);

  // Exhaust pipe (right side)
  const exhaust = new THREE.Mesh(cyl(0.04, 0.04, 1.5, 6), mat(METAL_DARK, { metalness: 0.4 }));
  exhaust.position.set(1.0, 0.9, 0);
  root.add(exhaust);

  // Fuel tank (left side, under cab)
  const fuelTank = new THREE.Mesh(cyl(0.2, 0.2, 0.8, 8), mat(OD_DARK));
  fuelTank.rotation.z = Math.PI / 2;
  fuelTank.position.set(-0.85, 0.65, -0.5);
  root.add(fuelTank);

  // Antenna
  const antenna = new THREE.Mesh(cyl(0.006, 0.003, 1.8, 4), mat(METAL_DARK));
  antenna.position.set(-1.0, 2.75, -1.8);
  antenna.name = 'Mesh_Antenna';
  root.add(antenna);

  return root;
}

// --- Export ---
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (glb) => {
      const outPath = path.join(__dirname, '..', 'public', 'models', 'vehicles', 'ground', 'm35-truck.glb');
      fs.writeFileSync(outPath, Buffer.from(glb));
      const size = fs.statSync(outPath).size;
      console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);

      let tris = 0;
      scene.traverse((child) => {
        if (child.isMesh) {
          const geo = child.geometry;
          if (geo.index) tris += geo.index.count / 3;
          else if (geo.attributes.position) tris += geo.attributes.position.count / 3;
        }
      });
      console.log(`Triangles: ${tris}`);

      console.log('\nNamed parts:');
      scene.traverse((child) => {
        if (child.name && child.name !== 'M35_Truck') {
          const type = child.isMesh ? 'Mesh' : 'Group';
          let depth = 0;
          let p = child.parent;
          while (p && p !== scene) { depth++; p = p.parent; }
          console.log(`${'  '.repeat(depth)}${child.name} (${type})`);
        }
      });
      resolve();
    }, (err) => reject(err), { binary: true });
  });
}

const scene = new THREE.Scene();
const truck = build();
scene.add(truck);
await exportGLB(truck);
