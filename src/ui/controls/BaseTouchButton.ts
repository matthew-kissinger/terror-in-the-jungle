/**
 * Base class for touch buttons with unified pointer handling.
 *
 * Provides bindPress() for single-touch pointer capture with:
 * - activePointerId tracking (single-touch guard)
 * - setPointerCapture / releasePointerCapture
 * - CSS pressed class toggle
 * - Auto-release on hide()
 *
 * Multi-button components (e.g. TouchSandbagButtons) call bindPress()
 * per sub-element rather than relying on constructor inheritance.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

interface BindPressOptions {
  onDown?: () => void;
  onUp?: () => void;
  onCancel?: () => void;
  pressedClass?: string;
}

interface BoundPress {
  element: HTMLElement;
  pointerId: number | null;
  pressedClass: string;
  onDown?: () => void;
  onUp?: () => void;
  onCancel?: () => void;
}

export abstract class BaseTouchButton extends UIComponent {
  private _bindings: BoundPress[] = [];

  /**
   * Bind pointer press/release handling to an element.
   * Call in onMount() for each pressable sub-element.
   */
  protected bindPress(element: HTMLElement, options: BindPressOptions = {}): BoundPress {
    const binding: BoundPress = {
      element,
      pointerId: null,
      pressedClass: options.pressedClass ?? styles.pressed,
      onDown: options.onDown,
      onUp: options.onUp,
      onCancel: options.onCancel,
    };
    this._bindings.push(binding);

    this.listen(element, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (binding.pointerId !== null) return;
      binding.pointerId = e.pointerId;
      if (typeof element.setPointerCapture === 'function') {
        element.setPointerCapture(e.pointerId);
      }
      element.classList.add(binding.pressedClass);
      binding.onDown?.();
    }, { passive: false });

    this.listen(element, 'pointerup', (e: PointerEvent) => {
      if (e.pointerId !== binding.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      binding.pointerId = null;
      element.classList.remove(binding.pressedClass);
      if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) {
        element.releasePointerCapture(e.pointerId);
      }
      binding.onUp?.();
    }, { passive: false });

    this.listen(element, 'pointercancel', (e: PointerEvent) => {
      if (e.pointerId !== binding.pointerId) return;
      e.preventDefault();
      binding.pointerId = null;
      element.classList.remove(binding.pressedClass);
      if (typeof element.releasePointerCapture === 'function' && element.hasPointerCapture(e.pointerId)) {
        element.releasePointerCapture(e.pointerId);
      }
      binding.onCancel?.();
    }, { passive: false });

    return binding;
  }

  /** Force-release all active bindings (e.g. when hiding while pressed). */
  protected releaseAllPointers(): void {
    for (const b of this._bindings) {
      if (b.pointerId !== null) {
        b.element.classList.remove(b.pressedClass);
        b.pointerId = null;
      }
    }
  }

  /** Force-release a specific binding. */
  protected releaseBinding(binding: BoundPress): void {
    if (binding.pointerId !== null) {
      binding.element.classList.remove(binding.pressedClass);
      binding.pointerId = null;
    }
  }

  /** Check if a specific binding is currently pressed. */
  protected isPressed(binding: BoundPress): boolean {
    return binding.pointerId !== null;
  }
}
