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
import { getPixelForgeNpcTileCropMap } from '../src/config/generated/pixelForgeNpcTileCrops';
import {
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_RENDER_Y_OFFSET,
  NPC_SPRITE_WIDTH,
} from '../src/systems/combat/CombatantMeshFactory';
import {
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING,
} from '../src/systems/combat/PixelForgeNpcRuntime';

type CheckStatus = 'pass' | 'warn' | 'fail';
type CameraProfileSet = 'expanded-stress' | 'runtime-lod-edge';

type LightingProfile = {
  id: string;
  label: string;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  exposure: number;
  fog?: {
    color: number;
    near: number;
    far: number;
  };
};

type CameraProfile = {
  id: string;
  label: string;
  kind: 'orthographic' | 'perspective';
  position: [number, number, number];
  lookAt: [number, number, number];
  orthoHeightMeters?: number;
  fovDegrees?: number;
};

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

type BrowserExpandedMetric = {
  runtimeFaction: PixelForgeNpcFactionAsset['runtimeFaction'];
  packageFaction: PixelForgeNpcFactionAsset['packageFaction'];
  clip: string;
  lightingProfile: string;
  cameraProfile: string;
  closeModelPath: string;
  imposterTexturePath: string;
  closeModel: {
    sourceHeightMeters: number;
    visualScale: number;
    runtimeHeightMeters: number;
    projectedGeometryHeightPx: number;
    projectedGeometryWidthPx: number;
  };
  imposter: {
    runtimeWidthMeters: number;
    runtimeHeightMeters: number;
    renderYOffsetMeters: number;
    projectedGeometryHeightPx: number;
    projectedGeometryWidthPx: number;
  };
  closeCropDataUrl: string;
  imposterCropDataUrl: string;
};

type BrowserExpandedPayload = {
  metrics: BrowserExpandedMetric[];
  rendererInfo: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    webglVendor: string | null;
    webglRenderer: string | null;
  } | null;
  loadErrors: string[];
};

type ExpandedSample = Omit<BrowserExpandedMetric, 'closeCropDataUrl' | 'imposterCropDataUrl'> & {
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
    meanOpaqueLumaDeltaPercent: number | null;
    meanOpaqueChromaDelta: number | null;
  };
  flags: string[];
};

type ExpandedSummary = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-kb-optik-expanded-proof';
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
      clip: string;
    };
    acceptanceBands: {
      visibleHeightRatioMin: number;
      visibleHeightRatioMax: number;
      maxAbsLumaDeltaPercent: number;
    };
  };
  coverage: {
    cameraProfileSet: CameraProfileSet;
    lightingProfiles: LightingProfile[];
    cameraProfiles: CameraProfile[];
  };
  files: {
    summary: string;
    markdown: string;
    contactSheet: string;
  };
  aggregate: {
    sampleCount: number;
    flaggedSamples: number;
    minVisibleHeightRatio: number | null;
    maxVisibleHeightRatio: number | null;
    minLumaDeltaPercent: number | null;
    maxLumaDeltaPercent: number | null;
    maxAbsLumaDeltaPercent: number | null;
    flaggedProfiles: string[];
  };
  samples: ExpandedSample[];
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
      expectedSamples: number;
      actualSamples: number;
      rendererStatsCaptured: boolean;
    };
  };
};

const DEFAULT_PORT = 9235;
const VIEWPORT = { width: 1600, height: 900 };
const CROP_WIDTH = 640;
const CROP_HEIGHT = 900;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-optik-expanded-proof';
const OPAQUE_ALPHA_THRESHOLD = 48;
const MATCHED_CLIP_ID = 'idle';
const MIN_VISIBLE_HEIGHT_RATIO = 0.85;
const MAX_VISIBLE_HEIGHT_RATIO = 1.15;
const MAX_ABS_LUMA_DELTA_PERCENT = 12;
const DEFAULT_CAMERA_PROFILE_SET: CameraProfileSet = 'expanded-stress';
const RUNTIME_LOD_EDGE_DISTANCE_METERS = 64;

