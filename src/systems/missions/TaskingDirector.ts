// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { Alliance, getAlliance } from '../combat/types';
import { ZoneState, type CaptureZone } from '../world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import type { WarSimulator } from '../strategy/WarSimulator';
import type { TicketSystem } from '../world/TicketSystem';
import type { WarEvent } from '../strategy/types';
import type { HudTaskCard, TaskCardView } from '../../ui/hud/HudTaskCard';

/**
 * TaskingDirector — an opt-in "what should I do next" loop for A Shau.
 *
 * The `WarSimulator` + `ZoneManager` + `TicketSystem` already run a living
 * battle every frame; the player just has no curated thread through it. This
 * director READS that live state, derives a small set of missions, and offers
 * the player one at a time. It invents no new simulation, mutates nothing, and
 * only recognizes + rewards outcomes the existing systems already produce.
 *
 * MVP scope (per TASKING_DIRECTOR_SPIKE_2026-06-28 §5): archetypes
 *   A — CAPTURE a contested / enemy-held zone ("Seize {zone}")
 *   B — DEFEND a held, threatened zone ("Hold {zone}")
 * with a single active task + single pending offer, event-driven clear/complete,
 * and a score-popup reward scaled by the zone's ticket-bleed band. Archetype C
 * (destroy a strategic target) is a clean Phase-2 follow-on; the derivation is
 * already an archetype list so C drops in without restructuring.
 *
 * Perf shape mirrors `StrategicFeedback`: `update()` is near-empty — completion
 * and failure detection is fully event-driven via `WarSimulator.events`, and
 * candidate derivation runs only on a slow throttle (and only when there is no
 * active task and no pending offer). No new per-frame hot path.
 */

export type TaskKind = 'capture' | 'defend';

/** Ticket-bleed bands → reward weighting (display/ranking concept, not a sim lever). */
export type TaskValueBand = 'low' | 'med' | 'high';

/** A render-ready mission derived from live zone/war state. Plain data. */
export interface TaskCandidate {
  readonly kind: TaskKind;
  /** Zone this mission keys on. */
  readonly zoneId: string;
  /** Display name of the zone (e.g. `A SHAU`). */
  readonly zoneName: string;
  /** Strategic-value band derived from the zone's ticket-bleed rate. */
  readonly band: TaskValueBand;
  /** Zone centre, for the HUD waypoint. */
  readonly x: number;
  readonly z: number;
}

/** Inputs the pure candidate read consumes — all existing read paths. */
export interface TaskDerivationInputs {
  readonly capturableZones: readonly CaptureZone[];
  readonly playerAlliance: Alliance;
  readonly playerX: number;
  readonly playerZ: number;
}

// Tuning values (per docs/TESTING.md these are NOT asserted in tests).
const DERIVE_INTERVAL_S = 1.5;        // throttle for candidate derivation
const OFFER_TIMEOUT_S = 20;           // an ignored offer auto-dismisses
const DECLINE_COOLDOWN_S = 60;        // a declined/ignored zone is suppressed
const ACTIVE_TASK_EXPIRY_S = 240;     // a stale active task clears silently
const CAPTURE_REWARD = 200;
const DEFEND_REWARD = 150;
const BAND_MULTIPLIER: Record<TaskValueBand, number> = { low: 1, med: 1.5, high: 2 };
const BLEED_MED = 0.5;
const BLEED_HIGH = 1.0;

interface ActiveTask {
  readonly candidate: TaskCandidate;
  ageS: number;
}

export class TaskingDirector implements GameSystem {
  private zoneQuery: IZoneQuery | null = null;
  private warSimulator: WarSimulator | null = null;
  private ticketSystem: TicketSystem | null = null;
  private card: HudTaskCard | null = null;

  private playerAlliance: Alliance = Alliance.BLUFOR;
  private playerX = 0;
  private playerZ = 0;

  private active: ActiveTask | null = null;
  private offer: TaskCandidate | null = null;
  private offerAgeS = 0;

  /** zoneId → seconds of remaining suppression after a decline / ignore. */
  private readonly cooldowns = new Map<string, number>();

  private deriveAccumulatorS = 0;
  private unsubscribe: (() => void) | null = null;

  // Reusable scratch so steady-state derivation allocates nothing.
  private readonly candidateScratch: CaptureZone[] = [];

  async init(): Promise<void> {
    Logger.info('tasking-director', 'Initialized (dormant until opt-in + WarSimulator active)');
  }

  /**
   * Near-empty per-frame body. Completion/failure is event-driven; the only
   * per-frame work is decrementing timers and running candidate derivation on a
   * slow throttle when there is nothing active and nothing pending. Mirrors
   * `StrategicFeedback` — no work on the frame's critical path.
   */
  update(deltaTime: number): void {
    if (!this.zoneQuery || !this.warSimulator) return;

    this.advanceTimers(deltaTime);

    this.deriveAccumulatorS += deltaTime;
    if (this.deriveAccumulatorS < DERIVE_INTERVAL_S) return;
    this.deriveAccumulatorS = 0;

    this.deriveOffer();
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.active = null;
    this.offer = null;
    this.cooldowns.clear();
  }

