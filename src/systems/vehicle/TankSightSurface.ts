// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { TankGunnerPanel } from '../../ui/hud/TankGunnerPanel';
import type { PlayerInput } from '../player/PlayerInput';

/**
 * Gunner sight surface shared state: magnification + the FJ gunner panel
 * lifecycle (tank-sight-prod-wiring). Extracted from the crew adapter so
 * `TankPlayerAdapter` stays under the source budget and the standalone
 * `TankGunnerAdapter` can converge on the same surface in a follow-up.
 *
 * The owning adapter supplies live gun/turret reads through `source`; this
 * class owns only presentation state (zoom step, panel mount). Headless-safe:
 * with no host injected the panel is never constructed.
 */

// ── Sight magnification (RMB toggle: 1x ↔ zoom) ──
export const SIGHT_FOV_1X = 50; // degrees — unmagnified gunner sight
export const SIGHT_FOV_ZOOM = 18; // degrees — one zoomed optical step
export const SIGHT_MAG_1X = 1.0;
export const SIGHT_MAG_ZOOM = SIGHT_FOV_1X / SIGHT_FOV_ZOOM; // ~2.8x effective magnification
const RMB_BUTTON = 2; // DOM MouseEvent.button code for the right mouse button

export interface TankSightSource {
  /** Turret yaw (radians) relative to hull, for the azimuth dial. */
  getTurretYaw(): number;
  /** Reload completion 0..1 (1 = loaded / READY), from the FIRE gate. */
  getReloadProgress01(): number;
}

export class TankSightSurface {
  private zoomed = false;
  private prevRmbDown = false;
  private panel: TankGunnerPanel | null = null;
  private panelHost: HTMLElement | null = null;
  private active = false;

  constructor(private readonly source: TankSightSource) {}

  /**
   * Inject (or clear with `null`) the DOM host the panel mounts into. The
   * composer's session-enter hook fires AFTER the adapter's `onEnter`, so a
   * late host mounts immediately when the sight is already active.
   */
  setHost(host: HTMLElement | null): void {
    this.panelHost = host;
    if (!host) {
      this.unmountPanel();
      return;
    }
    if (this.active) this.mountPanel();
  }

  /** Entering the gunner seat: reset to 1x and mount the panel. */
  activate(): void {
    this.active = true;
    this.resetZoom();
    this.mountPanel();
  }

  /** Leaving the gunner seat (swap or dismount): tear the panel down. */
  deactivate(): void {
    this.active = false;
    this.resetZoom();
    this.unmountPanel();
  }

  resetZoom(): void {
    this.zoomed = false;
    this.prevRmbDown = false;
  }

  /**
   * RMB toggles the sight between 1x and the zoomed step on a rising edge
   * (press, not hold). Returns true on the frame the step changed so the
   * owner can push the new magnification through its HUD context.
   */
  readZoomToggle(input: PlayerInput): boolean {
    const down = typeof input.isMouseButtonPressed === 'function'
      ? input.isMouseButtonPressed(RMB_BUTTON)
      : false;
    const toggled = down && !this.prevRmbDown;
    if (toggled) this.zoomed = !this.zoomed;
    this.prevRmbDown = down;
    return toggled;
  }

  /** Desired gunner-sight vertical FOV (degrees) for the current zoom step. */
  getSightFov(): number {
    return this.zoomed ? SIGHT_FOV_ZOOM : SIGHT_FOV_1X;
  }

  /** Current sight magnification factor (1 = 1x, >1 = zoomed). */
  getMagnification(): number {
    return this.zoomed ? SIGHT_MAG_ZOOM : SIGHT_MAG_1X;
  }

  isZoomed(): boolean {
    return this.zoomed;
  }

  /**
   * Main-gun fire-gate state for the HUD: derived from the SAME reload gate
   * the fire path enforces (via `source`), so display and gate cannot drift.
   */
  getMainGunState(): 'ready' | 'reloading' {
    return this.source.getReloadProgress01() >= 1 ? 'ready' : 'reloading';
  }

  /** Push the live gun + turret + zoom state into the FJ gunner panel. */
  refreshPanel(): void {
    if (!this.panel?.mounted) return;
    this.panel.setMainGunState(this.getMainGunState());
    this.panel.setReloadProgress(this.source.getReloadProgress01());
    this.panel.setTurretAzimuth(this.source.getTurretYaw());
    this.panel.setMagnification(this.getMagnification());
  }

  private mountPanel(): void {
    if (!this.panelHost) return;
    if (!this.panel) this.panel = new TankGunnerPanel();
    if (!this.panel.mounted) this.panel.mount(this.panelHost);
    this.refreshPanel();
  }

  private unmountPanel(): void {
    if (this.panel?.mounted) this.panel.unmount();
  }
}
