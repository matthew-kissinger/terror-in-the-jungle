// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * DOM construction for the asset gallery review surface: the class-grouped
 * sidebar list, the per-asset info chip, and the controls bar. Kept apart from
 * AssetGalleryApp so the Three.js scene file stays under the source budget.
 *
 * This module only builds + styles elements and wires click handlers; all
 * scene/asset state lives in AssetGalleryApp.
 */

import type { WarAssetEntry } from '../../config/generated/warAssetCatalog';
import { type GalleryGroup, budgetReason } from './galleryCatalog';

const STATUS_COLOR: Record<WarAssetEntry['budgetStatus'], string> = {
  PASS: '#7bd16a',
  EXCEPTION: '#e8b23a',
  REJECT: '#e0564f',
};

export interface GallerySidebar {
  readonly root: HTMLDivElement;
  readonly buttons: Map<string, HTMLButtonElement>;
  setActive(slug: string): void;
}

export function createSidebar(
  groups: readonly GalleryGroup[],
  onSelect: (slug: string) => void,
): GallerySidebar {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    bottom: '0',
    width: '244px',
    overflowY: 'auto',
    padding: '10px 0 24px',
    background: 'rgba(12, 14, 13, 0.86)',
    borderRight: '1px solid rgba(255,255,255,0.12)',
    fontFamily: '"Courier Prime", Consolas, monospace',
    fontSize: '12px',
    color: '#e7ffe0',
    zIndex: '9998',
  } as CSSStyleDeclaration);

  const title = document.createElement('div');
  title.textContent = 'WAR ASSET GALLERY';
  Object.assign(title.style, {
    padding: '4px 14px 10px',
    letterSpacing: '0.12em',
    fontWeight: '700',
  } as CSSStyleDeclaration);
  root.appendChild(title);

  const buttons = new Map<string, HTMLButtonElement>();
  for (const group of groups) {
    const heading = document.createElement('div');
    heading.textContent = `${group.className.toUpperCase()} (${group.entries.length})`;
    Object.assign(heading.style, {
      padding: '12px 14px 4px',
      color: '#9bbf86',
      letterSpacing: '0.08em',
    } as CSSStyleDeclaration);
    root.appendChild(heading);

    for (const entry of group.entries) {
      const button = makeAssetButton(entry, () => onSelect(entry.slug));
      buttons.set(entry.slug, button);
      root.appendChild(button);
    }
  }

  const setActive = (slug: string): void => {
    for (const [key, button] of buttons) {
      button.style.background = key === slug ? 'rgba(123, 209, 106, 0.18)' : 'transparent';
    }
  };

  return { root, buttons, setActive };
}

function makeAssetButton(entry: WarAssetEntry, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.dataset.slug = entry.slug;
  Object.assign(button.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '4px 14px',
    border: 'none',
    background: 'transparent',
    color: '#e7ffe0',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  } as CSSStyleDeclaration);

  const dot = document.createElement('span');
  Object.assign(dot.style, {
    flex: '0 0 auto',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: STATUS_COLOR[entry.budgetStatus],
  } as CSSStyleDeclaration);

  const label = document.createElement('span');
  label.textContent = entry.slug;
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.whiteSpace = 'nowrap';

  button.appendChild(dot);
  button.appendChild(label);
  button.addEventListener('click', onClick);
  return button;
}

export function createInfoChip(): HTMLDivElement {
  const chip = document.createElement('div');
  Object.assign(chip.style, {
    position: 'fixed',
    right: '14px',
    top: '14px',
    width: '300px',
    padding: '12px 14px',
    background: 'rgba(12, 14, 13, 0.86)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '6px',
    fontFamily: '"Courier Prime", Consolas, monospace',
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#e7ffe0',
    whiteSpace: 'pre-wrap',
    zIndex: '9998',
  } as CSSStyleDeclaration);
  return chip;
}

/** Render the info-chip body for one asset (load status appended by caller). */
export function describeEntry(entry: WarAssetEntry, loadStatus: string, jointSpin: boolean): string {
  const [w, h, d] = entry.dims;
  const joints = entry.joints?.map((j) => j.name).join(', ') ?? 'none';
  const lines = [
    entry.slug,
    `class      ${entry.class}`,
    `forward    ${entry.forward}`,
    `dims (m)   ${w} × ${h} × ${d}`,
    `tris       ${entry.tris.toLocaleString()}`,
    `size       ${entry.sizeKB} KB`,
    `materials  ${entry.materials}`,
    `action     ${entry.action}`,
    `budget     ${entry.budgetStatus}`,
    `           ${budgetReason(entry)}`,
    `joints     ${joints}`,
    `spin       ${entry.joints?.length ? (jointSpin ? 'ON' : 'off') : 'n/a'}`,
    `load       ${loadStatus}`,
  ];
  return lines.join('\n');
}

export function statusColor(status: WarAssetEntry['budgetStatus']): string {
  return STATUS_COLOR[status];
}

export function createControlsBar(text: string): HTMLDivElement {
  const bar = document.createElement('div');
  bar.textContent = text;
  Object.assign(bar.style, {
    position: 'fixed',
    left: '258px',
    bottom: '14px',
    padding: '8px 12px',
    background: 'rgba(12, 14, 13, 0.78)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    fontFamily: '"Courier Prime", Consolas, monospace',
    fontSize: '11px',
    color: '#cfe9c4',
    whiteSpace: 'pre',
    zIndex: '9998',
  } as CSSStyleDeclaration);
  return bar;
}
