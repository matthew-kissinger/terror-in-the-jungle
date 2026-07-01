// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadioDialPresenter — owns the shared `RadioDialController` plus its two
 * presentations (desktop `RadialDialView`, touch `RadioBottomSheet`) and the
 * open/close + which-view-to-show plumbing. It keeps the dial's UI lifecycle
 * out of `CommandInputManager`, which only supplies the intent sink + the
 * per-open seed (cooldowns, marking, squad availability).
 *
 * Selection of the presentation mirrors the rest of the HUD: touch input mode →
 * bottom-sheet; everything else → radial wheel. Only one view is shown at a time.
 */

import { RadioDialController } from './RadioDialController';
import { RadialDialView } from './RadialDialView';
import { RadioBottomSheet } from './RadioBottomSheet';
import type { AirSupportRadioCooldowns, AirSupportTargetMarking } from '../../../systems/airsupport/AirSupportRadioCatalog';
import type { RadioIntent } from './RadioDialModel';

export class RadioDialPresenter {
  private readonly controller = new RadioDialController();
  private readonly radialView = new RadialDialView();
  private readonly bottomSheet = new RadioBottomSheet();
  private visible = false;
  private touch = false;
  private onClose?: () => void;

  constructor() {
    this.radialView.setCallbacks({ onCloseRequested: () => this.requestClose() });
    this.bottomSheet.setCallbacks({ onCloseRequested: () => this.requestClose() });
    this.radialView.bindController(this.controller);
    this.bottomSheet.bindController(this.controller);
  }

  setCallbacks(callbacks: {
    onIntent: (intent: RadioIntent, closesDial: boolean) => void;
    onCloseRequested: () => void;
  }): void {
    this.controller.setIntentSink(callbacks.onIntent);
    this.onClose = callbacks.onCloseRequested;
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.radialView.getElement());
    parent.appendChild(this.bottomSheet.getElement());
  }

  unmount(): void {
    this.radialView.getElement().remove();
    this.bottomSheet.getElement().remove();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Touch → bottom-sheet, otherwise the radial wheel. Swaps live if open. */
  setTouchMode(touch: boolean): void {
    this.touch = touch;
    if (this.visible) this.showActiveView();
  }

  setCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    this.controller.setCooldowns(cooldowns);
  }

  setSelectedMarking(marking: AirSupportTargetMarking): void {
    this.controller.setSelectedMarking(marking);
  }

  setSelectedStationId(stationId: string | null): void {
    this.controller.setSelectedStationId(stationId);
  }

  setSquadAvailable(available: boolean): void {
    this.controller.setSquadAvailable(available);
  }

  setHasSmokeMark(available: boolean): void {
    this.controller.setHasSmokeMark(available);
  }

  /**
   * Open the dial at the category level, showing the input-appropriate view.
   * Cooldowns are already pushed via `setCooldowns` before this; the seed only
   * carries the active marking + squad availability the owner snapshots on open.
   */
  open(seed: { marking: AirSupportTargetMarking; squadAvailable: boolean }): void {
    this.controller.setSelectedMarking(seed.marking);
    this.controller.setSquadAvailable(seed.squadAvailable);
    this.controller.reset();
    this.visible = true;
    this.showActiveView();
  }

  close(): void {
    this.visible = false;
    this.radialView.setVisible(false);
    this.bottomSheet.setVisible(false);
  }

  dispose(): void {
    this.radialView.dispose();
    this.bottomSheet.dispose();
  }

  private showActiveView(): void {
    this.bottomSheet.setVisible(this.touch);
    this.radialView.setVisible(!this.touch);
  }

  private requestClose(): void {
    this.onClose?.();
  }
}
