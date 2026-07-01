// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadioDialController — drill navigation + intent resolution shared by both
 * radio presentations. It is DOM-free and view-agnostic: the desktop
 * `RadialDialView` and the touch `RadioBottomSheet` both drive THIS, and it
 * funnels every selection through one `onIntent` callback so squad orders,
 * fire-support call-ins, marking changes, and station tunes all issue through
 * the same `CommandInputManager` wiring the existing radio menu uses.
 *
 * Drill model:
 *   - The dial opens at the CATEGORY level (no category focused).
 *   - Focusing a category drills into its options (inner ring → outer ring on
 *     desktop; a sub-list on the touch sheet).
 *   - Selecting an option resolves it to a `RadioIntent` and emits it. The
 *     owner closes the dial (for one-shot orders/call-ins) or keeps it open
 *     (markings / stations are sticky toggles) — the controller reports which
 *     via the intent's `closesDial` flag so views/owner agree.
 *
 * Cooldown is resolved by support TYPE (see `RadioDialModel`), so cooling-down
 * fire-support options report not-ready and the views grey them out.
 */

import type { AirSupportRadioCooldowns, AirSupportTargetMarking } from '../../../systems/airsupport/AirSupportRadioCatalog';
import {
  buildFireSupportTargetOptions,
  buildRadioCategories,
  isRadioOptionReady,
  type RadioCategory,
  type RadioCategoryId,
  type RadioIntent,
  type RadioOption,
} from './RadioDialModel';
import { getAirSupportRadioAsset, type AirSupportRadioAssetId } from '../../../systems/airsupport/AirSupportRadioCatalog';

/** Whether selecting an option dismisses the dial (one-shot) or keeps it open. */
function intentClosesDial(intent: RadioIntent): boolean {
  // Markings and stations are sticky toggles — the player often flips between
  // them — so they keep the dial open. Squad orders and fire-support call-ins
  // are one-shot actions that dismiss it.
  return intent.kind === 'fire-support' || intent.kind === 'throw-smoke-marker' || intent.kind === 'squad';
}

export class RadioDialController {
  private readonly categories: RadioCategory[] = buildRadioCategories();
  private focusedCategory: RadioCategoryId | null = null;
  private cooldowns: AirSupportRadioCooldowns = {};
  private selectedMarking: AirSupportTargetMarking = 'smoke';
  private selectedStationId: string | null = null;
  private squadAvailable = true;
  private hasSmokeMark = false;
  private pendingFireSupportAssetId: AirSupportRadioAssetId | null = null;

  private onIntent?: (intent: RadioIntent, closesDial: boolean) => void;
  private readonly changeListeners = new Set<() => void>();

  /** The owner (`CommandInputManager`) is the single intent sink. */
  setIntentSink(onIntent: (intent: RadioIntent, closesDial: boolean) => void): void {
    this.onIntent = onIntent;
  }

  /**
   * Views subscribe to re-render on any state change. Multiple views may be
   * bound (only one is shown at a time); the returned disposer unsubscribes.
   */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  getCategories(): ReadonlyArray<RadioCategory> {
    return this.categories;
  }

  getFocusedCategory(): RadioCategory | null {
    if (!this.focusedCategory) return null;
    if (this.focusedCategory === 'fire-support' && this.pendingFireSupportAssetId) {
      const asset = getAirSupportRadioAsset(this.pendingFireSupportAssetId);
      return {
        id: 'fire-support',
        label: asset.label,
        hint: 'Choose how this mission is marked.',
        options: buildFireSupportTargetOptions(this.pendingFireSupportAssetId),
      };
    }
    return this.categories.find((c) => c.id === this.focusedCategory) ?? null;
  }

  getCooldowns(): AirSupportRadioCooldowns {
    return this.cooldowns;
  }

  getSelectedMarking(): AirSupportTargetMarking {
    return this.selectedMarking;
  }

  getSelectedStationId(): string | null {
    return this.selectedStationId;
  }

  /** Reset to the top (category) level — call when the dial opens. */
  reset(): void {
    if (this.focusedCategory === null && this.pendingFireSupportAssetId === null) return;
    this.focusedCategory = null;
    this.pendingFireSupportAssetId = null;
    this.emitChange();
  }

