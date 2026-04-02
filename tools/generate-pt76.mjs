/**
 * PT-76 Amphibious Light Tank (NVA) GLB Generator
 *
 * Naming: Joint_* for animated pivots, Mesh_* for static geometry.
 * Orientation: Y-up, faces +Z, ground at Y=0.
 * Scale: ~7.6m L x 3.1m W x ~2.3m H.
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

const NVA_GREEN = 0x3d4f2a;    // Darker olive/NVA green
const NVA_DARK = 0x2d3f1e;
const METAL_DARK = 0x333333;
const METAL_GRAY = 0x555555;
const TRACK_BLACK = 0x1a1a1a;
const RED_STAR = 0xcc2222;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true,
    roughness: opts.roughness ?? 0.8, metalness: opts.metalness ?? 0.15,
  });
}
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(rT, rB, h, s = 12) { return new THREE.CylinderGeometry(rT, rB, h, s); }

function build() {
  const root = new THREE.Group();
  root.name = 'PT76';

  // PT-76: boat-shaped hull for amphibious ops
  // Hull: ~6.9m L, 3.1m W, low profile ~1.7m hull height
  const hullL = 6.8;
  const hullW = 3.0;
  const hullH = 1.1;
  const hullY = 0.5 + hullH / 2;

  // ==========================================
  // Mesh_Hull - boat-shaped hull
  // ==========================================
  const hull = new THREE.Group();
  hull.name = 'Mesh_Hull';

  const hullTopY = hullY + hullH / 2;  // ~1.05
  const hullFrontZ = -hullL / 2;       // ~-3.4

  // Main hull body (slightly shorter to make room for bow)
  const hullMain = new THREE.Mesh(box(hullW, hullH, hullL - 1.2), mat(NVA_GREEN));
  hullMain.position.set(0, hullY, 0.6);
  hull.add(hullMain);

  // Lower bow plate (boat-like taper below hull, doesn't interfere with turret/gun)
  const lowerBow = new THREE.Mesh(box(hullW - 0.3, 0.06, 1.2), mat(NVA_DARK));
  lowerBow.position.set(0, 0.55, hullFrontZ + 0.6);
  lowerBow.rotation.x = -0.4;
  hull.add(lowerBow);

  // Hull top deck (behind turret ring only - front is covered by turret)
  const deck = new THREE.Mesh(box(hullW - 0.2, 0.06, 2.5), mat(NVA_GREEN));
  deck.position.set(0, hullTopY, 1.6);
  hull.add(deck);

  // Engine deck (rear)
  const engineDeck = new THREE.Mesh(box(hullW - 0.3, 0.08, 2.0), mat(NVA_DARK));
  engineDeck.position.set(0, hullY + hullH / 2 + 0.04, hullL / 2 - 1.2);
  hull.add(engineDeck);

  // Engine grilles
  const grilleL = new THREE.Mesh(box(0.6, 0.03, 1.2), mat(METAL_DARK));
  grilleL.position.set(-0.6, hullY + hullH / 2 + 0.1, hullL / 2 - 1.2);
  hull.add(grilleL);
  const grilleR = grilleL.clone(); grilleR.position.x = 0.6; hull.add(grilleR);

  // Stern plate
  const stern = new THREE.Mesh(box(hullW, hullH + 0.2, 0.08), mat(NVA_GREEN));
  stern.position.set(0, hullY - 0.05, hullL / 2);
  hull.add(stern);

  // Water jets (rear, for amphibious propulsion)
  const jetL = new THREE.Mesh(cyl(0.15, 0.12, 0.3, 8), mat(METAL_DARK));
  jetL.rotation.x = Math.PI / 2;
  jetL.position.set(-0.7, 0.6, hullL / 2 + 0.1);
  hull.add(jetL);
  const jetR = jetL.clone(); jetR.position.x = 0.7; hull.add(jetR);

  // Side skirts
  const skirtL = new THREE.Mesh(box(0.06, 0.55, hullL - 0.5), mat(NVA_GREEN));
  skirtL.position.set(-hullW / 2 - 0.03, 0.65, 0.1);
  hull.add(skirtL);
  const skirtR = skirtL.clone(); skirtR.position.x = hullW / 2 + 0.03; hull.add(skirtR);

  // Red star insignia (on turret side, but put small one on hull too)
  const starHull = new THREE.Mesh(cyl(0.12, 0.12, 0.01, 5), mat(RED_STAR));
  starHull.rotation.z = Math.PI / 2;
  starHull.position.set(-hullW / 2 - 0.04, hullY + 0.2, -0.5);
  hull.add(starHull);
  const starHullR = starHull.clone();
  starHullR.position.x = hullW / 2 + 0.04;
  starHullR.rotation.z = -Math.PI / 2;
  hull.add(starHullR);

  root.add(hull);

  // ==========================================
  // Mesh_TrackLeft / Mesh_TrackRight
  // ==========================================
  // Track assembly approach: solid track block per side.
  // One box = full track profile. Wheels sit inside/on it.
  // For animation: UV-scroll material.map.offset.x on the block.
  // For physics: hull box collider covers track footprint.
  // Wheel meshes spin proportional to speed for visual sell.
  function createTrackAssembly(side) {
    const track = new THREE.Group();
    track.name = side < 0 ? 'Mesh_TrackLeft' : 'Mesh_TrackRight';
    const x = side * (hullW / 2 + 0.18);
    const tw = 0.3;
    const trackH = 0.48;
    const trackY = 0.08 + trackH / 2;
    const sprocketZ = -hullL / 2;
    const idlerZ = hullL / 2;
    const trackLen = idlerZ - sprocketZ + 0.3;

    // Solid track block - the whole track assembly as one clean shape
    // This is the UV-scroll target for locomotion animation
    const trackBlock = new THREE.Mesh(box(tw, trackH, trackLen), mat(TRACK_BLACK, { roughness: 0.95 }));
    trackBlock.name = side < 0 ? 'TrackBlock_Left' : 'TrackBlock_Right';
    trackBlock.position.set(x, trackY, (sprocketZ + idlerZ) / 2);
    track.add(trackBlock);

    // Road wheels (6 per side, inset into track block, visible from side)
    for (let i = 0; i < 6; i++) {
      const z = sprocketZ + 0.5 + i * (idlerZ - sprocketZ - 1.0) / 5;
      const wheel = new THREE.Mesh(cyl(0.2, 0.2, tw + 0.04, 10), mat(METAL_GRAY, { metalness: 0.3 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.28, z);
      track.add(wheel);
      const hub = new THREE.Mesh(cyl(0.08, 0.08, tw + 0.08, 6), mat(METAL_DARK));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.28, z);
      track.add(hub);
    }

    // Drive sprocket (front, slightly larger, peeks above track block)
    const sprocket = new THREE.Mesh(cyl(0.28, 0.28, tw + 0.04, 12), mat(METAL_GRAY, { metalness: 0.4 }));
    sprocket.rotation.z = Math.PI / 2;
    sprocket.position.set(x, 0.36, sprocketZ + 0.05);
    track.add(sprocket);
    const sprocketHub = new THREE.Mesh(cyl(0.1, 0.1, tw + 0.08, 8), mat(METAL_DARK));
    sprocketHub.rotation.z = Math.PI / 2;
    sprocketHub.position.set(x, 0.36, sprocketZ + 0.05);
    track.add(sprocketHub);

    // Idler wheel (rear)
    const idler = new THREE.Mesh(cyl(0.22, 0.22, tw + 0.02, 10), mat(METAL_GRAY));
    idler.rotation.z = Math.PI / 2;
    idler.position.set(x, 0.32, idlerZ - 0.05);
    track.add(idler);

    return track;
  }

  root.add(createTrackAssembly(-1));
  root.add(createTrackAssembly(1));

  // ==========================================
  // Joint_TrimVane - bow wave deflector (folded flat against hull front, not visible)
  // Kept as empty joint for future deployment animation
  const trimVane = new THREE.Group();
  trimVane.name = 'Joint_TrimVane';
  trimVane.position.set(0, hullTopY, hullFrontZ);
  root.add(trimVane);

  // ==========================================
  // Joint_Turret - flat low-profile turret (yaw 360)
  // ==========================================
  const turret = new THREE.Group();
  turret.name = 'Joint_Turret';
  turret.position.set(0, hullY + hullH / 2 + 0.03, -0.8);

  // Turret body (flat, conical shape)
  const turretBody = new THREE.Mesh(cyl(1.0, 1.15, 0.5, 12), mat(NVA_GREEN));
  turretBody.position.y = 0.25;
  turret.add(turretBody);

  // Turret roof
  const turretRoof = new THREE.Mesh(cyl(0.95, 0.95, 0.06, 12), mat(NVA_GREEN));
  turretRoof.position.y = 0.53;
  turret.add(turretRoof);

  // Turret ring
  const turretRing = new THREE.Mesh(cyl(0.85, 0.85, 0.06, 12), mat(METAL_DARK));
  turretRing.position.y = 0;
  turret.add(turretRing);

  // Mantlet (gun mount armor - small, tight around gun breach, dark metal)
  const mantlet = new THREE.Mesh(box(0.3, 0.22, 0.15), mat(METAL_DARK, { metalness: 0.3 }));
  mantlet.position.set(0, 0.25, -1.05);
  turret.add(mantlet);

  // Red star on turret
  const starTurret = new THREE.Mesh(cyl(0.15, 0.15, 0.01, 5), mat(RED_STAR));
  starTurret.rotation.z = Math.PI / 2;
  starTurret.position.set(-1.05, 0.25, 0);
  turret.add(starTurret);

  // ==========================================
  // Joint_MainGun - 76mm barrel (pitch, child of Turret)
  // ==========================================
  const mainGun = new THREE.Group();
  mainGun.name = 'Joint_MainGun';
  mainGun.position.set(0, 0.25, -1.05);

  // 76mm barrel - thick and prominent
  const gunBarrel = new THREE.Mesh(cyl(0.07, 0.06, 3.0, 10), mat(METAL_DARK, { metalness: 0.4 }));
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0, -1.5);
  mainGun.add(gunBarrel);

  // Breech
  const breech = new THREE.Mesh(cyl(0.12, 0.1, 0.4, 10), mat(METAL_DARK, { metalness: 0.3 }));
  breech.rotation.x = Math.PI / 2;
  breech.position.set(0, 0, -0.05);
  mainGun.add(breech);

  // Bore evacuator
  const evacuator = new THREE.Mesh(cyl(0.1, 0.1, 0.25, 10), mat(NVA_GREEN));
  evacuator.rotation.x = Math.PI / 2;
  evacuator.position.set(0, 0, -1.5);
  mainGun.add(evacuator);

  // Muzzle brake
  const muzzleBrake = new THREE.Mesh(cyl(0.09, 0.07, 0.15, 8), mat(METAL_DARK, { metalness: 0.5 }));
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0, -3.0);
  mainGun.add(muzzleBrake);

  turret.add(mainGun);

  // ==========================================
  // Joint_HatchCommander
  // ==========================================
  const hatch = new THREE.Group();
  hatch.name = 'Joint_HatchCommander';
  hatch.position.set(0.3, 0.53, 0.3);

  const hatchLid = new THREE.Mesh(cyl(0.25, 0.25, 0.04, 8), mat(NVA_GREEN));
  hatchLid.position.y = 0.02;
  hatch.add(hatchLid);

  // Periscope
  const periscope = new THREE.Mesh(box(0.08, 0.1, 0.08), mat(METAL_DARK));
  periscope.position.set(0, 0.08, -0.15);
  hatch.add(periscope);

  turret.add(hatch);

  root.add(turret);

  return root;
}

// Export
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(scene, (glb) => {
      const outPath = path.join(__dirname, '..', 'public', 'models', 'vehicles', 'ground', 'pt76.glb');
      fs.writeFileSync(outPath, Buffer.from(glb));
      const size = fs.statSync(outPath).size;
      console.log(`Wrote ${outPath} (${(size / 1024).toFixed(1)} KB)`);
      let tris = 0;
      scene.traverse((c) => { if (c.isMesh) { const g = c.geometry; tris += g.index ? g.index.count / 3 : (g.attributes.position?.count / 3 || 0); } });
      console.log(`Triangles: ${tris}`);
      console.log('\nNamed parts:');
      scene.traverse((c) => {
        if (c.name && c.name !== 'PT76') {
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
