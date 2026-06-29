// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { colors, fontStack, zIndex } from '../design/tokens';
import type { ActorMode, VehicleUIContext } from '../layout/types';

/**
 * HudControlHints — persistent, context-sensitive control legend.
 *
 * Closes the "the game does more than it shows" finding: control hints used to
 * live only in a console log (PlayerInput.showControls) and the pre-game
 * Settings modal, so players never learned that planes fire, seats swap, or the
 * radio / squad menus exist. This element pins a compact, low-opacity legend to
 * an UNUSED HUD edge (right edge, vertically centred — not bottom-left, which is
 * health/attribution; not the corners owned by minimap / kill-feed / ammo) and
 * swaps the listed binds with what the player is doing.
 *
 * Design goals:
 *  - Small and composable. `seat-and-fire-cues` (Phase 1) and
 *    `situation-readout-hud` (Phase 6) share this surface, so the public API is
 *    deliberately tiny: `mount`, `setContext` / `setContextForActor`, `toggle`,
 *    `setVisible`, `isShown`, `dispose`. The actor→context mapping lives here so
 *    HUDSystem just forwards its existing `ActorMode` at each transition.
 *  - Single source of truth for bind text. The strings come from CONTEXT_BINDS
 *    below, which mirror PlayerInput.showControls / SettingsModal's controls
 *    reference. They are NOT re-typed per call site, so they can't drift
 *    independently across the HUD.
 *  - Self-contained styling + persistence. The element injects its own <style>
 *    and stores the on/off preference under its own localStorage key, so it does
 *    not need to touch the shared grid layout or the global SettingsManager.
 */

/** The control context the legend renders binds for. */
export type ControlHintContext = 'foot' | 'groundVehicle' | 'aircraft';

/**
 * The seat the player currently occupies in a multi-crew / armed craft, plus
 * which seat-specific cues apply. Surfaced above the bind list so the player
 * always knows which station they hold, that `F` swaps seats when a second one
 * exists, and that `LMB` fires when the seat is armed.
 *
 * Closes the AC-47 finding: the owner boarded the gunship, assumed he was a
 * gunner who couldn't fire, never found the pilot, and couldn't tell `F` swaps
 * seats — because nothing on the HUD named the seat or its actions.
 */
export interface SeatHint {
  /** Human label for the current station (e.g. `PILOT`, `GUNNER`, `DRIVER`). */
  readonly label: string;
  /** A second enterable seat exists on this craft, swappable with `F`. */
  readonly hasSecondSeat: boolean;
  /** This seat can pull the trigger (`LMB`). */
  readonly armed: boolean;
  /**
   * Optional extra line clarifying a craft-specific control — used for the
   * AC-47 to spell out that the player IS the pilot and RMB is the broadside
   * gun camera.
   */
  readonly note?: string;
}

/** A single legend row: a key/button label and what it does. */
interface ControlHint {
  readonly keys: string;
  readonly action: string;
}

interface ContextLegend {
  readonly title: string;
  readonly hints: readonly ControlHint[];
}

/**
 * Canonical bind table. Mirrors the bind strings in
 * `PlayerInput.showControls()` and `SettingsModal.buildControlsSection()` —
 * keep these three in sync when a keybind label changes. The point of this
 * element is to surface them live; the table stays the single in-HUD source so
 * callers never hardcode their own copy.
 */
