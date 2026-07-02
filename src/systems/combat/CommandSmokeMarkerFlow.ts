// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameEventBus, type TargetMark } from '../../core/GameEventBus';
import type { AirSupportRadioAssetId } from '../airsupport/AirSupportRadioCatalog';
import type { SmokeMarkerThrowModeEndReason } from '../weapons/SmokeMarkerSystem';
import { SmokeMarkerPrompt } from '../../ui/hud/SmokeMarkerPrompt';

interface CommandSmokeMarkerFlowConfig {
  beginStrikeOnSmoke: (assetId: AirSupportRadioAssetId, mark: TargetMark) => void;
  consumeActiveSmokeMark: () => void;
  emitVisibility: () => void;
}

export class CommandSmokeMarkerFlow {
  private readonly prompt = new SmokeMarkerPrompt();
  private readonly unsubscribeTargetMarkSet: () => void;
  private pendingAssetId: AirSupportRadioAssetId | null = null;
  private pendingAssetLabel = '';
  private consumeSmokeOnStrikeCommit = false;

  constructor(private readonly config: CommandSmokeMarkerFlowConfig) {
    this.unsubscribeTargetMarkSet = GameEventBus.subscribe('target_mark_set', ({ mark }) => this.handleTargetMarkSet(mark));
  }

  mount(parent: HTMLElement): void {
    this.prompt.mount(parent);
  }

  unmount(): void {
    this.prompt.unmount();
  }

  dispose(): void {
    this.unsubscribeTargetMarkSet();
    this.prompt.dispose();
  }

  getPendingAssetId(): AirSupportRadioAssetId | null {
    return this.pendingAssetId;
  }

  clearPending(): void {
    this.pendingAssetId = null;
    this.pendingAssetLabel = '';
  }

  clearPendingForTopLevelRadio(): void {
    this.clearPending();
  }

  /**
   * Hard reset on player death: drop any pending marker mission AND hide the
   * prompt. Covers the airborne "MARKER OUT" window where the canister is still
   * settling — cancelling the in-hand throw is a no-op then, so a pending strike
   * would otherwise fire from beyond the grave once the smoke registers.
   */
  forceClearPending(): void {
    this.clearPending();
    this.consumeSmokeOnStrikeCommit = false;
    this.prompt.hide();
  }

  armThrow(assetId: AirSupportRadioAssetId, assetLabel: string): void {
    this.pendingAssetId = assetId;
    this.pendingAssetLabel = assetLabel;
    this.prompt.show(assetLabel);
  }

  handleThrowModeEnd(reason: SmokeMarkerThrowModeEndReason): void {
    // On release, hold a "MARKER OUT — waiting for smoke" cue through the 1-3 s
    // of canister flight so the pending mission stays on screen until the smoke
    // registers (target_mark_set) and the designation banner takes over. A
    // cancel just clears everything.
    if (reason === 'thrown' && this.pendingAssetId) {
      this.prompt.showMarkerOut(this.pendingAssetLabel);
    } else {
      this.prompt.hide();
      if (reason === 'cancelled') this.clearPending();
    }
    this.config.emitVisibility();
  }

  setConsumeActiveSmokeOnCommit(consume: boolean): void {
    this.consumeSmokeOnStrikeCommit = consume;
  }

  cancelPendingStrikeCommit(): void {
    this.consumeSmokeOnStrikeCommit = false;
  }

  handleStrikeCommitted(): void {
    if (this.consumeSmokeOnStrikeCommit) {
      this.config.consumeActiveSmokeMark();
    }
    this.consumeSmokeOnStrikeCommit = false;
  }

  private handleTargetMarkSet(mark: TargetMark): void {
    if (mark.kind !== 'smoke-marker' || !this.pendingAssetId) return;

    // The marker landed: drop the MARKER OUT cue and hand off to the strike
    // designation banner.
    this.prompt.hide();
    const assetId = this.pendingAssetId;
    this.clearPending();
    this.config.beginStrikeOnSmoke(assetId, mark);
  }
}
