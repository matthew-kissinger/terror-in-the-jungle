// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { colors, fontStack } from '../design/tokens';
import { Alliance, getAlliance } from '../../systems/combat/types';
import { ZoneState, type CaptureZone } from '../../systems/world/ZoneManager';

/**
 * HudSituationReadout — a compact "what's happening + where to go" line.
 *
 * Closes the 2026-06-28 owner-walk finding that A Shau reads as a blank
 * exploration: the `WarSimulator` + zone systems already track the front, but
 * nothing on the HUD told the player who is winning, which objective is hot, or
 * which way to walk. This element surfaces that EXISTING state as one readable
 * line — it adds no strategy logic of its own.
 *
 * It is a **read-only consumer**: the host hands it a {@link SituationSnapshot}
 * derived from the zone query, ticket counts, and player position via the pure
 * {@link HudSituationReadout.buildSnapshot} helper. The widget never reaches
 * into `WarSimulator` or mutates zone state. Keeping the read in a static pure
 * function (mirroring `HudControlHints.seatHintFromContext`) makes the
 * presentation unit-testable from a plain snapshot and keeps the per-frame
 * read allocation-free apart from the snapshot object itself.
 *
 * It shares the control-hint surface (Phase 1's `HudControlHints`): the host
 * mounts it into that legend's root so the situation line and the bind list
 * read as one right-edge panel and never collide with the health / ammo /
 * scoreboard slots.
 */

/** Which side is ahead on tickets, from the player's perspective. */
export type SituationPosture = 'winning' | 'losing' | 'even';

/** The single nearest objective worth acting on, with a bearing to walk. */
export interface SituationObjective {
  /** Display name of the zone (e.g. `A SHAU`). */
  readonly name: string;
  /** Whether the objective is actively contested (vs merely the nearest target). */
  readonly contested: boolean;
  /** Whole-metre ground distance from the player to the zone centre. */
  readonly distanceM: number;
  /** Eight-point compass bearing from the player toward the zone (e.g. `NE`). */
  readonly heading: CompassHeading;
}

/** A plain, render-ready snapshot of the war situation. */
export interface SituationSnapshot {
  /** Ticket lead from the player's perspective. */
  readonly posture: SituationPosture;
  /** Friendly ticket count (player's alliance). */
  readonly friendlyTickets: number;
  /** Hostile ticket count (the other alliance). */
  readonly hostileTickets: number;
  /** The objective to push toward, or `null` when none is in play. */
  readonly objective: SituationObjective | null;
}

export type CompassHeading = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

const COMPASS: readonly CompassHeading[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Minimal player-position shape the snapshot read needs. */
export interface SituationPlayerPosition {
  readonly x: number;
  readonly z: number;
}

/** The inputs the snapshot read consumes — all existing read paths. */
export interface SituationInputs {
  readonly capturableZones: readonly CaptureZone[];
  readonly friendlyTickets: number;
  readonly hostileTickets: number;
  readonly playerAlliance: Alliance;
  readonly playerPosition: SituationPlayerPosition;
}

const STYLE_ID = 'hud-situation-readout-styles';

/** Value-equality so re-applying an identical snapshot is a no-op. */
function snapshotEquals(a: SituationSnapshot | null, b: SituationSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.posture !== b.posture) return false;
  if (a.friendlyTickets !== b.friendlyTickets || a.hostileTickets !== b.hostileTickets) return false;
  const ao = a.objective;
  const bo = b.objective;
  if (ao === bo) return true;
  if (!ao || !bo) return false;
  return (
    ao.name === bo.name &&
    ao.contested === bo.contested &&
    ao.distanceM === bo.distanceM &&
    ao.heading === bo.heading
  );
}

export class HudSituationReadout {
  private readonly root: HTMLDivElement;
  private readonly postureEl: HTMLDivElement;
  private readonly objectiveEl: HTMLDivElement;
  private readonly nudgeEl: HTMLDivElement;