const CONTEXT_BINDS: Record<ControlHintContext, ContextLegend> = {
  foot: {
    title: 'ON FOOT',
    hints: [
      { keys: 'WASD', action: 'Move' },
      { keys: 'Shift', action: 'Sprint' },
      { keys: 'Space', action: 'Jump' },
      { keys: 'LMB / RMB', action: 'Fire / ADS' },
      { keys: 'R', action: 'Reload' },
      { keys: '1-6', action: 'Weapons' },
      { keys: 'G', action: 'Grenade' },
      { keys: 'F', action: 'Board vehicle' },
      { keys: 'T', action: 'Air support radio' },
      { keys: 'Z', action: 'Squad commands' },
      { keys: 'Shift+1-5', action: 'Quick commands' },
      { keys: 'TAB', action: 'Scoreboard' },
    ],
  },
  groundVehicle: {
    title: 'GROUND VEHICLE',
    hints: [
      { keys: 'W/S', action: 'Throttle' },
      { keys: 'A/D', action: 'Steer' },
      { keys: 'LMB', action: 'Fire (if armed)' },
      { keys: 'RMB', action: 'Free look' },
      // E exits any seated ground/tracked vehicle (mirrors the aircraft exit
      // key); F swaps the driver<->gunner seat on craft with a second seat
      // (tank). They are split because on a two-seat tank F always swaps, so
      // a conflated "F: exit / swap" left the dismount unreachable.
      { keys: 'E', action: 'Exit vehicle' },
      { keys: 'F', action: 'Swap seat' },
      { keys: 'T', action: 'Air support radio' },
      { keys: 'TAB', action: 'Scoreboard' },
    ],
  },
  aircraft: {
    title: 'AIRCRAFT',
    hints: [
      { keys: 'W/S', action: 'Throttle / Altitude' },
      { keys: 'A/D', action: 'Rudder / Yaw' },
      { keys: 'Arrows', action: 'Pitch / Roll' },
      { keys: 'LMB', action: 'Fire guns' },
      { keys: 'Space', action: 'Flight assist' },
      { keys: 'Right Ctrl', action: 'Mouse flight toggle' },
      { keys: 'V', action: 'AC-47 side / chase view' },
      { keys: 'E', action: 'Exit aircraft' },
      { keys: 'G', action: 'Deploy squad' },
      { keys: 'T', action: 'Air support radio' },
    ],
  },
};

/**
 * Default key that toggles the legend. Display-only here: the element listens
 * for it on `document` while mounted. PlayerInput is intentionally untouched.
 */
const DEFAULT_TOGGLE_KEY = 'KeyH';

/** Persisted on/off preference. Default-on (absent value reads as visible). */
const STORAGE_KEY = 'tij.hud.controlHints.visible';

const STYLE_ID = 'hud-control-hints-styles';

/** Value-equality for two seat hints so `setSeatHint` is idempotent. */
function seatHintEquals(a: SeatHint | null, b: SeatHint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.label === b.label &&
    a.hasSecondSeat === b.hasSecondSeat &&
    a.armed === b.armed &&
    a.note === b.note
  );
}

export interface HudControlHintsOptions {
  /**
   * KeyboardEvent.code that toggles the legend (default `KeyH`). When the
   * element is mounted it binds a `document` keydown listener for this code.
   * Pass `null` to disable the built-in key (e.g. when a host owns the bind).
   */
  toggleKeyCode?: string | null;
  /**
   * When true (default), the legend is hidden on coarse-pointer / touch devices
   * where on-screen buttons already carry the controls. The check is read at
   * mount time from the host (HUDSystem passes its device state).
   */
  hideOnTouch?: boolean;
}

export class HudControlHints {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly seatEl: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly toggleKeyCode: string | null;
  private readonly hideOnTouch: boolean;

  private context: ControlHintContext = 'foot';
  private seat: SeatHint | null = null;
  /** User preference (toggle). Combined with `suppressed` to decide rendering. */
  private enabled: boolean;
  /** Host-driven suppression (touch device / reduced clutter). */
  private suppressed = false;
  private mounted = false;
  private keydownHandler?: (event: KeyboardEvent) => void;

