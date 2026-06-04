// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * DeploySpawnList - spawn-point + crewable-vehicle option rendering for the
 * deploy screen.
 *
 * Extracted from DeployScreen.ts (phase4-godfiles file split). These builders
 * are stateless: they take the CSS module map plus the selection callbacks and
 * return DOM nodes. Behaviour (DOM structure, ids, data-* attributes, aria
 * labels, grouping order, pointerdown wiring) is identical to the original
 * private methods on DeployScreen.
 */

import type { RespawnSpawnPoint } from '../../../systems/player/RespawnSpawnPoint';
import { isBlufor } from '../../../systems/combat/types';
import type { VehicleDeployOption } from '../../loadout/LoadoutTypes';
import { createDiv } from './DeployDomFactory';

type StyleMap = { readonly [key: string]: string };

export interface DeploySpawnListContext {
  styles: StyleMap;
  onSpawnOptionSelected?: (spawnPointId: string, spawnPointName: string) => void;
  onVehicleDeployOptionSelected?: (vehicleId: string, vehicleName: string) => void;
}

export function getSpawnKindLabel(spawnPoint: RespawnSpawnPoint): string {
  switch (spawnPoint.kind) {
    case 'home_base':
      return 'BASE';
    case 'zone':
      return 'ZONE';
    case 'helipad':
      return 'HELIPAD';
    case 'insertion':
      return 'INSERTION';
    case 'default':
    default:
      return 'DEFAULT';
  }
}

/**
 * Classify a spawn's deploy-time threat into a banded label + kind for the
 * list meta (UX-4). Driven by the nearby-enemy snapshot; falls back to the
 * `safe` flag so a forward insertion still reads as exposed when no strategic
 * agents are nearby (e.g. WarSimulator off).
 */
export function classifySpawnThreat(
  spawnPoint: RespawnSpawnPoint,
): { label: string; kind: 'clear' | 'warm' | 'hot' } {
  const threat = spawnPoint.threat ?? 0;
  if (threat >= 4) return { label: 'HOT', kind: 'hot' };
  if (threat >= 1) return { label: 'WARM', kind: 'warm' };
  if (!spawnPoint.safe) return { label: 'EXPOSED', kind: 'warm' };
  return { label: 'CLEAR', kind: 'clear' };
}

export function groupSpawnPoints(
  spawnPoints: RespawnSpawnPoint[],
): Array<{ label: string; points: RespawnSpawnPoint[] }> {
  const groups: Array<{ kind: RespawnSpawnPoint['kind']; label: string; points: RespawnSpawnPoint[] }> = [
    { kind: 'home_base', label: 'ALLIANCE BASES', points: [] },
    { kind: 'zone', label: 'CONTROLLED ZONES', points: [] },
    { kind: 'helipad', label: 'HELIPADS', points: [] },
    { kind: 'insertion', label: 'INSERTION POINTS', points: [] },
    { kind: 'default', label: 'DEFAULT', points: [] },
  ];

  for (const spawnPoint of spawnPoints) {
    const group = groups.find((entry) => entry.kind === spawnPoint.kind) ?? groups[groups.length - 1];
    group.points.push(spawnPoint);
  }

  return groups.filter((group) => group.points.length > 0);
}

export function makeSpawnOptionButton(
  ctx: DeploySpawnListContext,
  spawnPoint: RespawnSpawnPoint,
  selected: boolean,
): HTMLButtonElement {
  const { styles } = ctx;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = selected
    ? `${styles.spawnOption} ${styles.spawnOptionSelected}`
    : styles.spawnOption;
  button.textContent = '';
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.setAttribute('aria-label', `${getSpawnKindLabel(spawnPoint)} ${spawnPoint.name}`);
  if (button.dataset) {
    button.dataset.spawnId = spawnPoint.id;
    button.dataset.spawnKind = spawnPoint.kind;
    button.dataset.selectionClass = spawnPoint.selectionClass;
  }
  button.addEventListener('pointerdown', () => {
    ctx.onSpawnOptionSelected?.(spawnPoint.id, spawnPoint.name);
  });

  const label = createDiv(styles.spawnOptionLabel);
  label.textContent = spawnPoint.name;
  const meta = createDiv(styles.spawnOptionMeta);
  const threat = classifySpawnThreat(spawnPoint);
  const kindEl = document.createElement('span');
  kindEl.textContent = `${getSpawnKindLabel(spawnPoint)} / `;
  const threatEl = document.createElement('span');
  threatEl.className = styles.spawnThreat;
  if (threatEl.dataset) threatEl.dataset.threat = threat.kind;
  threatEl.textContent = threat.label;
  const coordsEl = document.createElement('span');
  coordsEl.textContent = ` / ${Math.round(spawnPoint.position.x)}, ${Math.round(spawnPoint.position.z)}`;
  meta.appendChild(kindEl);
  meta.appendChild(threatEl);
  meta.appendChild(coordsEl);
  button.appendChild(label);
  button.appendChild(meta);
  return button;
}

export function makeVehicleOptionButton(
  ctx: DeploySpawnListContext,
  option: VehicleDeployOption,
  selected: boolean,
): HTMLButtonElement {
  const { styles } = ctx;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = selected
    ? `${styles.spawnOption} ${styles.spawnOptionSelected}`
    : styles.spawnOption;
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  button.setAttribute('aria-label', `${option.classLabel} ${option.name}`);
  if (button.dataset) {
    button.dataset.vehicleId = option.id;
    button.dataset.vehicleClass = option.classLabel;
    button.dataset.faction = isBlufor(option.faction) ? 'BLUFOR' : 'OPFOR';
  }
  button.addEventListener('pointerdown', () => {
    ctx.onVehicleDeployOptionSelected?.(option.id, option.name);
  });

  const label = createDiv(styles.spawnOptionLabel);
  label.textContent = option.name;
  const meta = createDiv(styles.spawnOptionMeta);
  meta.textContent = `${option.classLabel} / ${option.controlsHint}`;
  button.appendChild(label);
  button.appendChild(meta);
  return button;
}
