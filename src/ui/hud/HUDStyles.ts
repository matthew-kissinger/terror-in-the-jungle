import { HUDZoneStyles } from './HUDZoneStyles';

/**
 * HUD styles singleton - injects remaining non-CSS-Module styles.
 * Currently only HUDZoneStyles (ObjectiveDisplay / HUDZoneDisplay) remains.
 * Delete this file once those components are migrated to CSS Modules.
 */
export class HUDStyles {
  private static instance: HUDStyles;
  private styleSheet?: HTMLStyleElement;

  private readonly styles = HUDZoneStyles;

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
