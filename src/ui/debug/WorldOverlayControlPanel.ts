import { zIndex } from '../design/tokens';
import type { DebugPanel } from './DebugHudRegistry';
import type { WorldOverlayRegistry } from './WorldOverlayRegistry';

/**
 * Small top-left panel with a master toggle and one checkbox per overlay.
 * Reads overlay state live so individual hotkeys that flip overlays stay in
 * sync with the UI.
 */
export class WorldOverlayControlPanel implements DebugPanel {
  readonly id = 'world-overlay-controls';
  readonly label = 'World Overlays';
  readonly defaultVisible = false;
  readonly defaultHotkey = 'Shift+\\';

  private root: HTMLDivElement;
  private list: HTMLDivElement;
  private masterCheckbox: HTMLInputElement;
  private visible = false;

  constructor(private readonly overlays: WorldOverlayRegistry) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed', top: '16px', left: '16px', width: '240px',
      padding: '8px 10px', background: 'rgba(10, 16, 18, 0.85)',
      border: '1px solid rgba(160, 190, 255, 0.35)', borderRadius: '6px',
      fontFamily: '"Courier New", monospace', fontSize: '11px', color: '#d5e2f0',
      zIndex: String(zIndex.debug), pointerEvents: 'auto', display: 'none',
    });

    const title = document.createElement('div');
    title.textContent = 'WORLD OVERLAYS';
    Object.assign(title.style, { fontWeight: 'bold', marginBottom: '6px', color: '#a9c8ff' });
    this.root.appendChild(title);

    const masterRow = document.createElement('label');
    Object.assign(masterRow.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' });
    this.masterCheckbox = document.createElement('input');
    this.masterCheckbox.type = 'checkbox';
    this.masterCheckbox.checked = true;
    this.masterCheckbox.addEventListener('change', () => {
      this.overlays.setMasterVisible(this.masterCheckbox.checked);
    });
    masterRow.appendChild(this.masterCheckbox);
    const masterLabel = document.createElement('span');
    masterLabel.textContent = 'Master (Shift+\\)';
    masterRow.appendChild(masterLabel);
    this.root.appendChild(masterRow);

    this.list = document.createElement('div');
    this.root.appendChild(this.list);
    this.rebuild();
  }

  mount(container: HTMLElement): void { container.appendChild(this.root); }
  unmount(): void { if (this.root.parentElement) this.root.parentElement.removeChild(this.root); }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? 'block' : 'none';
    if (visible) this.rebuild();
  }
  isVisible(): boolean { return this.visible; }
  update(): void { if (this.visible) this.syncState(); }

  private rebuild(): void {
    this.list.innerHTML = '';
    for (const overlay of this.overlays.list()) {
      const row = document.createElement('label');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' });
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.overlayId = overlay.id;
      cb.checked = this.overlays.isVisible(overlay.id);
      cb.addEventListener('change', () => {
        this.overlays.setOverlayVisible(overlay.id, cb.checked);
      });
      row.appendChild(cb);
      const text = document.createElement('span');
      text.textContent = overlay.hotkey ? `${overlay.label} (${overlay.hotkey})` : overlay.label;
      row.appendChild(text);
      this.list.appendChild(row);
    }
    this.syncState();
  }

  private syncState(): void {
    this.masterCheckbox.checked = this.overlays.isMasterVisible();
    const boxes = this.list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    boxes.forEach((cb) => {
      const id = cb.dataset.overlayId;
      if (id) cb.checked = this.overlays.isVisible(id);
    });
  }
}
