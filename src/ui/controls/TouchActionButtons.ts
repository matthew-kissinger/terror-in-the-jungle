/**
 * Small action buttons for mobile: Scoreboard, Jump, Reload, Grenade.
 * Positioned in a column above the fire button on the right side.
 */

interface ActionButton {
  element: HTMLDivElement;
  key: string;
  label: string;
}

export class TouchActionButtons {
  private buttons: ActionButton[] = [];
  private container: HTMLDivElement;

  private onAction?: (action: string) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'touch-action-buttons';
    Object.assign(this.container.style, {
      position: 'fixed',
      right: `max(var(--tc-edge-inset, 30px), env(safe-area-inset-right, 0px))`,
      bottom: `calc(var(--tc-fire-size, 80px) + max(var(--tc-edge-inset, 30px), env(safe-area-inset-bottom, 0px)) + 16px)`,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // Create buttons from bottom to top (most-used closest to thumb)
    this.addButton('jump', 'JUMP');
    this.addButton('reload', 'R');
    this.addButton('grenade', 'G');

    document.body.appendChild(this.container);
  }

  setOnAction(callback: (action: string) => void): void {
    this.onAction = callback;
  }

  private addButton(key: string, label: string): void {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      width: 'var(--tc-action-size, 52px)',
      height: 'var(--tc-action-size, 52px)',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 'var(--tc-font-size, 11px)',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.8)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);
    btn.textContent = label;

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255,255,255,0.35)';
      btn.style.transform = 'scale(0.9)';
      if (typeof btn.setPointerCapture === 'function') btn.setPointerCapture(e.pointerId);
      this.onAction?.(key);
    };

    const onPointerUp = (e: PointerEvent): void => {
      e.preventDefault();
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.transform = 'scale(1)';
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    };

    const onPointerCancel = (e: PointerEvent): void => {
      e.preventDefault();
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.transform = 'scale(1)';
      if (typeof btn.releasePointerCapture === 'function' && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    };

    btn.addEventListener('pointerdown', onPointerDown, { passive: false });
    btn.addEventListener('pointerup', onPointerUp, { passive: false });
    btn.addEventListener('pointercancel', onPointerCancel, { passive: false });

    this.buttons.push({ element: btn, key, label });
    this.container.appendChild(btn);
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    this.container.remove();
  }
}
