// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { colors, fontStack, zIndex } from '../design/tokens';
import type { ActorMode } from '../layout/types';

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
      { keys: 'F', action: 'Exit / swap seat' },
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
  private readonly listEl: HTMLDivElement;
  private readonly toggleKeyCode: string | null;
  private readonly hideOnTouch: boolean;

  private context: ControlHintContext = 'foot';
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
