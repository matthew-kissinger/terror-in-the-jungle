// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadialDialView — the DESKTOP presentation of the radio dial: an SVG annular
 * wheel. The inner ring is the three categories; hovering a category drills into
 * it and the focused category's options fill the outer ring. Clicking an outer
 * sector selects that option. It is driven entirely by a shared
 * `RadioDialController` and issues NOTHING itself.
 *
 * Geometry reuses the proven annular-sector path math from the legacy radial
 * menu (deleted in 0f436d77): each sector is an `M L A L A Z` path between an
 * inner and outer radius across an angular span.
 */

import {
  formatRadioCooldown,
  radioOptionCooldown,
  type RadioCategory,
  type RadioOption,
} from './RadioDialModel';
import type { RadioDialController } from './RadioDialController';
import styles from './RadialDialView.module.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 320;
const CENTER = SIZE / 2;
const CATEGORY_INNER = 38;
const CATEGORY_OUTER = 96;
const OPTION_INNER = 104;
const OPTION_OUTER = 154;

export class RadialDialView {
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly centerLabel: SVGTextElement;
  private controller?: RadioDialController;
  private unsubscribe?: () => void;
  private onCloseRequested?: () => void;
  private activeOptionId: string | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = styles.dial;
    this.root.dataset.visible = 'false';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Field radio');

    const wheel = document.createElement('div');
    wheel.className = styles.wheel;
    this.root.appendChild(wheel);

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    this.svg.setAttribute('width', String(SIZE));
    this.svg.setAttribute('height', String(SIZE));
    this.svg.classList.add(styles.svg);
    wheel.appendChild(this.svg);