  // -- Dependency setters (wired at scenario time, like StrategicFeedback) --

  setWarSimulator(simulator: WarSimulator): void {
    this.warSimulator = simulator;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = simulator.events.subscribe((events) => this.handleEvents(events));
  }

  setZoneQuery(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  setTaskCard(card: HudTaskCard): void {
    this.card = card;
    card.setHandlers({
      onAccept: () => this.acceptOffer(),
      onDecline: () => this.declineOffer(),
      onClear: () => this.clearActive('cleared'),
    });
    this.render();
  }

  setPlayerAlliance(alliance: Alliance): void {
    this.playerAlliance = alliance;
  }

  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  // -- Public read accessors (for tests / HUD waypoint) --

  getActiveTask(): TaskCandidate | null {
    return this.active?.candidate ?? null;
  }

  getPendingOffer(): TaskCandidate | null {
    return this.offer;
  }

  // -- Opt-in transitions --

  /** Accept the current offer. Opt-in is explicit — nothing happens otherwise. */
  acceptOffer(): void {
    if (!this.offer || this.active) return;
    this.active = { candidate: this.offer, ageS: 0 };
    this.offer = null;
    this.offerAgeS = 0;
    this.render();
  }

  /** Decline the current offer; the zone is suppressed for a cooldown. */
  declineOffer(): void {
    if (!this.offer) return;
    this.cooldowns.set(this.offer.zoneId, DECLINE_COOLDOWN_S);
    this.offer = null;
    this.offerAgeS = 0;
    this.render();
  }

  // -- Candidate derivation (throttled, pure read) --

  private deriveOffer(): void {
    if (this.active || this.offer || !this.zoneQuery) return;
    if (!this.warSimulator?.isEnabled()) return;
    if (this.isMatchOver()) return;

    const candidate = TaskingDirector.deriveCandidate({
      capturableZones: this.collectCandidateZones(),
      playerAlliance: this.playerAlliance,
      playerX: this.playerX,
      playerZ: this.playerZ,
    });

    if (candidate) {
      this.offer = candidate;
      this.offerAgeS = 0;
      this.render();
    }
  }

  /** Drop zones still under decline/ignore cooldown out of the candidate pool. */
  private collectCandidateZones(): CaptureZone[] {
    this.candidateScratch.length = 0;
    if (!this.zoneQuery) return this.candidateScratch;
    for (const zone of this.zoneQuery.getCapturableZones()) {
      if (this.cooldowns.has(zone.id)) continue;
      this.candidateScratch.push(zone);
    }
    return this.candidateScratch;
  }

  /**
   * Pure: derive the single best mission from a zone snapshot, or `null` when
   * there is nothing worth offering. Prefers a DEFEND on a threatened held zone
   * (urgent), else a CAPTURE on the nearest contested / enemy-held zone. Ties
   * broken by distance, then ticket-bleed value. Read-only — no capture rule.
   */
  static deriveCandidate(inputs: TaskDerivationInputs): TaskCandidate | null {
    const { capturableZones, playerAlliance, playerX, playerZ } = inputs;

    let bestDefend: CaptureZone | null = null;
    let bestDefendDist = Infinity;
    let bestCapture: CaptureZone | null = null;
    let bestCaptureDist = Infinity;

    for (const zone of capturableZones) {
      const owner = zone.owner;
      const playerHeld = owner !== null && getAlliance(owner) === playerAlliance;
      const dist = horizontalDistance(playerX, playerZ, zone);

      // DEFEND (B): a held zone under attack (contested while player-owned).
      if (playerHeld && zone.state === ZoneState.CONTESTED) {
        if (defendRank(zone, dist) < defendRank(bestDefend, bestDefendDist)) {
          bestDefend = zone;
          bestDefendDist = dist;
        }
        continue;
      }

      // CAPTURE (A): a contested / enemy-held / partially-captured neutral zone.
      const enemyHeld = owner !== null && getAlliance(owner) !== playerAlliance;
      const capturable =
        zone.state === ZoneState.CONTESTED ||
        enemyHeld ||
        (owner === null && zone.captureProgress > 0);
      if (capturable && dist < bestCaptureDist) {
        bestCapture = zone;
        bestCaptureDist = dist;
      }
    }

    // Defending a zone you're losing is the more urgent "what now?".
    const chosenDefend = bestDefend;
    if (chosenDefend) {
      return toCandidate('defend', chosenDefend, bestDefendDist);
    }
    if (bestCapture) {
      return toCandidate('capture', bestCapture, bestCaptureDist);
    }
    return null;
  }

  // -- Event-driven clear / complete --

  private handleEvents(events: WarEvent[]): void {
    if (!this.active) return;
    const task = this.active.candidate;

    for (const event of events) {
      switch (event.type) {
        case 'zone_captured':
          if (event.zoneId !== task.zoneId) break;
          // CAPTURE complete when the player's alliance takes it; for DEFEND a
          // re-confirmed player ownership is a successful hold.
          if (getAlliance(event.faction) === this.playerAlliance) {
            this.completeActive();
          } else {
            // Enemy captured a zone we were defending → failure.
            this.clearActive('failed');
          }
          return;

        case 'zone_lost':
          if (event.zoneId !== task.zoneId) break;
          // The player's alliance lost the task zone.
          if (task.kind === 'defend' && getAlliance(event.faction) === this.playerAlliance) {
            this.clearActive('failed');
          } else if (task.kind === 'capture' && getAlliance(event.faction) !== this.playerAlliance) {
            // The enemy lost the zone we were trying to take — it's ours/neutral now.
            this.completeActive();
          }
          return;
      }
    }
  }

  private completeActive(): void {
    if (!this.active) return;
    const task = this.active.candidate;
    this.dispatchReward(task);
    this.card?.showCompleted(task);
    this.active = null;
    this.deriveAccumulatorS = 0;
  }

  private clearActive(reason: 'failed' | 'cleared'): void {
    if (!this.active) return;
    const task = this.active.candidate;
    if (reason === 'failed') {
      this.card?.showFailed(task);
    }
    this.active = null;
    this.deriveAccumulatorS = 0;
    if (reason === 'cleared') this.render();
  }

  /**
   * Reward = score popup of the matching existing type, scaled by the zone's
   * ticket-bleed value band. The director does NOT write tickets or zone
   * ownership — capturing the zone already moved tickets through the existing
   * ZoneManager/TicketSystem path. This bonus is purely player-facing score.
   */
  private dispatchReward(task: TaskCandidate): void {
    if (!this.card) return;
    const base = task.kind === 'capture' ? CAPTURE_REWARD : DEFEND_REWARD;
    const popupType: 'capture' | 'defend' = task.kind === 'capture' ? 'capture' : 'defend';
    this.card.dispatchReward(popupType, base, BAND_MULTIPLIER[task.band]);
  }

  // -- Timers --

  private advanceTimers(deltaTime: number): void {
    // Decay decline/ignore cooldowns.
    if (this.cooldowns.size > 0) {
      for (const [zoneId, remaining] of this.cooldowns) {
        const next = remaining - deltaTime;
        if (next <= 0) this.cooldowns.delete(zoneId);
        else this.cooldowns.set(zoneId, next);
      }
    }

    // An ignored offer auto-dismisses into the same cooldown.
    if (this.offer) {
      this.offerAgeS += deltaTime;
      if (this.offerAgeS >= OFFER_TIMEOUT_S) {
        this.cooldowns.set(this.offer.zoneId, DECLINE_COOLDOWN_S);
        this.offer = null;
        this.offerAgeS = 0;
        this.render();
      }
    }

    // A stale active task clears silently; a resolved fight should not leave a
    // dangling marker. Also clear everything when the match ends.
    if (this.active) {
      this.active.ageS += deltaTime;
      if (this.active.ageS >= ACTIVE_TASK_EXPIRY_S || this.isMatchOver()) {
        this.active = null;
        this.render();
      }
    } else if (this.offer && this.isMatchOver()) {
      this.offer = null;
      this.render();
    }
  }

  private isMatchOver(): boolean {
    const state = this.ticketSystem?.getGameState();
    return state?.phase === 'ENDED';
  }

  private render(): void {
    if (!this.card) return;
    const view: TaskCardView = this.active
      ? { state: 'active', task: this.active.candidate }
      : this.offer
        ? { state: 'offer', task: this.offer }
        : { state: 'idle', task: null };
    this.card.setView(view);
  }
}

function horizontalDistance(px: number, pz: number, zone: CaptureZone): number {
  const dx = Number(zone.position.x) - px;
  const dz = Number(zone.position.z) - pz;
  return Math.hypot(dx, dz);
}

/** Lower rank = preferred. Higher-bleed defends first, then nearest. */
function defendRank(zone: CaptureZone | null, dist: number): number {
  if (!zone) return Infinity;
  return dist - zone.ticketBleedRate * 100;
}

function bleedBand(ticketBleedRate: number): TaskValueBand {
  if (ticketBleedRate >= BLEED_HIGH) return 'high';
  if (ticketBleedRate >= BLEED_MED) return 'med';
  return 'low';
}

function toCandidate(kind: TaskKind, zone: CaptureZone, _dist: number): TaskCandidate {
  return {
    kind,
    zoneId: zone.id,
    zoneName: zone.name,
    band: bleedBand(zone.ticketBleedRate),
    x: Number(zone.position.x),
    z: Number(zone.position.z),
  };
}
