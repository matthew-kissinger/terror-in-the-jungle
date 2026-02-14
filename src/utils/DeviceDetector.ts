/**
 * Device detection utilities for mobile/touch support and performance scaling.
 */

export type GPUTier = 'low' | 'medium' | 'high';

let _isTouchDevice: boolean | null = null;
let _gpuTier: GPUTier | null = null;
let _isMobileGPU: boolean | null = null;

/**
 * Detect whether the current device supports touch input.
 * Result is cached after the first call.
 */
export function isTouchDevice(): boolean {
  if (_isTouchDevice !== null) return _isTouchDevice;
  _isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0;
  return _isTouchDevice;
}

/**
 * Check if the viewport is small enough to be considered mobile.
 */
export function isMobileViewport(): boolean {
  return window.innerWidth <= 1024 && window.innerHeight <= 900;
}

/**
 * Returns true when touch controls should be active.
 * Touch capability is required; small viewport is optional
 * but used as a heuristic.
 */
export function shouldUseTouchControls(): boolean {
  return isTouchDevice();
}

/**
 * Heuristic to detect if the device is running on a mobile GPU.
 */
export function isMobileGPU(): boolean {
  if (_isMobileGPU !== null) return _isMobileGPU;

  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  // Also check WebGL renderer string
  let isMobileRenderer = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        isMobileRenderer = /adreno|mali|powervr|apple gpu|vivante|tegra/i.test(renderer);
      }
    }
  } catch (_e) {
    // Ignore context creation errors
  }

  _isMobileGPU = isMobileUA || isMobileRenderer;
  return _isMobileGPU;
}

/**
 * Estimates GPU performance tier based on WebGL capabilities and device hints.
 */
export function estimateGPUTier(): GPUTier {
  if (_gpuTier !== null) return _gpuTier;

  // Start with a baseline
  let tier: GPUTier = 'medium';

  const mobile = isMobileGPU();
  
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (gl) {
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      
      // Heuristics for tiers
      if (mobile) {
        // Most mobile GPUs are medium/low in context of 200k vegetation
        tier = maxTextureSize >= 8192 ? 'medium' : 'low';
      } else {
        // Desktop tiers
        if (maxTextureSize >= 16384 && maxRenderBufferSize >= 16384) {
          tier = 'high';
        } else if (maxTextureSize >= 8192) {
          tier = 'medium';
        } else {
          tier = 'low';
        }
      }
    }
  } catch (_e) {
    // Default to medium if WebGL fails
  }

  _gpuTier = tier;
  return _gpuTier;
}

/**
 * Returns a density multiplier for vegetation based on device capabilities.
 */
export function getVegetationDensityMultiplier(): number {
  const tier = estimateGPUTier();
  const mobile = isMobileGPU();

  if (mobile) {
    return tier === 'low' ? 0.25 : 0.4;
  }

  switch (tier) {
    case 'low': return 0.5;
    case 'medium': return 1.0;
    case 'high': return 1.2; // High-end PCs can handle even more
    default: return 1.0;
  }
}

/**
 * Returns whether shadows should be enabled based on device capabilities.
 */
export function shouldEnableShadows(): boolean {
  const tier = estimateGPUTier();
  return tier !== 'low';
}

/**
 * Returns appropriate shadow map size based on device capabilities.
 */
export function getShadowMapSize(): number {
  const tier = estimateGPUTier();
  const mobile = isMobileGPU();

  if (mobile || tier === 'low') return 512;
  if (tier === 'medium') return 1024;
  return 2048;
}

/**
 * Returns render distance multiplier based on device capabilities.
 */
export function getRenderDistanceMultiplier(): number {
  const tier = estimateGPUTier();
  const mobile = isMobileGPU();

  if (mobile) return tier === 'low' ? 0.5 : 0.6;
  if (tier === 'low') return 0.7;
  return 1.0;
}

/**
 * Returns maximum pixel ratio based on device capabilities.
 */
export function getMaxPixelRatio(): number {
  const mobile = isMobileGPU();
  return mobile ? 2 : Math.min(window.devicePixelRatio, 2);
}
