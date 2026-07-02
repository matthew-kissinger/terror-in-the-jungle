// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Near-field vegetation shadow proxies (`shadow-single-map-truth`, middle-path
 * add). The GPU billboard vegetation renders as ONE custom-vertex-expanded mesh
 * per type with `frustumCulled = false` and no `castShadow` — three.js cannot
 * derive a correct shadow depth pass from that custom vertex transform, so
 * foliage cast ZERO shadow. Rather than reshade the billboard material (owned by
 * the sibling task), this class casts cheap DEPTH-ONLY proxy quads for only the
 * nearest N billboards within a small radius — the same footprint the single
 * shadow map covers (<= ~70m), so the cost is bounded and the far field is
 * unaffected.
 *
 * The proxy geometry is a two-quad cross so it presents area to the light at any
 * azimuth without per-frame yaw work. The proxy material writes NEITHER color nor
 * depth in the beauty pass (`colorWrite=false`, `depthWrite=false`) so the quads
 * are invisible and never occlude — they exist only to feed the shadow depth
 * pass (`castShadow = true`). Kill-switch is checked by the caller
 * (`GPUBillboardSystem`) via `ShadowTruthConfig.billboardProxies`.
 */

/** Max proxy instances live at once — bounds both the draw and the per-frame scan cost. */
export const NEAR_FIELD_PROXY_CAPACITY = 96;

/** Radius (metres) around the player within which a billboard gets a proxy caster. */
export const NEAR_FIELD_PROXY_RADIUS = 68;

const NEAR_FIELD_PROXY_RADIUS_SQ = NEAR_FIELD_PROXY_RADIUS * NEAR_FIELD_PROXY_RADIUS;

/**
 * One candidate billboard to consider for a proxy this frame: world position +
 * the billboard's half-width / height so the proxy quad matches its silhouette.
 */
export interface ProxyCandidateSource {
  /** Packed instance positions `[x,y,z, x,y,z, ...]` (the billboard buffer). */
  positions: Float32Array;
  /** Packed per-instance scale `[sx,sy, sx,sy, ...]`; a slot with sx==0 is freed. */
  scales: Float32Array;
  /** Number of reserved slots to scan (the buffer high-water mark). */
  count: number;
  /** Billboard card base width (metres); multiplied by the instance scale-X. */
  cardWidth: number;
  /** Billboard card base height (metres); multiplied by the instance scale-Y. */
  cardHeight: number;
}

export class NearFieldShadowProxies {
  private readonly mesh: THREE.InstancedMesh;
  private readonly scene: THREE.Scene;
  private readonly scratch = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private live = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Two unit quads crossed at 90deg → a "+" footprint. Built at unit size and
    // scaled per instance to the candidate card dimensions.
    const geometry = NearFieldShadowProxies.buildCrossGeometry();

    // Depth-only: invisible in the beauty pass, no depth occlusion, still casts.
    const material = new THREE.MeshBasicMaterial();
    material.colorWrite = false;
    material.depthWrite = false;

    this.mesh = new THREE.InstancedMesh(geometry, material, NEAR_FIELD_PROXY_CAPACITY);
    this.mesh.name = 'near-field-shadow-proxies';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
  }

  private static buildCrossGeometry(): THREE.BufferGeometry {
    // Unit plane centered on X, standing up in Y (base at y=0, top at y=1).
    const planeA = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const planeB = planeA.clone().rotateY(Math.PI / 2);
    // Merge by concatenating — small, one-time; avoids a BufferGeometryUtils dep.
    const merged = new THREE.BufferGeometry();
    const a = planeA.getAttribute('position') as THREE.BufferAttribute;
    const b = planeB.getAttribute('position') as THREE.BufferAttribute;
    const positions = new Float32Array(a.count * 3 + b.count * 3);
    positions.set(a.array as Float32Array, 0);
    positions.set(b.array as Float32Array, a.count * 3);
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const ia = planeA.getIndex()!;
    const ib = planeB.getIndex()!;
    const indices = new Uint16Array(ia.count + ib.count);
    for (let i = 0; i < ia.count; i++) indices[i] = ia.getX(i);
    for (let i = 0; i < ib.count; i++) indices[ia.count + i] = ib.getX(i) + a.count;
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
    planeA.dispose();
    planeB.dispose();
    return merged;
  }

  /**
   * Rebuild the proxy set from the current near-field billboards. Selects up to
   * {@link NEAR_FIELD_PROXY_CAPACITY} instances within {@link NEAR_FIELD_PROXY_RADIUS}
   * of the player across all candidate sources. Simple first-fit selection (no
   * sort) keeps the scan O(instances) and allocation-free on the hot path — a
   * bounded, best-effort near ring, not a strict nearest-K.
   */
  rebuild(sources: readonly ProxyCandidateSource[], player: THREE.Vector3): void {
    let write = 0;
    const px = player.x;
    const pz = player.z;

    for (const src of sources) {
      if (write >= NEAR_FIELD_PROXY_CAPACITY) break;
      const { positions, scales, count, cardWidth, cardHeight } = src;
      for (let i = 0; i < count; i++) {
        if (write >= NEAR_FIELD_PROXY_CAPACITY) break;
        // Freed slots zero their scale — skip them (their position is stale).
        const sx = scales[i * 2];
        if (sx === 0) continue;
        const i3 = i * 3;
        const x = positions[i3];
        const y = positions[i3 + 1];
        const z = positions[i3 + 2];
        const dx = x - px;
        const dz = z - pz;
        if (dx * dx + dz * dz > NEAR_FIELD_PROXY_RADIUS_SQ) continue;

        const sy = scales[i * 2 + 1];
        this.pos.set(x, y, z);
        this.scale.set(cardWidth * sx, cardHeight * sy, cardWidth * sx);
        this.scratch.compose(this.pos, this.quat, this.scale);
        this.mesh.setMatrixAt(write, this.scratch);
        write++;
      }
    }

    this.live = write;
    this.mesh.count = write;
    if (write > 0) this.mesh.instanceMatrix.needsUpdate = true;
    // Hide entirely when empty so the shadow pass skips it.
    this.mesh.visible = write > 0;
  }

  /** Clear all proxies (e.g. when the kill-switch flips OFF). */
  clear(): void {
    this.live = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** Number of live proxy casters this frame — read-only debug surface. */
  getLiveCount(): number {
    return this.live;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
