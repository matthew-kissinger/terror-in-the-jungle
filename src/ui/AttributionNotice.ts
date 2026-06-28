// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * In-app attribution / AGPL "Appropriate Legal Notices".
 *
 * Renders a persistent, visible copyright + source-availability notice (required
 * for an AGPL-licensed network application) and a Credits / About panel.
 * Modified versions must preserve these notices in reasonably visible locations
 * (see LICENSING.md).
 */

export const COPYRIGHT_LINE = '© 2025-2026 Matthew Kissinger and contributors';
export const SOURCE_LABEL = 'github.com/matthew-kissinger/terror-in-the-jungle';
export const SOURCE_HREF = 'https://github.com/matthew-kissinger/terror-in-the-jungle';
/** Compact single-line notice: "(c) ... — source (AGPL-3.0): github.com/...". */
export const ATTRIBUTION_LINE = `${COPYRIGHT_LINE} — source (AGPL-3.0): ${SOURCE_LABEL}`;

const CREDIT_ID = 'app-attribution-credit';
const PANEL_ID = 'app-credits-panel';

/**
 * Mount the small always-visible corner notice (idempotent). It is purely
 * visual (`pointer-events: none`) so it never intercepts gameplay input or
 * touch controls; the clickable source link lives in the Credits panel.
 */
export function mountPersistentAttribution(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.getElementById(CREDIT_ID)) return;

  const el = document.createElement('div');
  el.id = CREDIT_ID;
  el.textContent = ATTRIBUTION_LINE;
  el.title = ATTRIBUTION_LINE;
  el.setAttribute('aria-hidden', 'false');
  // Bottom-CENTER, flush to the screen edge. The bottom-left corner is the
  // health pill's slot and the bottom-right is the ammo slot (see
  // HUDLayoutStyles grid), so a left/bottom-anchored notice overlaps the
  // health readout. The weapon bar sits in the bottom-center *row* but its
  // content is vertically centered, not flush, so this 10px line tucks
  // beneath it. Stays pointer-events:none so it never steals input.
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '2px',
    transform: 'translateX(-50%)',
    zIndex: '2147482000',
    maxWidth: 'min(70vw, 540px)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    font: '10px/1.3 "Courier Prime", "Courier New", monospace',
    color: 'rgba(231, 217, 186, 0.55)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.75)',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
}

/** Show the Credits / About panel with the full AGPL + CC BY-SA notice. */
export function showCreditsPanel(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (document.getElementById(PANEL_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = PANEL_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Credits and license');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(26, 20, 12, 0.80)',
    padding: '16px',
  } as Partial<CSSStyleDeclaration>);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    maxWidth: 'min(540px, 92vw)',
    maxHeight: '86vh',
    overflow: 'auto',
    background: 'linear-gradient(180deg, #e7d9ba, #cdba8e)',
    color: '#2b2620',
    border: '1px solid rgba(43, 38, 32, 0.4)',
    borderRadius: '6px',
    padding: '20px 22px',
    font: '13px/1.55 "Courier Prime", "Courier New", monospace',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.42)',
  } as Partial<CSSStyleDeclaration>);
  panel.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:20px;letter-spacing:0.04em;text-transform:uppercase;">Terror in the Jungle</h2>
    <p style="margin:0 0 14px;color:rgba(43,38,32,0.72);text-transform:uppercase;letter-spacing:0.06em;font-size:11px;">Credits &amp; License</p>
    <p style="margin:0 0 10px;"><strong>${COPYRIGHT_LINE}.</strong></p>
    <p style="margin:0 0 10px;">This program is free software, licensed under the
      <strong>GNU Affero General Public License, version 3 or later</strong>. It
      comes with ABSOLUTELY NO WARRANTY. You may redistribute it under the AGPL,
      and — because it is served over a network — its users are entitled
      to the corresponding source.</p>
    <p style="margin:0 0 10px;">Source code:
      <a href="${SOURCE_HREF}" target="_blank" rel="noopener noreferrer"
         style="color:#4f6b3a;font-weight:700;">${SOURCE_LABEL}</a></p>
    <p style="margin:0 0 10px;">Original game art, models, audio, and UI by
      Matthew Kissinger are licensed <strong>CC BY-SA 4.0</strong>. Real-world
      terrain elevation (USGS 3DEP) is public domain; bundled fonts and software
      libraries retain their own licenses. See LICENSE, LICENSE-ASSETS, and
      THIRD-PARTY-ASSETS.md.</p>
    <p style="margin:0 0 18px;color:rgba(43,38,32,0.72);">Modified versions must
      preserve these notices in reasonably visible locations.</p>
    <button data-ref="close" type="button"
      style="display:block;margin-left:auto;padding:9px 20px;font:700 13px 'Courier Prime','Courier New',monospace;
             text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;
             background:#9e3b2e;color:#e7d9ba;border:none;border-radius:4px;">Close</button>
  `;

  const close = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  panel.querySelector('[data-ref="close"]')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', onKey);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
