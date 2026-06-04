// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared style utilities — Field Journal design system.
 *
 * `injectSharedStyles()` (called once at bootstrap) installs:
 *   1. the JS-token mirror as `--ds-*` custom properties,
 *   2. shared keyframes,
 *   3. the Field Journal shared primitives — texture layers + component
 *      utilities (stamp, tape, paperclip, manila panel, folder tabs, buttons,
 *      status pills, margin notes) consumed by every surface.
 *
 * Surface-specific CSS still lives in each component's *.module.css; only the
 * genuinely shared primitives live here. See docs/FIELD_JOURNAL_UI.md.
 */

import { colors, fontStack, zIndex } from './tokens';

/** Shared keyframe animations */
const sharedAnimations = `
  @keyframes ds-fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes ds-fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes ds-fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes ds-pulse {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }

  @keyframes ds-pulseGlow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(158, 59, 46, 0.5);
      opacity: 1;
    }
    50% {
      box-shadow: 0 0 15px rgba(158, 59, 46, 0.8);
      opacity: 0.9;
    }
  }

  @keyframes ds-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes ds-gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
`;

/**
 * Field Journal shared primitives — texture layers, fasteners, manila panels,
 * stamps, buttons, status pills, folder tabs. Class-prefixed `fj-` to avoid
 * collisions with scoped CSS-module classes. Tokens (--paper, --ink, --red…)
 * come from primitives.css / theme.css, loaded before this runs.
 */
const fieldJournalPrimitives = `
  /* ---- texture layers (mount inside a z-managed surface container) ---- */
  .fj-paper-grain,
  .fj-topo-lines,
  .fj-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fj-paper-grain {
    opacity: 0.5;
    mix-blend-mode: multiply;
    background-image:
      radial-gradient(rgba(90, 70, 40, 0.18) 0.6px, transparent 0.7px),
      radial-gradient(rgba(120, 100, 60, 0.12) 0.5px, transparent 0.6px);
    background-size: 3px 3px, 5px 5px;
    background-position: 0 0, 2px 3px;
  }
  .fj-topo-lines {
    opacity: 0.2;
    background-image:
      repeating-linear-gradient(0deg, transparent 0 23px, rgba(79, 107, 58, 0.5) 23px 24px),
      repeating-linear-gradient(90deg, transparent 0 23px, rgba(79, 107, 58, 0.5) 23px 24px);
  }
  .fj-vignette {
    box-shadow: inset 0 0 180px 40px rgba(60, 48, 28, 0.35);
    background: radial-gradient(110% 80% at 50% 40%, transparent 60%, rgba(60, 48, 28, 0.22) 100%);
  }

  /* ---- manila panel / card ---- */
  .fj-panel {
    background: linear-gradient(180deg, var(--paper-lt), var(--paper));
    border: 1px solid var(--paper-edge);
    border-radius: var(--r);
    box-shadow: 2px 3px 8px var(--shadow), 0 1px 0 rgba(255, 255, 255, 0.4) inset;
  }

  /* ---- rubber stamps ---- */
  .fj-stamp {
    font-family: var(--type-stamp);
    letter-spacing: 0.12em;
    color: var(--red);
    border: 2.5px solid var(--red);
    padding: 3px 10px;
    border-radius: var(--r-sm);
    display: inline-block;
    opacity: 0.82;
    mix-blend-mode: multiply;
    text-transform: uppercase;
    box-shadow: 0 0 0 1px rgba(158, 59, 46, 0.25) inset;
    -webkit-mask-image: radial-gradient(circle at 30% 30%, #000 70%, rgba(0, 0, 0, 0.6) 100%);
    mask-image: radial-gradient(circle at 30% 30%, #000 70%, rgba(0, 0, 0, 0.6) 100%);
  }
  .fj-stamp--green {
    color: var(--green);
    border-color: var(--green);
    box-shadow: 0 0 0 1px rgba(79, 107, 58, 0.25) inset;
  }

  /* ---- tape & paperclip fasteners ---- */
  .fj-tape {
    position: absolute;
    width: 86px;
    height: 26px;
    background: var(--tape);
    border-left: 1px dashed rgba(120, 100, 60, 0.4);
    border-right: 1px dashed rgba(120, 100, 60, 0.4);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .fj-paperclip {
    position: absolute;
    top: -14px;
    left: 22px;
    width: 16px;
    height: 42px;
    border: 3px solid #6e6655;
    border-radius: 10px;
    border-bottom-color: #8a8170;
    transform: rotate(-8deg);
    box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
  }
  .fj-paperclip::after {
    content: "";
    position: absolute;
    top: 7px;
    left: 2px;
    width: 8px;
    height: 26px;
    border: 3px solid #7a7160;
    border-radius: 8px;
    border-top: none;
  }

  /* ---- margin handwriting + dashed divider ---- */
  .fj-margin-note {
    font-family: var(--hand);
    color: var(--red-dk);
    font-size: 22px;
    line-height: 1.05;
    transform: rotate(-3deg);
    opacity: 0.9;
  }
  .fj-divider {
    border: none;
    border-top: 1px dashed var(--ink-faint);
    margin: 0;
  }

  /* ---- buttons ---- */
  .fj-btn {
    appearance: none;
    font-family: var(--type-stamp);
    letter-spacing: 0.1em;
    cursor: pointer;
    border-radius: var(--r);
    min-height: 48px;
    padding: 0 22px;
    font-size: 16px;
    transition: transform .1s, box-shadow .12s, background .12s, color .12s;
    position: relative;
  }
  .fj-btn:active { transform: translateY(1px); }
  .fj-btn--deploy {
    color: var(--red);
    background: var(--paper-lt);
    border: 2.5px solid var(--red);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
    box-shadow: 2px 2px 0 rgba(124, 44, 34, 0.35);
  }
  .fj-btn--deploy:hover {
    background: #f0e4c6;
    box-shadow: 3px 3px 0 rgba(124, 44, 34, 0.4);
  }
  .fj-btn--ghost {
    color: var(--ink-soft);
    background: transparent;
    border: 1.5px solid var(--ink-faint);
    border-bottom-style: dashed;
  }
  .fj-btn--ghost:hover { color: var(--ink); border-color: var(--ink); }
  .fj-link-btn {
    appearance: none;
    background: none;
    border: none;
    font-family: var(--type);
    color: var(--ink-soft);
    font-size: 13px;
    letter-spacing: 0.08em;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 3px;
    min-height: 44px;
    padding: 0 6px;
  }
  .fj-link-btn:hover { color: var(--red); }

  /* ---- status pills ---- */
  .fj-status {
    font-family: var(--type);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .fj-status--secure {
    color: var(--green-dk);
    background: rgba(79, 107, 58, 0.16);
    border: 1px solid rgba(79, 107, 58, 0.4);
  }
  .fj-status--contested {
    color: var(--warn);
    background: rgba(168, 116, 42, 0.14);
    border: 1px solid rgba(168, 116, 42, 0.4);
  }
  .fj-status--hot {
    color: var(--red);
    background: rgba(158, 59, 46, 0.14);
    border: 1px solid rgba(158, 59, 46, 0.5);
    font-weight: 700;
  }

  /* ---- folder-tab navigation ---- */
  .fj-folder-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px 0;
    justify-content: center;
    background: linear-gradient(180deg, var(--paper-dk), rgba(196, 177, 134, 0));
    border-bottom: 1px solid rgba(43, 38, 32, 0.18);
  }
  .fj-tab {
    appearance: none;
    font-family: var(--type-stamp);
    font-size: 13px;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
    background: linear-gradient(180deg, var(--paper-lt), var(--paper-dk));
    border: 1px solid var(--paper-edge);
    border-bottom: none;
    border-radius: 7px 7px 0 0;
    padding: 0 14px;
    min-height: 44px;
    min-width: 64px;
    cursor: pointer;
    position: relative;
    top: 2px;
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.4) inset;
    transition: top .12s, color .12s, background .12s;
  }
  .fj-tab:hover { color: var(--ink); top: 0; }
  .fj-tab[aria-current="true"] {
    color: var(--red);
    background: linear-gradient(180deg, #ece0c2, var(--paper));
    top: 0;
    font-weight: 700;
    z-index: 2;
  }

  /* ---- focus + keyframes ---- */
  .fj-panel :focus-visible,
  .fj-btn:focus-visible,
  .fj-tab:focus-visible,
  .fj-link-btn:focus-visible {
    outline: 2px dashed var(--red);
    outline-offset: 2px;
  }

  @keyframes fj-sheetIn {
    from { opacity: 0; transform: translateY(8px) rotate(-0.2deg); }
    to { opacity: 1; transform: none; }
  }
  @keyframes fj-circlePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.12); }
  }
  @keyframes fj-kfIn {
    from { opacity: 0; transform: translateX(10px); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    [class*="fj-"] {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
`;