  constructor(options: HudControlHintsOptions = {}) {
    this.toggleKeyCode = options.toggleKeyCode === undefined ? DEFAULT_TOGGLE_KEY : options.toggleKeyCode;
    this.hideOnTouch = options.hideOnTouch ?? true;
    this.enabled = this.loadEnabled();

    this.root = document.createElement('div');
    this.root.className = 'hud-control-hints';
    this.root.setAttribute('role', 'note');
    this.root.setAttribute('aria-label', 'Control hints');

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'hud-control-hints__title';
    this.root.appendChild(this.titleEl);

    // Seat block sits between the title and the bind list. Empty + hidden until
    // a multi-crew / armed craft pushes a SeatHint, so on-foot and single-seat
    // vehicles render exactly as before.
    this.seatEl = document.createElement('div');
    this.seatEl.className = 'hud-control-hints__seat';
    this.seatEl.style.display = 'none';
    this.root.appendChild(this.seatEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'hud-control-hints__list';
    this.root.appendChild(this.listEl);

    this.render();
  }

  /**
   * Mount into a HUD parent (typically `HUDLayout.getRoot()`). `isTouchDevice`
   * lets the host suppress the legend on touch without this element importing
   * device detection. Idempotent.
   */
  mount(parent: HTMLElement, isTouchDevice = false): void {
    if (this.mounted) return;
    HudControlHints.injectStyles();
    if (this.hideOnTouch && isTouchDevice) {
      this.suppressed = true;
    }
    parent.appendChild(this.root);
    this.bindToggleKey();
    this.mounted = true;
    this.applyVisibility();
  }

  /**
   * Switch which binds are shown. Idempotent for the same context. Phase 1's
   * seat cues and Phase 6's situation readout extend this by appending to the
   * same root after `setContext`.
   */
  setContext(context: ControlHintContext): void {
    if (this.context === context) return;
    this.context = context;
    this.render();
  }

  /**
   * Switch the legend by the actor mode the player is in. Aircraft
   * (helicopter + plane) share the flight binds; ground vehicles and turrets
   * share the ground-vehicle binds; everything else is on-foot. Lets callers
   * pass their existing `ActorMode` without mapping it themselves.
   */
  setContextForActor(actor: ActorMode): void {
    this.setContext(HudControlHints.actorToContext(actor));
  }

  /** Map an actor mode to the control-legend context. */
  static actorToContext(actor: ActorMode): ControlHintContext {
    switch (actor) {
      case 'helicopter':
      case 'plane':
        return 'aircraft';
      case 'car':
      case 'turret':
        return 'groundVehicle';
      default:
        return 'foot';
    }
  }

  /** Current control context (for composing add-ons on the same surface). */
  getContext(): ControlHintContext {
    return this.context;
  }

  /**
   * Show (or clear) the current-seat block. Pass a {@link SeatHint} when the
   * player is in a multi-crew / armed craft, or `null` to hide it (on foot,
   * single-seat jeep). Idempotent for an equivalent hint.
   */
  setSeatHint(seat: SeatHint | null): void {
    if (seatHintEquals(this.seat, seat)) return;
    this.seat = seat;
    this.renderSeat();
  }

  /**
   * Derive a {@link SeatHint} from the `VehicleUIContext` the HUD already
   * receives, or `null` for craft with no seat cue (single-seat jeep, fixed
   * wing whose cues live on the FixedWingHUD). Lives here so the cue strings
   * and the seat-swap rule stay in one place rather than drifting at call
   * sites — the same way `actorToContext` owns the actor mapping.
   *
   * Seat-swap detection keys on the stable `role` values the vehicle adapters
   * already emit: the tank crews `pilot` (driver hatch) and `gunner`, both of
   * which swap with `F`; a gunship helicopter swaps the pilot seat with its
   * door gun; a jeep `driver` and the transport/attack helicopters do not.
   */
  static seatHintFromContext(context: VehicleUIContext | null): SeatHint | null {
    if (!context) return null;

    const role = context.role;
    const armed = context.capabilities.canFirePrimary;

    // AC-47 broadside gunship (fixed wing): the player IS the pilot; the
    // broadside battery fires on LMB once airborne and RMB is its gun camera.
    // Checked before the tank `pilot` branch since the fixed wing also reports
    // `role: 'pilot'` but with `kind: 'plane'`.
    if (context.kind === 'plane' && (armed || context.viewToggle)) {
      return {
        label: 'PILOT',
        hasSecondSeat: false,
        armed,
        note: 'RMB: broadside gun cam',
      };
    }

    // Tank: driver hatch (`pilot`) <-> gunner station, both swap with F.
    if (role === 'pilot' || role === 'gunner') {
      return {
        label: role === 'gunner' ? 'GUNNER' : 'DRIVER',
        hasSecondSeat: true,
        armed,
      };
    }

    // Door-gun gunship: the player flies as pilot and swaps to the door gun.
    if (context.kind === 'helicopter' && role === 'gunship') {
      return {
        label: 'PILOT',
        hasSecondSeat: true,
        armed,
        note: 'F swaps to door gun',
      };
    }

    // Single-seat armed station (M2HB emplacement / attack heli pilot): name the
    // seat and surface the fire cue, but no seat swap.
    if (armed) {
      const label = role === 'transport' || role === 'attack' ? 'PILOT' : role.toUpperCase();
      return { label, hasSecondSeat: false, armed: true };
    }

    return null;
  }

  /** The shared legend root, so add-on elements can mount alongside the binds. */
  getRoot(): HTMLDivElement {
    return this.root;
  }

  /** Flip the user preference. Persists. */
  toggle(): void {
    this.setVisible(!this.enabled);
  }

  /** Set the user preference explicitly. Persists. */
  setVisible(visible: boolean): void {
    if (this.enabled === visible) return;
    this.enabled = visible;
    this.saveEnabled(visible);
    this.applyVisibility();
  }

  /**
   * Host-driven suppression independent of the user toggle — e.g. a
   * reduced-clutter mode or a touch device. Does not overwrite the user's
   * preference, so clearing suppression restores their last choice.
   */
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.applyVisibility();
  }

