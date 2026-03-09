/**
 * OnboardingOverlay - Multi-page tutorial slideshow.
 *
 * Opt-in tutorial accessible from the start screen TUTORIAL button.
 * Shows 5 pages covering movement, combat, helicopter, objectives,
 * and tips. Device-aware: shows KBM or touch controls.
 *
 * Uses FocusTrap, role="dialog", aria-modal="true", Escape-to-close.
 */

import { UIComponent } from '../engine/UIComponent';
import { FocusTrap } from '../engine/FocusTrap';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { iconHtml } from '../icons/IconRegistry';
import styles from './OnboardingOverlay.module.css';

const TUTORIAL_SEEN_KEY = 'terror_tutorial_seen';
const TOTAL_PAGES = 5;

interface TutorialPage {
  title: string;
  content: string;
}

function hintImg(filename: string, alt: string): string {
  return iconHtml(filename.replace('.png', ''), { width: 24, alt, css: 'vertical-align:middle;margin-right:6px;' });
}

function buildPages(isTouch: boolean): TutorialPage[] {
  return [
    {
      title: 'MOVEMENT',
      content: isTouch
        ? `
          <p class="${styles.pageText}">${hintImg('hint-joystick.png', 'Joystick')}Use the left joystick to move and drag the screen to look around.</p>
          <ul class="${styles.pageList}">
            <li>Left Joystick -- Move</li>
            <li>Drag Screen -- Look around</li>
            <li>Sprint Button -- Sprint</li>
            <li>Jump Button -- Jump</li>
          </ul>
        `
        : `
          <p class="${styles.pageText}">${hintImg('hint-wasd.png', 'WASD keys')}WASD to move, ${hintImg('hint-mouse.png', 'Mouse')}Mouse to look. Hold Shift to sprint, Space to jump.</p>
          <ul class="${styles.pageList}">
            <li>W/A/S/D -- Move forward/left/back/right</li>
            <li>Mouse -- Look around</li>
            <li>Shift -- Sprint</li>
            <li>Space -- Jump</li>
          </ul>
        `,
    },
    {
      title: 'COMBAT',
      content: isTouch
        ? `
          <p class="${styles.pageText}">${hintImg('hint-swipe.png', 'Swipe')}Use the FIRE and ADS buttons to engage enemies. Swipe the weapon bar to switch weapons.</p>
          <ul class="${styles.pageList}">
            <li>Fire Button -- Fire weapon</li>
            <li>ADS Button -- Aim down sights</li>
            <li>Swipe Weapon Bar -- Switch weapon</li>
            <li>Grenade Button -- Throw grenade</li>
            <li>Reload Button -- Reload</li>
          </ul>
        `
        : `
          <p class="${styles.pageText}">${hintImg('hint-mouse.png', 'Mouse')}Left-click to fire, right-click to aim down sights. Switch weapons with number keys.</p>
          <ul class="${styles.pageList}">
            <li>Left Click -- Fire weapon</li>
            <li>Right Click -- Aim down sights</li>
            <li>1-6 -- Switch weapon</li>
            <li>G -- Throw grenade</li>
            <li>R -- Reload</li>
          </ul>
        `,
    },
    {
      title: 'HELICOPTER',
      content: isTouch
        ? `
          <p class="${styles.pageText}">Tap a helicopter to enter it. Use the on-screen joysticks to fly.</p>
          <ul class="${styles.pageList}">
            <li>Interact Button -- Enter/Exit helicopter</li>
            <li>Left Joystick -- Collective (altitude) + Yaw</li>
            <li>Right Joystick -- Cyclic (pitch/roll)</li>
          </ul>
        `
        : `
          <p class="${styles.pageText}">${hintImg('hint-e-key.png', 'E key')}Press E near a helicopter to enter. Master altitude and rotation to navigate the battlefield.</p>
          <ul class="${styles.pageList}">
            <li>E -- Enter/Exit helicopter</li>
            <li>W/S -- Collective (altitude up/down)</li>
            <li>A/D -- Yaw (rotate left/right)</li>
            <li>Arrow Keys -- Cyclic (pitch and roll)</li>
            <li>Shift -- Engine boost</li>
            <li>Space -- Auto-hover toggle</li>
            <li>G -- Deploy squad (low hover)</li>
            <li>Right Ctrl -- Camera mode</li>
          </ul>
        `,
    },
    {
      title: 'OBJECTIVES',
      content: `
        <h4 class="${styles.subheading}">Team Deathmatch</h4>
        <p class="${styles.pageText}">Eliminate enemy combatants to deplete their tickets. The team that runs out of tickets first loses.</p>

        <h4 class="${styles.subheading}">Zone Control</h4>
        <p class="${styles.pageText}">Capture and hold zones across the map. Controlling more zones drains enemy tickets faster.</p>

        <h4 class="${styles.subheading}">Open Frontier</h4>
        <p class="${styles.pageText}">Large open battlefield. Find helicopters, explore the terrain, and engage enemies across a wide area.</p>

        <h4 class="${styles.subheading}">A Shau Valley</h4>
        <p class="${styles.pageText}">Strategic warfare on a massive DEM-based map. Thousands of agents operating across 18 zones. Coordinate with your forces for victory.</p>
      `,
    },
    {
      title: 'TIPS',
      content: isTouch
        ? `
          <ul class="${styles.pageList}">
            <li>Tap spawn points on the respawn map to choose where to deploy</li>
            <li>Use vegetation and terrain for cover</li>
            <li>Headshots deal 70% more damage</li>
            <li>Stay mobile to avoid being targeted</li>
            <li>Listen for enemy gunfire to locate threats</li>
          </ul>
        `
        : `
          <ul class="${styles.pageList}">
            <li>Z -- Open squad command overlay</li>
            <li>G (in helicopter, low hover) -- Deploy squad to ground</li>
            <li>Click spawn points on the respawn map to choose where to deploy</li>
            <li>Scroll wheel on minimap -- Zoom in/out</li>
            <li>Use vegetation and terrain for cover</li>
            <li>Headshots deal 70% more damage</li>
            <li>Stay mobile to avoid being targeted</li>
            <li>TAB -- View scoreboard</li>
          </ul>
        `,
    },
  ];
}

