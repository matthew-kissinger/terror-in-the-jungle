/**
 * Mortar HUD indicator - shows deployed state, elevation, bearing, and power.
 * Uses design tokens for consistent theming.
 */
import { colors, zIndex, fontStack } from '../design/tokens';

export class MortarIndicator {
  public mortarIndicator: HTMLDivElement;

  constructor() {
    this.mortarIndicator = this.createIndicator();
  }

  private createIndicator(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'mortar-indicator';
    container.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 20px;
      width: 160px;
      display: none;
      flex-direction: column;
      gap: 4px;
      z-index: ${zIndex.hudWeapon};
      pointer-events: none;
      font-family: ${fontStack.hud};
      background: ${colors.hudGlass};
      border: 1px solid ${colors.hudBorder};
      border-radius: 4px;
      padding: 8px 10px;
    `;

    // Header
    const header = document.createElement('div');
    header.className = 'mortar-header';
    header.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      color: ${colors.warning};
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      margin-bottom: 2px;
    `;
    header.textContent = 'MORTAR';

    // Status line
    const status = document.createElement('div');
    status.className = 'mortar-status';
    status.style.cssText = `
      font-size: 10px;
      font-weight: 600;
      color: ${colors.success};
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    status.textContent = 'DEPLOYED';

    // Stats grid
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 8px;
      margin-top: 4px;
    `;

    const labelStyle = `
      font-size: 10px;
      font-weight: 600;
      color: ${colors.textSecondary};
      text-transform: uppercase;
      letter-spacing: 0.3px;
    `;

    const valueStyle = `
      font-size: 12px;
      font-weight: 700;
      color: ${colors.textPrimary};
      text-align: right;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    `;

    // ELEV row
    const elevLabel = document.createElement('div');
    elevLabel.style.cssText = labelStyle;
    elevLabel.textContent = 'ELEV';
    const elevValue = document.createElement('div');
    elevValue.className = 'mortar-elev';
    elevValue.style.cssText = valueStyle;
    elevValue.textContent = '65.0\u00B0';

    // BRG row
    const brgLabel = document.createElement('div');
    brgLabel.style.cssText = labelStyle;
    brgLabel.textContent = 'BRG';
    const brgValue = document.createElement('div');
    brgValue.className = 'mortar-brg';
    brgValue.style.cssText = valueStyle;
    brgValue.textContent = '000\u00B0';

    // PWR row
    const pwrLabel = document.createElement('div');
    pwrLabel.style.cssText = labelStyle;
    pwrLabel.textContent = 'PWR';
    const pwrValue = document.createElement('div');
    pwrValue.className = 'mortar-pwr';
    pwrValue.style.cssText = valueStyle;
    pwrValue.textContent = '50%';

    grid.appendChild(elevLabel);
    grid.appendChild(elevValue);
    grid.appendChild(brgLabel);
    grid.appendChild(brgValue);
    grid.appendChild(pwrLabel);
    grid.appendChild(pwrValue);

    // Power bar
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      width: 100%;
      height: 6px;
      background: ${colors.hudGlass};
      border: 1px solid ${colors.hudBorder};
      border-radius: 2px;
      margin-top: 4px;
      position: relative;
      overflow: hidden;
    `;

    const powerFill = document.createElement('div');
    powerFill.className = 'mortar-power-fill';
    powerFill.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 50%;
      background: linear-gradient(to right, ${colors.warning}, ${colors.headshot});
      transition: width 0.05s linear;
      border-radius: 1px;
    `;

    barContainer.appendChild(powerFill);
    container.appendChild(header);
    container.appendChild(status);
    container.appendChild(grid);
    container.appendChild(barContainer);

    return container;
  }

  show(): void {
    this.mortarIndicator.style.display = 'flex';
  }

  hide(): void {
    this.mortarIndicator.style.display = 'none';
  }

  updateState(pitch: number, yaw: number, power: number, isAiming: boolean): void {
    const status = this.mortarIndicator.querySelector('.mortar-status') as HTMLElement;
    const elevValue = this.mortarIndicator.querySelector('.mortar-elev') as HTMLElement;
    const brgValue = this.mortarIndicator.querySelector('.mortar-brg') as HTMLElement;
    const pwrValue = this.mortarIndicator.querySelector('.mortar-pwr') as HTMLElement;
    const powerFill = this.mortarIndicator.querySelector('.mortar-power-fill') as HTMLElement;

    if (status) {
      status.textContent = isAiming ? 'AIMING' : 'DEPLOYED';
      status.style.color = isAiming ? colors.warning : colors.success;
    }

    if (elevValue) {
      elevValue.textContent = `${pitch.toFixed(1)}\u00B0`;
    }

    if (brgValue) {
      const normalizedYaw = ((yaw % 360) + 360) % 360;
      brgValue.textContent = `${normalizedYaw.toFixed(0).padStart(3, '0')}\u00B0`;
    }

    if (pwrValue) {
      pwrValue.textContent = `${Math.round(power * 100)}%`;
    }

    if (powerFill) {
      powerFill.style.width = `${power * 100}%`;
    }
  }

  dispose(): void {
    if (this.mortarIndicator.parentNode) {
      this.mortarIndicator.parentNode.removeChild(this.mortarIndicator);
    }
  }
}
