import { isTouchDevice } from '../../utils/DeviceDetector';

export class WeaponAmmoDisplay {
  public ammoDisplay: HTMLDivElement;

  constructor() {
    this.ammoDisplay = this.createAmmoDisplay();
  }

  private createAmmoDisplay(): HTMLDivElement {
    const display = document.createElement('div');
    display.className = 'ammo-display';
    display.innerHTML = `
      <div class="ammo-counter">
        <span class="ammo-magazine">30</span>
        <span class="ammo-separator">/</span>
        <span class="ammo-reserve">90</span>
      </div>
      <div class="ammo-status"></div>
    `;
    return display;
  }

  updateAmmoDisplay(magazine: number, reserve: number): void {
    const magElement = this.ammoDisplay.querySelector('.ammo-magazine') as HTMLElement;
    const resElement = this.ammoDisplay.querySelector('.ammo-reserve') as HTMLElement;
    const statusElement = this.ammoDisplay.querySelector('.ammo-status') as HTMLElement;

    if (magElement) magElement.textContent = magazine.toString();
    if (resElement) resElement.textContent = reserve.toString();

    // Show status messages
    if (magazine === 0 && reserve > 0) {
      const reloadText = isTouchDevice() ? 'Tap reload' : 'Press R to reload';
      statusElement.textContent = reloadText;
      statusElement.style.color = 'rgba(201, 86, 74, 0.9)';
      magElement.style.color = 'rgba(201, 86, 74, 0.9)';
    } else if (magazine <= 10 && magazine > 0) {
      statusElement.textContent = 'Low ammo';
      statusElement.style.color = 'rgba(212, 163, 68, 0.9)';
      magElement.style.color = 'rgba(212, 163, 68, 0.9)';
    } else if (magazine === 0 && reserve === 0) {
      statusElement.textContent = 'No ammo!';
      statusElement.style.color = 'rgba(184, 58, 94, 0.9)';
      magElement.style.color = 'rgba(184, 58, 94, 0.9)';
    } else {
      statusElement.textContent = '';
      magElement.style.color = 'rgba(220, 225, 230, 0.9)';
    }
  }
}
