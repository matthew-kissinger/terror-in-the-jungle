/**
 * E2 rendering-at-scale benchmark.
 *
 * Three scenes, run in a real browser (WebGL2 via Three.js r183):
 *
 *   A. ObjectPerEntity — one THREE.Mesh per entity. Worst-case scene graph.
 *   B. KeyedInstancedPool — InstancedMesh-per-bucket, matching the shape of
 *      CombatantRenderer (billboard + outline + ground marker ×
 *      faction/state/direction buckets). Represents the CURRENT rendering
 *      path for NPCs in the live game.
 *   C. SingleInstancedMesh — one InstancedMesh for all entities. GPU-driven
 *      ideal (one draw call, one instanceMatrix upload).
 *
 * Each entity is updated every frame:
 *   - position wobble (per-entity phase)
 *   - Y rotation (to force matrix recompute)
 *
 * The harness captures: avg frame ms, p50/p95/p99 frame ms, draw calls,
 * and WebGL program count.
 *
 * Usage:
 *   npm run bench:e2        # starts Vite on this folder
 *   open the printed URL, click "run full sweep" or a scene/N button
 */

import * as THREE from 'three';

type SceneKind = 'A' | 'B' | 'C';

interface Sample {
  scene: SceneKind;
  n: number;
  warmupFrames: number;
  measureFrames: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  drawCalls: number;
  programs: number;
  triangles: number;
  durationSec: number;
}

const hudEl = document.getElementById('hud') as HTMLDivElement;
const resultsEl = document.getElementById('results') as HTMLDivElement;
const controlsEl = document.getElementById('controls') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // keep pixel count fixed so results don't depend on DPR
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0b0b10);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 60, 110);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- Shared entity data (positions/phases) --------------------------------

interface Entity {
  x: number; z: number;
  y: number;
  phase: number;
  rotPhase: number;
  bucketKey: string; // used only by scene B
}

function makeEntities(n: number): Entity[] {
  const out: Entity[] = [];
  const side = Math.ceil(Math.sqrt(n));
  const spacing = 3.0;
  const origin = -((side - 1) * spacing) / 2;
  const rng = mulberry32(1337);
  // Scene B bucket shape matches CombatantRenderer: 4 factions × 3 states × 3 dirs ≈ 36 keys
  const factions = ['US', 'ARVN', 'NVA', 'VC'];
  const states = ['walking', 'firing', 'mounted'];
  const dirs = ['front', 'back', 'side'];
  for (let i = 0; i < n; i++) {
    const r = i % side;
    const c = Math.floor(i / side);
    const f = factions[Math.floor(rng() * factions.length)];
    const s = states[Math.floor(rng() * states.length)];
    const d = dirs[Math.floor(rng() * dirs.length)];
    out.push({
      x: origin + r * spacing,
      z: origin + c * spacing,
      y: 1.0,
      phase: rng() * Math.PI * 2,
      rotPhase: rng() * Math.PI * 2,
      bucketKey: `${f}_${s}_${d}`,
    });
  }
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Scene builders --------------------------------------------------------

interface BuiltScene {
  scene: THREE.Scene;
  update: (t: number) => void;
  dispose: () => void;
  label: string;
}

function buildSceneA(entities: Entity[]): BuiltScene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const geometry = new THREE.PlaneGeometry(2, 3);
  // One MeshBasicMaterial shared; Object3D/Mesh per entity is the variable.
  // This isolates scene-graph / draw-call overhead rather than material setup.
  const material = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  for (const e of entities) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(e.x, e.y, e.z);
    scene.add(mesh);
    meshes.push(mesh);
  }
  const update = (t: number) => {
    for (let i = 0; i < meshes.length; i++) {
      const e = entities[i];
      const m = meshes[i];
      m.position.y = e.y + Math.sin(t * 3 + e.phase) * 0.3;
      m.rotation.y = t * 0.8 + e.rotPhase;
    }
  };
  const dispose = () => {
    for (const m of meshes) scene.remove(m);
    geometry.dispose();
    material.dispose();
  };
  return { scene, update, dispose, label: 'A ObjectPerEntity' };
}

