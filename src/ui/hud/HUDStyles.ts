import { HUDBaseStyles } from './HUDBaseStyles';
import { HUDZoneStyles } from './HUDZoneStyles';
import { HUDStatusStyles } from './HUDStatusStyles';
import { HUDWeaponStyles } from './HUDWeaponStyles';

/**
 * Main HUD styles singleton - combines all style modules
 */
export class HUDStyles {
  private static instance: HUDStyles;
  private styleSheet?: HTMLStyleElement;

  private readonly styles = [
    HUDBaseStyles,
    HUDZoneStyles,
    HUDStatusStyles,
    HUDWeaponStyles,
  ].join('\n');

  static getInstance(): HUDStyles {
    if (!HUDStyles.instance) {
      HUDStyles.instance = new HUDStyles();
    }
    return HUDStyles.instance;
  }

  inject(): void {
    if (!this.styleSheet) {
      this.styleSheet = document.createElement('style');
      this.styleSheet.textContent = this.styles;
      document.head.appendChild(this.styleSheet);
    }
  }

  dispose(): void {
    if (this.styleSheet && this.styleSheet.parentNode) {
      this.styleSheet.parentNode.removeChild(this.styleSheet);
      this.styleSheet = undefined;
    }
  }
}