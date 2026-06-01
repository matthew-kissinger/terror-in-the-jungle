/**
 * DeployDomFactory - stateless DOM element factories for the deploy screen.
 *
 * Extracted from DeployScreen.ts (phase4-godfiles file split) so the screen
 * stays a thin facade. These are pure helpers: they only touch the global
 * `document` and the arguments passed in. Behaviour is byte-for-byte identical
 * to the original private methods on DeployScreen.
 */

/** Create a `<div>` with optional class + id. */
export function createDiv(className?: string, id?: string): HTMLDivElement {
  const el = document.createElement('div');
  if (id) el.id = id;
  if (className) el.className = className;
  return el;
}

/** Create a heading element (`h1`..`h4`) with optional id/class and text. */
export function createHeading<K extends 'h1' | 'h2' | 'h3' | 'h4'>(
  tag: K,
  id: string | undefined,
  className: string | undefined,
  text: string,
): HTMLHeadingElement {
  const el = document.createElement(tag) as HTMLHeadingElement;
  if (id) el.id = id;
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Small text button. Fires `onPress` on `pointerdown` only when not disabled.
 * The caller supplies the class name so the factory stays style-agnostic.
 */
export function makeSmallButton(
  id: string | undefined,
  className: string,
  label: string,
  onPress: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  if (id) button.id = id;
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('pointerdown', () => {
    if (!button.disabled) onPress();
  });
  return button;
}

/**
 * Primary/secondary action button. No text is set here (the caller assigns
 * it). Fires `onPress` on `pointerdown` only when not disabled.
 */
export function makeActionButton(
  id: string,
  className: string,
  onPress: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.className = className;
  button.addEventListener('pointerdown', () => {
    if (!button.disabled) onPress();
  });
  return button;
}

/** A label/value row used in the header meta block. */
export function createMetaRow(
  rowClass: string,
  labelClass: string,
  valueClass: string,
  label: string,
  value: string,
): { row: HTMLDivElement; value: HTMLDivElement } {
  const row = createDiv(rowClass);
  const term = createDiv(labelClass);
  term.textContent = label;
  const valueEl = createDiv(valueClass);
  valueEl.textContent = value;
  row.appendChild(term);
  row.appendChild(valueEl);
  return { row, value: valueEl };
}
