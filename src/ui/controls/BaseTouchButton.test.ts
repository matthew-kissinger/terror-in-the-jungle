/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseTouchButton } from './BaseTouchButton';

function pointerEvent(type: string, pointerId = 1, button = 0, pointerType = 'touch'): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    button,
    pointerType,
  });
}

/** Concrete subclass for testing */
class TestButton extends BaseTouchButton {
  public onDownSpy = vi.fn();
  public onUpSpy = vi.fn();
  public onCancelSpy = vi.fn();
  public subButton!: HTMLDivElement;

  protected build(): void {
    this.root.className = 'test-button';
    this.root.id = 'test-btn';
    this.root.textContent = 'TEST';

    this.subButton = document.createElement('div');
    this.subButton.id = 'test-sub-btn';
    this.root.appendChild(this.subButton);
  }

  protected onMount(): void {
    this.bindPress(this.root, {
      onDown: this.onDownSpy,
      onUp: this.onUpSpy,
      onCancel: this.onCancelSpy,
    });
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.releaseAllPointers();
  }
}

/** Two-button subclass to test multi-button bindPress */
class DualTestButton extends BaseTouchButton {
  public leftDown = vi.fn();
  public rightDown = vi.fn();
  public leftEl!: HTMLDivElement;
  public rightEl!: HTMLDivElement;

  protected build(): void {
    this.root.id = 'dual-btn';
    this.leftEl = document.createElement('div');
    this.leftEl.id = 'left-btn';
    this.rightEl = document.createElement('div');
    this.rightEl.id = 'right-btn';
    this.root.appendChild(this.leftEl);
    this.root.appendChild(this.rightEl);
  }

  protected onMount(): void {
    this.bindPress(this.leftEl, { onDown: this.leftDown });
    this.bindPress(this.rightEl, { onDown: this.rightDown });
  }

  show(): void { this.root.style.display = 'flex'; }
  hide(): void {
    this.root.style.display = 'none';
    this.releaseAllPointers();
  }
}

describe('BaseTouchButton', () => {
  let btn: TestButton;
  let el: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    btn = new TestButton();
    btn.mount(document.body);
    el = document.getElementById('test-btn') as HTMLDivElement;
  });

  it('calls onDown on pointerdown', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(btn.onDownSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onUp on pointerup', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointerup'));
    expect(btn.onUpSpy).toHaveBeenCalledTimes(1);
  });

  it('adds pressed class on pointerdown and removes on pointerup', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(el.classList.contains('pressed')).toBe(true);

    el.dispatchEvent(pointerEvent('pointerup'));
    expect(el.classList.contains('pressed')).toBe(false);
  });

  it('guards against multi-touch (second pointer ignored)', () => {
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    el.dispatchEvent(pointerEvent('pointerdown', 2));
    expect(btn.onDownSpy).toHaveBeenCalledTimes(1);

    // Second pointer up should not trigger onUp
    el.dispatchEvent(pointerEvent('pointerup', 2));
    expect(btn.onUpSpy).not.toHaveBeenCalled();

    // First pointer up does trigger onUp
    el.dispatchEvent(pointerEvent('pointerup', 1));
    expect(btn.onUpSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores non-left mouse clicks', () => {
    el.dispatchEvent(pointerEvent('pointerdown', 1, 2, 'mouse'));
    expect(btn.onDownSpy).not.toHaveBeenCalled();
  });

  it('allows left mouse click', () => {
    el.dispatchEvent(pointerEvent('pointerdown', 1, 0, 'mouse'));
    expect(btn.onDownSpy).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on pointercancel (not onUp)', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    el.dispatchEvent(pointerEvent('pointercancel'));
    expect(btn.onCancelSpy).toHaveBeenCalledTimes(1);
    expect(btn.onUpSpy).not.toHaveBeenCalled();
  });

  it('removes pressed class on pointercancel', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(el.classList.contains('pressed')).toBe(true);
    el.dispatchEvent(pointerEvent('pointercancel'));
    expect(el.classList.contains('pressed')).toBe(false);
  });

  it('releaseAllPointers clears pressed state (hide-while-pressed)', () => {
    el.dispatchEvent(pointerEvent('pointerdown'));
    expect(el.classList.contains('pressed')).toBe(true);

    btn.hide();
    expect(el.classList.contains('pressed')).toBe(false);
  });

  it('accepts new pointer after releaseAllPointers', () => {
    el.dispatchEvent(pointerEvent('pointerdown', 1));
    btn.hide();
    btn.show();

    el.dispatchEvent(pointerEvent('pointerdown', 2));
    expect(btn.onDownSpy).toHaveBeenCalledTimes(2);
  });

  it('show and hide toggle display', () => {
    btn.hide();
    expect(el.style.display).toBe('none');
    btn.show();
    expect(el.style.display).toBe('flex');
  });
});

describe('BaseTouchButton multi-element', () => {
  let dual: DualTestButton;
  let leftEl: HTMLDivElement;
  let rightEl: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    dual = new DualTestButton();
    dual.mount(document.body);
    leftEl = document.getElementById('left-btn') as HTMLDivElement;
    rightEl = document.getElementById('right-btn') as HTMLDivElement;
  });

  it('each sub-button tracks its own pointer independently', () => {
    leftEl.dispatchEvent(pointerEvent('pointerdown', 1));
    rightEl.dispatchEvent(pointerEvent('pointerdown', 2));

    expect(dual.leftDown).toHaveBeenCalledTimes(1);
    expect(dual.rightDown).toHaveBeenCalledTimes(1);
  });

  it('each sub-button gets its own pressed class', () => {
    leftEl.dispatchEvent(pointerEvent('pointerdown', 1));
    rightEl.dispatchEvent(pointerEvent('pointerdown', 2));

    expect(leftEl.classList.contains('pressed')).toBe(true);
    expect(rightEl.classList.contains('pressed')).toBe(true);

    leftEl.dispatchEvent(pointerEvent('pointerup', 1));
    expect(leftEl.classList.contains('pressed')).toBe(false);
    expect(rightEl.classList.contains('pressed')).toBe(true);
  });

  it('releaseAllPointers clears all sub-buttons', () => {
    leftEl.dispatchEvent(pointerEvent('pointerdown', 1));
    rightEl.dispatchEvent(pointerEvent('pointerdown', 2));

    dual.hide();

    expect(leftEl.classList.contains('pressed')).toBe(false);
    expect(rightEl.classList.contains('pressed')).toBe(false);
  });
});
