import { zIndex } from '../design/tokens';
import type { DebugPanel } from './DebugHudRegistry';
import type { IPlayerController } from '../../types/SystemInterfaces';
import { inspectCombatant, type CombatantSource } from './entityInspectors/inspectCombatant';
import { inspectVehicle, type VehicleSource } from './entityInspectors/inspectVehicle';
import { inspectPlayer } from './entityInspectors/inspectPlayer';
import { inspectProp, type PropPick } from './entityInspectors/inspectProp';

export type InspectorEntityKind = 'combatant' | 'vehicle' | 'player' | 'prop';

export interface InspectorSources {
  combatants: CombatantSource;
  vehicles: VehicleSource;
  player: IPlayerController;
}

export interface InspectorTarget {
  kind: InspectorEntityKind;
  id: string;
  /** Pre-resolved prop pick — only used for 'prop' kind. */
  propPick?: PropPick;
}

export interface FollowController {
  startFollow(kind: InspectorEntityKind, id: string): boolean;
  stopFollow(): void;
  isFollowing(): boolean;
}

/**
 * Right-side panel that renders per-entity state at ~5Hz. Read-only: the
 * footer buttons wire Follow / Console Dump / Close, nothing mutates game
 * state. Opened via `show(target)` from the free-fly pick raycast.
 */
export class EntityInspectorPanel implements DebugPanel {
  readonly id = 'entity-inspector';
  readonly label = 'Entity Inspector';
  readonly defaultVisible = false;

  private container: HTMLDivElement;
  private header: HTMLDivElement;
  private body: HTMLPreElement;
  private followBtn: HTMLButtonElement;
  private visible = false;

  private sources: InspectorSources | null = null;
  private followController: FollowController | null = null;
  private target: InspectorTarget | null = null;
  private accumDt = 0;
  private lastSnapshot: Record<string, unknown> | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'entity-inspector-panel';
    Object.assign(this.container.style, {
      position: 'fixed', top: '16px', right: '16px', width: '320px',
      maxHeight: '70vh', overflowY: 'auto', padding: '10px 12px',
      background: 'rgba(10, 16, 18, 0.88)',
      border: '1px solid rgba(160, 190, 255, 0.45)',
      borderRadius: '8px', fontFamily: '"Courier New", monospace',
      fontSize: '11px', color: '#d5e2f0',
      zIndex: String(zIndex.debug), pointerEvents: 'auto', display: 'none',
    });

    this.header = document.createElement('div');
    Object.assign(this.header.style, { fontWeight: 'bold', marginBottom: '6px', color: '#a9c8ff' });
    this.header.textContent = 'INSPECTOR';
    this.container.appendChild(this.header);

    this.body = document.createElement('pre');
    Object.assign(this.body.style, { margin: '0 0 8px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' });
    this.body.textContent = '(no target)';
    this.container.appendChild(this.body);

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', gap: '4px', marginTop: '4px' });
    this.followBtn = this.makeButton('Follow', () => this.handleFollowClick());
    footer.appendChild(this.followBtn);
    footer.appendChild(this.makeButton('Dump', () => this.handleDumpClick()));
    footer.appendChild(this.makeButton('Close', () => this.close()));
    this.container.appendChild(footer);
  }

  setSources(sources: InspectorSources): void { this.sources = sources; }
  setFollowController(controller: FollowController): void { this.followController = controller; }

  show(target: InspectorTarget): void {
    this.target = target;
    this.lastSnapshot = null;
    this.refresh();
    this.setVisible(true);
    this.updateFollowButton();
  }

  close(): void {
    this.target = null;
    this.followController?.stopFollow();
    this.setVisible(false);
  }

  getTarget(): InspectorTarget | null { return this.target; }

  mount(container: HTMLElement): void { container.appendChild(this.container); }
  unmount(): void {
    if (this.container.parentElement) this.container.parentElement.removeChild(this.container);
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }
  isVisible(): boolean { return this.visible; }

  update(dt: number): void {
    if (!this.visible || !this.target) return;
    this.accumDt += dt;
    if (this.accumDt < 0.2) return;
    this.accumDt = 0;
    this.refresh();
  }

  private refresh(): void {
    if (!this.target || !this.sources) { this.body.textContent = '(not wired)'; return; }
    const snap = this.resolve(this.target);
    this.lastSnapshot = snap;
    this.header.textContent = `INSPECTOR — ${this.target.kind} : ${this.target.id}`;
    this.body.textContent = snap ? formatSnapshot(snap) : '(entity gone)';
  }

  private resolve(target: InspectorTarget): Record<string, unknown> | null {
    if (!this.sources) return null;
    switch (target.kind) {
      case 'combatant': return inspectCombatant(this.sources.combatants, target.id);
      case 'vehicle':   return inspectVehicle(this.sources.vehicles, target.id);
      case 'player':    return inspectPlayer(this.sources.player);
      case 'prop':      return inspectProp(target.propPick ?? null);
    }
  }

  private handleFollowClick(): void {
    if (!this.target || !this.followController) return;
    if (this.followController.isFollowing()) this.followController.stopFollow();
    else this.followController.startFollow(this.target.kind, this.target.id);
    this.updateFollowButton();
  }

  private handleDumpClick(): void {
    if (!this.target || !this.lastSnapshot) return;
    // eslint-disable-next-line no-console
    console.log(`[inspector] ${this.target.kind}/${this.target.id}`, this.lastSnapshot);
  }

  private updateFollowButton(): void {
    this.followBtn.textContent = this.followController?.isFollowing() ? 'Unfollow' : 'Follow';
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    Object.assign(btn.style, {
      flex: '1', padding: '4px 6px', fontFamily: 'inherit', fontSize: '11px',
      background: 'rgba(40, 50, 60, 0.9)', color: '#d5e2f0',
      border: '1px solid rgba(160, 190, 255, 0.35)',
      borderRadius: '4px', cursor: 'pointer',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }
}

function formatSnapshot(snap: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(snap)) {
    if (value === null || value === undefined) {
      lines.push(`${indent}${key}: —`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) { lines.push(`${indent}${key}: []`); continue; }
      lines.push(`${indent}${key}:`);
      for (const item of value) {
        lines.push(item && typeof item === 'object'
          ? `${indent}  - ${Object.entries(item as Record<string, unknown>).map(([k, v]) => `${k}=${v ?? '—'}`).join(' ')}`
          : `${indent}  - ${String(item)}`);
      }
    } else if (typeof value === 'object') {
      lines.push(`${indent}${key}:`);
      lines.push(formatSnapshot(value as Record<string, unknown>, indent + '  '));
    } else {
      lines.push(`${indent}${key}: ${String(value)}`);
    }
  }
  return lines.join('\n');
}
