/**
 * Horizontal weapon bar for mobile touch controls.
 * Shows weapon slots 1-6 as tappable buttons at the top-center of the screen.
 * Highlights the currently selected weapon.
 */

interface WeaponBarSlot {
  element: HTMLDivElement;
  index: number;
  label: string;
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}

export class TouchWeaponBar {
  private container: HTMLDivElement;
  private slots: WeaponBarSlot[] = [];
  private activeIndex = 2; // Default: slot 3 (PRIMARY)

  private onWeaponSelect?: (slotIndex: number) => void;

  private static readonly SLOT_LABELS = ['SG', 'GRN', 'AR', 'SB', 'SMG', 'PST'];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'touch-weapon-bar';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'row',
      gap: '6px',
      zIndex: '1001',
      touchAction: 'none',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    for (let i = 0; i < 6; i++) {
      this.addSlot(i, TouchWeaponBar.SLOT_LABELS[i]);
    }

    document.body.appendChild(this.container);

    // Highlight default
    this.updateHighlight();
  }

  setOnWeaponSelect(callback: (slotIndex: number) => void): void {
    this.onWeaponSelect = callback;
  }

  /** Update the highlighted slot from external weapon change events */
  setActiveSlot(slotIndex: number): void {
    if (slotIndex >= 0 && slotIndex < 6) {
      this.activeIndex = slotIndex;
      this.updateHighlight();
    }
  }

  private addSlot(index: number, label: string): void {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      width: '40px',
      height: '36px',
      borderRadius: '6px',
      background: 'rgba(255,255,255,0.12)',
      border: '1.5px solid rgba(255,255,255,0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.7)',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'none',
      pointerEvents: 'auto',
      flexDirection: 'column',
      lineHeight: '1',
    } as Partial<CSSStyleDeclaration>);
    btn.innerHTML = `<span style="font-size:8px;opacity:0.5">${index + 1}</span>${label}`;

    const onTouchStart = (e: TouchEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      this.activeIndex = index;
      this.updateHighlight();
      this.onWeaponSelect?.(index);
    };
    const onTouchEnd = (e: TouchEvent): void => {
      e.preventDefault();
      e.stopPropagation();
    };

    btn.addEventListener('touchstart', onTouchStart, { passive: false });
    btn.addEventListener('touchend', onTouchEnd, { passive: false });
    btn.addEventListener('touchcancel', onTouchEnd, { passive: false });

    this.slots.push({ element: btn, index, label, onTouchStart, onTouchEnd });
    this.container.appendChild(btn);
  }

  private updateHighlight(): void {
    for (const slot of this.slots) {
      if (slot.index === this.activeIndex) {
        slot.element.style.background = 'rgba(255,200,50,0.35)';
        slot.element.style.borderColor = 'rgba(255,200,50,0.7)';
        slot.element.style.color = 'rgba(255,255,255,0.95)';
      } else {
        slot.element.style.background = 'rgba(255,255,255,0.12)';
        slot.element.style.borderColor = 'rgba(255,255,255,0.25)';
        slot.element.style.color = 'rgba(255,255,255,0.7)';
      }
    }
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  dispose(): void {
    // Remove event listeners for each slot
    for (const slot of this.slots) {
      slot.element.removeEventListener('touchstart', slot.onTouchStart);
      slot.element.removeEventListener('touchend', slot.onTouchEnd);
      slot.element.removeEventListener('touchcancel', slot.onTouchEnd);
    }
    // Clear slots array
    this.slots = [];
    // Remove container from DOM
    this.container.remove();
  }
}
