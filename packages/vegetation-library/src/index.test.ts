// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  VEGETATION_CATALOG,
  assertVegetationAsset,
  getVegetationAsset,
  isLodComplete,
  readyVegetation,
  representationForDistance,
  resolveAsset,
  resolveAssetPath,
  vegetationByTier,
} from './index';
import type { VegetationAsset } from './schema';

describe('catalog integrity', () => {
  it('loads + validates every descriptor at import', () => {
    expect(VEGETATION_CATALOG.length).toBeGreaterThanOrEqual(4);
  });

  it('exposes the two ready banyans', () => {
    const ready = readyVegetation().map((a) => a.id).sort();
    expect(ready).toContain('banyan-large');
    expect(ready).toContain('banyan-standard');
  });

  it('ready assets have their nearest band backed by a real representation', () => {
    for (const a of readyVegetation()) {
      const near = a.lod.bands[0];
      expect(near.representationId).not.toBeNull();
      expect(a.representations.some((r) => r.id === near.representationId)).toBe(true);
    }
  });
});

describe('LOD strategy is per-asset, not impostor-only', () => {
  it('large hero is mesh-near + planned octa-far', () => {
    const a = getVegetationAsset('banyan-large')!;
    expect(a.lod.label).toBe('mesh-near+octa-far');
    expect(a.lod.bands.at(-1)!.plannedKind).toBe('octaImpostor');
    expect(isLodComplete(a)).toBe(false); // far impostor not baked yet
  });

  it('standard tree uses a cheaper billboard far band, not an impostor', () => {
    const a = getVegetationAsset('banyan-standard')!;
    expect(a.lod.bands.at(-1)!.plannedKind).toBe('billboardAtlas');
  });

  it('elephant grass is card-only with no far band', () => {
    const a = getVegetationAsset('elephant-grass')!;
    expect(a.lod.label).toBe('instanced-card-only');
    expect(a.lod.bands).toHaveLength(1);
    expect(a.lod.bands[0].plannedKind).toBe('groundCard');
  });

  it('fern is mesh-near then card-far', () => {
    const a = getVegetationAsset('fern')!;
    expect(a.lod.bands.map((b) => b.plannedKind)).toEqual(['mesh', 'groundCard']);
  });
});

describe('distance -> representation walk', () => {
  it('resolves the near mesh inside the first band and null in a planned band', () => {
    const a = getVegetationAsset('banyan-large')!;
    expect(representationForDistance(a, 10)?.id).toBe('mesh-large');
    expect(representationForDistance(a, 500)).toBeNull(); // planned octa band
  });
});

describe('resolver is pure string joining', () => {
  it('joins root + logical path, normalizing slashes', () => {
    expect(resolveAssetPath('/assets/vegetation', 'banyan/x.glb')).toBe('/assets/vegetation/banyan/x.glb');
    expect(resolveAssetPath('/assets/vegetation/', '/banyan/x.glb')).toBe('/assets/vegetation/banyan/x.glb');
    expect(resolveAssetPath('', 'banyan/x.glb')).toBe('/banyan/x.glb');
  });

  it('resolveAsset rewrites mesh + material map paths against the root', () => {
    const a = getVegetationAsset('banyan-large')!;
    const r = resolveAsset('/assets/vegetation', a);
    const mesh = r.representations.find((x) => x.kind === 'mesh')!;
    expect(mesh.kind === 'mesh' && mesh.path).toBe('/assets/vegetation/banyan/banyan-large-textured.glb');
    expect(r.materialBuckets[0].maps.baseColor).toBe('/assets/vegetation/textures/bark_basecolor.webp');
    // original descriptor untouched
    const meshOrig = a.representations.find((x) => x.kind === 'mesh')!;
    expect(meshOrig.kind === 'mesh' && meshOrig.path).toBe('banyan/banyan-large-textured.glb');
  });
});

describe('validator rejects malformed descriptors', () => {
  const base = (): VegetationAsset => JSON.parse(JSON.stringify(getVegetationAsset('banyan-large')));

  it('rejects a non-contiguous lod chain', () => {
    const bad = base();
    bad.lod.bands[1].minDistanceMeters = 999; // gap
    expect(() => assertVegetationAsset(bad)).toThrow(/contiguous/);
  });

  it('rejects a lod band referencing an unknown representation', () => {
    const bad = base();
    bad.lod.bands[0].representationId = 'does-not-exist';
    expect(() => assertVegetationAsset(bad)).toThrow(/unknown representation/);
  });

  it('rejects CC-BY without attributionRequired', () => {
    const bad = base();
    bad.provenance.license = 'CC-BY-4.0';
    bad.provenance.attributionRequired = false;
    expect(() => assertVegetationAsset(bad)).toThrow(/attributionRequired/);
  });

  it('rejects a non-conforming normalization', () => {
    const bad = base();
    (bad.normalization as { upAxis: string }).upAxis = 'Z';
    expect(() => assertVegetationAsset(bad)).toThrow(/normalization/);
  });
});