const LIGHTING_PROFILES: LightingProfile[] = [
  {
    id: 'midday-selected',
    label: 'Midday selected proof lighting',
    hemisphereSky: 0xe8f1db,
    hemisphereGround: 0x4b5a3f,
    hemisphereIntensity: 1.45,
    sunColor: 0xffffff,
    sunIntensity: 1.25,
    sunPosition: [4, 8, 8],
    exposure: 1,
  },
  {
    id: 'dawn-warm-low',
    label: 'Dawn warm low sun',
    hemisphereSky: 0xffe4b5,
    hemisphereGround: 0x26321f,
    hemisphereIntensity: 1.05,
    sunColor: 0xffb870,
    sunIntensity: 0.85,
    sunPosition: [-8, 3, 4],
    exposure: 0.95,
  },
  {
    id: 'dusk-cool-low',
    label: 'Dusk cool low sun',
    hemisphereSky: 0xc6d7ff,
    hemisphereGround: 0x22283a,
    hemisphereIntensity: 0.95,
    sunColor: 0xff9a65,
    sunIntensity: 0.7,
    sunPosition: [6, 2.2, 8],
    exposure: 0.85,
  },
  {
    id: 'haze-overcast',
    label: 'Haze overcast',
    hemisphereSky: 0xd8ddd3,
    hemisphereGround: 0x6b7168,
    hemisphereIntensity: 1.25,
    sunColor: 0xf5f0de,
    sunIntensity: 0.45,
    sunPosition: [3, 6, 5],
    exposure: 0.92,
    fog: { color: 0xc6c8bb, near: 6, far: 18 },
  },
  {
    id: 'storm-low-contrast',
    label: 'Storm low contrast',
    hemisphereSky: 0xaeb7c8,
    hemisphereGround: 0x111a22,
    hemisphereIntensity: 0.75,
    sunColor: 0xdde7ff,
    sunIntensity: 0.35,
    sunPosition: [2, 5, 3],
    exposure: 0.78,
    fog: { color: 0x87929a, near: 5, far: 16 },
  },
];

const CAMERA_PROFILE_LIBRARY: Record<string, CameraProfile> = {
  'matched-orthographic': {
    id: 'matched-orthographic',
    label: 'Matched orthographic crop',
    kind: 'orthographic',
    position: [0, NPC_CLOSE_MODEL_TARGET_HEIGHT / 2, 16],
    lookAt: [0, NPC_CLOSE_MODEL_TARGET_HEIGHT / 2, 0],
    orthoHeightMeters: 5.2,
  },
  'gameplay-front-perspective': {
    id: 'gameplay-front-perspective',
    label: 'Front-facing near gameplay perspective',
    kind: 'perspective',
    position: [0, 2.2, 8.5],
    lookAt: [0, 1.45, 0],
    fovDegrees: 34,
  },
  'runtime-lod-edge-perspective': {
    id: 'runtime-lod-edge-perspective',
    label: 'Runtime LOD-edge front perspective',
    kind: 'perspective',
    position: [0, 2.2, RUNTIME_LOD_EDGE_DISTANCE_METERS],
    lookAt: [0, 1.45, 0],
    fovDegrees: 34,
  },
};

const CAMERA_PROFILE_SETS: Record<CameraProfileSet, string[]> = {
  'expanded-stress': ['matched-orthographic', 'gameplay-front-perspective'],
  'runtime-lod-edge': ['matched-orthographic', 'runtime-lod-edge-perspective'],
};