function buildSceneB(entities: Entity[]): BuiltScene {
  // Match CombatantRenderer: multiple InstancedMesh buckets by key,
  // each with a paired "aura" and "ground marker" mesh — 3 instanced meshes per key.
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const keyCount = new Map<string, number>();
  for (const e of entities) keyCount.set(e.bucketKey, (keyCount.get(e.bucketKey) ?? 0) + 1);

  const spriteGeo = new THREE.PlaneGeometry(2, 3);
  const markerGeo = new THREE.RingGeometry(0.6, 1.0, 16);

  interface Bucket {
    sprite: THREE.InstancedMesh;
    aura: THREE.InstancedMesh;
    marker: THREE.InstancedMesh;
  }
  const buckets = new Map<string, Bucket>();
  for (const [key, cap] of keyCount) {
    const spriteMat = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, side: THREE.DoubleSide });
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x002244, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const sprite = new THREE.InstancedMesh(spriteGeo, spriteMat, cap);
    const aura = new THREE.InstancedMesh(spriteGeo, auraMat, cap);
    const marker = new THREE.InstancedMesh(markerGeo, markerMat, cap);
    for (const m of [sprite, aura, marker]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.matrixAutoUpdate = false;
      m.matrixWorldAutoUpdate = false;
    }
    scene.add(sprite); scene.add(aura); scene.add(marker);
    buckets.set(key, { sprite, aura, marker });
  }

  // Pre-group entities by key so the hot update loop doesn't map-lookup per entity.
  const grouped = new Map<string, Entity[]>();
  for (const e of entities) {
    const arr = grouped.get(e.bucketKey) ?? [];
    arr.push(e);
    grouped.set(e.bucketKey, arr);
  }

  const scratch = new THREE.Matrix4();
  const scratchScale = new THREE.Matrix4();
  const auraScale = new THREE.Matrix4().makeScale(1.2, 1.2, 1.2);
  const markerRot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

  const update = (t: number) => {
    for (const [key, arr] of grouped) {
      const b = buckets.get(key)!;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        const y = e.y + Math.sin(t * 3 + e.phase) * 0.3;
        const rot = t * 0.8 + e.rotPhase;
        scratch.makeRotationY(rot);
        scratch.setPosition(e.x, y, e.z);
        b.sprite.setMatrixAt(i, scratch);

        scratchScale.copy(scratch);
        scratchScale.multiply(auraScale);
        b.aura.setMatrixAt(i, scratchScale);

        markerRot.setPosition(e.x, 0.1, e.z);
        b.marker.setMatrixAt(i, markerRot);
      }
      b.sprite.count = arr.length;
      b.aura.count = arr.length;
      b.marker.count = arr.length;
      b.sprite.instanceMatrix.needsUpdate = true;
      b.aura.instanceMatrix.needsUpdate = true;
      b.marker.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = () => {
    for (const b of buckets.values()) {
      scene.remove(b.sprite); scene.remove(b.aura); scene.remove(b.marker);
      (b.sprite.material as THREE.Material).dispose();
      (b.aura.material as THREE.Material).dispose();
      (b.marker.material as THREE.Material).dispose();
    }
    spriteGeo.dispose();
    markerGeo.dispose();
  };

  return { scene, update, dispose, label: `B KeyedInstancedPool (${buckets.size * 3} meshes)` };
}

function buildSceneC(entities: Entity[]): BuiltScene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const geometry = new THREE.PlaneGeometry(2, 3);
  const material = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, entities.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldAutoUpdate = false;
  mesh.count = entities.length;
  scene.add(mesh);

  const scratch = new THREE.Matrix4();
  const update = (t: number) => {
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const y = e.y + Math.sin(t * 3 + e.phase) * 0.3;
      const rot = t * 0.8 + e.rotPhase;
      scratch.makeRotationY(rot);
      scratch.setPosition(e.x, y, e.z);
      mesh.setMatrixAt(i, scratch);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  const dispose = () => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };
  return { scene, update, dispose, label: 'C SingleInstancedMesh' };
}

function build(scene: SceneKind, n: number): BuiltScene {
  const ents = makeEntities(n);
  if (scene === 'A') return buildSceneA(ents);
  if (scene === 'B') return buildSceneB(ents);
  return buildSceneC(ents);
}

// --- Measurement loop ------------------------------------------------------

async function measureOnce(scene: SceneKind, n: number, opts: { warmupFrames: number; measureFrames: number }): Promise<Sample> {
  const built = build(scene, n);
  const frameMs: number[] = [];
  const startTime = performance.now();

  // Warmup. Use rAF to let the renderer stabilize and programs compile.
  for (let i = 0; i < opts.warmupFrames; i++) {
    await new Promise<void>((res) => requestAnimationFrame(() => res()));
    const t = (performance.now() - startTime) / 1000;
    built.update(t);
    renderer.render(built.scene, camera);
  }

  // Measurement: time just update() + render() per frame, yielding to
  // setTimeout(0) rather than rAF so we are not gated by display refresh
  // (144Hz = 7ms floor, which would hide any scene that fits in <7ms CPU).
  // `renderer.render()` submits GL commands synchronously; GPU work is
  // async but the JS-side cost (matrix uploads, draw-call overhead,
  // scene-graph traversal) is what we want to isolate here.
  renderer.info.reset();
  for (let i = 0; i < opts.measureFrames; i++) {
    await new Promise<void>((res) => setTimeout(res, 0));
    const t = (performance.now() - startTime) / 1000;
    const t0 = performance.now();
    built.update(t);
    renderer.render(built.scene, camera);
    // Force the GL pipeline to flush so we include submission-side cost.
    // gl.finish() would block for GPU completion (too expensive to include);
    // reading one pixel is a cheap-ish way to force a sync without full finish.
    // Skip for now — flush() via getError() is enough to include command
    // buffer submission time.
    (renderer.getContext() as WebGLRenderingContext).getError();
    const dt = performance.now() - t0;
    frameMs.push(dt);
    if (i % 30 === 0) {
      hudEl.textContent = `scene ${scene}  N=${n}  frame ${i + 1}/${opts.measureFrames}\ndt: ${dt.toFixed(2)}ms`;
    }
  }

  frameMs.sort((a, b) => a - b);
  const p = (q: number) => frameMs[Math.min(frameMs.length - 1, Math.floor(q * frameMs.length))];
  const avg = frameMs.reduce((a, b) => a + b, 0) / frameMs.length;

  const info = renderer.info;
  const drawCalls = info.render.calls;
  const triangles = info.render.triangles;
  const programs = info.programs?.length ?? 0;

  const sample: Sample = {
    scene,
    n,
    warmupFrames: opts.warmupFrames,
    measureFrames: opts.measureFrames,
    avgMs: +avg.toFixed(3),
    p50Ms: +p(0.50).toFixed(3),
    p95Ms: +p(0.95).toFixed(3),
    p99Ms: +p(0.99).toFixed(3),
    maxMs: +frameMs[frameMs.length - 1].toFixed(3),
    drawCalls,
    programs,
    triangles,
    durationSec: +((performance.now() - startTime) / 1000).toFixed(2),
  };

  built.dispose();
  renderer.renderLists.dispose();
  renderer.info.reset();
  return sample;
}