/**
 * Inject shared CSS custom properties, keyframes, and Field Journal primitives
 * onto the document. Call once at bootstrap before any UI is created.
 */
export function injectSharedStyles(): void {
  if (document.getElementById('ds-shared-styles')) return;

  const style = document.createElement('style');
  style.id = 'ds-shared-styles';
  style.textContent = `
    :root {
      --ds-color-us: ${colors.us};
      --ds-color-opfor: ${colors.opfor};
      --ds-color-primary: ${colors.primary};
      --ds-color-secondary: ${colors.secondary};
      --ds-color-accent: ${colors.accent};
      --ds-color-text-primary: ${colors.textPrimary};
      --ds-color-text-secondary: ${colors.textSecondary};
      --ds-color-success: ${colors.success};
      --ds-color-warning: ${colors.warning};
      --ds-color-danger: ${colors.danger};
      --ds-glass-bg: ${colors.glassBg};
      --ds-glass-border: ${colors.glassBorder};
      --ds-hud-glass: ${colors.hudGlass};
      --ds-hud-border: ${colors.hudBorder};
      --ds-z-hud-base: ${zIndex.hudBase};
      --ds-z-touch-buttons: ${zIndex.touchButtons};
      --ds-z-modal: ${zIndex.modal};
      --ds-font-ui: ${fontStack.ui};
      --ds-font-mono: ${fontStack.mono};
      --ds-font-stamp: ${fontStack.stamp};
      --ds-font-hand: ${fontStack.hand};
    }

    ${sharedAnimations}
    ${fieldJournalPrimitives}
  `;

  document.head.appendChild(style);
}

/**
 * Build the three Field Journal texture layers (paper grain, topo lines,
 * vignette) inside a wrapper. Mount into a positioned, z-managed surface
 * container — NOT directly on <body>, so it never overlays the combat canvas.
 */
export function createTextureLayers(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  for (const cls of ['fj-paper-grain', 'fj-topo-lines', 'fj-vignette']) {
    const layer = document.createElement('div');
    layer.className = cls;
    wrap.appendChild(layer);
  }
  return wrap;
}