    this.centerLabel = document.createElementNS(SVG_NS, 'text');
    this.centerLabel.setAttribute('x', String(CENTER));
    this.centerLabel.setAttribute('y', String(CENTER));
    this.centerLabel.setAttribute('text-anchor', 'middle');
    this.centerLabel.setAttribute('dominant-baseline', 'middle');
    this.centerLabel.classList.add(styles.centerText);

    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.onCloseRequested?.();
    });
    this.root.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
  }

  getElement(): HTMLElement {
    return this.root;
  }

  setCallbacks(callbacks: { onCloseRequested?: () => void }): void {
    this.onCloseRequested = callbacks.onCloseRequested;
  }

  bindController(controller: RadioDialController): void {
    this.unsubscribe?.();
    this.controller = controller;
    this.unsubscribe = controller.onChange(() => this.render());
    this.render();
  }

  setVisible(visible: boolean): void {
    this.root.dataset.visible = visible ? 'true' : 'false';
  }

  isVisible(): boolean {
    return this.root.dataset.visible === 'true';
  }

  dispose(): void {
    this.unsubscribe?.();
    this.root.remove();
  }

  private render(): void {
    if (!this.controller) return;
    this.svg.replaceChildren();
    const categories = this.controller.getCategories();
    const focused = this.controller.getFocusedCategory();
    if (!focused?.options.some((option) => option.id === this.activeOptionId)) {
      this.activeOptionId = null;
    }

    forEachSector(categories.length, (index, start, end, mid) => {
      this.drawCategorySector(categories[index], focused?.id === categories[index].id, start, end, mid);
    });

    if (focused) {
      forEachSector(focused.options.length, (index, start, end, mid) => {
        this.drawOptionSector(focused.options[index], start, end, mid);
      });
    }

    this.centerLabel.textContent = focused ? focused.label.toUpperCase() : 'RADIO';
    this.svg.appendChild(this.centerLabel);
  }

  private drawCategorySector(
    category: RadioCategory,
    focused: boolean,
    start: number,
    end: number,
    mid: number,
  ): void {
    const sector = this.makeSectorGroup(CATEGORY_INNER, CATEGORY_OUTER, start, end, mid);
    sector.path.classList.toggle(styles.focused, focused);
    sector.path.dataset.radioCategory = category.id;
    sector.label.textContent = category.label.toUpperCase();
    // Hover OR click drills into the category (so it works without a click).
    sector.group.addEventListener('pointerenter', () => this.controller?.focusCategory(category.id));
    sector.group.addEventListener('click', () => this.controller?.focusCategory(category.id));
  }

  private drawOptionSector(option: RadioOption, start: number, end: number, mid: number): void {
    const enabled = this.controller?.isOptionEnabled(option) ?? true;
    const sector = this.makeSectorGroup(OPTION_INNER, OPTION_OUTER, start, end, mid);
    sector.path.classList.toggle(styles.disabled, !enabled);
    sector.path.classList.toggle(styles.focused, option.id === this.activeOptionId);
    sector.group.dataset.radioOption = option.id;
    sector.path.dataset.radioOption = option.id;
    sector.label.textContent = this.optionShort(option);
    sector.group.addEventListener('pointerenter', () => this.setActiveOption(option.id));
    sector.group.addEventListener('focusin', () => this.setActiveOption(option.id));
    if (enabled) {
      sector.group.addEventListener('click', () => this.controller?.selectOption(option));
    }
  }

  private handleContextMenu(event: MouseEvent): void {
    if (!this.isVisible()) return;
    event.preventDefault();
    event.stopPropagation();

    const optionId = this.optionIdFromEvent(event) ?? (this.isWheelEvent(event) ? this.activeOptionId : null);
    if (optionId) this.selectOptionById(optionId);
  }

  private optionIdFromEvent(event: Event): string | null {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<SVGElement>('[data-radio-option]')?.dataset.radioOption ?? null;
  }

  private isWheelEvent(event: Event): boolean {
    return event.target instanceof Node && this.svg.contains(event.target);
  }

  private setActiveOption(optionId: string): void {
    if (this.activeOptionId === optionId) return;
    this.activeOptionId = optionId;
    this.syncActiveOptionVisual();
  }

  private syncActiveOptionVisual(): void {
    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-radio-option]')) {
      path.classList.toggle(styles.focused, path.dataset.radioOption === this.activeOptionId);
    }
  }

  private selectOptionById(optionId: string): void {
    const focused = this.controller?.getFocusedCategory();
    const option = focused?.options.find((entry) => entry.id === optionId);
    if (option) this.controller?.selectOption(option);
  }

  private optionShort(option: RadioOption): string {
    if (option.kind === 'fire-support') {
      const remaining = radioOptionCooldown(option, this.controller?.getCooldowns() ?? {});
      return remaining > 0 ? formatRadioCooldown(remaining) : option.label;
    }
    return option.label;
  }

  /** Build one annular-sector path + centered label between the given radii. */
  private makeSectorGroup(
    inner: number,
    outer: number,
    start: number,
    end: number,
    mid: number,
  ): { group: SVGGElement; path: SVGPathElement; label: SVGTextElement } {
    const group = document.createElementNS(SVG_NS, 'g');
    group.classList.add(styles.sector);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', annularSectorPath(CENTER, CENTER, inner, outer, start, end));
    path.classList.add(styles.sectorPath);
    group.appendChild(path);

    const labelRadius = (inner + outer) / 2;
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(CENTER + labelRadius * Math.cos(mid)));
    label.setAttribute('y', String(CENTER + labelRadius * Math.sin(mid)));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.classList.add(styles.sectorLabel);
    group.appendChild(label);

    this.svg.appendChild(group);
    return { group, path, label };
  }
}

/** Lay `count` sectors uniformly around the wheel (top-centered). */
function forEachSector(
  count: number,
  visit: (index: number, start: number, end: number, mid: number) => void,
): void {
  if (count === 0) return;
  const span = (Math.PI * 2) / count;
  for (let i = 0; i < count; i += 1) {
    const start = i * span - Math.PI / 2 - span / 2;
    const end = start + span;
    visit(i, start, end, start + span / 2);
  }
}

/** Annular-sector SVG path between two radii across [start, end] radians. */
function annularSectorPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
): string {
  const x1 = cx + inner * Math.cos(start);
  const y1 = cy + inner * Math.sin(start);
  const x2 = cx + outer * Math.cos(start);
  const y2 = cy + outer * Math.sin(start);
  const x3 = cx + outer * Math.cos(end);
  const y3 = cy + outer * Math.sin(end);
  const x4 = cx + inner * Math.cos(end);
  const y4 = cy + inner * Math.sin(end);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${x3} ${y3}`,
    `L ${x4} ${y4}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${x1} ${y1}`,
    'Z',
  ].join(' ');
}
