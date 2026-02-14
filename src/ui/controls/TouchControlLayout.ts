/**
 * TouchControlLayout - subscribes to ViewportManager and sets CSS custom
 * properties on document.documentElement so all touch control files can
 * reference responsive sizes via var(--tc-*, fallback).
 */

import { ViewportManager, ViewportInfo } from '../design/responsive';

const CSS_PROPS = [
  '--tc-fire-size',
  '--tc-ads-size',
  '--tc-action-size',
  '--tc-weapon-w',
  '--tc-weapon-h',
  '--tc-joystick-base',
  '--tc-edge-inset',
  '--tc-font-size',
] as const;

export class TouchControlLayout {
  private unsubscribe?: () => void;

  init(): void {
    this.unsubscribe = ViewportManager.getInstance().subscribe((info) => {
      this.applyLayout(info);
    });
  }

  private applyLayout(info: ViewportInfo): void {
    const s = info.scale;
    const root = document.documentElement.style;

    // Touch button sizes scale with viewport
    root.setProperty('--tc-fire-size', `${Math.max(48, Math.round(80 * s))}px`);
    root.setProperty('--tc-ads-size', `${Math.max(44, Math.round(64 * s))}px`);
    root.setProperty('--tc-action-size', `${Math.max(40, Math.round(56 * s))}px`);
    root.setProperty('--tc-weapon-w', `${Math.max(40, Math.round(56 * s))}px`);
    root.setProperty('--tc-weapon-h', `${Math.max(36, Math.round(48 * s))}px`);
    root.setProperty('--tc-joystick-base', `${Math.max(100, Math.round(150 * s))}px`);
    root.setProperty('--tc-edge-inset', `${Math.max(12, Math.round(30 * s))}px`);
    root.setProperty('--tc-font-size', `${Math.max(9, Math.round(12 * s))}px`);
  }

  dispose(): void {
    this.unsubscribe?.();
    // Clean up CSS custom properties
    const root = document.documentElement.style;
    for (const prop of CSS_PROPS) {
      root.removeProperty(prop);
    }
  }
}
