import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_MESH_BUCKET_CAPACITY,
  MOUNTED_MESH_BUCKET_CAPACITY,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_WIDTH,
  reportBucketOverflow,
  resetBucketOverflowState,
} from './CombatantMeshFactory';
import { PLAYER_EYE_HEIGHT } from '../player/PlayerMovement';
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
    reportBucketOverflow('US_walking_front', 0);

    // The first overflow in a fresh state must produce an observable warning.
    expect(warnSpy).toHaveBeenCalled();
    const firstCall = warnSpy.mock.calls[0];
    expect(firstCall[0]).toBe('combat-renderer');
    expect(firstCall[1]).toContain('US_walking_front');
  });

  it('coalesces rapid overflows into one warning per bucket per second', () => {
    // Simulate many overflows inside a single second — the log must be rate-limited.
    for (let i = 0; i < 50; i++) {
      reportBucketOverflow('NVA_walking_side', i);
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('emits a second warning once the rate-limit window has elapsed', () => {
    reportBucketOverflow('VC_firing_front', 0);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Within the same second: suppressed.
    reportBucketOverflow('VC_firing_front', 500);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // After the 1s window elapses: a new warning can fire.
    reportBucketOverflow('VC_firing_front', 1500);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('tracks overflow counts independently per bucket', () => {
    reportBucketOverflow('US_walking_front', 0);
    reportBucketOverflow('NVA_firing_back', 0);

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
 * eye height is the closest on-screen anchor for relative scale; if the sprite
 * height is more than ~2.5x eye height the player feels undersized (playtest
 * observation in docs/tasks/perf-harness-verticality-and-sizing.md).
 *
 * These tests do not pin exact sprite/eye dimensions — tuning is allowed — but
 * pin the RATIO that determines the "player feels appropriately sized" gameplay
 * contract. Any future change that pushes the ratio back past 2.5 must update
 * these thresholds deliberately.
 */
describe('CombatantMeshFactory sizing contract (player vs. NPC)', () => {
  it('sprite silhouette is not taller than the regression ceiling relative to the player eye', () => {
    // Ratio floor comes from live playtest: 3.5:1 (5m eye-height? no — 7m sprite
    // over 2m eye = 3.5) feels giant. Keep strictly below 2.5.
    const ratio = NPC_SPRITE_HEIGHT / PLAYER_EYE_HEIGHT;
    expect(ratio).toBeLessThan(2.5);
  });

  it('sprite dimensions are positive and plausible', () => {
    // Guard against zeroed or inverted geometry: a 0-height plane is invisible.
    expect(NPC_SPRITE_WIDTH).toBeGreaterThan(0);
    expect(NPC_SPRITE_HEIGHT).toBeGreaterThan(0);
    // Height-wider-than-wide (portrait) — a landscape billboard would be a bug.
    expect(NPC_SPRITE_HEIGHT).toBeGreaterThan(NPC_SPRITE_WIDTH);
  });

  it('player eye height does not drop below the floor that keeps NPCs from feeling huge', () => {
    // 2.2m is the playtest-validated tall-adult eye. Dropping below 2m re-enters
    // the "player feels small" regression; keep a floor at 2m.
    expect(PLAYER_EYE_HEIGHT).toBeGreaterThanOrEqual(2);
  });
});
