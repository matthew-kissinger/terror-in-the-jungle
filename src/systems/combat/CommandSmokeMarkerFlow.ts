// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameEventBus, type TargetMark } from '../../core/GameEventBus';
import type { AirSupportRadioAssetId } from '../airsupport/AirSupportRadioCatalog';
import type { SmokeMarkerThrowModeEndReason } from '../weapons/SmokeMarkerSystem';
import { SmokeMarkerPrompt } from '../../ui/hud/SmokeMarkerPrompt';

interface CommandSmokeMarkerFlowConfig {
  beginStrikeOnSmoke: (assetId: AirSupportRadioAssetId, mark: TargetMark) => void;
  setSmokeMarkAvailable: (available: boolean) => void;
  consumeActiveSmokeMark: () => void;
  emitVisibility: () => void;
}

export class CommandSmokeMarkerFlow {
  private readonly prompt = new SmokeMarkerPrompt();
  private readonly unsubscribeTargetMarkSet: () => void;
  private pendingAssetId: AirSupportRadioAssetId | null = null;
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
  }

  clearPendingForTopLevelRadio(): void {
    this.clearPending();
  }

  armThrow(assetId: AirSupportRadioAssetId, assetLabel: string): void {
    this.pendingAssetId = assetId;
    this.prompt.show(assetLabel);
  }

  handleThrowModeEnd(reason: SmokeMarkerThrowModeEndReason): void {
    this.prompt.hide();
    if (reason === 'cancelled') this.clearPending();
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
      this.config.setSmokeMarkAvailable(false);
    }
    this.consumeSmokeOnStrikeCommit = false;
  }

  private handleTargetMarkSet(mark: TargetMark): void {
    this.config.setSmokeMarkAvailable(true);
    if (mark.kind !== 'smoke-marker' || !this.pendingAssetId) return;

    const assetId = this.pendingAssetId;
    this.clearPending();
    this.config.beginStrikeOnSmoke(assetId, mark);
  }
}
