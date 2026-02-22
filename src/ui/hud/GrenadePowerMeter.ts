import { colors, fontStack } from '../design/tokens';

export class GrenadePowerMeter {
  public grenadePowerMeter: HTMLDivElement;
  public grenadeCookingTimer?: HTMLDivElement;

  constructor() {
    this.grenadePowerMeter = this.createGrenadePowerMeter();
    this.grenadeCookingTimer = this.grenadePowerMeter.querySelector('.grenade-cooking-timer') as HTMLDivElement;
  }

  private createGrenadePowerMeter(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'grenade-power-meter';
    container.style.cssText = `
      width: 200px;
      height: 30px;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      margin: 120px auto 0;
    `;

    // Label
    const label = document.createElement('div');
    label.style.cssText = `
      font-family: ${fontStack.hud};
      font-size: 11px;
      color: ${colors.textPrimary};
      font-weight: 700;
      text-align: center;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    `;
    label.textContent = 'THROW POWER';

    // Bar container
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      width: 100%;
      height: 10px;
      background: ${colors.hudGlass};
      border: 1px solid ${colors.hudBorder};
      border-radius: 3px;
      position: relative;
      overflow: hidden;
    `;

    // Power fill bar
    const powerFill = document.createElement('div');
    powerFill.className = 'power-fill';
    powerFill.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 30%;
      background: linear-gradient(to right, ${colors.success}, ${colors.heal});
      transition: width 0.05s linear, background 0.1s ease;
      border-radius: 2px;
    `;

    // Power percentage text
    const powerText = document.createElement('div');
    powerText.className = 'power-text';
    powerText.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-family: ${fontStack.hud};
      font-size: 10px;
      font-weight: 700;
      color: ${colors.textPrimary};
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
      z-index: 1;
    `;
    powerText.textContent = '30%';

    // Cooking timer (initially hidden)
    const cookingTimer = document.createElement('div');
    cookingTimer.className = 'grenade-cooking-timer';
    cookingTimer.style.cssText = `
      font-family: ${fontStack.hud};
      font-size: 12px;
      color: ${colors.danger};
      font-weight: 700;
      text-align: center;
      margin-top: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: none;
    `;
    cookingTimer.textContent = 'COOKING: 0.0s';

    barContainer.appendChild(powerFill);
    barContainer.appendChild(powerText);
    container.appendChild(label);
    container.appendChild(barContainer);
    container.appendChild(cookingTimer);

    return container;
  }

  showGrenadePowerMeter(): void {
    this.grenadePowerMeter.style.display = 'flex';
  }

  hideGrenadePowerMeter(): void {
    this.grenadePowerMeter.style.display = 'none';
  }

  updateGrenadePower(power: number, estimatedDistance?: number, cookingTime?: number): void {
    const powerFill = this.grenadePowerMeter.querySelector('.power-fill') as HTMLElement;
    const powerText = this.grenadePowerMeter.querySelector('.power-text') as HTMLElement;
    const label = this.grenadePowerMeter.querySelector('div') as HTMLElement;
    const cookingTimer = this.grenadePowerMeter.querySelector('.grenade-cooking-timer') as HTMLElement;

    if (powerFill && powerText) {
      // Power ranges from 0.3 to 1.0, normalize to 0-100%
      const normalizedPower = ((power - 0.3) / 0.7) * 100;
      const displayPercent = Math.round(power * 100);

      powerFill.style.width = `${normalizedPower}%`;

      // Show distance estimate if available
      if (estimatedDistance !== undefined) {
        powerText.textContent = `~${Math.round(estimatedDistance)}m`;
      } else {
        powerText.textContent = `${displayPercent}%`;
      }

      // Color gradient: muted green (low) -> amber (mid) -> red (max)
      if (normalizedPower < 40) {
        powerFill.style.background = `linear-gradient(to right, ${colors.success}, ${colors.heal})`;
        if (label) label.style.color = colors.success;
      } else if (normalizedPower < 75) {
        powerFill.style.background = `linear-gradient(to right, ${colors.warning}, ${colors.headshot})`;
        if (label) label.style.color = colors.warning;
      } else {
        powerFill.style.background = `linear-gradient(to right, ${colors.danger}, ${colors.opfor})`;
        if (label) label.style.color = colors.danger;
        // Pulse animation at max power
        if (normalizedPower >= 95) {
          powerFill.style.animation = 'pulse-glow 0.5s infinite';
        } else {
          powerFill.style.animation = 'none';
        }
      }
    }

    // Update cooking timer if grenade is being cooked
    if (cookingTimer) {
      if (cookingTime !== undefined && cookingTime > 0) {
        cookingTimer.style.display = 'block';
        const fuseTime = 3.5; // Match FUSE_TIME from GrenadeSystem
        const timeLeft = fuseTime - cookingTime;
        cookingTimer.textContent = `COOKING: ${timeLeft.toFixed(1)}s`;

        // Change color based on time left
        if (timeLeft <= 1.0) {
          cookingTimer.style.color = colors.critical;
          cookingTimer.style.animation = 'pulse-glow 0.3s infinite';
        } else if (timeLeft <= 2.0) {
          cookingTimer.style.color = colors.danger;
          cookingTimer.style.animation = 'pulse-glow 0.6s infinite';
        } else {
          cookingTimer.style.color = colors.warning;
          cookingTimer.style.animation = 'none';
        }
      } else {
        cookingTimer.style.display = 'none';
      }
    }
  }
}
