#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import {
  NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT,
  NPC_PIXEL_FORGE_VISUAL_HEIGHT,
  NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER,
  NPC_Y_OFFSET,
} from '../src/config/CombatantConfig';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  type PixelForgeNpcFactionAsset,
} from '../src/config/pixelForgeAssets';
import {
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_RENDER_Y_OFFSET,
  NPC_SPRITE_WIDTH,
} from '../src/systems/combat/CombatantMeshFactory';
import {
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
} from '../src/systems/combat/PixelForgeNpcRuntime';
import { AircraftModels } from '../src/systems/assets/modelPaths';

type CheckStatus = 'pass' | 'warn' | 'fail';

type VisibleImageStats = {
  width: number;
  height: number;
  opaquePixels: number;
  opaqueCoverage: number;
  meanOpaqueLuma: number | null;
  meanOpaqueChroma: number | null;
  meanOpaqueAlpha: number | null;
  visibleBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null;
};

type BrowserNpcMetric = {
  runtimeFaction: PixelForgeNpcFactionAsset['runtimeFaction'];
  packageFaction: PixelForgeNpcFactionAsset['packageFaction'];
  clip: string;
  closeModelPath: string;
  imposterTexturePath: string;
  closeModel: {
    sourceHeightMeters: number;
    sourceWidthMeters: number;
    sourceDepthMeters: number;
    boundsMinY: number;
    visualScale: number;
    runtimeHeightMeters: number;
    projectedGeometryHeightPx: number;
    projectedGeometryWidthPx: number;
  };
  imposter: {
    runtimeWidthMeters: number;
    runtimeHeightMeters: number;
    renderYOffsetMeters: number;
    actorAnchorYMeters: number;
    projectedGeometryHeightPx: number;
    projectedGeometryWidthPx: number;
  };
  closeCropDataUrl: string;
  imposterCropDataUrl: string;
};

type BrowserAircraftMetric = {
  key: string;
  modelPath: string;
  nativeBoundsMeters: {
    widthX: number;
    heightY: number;
    depthZ: number;
    longestAxis: number;
  };
  nativeLongestAxisToNpcVisualHeight: number;
  nativeHeightToNpcVisualHeight: number;
};

type BrowserProofPayload = {
  npcMetrics: BrowserNpcMetric[];
  aircraftMetrics: BrowserAircraftMetric[];
  rendererInfo: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    webglVendor: string | null;
    webglRenderer: string | null;
  };
  loadedAssetCount: number;
  loadErrors: string[];
};

type NpcComparison = Omit<BrowserNpcMetric, 'closeCropDataUrl' | 'imposterCropDataUrl'> & {
  files: {
    closeCrop: string;
    imposterCrop: string;
  };
  closeImageStats: VisibleImageStats;
  imposterImageStats: VisibleImageStats;
  deltas: {
    renderedVisibleHeightRatio: number | null;
    renderedVisibleHeightDeltaPercent: number | null;
    projectedGeometryHeightDeltaPercent: number | null;
    meanOpaqueLumaDelta: number | null;
    meanOpaqueChromaDelta: number | null;
  };
  flags: string[];
};

type ProofSummary = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'cycle2-kb-optik-scale-proof';
  status: CheckStatus;
  url: string;
  artifactDir: string;
  viewport: { width: number; height: number };
  browser: {
    headed: boolean;
    version: string | null;
    userAgent: string | null;
  };
  runtimeContracts: {
    npc: {
      baseVisualHeightMeters: number;
      visualScaleMultiplier: number;
      visualHeightMeters: number;
      spriteWidthMeters: number;
      spriteHeightMeters: number;
      closeModelTargetHeightMeters: number;
      actorAnchorYMeters: number;
      spriteRenderYOffsetMeters: number;
    };
    vehicles: {
      scalePolicy: string;
      fixedWingVisualRotation: string;
      helicopterVisualRotation: string;
    };
  };
  files: {
    summary: string;
    markdown: string;
    lineupScreenshot: string;
  };
  npcComparisons: NpcComparison[];
  aircraftNativeScale: BrowserAircraftMetric[];
  findings: string[];
  browserErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
  measurementTrust: {
    status: CheckStatus;
    summary: string;
    flags: {
      browserErrors: number;
      pageErrors: number;
      requestFailures: number;
      loadErrors: number;
      npcMatchedCrops: number;
      aircraftScaleEntries: number;
      rendererStatsCaptured: boolean;
    };
  };
};

