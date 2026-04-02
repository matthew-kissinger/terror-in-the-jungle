/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MatchTimer } from './MatchTimer';

describe('MatchTimer', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders a safe initial time before the first tick arrives', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    expect(timer.element.textContent).toContain('0:00');
    expect(timer.element.textContent).not.toContain('Infinity');
    expect(timer.element.textContent).not.toContain('NaN');
  });

  it('formats finite match time as mm:ss', () => {
    const timer = new MatchTimer();
    timer.mount(container);

    timer.setTime(65);

    expect(timer.element.textContent).toContain('1:05');
  });
});