  /** Whether the legend is actually on screen right now. */
  isShown(): boolean {
    return this.enabled && !this.suppressed;
  }

  dispose(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = undefined;
    }
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.mounted = false;
  }

  private render(): void {
    const legend = CONTEXT_BINDS[this.context];
    this.titleEl.textContent = legend.title;
    this.listEl.replaceChildren();
    for (const hint of legend.hints) {
      const row = document.createElement('div');
      row.className = 'hud-control-hints__row';

      const keys = document.createElement('span');
      keys.className = 'hud-control-hints__keys';
      keys.textContent = hint.keys;

      const action = document.createElement('span');
      action.className = 'hud-control-hints__action';
      action.textContent = hint.action;

      row.appendChild(keys);
      row.appendChild(action);
      this.listEl.appendChild(row);
    }
  }

  private renderSeat(): void {
    const seat = this.seat;
    if (!seat) {
      this.seatEl.style.display = 'none';
      this.seatEl.replaceChildren();
      return;
    }

    this.seatEl.style.display = '';
    this.seatEl.replaceChildren();

    const label = document.createElement('div');
    label.className = 'hud-control-hints__seat-label';
    label.textContent = `SEAT: ${seat.label}`;
    this.seatEl.appendChild(label);

    const cues: string[] = [];
    if (seat.armed) cues.push('LMB: fire');
    if (seat.hasSecondSeat) cues.push('F: swap seat');
    for (const cue of cues) {
      const row = document.createElement('div');
      row.className = 'hud-control-hints__seat-cue';
      row.textContent = cue;
      this.seatEl.appendChild(row);
    }

    if (seat.note) {
      const note = document.createElement('div');
      note.className = 'hud-control-hints__seat-note';
      note.textContent = seat.note;
      this.seatEl.appendChild(note);
    }
  }

  private applyVisibility(): void {
    this.root.style.display = this.isShown() ? '' : 'none';
  }

  private bindToggleKey(): void {
    if (!this.toggleKeyCode || this.keydownHandler) return;
    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.code !== this.toggleKeyCode) return;
      // Don't steal the key while the user is typing in a field.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      this.toggle();
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private loadEnabled(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw !== null) return raw === 'true';
      }
    } catch {
      // localStorage unavailable (private mode / sandbox) — default on.
    }
    return true;
  }

  private saveEnabled(value: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(value));
      }
    } catch {
      // Non-fatal: the preference just won't persist this session.
    }
  }

  private static injectStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .hud-control-hints {
        position: fixed;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        z-index: ${zIndex.hudStatus};
        pointer-events: none;
        font-family: ${fontStack.hud};
        font-size: 11px;
        line-height: 1.4;
        color: ${colors.textSecondary};
        background: ${colors.glassBg};
        border: 1px solid ${colors.glassBorder};
        border-radius: 4px;
        padding: 6px 8px;
        max-width: 200px;
        opacity: 0.55;
        transition: opacity 0.15s ease;
      }
      .hud-control-hints:hover {
        opacity: 0.9;
      }
      .hud-control-hints__title {
        font-family: ${fontStack.stamp};
        font-size: 10px;
        letter-spacing: 0.08em;
        color: ${colors.textMuted};
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .hud-control-hints__seat {
        margin-bottom: 4px;
        padding-bottom: 4px;
        border-bottom: 1px solid ${colors.glassBorder};
      }
      .hud-control-hints__seat-label {
        font-family: ${fontStack.stamp};
        font-size: 11px;
        letter-spacing: 0.06em;
        color: ${colors.textPrimary};
        font-weight: 700;
      }
      .hud-control-hints__seat-cue {
        color: ${colors.textPrimary};
        font-weight: 600;
        white-space: nowrap;
      }
      .hud-control-hints__seat-note {
        color: ${colors.textMuted};
        font-size: 10px;
        white-space: nowrap;
      }
      .hud-control-hints__row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        white-space: nowrap;
      }
      .hud-control-hints__keys {
        color: ${colors.textPrimary};
        font-weight: 600;
      }
      .hud-control-hints__action {
        color: ${colors.textSecondary};
      }
      /* On coarse-pointer devices the on-screen buttons already teach controls. */
      @media (pointer: coarse) {
        .hud-control-hints { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
}
