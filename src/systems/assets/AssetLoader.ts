import * as THREE from 'three';
import { AssetInfo, AssetCategory, GameSystem } from '../../types';
import { getAssetPath } from '../../config/paths';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';
import { Logger } from '../../utils/Logger';
import { PIXEL_FORGE_TEXTURE_ASSETS, type PixelForgeColorSpace } from '../../config/pixelForgeAssets';

interface TextureAssetDefinition {
  name: string;
  file: string;
  category: AssetCategory;
  colorSpace?: PixelForgeColorSpace;
}

export interface TextureUploadWarmupEntry {
  name: string;
  path: string;
  category: AssetCategory;
  width: number;
  height: number;
  estimatedMipmappedMiB: number;
  durationMs: number;
  status: 'uploaded' | 'failed';
  error?: string;
}

export interface TextureUploadWarmupSummary {
  requested: number;
  uploaded: number;
  missing: number;
  failed: number;
  totalDurationMs: number;
  entries: TextureUploadWarmupEntry[];
  missingNames: string[];
}

function getTextureDimensions(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  return {
    width: Number(image?.width ?? image?.naturalWidth ?? 0),
    height: Number(image?.height ?? image?.naturalHeight ?? 0),
  };
}

function estimateMipmappedTextureMiB(width: number, height: number): number {
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const rgbaBytes = width * height * 4;
  const mipmappedBytes = rgbaBytes * (4 / 3);
  return Math.round((mipmappedBytes / (1024 * 1024)) * 100) / 100;
}

function sanitizePerformanceName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

export class AssetLoader implements GameSystem {
  private assets: Map<string, AssetInfo> = new Map();
  private textureLoader = new THREE.TextureLoader();
  private loadedTextures: Map<string, THREE.Texture> = new Map();
  private textureColorSpaces: Map<string, PixelForgeColorSpace> = new Map();

  async init(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    THREE.Cache.enabled = true;
    await this.discoverAssets();
    await this.loadTextures(onProgress);
  }

  update(_deltaTime: number): void {
    // AssetLoader doesn't need frame updates
  }

  dispose(): void {
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();
    this.assets.clear();
    this.textureColorSpaces.clear();
  }

  private async discoverAssets(): Promise<void> {
    // Known assets in the project root. NPC and vegetation art is registered
    // exclusively from the Pixel Forge manifest; old sprite/foliage filenames
    // are intentionally absent from this list.
    const knownAssets: TextureAssetDefinition[] = [
      // Terrain textures
      { file: 'jungle-floor.webp', name: 'jungle-floor', category: AssetCategory.GROUND },
      { file: 'rocky-highland.webp', name: 'rocky-highland', category: AssetCategory.GROUND },
      { file: 'mud-ground.webp', name: 'mud-ground', category: AssetCategory.GROUND },
      { file: 'rice-paddy.webp', name: 'rice-paddy', category: AssetCategory.GROUND },
      { file: 'river-bank.webp', name: 'river-bank', category: AssetCategory.GROUND },
      { file: 'red-laterite.webp', name: 'red-laterite', category: AssetCategory.GROUND },
      { file: 'tall-grass.webp', name: 'tall-grass', category: AssetCategory.GROUND },
      { file: 'bamboo-floor.webp', name: 'bamboo-floor', category: AssetCategory.GROUND },
      { file: 'swamp.webp', name: 'swamp', category: AssetCategory.GROUND },
      { file: 'sandy-beach.webp', name: 'sandy-beach', category: AssetCategory.GROUND },
      { file: 'defoliated-ground.webp', name: 'defoliated-ground', category: AssetCategory.GROUND },
      { file: 'firebase-ground.webp', name: 'firebase-ground', category: AssetCategory.GROUND },
      // UI/Player
      { file: 'first-person.png', name: 'first-person', category: AssetCategory.UNKNOWN },
      // Environment
      { file: 'waternormals.jpg', name: 'waternormals', category: AssetCategory.UNKNOWN },
      ...PIXEL_FORGE_TEXTURE_ASSETS.map((asset) => ({
        file: asset.file,
        name: asset.name,
        category: asset.category === 'foliage' ? AssetCategory.FOLIAGE : AssetCategory.ENEMY,
        colorSpace: asset.colorSpace,
      })),
    ];

    for (const asset of knownAssets) {
      const assetInfo: AssetInfo = {
        name: asset.name,
        path: getAssetPath(asset.file),
        category: asset.category,
      };
      if (asset.colorSpace) {
        this.textureColorSpaces.set(asset.name, asset.colorSpace);
      }
      this.assets.set(assetInfo.name, assetInfo);
    }

    Logger.info('assets', `Discovered ${this.assets.size} assets:`, 
      Array.from(this.assets.values()).map(a => `${a.name} (${a.category})`));
  }

  private async loadTextures(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const assets = Array.from(this.assets.values());
    const total = assets.length;
    let loaded = 0;

    const loadPromises = assets.map(async (asset) => {
      try {
        const texture = await this.loadTexture(asset.path);

        this.configureTextureForCategory(texture, asset.category, this.textureColorSpaces.get(asset.name));

        // Downscale extremely large textures to avoid GPU memory exhaustion
        const resized = this.downscaleIfNeeded(asset.name, texture);
        const finalTexture = resized || texture;

        asset.texture = finalTexture;
        this.loadedTextures.set(asset.name, finalTexture);

        const img = finalTexture.image as HTMLImageElement | HTMLCanvasElement | undefined;
        if (img && img.width && img.height) {
          Logger.debug('assets', `Loaded texture: ${asset.name} (${img.width}x${img.height})`);
        } else {
          Logger.debug('assets', `Loaded texture: ${asset.name}`);
        }
      } catch (error) {
        Logger.warn('assets', `Failed to load texture: ${asset.path}`, error);
      }
      loaded++;
      onProgress?.(loaded, total);
    });

    await Promise.all(loadPromises);
  }