const DEFAULT_PORT = 9232;
const VIEWPORT = { width: 1600, height: 900 };
const CROP_WIDTH = 640;
const CROP_HEIGHT = 900;
const CROP_ORTHO_HEIGHT_METERS = 5.2;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-optics-scale-proof';
const OPAQUE_ALPHA_THRESHOLD = 48;
const MATCHED_CLIP_ID = 'idle';

const NPC_FIXTURES = PIXEL_FORGE_NPC_FACTIONS.map((faction) => ({
  runtimeFaction: faction.runtimeFaction,
  packageFaction: faction.packageFaction,
  modelPath: `/models/${faction.modelPath}`,
  texturePath: `/assets/pixel-forge/npcs/${faction.packageFaction}/${MATCHED_CLIP_ID}/animated-albedo-packed.png`,
}));

const AIRCRAFT_FIXTURES = Object.entries(AircraftModels).map(([key, modelPath]) => ({
  key,
  modelPath: `/models/${modelPath}`,
}));

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function parsePort(): number {
  const raw = argValue('--port');
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --port value: ${raw}`);
  }
  return parsed;
}

function parseOutputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return raw;
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return join(ARTIFACT_ROOT, stamp, OUTPUT_NAME);
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function roundMetric(value: number | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.glb':
      return 'model/gltf-binary';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function resolveStaticPath(pathname: string): string | null {
  const root = process.cwd();
  const decoded = decodeURIComponent(pathname);
  const trimmed = decoded.replace(/^\/+/, '');
  const basePath = decoded.startsWith('/models/') || decoded.startsWith('/assets/')
    ? resolve(root, 'public', trimmed)
    : resolve(root, trimmed);
  const safeRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (basePath !== root && !basePath.startsWith(safeRoot)) {
    return null;
  }
  return basePath;
}

function serveFile(file: string, res: ServerResponse): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': contentType(file),
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}

function proofHtml(): string {
  const npcFixtures = JSON.stringify(NPC_FIXTURES);
  const aircraftFixtures = JSON.stringify(AIRCRAFT_FIXTURES);
  const runtimeContracts = JSON.stringify({
    npcSpriteWidth: NPC_SPRITE_WIDTH,
    npcSpriteHeight: NPC_SPRITE_HEIGHT,
    npcCloseModelTargetHeight: NPC_CLOSE_MODEL_TARGET_HEIGHT,
    npcRenderYOffset: NPC_SPRITE_RENDER_Y_OFFSET,
    npcActorAnchorY: NPC_Y_OFFSET,
    cropWidth: CROP_WIDTH,
    cropHeight: CROP_HEIGHT,
    cropOrthoHeightMeters: CROP_ORTHO_HEIGHT_METERS,
    matchedClipId: MATCHED_CLIP_ID,
    clip: PIXEL_FORGE_NPC_CLIPS.find((clip) => clip.id === MATCHED_CLIP_ID),
    materialTuning: PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projekt 143 Optics Scale Proof</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #111511; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
    { "imports": { "three": "/node_modules/three/build/three.module.js" } }
  </script>
</head>
<body>
  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

    const npcFixtures = ${npcFixtures};
    const aircraftFixtures = ${aircraftFixtures};
    const runtimeContracts = ${runtimeContracts};
    const loadErrors = [];
    const loader = new GLTFLoader();

    function round(value, digits = 3) {
      return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
    }

    function loadGltf(path) {
      return new Promise((resolve, reject) => {
        loader.load(path, resolve, undefined, reject);
      });
    }

    function boxMetrics(root) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      return { box, size };
    }

    function materialToken(materialName) {
      const parts = String(materialName || '').split('_');
      return parts[parts.length - 1];
    }

    function tuneCloseModelMaterials(root, packageFaction) {
      const tuning = runtimeContracts.materialTuning[packageFaction] || {};
      root.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const tuned = materials.map((material) => {
          const cloned = material.clone();
          if (cloned.isMeshStandardMaterial) {
            const token = materialToken(cloned.name);
            if (Object.prototype.hasOwnProperty.call(tuning, token)) {
              cloned.color.setHex(tuning[token]);
            }
            const isUniformSurface = token === 'uniform'
              || token === 'trousers'
              || token === 'headgear'
              || token === 'accent';
            if (isUniformSurface) {
              cloned.color.offsetHSL(0, 0.08, 0.1);
            }
            cloned.emissive.copy(cloned.color).multiplyScalar(isUniformSurface ? 0.16 : 0.06);
            cloned.emissiveIntensity = isUniformSurface ? 0.28 : 0.1;
            cloned.roughness = Math.max(cloned.roughness, 0.9);
            cloned.metalness = 0;
            cloned.needsUpdate = true;
          }
          return cloned;
        });
        child.material = Array.isArray(child.material) ? tuned : tuned[0];
      });
    }

    function makeCloseModel(gltf, packageFaction) {
      const root = gltf.scene;
      tuneCloseModelMaterials(root, packageFaction);
      const source = boxMetrics(root);
      const height = source.size.y || 1;
      const visualScale = runtimeContracts.npcCloseModelTargetHeight / height;
      root.scale.setScalar(visualScale);
      root.updateMatrixWorld(true);
      const scaled = boxMetrics(root);
      root.position.y = -scaled.box.min.y;
      root.updateMatrixWorld(true);
      const finalMetrics = boxMetrics(root);
      return {
        root,
        sourceSize: source.size,
        sourceMinY: source.box.min.y,
        visualScale,
        finalBox: finalMetrics.box,
        finalSize: finalMetrics.size,
      };
    }

    function createNpcImposterMaterial(texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      const clip = runtimeContracts.clip;
      return new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          viewGrid: { value: new THREE.Vector2(clip.viewGridX, clip.viewGridY) },
          frameGrid: { value: new THREE.Vector2(clip.framesX, clip.framesY) },
          viewColumn: { value: Math.floor(clip.viewGridX * 0.5) },
          frameIndex: { value: 0 },
          combatState: { value: 0 },
          readabilityColor: { value: new THREE.Color(0.0, 0.5, 1.0) },
          readabilityStrength: { value: 0.38 },
          npcExposure: { value: 1.2 },
          minNpcLight: { value: 0.92 },
          npcTopLight: { value: 0.16 },
        },
        vertexShader: \`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        \`,
        fragmentShader: \`
          uniform sampler2D map;
          uniform vec2 viewGrid;
          uniform vec2 frameGrid;
          uniform float viewColumn;
          uniform float frameIndex;
          uniform float combatState;
          uniform vec3 readabilityColor;
          uniform float readabilityStrength;
          uniform float npcExposure;
          uniform float minNpcLight;
          uniform float npcTopLight;
          varying vec2 vUv;
          void main() {
            float frameX = mod(frameIndex, frameGrid.x);
            float frameY = floor(frameIndex / frameGrid.x);
            float viewX = clamp(floor(viewColumn + 0.5), 0.0, viewGrid.x - 1.0);
            float viewY = floor(viewGrid.y * 0.5);
            vec2 atlasGrid = viewGrid * frameGrid;
            vec2 tile = vec2(frameX * viewGrid.x + viewX, frameY * viewGrid.y + viewY);
            vec2 sampleUv = vec2(
              (tile.x + vUv.x) / atlasGrid.x,
              1.0 - ((tile.y + 1.0 - vUv.y) / atlasGrid.y)
            );
            vec4 texColor = texture2D(map, sampleUv);
            if (texColor.a < 0.18) discard;
            vec3 npcColor = texColor.rgb;
            float luma = dot(npcColor, vec3(0.299, 0.587, 0.114));
            npcColor = mix(vec3(luma), npcColor, 1.22);
            npcColor = min(npcColor + vec3(0.045, 0.040, 0.030), vec3(1.0));
            vec3 readabilityLift = readabilityColor * (0.18 + 0.12 * combatState);
            npcColor = mix(npcColor, min(npcColor + readabilityLift, vec3(1.0)), readabilityStrength);
            float topLight = smoothstep(0.12, 1.0, vUv.y) * npcTopLight;
            float npcLight = max(minNpcLight, minNpcLight + topLight);
            npcColor = min(npcColor * npcExposure * npcLight, vec3(1.0));
            gl_FragColor = vec4(npcColor, texColor.a);
          }
        \`,
        transparent: true,
        alphaTest: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        forceSinglePass: true,
      });
    }

    async function loadTexture(path) {
      return await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(path, resolve, undefined, reject);
      });
    }

    function makeImposter(texture) {
      const geometry = new THREE.PlaneGeometry(runtimeContracts.npcSpriteWidth, runtimeContracts.npcSpriteHeight);
      const material = createNpcImposterMaterial(texture);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = runtimeContracts.npcActorAnchorY + runtimeContracts.npcRenderYOffset;
      mesh.updateMatrixWorld(true);
      return mesh;
    }

    function makeLights(scene) {
      scene.add(new THREE.HemisphereLight(0xe8f1db, 0x4b5a3f, 1.45));
      const sun = new THREE.DirectionalLight(0xffffff, 1.25);
      sun.position.set(4, 8, 8);
      scene.add(sun);
    }

    function createCropRenderer() {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(runtimeContracts.cropWidth, runtimeContracts.cropHeight, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      return renderer;
    }

    function createCropCamera() {
      const aspect = runtimeContracts.cropWidth / runtimeContracts.cropHeight;
      const halfH = runtimeContracts.cropOrthoHeightMeters / 2;
      const halfW = halfH * aspect;
      const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
      camera.position.set(0, runtimeContracts.npcCloseModelTargetHeight / 2, 16);
      camera.lookAt(0, runtimeContracts.npcCloseModelTargetHeight / 2, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return camera;
    }

    function projectBoxPixels(box, camera, width, height) {
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const corner of corners) {
        const p = corner.project(camera);
        const x = (p.x * 0.5 + 0.5) * width;
        const y = (-p.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      return {
        width: round(maxX - minX, 2),
        height: round(maxY - minY, 2),
      };
    }

    function renderTransparentCrop(object) {
      const renderer = createCropRenderer();
      const scene = new THREE.Scene();
      makeLights(scene);
      scene.add(object);
      object.updateMatrixWorld(true);
      const camera = createCropCamera();
      const projected = projectBoxPixels(new THREE.Box3().setFromObject(object), camera, runtimeContracts.cropWidth, runtimeContracts.cropHeight);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      scene.remove(object);
      renderer.dispose();
      return { dataUrl, projected };
    }

    async function buildNpcMetric(fixture) {
      const [gltf, texture] = await Promise.all([
        loadGltf(fixture.modelPath),
        loadTexture(fixture.texturePath),
      ]);
      const close = makeCloseModel(gltf, fixture.packageFaction);
      const closeCrop = renderTransparentCrop(close.root);
      const imposter = makeImposter(texture);
      const imposterCrop = renderTransparentCrop(imposter);
      return {
        runtimeFaction: fixture.runtimeFaction,
        packageFaction: fixture.packageFaction,
        clip: runtimeContracts.matchedClipId,
        closeModelPath: fixture.modelPath,
        imposterTexturePath: fixture.texturePath,
        closeModel: {
          sourceHeightMeters: round(close.sourceSize.y, 4),
          sourceWidthMeters: round(close.sourceSize.x, 4),
          sourceDepthMeters: round(close.sourceSize.z, 4),
          boundsMinY: round(close.sourceMinY, 4),
          visualScale: round(close.visualScale, 4),
          runtimeHeightMeters: round(close.finalSize.y, 4),
          projectedGeometryHeightPx: closeCrop.projected.height,
          projectedGeometryWidthPx: closeCrop.projected.width,
        },
        imposter: {
          runtimeWidthMeters: runtimeContracts.npcSpriteWidth,
          runtimeHeightMeters: runtimeContracts.npcSpriteHeight,
          renderYOffsetMeters: runtimeContracts.npcRenderYOffset,
          actorAnchorYMeters: runtimeContracts.npcActorAnchorY,
          projectedGeometryHeightPx: imposterCrop.projected.height,
          projectedGeometryWidthPx: imposterCrop.projected.width,
        },
        closeCropDataUrl: closeCrop.dataUrl,
        imposterCropDataUrl: imposterCrop.dataUrl,
      };
    }

    async function buildAircraftMetric(fixture) {
      const gltf = await loadGltf(fixture.modelPath);
      gltf.scene.updateMatrixWorld(true);
      const { size } = boxMetrics(gltf.scene);
      const longestAxis = Math.max(size.x, size.y, size.z);
      return {
        key: fixture.key,
        modelPath: fixture.modelPath,
        nativeBoundsMeters: {
          widthX: round(size.x, 4),
          heightY: round(size.y, 4),
          depthZ: round(size.z, 4),
          longestAxis: round(longestAxis, 4),
        },
        nativeLongestAxisToNpcVisualHeight: round(longestAxis / runtimeContracts.npcCloseModelTargetHeight, 3),
        nativeHeightToNpcVisualHeight: round(size.y / runtimeContracts.npcCloseModelTargetHeight, 3),
      };
    }

    function renderLineup(metrics) {
      const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.setClearColor(0x121812, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      document.body.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      makeLights(scene);
      const ground = new THREE.GridHelper(42, 42, 0x5e7b5b, 0x273227);
      ground.position.y = 0;
      scene.add(ground);

      const camera = new THREE.OrthographicCamera(-21, 21, 10, -4, 0.1, 100);
      camera.position.set(0, 5, 24);
      camera.lookAt(0, 3, 0);
      camera.updateProjectionMatrix();

      const npcHeightMarker = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, runtimeContracts.npcCloseModelTargetHeight, 0.16),
        new THREE.MeshBasicMaterial({ color: 0x93d36b })
      );
      npcHeightMarker.position.set(-19, runtimeContracts.npcCloseModelTargetHeight / 2, 0);
      scene.add(npcHeightMarker);

      const renderJobs = [
        ...npcFixtures.slice(0, 1).map((fixture, index) => ({ type: 'npc-close', fixture, x: -16 + index * 3 })),
        ...npcFixtures.slice(0, 1).map((fixture, index) => ({ type: 'npc-imposter', fixture, x: -13 + index * 3 })),
        ...aircraftFixtures.map((fixture, index) => ({ type: 'aircraft', fixture, x: -8 + index * 5 })),
      ];

      return Promise.all(renderJobs.map(async (job) => {
        try {
          if (job.type === 'npc-close') {
            const gltf = await loadGltf(job.fixture.modelPath);
            const close = makeCloseModel(gltf, job.fixture.packageFaction);
            close.root.position.x = job.x;
            scene.add(close.root);
          } else if (job.type === 'npc-imposter') {
            const texture = await loadTexture(job.fixture.texturePath);
            const imposter = makeImposter(texture);
            imposter.position.x = job.x;
            scene.add(imposter);
          } else {
            const gltf = await loadGltf(job.fixture.modelPath);
            gltf.scene.position.x = job.x;
            gltf.scene.rotation.y = Math.PI;
            const box = new THREE.Box3().setFromObject(gltf.scene);
            gltf.scene.position.y = -box.min.y;
            scene.add(gltf.scene);
          }
        } catch (error) {
          loadErrors.push(String(error));
        }
      })).then(() => {
        renderer.render(scene, camera);
        return {
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs?.length ?? 0,
          webglVendor: renderer.getContext().getParameter(renderer.getContext().VENDOR),
          webglRenderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
        };
      });
    }

    async function main() {
      const npcMetrics = [];
      for (const fixture of npcFixtures) {
        try {
          npcMetrics.push(await buildNpcMetric(fixture));
        } catch (error) {
          loadErrors.push(String(error));
        }
      }

      const aircraftMetrics = [];
      for (const fixture of aircraftFixtures) {
        try {
          aircraftMetrics.push(await buildAircraftMetric(fixture));
        } catch (error) {
          loadErrors.push(String(error));
        }
      }

      const rendererInfo = await renderLineup({ npcMetrics, aircraftMetrics });
      window.__projekt143OpticsScaleReady = {
        npcMetrics,
        aircraftMetrics,
        rendererInfo,
        loadedAssetCount: npcMetrics.length + aircraftMetrics.length,
        loadErrors,
      };
    }

    main().catch((error) => {
      window.__projekt143OpticsScaleReady = {
        npcMetrics: [],
        aircraftMetrics: [],
        rendererInfo: null,
        loadedAssetCount: 0,
        loadErrors: [String(error && error.stack ? error.stack : error)],
      };
    });
  </script>
</body>
</html>`;
}

