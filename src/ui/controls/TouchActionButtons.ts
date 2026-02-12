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
      right: '30px',
      bottom: '130px', // above fire button (80px + 30px bottom + 20px gap)
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // Create buttons from bottom to top (scoreboard at top for easy reach)
    this.addButton('squad', 'SQUAD');
    this.addButton('scoreboard', 'SCORE');
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
      width: '52px',
      height: '52px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.15)',
      border: '2px solid rgba(255,255,255,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.8)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);
    btn.textContent = label;

    btn.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255,255,255,0.35)';
      btn.style.transform = 'scale(0.9)';
      this.onAction?.(key);
    }, { passive: false });

    btn.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.transform = 'scale(1)';
    }, { passive: false });

    btn.addEventListener('touchcancel', (e: TouchEvent) => {
      e.preventDefault();
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.transform = 'scale(1)';
    }, { passive: false });

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
