// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { VegetationGroundCardArchetype } from '../../config/vegetation/groundCardArchetypes';
import type {
  GroundCardBatch,
  GroundCardCellResidency,
  GroundCardModelLoader,
  GroundCardPlacement,
} from './GroundCardScatterer';

/**
 * Near-mesh promotion tier for GroundCardScatterer.
 *
 * Promotes the closest plants (within each species' meshFarEdge) to their real
 * GLB mesh, up to a global cap, and demotes those that walk back out past a
 * hysteresis band so the GLB loader does not thrash. The matching far-tier card
 * instance is hidden while a near mesh is shown (no double-draw) and restored on
 * demotion.
 *
 * The tier READS the scatterer's live residency map (never mutates it) and owns
 * only its own near-mesh bookkeeping: the promoted-mesh registry, the in-flight
 * promotion guard, and the load counter. The scatterer drives it via refresh()
 * (every frame), evictCell() (when a cell streams out), and the debug getters.
 */
interface NearMeshEntry {
  object: THREE.Object3D;
  cellKey: string;
  slug: string;
  index: number;
  generation: number;
}

interface NearMeshCandidate {
  key: string;
  cellKey: string;
  batch: GroundCardBatch;
  index: number;
  dSq: number;
}

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

export interface GroundCardNearMeshTierDeps {
  scene: THREE.Object3D;
  modelLoader: GroundCardModelLoader;
  /** Ground-card archetypes keyed by slug; the near mesh path comes from here. */
  archetypes: Readonly<Record<string, VegetationGroundCardArchetype>>;
  /** World cell size (m); constant for the scatterer's lifetime. */
  cellSize: number;
  /** Cap on concurrently-promoted near GLB meshes. <= 0 disables the tier. */
  maxNearMeshes: number;
  /** Live residency map owned by the scatterer; the tier reads it, never mutates. */
  activeCells: ReadonlyMap<string, GroundCardCellResidency>;
}

export class GroundCardNearMeshTier {
  private readonly deps: GroundCardNearMeshTierDeps;

  private readonly nearMeshes = new Map<string, NearMeshEntry>();
  private readonly promoting = new Set<string>();
  private inFlightNearLoads = 0;

  constructor(deps: GroundCardNearMeshTierDeps) {
    this.deps = deps;
  }

  /** Number of plants currently promoted to a real GLB near mesh. */
  get activeCount(): number {
    return this.nearMeshes.size;
  }

  /** In-flight near-mesh GLB loads (promoted but not yet placed/restored). */
  get inFlightLoadCount(): number {
    return this.inFlightNearLoads;
  }

  /** Demote + dispose any near meshes that belong to an evicted/regenerated cell. */
  evictCell(cellKey: string): void {
    for (const [nearKey, entry] of [...this.nearMeshes]) {
      if (entry.cellKey !== cellKey) continue;
      this.deps.modelLoader.disposeInstance(entry.object);
      this.nearMeshes.delete(nearKey);
    }
  }