const NPC_FIXTURES = PIXEL_FORGE_NPC_FACTIONS.map((faction) => ({
  runtimeFaction: faction.runtimeFaction,
  packageFaction: faction.packageFaction,
  modelPath: `/models/${faction.modelPath}`,
  texturePath: `/assets/pixel-forge/npcs/${faction.packageFaction}/${MATCHED_CLIP_ID}/animated-albedo-packed.png`,
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

function parseCameraProfileSet(): CameraProfileSet {
  const raw = argValue('--camera-profile-set') ?? DEFAULT_CAMERA_PROFILE_SET;
  if (raw === 'expanded-stress' || raw === 'runtime-lod-edge') return raw;
  throw new Error(`Invalid --camera-profile-set value: ${raw}`);
}

function resolveCameraProfiles(cameraProfileSet: CameraProfileSet): CameraProfile[] {
  return CAMERA_PROFILE_SETS[cameraProfileSet].map((id) => CAMERA_PROFILE_LIBRARY[id]);
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

function proofHtml(cameraProfiles: CameraProfile[]): string {
  const npcFixtures = JSON.stringify(NPC_FIXTURES);
  const lightingProfiles = JSON.stringify(LIGHTING_PROFILES);
  const cameraProfilePayload = JSON.stringify(cameraProfiles);
  const matchedClipCropMap = getPixelForgeNpcTileCropMap(MATCHED_CLIP_ID);
  const runtimeContracts = JSON.stringify({
    npcSpriteWidth: NPC_SPRITE_WIDTH,
    npcSpriteHeight: NPC_SPRITE_HEIGHT,
    npcCloseModelTargetHeight: NPC_CLOSE_MODEL_TARGET_HEIGHT,
    npcRenderYOffset: NPC_SPRITE_RENDER_Y_OFFSET,
    npcActorAnchorY: NPC_Y_OFFSET,
    cropWidth: CROP_WIDTH,
    cropHeight: CROP_HEIGHT,
    matchedClipId: MATCHED_CLIP_ID,
    clip: PIXEL_FORGE_NPC_CLIPS.find((clip) => clip.id === MATCHED_CLIP_ID),
    matchedClipCropMap,
    imposterMaterialTuning: PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING,
    materialTuning: PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projekt 143 Expanded Optik Proof</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #101310; }
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
    import { clone as cloneSkeleton } from '/node_modules/three/examples/jsm/utils/SkeletonUtils.js';

    const npcFixtures = ${npcFixtures};
    const lightingProfiles = ${lightingProfiles};
    const cameraProfiles = ${cameraProfilePayload};
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

    async function loadTexture(path) {
      return await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(path, resolve, undefined, reject);
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

    function makeCloseModel(sourceRoot, packageFaction) {
      const root = cloneSkeleton(sourceRoot);
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
        visualScale,
        finalSize: finalMetrics.size,
      };
    }

    function createNpcImposterMaterial(texture, packageFaction) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      const clip = runtimeContracts.clip;
      const cropMap = runtimeContracts.matchedClipCropMap;
      const tuning = runtimeContracts.imposterMaterialTuning[packageFaction] || runtimeContracts.imposterMaterialTuning.usArmy;
      const cropTexture = new THREE.DataTexture(
        Uint8Array.from(cropMap.data),
        cropMap.width,
        cropMap.height,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      cropTexture.name = 'Projekt143.NPC.' + runtimeContracts.matchedClipId + '.tileCropMap';
      cropTexture.generateMipmaps = false;
      cropTexture.minFilter = THREE.NearestFilter;
      cropTexture.magFilter = THREE.NearestFilter;
      cropTexture.wrapS = THREE.ClampToEdgeWrapping;
      cropTexture.wrapT = THREE.ClampToEdgeWrapping;
      cropTexture.flipY = false;
      cropTexture.needsUpdate = true;
      return new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          viewGrid: { value: new THREE.Vector2(clip.viewGridX, clip.viewGridY) },
          frameGrid: { value: new THREE.Vector2(clip.framesX, clip.framesY) },
          tileCropMap: { value: cropTexture },
          tileCropMapSize: { value: new THREE.Vector2(cropMap.width, cropMap.height) },
          viewColumn: { value: Math.floor(clip.viewGridX * 0.5) },
          frameIndex: { value: 0 },
          combatState: { value: 0 },
          readabilityColor: { value: new THREE.Color(0.0, 0.5, 1.0) },
          readabilityStrength: { value: tuning.readabilityStrength },
          npcExposure: { value: tuning.npcExposure },
          minNpcLight: { value: tuning.minNpcLight },
          npcTopLight: { value: tuning.npcTopLight },
          parityScale: { value: tuning.parityScale },
          parityLift: { value: tuning.parityLift },
          paritySaturation: { value: tuning.paritySaturation },
          npcLightingEnabled: { value: 0 },
          npcAtmosphereLightScale: { value: 1 },
          npcSkyColor: { value: new THREE.Color(1, 1, 1) },
          npcGroundColor: { value: new THREE.Color(0.35, 0.35, 0.3) },
          npcSunColor: { value: new THREE.Color(1, 1, 1) },
          npcFogMode: { value: 0 },
          npcFogColor: { value: new THREE.Color(0x7a8f88) },
          npcFogDensity: { value: 0.00055 },
          npcFogHeightFalloff: { value: 0.03 },
          npcFogStartDistance: { value: 100 },
          npcFogNear: { value: 100 },
          npcFogFar: { value: 600 },
        },
        vertexShader: \`
          varying vec2 vUv;
          varying float vDistance;
          varying float vWorldY;
          void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vDistance = length(cameraPosition - worldPosition.xyz);
            vWorldY = worldPosition.y;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
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
          uniform sampler2D tileCropMap;
          uniform vec2 tileCropMapSize;
          uniform float parityScale;
          uniform float parityLift;
          uniform float paritySaturation;
          uniform float npcLightingEnabled;
          uniform float npcAtmosphereLightScale;
          uniform vec3 npcSkyColor;
          uniform vec3 npcGroundColor;
          uniform vec3 npcSunColor;
          uniform float npcFogMode;
          uniform vec3 npcFogColor;
          uniform float npcFogDensity;
          uniform float npcFogHeightFalloff;
          uniform float npcFogStartDistance;
          uniform float npcFogNear;
          uniform float npcFogFar;
          varying vec2 vUv;
          varying float vDistance;
          varying float vWorldY;
          void main() {
            float frameX = mod(frameIndex, frameGrid.x);
            float frameY = floor(frameIndex / frameGrid.x);
            float viewX = clamp(floor(viewColumn + 0.5), 0.0, viewGrid.x - 1.0);
            float viewY = floor(viewGrid.y * 0.5);
            vec2 atlasGrid = viewGrid * frameGrid;
            vec2 tile = vec2(frameX * viewGrid.x + viewX, frameY * viewGrid.y + viewY);
            vec4 tileCrop = texture2D(tileCropMap, (tile + vec2(0.5)) / tileCropMapSize);
            vec2 croppedUv = mix(tileCrop.xy, tileCrop.zw, vUv);
            vec2 sampleUv = vec2(
              (tile.x + croppedUv.x) / atlasGrid.x,
              1.0 - ((tile.y + 1.0 - croppedUv.y) / atlasGrid.y)
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
            npcColor = min(npcColor * parityScale + vec3(parityLift), vec3(1.0));
            float parityLuma = dot(npcColor, vec3(0.299, 0.587, 0.114));
            npcColor = clamp(mix(vec3(parityLuma), npcColor, paritySaturation), 0.0, 1.0);
            if (npcLightingEnabled > 0.5) {
              vec3 atmosphereTint = mix(npcGroundColor, npcSkyColor, 0.42 + 0.58 * vUv.y) + npcSunColor * 0.18;
              float atmosphereLuma = max(dot(atmosphereTint, vec3(0.299, 0.587, 0.114)), 0.001);
              vec3 normalizedTint = clamp(atmosphereTint / atmosphereLuma, vec3(0.62), vec3(1.38));
              npcColor = clamp(npcColor * normalizedTint * npcAtmosphereLightScale, 0.0, 1.0);
            }
            if (npcFogMode > 0.5) {
              float fogFactor = 0.0;
              if (npcFogMode > 1.5) {
                fogFactor = smoothstep(npcFogNear, npcFogFar, vDistance);
              } else {
                float effectiveDistance = max(0.0, vDistance - npcFogStartDistance);
                fogFactor = 1.0 - exp(-npcFogDensity * effectiveDistance);
              }
              float heightFactor = exp(-npcFogHeightFalloff * max(0.0, vWorldY));
              float edgeFogMask = smoothstep(0.18, 0.6, texColor.a);
              fogFactor = clamp(fogFactor * heightFactor * edgeFogMask, 0.0, 1.0);
              float fogColorLuma = dot(npcFogColor, vec3(0.299, 0.587, 0.114));
              float maxFogBoost = mix(2.2, 1.55, smoothstep(0.35, 0.65, fogColorLuma));
              float fogBoost = mix(1.0, maxFogBoost, smoothstep(0.45, 0.95, fogFactor));
              vec3 fogMatchColor = min(npcFogColor * fogBoost, vec3(1.0));
              npcColor = mix(npcColor, fogMatchColor, fogFactor);
            }
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

    function makeImposter(texture, packageFaction) {
      const geometry = new THREE.PlaneGeometry(runtimeContracts.npcSpriteWidth, runtimeContracts.npcSpriteHeight);
      const material = createNpcImposterMaterial(texture, packageFaction);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.projekt143Imposter = true;
      mesh.position.y = runtimeContracts.npcActorAnchorY + runtimeContracts.npcRenderYOffset;
      mesh.updateMatrixWorld(true);
      return mesh;
    }

    function createCamera(profile) {
      const aspect = runtimeContracts.cropWidth / runtimeContracts.cropHeight;
      const camera = profile.kind === 'orthographic'
        ? new THREE.OrthographicCamera(
            -(profile.orthoHeightMeters * aspect) / 2,
            (profile.orthoHeightMeters * aspect) / 2,
            profile.orthoHeightMeters / 2,
            -profile.orthoHeightMeters / 2,
            0.1,
            100
          )
        : new THREE.PerspectiveCamera(profile.fovDegrees, aspect, 0.1, 100);
      camera.position.fromArray(profile.position);
      camera.lookAt(new THREE.Vector3().fromArray(profile.lookAt));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return camera;
    }

    function applyLighting(scene, profile) {
      scene.add(new THREE.HemisphereLight(profile.hemisphereSky, profile.hemisphereGround, profile.hemisphereIntensity));
      const sun = new THREE.DirectionalLight(profile.sunColor, profile.sunIntensity);
      sun.position.fromArray(profile.sunPosition);
      scene.add(sun);
      if (profile.fog) {
        scene.fog = new THREE.Fog(profile.fog.color, profile.fog.near, profile.fog.far);
      }
    }

    function colorLuma(color) {
      return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function syncNpcImposterAtmosphere(object, scene, camera) {
      const skyColor = new THREE.Color(0, 0, 0);
      const groundColor = new THREE.Color(0, 0, 0);
      const sunColor = new THREE.Color(0, 0, 0);
      const tmp = new THREE.Color();
      let skyWeight = 0;
      let groundWeight = 0;
      let sunWeight = 0;
      let lightMetric = 0;
      for (const child of scene.children) {
        if (child.isHemisphereLight) {
          tmp.copy(child.color).multiplyScalar(child.intensity);
          skyColor.add(tmp);
          skyWeight += child.intensity;
          lightMetric += colorLuma(tmp) * 0.65;
          tmp.copy(child.groundColor).multiplyScalar(child.intensity);
          groundColor.add(tmp);
          groundWeight += child.intensity;
          lightMetric += colorLuma(tmp) * 0.35;
        } else if (child.isDirectionalLight) {
          tmp.copy(child.color).multiplyScalar(child.intensity);
          sunColor.add(tmp);
          sunWeight += child.intensity;
          lightMetric += colorLuma(tmp) * 0.35;
        }
      }
      if (skyWeight > 0) skyColor.multiplyScalar(1 / skyWeight);
      else skyColor.setRGB(1, 1, 1);
      if (groundWeight > 0) groundColor.multiplyScalar(1 / groundWeight);
      else groundColor.setRGB(0.35, 0.35, 0.3);
      if (sunWeight > 0) sunColor.multiplyScalar(1 / sunWeight);
      else sunColor.setRGB(1, 1, 1);
      const lightingEnabled = skyWeight > 0 || groundWeight > 0 || sunWeight > 0;
      const lightScale = lightingEnabled
        ? clamp(lightMetric / 1.272, 0.5, 1.12)
        : 1;
      let fogMode = 0;
      const fogColor = new THREE.Color(0x7a8f88);
      let fogDensity = 0.00055;
      let fogNear = 100;
      let fogFar = 600;
      if (scene.fog && scene.fog.isFogExp2) {
        fogMode = 1;
        fogColor.copy(scene.fog.color);
        fogDensity = clamp(scene.fog.density, 0, 0.002);
      } else if (scene.fog && scene.fog.isFog) {
        fogMode = 2;
        fogColor.copy(scene.fog.color);
        fogNear = scene.fog.near;
        fogFar = scene.fog.far;
      }
      object.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          const uniforms = material && material.uniforms;
          if (!uniforms || !uniforms.npcAtmosphereLightScale) continue;
          if (uniforms.cameraPosition) {
            uniforms.cameraPosition.value.copy(camera.position);
          }
          uniforms.npcLightingEnabled.value = lightingEnabled ? 1 : 0;
          uniforms.npcAtmosphereLightScale.value = lightScale;
          uniforms.npcSkyColor.value.copy(skyColor);
          uniforms.npcGroundColor.value.copy(groundColor);
          uniforms.npcSunColor.value.copy(sunColor);
          uniforms.npcFogMode.value = fogMode;
          uniforms.npcFogColor.value.copy(fogColor);
          uniforms.npcFogDensity.value = fogDensity;
          uniforms.npcFogNear.value = fogNear;
          uniforms.npcFogFar.value = fogFar;
        }
      });
    }

    function createRenderer(profile) {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(runtimeContracts.cropWidth, runtimeContracts.cropHeight, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = profile.exposure;
      return renderer;
    }

    function orientImposterToCamera(mesh, camera) {
      if (!mesh.userData.projekt143Imposter) return;
      const dx = camera.position.x - mesh.position.x;
      const dz = camera.position.z - mesh.position.z;
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.updateMatrixWorld(true);
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

    function renderTransparentCrop(object, lightingProfile, cameraProfile) {
      const renderer = createRenderer(lightingProfile);
      const scene = new THREE.Scene();
      applyLighting(scene, lightingProfile);
      const camera = createCamera(cameraProfile);
      orientImposterToCamera(object, camera);
      scene.add(object);
      object.updateMatrixWorld(true);
      syncNpcImposterAtmosphere(object, scene, camera);
      const projected = projectBoxPixels(new THREE.Box3().setFromObject(object), camera, runtimeContracts.cropWidth, runtimeContracts.cropHeight);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const info = {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        webglVendor: renderer.getContext().getParameter(renderer.getContext().VENDOR),
        webglRenderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
      };
      scene.remove(object);
      renderer.dispose();
      return { dataUrl, projected, info };
    }

    async function buildFixtureMetrics(fixture) {
      const [gltf, texture] = await Promise.all([
        loadGltf(fixture.modelPath),
        loadTexture(fixture.texturePath),
      ]);
      const metrics = [];
      let rendererInfo = null;
      for (const lightingProfile of lightingProfiles) {
        for (const cameraProfile of cameraProfiles) {
          const close = makeCloseModel(gltf.scene, fixture.packageFaction);
          const closeCrop = renderTransparentCrop(close.root, lightingProfile, cameraProfile);
          const imposter = makeImposter(texture, fixture.packageFaction);
          const imposterCrop = renderTransparentCrop(imposter, lightingProfile, cameraProfile);
          rendererInfo = imposterCrop.info;
          metrics.push({
            runtimeFaction: fixture.runtimeFaction,
            packageFaction: fixture.packageFaction,
            clip: runtimeContracts.matchedClipId,
            lightingProfile: lightingProfile.id,
            cameraProfile: cameraProfile.id,
            closeModelPath: fixture.modelPath,
            imposterTexturePath: fixture.texturePath,
            closeModel: {
              sourceHeightMeters: round(close.sourceSize.y, 4),
              visualScale: round(close.visualScale, 4),
              runtimeHeightMeters: round(close.finalSize.y, 4),
              projectedGeometryHeightPx: closeCrop.projected.height,
              projectedGeometryWidthPx: closeCrop.projected.width,
            },
            imposter: {
              runtimeWidthMeters: runtimeContracts.npcSpriteWidth,
              runtimeHeightMeters: runtimeContracts.npcSpriteHeight,
              renderYOffsetMeters: runtimeContracts.npcRenderYOffset,
              projectedGeometryHeightPx: imposterCrop.projected.height,
              projectedGeometryWidthPx: imposterCrop.projected.width,
            },
            closeCropDataUrl: closeCrop.dataUrl,
            imposterCropDataUrl: imposterCrop.dataUrl,
          });
        }
      }
      return { metrics, rendererInfo };
    }

    async function renderContactSheet() {
      const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.setClearColor(0x121812, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      applyLighting(scene, lightingProfiles[0]);
      const camera = new THREE.OrthographicCamera(-12, 12, 7, -2, 0.1, 100);
      camera.position.set(0, 3.5, 18);
      camera.lookAt(0, 2, 0);
      camera.updateProjectionMatrix();
      const ground = new THREE.GridHelper(24, 24, 0x5e7b5b, 0x273227);
      scene.add(ground);

      for (let index = 0; index < npcFixtures.length; index++) {
        try {
          const fixture = npcFixtures[index];
          const x = -7.5 + index * 5;
          const [gltf, texture] = await Promise.all([
            loadGltf(fixture.modelPath),
            loadTexture(fixture.texturePath),
          ]);
          const close = makeCloseModel(gltf.scene, fixture.packageFaction);
          close.root.position.x = x;
          scene.add(close.root);
          const imposter = makeImposter(texture, fixture.packageFaction);
          imposter.position.x = x + 2;
          orientImposterToCamera(imposter, camera);
          scene.add(imposter);
        } catch (error) {
          loadErrors.push(String(error));
        }
      }
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
    }

    async function main() {
      const metrics = [];
      let rendererInfo = null;
      for (const fixture of npcFixtures) {
        try {
          const result = await buildFixtureMetrics(fixture);
          metrics.push(...result.metrics);
          rendererInfo = result.rendererInfo || rendererInfo;
        } catch (error) {
          loadErrors.push(String(error && error.stack ? error.stack : error));
        }
      }
      window.__projekt143ExpandedOptikReady = {
        metrics,
        rendererInfo,
        loadErrors,
      };
    }

    main().catch((error) => {
      window.__projekt143ExpandedOptikReady = {
        metrics: [],
        rendererInfo: null,
        loadErrors: [String(error && error.stack ? error.stack : error)],
      };
    });
  </script>
</body>
</html>`;
}

function createStaticServer(port: number, cameraProfiles: CameraProfile[]): Promise<{ server: Server; url: string }> {
  const html = proofHtml(cameraProfiles);
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
    if (ratio < MIN_VISIBLE_HEIGHT_RATIO || ratio > MAX_VISIBLE_HEIGHT_RATIO) {
      flags.push('expanded-visible-height-mismatch-over-15pct');
    }
  }
  if (closeStats.meanOpaqueLuma !== null && imposterStats.meanOpaqueLuma !== null) {
    const lumaDelta = imposterStats.meanOpaqueLuma - closeStats.meanOpaqueLuma;
    const lumaDeltaPercent = closeStats.meanOpaqueLuma > 0 ? (lumaDelta / closeStats.meanOpaqueLuma) * 100 : 0;
    if (Math.abs(lumaDeltaPercent) > MAX_ABS_LUMA_DELTA_PERCENT) {
      flags.push('expanded-luma-delta-over-12pct');
    }
  }
  return flags;
}

function finite(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
}

function min(values: number[]): number | null {
  return values.length > 0 ? roundMetric(Math.min(...values), 3) : null;
}

function max(values: number[]): number | null {
  return values.length > 0 ? roundMetric(Math.max(...values), 3) : null;
}

function buildAggregate(samples: ExpandedSample[]): ExpandedSummary['aggregate'] {
  const ratios = finite(samples.map((sample) => sample.deltas.renderedVisibleHeightRatio));
  const lumaDeltaPercents = finite(samples.map((sample) => sample.deltas.meanOpaqueLumaDeltaPercent));
  const flaggedProfiles = [...new Set(samples
    .filter((sample) => sample.flags.length > 0)
    .map((sample) => `${sample.lightingProfile}/${sample.cameraProfile}`))]
    .sort();
  return {
    sampleCount: samples.length,
    flaggedSamples: samples.filter((sample) => sample.flags.length > 0).length,
    minVisibleHeightRatio: min(ratios),
    maxVisibleHeightRatio: max(ratios),
    minLumaDeltaPercent: min(lumaDeltaPercents),
    maxLumaDeltaPercent: max(lumaDeltaPercents),
    maxAbsLumaDeltaPercent: lumaDeltaPercents.length > 0
      ? roundMetric(Math.max(...lumaDeltaPercents.map((value) => Math.abs(value))), 3)
      : null,
    flaggedProfiles,
  };
}

function buildFindings(
  summary: Pick<ExpandedSummary, 'aggregate' | 'measurementTrust'>,
  cameraProfiles: CameraProfile[],
): string[] {
  const findings: string[] = [];
  const { aggregate } = summary;
  if (summary.measurementTrust.status !== 'pass') {
    findings.push('Measurement trust is not acceptable; inspect browser, page, request, and asset-load errors before using visual deltas.');
    return findings;
  }
  findings.push(
    `Expanded KB-OPTIK proof captured ${aggregate.sampleCount} close-GLB/imposter comparisons across ${LIGHTING_PROFILES.length} lighting profiles and ${cameraProfiles.length} camera profiles.`
  );
  findings.push(
    `Visible-height ratio range is ${aggregate.minVisibleHeightRatio ?? 'n/a'} to ${aggregate.maxVisibleHeightRatio ?? 'n/a'} against the ${MIN_VISIBLE_HEIGHT_RATIO}-${MAX_VISIBLE_HEIGHT_RATIO} band.`
  );
  findings.push(
    `Luma delta percent range is ${aggregate.minLumaDeltaPercent ?? 'n/a'} to ${aggregate.maxLumaDeltaPercent ?? 'n/a'} against the +/-${MAX_ABS_LUMA_DELTA_PERCENT}% band.`
  );
  if (aggregate.flaggedSamples > 0) {
    findings.push(
      `${aggregate.flaggedSamples} expanded samples are flagged; affected profile pairs: ${aggregate.flaggedProfiles.join(', ')}. Treat this as targeted visual-decision evidence, not closeout.`
    );
  } else {
    findings.push('No expanded lighting/gameplay-camera samples are flagged; KB-OPTIK can move to human visual review or explicit closeout.');
  }
  findings.push('This proof does not claim performance improvement, production parity, aircraft scale acceptance, or human playtest signoff.');
  return findings;
}

function writeMarkdown(summary: ExpandedSummary, file: string): void {
  const lines = [
    '# Projekt Objekt-143 KB-OPTIK Expanded Proof',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Status: ${summary.status.toUpperCase()}`,
    `Camera profile set: ${summary.coverage.cameraProfileSet}`,
    '',
    '## Findings',
    '',
    ...summary.findings.map((finding) => `- ${finding}`),
    '',
    '## Samples',
    '',
    '| Faction | Lighting | Camera | Height ratio | Luma delta % | Flags |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...summary.samples.map((sample) => (
      `| ${sample.runtimeFaction} | ${sample.lightingProfile} | ${sample.cameraProfile} | ${sample.deltas.renderedVisibleHeightRatio ?? 'n/a'} | ${sample.deltas.meanOpaqueLumaDeltaPercent ?? 'n/a'} | ${sample.flags.join(', ') || 'none'} |`
    )),
    '',
  ];
  writeFileSync(file, lines.join('\n'), 'utf-8');
}

async function run(): Promise<void> {
  const outputDir = parseOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const port = parsePort();
  const cameraProfileSet = parseCameraProfileSet();
  const cameraProfiles = resolveCameraProfiles(cameraProfileSet);
  const { server, url } = await createStaticServer(port, cameraProfiles);
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
    await page.waitForFunction(() => Boolean((window as typeof window & { __projekt143ExpandedOptikReady?: unknown }).__projekt143ExpandedOptikReady), null, { timeout: 90_000 });
    const payload = await page.evaluate(() => (
      (window as typeof window & { __projekt143ExpandedOptikReady: BrowserExpandedPayload }).__projekt143ExpandedOptikReady
    ));
    const browserVersion = browser.version();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const contactSheet = join(outputDir, 'expanded-optik-contact-sheet.png');
    await page.screenshot({ path: contactSheet });

    const samples: ExpandedSample[] = [];
    for (const metric of payload.metrics) {
      const prefix = `${metric.packageFaction}-${metric.clip}-${metric.lightingProfile}-${metric.cameraProfile}`;
      const closeFile = join(outputDir, `${prefix}-close-glb.png`);
      const imposterFile = join(outputDir, `${prefix}-imposter.png`);
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
      samples.push({
        runtimeFaction: metric.runtimeFaction,
        packageFaction: metric.packageFaction,
        clip: metric.clip,
        lightingProfile: metric.lightingProfile,
        cameraProfile: metric.cameraProfile,
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
          meanOpaqueLumaDeltaPercent: closeStats.meanOpaqueLuma !== null && imposterStats.meanOpaqueLuma !== null && closeStats.meanOpaqueLuma > 0
            ? roundMetric(((imposterStats.meanOpaqueLuma - closeStats.meanOpaqueLuma) / closeStats.meanOpaqueLuma) * 100, 2)
            : null,
          meanOpaqueChromaDelta: closeStats.meanOpaqueChroma !== null && imposterStats.meanOpaqueChroma !== null
            ? roundMetric(imposterStats.meanOpaqueChroma - closeStats.meanOpaqueChroma, 2)
            : null,
        },
        flags: comparisonFlags(closeStats, imposterStats),
      });
    }

    const expectedSamples = NPC_FIXTURES.length * LIGHTING_PROFILES.length * cameraProfiles.length;
    const trustStatus: CheckStatus =
      browserErrors.length === 0
      && pageErrors.length === 0
      && requestFailures.length === 0
      && payload.loadErrors.length === 0
      && samples.length === expectedSamples
      && Boolean(payload.rendererInfo)
        ? 'pass'
        : 'fail';
    const measurementTrust: ExpandedSummary['measurementTrust'] = {
      status: trustStatus,
      summary: trustStatus === 'pass'
        ? 'Expanded close-GLB/imposter crops, renderer stats, and lighting/camera metadata were captured without browser or asset-load errors.'
        : 'Expanded proof capture is incomplete or untrusted; inspect browser/load errors before using the numbers.',
      flags: {
        browserErrors: browserErrors.length,
        pageErrors: pageErrors.length,
        requestFailures: requestFailures.length,
        loadErrors: payload.loadErrors.length,
        expectedSamples,
        actualSamples: samples.length,
        rendererStatsCaptured: Boolean(payload.rendererInfo),
      },
    };
    const aggregate = buildAggregate(samples);
    const visualStatus: CheckStatus = aggregate.flaggedSamples > 0 ? 'warn' : 'pass';
    const status: CheckStatus = measurementTrust.status === 'pass' ? visualStatus : 'fail';
    const summaryFile = join(outputDir, 'summary.json');
    const markdownFile = join(outputDir, 'summary.md');
    const summaryWithoutFindings = {
      aggregate,
      measurementTrust,
    };
    const summary: ExpandedSummary = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: 'projekt-143-kb-optik-expanded-proof',
      status,
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
          clip: MATCHED_CLIP_ID,
        },
        acceptanceBands: {
          visibleHeightRatioMin: MIN_VISIBLE_HEIGHT_RATIO,
          visibleHeightRatioMax: MAX_VISIBLE_HEIGHT_RATIO,
          maxAbsLumaDeltaPercent: MAX_ABS_LUMA_DELTA_PERCENT,
        },
      },
      coverage: {
        cameraProfileSet,
        lightingProfiles: LIGHTING_PROFILES,
        cameraProfiles,
      },
      files: {
        summary: rel(summaryFile) ?? summaryFile,
        markdown: rel(markdownFile) ?? markdownFile,
        contactSheet: rel(contactSheet) ?? contactSheet,
      },
      aggregate,
      samples,
      findings: buildFindings(summaryWithoutFindings, cameraProfiles),
      browserErrors,
      pageErrors,
      requestFailures: [...requestFailures, ...payload.loadErrors],
      measurementTrust,
    };
    writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    writeMarkdown(summary, markdownFile);

    console.log(`Projekt 143 KB-OPTIK expanded proof ${summary.status.toUpperCase()}: ${relative(process.cwd(), summaryFile)}`);
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
