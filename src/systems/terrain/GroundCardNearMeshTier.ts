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
 * hysteresis band so the GLB loader does not thrash.
 *
 * Across a `transitionFadeMeters` band just inside meshFarEdge the near GLB mesh
 * cross-fades against the far card instead of hard-popping: the mesh fades in (and
 * the card stays visible underneath) as the player approaches, and fades back out
 * before it is demoted. This mirrors the hero octahedral-impostor path's opacity
 * crossfade so the coconut palm — which uses THIS tier — no longer snaps mesh<->card.
 * The card instance is only fully hidden once the mesh reaches full opacity (no
 * double-draw at rest) and is restored on demotion.
 *
 * The tier READS the scatterer's live residency map (never mutates it) and owns
 * only its own near-mesh bookkeeping: the promoted-mesh registry, the in-flight
 * promotion guard, and the load counter. The scatterer drives it via refresh()
 * (every frame), evictCell() (when a cell streams out), and the debug getters.
 */
interface NearMeshFadeMaterialRecord {
  /** Cloned material whose opacity we drive (the GLB's original is restored on dispose). */
  material: THREE.Material;
  /** Opacity the asset shipped with; the fade scales relative to this so authored alpha survives. */
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthWrite: boolean;
}

interface NearMeshEntry {
  object: THREE.Object3D;
  cellKey: string;
  slug: string;
  index: number;
  generation: number;
  /** Per-mesh fade materials; empty when the fade band is disabled (transitionFadeMeters <= 0). */
  fadeMaterials: NearMeshFadeMaterialRecord[];
  /** Whether the matching card instance is currently hidden (mesh fully opaque). */
  cardHidden: boolean;
}

interface NearMeshCandidate {
  key: string;
  cellKey: string;
  batch: GroundCardBatch;
  index: number;
  dSq: number;
}

/** Opacity split across the mesh<->card transition band. Sums to 1 across the band. */
export interface NearMeshFadeBlend {
  meshOpacity: number;
  cardOpacity: number;
}

/**
 * Default transition-band width (m). Matches the hero octahedral-impostor vegetation path's
 * DEFAULT_VEGETATION_IMPOSTOR_TRANSITION_METERS (28) so the coconut palm — which uses THIS
 * mesh<->card tier — crossfades over the same distance as the hero octa swap.
 */
export const DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS = 28;
const MAX_GROUND_CARD_TRANSITION_FADE_METERS = 80;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Mesh<->card opacity split for a plant at `distance` from the player, given the
 * tier's `meshFarEdge` swap distance and the `fade` band width. Mirrors the hero
 * octahedral-impostor approach: the mesh is fully opaque up to (meshFarEdge - fade),
 * then fades linearly to 0 at meshFarEdge while the card fades complementarily to 1.
 * Allocation-free; pure (exported for the behavior test).
 */
export function computeNearMeshFadeBlend(
  distance: number,
  meshFarEdge: number,
  fade: number,
): NearMeshFadeBlend {
  if (fade <= 0) {
    // Binary switch: full mesh inside the edge, full card outside (legacy behavior).
    const meshOpacity = distance <= meshFarEdge ? 1 : 0;
    return { meshOpacity, cardOpacity: 1 - meshOpacity };
  }
  // 0 at the inner edge of the band, 1 at meshFarEdge.
  const t = clamp((distance - (meshFarEdge - fade)) / fade, 0, 1);
  const meshOpacity = 1 - t;
  return { meshOpacity, cardOpacity: t };
}

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
  /**
   * Width (m) of the mesh<->card crossfade band just inside meshFarEdge. Defaults to
   * {@link DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS}. 0 keeps the legacy hard switch.
   */
  transitionFadeMeters?: number;
}

export class GroundCardNearMeshTier {
  private readonly deps: GroundCardNearMeshTierDeps;
  private readonly transitionFadeMeters: number;

  private readonly nearMeshes = new Map<string, NearMeshEntry>();
  private readonly promoting = new Set<string>();
  private inFlightNearLoads = 0;