  /**
   * Promote the closest plants (within meshFarEdge) to real GLB meshes, up to the global
   * cap, and demote those that walked out past the hysteresis band. Hidden card instances
   * are restored on demotion so the far tier stays whole.
   */
  refresh(player: THREE.Vector3): void {
    if (this.deps.maxNearMeshes <= 0) return;

    // 1. Demote near meshes that fell out of band (cell still resident; stale cells were
    //    already cleaned by evictCell).
    for (const [nearKey, entry] of [...this.nearMeshes]) {
      const residency = this.deps.activeCells.get(entry.cellKey);
      if (!residency || residency.generation !== entry.generation) {
        this.deps.modelLoader.disposeInstance(entry.object);
        this.nearMeshes.delete(nearKey);
        continue;
      }
      const batch = residency.batches.find((b) => b.slug === entry.slug);
      if (!batch) {
        this.deps.modelLoader.disposeInstance(entry.object);
        this.nearMeshes.delete(nearKey);
        continue;
      }
      const p = batch.placements[entry.index];
      const dSq = distSqXZ(player, p.x, p.z);
      if (dSq > batch.meshDemoteSq) {
        this.deps.modelLoader.disposeInstance(entry.object);
        this.nearMeshes.delete(nearKey);
        this.setInstanceHidden(batch, entry.index, false);
      }
    }

    // 2. Gather promotion candidates within meshFarEdge from cells near the player.
    const capacity = this.deps.maxNearMeshes - this.nearMeshes.size - this.promoting.size;
    if (capacity <= 0) return;

    const candidates: NearMeshCandidate[] = [];
    for (const [cellKey, residency] of this.deps.activeCells) {
      if (residency.empty) continue;
      for (const batch of residency.batches) {
        // Quick reject: nearest cell point already beyond this species' near edge.
        const minX = residency.cellX * this.deps.cellSize;
        const minZ = residency.cellZ * this.deps.cellSize;
        const nx = clamp(player.x, minX, minX + this.deps.cellSize);
        const nz = clamp(player.z, minZ, minZ + this.deps.cellSize);
        if (distSqXZ(player, nx, nz) > batch.meshFarEdgeSq) continue;

        for (let i = 0; i < batch.placements.length; i++) {
          if (batch.hidden.has(i)) continue; // already promoted
          const p = batch.placements[i];
          const dSq = distSqXZ(player, p.x, p.z);
          if (dSq > batch.meshFarEdgeSq) continue;
          const candKey = `${cellKey}|${batch.slug}|${i}`;
          if (this.promoting.has(candKey)) continue;
          candidates.push({ key: candKey, cellKey, batch, index: i, dSq });
        }
      }
    }
    if (candidates.length === 0) return;

    candidates.sort((a, b) => a.dSq - b.dSq);
    const promoteCount = Math.min(capacity, candidates.length);
    for (let i = 0; i < promoteCount; i++) {
      this.promoteNearMesh(candidates[i].cellKey, candidates[i].batch, candidates[i].index, candidates[i].key);
    }
  }

  private promoteNearMesh(cellKey: string, batch: GroundCardBatch, index: number, candKey: string): void {
    const residency = this.deps.activeCells.get(cellKey);
    if (!residency) return;
    const archetype = this.deps.archetypes[batch.slug];
    if (!archetype) return;
    const placement = batch.placements[index];
    const generationAtLoad = residency.generation;

    // Hide the card instance immediately so there is no double-draw while the GLB loads.
    this.setInstanceHidden(batch, index, true);
    this.promoting.add(candKey);
    this.inFlightNearLoads++;

    this.deps.modelLoader
      .loadModelFromUrl(archetype.meshPath)
      .then((object) => {
        this.onNearMeshLoaded(cellKey, generationAtLoad, batch, index, candKey, placement, object);
      })
      .catch(() => {
        // Loader logs the failure; restore the card so the spot is not left bare.
        const current = this.deps.activeCells.get(cellKey);
        if (current && current.generation === generationAtLoad) {
          this.setInstanceHidden(batch, index, false);
        }
      })
      .finally(() => {
        this.inFlightNearLoads--;
        this.promoting.delete(candKey);
      });
  }

  private onNearMeshLoaded(
    cellKey: string,
    generationAtLoad: number,
    batch: GroundCardBatch,
    index: number,
    candKey: string,
    placement: GroundCardPlacement,
    object: THREE.Group,
  ): void {
    const residency = this.deps.activeCells.get(cellKey);
    // Cell evicted/regenerated while loading, or the card was already restored: discard.
    if (!residency || residency.generation !== generationAtLoad || !batch.hidden.has(index)) {
      this.deps.modelLoader.disposeInstance(object);
      if (residency && residency.generation === generationAtLoad) {
        this.setInstanceHidden(batch, index, false);
      }
      return;
    }

    // GLB is pre-normalized (Y-up, ground-center pivot): place at terrain height directly.
    object.position.set(placement.x, placement.height, placement.z);
    object.rotation.y = placement.yaw;
    object.scale.setScalar(placement.scale);
    object.updateMatrixWorld(true);
    this.deps.scene.add(object);

    this.nearMeshes.set(candKey, {
      object,
      cellKey,
      slug: batch.slug,
      index,
      generation: generationAtLoad,
    });
  }

  private setInstanceHidden(batch: GroundCardBatch, index: number, hidden: boolean): void {
    if (hidden) {
      if (batch.hidden.has(index)) return;
      batch.mesh.setMatrixAt(index, HIDDEN_MATRIX);
      batch.hidden.add(index);
    } else {
      if (!batch.hidden.has(index)) return;
      batch.mesh.setMatrixAt(index, batch.baseMatrices[index]);
      batch.hidden.delete(index);
    }
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
}

// --- helpers --------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function distSqXZ(player: THREE.Vector3, x: number, z: number): number {
  const dx = player.x - x;
  const dz = player.z - z;
  return dx * dx + dz * dz;
}
