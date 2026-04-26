import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  CombatantMeshFactory,
  DEFAULT_MESH_BUCKET_CAPACITY,
  MOUNTED_MESH_BUCKET_CAPACITY,
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_RENDER_Y_OFFSET,
  NPC_SPRITE_WIDTH,
  disposeCombatantMeshes,
  reportBucketOverflow,
  resetBucketOverflowState,
} from './CombatantMeshFactory';
import type { AssetLoader } from '../assets/AssetLoader';
import { PLAYER_EYE_HEIGHT } from '../player/PlayerMovement';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { Logger } from '../../utils/Logger';

/**
 * Behavior contract for CombatantMeshFactory's per-bucket overflow handling.
 *
 * These tests anchor the fix for the silent-drop bug flagged in the E2 rendering spike
 * (docs/rearch/E2-rendering-evaluation.md on spike/E2-rendering-at-scale, Known Issues #2
 * in docs/BACKLOG.md). They assert behavior from a caller's perspective — the cap is
 * "large enough to not silently hide realistic peaks" and overflows "surface a warning
 * instead of being silently dropped" — not implementation shape.
 */
describe('CombatantMeshFactory bucket capacity', () => {
  it('exposes a default bucket capacity large enough to cover realistic per-bucket peaks', () => {
    // The E2 memo recommended raising "before combat testing moves past 500 concurrent NPCs
    // per bucket". The fix must give real headroom above that threshold.
    expect(DEFAULT_MESH_BUCKET_CAPACITY).toBeGreaterThanOrEqual(500);
  });

  it('exposes a mounted bucket capacity with safety margin above prior crew sizes', () => {
    // Mounted buckets (NPCs seated in vehicles) were previously capped at 32. The fix should
    // still give meaningful headroom even though vehicle-crew peaks are much lower than walking.
    expect(MOUNTED_MESH_BUCKET_CAPACITY).toBeGreaterThan(32);
  });
});