  private configureTextureForCategory(texture: THREE.Texture, category: AssetCategory, colorSpace?: PixelForgeColorSpace): void {
    if (colorSpace === 'srgb') {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (colorSpace === 'linear') {
      texture.colorSpace = THREE.NoColorSpace;
    }

    if (category === AssetCategory.FOLIAGE || category === AssetCategory.ENEMY) {
      // Pixel Forge billboard/impostor atlases: linear mipmaps for distance.
      PixelPerfectUtils.configureBillboardTexture(texture);
      return;
    }

    if (category === AssetCategory.GROUND) {
      // Ground textures are albedo color maps. WebGPU/TSL PBR lighting expects
      // them to be decoded from sRGB, otherwise noon scenes over-brighten.
      if (colorSpace !== 'linear') {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      // Terrain surfaces need linear filtering and mipmaps. Nearest filtering
      // causes visible shimmer and aliasing at gameplay camera distances.
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      return;
    }

    // Default UI/general textures keep the pixel-perfect path.
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
  }

  // Heuristically clamp texture size by asset type to keep WebGL stable
  private downscaleIfNeeded(name: string, texture: THREE.Texture): THREE.Texture | null {
    const img = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
    const w = img?.width || 0;
    const h = img?.height || 0;
    if (!w || !h) return null;

    const lower = name.toLowerCase();
    if (name.startsWith('PixelForge.')) return null;
    let maxDim = 2048;
    if (lower.includes('forestfloor') || lower.includes('waternormals')) maxDim = 1024;

    if (w <= maxDim && h <= maxDim) return null;

    const scale = Math.min(maxDim / w, maxDim / h);
    const newW = Math.max(1, Math.floor(w * scale));
    const newH = Math.max(1, Math.floor(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      const img = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
      if (img) {
        ctx.drawImage(img, 0, 0, newW, newH);
      } else {
        Logger.warn('assets', `Cannot downscale texture ${name}: image is undefined`);
        return null;
      }
      const canvasTex = new THREE.CanvasTexture(canvas);
      canvasTex.colorSpace = texture.colorSpace;
      canvasTex.magFilter = texture.magFilter;
      canvasTex.minFilter = texture.minFilter;
      canvasTex.wrapS = texture.wrapS;
      canvasTex.wrapT = texture.wrapT;
      canvasTex.generateMipmaps = texture.generateMipmaps;
      texture.dispose();
      return canvasTex;
    } catch (e) {
      Logger.warn('assets', `Texture downscale failed for ${name}:`, e);
      return null;
    }
  }

  private loadTexture(path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (texture) => resolve(texture),
        undefined,
        (error) => reject(error)
      );
    });
  }

  getTexture(name: string): THREE.Texture | undefined {
    return this.loadedTextures.get(name);
  }

  warmGpuTextures(renderer: THREE.WebGLRenderer, names: readonly string[]): TextureUploadWarmupSummary {
    const start = performance.now();
    const entries: TextureUploadWarmupEntry[] = [];
    const missingNames: string[] = [];
    let uploaded = 0;
    let failed = 0;

    for (const name of names) {
      const asset = this.assets.get(name);
      const texture = this.loadedTextures.get(name);
      if (!asset || !texture) {
        missingNames.push(name);
        continue;
      }

      const { width, height } = getTextureDimensions(texture);
      const entryStart = performance.now();
      const perfName = `kb-load.texture-upload-warmup.${sanitizePerformanceName(name)}`;
      try {
        performance.mark(`${perfName}.begin`);
        renderer.initTexture(texture);
        const durationMs = Math.round((performance.now() - entryStart) * 100) / 100;
        performance.mark(`${perfName}.end`);
        performance.measure(perfName, `${perfName}.begin`, `${perfName}.end`);
        entries.push({
          name,
          path: asset.path,
          category: asset.category,
          width,
          height,
          estimatedMipmappedMiB: estimateMipmappedTextureMiB(width, height),
          durationMs,
          status: 'uploaded',
        });
        uploaded++;
      } catch (error) {
        const durationMs = Math.round((performance.now() - entryStart) * 100) / 100;
        performance.mark(`${perfName}.end`);
        performance.measure(perfName, `${perfName}.begin`, `${perfName}.end`);
        entries.push({
          name,
          path: asset.path,
          category: asset.category,
          width,
          height,
          estimatedMipmappedMiB: estimateMipmappedTextureMiB(width, height),
          durationMs,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
        Logger.warn('assets', `GPU texture warmup failed for ${name}`, error);
      }
    }

    const summary: TextureUploadWarmupSummary = {
      requested: names.length,
      uploaded,
      missing: missingNames.length,
      failed,
      totalDurationMs: Math.round((performance.now() - start) * 100) / 100,
      entries,
      missingNames,
    };

    if (summary.requested > 0) {
      Logger.info(
        'assets',
        `GPU texture warmup: ${summary.uploaded}/${summary.requested} uploaded, ${summary.missing} missing, ${summary.failed} failed in ${summary.totalDurationMs}ms`,
        summary.entries.map(entry => `${entry.name} ${entry.width}x${entry.height} ${entry.durationMs}ms`)
      );
    }

    return summary;
  }

  getAssetsByCategory(category: AssetCategory): AssetInfo[] {
    return Array.from(this.assets.values()).filter(asset => asset.category === category);
  }

  getAsset(name: string): AssetInfo | undefined {
    return this.assets.get(name);
  }

  getAllAssets(): AssetInfo[] {
    return Array.from(this.assets.values());
  }
}