  private situation: SituationSnapshot | null = null;
  private mounted = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud-situation-readout';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-label', 'Situation readout');
    this.root.style.display = 'none';

    this.postureEl = document.createElement('div');
    this.postureEl.className = 'hud-situation-readout__posture';
    this.root.appendChild(this.postureEl);

    this.objectiveEl = document.createElement('div');
    this.objectiveEl.className = 'hud-situation-readout__objective';
    this.root.appendChild(this.objectiveEl);

    this.nudgeEl = document.createElement('div');
    this.nudgeEl.className = 'hud-situation-readout__nudge';
    this.root.appendChild(this.nudgeEl);
  }

  /**
   * Mount above (or alongside) the shared control-hint legend. Pass that
   * legend's root so the situation line and bind list read as one panel.
   * Idempotent.
   */
  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    HudSituationReadout.injectStyles();
    // Sit above the bind list so the readout is the first thing read on the
    // shared panel — the situation comes before the controls.
    parent.insertBefore(this.root, parent.firstChild);
    this.mounted = true;
    this.render();
  }

  /**
   * Read the current war situation from existing zone + ticket + player state.
   * Pure: no side effects, no system mutation. Returns `null` only when there
   * are no capturable zones to reason about (e.g. TDM / pre-spawn). Mirrors
   * `HudControlHints.seatHintFromContext` — the read rule lives in one place so
   * call sites never hand-roll their own posture / nearest-objective logic.
   */
  static buildSnapshot(inputs: SituationInputs): SituationSnapshot | null {
    const { capturableZones, friendlyTickets, hostileTickets, playerAlliance, playerPosition } = inputs;
    if (capturableZones.length === 0) return null;

    return {
      posture: derivePosture(friendlyTickets, hostileTickets),
      friendlyTickets,
      hostileTickets,
      objective: deriveNearestObjective(capturableZones, playerAlliance, playerPosition),
    };
  }

  /**
   * Apply a snapshot (typically from {@link HudSituationReadout.buildSnapshot}).
   * Idempotent for an equivalent snapshot, so the host can call this every HUD
   * tick without thrashing the DOM. Pass `null` to hide the readout.
   */
  setSituation(situation: SituationSnapshot | null): void {
    if (snapshotEquals(this.situation, situation)) return;
    this.situation = situation;
    this.render();
  }

  /** Whether the readout is currently showing a situation. */
  isShown(): boolean {
    return this.mounted && this.situation !== null;
  }

  dispose(): void {
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.mounted = false;
  }

  private render(): void {
    const situation = this.situation;
    if (!situation) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';

    setText(this.postureEl, posturePhrase(situation));
    this.postureEl.classList.toggle('is-winning', situation.posture === 'winning');
    this.postureEl.classList.toggle('is-losing', situation.posture === 'losing');

    const objective = situation.objective;
    if (objective) {
      setText(this.objectiveEl, objectivePhrase(objective));
      this.objectiveEl.classList.toggle('is-contested', objective.contested);
      setText(this.nudgeEl, nudgePhrase(objective));
      this.nudgeEl.style.display = '';
    } else {
      setText(this.objectiveEl, 'Front secured');
      this.objectiveEl.classList.remove('is-contested');
      this.nudgeEl.style.display = 'none';
    }
  }

  private static injectStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .hud-situation-readout {
        font-family: ${fontStack.hud};
        font-size: 11px;
        line-height: 1.4;
        color: ${colors.textSecondary};
        margin-bottom: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid ${colors.glassBorder};
        max-width: 200px;
      }
      .hud-situation-readout__posture {
        font-family: ${fontStack.stamp};
        font-size: 11px;
        letter-spacing: 0.06em;
        color: ${colors.textPrimary};
        font-weight: 700;
        text-transform: uppercase;
      }
      .hud-situation-readout__posture.is-winning { color: ${colors.us}; }
      .hud-situation-readout__posture.is-losing { color: ${colors.opfor}; }
      .hud-situation-readout__objective {
        color: ${colors.textSecondary};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-situation-readout__objective.is-contested {
        color: ${colors.warning};
        font-weight: 600;
      }
      .hud-situation-readout__nudge {
        color: ${colors.textPrimary};
        font-weight: 600;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }
}

function derivePosture(friendlyTickets: number, hostileTickets: number): SituationPosture {
  if (friendlyTickets > hostileTickets) return 'winning';
  if (friendlyTickets < hostileTickets) return 'losing';
  return 'even';
}

/**
 * Pick the single objective worth pushing toward: the nearest CONTESTED zone if
 * any are contested, otherwise the nearest zone not already held by the player's
 * alliance. Ties broken by distance. Read-only — no zone-capture rule here.
 */
function deriveNearestObjective(
  zones: readonly CaptureZone[],
  playerAlliance: Alliance,
  player: SituationPlayerPosition,
): SituationObjective | null {
  let bestContested: CaptureZone | null = null;
  let bestContestedDist = Infinity;
  let bestTarget: CaptureZone | null = null;
  let bestTargetDist = Infinity;

  for (const zone of zones) {
    const dist = horizontalDistance(player, zone);
    const playerHeld = zone.owner !== null && getAlliance(zone.owner) === playerAlliance;

    if (zone.state === ZoneState.CONTESTED && dist < bestContestedDist) {
      bestContested = zone;
      bestContestedDist = dist;
    }
    if (!playerHeld && dist < bestTargetDist) {
      bestTarget = zone;
      bestTargetDist = dist;
    }
  }

  const chosen = bestContested ?? bestTarget;
  if (!chosen) return null;

  const distance = bestContested ? bestContestedDist : bestTargetDist;
  return {
    name: chosen.name,
    contested: chosen === bestContested,
    distanceM: Math.round(distance),
    heading: bearingTo(player, chosen),
  };
}

function horizontalDistance(player: SituationPlayerPosition, zone: CaptureZone): number {
  const dx = Number(zone.position.x) - player.x;
  const dz = Number(zone.position.z) - player.z;
  return Math.hypot(dx, dz);
}

/**
 * Eight-point compass bearing from the player to a zone. World convention:
 * +x is East, +z is South (north is -z), matching the minimap/world axes.
 */
function bearingTo(player: SituationPlayerPosition, zone: CaptureZone): CompassHeading {
  const dx = Number(zone.position.x) - player.x;
  const dz = Number(zone.position.z) - player.z;
  // atan2(east, north) with north = -z: 0 rad = North, increasing clockwise.
  let angle = Math.atan2(dx, -dz);
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.round(angle / (Math.PI / 4)) % 8;
  return COMPASS[sector];
}

function posturePhrase(situation: SituationSnapshot): string {
  const score = `${situation.friendlyTickets}–${situation.hostileTickets}`;
  switch (situation.posture) {
    case 'winning':
      return `WINNING ${score}`;
    case 'losing':
      return `LOSING ${score}`;
    default:
      return `EVEN ${score}`;
  }
}

function objectivePhrase(objective: SituationObjective): string {
  return objective.contested
    ? `Contested: ${objective.name}`
    : `Next: ${objective.name}`;
}

function nudgePhrase(objective: SituationObjective): string {
  return `→ ${objective.heading} · ${objective.distanceM}m`;
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
