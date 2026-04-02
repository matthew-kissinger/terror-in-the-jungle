/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MobileStatusBar } from './MobileStatusBar';

describe('MobileStatusBar', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders a safe initial timer before HUD updates begin', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    expect(bar.element.textContent).toContain('0:00');
    expect(bar.element.textContent).not.toContain('Infinity');
    expect(bar.element.textContent).not.toContain('NaN');
  });

  it('formats countdown text when time is set', () => {
    const bar = new MobileStatusBar();
    bar.mount(container);

    bar.setTime(125);

    expect(bar.element.textContent).toContain('2:05');
  });
});