  /** Open directly on the target choices for a specific fire-support asset. */
  focusFireSupportAsset(assetId: AirSupportRadioAssetId): void {
    this.focusedCategory = 'fire-support';
    this.pendingFireSupportAssetId = assetId;
    this.emitChange();
  }

  /** Drill into a category (inner-ring focus / sheet sub-list). */
  focusCategory(categoryId: RadioCategoryId): void {
    if (this.focusedCategory === categoryId) return;
    this.focusedCategory = categoryId;
    this.emitChange();
  }

  /** Drill back out to the category level. */
  clearFocus(): void {
    if (this.pendingFireSupportAssetId) {
      this.pendingFireSupportAssetId = null;
      this.emitChange();
      return;
    }
    if (this.focusedCategory === null) return;
    this.focusedCategory = null;
    this.emitChange();
  }

  setCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    if (cooldownDisplayStateMatches(this.cooldowns, cooldowns)) return;
    this.cooldowns = cooldowns;
    this.emitChange();
  }

  setSelectedMarking(marking: AirSupportTargetMarking): void {
    if (this.selectedMarking === marking) return;
    this.selectedMarking = marking;
    this.emitChange();
  }

  setSelectedStationId(stationId: string | null): void {
    if (this.selectedStationId === stationId) return;
    this.selectedStationId = stationId;
    this.emitChange();
  }

  /** Squad rows render but stay disabled when the player has no squad. */
  setSquadAvailable(available: boolean): void {
    if (this.squadAvailable === available) return;
    this.squadAvailable = available;
    this.emitChange();
  }

  setHasSmokeMark(available: boolean): void {
    if (this.hasSmokeMark === available) return;
    this.hasSmokeMark = available;
    this.emitChange();
  }

  isOptionEnabled(option: RadioOption): boolean {
    if (option.kind === 'squad') return this.squadAvailable;
    if (option.kind === 'fire-support-target' && option.targetMode === 'current-smoke') return this.hasSmokeMark;
    if (option.kind === 'fire-support') return isRadioOptionReady(option, this.cooldowns);
    if (option.kind === 'fire-support-target') return isRadioOptionReady(option, this.cooldowns);
    return true;
  }

  /**
   * Select an option: resolve it to an intent and emit it. No-op when the
   * option is disabled (cooling down / no squad). Marking / station selections
   * update local sticky state before emitting so the views reflect the toggle.
   */
  selectOption(option: RadioOption): void {
    if (!this.isOptionEnabled(option)) return;
    if (option.kind === 'fire-support') {
      this.focusedCategory = 'fire-support';
      this.pendingFireSupportAssetId = option.assetId;
      this.emitChange();
      return;
    }

    const intent = this.resolveIntent(option);
    if (intent.kind === 'station') {
      this.selectedStationId = intent.stationId;
    }

    const closesDial = intentClosesDial(intent);
    this.onIntent?.(intent, closesDial);
    this.emitChange();
  }

  private resolveIntent(option: RadioOption): RadioIntent {
    switch (option.kind) {
      case 'fire-support':
        return { kind: 'fire-support', assetId: option.assetId, marking: this.selectedMarking, targetMode: 'reticle-grid' };
      case 'fire-support-target':
        return option.targetMode === 'throw-smoke-marker'
          ? { kind: 'throw-smoke-marker', assetId: option.assetId }
          : { kind: 'fire-support', assetId: option.assetId, marking: this.selectedMarking, targetMode: option.targetMode };
      case 'squad':
        return { kind: 'squad', slot: option.slot, command: option.command };
      case 'station':
        return { kind: 'station', stationId: option.stationId };
    }
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) listener();
  }
}

function cooldownDisplayStateMatches(
  current: AirSupportRadioCooldowns,
  next: AirSupportRadioCooldowns,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of keys) {
    const assetId = key as keyof AirSupportRadioCooldowns;
    if (cooldownDisplayBucket(current[assetId]) !== cooldownDisplayBucket(next[assetId])) {
      return false;
    }
  }
  return true;
}

function cooldownDisplayBucket(value: number | undefined): number {
  const remaining = Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
  return remaining <= 0 ? 0 : Math.ceil(remaining);
}
