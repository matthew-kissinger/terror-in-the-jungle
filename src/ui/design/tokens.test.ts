import { describe, it, expect } from 'vitest';
import { colors, zIndex, spacing, fontSize, touchTarget, breakpoints } from './tokens';

describe('Design Tokens', () => {
  describe('colors', () => {
    it('has faction colors', () => {
      expect(colors.us).toBe('#5b8cc9');
      expect(colors.opfor).toBe('#c9564a');
    });

    it('has UI chrome colors', () => {
      expect(colors.primary).toBeDefined();
      expect(colors.secondary).toBeDefined();
      expect(colors.accent).toBeDefined();
    });

    it('has feedback colors', () => {
      expect(colors.success).toBeDefined();
      expect(colors.warning).toBeDefined();
      expect(colors.danger).toBeDefined();
    });

    it('has glass background values', () => {
      expect(colors.glassBg).toContain('rgba');
      expect(colors.hudGlass).toContain('rgba');
    });
  });

  describe('zIndex', () => {
    it('has ascending layer order', () => {
      expect(zIndex.hudBase).toBeLessThan(zIndex.hudElevated);
      expect(zIndex.hudElevated).toBeLessThan(zIndex.hudOverlay);
      expect(zIndex.touchButtons).toBeLessThan(zIndex.notifications);
      expect(zIndex.fullscreen).toBeLessThan(zIndex.modal);
      expect(zIndex.modal).toBeLessThan(zIndex.debug);
    });

    it('touch controls are above HUD', () => {
      expect(zIndex.touchJoystick).toBeGreaterThan(zIndex.hudFeedback);
    });

    it('modals are above fullscreen overlays', () => {
      expect(zIndex.modal).toBeGreaterThan(zIndex.loadingScreen);
    });
  });

  describe('spacing', () => {
    it('has expected scale values', () => {
      expect(spacing.xs).toBe('4px');
      expect(spacing.sm).toBe('8px');
      expect(spacing.lg).toBe('16px');
    });
  });

  describe('fontSize', () => {
    it('uses clamp for responsive sizing', () => {
      expect(fontSize.base).toContain('clamp');
      expect(fontSize['3xl']).toContain('clamp');
    });
  });

  describe('touchTarget', () => {
    it('minimum is at least 44px (WCAG)', () => {
      expect(parseInt(touchTarget.minimum)).toBeGreaterThanOrEqual(44);
    });
  });

  describe('breakpoints', () => {
    it('has ascending breakpoints', () => {
      expect(breakpoints.phone).toBeLessThan(breakpoints.tablet);
      expect(breakpoints.tablet).toBeLessThan(breakpoints.desktop);
      expect(breakpoints.desktop).toBeLessThan(breakpoints.wide);
    });
  });
});
