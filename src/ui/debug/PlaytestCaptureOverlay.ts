/**
 * F9 capture modal. Shows a PNG thumbnail, collects an annotation, resolves
 * with { annotation } on Submit or null on Cancel/Escape.
 */
export interface CaptureSubmission { annotation: string; }

export class PlaytestCaptureOverlay {
  private root: HTMLDivElement;
  private thumb: HTMLImageElement;
  private textarea: HTMLTextAreaElement;
  private thumbUrl: string | null = null;
  private resolveFn: ((result: CaptureSubmission | null) => void) | null = null;
  private keyHandler = (ev: KeyboardEvent) => this.handleKey(ev);

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'playtest-capture-overlay';
    this.root.setAttribute('data-ref', 'playtest-capture-overlay');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Playtest capture');
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', display: 'none',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.6)', zIndex: '3000', pointerEvents: 'auto',
      fontFamily: '"Courier New", monospace',
    } as CSSStyleDeclaration);

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: '60%', maxWidth: '720px', maxHeight: '80vh',
      background: 'rgba(12, 18, 22, 0.96)',
      border: '1px solid rgba(160, 190, 255, 0.4)',
      borderRadius: '8px', padding: '16px', color: '#d5e2f0',
      display: 'flex', flexDirection: 'column', gap: '12px',
    } as CSSStyleDeclaration);
    this.root.appendChild(card);

    const title = document.createElement('h2');
    title.textContent = 'Playtest Capture';
    Object.assign(title.style, { margin: '0', fontSize: '14px', color: '#a9c8ff', letterSpacing: '1px' });
    card.appendChild(title);

    this.thumb = document.createElement('img');
    this.thumb.setAttribute('data-ref', 'capture-thumb');
    this.thumb.alt = 'Capture preview';
    Object.assign(this.thumb.style, {
      maxWidth: '100%', maxHeight: '40vh', objectFit: 'contain',
      background: 'rgba(0, 0, 0, 0.4)', borderRadius: '4px',
    } as CSSStyleDeclaration);
    card.appendChild(this.thumb);

    const label = document.createElement('label');
    label.textContent = 'Annotation (what were you doing?)';
    label.htmlFor = 'playtest-capture-annotation';
    Object.assign(label.style, { fontSize: '11px', opacity: '0.75' });
    card.appendChild(label);

    this.textarea = document.createElement('textarea');
    this.textarea.id = 'playtest-capture-annotation';
    this.textarea.setAttribute('data-ref', 'annotation-input');
    this.textarea.rows = 4;
    Object.assign(this.textarea.style, {
      width: '100%', resize: 'vertical', minHeight: '80px',
      background: 'rgba(0, 0, 0, 0.4)', color: '#d5e2f0',
      border: '1px solid rgba(160, 190, 255, 0.3)', borderRadius: '4px',
      padding: '8px', fontFamily: 'inherit', fontSize: '12px',
    } as CSSStyleDeclaration);
    card.appendChild(this.textarea);

    const footer = document.createElement('div');
    Object.assign(footer.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px' });
    card.appendChild(footer);
    footer.appendChild(this.makeButton('Cancel', 'cancel-btn', () => this.resolve(null)));
    footer.appendChild(this.makeButton('Submit', 'submit-btn', () => this.submit(), true));
  }

  /** Show the modal and wait for user decision. Resolves null on cancel. */
  prompt(imageBlob: Blob): Promise<CaptureSubmission | null> {
    if (this.resolveFn) {
      const prev = this.resolveFn;
      this.resolveFn = null;
      prev(null);
    }
    if (!this.root.parentElement) document.body.appendChild(this.root);
    this.thumbUrl = URL.createObjectURL(imageBlob);
    this.thumb.src = this.thumbUrl;
    this.textarea.value = '';
    this.root.style.display = 'flex';
    window.addEventListener('keydown', this.keyHandler, true);
    queueMicrotask(() => this.textarea.focus());
    return new Promise((resolve) => { this.resolveFn = resolve; });
  }

  dispose(): void {
    if (this.resolveFn) { this.resolveFn(null); this.resolveFn = null; }
    if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
  }

  /** Test hook. */
  getRoot(): HTMLDivElement { return this.root; }

  private submit(): void { this.resolve({ annotation: this.textarea.value.trim() }); }

  private resolve(result: CaptureSubmission | null): void {
    const fn = this.resolveFn;
    this.resolveFn = null;
    this.root.style.display = 'none';
    window.removeEventListener('keydown', this.keyHandler, true);
    if (this.thumbUrl) { URL.revokeObjectURL(this.thumbUrl); this.thumbUrl = null; }
    if (this.root.parentElement) this.root.parentElement.removeChild(this.root);
    if (fn) fn(result);
  }

  private handleKey(ev: KeyboardEvent): void {
    if (!this.resolveFn) return;
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      this.resolve(null);
    } else if (ev.key === 'Enter' && !ev.shiftKey) {
      // Shift+Enter inserts a newline; plain Enter submits.
      ev.preventDefault(); ev.stopPropagation();
      this.submit();
    }
  }

  private makeButton(label: string, ref: string, onClick: () => void, primary = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('data-ref', ref);
    Object.assign(btn.style, {
      padding: '6px 14px', fontSize: '12px',
      background: primary ? 'rgba(80, 140, 220, 0.8)' : 'rgba(40, 50, 60, 0.8)',
      color: '#fff', border: '1px solid rgba(160, 190, 255, 0.35)',
      borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
    return btn;
  }
}