function createStaticServer(port: number): Promise<{ server: Server; url: string }> {
  const html = proofHtml();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`).pathname;
    if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204, { 'cache-control': 'no-store' });
      res.end();
      return;
    }
    const file = resolveStaticPath(pathname);
    if (!file) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    serveFile(file, res);
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

async function imageStats(path: string): Promise<VisibleImageStats> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaquePixels = 0;
  let lumaSum = 0;
  let chromaSum = 0;
  let alphaSum = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha <= OPAQUE_ALPHA_THRESHOLD) continue;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      opaquePixels++;
      lumaSum += 0.299 * r + 0.587 * g + 0.114 * b;
      chromaSum += Math.max(r, g, b) - Math.min(r, g, b);
      alphaSum += alpha;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    width: info.width,
    height: info.height,
    opaquePixels,
    opaqueCoverage: roundMetric(opaquePixels / Math.max(1, info.width * info.height), 4) ?? 0,
    meanOpaqueLuma: opaquePixels > 0 ? roundMetric(lumaSum / opaquePixels, 2) : null,
    meanOpaqueChroma: opaquePixels > 0 ? roundMetric(chromaSum / opaquePixels, 2) : null,
    meanOpaqueAlpha: opaquePixels > 0 ? roundMetric(alphaSum / opaquePixels, 2) : null,
    visibleBounds: opaquePixels > 0
      ? {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        }
      : null,
  };
}

function writeDataUrl(dataUrl: string, path: string): void {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(path, Buffer.from(base64, 'base64'));
}

function comparisonFlags(closeStats: VisibleImageStats, imposterStats: VisibleImageStats): string[] {
  const flags: string[] = [];
  const closeHeight = closeStats.visibleBounds?.height ?? null;
  const imposterHeight = imposterStats.visibleBounds?.height ?? null;
  if (closeHeight !== null && imposterHeight !== null) {
    const ratio = imposterHeight / closeHeight;
    if (ratio < 0.85 || ratio > 1.15) {
      flags.push('rendered-visible-height-mismatch-over-15pct');
    }
  }
  if (closeStats.meanOpaqueLuma !== null && imposterStats.meanOpaqueLuma !== null) {
    if (Math.abs(imposterStats.meanOpaqueLuma - closeStats.meanOpaqueLuma) > 25) {
      flags.push('rendered-luma-delta-over-25');
    }
  }
  if (NPC_CLOSE_MODEL_TARGET_HEIGHT > 3) {
    flags.push('runtime-npc-visual-height-above-3m-reference');
  }
  return flags;
}

function buildFindings(npcComparisons: NpcComparison[], aircraft: BrowserAircraftMetric[]): string[] {
  const findings: string[] = [];
  const heightRatios = npcComparisons
    .map((entry) => entry.deltas.renderedVisibleHeightRatio)
    .filter((value): value is number => value !== null);
  if (heightRatios.length > 0) {
    const avgRatio = heightRatios.reduce((sum, value) => sum + value, 0) / heightRatios.length;
    findings.push(
      `NPC close-GLB and imposter geometry share the ${NPC_CLOSE_MODEL_TARGET_HEIGHT.toFixed(3)}m runtime target, but rendered visible silhouette ratio averages ${avgRatio.toFixed(2)} imposter/close.`
    );
  }
  findings.push(
    `The NPC runtime visual target is ${NPC_CLOSE_MODEL_TARGET_HEIGHT.toFixed(3)}m from ${NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT.toFixed(2)}m base height times ${NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER.toFixed(2)}. Treat absolute NPC scale as a design/art-contract decision, not as settled by the culling proof.`
  );
  const smallAircraft = aircraft.filter((entry) => entry.nativeLongestAxisToNpcVisualHeight < 2);
  if (smallAircraft.length > 0) {
    findings.push(
      `Aircraft native GLB scale is suspect: ${smallAircraft.map((entry) => entry.key).join(', ')} longest axis is below 2x the current NPC visual height.`
    );
  } else {
    findings.push('Aircraft GLBs load at native imported scale; this proof records their meter-scale bounds but does not resize or remediate them.');
  }
  findings.push('PASS means the matched evidence artifact is complete and trusted enough for review; it is not an imposter, shader, NPC-scale, or aircraft-scale acceptance claim.');
  return findings;
}

function writeMarkdown(summary: ProofSummary, file: string): void {
  const lines = [
    '# Projekt Objekt-143 KB-OPTIK Scale Proof',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Status: ${summary.status.toUpperCase()}`,
    '',
    '## Findings',
    '',
    ...summary.findings.map((finding) => `- ${finding}`),
    '',
    '## NPC Matched Crops',
    '',
    '| Faction | Close visible px | Imposter visible px | Ratio | Luma delta | Flags |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    ...summary.npcComparisons.map((entry) => (
      `| ${entry.runtimeFaction} | ${entry.closeImageStats.visibleBounds?.height ?? 'n/a'} | ${entry.imposterImageStats.visibleBounds?.height ?? 'n/a'} | ${entry.deltas.renderedVisibleHeightRatio ?? 'n/a'} | ${entry.deltas.meanOpaqueLumaDelta ?? 'n/a'} | ${entry.flags.join(', ') || 'none'} |`
    )),
    '',
    '## Aircraft Native Scale',
    '',
    '| Aircraft | Width X | Height Y | Depth Z | Longest axis | Longest axis / NPC height |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...summary.aircraftNativeScale.map((entry) => (
      `| ${entry.key} | ${entry.nativeBoundsMeters.widthX} | ${entry.nativeBoundsMeters.heightY} | ${entry.nativeBoundsMeters.depthZ} | ${entry.nativeBoundsMeters.longestAxis} | ${entry.nativeLongestAxisToNpcVisualHeight} |`
    )),
    '',
  ];
  writeFileSync(file, lines.join('\n'), 'utf-8');
}