  constructor(deps: GroundCardNearMeshTierDeps) {
    this.deps = deps;
    this.transitionFadeMeters = clamp(
      deps.transitionFadeMeters ?? DEFAULT_GROUND_CARD_TRANSITION_FADE_METERS,
      0,
      MAX_GROUND_CARD_TRANSITION_FADE_METERS,
    );
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
      this.disposeEntry(entry);
      this.nearMeshes.delete(nearKey);
    }
  }

  /**
   * Promote the closest plants (within meshFarEdge) to real GLB meshes, up to the global
   * cap, and demote those that walked out past the hysteresis band. Across the transition
   * band the near mesh cross-fades against the (still-visible) card; the card is fully
   * hidden only at full mesh opacity and restored on demotion so the far tier stays whole.
   */
  refresh(player: THREE.Vector3): void {
    if (this.deps.maxNearMeshes <= 0) return;

    // 1. Demote near meshes that fell out of band (cell still resident; stale cells were
    //    already cleaned by evictCell). Live ones get their crossfade opacity driven here.
    for (const [nearKey, entry] of [...this.nearMeshes]) {
      const residency = this.deps.activeCells.get(entry.cellKey);
      if (!residency || residency.generation !== entry.generation) {
        this.disposeEntry(entry);
        this.nearMeshes.delete(nearKey);
        continue;
      }
      const batch = residency.batches.find((b) => b.slug === entry.slug);
      if (!batch) {
        this.disposeEntry(entry);
        this.nearMeshes.delete(nearKey);
        continue;
      }
      const p = batch.placements[entry.index];
      const dSq = distSqXZ(player, p.x, p.z);
      if (dSq > batch.meshDemoteSq) {
        this.disposeEntry(entry);
        this.nearMeshes.delete(nearKey);
        this.setInstanceHidden(batch, entry.index, false);
        continue;
      }
      this.applyCrossfade(entry, batch, Math.sqrt(dSq));
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
          const p = batch.placements[i];
          const dSq = distSqXZ(player, p.x, p.z);
          if (dSq > batch.meshFarEdgeSq) continue;
          const candKey = `${cellKey}|${batch.slug}|${i}`;
          // Skip plants already promoted (live near mesh) or mid-load. In the no-fade path
          // batch.hidden also flags promoted plants; in the fade path the card stays visible,
          // so the nearMeshes/promoting registries are the source of truth.
          if (this.nearMeshes.has(candKey) || this.promoting.has(candKey)) continue;
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

    // With a fade band the card stays visible until the mesh reaches full opacity (the
    // crossfade reveals it through the loading window); with no band keep the legacy
    // hide-immediately behavior so there is no double-draw while the GLB loads.
    if (this.transitionFadeMeters <= 0) {
      this.setInstanceHidden(batch, index, true);
    }
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
    const fading = this.transitionFadeMeters > 0;
    // Cell evicted/regenerated while loading, or (no-fade path) the card was already
    // restored: discard. In the fade path the card is still shown, so only the
    // generation guard applies.
    const stale = !residency
      || residency.generation !== generationAtLoad
      || (!fading && !batch.hidden.has(index));
    if (stale) {
      this.deps.modelLoader.disposeInstance(object);
      if (residency && residency.generation === generationAtLoad && batch.hidden.has(index)) {
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

    const entry: NearMeshEntry = {
      object,
      cellKey,
      slug: batch.slug,
      index,
      generation: generationAtLoad,
      fadeMaterials: fading ? prepareFadeMaterials(object) : [],
      cardHidden: batch.hidden.has(index),
    };
    this.nearMeshes.set(candKey, entry);
    // The crossfade opacity is driven on the next refresh() against the live player
    // distance, so a plant that loads mid-band blends rather than popping to full mesh.
  }

  /**
   * Drive the mesh<->card opacity for a live near mesh at `distance`. Inside the band the
   * mesh material opacity follows computeNearMeshFadeBlend; at full opacity the card is
   * hidden (no double-draw), otherwise it is shown so it reads through the fading mesh.
   */
  private applyCrossfade(entry: NearMeshEntry, batch: GroundCardBatch, distance: number): void {
    if (this.transitionFadeMeters <= 0 || entry.fadeMaterials.length === 0) {
      // No band: keep the legacy invariant (card hidden, mesh opaque).
      if (!entry.cardHidden) {
        this.setInstanceHidden(batch, entry.index, true);
        entry.cardHidden = true;
      }
      return;
    }
    const meshFarEdge = Math.sqrt(batch.meshFarEdgeSq);
    // Never let the band run past the player (inner edge < 0): a species whose near edge is
    // shorter than the default band would otherwise never reach full mesh opacity at the feet.
    const fade = Math.min(this.transitionFadeMeters, meshFarEdge);
    const { meshOpacity } = computeNearMeshFadeBlend(distance, meshFarEdge, fade);
    setFadeMaterialOpacity(entry.fadeMaterials, meshOpacity);

    const shouldHideCard = meshOpacity >= 0.999;
    if (shouldHideCard && !entry.cardHidden) {
      this.setInstanceHidden(batch, entry.index, true);
      entry.cardHidden = true;
    } else if (!shouldHideCard && entry.cardHidden) {
      this.setInstanceHidden(batch, entry.index, false);
      entry.cardHidden = false;
    }
  }

  private disposeEntry(entry: NearMeshEntry): void {
    restoreFadeMaterials(entry.fadeMaterials);
    entry.fadeMaterials.length = 0;
    this.deps.modelLoader.disposeInstance(entry.object);
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

/**
 * Clone the loaded GLB's materials so we can drive their opacity without mutating the
 * shared source material (the loader may cache/reuse it). Mirrors the hero impostor path's
 * prepareStaticImpostorFadeMaterials. Returns one record per (mesh, material slot).
 */
function prepareFadeMaterials(root: THREE.Object3D): NearMeshFadeMaterialRecord[] {
  const records: NearMeshFadeMaterialRecord[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const original = child.material;
    const originalArray = Array.isArray(original) ? original : [original];
    const cloned = originalArray.map((m) => m.clone());
    child.material = Array.isArray(original) ? cloned : cloned[0];
    for (const material of cloned) {
      records.push({
        material,
        baseOpacity: material.opacity,
        baseTransparent: material.transparent,
        baseDepthWrite: material.depthWrite,
      });
    }
  });
  return records;
}

function setFadeMaterialOpacity(records: readonly NearMeshFadeMaterialRecord[], opacity: number): void {
  const fade = clamp(opacity, 0, 1);
  const opaque = fade >= 0.999;
  for (const record of records) {
    record.material.opacity = record.baseOpacity * fade;
    record.material.transparent = opaque ? record.baseTransparent : true;
    record.material.depthWrite = opaque ? record.baseDepthWrite : false;
  }
}

function restoreFadeMaterials(records: readonly NearMeshFadeMaterialRecord[]): void {
  for (const record of records) {
    record.material.dispose();
  }
}
