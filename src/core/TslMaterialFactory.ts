import * as THREE from 'three';
import type { RendererBackendCapabilities } from './RendererBackend';

export type KonveyerTslSurface =
  | 'proof-fixture'
  | 'vegetation-billboard'
  | 'combatant-impostor'
  | 'effect-particle';

export interface NodeMaterialReadiness {
  ready: boolean;
  strictFailure: boolean;
  reason: string;
}

export interface AlphaTextureNodeMaterialOptions {
  texture: THREE.Texture;
  alphaTest?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  side?: THREE.Side;
  forceSinglePass?: boolean;
  name?: string;
}

export type KonveyerNodeMaterial = THREE.Material & {
  isNodeMaterial?: boolean;
  colorNode?: unknown;
  opacityNode?: unknown;
  alphaTestNode?: unknown;
  forceSinglePass?: boolean;
  fog?: boolean;
};

const DEFAULT_ALPHA_TEST = 0.25;

export function evaluateNodeMaterialReadiness(
  capabilities: RendererBackendCapabilities,
  surface: KonveyerTslSurface,
): NodeMaterialReadiness {
  if (!capabilities.isWebGPURenderer) {
    return {
      ready: false,
      strictFailure: false,
      reason: `${surface} TSL path requires WebGPURenderer; current requested mode is ${capabilities.requestedMode}.`,
    };
  }

  if (capabilities.initStatus !== 'ready') {
    return {
      ready: false,
      strictFailure: capabilities.strictWebGPU,
      reason: `${surface} TSL path requires initialized WebGPURenderer; init status is ${capabilities.initStatus}.`,
    };
  }

  if (capabilities.resolvedBackend !== 'webgpu') {
    if (capabilities.strictWebGPU) {
      return {
        ready: false,
        strictFailure: true,
        reason: `${surface} TSL path resolved ${capabilities.resolvedBackend}; refusing to hide migration failure behind fallback in strict WebGPU mode.`,
      };
    }
    // Non-strict mode: accept Three.js's automatic WebGL2 fallback. TSL node
    // materials are backend-agnostic since r171 (the `three/webgpu` renderer
    // falls back to a WebGL2 backend and TSL still works). This is the
    // production code path for users without WebGPU support.
    return {
      ready: true,
      strictFailure: false,
      reason: `${surface} TSL path allowed on ${capabilities.resolvedBackend} fallback backend.`,
    };
  }

  return {
    ready: true,
    strictFailure: false,
    reason: `${surface} TSL path is allowed on ${capabilities.resolvedBackend}.`,
  };
}

export async function createAlphaTextureNodeMaterial(
  options: AlphaTextureNodeMaterialOptions,
): Promise<KonveyerNodeMaterial> {
  const [webgpu, tsl] = await Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
  ]);

  const alphaTest = options.alphaTest ?? DEFAULT_ALPHA_TEST;
  const material = new webgpu.MeshBasicNodeMaterial({
    name: options.name ?? 'konveyer-alpha-texture-node-material',
    transparent: options.transparent ?? true,
    depthWrite: options.depthWrite ?? true,
    depthTest: true,
    side: options.side ?? THREE.DoubleSide,
    alphaTest,
    forceSinglePass: options.forceSinglePass ?? true,
  }) as KonveyerNodeMaterial;

  material.fog = false;
  const sample = tsl.texture(options.texture, tsl.uv());
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTestNode = tsl.float(alphaTest);

  return material;
}
