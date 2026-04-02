/**
 * M113 Armored Personnel Carrier GLB Generator
 *
 * Naming: Joint_* for animated pivots, Mesh_* for static geometry.
 * Orientation: Y-up, faces +Z, ground at Y=0.
 * Scale: ~4.9m L x 2.7m W x 2.5m H.
 * Tri budget: ~5000
 */

import * as THREE from 'three';
import { Blob as NodeBlob } from 'buffer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        if (this.onloadend) this.onloadend(); else if (this.onload) this.onload();
      });
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend(); else if (this.onload) this.onload();
      });
    }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => ({ getContext: () => null, width: 0, height: 0, toDataURL: () => '' }) };
}

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colors
const ARMOR_GREEN = 0x4a5a2a;
const ARMOR_DARK = 0x3a4a1e;
const METAL_DARK = 0x333333;
const METAL_GRAY = 0x555555;
const TRACK_BLACK = 0x1a1a1a;
const RUBBER_DARK = 0x252525;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true,
    roughness: opts.roughness ?? 0.8, metalness: opts.metalness ?? 0.15,
    transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
  });
}
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rT, rB, h, s = 12) { return new THREE.CylinderGeometry(rT, rB, h, s); }

function build() {
  const root = new THREE.Group();
  root.name = 'M113_APC';

  // M113 dimensions: 4.86m L x 2.69m W x 2.5m H
  // Hull is a boxy aluminum shape with angled front
  const hullL = 4.8;
  const hullW = 2.6;
  const hullH = 1.6;
  const hullY = 0.5 + hullH / 2; // bottom at 0.5 (above tracks)

  // ==========================================
  // Mesh_Hull - main armored body
  // ==========================================
  const hull = new THREE.Group();
  hull.name = 'Mesh_Hull';

  // Hull top Y for reference
  const hullTopY = hullY + hullH / 2; // = 1.3 + 0.8 = 2.1
  const hullBotY = hullY - hullH / 2; // = 0.5
  const hullFrontZ = -hullL / 2;      // = -2.4
  const hullRearZ = hullL / 2;        // = 2.4

  // Main hull box (the core armored body)
  const hullBox = new THREE.Mesh(box(hullW, hullH, hullL - 0.8), mat(ARMOR_GREEN));
  hullBox.position.set(0, hullY, 0.4);
  hull.add(hullBox);

  // Front glacis plate (angled, connects hull top to lower front)
  // Sits flush: top edge at hullTopY at z ~ -1.6, bottom edge at ~0.7 at z = hullFrontZ
  const glacis = new THREE.Mesh(box(hullW, 0.08, 1.8), mat(ARMOR_GREEN));
  glacis.position.set(0, hullY + 0.2, hullFrontZ + 0.9);
  glacis.rotation.x = -0.45;
  hull.add(glacis);

  // Front plate (vertical, below glacis)
  const frontPlate = new THREE.Mesh(box(hullW, 0.7, 0.08), mat(ARMOR_DARK));
  frontPlate.position.set(0, 0.7, hullFrontZ);
  hull.add(frontPlate);

  // Hull top deck
  const hullTop = new THREE.Mesh(box(hullW, 0.06, hullL - 1.5), mat(ARMOR_GREEN));
  hullTop.position.set(0, hullTopY, 0.7);
  hull.add(hullTop);

  // Side skirts (cover track area, flush with hull sides)
  const skirtL = new THREE.Mesh(box(0.08, 0.65, hullL), mat(ARMOR_GREEN));
  skirtL.position.set(-hullW / 2 - 0.04, 0.65, 0);
  hull.add(skirtL);
  const skirtR = skirtL.clone();
  skirtR.position.x = hullW / 2 + 0.04;
  hull.add(skirtR);

  // Trim vane / splash board (folded up against glacis front face)
  const trimBoard = new THREE.Mesh(box(hullW - 0.1, 0.4, 0.05), mat(ARMOR_DARK));
  trimBoard.position.set(0, 1.3, hullFrontZ - 0.03);
  hull.add(trimBoard);

  // Driver's viewport (left front, on glacis)
  const driverPort = new THREE.Mesh(box(0.4, 0.08, 0.2), mat(0x556677, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  driverPort.position.set(-0.6, hullTopY + 0.04, -1.2);
  hull.add(driverPort);

  // Rear plate (around ramp)
  const rearPlateL = new THREE.Mesh(box(0.6, hullH, 0.08), mat(ARMOR_GREEN));
  rearPlateL.position.set(-1.0, hullY, hullL / 2);
  hull.add(rearPlateL);
  const rearPlateR = rearPlateL.clone();
  rearPlateR.position.x = 1.0;
  hull.add(rearPlateR);
  const rearPlateTop = new THREE.Mesh(box(hullW, 0.4, 0.08), mat(ARMOR_GREEN));
  rearPlateTop.position.set(0, hullY + hullH / 2 - 0.2, hullL / 2);
  hull.add(rearPlateTop);

  // Exhaust (right rear)
  const exhaust = new THREE.Mesh(cyl(0.06, 0.06, 0.5, 8), mat(METAL_DARK, { metalness: 0.4 }));
  exhaust.position.set(1.0, hullY + hullH / 2 + 0.1, hullL / 2 - 0.5);
  hull.add(exhaust);

  // Fuel tanks (external, sides)
  const fuelL = new THREE.Mesh(box(0.15, 0.4, 1.0), mat(ARMOR_DARK));
  fuelL.position.set(-hullW / 2 - 0.12, hullY + 0.3, 0.5);
  hull.add(fuelL);
  const fuelR = fuelL.clone();
  fuelR.position.x = hullW / 2 + 0.12;
  hull.add(fuelR);

  // Tow hooks (front)
  const towL = new THREE.Mesh(cyl(0.04, 0.04, 0.15, 6), mat(METAL_DARK));
  towL.rotation.z = Math.PI / 2;
  towL.position.set(-0.8, 0.6, -hullL / 2 - 0.02);
  hull.add(towL);
  const towR = towL.clone();
  towR.position.x = 0.8;
  hull.add(towR);

  root.add(hull);

  // ==========================================
  // Mesh_TrackLeft / Mesh_TrackRight
  // ==========================================
  // Track assembly - built for rigging:
  // - Bottom run: UV-scrollable band (ground contact)
  // - Top run: UV-scrollable band (return path)
  // - Road wheels: spin with movement
  // - Return rollers: keep top run taut
  // - Drive sprocket (front): driven by engine, spins tracks
  // - Idler wheel (rear): tensioner
  function createTrackAssembly(side) {
    const track = new THREE.Group();
    track.name = side < 0 ? 'Mesh_TrackLeft' : 'Mesh_TrackRight';
    const x = side * (hullW / 2 + 0.18);
    const tw = 0.28;
    const trackH = 0.5;
    const trackY = 0.08 + trackH / 2;
    const sprocketZ = -hullL / 2 + 0.1;
    const idlerZ = hullL / 2;
    const trackLen = idlerZ - sprocketZ + 0.3;

    // Solid track block - UV-scroll target for locomotion
    const trackBlock = new THREE.Mesh(box(tw, trackH, trackLen), mat(TRACK_BLACK, { roughness: 0.95 }));
    trackBlock.name = side < 0 ? 'TrackBlock_Left' : 'TrackBlock_Right';
    trackBlock.position.set(x, trackY, (sprocketZ + idlerZ) / 2);
    track.add(trackBlock);

    // Road wheels (5 per side)
    for (let i = 0; i < 5; i++) {
      const z = sprocketZ + 0.4 + i * (idlerZ - sprocketZ - 0.8) / 4;
      const wheel = new THREE.Mesh(cyl(0.2, 0.2, tw + 0.04, 10), mat(METAL_GRAY, { metalness: 0.3 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, z);
      track.add(wheel);
      const hub = new THREE.Mesh(cyl(0.08, 0.08, tw + 0.08, 6), mat(METAL_DARK));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.28, z);
      track.add(hub);
    }

    // Drive sprocket (front)
    const sprocket = new THREE.Mesh(cyl(0.3, 0.3, tw + 0.04, 12), mat(METAL_GRAY, { metalness: 0.4 }));
    sprocket.rotation.z = Math.PI / 2;
    sprocket.position.set(x, 0.38, sprocketZ);
    track.add(sprocket);
    const sprocketHubM = new THREE.Mesh(cyl(0.12, 0.12, tw + 0.08, 8), mat(METAL_DARK));
    sprocketHubM.rotation.z = Math.PI / 2;
    sprocketHubM.position.set(x, 0.38, sprocketZ);
    track.add(sprocketHubM);

    // Idler wheel (rear)
    const idler = new THREE.Mesh(cyl(0.24, 0.24, tw + 0.02, 10), mat(METAL_GRAY));
    idler.rotation.z = Math.PI / 2;
    idler.position.set(x, 0.33, idlerZ);
    track.add(idler);

    return track;
  }

  root.add(createTrackAssembly(-1));
  root.add(createTrackAssembly(1));

  // ==========================================
  // Joint_Cupola - commander's ring mount (yaw 360)
  // ==========================================
  const cupola = new THREE.Group();
  cupola.name = 'Joint_Cupola';
  cupola.position.set(0.4, hullY + hullH / 2 + 0.03, -0.6);

  // Cupola ring base
  const cupolaRing = new THREE.Mesh(cyl(0.4, 0.4, 0.12, 12), mat(ARMOR_GREEN));
  cupolaRing.position.y = 0.06;
  cupola.add(cupolaRing);

  // Shield / gun shield
  const shield = new THREE.Mesh(box(0.7, 0.35, 0.06), mat(ARMOR_GREEN));
  shield.position.set(0, 0.3, -0.25);
  cupola.add(shield);

  // Side shields
  const shieldL = new THREE.Mesh(box(0.06, 0.35, 0.4), mat(ARMOR_GREEN));
  shieldL.position.set(-0.35, 0.3, -0.05);
  cupola.add(shieldL);
  const shieldR = shieldL.clone();
  shieldR.position.x = 0.35;
  cupola.add(shieldR);

  // ==========================================
  // Joint_TurretGun - M2 .50 cal (pitch, child of Cupola)
  // ==========================================
  const turretGun = new THREE.Group();
  turretGun.name = 'Joint_TurretGun';
  turretGun.position.set(0, 0.3, 0);

  // M2 receiver
  const m2Receiver = new THREE.Mesh(box(0.12, 0.14, 0.4), mat(METAL_DARK, { metalness: 0.3 }));
  m2Receiver.position.set(0, 0.05, -0.15);
  turretGun.add(m2Receiver);

  // M2 barrel - thick and prominent
  const m2Barrel = new THREE.Mesh(cyl(0.04, 0.035, 0.9, 8), mat(METAL_DARK, { metalness: 0.4 }));
  m2Barrel.rotation.x = Math.PI / 2;
  m2Barrel.position.set(0, 0.05, -0.75);
  turretGun.add(m2Barrel);

  // Barrel shroud (perforated jacket)
  const m2Shroud = new THREE.Mesh(cyl(0.055, 0.055, 0.45, 8), mat(METAL_GRAY, { metalness: 0.3 }));
  m2Shroud.rotation.x = Math.PI / 2;
  m2Shroud.position.set(0, 0.05, -0.55);
  turretGun.add(m2Shroud);

  // Ammo box
  const ammoBox = new THREE.Mesh(box(0.15, 0.12, 0.2), mat(ARMOR_DARK));
  ammoBox.position.set(0.15, -0.02, 0);
  turretGun.add(ammoBox);

  // Spade grips
  const gripL = new THREE.Mesh(cyl(0.015, 0.015, 0.15, 4), mat(METAL_DARK));
  gripL.position.set(-0.08, -0.05, 0.15);
  gripL.rotation.x = 0.3;
  turretGun.add(gripL);
  const gripR = gripL.clone();
  gripR.position.x = 0.08;
  turretGun.add(gripR);

  cupola.add(turretGun);
  root.add(cupola);

  // ==========================================
  // Joint_RearRamp - troop ramp (hinge at bottom)
  // ==========================================
  const rearRamp = new THREE.Group();
  rearRamp.name = 'Joint_RearRamp';
  rearRamp.position.set(0, 0.5, hullL / 2);

  const rampPanel = new THREE.Mesh(box(1.2, hullH - 0.4, 0.08), mat(ARMOR_GREEN));
  rampPanel.position.set(0, (hullH - 0.4) / 2, 0.04);
  rearRamp.add(rampPanel);

  // Ramp hinges
  const rHingeL = new THREE.Mesh(cyl(0.04, 0.04, 0.1, 6), mat(METAL_DARK));
  rHingeL.rotation.z = Math.PI / 2;
  rHingeL.position.set(-0.5, 0, 0);
  rearRamp.add(rHingeL);
  const rHingeR = rHingeL.clone();
  rHingeR.position.x = 0.5;
  rearRamp.add(rHingeR);

  root.add(rearRamp);

  // ==========================================
  // Joint_HatchCommander / Joint_HatchDriver
  // ==========================================
  const hatchCmd = new THREE.Group();
  hatchCmd.name = 'Joint_HatchCommander';
  hatchCmd.position.set(0.4, hullY + hullH / 2 + 0.03, -0.6);
  const hatchCmdLid = new THREE.Mesh(cyl(0.32, 0.32, 0.04, 8), mat(ARMOR_GREEN));
  hatchCmdLid.position.y = 0.45;
  hatchCmd.add(hatchCmdLid);
  root.add(hatchCmd);

  const hatchDrv = new THREE.Group();
  hatchDrv.name = 'Joint_HatchDriver';
  hatchDrv.position.set(-0.6, hullY + hullH / 2 + 0.03, -1.5);
  const hatchDrvLid = new THREE.Mesh(box(0.5, 0.04, 0.5), mat(ARMOR_GREEN));
  hatchDrvLid.position.y = 0.02;
  hatchDrv.add(hatchDrvLid);
  // Periscope
  const periscope = new THREE.Mesh(box(0.1, 0.12, 0.1), mat(METAL_DARK));
  periscope.position.set(0, 0.08, -0.15);
  hatchDrv.add(periscope);
  root.add(hatchDrv);

  // ==========================================
  // Mesh_Antenna
  // ==========================================
  const antenna = new THREE.Mesh(cyl(0.006, 0.003, 2.0, 4), mat(METAL_DARK));
  antenna.position.set(-1.0, hullY + hullH / 2 + 1.0, 1.5);
  antenna.name = 'Mesh_Antenna';
  root.add(antenna);

  return root;
}

// Export
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (glb) => {
      const outPath = path.join(__dirname, '..', 'public', 'models', 'vehicles', 'ground', 'm113-apc.glb');
      fs.writeFileSync(outPath, Buffer.from(glb));
      const size = fs.statSync(outPath).size;
      console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);
      let tris = 0;
      scene.traverse((c) => { if (c.isMesh) { const g = c.geometry; tris += g.index ? g.index.count / 3 : (g.attributes.position?.count / 3 || 0); } });
      console.log(`Triangles: ${tris}`);
      console.log('\nNamed parts:');
      scene.traverse((c) => {
        if (c.name && c.name !== 'M113_APC') {
          let d = 0; let p = c.parent; while (p && p !== scene) { d++; p = p.parent; }
          console.log(`${'  '.repeat(d)}${c.name} (${c.isMesh ? 'Mesh' : 'Group'})`);
        }
      });
      resolve();
    }, (err) => reject(err), { binary: true });
  });
}

const scene = new THREE.Scene();
scene.add(build());
await exportGLB(scene.children[0]);
