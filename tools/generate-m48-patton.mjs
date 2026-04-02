/**
 * M48A3 Patton Tank GLB Generator
 *
 * Naming: Joint_* for animated pivots, Mesh_* for static geometry.
 * Orientation: Y-up, faces +Z, ground at Y=0.
 * Scale: ~8.7m L (with gun) x 3.6m W x 3.1m H.
 * Tri budget: ~8000
 * 3-level hierarchy: Hull > Turret > (MainGun | CommanderCupola > CupolaGun)
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

const ARMOR_GREEN = 0x4a5a2a;
const ARMOR_DARK = 0x3a4a1e;
const METAL_DARK = 0x333333;
const METAL_GRAY = 0x555555;
const TRACK_BLACK = 0x1a1a1a;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true,
    roughness: opts.roughness ?? 0.8, metalness: opts.metalness ?? 0.15,
    transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1.0,
  });
}
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rT, rB, h, s = 12) { return new THREE.CylinderGeometry(rT, rB, h, s); }

function build() {
  const root = new THREE.Group();
  root.name = 'M48_Patton';

  // M48 dims: hull ~6.4m L, 3.6m W, turret adds height to ~3.1m total
  // Gun extends forward ~2.3m beyond hull
  const hullL = 6.4;
  const hullW = 3.4;
  const hullH = 1.2;
  const hullY = 0.55 + hullH / 2; // bottom above tracks

  // ==========================================
  // Mesh_Hull - cast hull body
  // ==========================================
  const hull = new THREE.Group();
  hull.name = 'Mesh_Hull';

  // Main hull (slightly tapered front via two boxes)
  const hullMain = new THREE.Mesh(box(hullW, hullH, hullL), mat(ARMOR_GREEN));
  hullMain.position.set(0, hullY, 0);
  hull.add(hullMain);

  // Glacis plate (angled front armor)
  const glacis = new THREE.Mesh(box(hullW - 0.2, 0.1, 1.5), mat(ARMOR_GREEN));
  glacis.position.set(0, hullY + 0.4, -hullL / 2 + 0.5);
  glacis.rotation.x = -0.4;
  hull.add(glacis);

  // Lower front plate
  const lowerFront = new THREE.Mesh(box(hullW - 0.3, 0.6, 0.1), mat(ARMOR_DARK));
  lowerFront.position.set(0, 0.75, -hullL / 2);
  hull.add(lowerFront);

  // Hull top deck
  const deck = new THREE.Mesh(box(hullW - 0.2, 0.08, hullL - 1.0), mat(ARMOR_GREEN));
  deck.position.set(0, hullY + hullH / 2, 0.5);
  hull.add(deck);

  // Engine deck (rear, slightly raised with grilles)
  const engineDeck = new THREE.Mesh(box(hullW - 0.4, 0.1, 2.0), mat(ARMOR_DARK));
  engineDeck.position.set(0, hullY + hullH / 2 + 0.05, hullL / 2 - 1.2);
  hull.add(engineDeck);

  // Engine grille details
  for (let i = 0; i < 3; i++) {
    const grille = new THREE.Mesh(box(0.8, 0.04, 0.5), mat(METAL_DARK));
    grille.position.set(-0.5 + i * 0.5, hullY + hullH / 2 + 0.12, hullL / 2 - 1.2);
    hull.add(grille);
  }

  // Rear plate
  const rearPlate = new THREE.Mesh(box(hullW, hullH + 0.3, 0.1), mat(ARMOR_GREEN));
  rearPlate.position.set(0, hullY - 0.1, hullL / 2);
  hull.add(rearPlate);

  // Fender/mudguards
  const fenderL = new THREE.Mesh(box(0.3, 0.06, hullL + 0.3), mat(ARMOR_GREEN));
  fenderL.position.set(-hullW / 2 - 0.05, hullY + hullH / 2 - 0.1, 0);
  hull.add(fenderL);
  const fenderR = fenderL.clone();
  fenderR.position.x = hullW / 2 + 0.05;
  hull.add(fenderR);

  // Side skirts
  const skirtL = new THREE.Mesh(box(0.08, 0.7, hullL), mat(ARMOR_GREEN));
  skirtL.position.set(-hullW / 2 - 0.04, 0.7, 0);
  hull.add(skirtL);
  const skirtR = skirtL.clone();
  skirtR.position.x = hullW / 2 + 0.04;
  hull.add(skirtR);

  // Tow hooks
  const towL = new THREE.Mesh(box(0.15, 0.1, 0.08), mat(METAL_DARK, { metalness: 0.4 }));
  towL.position.set(-1.0, 0.6, -hullL / 2 - 0.04);
  hull.add(towL);
  const towR = towL.clone(); towR.position.x = 1.0; hull.add(towR);

  root.add(hull);

  // ==========================================
  // Mesh_TrackLeft / Mesh_TrackRight
  // ==========================================
  function createTrackAssembly(side) {
    const track = new THREE.Group();
    track.name = side < 0 ? 'Mesh_TrackLeft' : 'Mesh_TrackRight';
    const x = side * (hullW / 2 + 0.22);
    const tw = 0.36;
    const trackH = 0.55;
    const trackY = 0.08 + trackH / 2;
    const sprocketZ = -hullL / 2 - 0.05;
    const idlerZ = hullL / 2 + 0.05;
    const trackLen = idlerZ - sprocketZ + 0.3;

    // Solid track block - UV-scroll target for locomotion
    const trackBlock = new THREE.Mesh(box(tw, trackH, trackLen), mat(TRACK_BLACK, { roughness: 0.95 }));
    trackBlock.name = side < 0 ? 'TrackBlock_Left' : 'TrackBlock_Right';
    trackBlock.position.set(x, trackY, (sprocketZ + idlerZ) / 2);
    track.add(trackBlock);

    // Road wheels (6 per side)
    for (let i = 0; i < 6; i++) {
      const z = sprocketZ + 0.6 + i * (idlerZ - sprocketZ - 1.2) / 5;
      const wheel = new THREE.Mesh(cyl(0.26, 0.26, tw + 0.04, 10), mat(METAL_GRAY, { metalness: 0.3 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.32, z);
      track.add(wheel);
      const hubCap = new THREE.Mesh(cyl(0.1, 0.1, tw + 0.08, 6), mat(METAL_DARK));
      hubCap.rotation.z = Math.PI / 2;
      hubCap.position.set(x, 0.32, z);
      track.add(hubCap);
    }

    // Drive sprocket (front, larger)
    const sprocket = new THREE.Mesh(cyl(0.32, 0.32, tw + 0.04, 12), mat(METAL_GRAY, { metalness: 0.4 }));
    sprocket.rotation.z = Math.PI / 2;
    sprocket.position.set(x, 0.42, sprocketZ);
    track.add(sprocket);
    const sprocketHubM = new THREE.Mesh(cyl(0.14, 0.14, tw + 0.08, 8), mat(METAL_DARK));
    sprocketHubM.rotation.z = Math.PI / 2;
    sprocketHubM.position.set(x, 0.42, sprocketZ);
    track.add(sprocketHubM);

    // Idler wheel (rear)
    const idler = new THREE.Mesh(cyl(0.24, 0.24, tw + 0.02, 10), mat(METAL_GRAY));
    idler.rotation.z = Math.PI / 2;
    idler.position.set(x, 0.38, idlerZ);
    track.add(idler);

    return track;
  }

  root.add(createTrackAssembly(-1));
  root.add(createTrackAssembly(1));

  // ==========================================
  // Mesh_ExhaustLeft / Mesh_ExhaustRight
  // ==========================================
  const exhaustL = new THREE.Mesh(cyl(0.08, 0.08, 0.4, 8), mat(METAL_DARK, { metalness: 0.4 }));
  exhaustL.position.set(-1.2, hullY + hullH / 2 + 0.2, hullL / 2 - 0.3);
  exhaustL.name = 'Mesh_ExhaustLeft';
  root.add(exhaustL);

  const exhaustR = new THREE.Mesh(cyl(0.08, 0.08, 0.4, 8), mat(METAL_DARK, { metalness: 0.4 }));
  exhaustR.position.set(1.2, hullY + hullH / 2 + 0.2, hullL / 2 - 0.3);
  exhaustR.name = 'Mesh_ExhaustRight';
  root.add(exhaustR);

  // ==========================================
  // Joint_Turret - main turret (yaw 360)
  // ==========================================
  const turret = new THREE.Group();
  turret.name = 'Joint_Turret';
  turret.position.set(0, hullY + hullH / 2 + 0.04, -0.3);

  // Turret body (cast, rounded shape approximated with wider front)
  const turretBody = new THREE.Mesh(box(2.4, 0.7, 2.8), mat(ARMOR_GREEN));
  turretBody.position.set(0, 0.35, 0);
  turret.add(turretBody);

  // Turret roof
  const turretRoof = new THREE.Mesh(box(2.2, 0.06, 2.6), mat(ARMOR_GREEN));
  turretRoof.position.set(0, 0.72, 0);
  turret.add(turretRoof);

  // Turret front face (thicker armor)
  const turretFront = new THREE.Mesh(box(2.2, 0.65, 0.15), mat(ARMOR_GREEN));
  turretFront.position.set(0, 0.35, -1.4);
  turret.add(turretFront);

  // Turret rear bustle (ammo storage)
  const bustle = new THREE.Mesh(box(2.0, 0.55, 0.8), mat(ARMOR_GREEN));
  bustle.position.set(0, 0.3, 1.7);
  turret.add(bustle);

  // Turret ring (visible at base)
  const turretRing = new THREE.Mesh(cyl(1.1, 1.1, 0.08, 16), mat(METAL_DARK));
  turretRing.position.y = 0.0;
  turret.add(turretRing);

  // Mantlet (gun mount, thick armor around gun)
  const mantlet = new THREE.Mesh(box(0.9, 0.5, 0.3), mat(ARMOR_GREEN));
  mantlet.position.set(0, 0.35, -1.55);
  turret.add(mantlet);

  // ==========================================
  // Joint_MainGun - 90mm barrel (pitch, child of Turret)
  // ==========================================
  const mainGun = new THREE.Group();
  mainGun.name = 'Joint_MainGun';
  mainGun.position.set(0, 0.35, -1.55);

  // 90mm gun barrel - THICK and prominent
  const gunBarrel = new THREE.Mesh(cyl(0.09, 0.08, 3.5, 10), mat(METAL_DARK, { metalness: 0.4 }));
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0, -1.75);
  mainGun.add(gunBarrel);

  // Barrel base / breech area
  const breech = new THREE.Mesh(cyl(0.14, 0.12, 0.5, 10), mat(METAL_DARK, { metalness: 0.3 }));
  breech.rotation.x = Math.PI / 2;
  breech.position.set(0, 0, -0.1);
  mainGun.add(breech);

  // Bore evacuator (bulge midway down barrel)
  const evacuator = new THREE.Mesh(cyl(0.13, 0.13, 0.35, 10), mat(ARMOR_GREEN));
  evacuator.rotation.x = Math.PI / 2;
  evacuator.position.set(0, 0, -1.8);
  mainGun.add(evacuator);

  // Muzzle brake
  const muzzle = new THREE.Mesh(cyl(0.11, 0.09, 0.2, 8), mat(METAL_DARK, { metalness: 0.5 }));
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0, -3.5);
  mainGun.add(muzzle);

  turret.add(mainGun);

  // ==========================================
  // Mesh_Searchlight
  // ==========================================
  const searchlight = new THREE.Group();
  searchlight.name = 'Mesh_Searchlight';
  const slBody = new THREE.Mesh(cyl(0.15, 0.12, 0.2, 8), mat(ARMOR_DARK));
  slBody.rotation.x = Math.PI / 2;
  slBody.position.set(0.9, 0.6, -1.3);
  searchlight.add(slBody);
  const slLens = new THREE.Mesh(cyl(0.14, 0.14, 0.03, 8), mat(0xaabbcc, { transparent: true, opacity: 0.5 }));
  slLens.rotation.x = Math.PI / 2;
  slLens.position.set(0.9, 0.6, -1.41);
  searchlight.add(slLens);
  turret.add(searchlight);

  // ==========================================
  // Joint_CommanderCupola (yaw, child of Turret)
  // ==========================================
  const cmdCupola = new THREE.Group();
  cmdCupola.name = 'Joint_CommanderCupola';
  cmdCupola.position.set(0.5, 0.72, 0.3);

  // Cupola ring
  const cupolaBase = new THREE.Mesh(cyl(0.35, 0.35, 0.15, 10), mat(ARMOR_GREEN));
  cupolaBase.position.y = 0.08;
  cmdCupola.add(cupolaBase);

  // Vision blocks around cupola
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const vBlock = new THREE.Mesh(box(0.08, 0.06, 0.04), mat(0x556677));
    vBlock.position.set(Math.cos(angle) * 0.32, 0.18, Math.sin(angle) * 0.32);
    cmdCupola.add(vBlock);
  }

  // ==========================================
  // Joint_CupolaGun - .50 cal (pitch, child of CommanderCupola)
  // ==========================================
  const cupolaGun = new THREE.Group();
  cupolaGun.name = 'Joint_CupolaGun';
  cupolaGun.position.set(0, 0.2, 0);

  // .50 cal receiver
  const fiftyReceiver = new THREE.Mesh(box(0.1, 0.12, 0.3), mat(METAL_DARK, { metalness: 0.3 }));
  fiftyReceiver.position.set(0, 0.04, -0.1);
  cupolaGun.add(fiftyReceiver);

  // .50 cal barrel - prominent
  const fiftyBarrel = new THREE.Mesh(cyl(0.035, 0.03, 0.8, 8), mat(METAL_DARK, { metalness: 0.4 }));
  fiftyBarrel.rotation.x = Math.PI / 2;
  fiftyBarrel.position.set(0, 0.04, -0.6);
  cupolaGun.add(fiftyBarrel);

  // Barrel shroud
  const fiftyShroud = new THREE.Mesh(cyl(0.05, 0.05, 0.35, 8), mat(METAL_GRAY));
  fiftyShroud.rotation.x = Math.PI / 2;
  fiftyShroud.position.set(0, 0.04, -0.45);
  cupolaGun.add(fiftyShroud);

  cmdCupola.add(cupolaGun);
  turret.add(cmdCupola);

  // ==========================================
  // Joint_HatchCommander / Joint_HatchLoader
  // ==========================================
  const hatchCmd = new THREE.Group();
  hatchCmd.name = 'Joint_HatchCommander';
  hatchCmd.position.set(0.5, 0.72, 0.3);
  const hatchCmdLid = new THREE.Mesh(cyl(0.28, 0.28, 0.04, 8), mat(ARMOR_GREEN));
  hatchCmdLid.position.y = 0.35;
  hatchCmd.add(hatchCmdLid);
  turret.add(hatchCmd);

  const hatchLoader = new THREE.Group();
  hatchLoader.name = 'Joint_HatchLoader';
  hatchLoader.position.set(-0.5, 0.72, 0.3);
  const hatchLoaderLid = new THREE.Mesh(cyl(0.25, 0.25, 0.04, 8), mat(ARMOR_GREEN));
  hatchLoaderLid.position.y = 0.04;
  hatchLoader.add(hatchLoaderLid);
  turret.add(hatchLoader);

  root.add(turret);

  return root;
}

// Export
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (glb) => {
      const outPath = path.join(__dirname, '..', 'public', 'models', 'vehicles', 'ground', 'm48-patton.glb');
      fs.writeFileSync(outPath, Buffer.from(glb));
      const size = fs.statSync(outPath).size;
      console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);
      let tris = 0;
      scene.traverse((c) => { if (c.isMesh) { const g = c.geometry; tris += g.index ? g.index.count / 3 : (g.attributes.position?.count / 3 || 0); } });
      console.log(`Triangles: ${tris}`);
      console.log('\nNamed parts:');
      scene.traverse((c) => {
        if (c.name && c.name !== 'M48_Patton') {
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
