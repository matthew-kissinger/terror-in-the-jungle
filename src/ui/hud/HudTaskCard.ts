// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { colors, fontStack } from '../design/tokens';
import type { TaskCandidate, TaskKind } from '../../systems/missions/TaskingDirector';

/**
 * HudTaskCard — the opt-in tasking-director surface.
 *
 * Renders the director's single offer / active task and its complete / failed
 * flashes, with explicit accept / decline / clear affordances. It is a
 * **presentation element only**: it owns its DOM and an optional keyboard
 * binding, but it derives nothing — the {@link TaskingDirector} hands it a
 * {@link TaskCardView} and subscribes to the accept / decline / clear callbacks
 * via {@link HudTaskCard.setHandlers}. Reward dispatch is forwarded out through
 * {@link HudTaskCard.setRewardDispatcher} so the card never imports the HUD's
 * internals — the host wires it to `HUDSystem.spawnScorePopup`.
 *
 * Mirrors `HudSituationReadout`: self-contained element, injected styles, a
 * value-equality guard so re-applying an identical view is a DOM no-op, and a
 * clean `dispose`. It sits as a distinct, higher-emphasis element directly
 * above the objectives list — "your assignment" atop "all objectives".
 */

export type TaskCardState = 'idle' | 'offer' | 'active';

/** What the card should show. `idle` hides it; complete / failed are flashes. */
export interface TaskCardView {
  readonly state: TaskCardState;
  readonly task: TaskCandidate | null;
}

export interface TaskCardHandlers {
  readonly onAccept: () => void;
  readonly onDecline: () => void;
  readonly onClear: () => void;
}

/** Forwards a reward to the HUD score-popup surface (existing types only). */
export type RewardDispatcher = (
  type: 'capture' | 'defend',
  points: number,
  multiplier: number,
) => void;

const STYLE_ID = 'hud-task-card-styles';

function viewEquals(a: TaskCardView, b: TaskCardView): boolean {
  if (a.state !== b.state) return false;
  if (a.task === b.task) return true;
  if (!a.task || !b.task) return false;
  return (
    a.task.kind === b.task.kind &&
    a.task.zoneId === b.task.zoneId &&
    a.task.zoneName === b.task.zoneName
  );
}

export class HudTaskCard {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly actionsEl: HTMLDivElement;
  private readonly acceptBtn: HTMLButtonElement;
  private readonly dismissBtn: HTMLButtonElement;

