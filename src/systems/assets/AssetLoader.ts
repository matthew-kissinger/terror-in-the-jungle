import * as THREE from 'three';
import { AssetInfo, AssetCategory, GameSystem } from '../../types';
import { getAssetPath } from '../../config/paths';
import { PixelPerfectUtils } from '../../utils/PixelPerfect';
import { Logger } from '../../utils/Logger';

export class AssetLoader implements GameSystem {
  private assets: Map<string, AssetInfo> = new Map();
  private textureLoader = new THREE.TextureLoader();
  private loadedTextures: Map<string, THREE.Texture> = new Map();

  async init(): Promise<void> {
    await this.discoverAssets();
    await this.loadTextures();
  }

  update(_deltaTime: number): void {
    // AssetLoader doesn't need frame updates
  }

  dispose(): void {
    this.loadedTextures.forEach(texture => texture.dispose());
    this.loadedTextures.clear();
    this.assets.clear();
  }

  private async discoverAssets(): Promise<void> {
    // Known assets in the project root
    const knownAssets = [
      // Terrain textures
      'jungle-floor.webp',
      'rocky-highland.webp',
      'mud-ground.webp',
      'rice-paddy.webp',
      'river-bank.webp',
      'red-laterite.webp',
      'tall-grass.webp',
      'bamboo-floor.webp',
      'swamp.webp',
      'sandy-beach.webp',
      'defoliated-ground.webp',
      'firebase-ground.webp',
      // Vegetation — canopy
      'DipterocarpGiant.webp',
      'TwisterBanyan.webp',
      'RubberTree.webp',
      // Vegetation — mid-level
      'CoconutPalm.webp',
      'ArecaPalmCluster.webp',
      'FanPalmCluster.webp',
      'BambooGrove.webp',
      'BananaPlant.webp',
      // Vegetation — ground cover
      'Fern.webp',
      'ElephantEarPlants.webp',
      'ElephantGrass.webp',
      'RicePaddyPlants.webp',
      'Mangrove.webp',
      // US soldiers - walk (front/back/side x 2 frames) + fire (front/back/side)
      'us-walk-front-1.webp',
      'us-walk-front-2.webp',
      'us-walk-back-1.webp',
      'us-walk-back-2.webp',
      'us-walk-side-1.webp',
      'us-walk-side-2.webp',
      'us-fire-front.webp',
      'us-fire-back.webp',
      'us-fire-side.webp',
      // VC soldiers - walk (front/back/side x 2 frames) + fire (front/back/side)
      'vc-walk-front-1.webp',
      'vc-walk-front-2.webp',
      'vc-walk-back-1.webp',
      'vc-walk-back-2.webp',
      'vc-walk-side-1.webp',
      'vc-walk-side-2.webp',
      'vc-fire-front.webp',
      'vc-fire-back.webp',
      'vc-fire-side.webp',
      // NVA soldiers - walk (front/back/side x 2 frames) + fire (front/back/side)
      'nva-walk-front-1.webp',
      'nva-walk-front-2.webp',
      'nva-walk-back-1.webp',
      'nva-walk-back-2.webp',
      'nva-walk-side-1.webp',
      'nva-walk-side-2.webp',
      'nva-fire-front.webp',
      'nva-fire-back.webp',
      'nva-fire-side.webp',
      // ARVN soldiers - walk (front/back/side x 2 frames) + fire (front/back/side)
      'arvn-walk-front-1.webp',
      'arvn-walk-front-2.webp',
      'arvn-walk-back-1.webp',
      'arvn-walk-back-2.webp',
      'arvn-walk-side-1.webp',
      'arvn-walk-side-2.webp',
      'arvn-fire-front.webp',
      'arvn-fire-back.webp',
      'arvn-fire-side.webp',
      // UI/Player
      'first-person.png',
      // Environment
      'skybox.png',
      'waternormals.jpg'
    ];

    for (const filename of knownAssets) {
      const category = this.categorizeAsset(filename);
      const assetInfo: AssetInfo = {
        name: filename.replace(/\.(png|jpg|webp)$/, ''),
        path: getAssetPath(filename),
        category
      };
      
      this.assets.set(assetInfo.name, assetInfo);
    }

    Logger.info('assets', `Discovered ${this.assets.size} assets:`, 
      Array.from(this.assets.values()).map(a => `${a.name} (${a.category})`));
  }

  private categorizeAsset(filename: string): AssetCategory {
    const name = filename.toLowerCase();

    if (name.includes('floor') || name.includes('ground') ||
        name.includes('laterite') || name.includes('highland') ||
        name.includes('beach') || name.includes('swamp') ||
        name.includes('river-bank') || name.includes('rice-paddy.') ||
        name.includes('tall-grass.') || name.includes('defoliated') ||
        name.includes('mud-')) {
      return AssetCategory.GROUND;
    }
    if (name.includes('tree') || name.includes('grass') ||
        name.includes('dipterocarp') || name.includes('banyan') || name.includes('palm') ||
        name.includes('fern') || name.includes('elephant') ||
        name.includes('bamboo') || name.includes('banana') ||
        name.includes('mangrove') || name.includes('ricepaddyplants') ||
        name.includes('rubber')) {
      return AssetCategory.FOLIAGE;
    }
    if (name.startsWith('us-') || name.startsWith('vc-') || name.startsWith('nva-') || name.startsWith('arvn-')) {
      return AssetCategory.ENEMY;
    }
    if (name.includes('skybox') || name.includes('sky')) {
      return AssetCategory.SKYBOX;
    }

    return AssetCategory.UNKNOWN;
  }

  private async loadTextures(): Promise<void> {
    const loadPromises = Array.from(this.assets.values()).map(async (asset) => {
      try {
        const texture = await this.loadTexture(asset.path);

        // Configure texture based on category
        // Billboards (foliage, enemies) use mipmapping for better distance rendering
        // Other textures use pixel-perfect nearest filtering
        if (asset.category === AssetCategory.FOLIAGE || asset.category === AssetCategory.ENEMY) {
          // Billboard textures: mipmaps + anisotropic filtering for distance
          PixelPerfectUtils.configureBillboardTexture(texture);
        } else {
          // Standard pixel-perfect: nearest filtering, no mipmaps
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.generateMipmaps = false;
        }

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
    });

    await Promise.all(loadPromises);
  }

  // Heuristically clamp texture size by asset type to keep WebGL stable
  private downscaleIfNeeded(name: string, texture: THREE.Texture): THREE.Texture | null {
    const img = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
    const w = img?.width || 0;
    const h = img?.height || 0;
    if (!w || !h) return null;

    const lower = name.toLowerCase();
    let maxDim = 2048;
    if (lower.includes('skybox')) maxDim = 1024;
    if (lower.includes('forestfloor') || lower.includes('waternormals')) maxDim = 1024;
    if (lower.includes('fern') || lower.includes('areca') || lower.includes('elephant') || lower.includes('fanpalm')) maxDim = 2048;

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
      canvasTex.magFilter = THREE.NearestFilter;
      canvasTex.minFilter = THREE.NearestFilter;
      canvasTex.wrapS = THREE.RepeatWrapping;
      canvasTex.wrapT = THREE.RepeatWrapping;
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