async function run(): Promise<void> {
  const outputDir = parseOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const port = parsePort();
  const { server, url } = await createStaticServer(port);
  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
    const page: Page = await browser.newPage({ viewport: VIEWPORT });
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('requestfailed', (request) => {
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`);
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean((window as typeof window & { __projekt143OpticsScaleReady?: unknown }).__projekt143OpticsScaleReady), null, { timeout: 60_000 });
    const payload = await page.evaluate(() => (
      (window as typeof window & { __projekt143OpticsScaleReady: BrowserProofPayload }).__projekt143OpticsScaleReady
    ));
    const browserVersion = browser.version();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const lineupScreenshot = join(outputDir, 'actual-scale-lineup.png');
    await page.screenshot({ path: lineupScreenshot });

    const npcComparisons: NpcComparison[] = [];
    for (const metric of payload.npcMetrics) {
      const closeFile = join(outputDir, `${metric.packageFaction}-${metric.clip}-close-glb.png`);
      const imposterFile = join(outputDir, `${metric.packageFaction}-${metric.clip}-imposter.png`);
      writeDataUrl(metric.closeCropDataUrl, closeFile);
      writeDataUrl(metric.imposterCropDataUrl, imposterFile);
      const closeStats = await imageStats(closeFile);
      const imposterStats = await imageStats(imposterFile);
      const closeHeight = closeStats.visibleBounds?.height ?? null;
      const imposterHeight = imposterStats.visibleBounds?.height ?? null;
      const renderedVisibleHeightRatio = closeHeight && imposterHeight ? imposterHeight / closeHeight : null;
      const projectedHeightDelta = metric.closeModel.projectedGeometryHeightPx
        ? ((metric.imposter.projectedGeometryHeightPx - metric.closeModel.projectedGeometryHeightPx)
          / metric.closeModel.projectedGeometryHeightPx) * 100
        : null;
      const comparison: NpcComparison = {
        runtimeFaction: metric.runtimeFaction,
        packageFaction: metric.packageFaction,
        clip: metric.clip,
        closeModelPath: metric.closeModelPath,
        imposterTexturePath: metric.imposterTexturePath,
        closeModel: metric.closeModel,
        imposter: metric.imposter,
        files: {
          closeCrop: rel(closeFile) ?? closeFile,
          imposterCrop: rel(imposterFile) ?? imposterFile,
        },
        closeImageStats: closeStats,
        imposterImageStats: imposterStats,
        deltas: {
          renderedVisibleHeightRatio: roundMetric(renderedVisibleHeightRatio, 3),
          renderedVisibleHeightDeltaPercent: renderedVisibleHeightRatio !== null
            ? roundMetric((renderedVisibleHeightRatio - 1) * 100, 2)
            : null,
          projectedGeometryHeightDeltaPercent: roundMetric(projectedHeightDelta, 3),
          meanOpaqueLumaDelta: closeStats.meanOpaqueLuma !== null && imposterStats.meanOpaqueLuma !== null
            ? roundMetric(imposterStats.meanOpaqueLuma - closeStats.meanOpaqueLuma, 2)
            : null,
          meanOpaqueChromaDelta: closeStats.meanOpaqueChroma !== null && imposterStats.meanOpaqueChroma !== null
            ? roundMetric(imposterStats.meanOpaqueChroma - closeStats.meanOpaqueChroma, 2)
            : null,
        },
        flags: comparisonFlags(closeStats, imposterStats),
      };
      npcComparisons.push(comparison);
    }

    const trustStatus: CheckStatus =
      browserErrors.length === 0
      && pageErrors.length === 0
      && requestFailures.length === 0
      && payload.loadErrors.length === 0
      && npcComparisons.length === NPC_FIXTURES.length
      && payload.aircraftMetrics.length === AIRCRAFT_FIXTURES.length
      && Boolean(payload.rendererInfo)
        ? 'pass'
        : 'fail';

    const measurementTrust = {
      status: trustStatus,
      summary: trustStatus === 'pass'
        ? 'Matched close-GLB/imposter crops, native aircraft bounds, renderer stats, and scale metrics were captured without browser or asset-load errors.'
        : 'Scale proof capture is incomplete or untrusted; inspect browser/load errors before using the numbers.',
      flags: {
        browserErrors: browserErrors.length,
        pageErrors: pageErrors.length,
        requestFailures: requestFailures.length,
        loadErrors: payload.loadErrors.length,
        npcMatchedCrops: npcComparisons.length,
        aircraftScaleEntries: payload.aircraftMetrics.length,
        rendererStatsCaptured: Boolean(payload.rendererInfo),
      },
    };

    const summaryFile = join(outputDir, 'summary.json');
    const markdownFile = join(outputDir, 'summary.md');
    const summary: ProofSummary = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: 'cycle2-kb-optik-scale-proof',
      status: measurementTrust.status,
      url,
      artifactDir: rel(outputDir) ?? outputDir,
      viewport: VIEWPORT,
      browser: {
        headed: process.argv.includes('--headed'),
        version: browserVersion,
        userAgent,
      },
      runtimeContracts: {
        npc: {
          baseVisualHeightMeters: NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT,
          visualScaleMultiplier: NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER,
          visualHeightMeters: NPC_PIXEL_FORGE_VISUAL_HEIGHT,
          spriteWidthMeters: NPC_SPRITE_WIDTH,
          spriteHeightMeters: NPC_SPRITE_HEIGHT,
          closeModelTargetHeightMeters: NPC_CLOSE_MODEL_TARGET_HEIGHT,
          actorAnchorYMeters: NPC_Y_OFFSET,
          spriteRenderYOffsetMeters: NPC_SPRITE_RENDER_Y_OFFSET,
        },
        vehicles: {
          scalePolicy: 'Runtime aircraft GLBs load at imported native scale; fixed-wing and helicopter paths rotate for game forward but do not apply a meter-scale normalization pass.',
          fixedWingVisualRotation: 'FixedWingModel rotates inner GLB by Math.PI around Y.',
          helicopterVisualRotation: 'createHelicopterGeometry rotates GLB by -Math.PI / 2 around Y.',
        },
      },
      files: {
        summary: rel(summaryFile) ?? summaryFile,
        markdown: rel(markdownFile) ?? markdownFile,
        lineupScreenshot: rel(lineupScreenshot) ?? lineupScreenshot,
      },
      npcComparisons,
      aircraftNativeScale: payload.aircraftMetrics,
      findings: buildFindings(npcComparisons, payload.aircraftMetrics),
      browserErrors,
      pageErrors,
      requestFailures: [...requestFailures, ...payload.loadErrors],
      measurementTrust,
    };
    writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    writeMarkdown(summary, markdownFile);

    console.log(`Projekt 143 KB-OPTIK scale proof ${summary.status.toUpperCase()}: ${relative(process.cwd(), summaryFile)}`);
    for (const finding of summary.findings) {
      console.log(`- ${finding}`);
    }

    if (process.argv.includes('--strict') && summary.status !== 'pass') {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
