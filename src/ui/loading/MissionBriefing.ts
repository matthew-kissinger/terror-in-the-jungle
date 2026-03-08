/**
 * MissionBriefing - A Shau Valley pre-deploy briefing card.
 *
 * Shows a full-screen overlay with a centered briefing card containing
 * the operation name, historical context, mission objectives, and
 * battlefield intel. Returns a Promise that resolves when the player
 * clicks "Begin Mission" or when the 30-second auto-dismiss fires.
 *
 * Used only for A_SHAU_VALLEY mode, shown once before the initial
 * deploy screen.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './MissionBriefing.module.css';

/** Auto-dismiss safety net in milliseconds. */
const AUTO_DISMISS_MS = 30_000;

export interface MissionBriefingInfo {
  zoneCount: number;
  worldSizeKm: string;
  totalAgents: number;
  matchDurationMin: number;
}

export class MissionBriefing extends UIComponent {
  private info: MissionBriefingInfo;
  private resolvePromise?: () => void;
  private autoDismissTimer?: ReturnType<typeof setTimeout>;

  constructor(info: MissionBriefingInfo) {
    super();
    this.info = info;
  }

  protected build(): void {
    this.root.className = styles.overlay;
    this.root.innerHTML = this.buildContent();
  }

  protected onMount(): void {
    const btn = this.$('[data-ref="beginBtn"]');
    if (btn) {
      this.listen(btn, 'click', this.handleBegin);
    }

    // Listen for Enter/Escape as keyboard shortcuts
    this.listen(document, 'keydown', this.handleKeyDown);

    // Safety net auto-dismiss
    this.autoDismissTimer = setTimeout(() => {
      this.dismiss();
    }, AUTO_DISMISS_MS);
  }

  protected onUnmount(): void {
    if (this.autoDismissTimer !== undefined) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = undefined;
    }
  }

  /**
   * Show the briefing and return a Promise that resolves on dismiss.
   */
  show(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
      this.mount(document.body);
    });
  }

  private dismiss(): void {
    if (!this.mounted) return;
    const resolve = this.resolvePromise;
    this.resolvePromise = undefined;
    this.unmount();
    resolve?.();
  }

  private handleBegin = (): void => {
    this.dismiss();
  };

  private handleKeyDown = (e: Event): void => {
    const key = (e as KeyboardEvent).key;
    if (key === 'Enter' || key === 'Escape') {
      this.dismiss();
    }
  };

  private buildContent(): string {
    const { zoneCount, worldSizeKm, totalAgents, matchDurationMin } = this.info;

    return `
      <div class="${styles.card}">
        <div class="${styles.classification}">Classified -- MACV-SOG</div>
        <div class="${styles.title}">Operation: A Shau Valley</div>
        <div class="${styles.subtitle}">Republic of Vietnam, 1968</div>
        <div class="${styles.divider}"></div>
        <div class="${styles.briefingText}">
          The A Shau Valley remains a critical NVA logistics corridor linking the
          Ho Chi Minh Trail to coastal population centers. Enemy forces maintain
          fortified positions across the valley floor and surrounding ridgelines.
          Your task force will conduct air assault operations from eastern LZs to
          disrupt enemy supply lines and seize key terrain objectives.
        </div>
        <div class="${styles.intelGrid}">
          <div class="${styles.intelItem}">
            <span class="${styles.intelLabel}">AO Size</span>
            <span class="${styles.intelValue}">${worldSizeKm} km</span>
          </div>
          <div class="${styles.intelItem}">
            <span class="${styles.intelLabel}">Objectives</span>
            <span class="${styles.intelValue}">${zoneCount} zones</span>
          </div>
          <div class="${styles.intelItem}">
            <span class="${styles.intelLabel}">Est. Forces</span>
            <span class="${styles.intelValue}">${totalAgents.toLocaleString()} combatants</span>
          </div>
          <div class="${styles.intelItem}">
            <span class="${styles.intelLabel}">Op Duration</span>
            <span class="${styles.intelValue}">${matchDurationMin} min</span>
          </div>
        </div>
        <button class="${styles.beginButton}" data-ref="beginBtn">Begin Mission</button>
      </div>
    `;
  }
}