// --- UI wiring -------------------------------------------------------------

const samples: Sample[] = [];

function renderResults() {
  if (samples.length === 0) {
    resultsEl.textContent = 'no measurements yet';
    return;
  }
  const lines = ['scene N       avg    p50    p95    p99    max   calls prog  tri'];
  for (const s of samples) {
    lines.push(
      `${s.scene}     ${String(s.n).padStart(4)}  ` +
      `${s.avgMs.toFixed(2).padStart(5)} ` +
      `${s.p50Ms.toFixed(2).padStart(5)} ` +
      `${s.p95Ms.toFixed(2).padStart(5)} ` +
      `${s.p99Ms.toFixed(2).padStart(5)} ` +
      `${s.maxMs.toFixed(2).padStart(5)} ` +
      `${String(s.drawCalls).padStart(5)} ` +
      `${String(s.programs).padStart(4)} ` +
      `${String(s.triangles).padStart(5)}`
    );
  }
  resultsEl.textContent = lines.join('\n');
}

function toCsv(): string {
  const header = 'scene,n,avg_ms,p50_ms,p95_ms,p99_ms,max_ms,draw_calls,programs,triangles,duration_s,warmup,measure';
  const rows = samples.map(s =>
    `${s.scene},${s.n},${s.avgMs},${s.p50Ms},${s.p95Ms},${s.p99Ms},${s.maxMs},${s.drawCalls},${s.programs},${s.triangles},${s.durationSec},${s.warmupFrames},${s.measureFrames}`
  );
  return [header, ...rows].join('\n');
}

async function runOne(scene: SceneKind, n: number) {
  resultsEl.textContent = (resultsEl.textContent || '') + `\nrunning ${scene} N=${n}...`;
  const sample = await measureOnce(scene, n, { warmupFrames: 60, measureFrames: 300 });
  samples.push(sample);
  renderResults();
  console.log('[bench]', sample);
}

async function runSweep() {
  samples.length = 0;
  const ns = [500, 1000, 2000, 3000];
  const scenes: SceneKind[] = ['A', 'B', 'C'];
  for (const sc of scenes) {
    for (const n of ns) {
      await runOne(sc, n);
    }
  }
  (window as unknown as { __e2Samples: Sample[] }).__e2Samples = samples;
  console.log('[bench] CSV\n' + toCsv());
}

controlsEl.querySelectorAll('button[data-scene]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const scene = (btn as HTMLButtonElement).dataset.scene as SceneKind;
    for (const n of [500, 1000, 2000, 3000]) {
      await runOne(scene, n);
    }
  });
});
controlsEl.querySelectorAll('button[data-n]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const n = parseInt((btn as HTMLButtonElement).dataset.n!, 10);
    for (const sc of ['A', 'B', 'C'] as SceneKind[]) {
      await runOne(sc, n);
    }
  });
});
document.getElementById('run-sweep')!.addEventListener('click', () => { void runSweep(); });
document.getElementById('copy-csv')!.addEventListener('click', async () => {
  const csv = toCsv();
  try {
    await navigator.clipboard.writeText(csv);
    resultsEl.textContent = (resultsEl.textContent || '') + '\n[copied to clipboard]';
  } catch {
    console.log(csv);
  }
});

hudEl.textContent = `ready.\n${navigator.userAgent}\nclick "run full sweep" or a scene/N button.`;

// expose for scripted runs
type BenchWindow = {
  __e2RunOne: typeof runOne;
  __e2RunSweep: typeof runSweep;
  __e2Samples: Sample[];
  __e2Csv: () => string;
};
(window as unknown as BenchWindow).__e2RunOne = runOne;
(window as unknown as BenchWindow).__e2RunSweep = runSweep;
(window as unknown as BenchWindow).__e2Samples = samples;
(window as unknown as BenchWindow).__e2Csv = toCsv;