export class OnboardingOverlay extends UIComponent {
  private visible = this.signal(false);
  private currentPage = this.signal(0);
  private focusTrap: FocusTrap | null = null;

  protected build(): void {
    this.root.className = styles.overlay;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Tutorial');

    const isTouch = isTouchDevice();
    const pages = buildPages(isTouch);

    const pagesHTML = pages
      .map(
        (page, i) => `
        <div class="${styles.page}" data-page="${i}">
          <h3 class="${styles.pageTitle}">${page.title}</h3>
          ${page.content}
        </div>
      `
      )
      .join('');

    const dotsHTML = pages
      .map((_, i) => `<span class="${styles.dot}" data-dot="${i}"></span>`)
      .join('');

    this.root.innerHTML = `
      <div class="${styles.card}">
        <h2 class="${styles.title}">TUTORIAL</h2>

        <div class="${styles.pageContainer}" data-ref="pageContainer">
          ${pagesHTML}
        </div>

        <div class="${styles.nav}">
          <div class="${styles.dots}" data-ref="dots">${dotsHTML}</div>
          <div class="${styles.buttons}">
            <button class="${styles.navBtn}" data-ref="prev" type="button">Previous</button>
            <button class="${styles.navBtn}" data-ref="next" type="button">Next</button>
            <button class="${styles.closeBtn}" data-ref="close" type="button" aria-label="Close">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  protected onMount(): void {
    this.focusTrap = new FocusTrap(this.root);

    // Visibility toggle
    this.effect(() => {
      const vis = this.visible.value;
      this.toggleClass(styles.visible, vis);
      if (vis) {
        this.focusTrap?.activate();
      } else {
        this.focusTrap?.deactivate();
      }
    });

    // Page navigation effect
    this.effect(() => {
      const page = this.currentPage.value;
      this.updatePageDisplay(page);
    });

    // Previous button
    const prevBtn = this.$('[data-ref="prev"]');
    if (prevBtn) {
      this.listen(prevBtn, 'pointerdown', () => this.goToPreviousPage());
      this.listen(prevBtn, 'click', (e) => e.preventDefault());
    }

    // Next button
    const nextBtn = this.$('[data-ref="next"]');
    if (nextBtn) {
      this.listen(nextBtn, 'pointerdown', () => this.goToNextPage());
      this.listen(nextBtn, 'click', (e) => e.preventDefault());
    }

    // Close button
    const closeBtn = this.$('[data-ref="close"]');
    if (closeBtn) {
      this.listen(closeBtn, 'pointerdown', () => this.hide());
      this.listen(closeBtn, 'click', (e) => e.preventDefault());
    }

    // Escape key to close
    this.listen(this.root, 'keydown', (e) => {
      if (e.key === 'Escape' && this.visible.value) {
        this.hide();
      }
    });

    // Click backdrop to close
    this.listen(this.root, 'pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    this.listen(this.root, 'click', (e) => e.preventDefault());
  }

  protected onUnmount(): void {
    this.focusTrap?.dispose();
    this.focusTrap = null;
  }

  // --- Public API ---

  show(): void {
    this.currentPage.value = 0;
    this.visible.value = true;
  }

  hide(): void {
    this.visible.value = false;
  }

  // --- Private ---

  private goToNextPage(): void {
    if (this.currentPage.value < TOTAL_PAGES - 1) {
      this.currentPage.value++;
      if (this.currentPage.value === TOTAL_PAGES - 1) {
        this.markTutorialSeen();
      }
    }
  }

  private goToPreviousPage(): void {
    if (this.currentPage.value > 0) {
      this.currentPage.value--;
    }
  }

  private updatePageDisplay(activeIndex: number): void {
    // Update page visibility
    const pageElements = this.root.querySelectorAll(`[data-page]`);
    for (const el of pageElements) {
      const pageIndex = Number((el as HTMLElement).dataset.page);
      el.classList.toggle(styles.pageActive, pageIndex === activeIndex);
    }

    // Update dot indicators
    const dotElements = this.root.querySelectorAll(`[data-dot]`);
    for (const el of dotElements) {
      const dotIndex = Number((el as HTMLElement).dataset.dot);
      el.classList.toggle(styles.dotActive, dotIndex === activeIndex);
    }

    // Update button states
    const prevBtn = this.$('[data-ref="prev"]') as HTMLButtonElement | null;
    const nextBtn = this.$('[data-ref="next"]') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = activeIndex === 0;
    if (nextBtn) nextBtn.disabled = activeIndex === TOTAL_PAGES - 1;
  }

  private markTutorialSeen(): void {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
    } catch {
      // localStorage may be unavailable (private browsing, storage full)
    }
  }
}