  private view: TaskCardView = { state: 'idle', task: null };
  private handlers: TaskCardHandlers | null = null;
  private rewardDispatcher: RewardDispatcher | null = null;
  private mounted = false;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud-task-card';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Tasking');
    this.root.style.display = 'none';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'hud-task-card__title';
    this.root.appendChild(this.titleEl);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'hud-task-card__body';
    this.root.appendChild(this.bodyEl);

    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'hud-task-card__actions';
    this.acceptBtn = document.createElement('button');
    this.acceptBtn.type = 'button';
    this.acceptBtn.className = 'hud-task-card__btn hud-task-card__btn--accept';
    this.acceptBtn.addEventListener('click', () => this.handleAccept());
    this.dismissBtn = document.createElement('button');
    this.dismissBtn.type = 'button';
    this.dismissBtn.className = 'hud-task-card__btn hud-task-card__btn--dismiss';
    this.dismissBtn.addEventListener('click', () => this.handleDismiss());
    this.actionsEl.appendChild(this.acceptBtn);
    this.actionsEl.appendChild(this.dismissBtn);
    this.root.appendChild(this.actionsEl);

    // Keyboard opt-in: T accepts an offer, Y declines / clears. Mirrors the
    // click affordances so the card is fully operable without the mouse.
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 't') this.handleAccept();
      else if (key === 'y') this.handleDismiss();
    };
  }

  /** Mount as the first child of the objectives column. Idempotent. */
  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    HudTaskCard.injectStyles();
    parent.insertBefore(this.root, parent.firstChild);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
    }
    this.mounted = true;
    this.render();
  }

  setHandlers(handlers: TaskCardHandlers): void {
    this.handlers = handlers;
  }

  setRewardDispatcher(dispatcher: RewardDispatcher): void {
    this.rewardDispatcher = dispatcher;
  }

  /** Apply a view. Idempotent for an equivalent view (DOM no-op). */
  setView(view: TaskCardView): void {
    if (viewEquals(this.view, view)) return;
    this.cancelFlash();
    this.view = view;
    this.render();
  }

  /** Flash a brief "MISSION COMPLETE" then fall back to whatever the director set. */
  showCompleted(task: TaskCandidate): void {
    this.flash('complete', `MISSION COMPLETE`, `${taskVerb(task.kind)} ${task.zoneName}`);
  }

  /** Flash a muted "MISSION LOST" then fall back. */
  showFailed(task: TaskCandidate): void {
    this.flash('failed', `MISSION LOST`, `${task.zoneName} fell`);
  }

  /** Forward a reward to the HUD score-popup surface. */
  dispatchReward(type: 'capture' | 'defend', points: number, multiplier: number): void {
    this.rewardDispatcher?.(type, points, multiplier);
  }

  isShown(): boolean {
    return this.mounted && this.root.style.display !== 'none';
  }

  dispose(): void {
    this.cancelFlash();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
    }
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.mounted = false;
  }

  // -- Internal --

  private handleAccept(): void {
    if (this.view.state !== 'offer') return;
    this.handlers?.onAccept();
  }

  private handleDismiss(): void {
    if (this.view.state === 'offer') this.handlers?.onDecline();
    else if (this.view.state === 'active') this.handlers?.onClear();
  }

  private flash(kind: 'complete' | 'failed', title: string, body: string): void {
    this.cancelFlash();
    this.root.style.display = '';
    this.root.classList.remove('is-offer', 'is-active');
    this.root.classList.toggle('is-complete', kind === 'complete');
    this.root.classList.toggle('is-failed', kind === 'failed');
    setText(this.titleEl, title);
    setText(this.bodyEl, body);
    this.actionsEl.style.display = 'none';
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.render();
    }, 2500);
  }

  private cancelFlash(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
  }

  private render(): void {
    const { state, task } = this.view;
    this.root.classList.remove('is-complete', 'is-failed');

    if (state === 'idle' || !task) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    this.root.classList.toggle('is-offer', state === 'offer');
    this.root.classList.toggle('is-active', state === 'active');
    this.actionsEl.style.display = '';
    setText(this.bodyEl, `${taskVerb(task.kind)} ${task.zoneName}`);

    if (state === 'offer') {
      // Offer: accept or decline.
      setText(this.titleEl, 'NEW TASKING');
      this.acceptBtn.style.display = '';
      setText(this.acceptBtn, 'ACCEPT [T]');
      setText(this.dismissBtn, 'DECLINE [Y]');
    } else {
      // Active: no accept, just an abandon affordance.
      setText(this.titleEl, 'ACTIVE TASK');
      this.acceptBtn.style.display = 'none';
      setText(this.dismissBtn, 'ABANDON [Y]');
    }
  }

  private static injectStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .hud-task-card {
        font-family: ${fontStack.hud};
        background: ${colors.glassBgDense};
        border: 1px solid ${colors.glassBorderBright};
        border-left: 3px solid ${colors.warning};
        border-radius: 3px;
        padding: 6px 8px;
        margin-bottom: 8px;
        max-width: 260px;
      }
      .hud-task-card.is-active { border-left-color: ${colors.us}; }
      .hud-task-card.is-complete { border-left-color: ${colors.success}; }
      .hud-task-card.is-failed { border-left-color: ${colors.danger}; opacity: 0.85; }
      .hud-task-card__title {
        font-family: ${fontStack.stamp};
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        color: ${colors.textPrimary};
      }
      .hud-task-card__body {
        font-size: 12px;
        color: ${colors.textSecondary};
        margin: 2px 0 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hud-task-card__actions { display: flex; gap: 6px; }
      .hud-task-card__btn {
        flex: 1 1 auto;
        font-family: ${fontStack.stamp};
        font-size: 10px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 4px 6px;
        border-radius: 2px;
        cursor: pointer;
        color: ${colors.textPrimary};
        background: ${colors.buttonBg};
        border: 1px solid ${colors.glassBorder};
      }
      .hud-task-card__btn:hover { background: ${colors.buttonHover}; }
      .hud-task-card__btn--accept { border-color: ${colors.success}; }
    `;
    document.head.appendChild(style);
  }
}

function taskVerb(kind: TaskKind): string {
  return kind === 'capture' ? 'Seize' : 'Hold';
}

function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