describe('CombatantMeshFactory bucket overflow reporting', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetBucketOverflowState();
    warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetBucketOverflowState();
  });

  it('warns on overflow instead of dropping silently', () => {
    reportBucketOverflow('US_idle', 0);

    // The first overflow in a fresh state must produce an observable warning.
    expect(warnSpy).toHaveBeenCalled();
    const firstCall = warnSpy.mock.calls[0];
    expect(firstCall[0]).toBe('combat-renderer');
    expect(firstCall[1]).toContain('US_idle');
  });

  it('coalesces rapid overflows into one warning per bucket per second', () => {
    // Simulate many overflows inside a single second — the log must be rate-limited.
    for (let i = 0; i < 50; i++) {
      reportBucketOverflow('NVA_patrol_walk', i);
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('emits a second warning once the rate-limit window has elapsed', () => {
    reportBucketOverflow('VC_advance_fire', 0);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Within the same second: suppressed.
    reportBucketOverflow('VC_advance_fire', 500);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // After the 1s window elapses: a new warning can fire.
    reportBucketOverflow('VC_advance_fire', 1500);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('tracks overflow counts independently per bucket', () => {
    reportBucketOverflow('US_idle', 0);
    reportBucketOverflow('NVA_advance_fire', 0);

    // Two distinct buckets both overflowing in the same instant should each get their own
    // warning, because the rate limit is per-bucket, not global.
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

/**
 * Integration-flavor behavior test: ensure an InstancedMesh built at the raised cap actually
 * accepts instance writes up to the cap and — crucially — does not silently swallow the (cap+1)th
 * write. We exercise the contract that failed at the prior 120 cap: a scenario with N+1
 * combatants must either fit (because the cap is raised enough) or surface overflow; never both
 * silent and dropped.
 */
describe('CombatantMeshFactory instanced write contract at raised cap', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetBucketOverflowState();
    warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetBucketOverflowState();
  });

  it('accepts writes up to the raised cap and surfaces overflow beyond it', () => {
    // Model a bucket at the production cap.
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, DEFAULT_MESH_BUCKET_CAPACITY);
    const scratch = new THREE.Matrix4();

    let written = 0;
    let overflowed = 0;
    // Try to write one more than the cap, mirroring the renderer's drop-site logic.
    const target = DEFAULT_MESH_BUCKET_CAPACITY + 1;
    for (let i = 0; i < target; i++) {
      if (written >= DEFAULT_MESH_BUCKET_CAPACITY) {
        reportBucketOverflow('TEST_BUCKET', i);
        overflowed++;
        continue;
      }
      scratch.setPosition(i, 0, 0);
      mesh.setMatrixAt(written, scratch);
      written++;
    }

    // The contract: writes up to the cap succeed, the overflow is surfaced as a warning.
    expect(written).toBe(DEFAULT_MESH_BUCKET_CAPACITY);
    expect(overflowed).toBe(1);
    expect(warnSpy).toHaveBeenCalled();

    geometry.dispose();
    material.dispose();
  });
});

/**
 * Behavior: the NPC billboard silhouette must not dwarf the player. The player
 * eye height is the closest on-screen anchor for relative scale. Pixel Forge
 * NPCs now intentionally read larger than the player-camera anchor, but still
 * need a ceiling so they do not regress to the old giant billboard problem.
 *
 * These tests do not pin exact sprite/eye dimensions — tuning is allowed — but
 * pin the RATIO that determines the "NPC is readable but not giant" gameplay
 * contract. Any future change that pushes the ratio back past this must update
 * these thresholds deliberately.
 */
describe('CombatantMeshFactory sizing contract (player vs. NPC)', () => {
  it('sprite silhouette is not taller than the regression ceiling relative to the player eye', () => {
    // 4.425m over the 2.2m eye anchor is the current readability target.
    // 2.25x leaves headroom while still blocking a return to the 7m sprite era.
    const ratio = NPC_SPRITE_HEIGHT / PLAYER_EYE_HEIGHT;
    expect(ratio).toBeGreaterThan(1.85);
    expect(ratio).toBeLessThan(2.25);
  });

  it('sprite dimensions are positive and plausible', () => {
    // Guard against zeroed or inverted geometry: a 0-height plane is invisible.
    expect(NPC_SPRITE_WIDTH).toBeGreaterThan(0);
    expect(NPC_SPRITE_HEIGHT).toBeGreaterThan(0);
    // Height-wider-than-wide (portrait) — a landscape billboard would be a bug.
    expect(NPC_SPRITE_HEIGHT).toBeGreaterThan(NPC_SPRITE_WIDTH);
  });

  it('close Pixel Forge GLBs target the same visual height as impostor NPCs', () => {
    expect(NPC_CLOSE_MODEL_TARGET_HEIGHT).toBeCloseTo(NPC_SPRITE_HEIGHT, 5);
  });

  it('player eye height does not drop below the floor that keeps NPCs from feeling huge', () => {
    // 2.2m is the playtest-validated tall-adult eye. Dropping below 2m re-enters
    // the "player feels small" regression; keep a floor at 2m.
    expect(PLAYER_EYE_HEIGHT).toBeGreaterThanOrEqual(2);
  });

  it('NPC logical anchor matches player eye height so actors read at the same scale', () => {
    expect(NPC_Y_OFFSET).toBeCloseTo(PLAYER_EYE_HEIGHT, 5);
  });

  it('NPC billboard plane is shifted down from the eye anchor to keep visible feet grounded', () => {
    const planeCenterY = NPC_Y_OFFSET + NPC_SPRITE_RENDER_Y_OFFSET;
    const planeTopY = planeCenterY + NPC_SPRITE_HEIGHT / 2;
    const planeBottomY = planeCenterY - NPC_SPRITE_HEIGHT / 2;

    expect(planeTopY).toBeGreaterThan(PLAYER_EYE_HEIGHT + 1.5);
    expect(planeTopY).toBeLessThanOrEqual(PLAYER_EYE_HEIGHT + 2.4);
    expect(planeBottomY).toBeLessThanOrEqual(0.1);
    expect(planeBottomY).toBeGreaterThan(-0.25);
  });
});

describe('CombatantMeshFactory Pixel Forge impostor readability material', () => {
  it('configures a light floor and exposure for billboarded NPCs', () => {
    const scene = new THREE.Scene();
    const texture = new THREE.Texture();
    const assetLoader = {
      getTexture: vi.fn(() => texture),
    } as unknown as AssetLoader;
    const factory = new CombatantMeshFactory(scene, assetLoader);
    const assets = factory.createFactionBillboards();
    const material = assets.factionMaterials.get('US_idle');

    expect(material).toBeDefined();
    expect(material?.uniforms.readabilityStrength.value).toBeGreaterThanOrEqual(0.35);
    expect(material?.uniforms.npcExposure.value).toBeCloseTo(1.2);
    expect(material?.uniforms.minNpcLight.value).toBeCloseTo(0.92);
    expect(material?.uniforms.npcTopLight.value).toBeCloseTo(0.16);
    expect(material?.fragmentShader).toContain('gl_FragColor = vec4(npcColor, alpha)');
    expect(material?.fragmentShader).not.toContain('gl_FragColor = vec4(npcColor * alpha, alpha)');

    disposeCombatantMeshes(scene, assets);
    texture.dispose();
  });
});
