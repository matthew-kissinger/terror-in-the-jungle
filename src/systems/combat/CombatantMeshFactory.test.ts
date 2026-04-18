import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_MESH_BUCKET_CAPACITY,
  MOUNTED_MESH_BUCKET_CAPACITY,
  reportBucketOverflow,
  resetBucketOverflowState,
} from './CombatantMeshFactory';
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
