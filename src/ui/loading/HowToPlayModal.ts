/**
 * HowToPlayModal - device-aware controls reference overlay.
 */

import { colors, zIndex, borderRadius, fontStack } from '../design/tokens';
import { isTouchDevice } from '../../utils/DeviceDetector';

export class HowToPlayModal {
  private panel: HTMLDivElement;

  private handleClose = () => this.hide();
  private handleBgClick = (e: PointerEvent) => {
    if (e.target === this.panel) this.hide();
  };

  constructor() {
    this.panel = document.createElement('div');
    this.panel.className = 'how-to-play-modal';
    Object.assign(this.panel.style, {
      display: 'none',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: String(zIndex.modalOverlay),
      justifyContent: 'center',
      alignItems: 'center',
      overflowY: 'auto',
      touchAction: 'manipulation',
    } as Partial<CSSStyleDeclaration>);

    const touchControls = `
      <li>Left Joystick -- Move</li>
      <li>Sprint Button -- Sprint</li>
      <li>Drag Screen -- Look around</li>
      <li>Fire Button -- Fire weapon</li>
      <li>Aim Button -- Aim down sights</li>
      <li>Jump Button -- Jump</li>
    `;

    const kbmControls = `
      <li>WASD -- Move</li>
      <li>SHIFT -- Sprint</li>
      <li>SPACE -- Jump</li>
      <li>Mouse -- Look around</li>
      <li>Left Click -- Fire</li>
      <li>Right Click -- Aim down sights</li>
      <li>R -- Reload</li>
      <li>G -- Grenade</li>
      <li>1-6 -- Switch weapon</li>
      <li>TAB -- Scoreboard</li>
      <li>ESC -- Release mouse</li>
    `;

    const gamepadControls = `
      <li>Left Stick -- Move</li>
      <li>Right Stick -- Look around</li>
      <li>RT / R2 -- Fire weapon</li>
      <li>LT / L2 -- Aim down sights</li>
      <li>A / Cross -- Jump</li>
      <li>B / Circle -- Reload</li>
      <li>X / Square -- Interact</li>
      <li>Y / Triangle -- Switch weapon</li>
      <li>LB / L1 -- Grenade</li>
      <li>RB / R1 -- Sprint (hold)</li>
      <li>D-Pad -- Weapon slots</li>
      <li>Start -- Menu</li>
      <li>Back -- Scoreboard</li>
    `;

    const isTouch = isTouchDevice();
    const primaryControls = isTouch ? touchControls : kbmControls;
    const secondarySection = isTouch
      ? '' // Touch devices typically don't have gamepads, skip section
      : `
        <h3 class="htp-heading">GAMEPAD</h3>
        <ul class="htp-list">${gamepadControls}</ul>
      `;

    this.panel.innerHTML = `
      <div class="htp-inner" style="
        background: rgba(8, 16, 24, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid ${colors.glassBorderBright};
        border-radius: ${borderRadius.xl};
        padding: 1.5rem 2rem;
        max-width: min(520px, 90vw);
        max-height: min(85vh, 720px);
        overflow-y: auto;
        width: 100%;
        box-sizing: border-box;
        color: ${colors.textPrimary};
        font-family: 'Rajdhani', ${fontStack.ui};
        margin: 20px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
      ">
        <h2 style="
          color: ${colors.textPrimary};
          margin: 0 0 1rem;
          font-weight: 600;
          font-size: 1.2rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          opacity: 0.9;
        ">HOW TO PLAY</h2>

        <h3 class="htp-heading">${isTouch ? 'TOUCH CONTROLS' : 'KEYBOARD & MOUSE'}</h3>
        <ul class="htp-list">${primaryControls}</ul>

        ${secondarySection}

        <h3 class="htp-heading">OBJECTIVE</h3>
        <p class="htp-text">Capture and hold zones to drain enemy tickets. The team that runs out of tickets first loses.</p>

        <h3 class="htp-heading">COMBAT</h3>
        <ul class="htp-list">
          <li>Headshots deal 70% more damage</li>
          <li>Use vegetation for cover</li>
          <li>Listen for enemy gunfire to locate threats</li>
          <li>Stay mobile to avoid being targeted</li>
        </ul>

        <button class="close-how-to-play htp-close-btn" type="button">CLOSE</button>
      </div>

      <style>
        .htp-heading {
          color: ${colors.primary};
          margin: 1rem 0 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.8;
        }
        .htp-list {
          list-style: none;
          padding: 0;
          margin: 0;
          color: ${colors.textSecondary};
          font-size: 0.85rem;
          line-height: 1.8;
        }
        .htp-list li::before {
          content: '>';
          color: ${colors.primary};
          margin-right: 0.5rem;
          opacity: 0.5;
          font-weight: 600;
        }
        .htp-text {
          color: ${colors.textSecondary};
          font-size: 0.85rem;
          line-height: 1.6;
          margin: 0;
        }
        .htp-close-btn {
          margin-top: 1.25rem;
          width: 100%;
          padding: 0.65rem;
          min-height: 44px;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          background: linear-gradient(135deg, ${colors.secondary}, ${colors.primary});
          color: white;
          border: 1px solid ${colors.glassBorderBright};
          border-radius: ${borderRadius.pill};
          cursor: pointer;
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          transition: all 0.2s;
        }
        .htp-close-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(90, 143, 181, 0.3);
        }
      </style>
    `;

    document.body.appendChild(this.panel);

    const closeBtn = this.panel.querySelector('.close-how-to-play');
    closeBtn?.addEventListener('pointerdown', this.handleClose);
    closeBtn?.addEventListener('click', (e) => e.preventDefault());

    this.panel.addEventListener('pointerdown', this.handleBgClick);
    this.panel.addEventListener('click', (e) => e.preventDefault());
  }

  show(): void {
    this.panel.style.display = 'flex';
  }

  hide(): void {
    this.panel.style.display = 'none';
  }

  dispose(): void {
    const closeBtn = this.panel.querySelector('.close-how-to-play');
    closeBtn?.removeEventListener('pointerdown', this.handleClose);
    this.panel.removeEventListener('pointerdown', this.handleBgClick);
    this.panel.remove();
  }
}
