import { Logger } from '../../utils/Logger';
import { PlaytestCaptureOverlay, type CaptureSubmission } from './PlaytestCaptureOverlay';

/** PNG + markdown + tuning-json triplet produced by a single F9 capture. */
export interface CaptureArtifact {
  pngBlob: Blob;
  pngFilename: string;
  markdown: string;
  markdownFilename: string;
  tuningJson: string;
  tuningFilename: string;
}

/** Persistence strategy. Tests inject a recording stub; runtime uses DefaultCaptureWriter. */
export interface CaptureWriter {
  write(artifact: CaptureArtifact): Promise<void>;
}

/** Read-only engine surface the capture manager depends on. */
export interface CaptureContext {
  readonly canvas: HTMLCanvasElement;
  getMode(): string;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getPlayerVehicle(): string | null;
  getTuningState(): Record<string, unknown> | null;
}

/**
 * F9 capture orchestrator: snapshot the canvas, prompt for annotation, write
 * artifacts. Files are scoped into `playtest/session-<iso>/<seq>-<slug>.{png,md,json}`,
 * with a monotonic sequence counter and session id assigned at first capture.
 */
export class PlaytestCaptureManager {
  private readonly overlay: PlaytestCaptureOverlay;
  private sessionId: string | null = null;
  private sequence = 0;
  private capturing = false;
  private indicator: HTMLDivElement | null = null;
  private context: CaptureContext | null = null;

  constructor(private readonly writer: CaptureWriter, overlay?: PlaytestCaptureOverlay) {
    this.overlay = overlay ?? new PlaytestCaptureOverlay();
  }

  setContext(context: CaptureContext): void { this.context = context; }
  getSequence(): number { return this.sequence; }
  getSessionId(): string | null { return this.sessionId; }

  /** F9 entry point. Reentrant-safe: ignored while a capture is in-flight. */
  async trigger(): Promise<void> {
    if (this.capturing) return;
    if (!this.context) { Logger.warn('playtest-capture', 'No context wired; skipping'); return; }
    this.capturing = true;
    try {
      const blob = await canvasToPngBlob(this.context.canvas);
      if (!blob) { Logger.warn('playtest-capture', 'toBlob returned null; aborting'); return; }
      const submission = await this.overlay.prompt(blob);
      if (!submission) return;

      if (!this.sessionId) this.sessionId = isoStamp();
      this.sequence += 1;
      const artifact = this.buildArtifact(blob, submission);
      await this.writer.write(artifact);
      this.refreshIndicator();
      Logger.info('playtest-capture', `Captured ${artifact.pngFilename}`);
    } catch (err) {
      Logger.warn('playtest-capture', 'Capture failed:', err);
    } finally {
      this.capturing = false;
    }
  }

  dispose(): void {
    this.overlay.dispose();
    if (this.indicator?.parentElement) this.indicator.parentElement.removeChild(this.indicator);
    this.indicator = null;
  }

  private buildArtifact(blob: Blob, submission: CaptureSubmission): CaptureArtifact {
    const ctx = this.context!;
    const slug = slugify(submission.annotation);
    const stem = `${String(this.sequence).padStart(3, '0')}-${slug}`;
    const dir = `playtest/session-${this.sessionId}`;
    const position = ctx.getPlayerPosition();
    const tuning = ctx.getTuningState();
    const commit = getCommitHash();
    const markdown = [
      `# Playtest Capture ${this.sequence}`, '',
      `- Session: \`${this.sessionId}\``,
      `- Captured at: ${new Date().toISOString()}`,
      `- Commit: \`${commit ?? 'unknown'}\``,
      `- Mode: \`${ctx.getMode() || 'unknown'}\``,
      `- Player position: ${position ? `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}` : 'n/a'}`,
      `- Player vehicle: ${ctx.getPlayerVehicle() ?? 'on-foot'}`,
      `- Tuning snapshot: \`${stem}-tuning.json\``,
      '', '## Annotation', '',
      submission.annotation || '_(no annotation provided)_', '',
    ].join('\n');
    const tuningJson = tuning
      ? JSON.stringify(tuning, null, 2)
      : JSON.stringify({ tuning_unavailable: true, reason: 'live-tuning-panel not loaded', at: new Date().toISOString() }, null, 2);
    return {
      pngBlob: blob,
      pngFilename: `${dir}/${stem}.png`,
      markdown,
      markdownFilename: `${dir}/${stem}.md`,
      tuningJson,
      tuningFilename: `${dir}/${stem}-tuning.json`,
    };
  }

  private refreshIndicator(): void {
    if (!this.indicator) {
      const el = document.createElement('div');
      el.className = 'playtest-capture-indicator';
      el.setAttribute('data-ref', 'playtest-capture-indicator');
      Object.assign(el.style, {
        position: 'fixed', top: '12px', right: '12px', padding: '4px 8px',
        background: 'rgba(10, 16, 18, 0.82)', color: '#d5e2f0',
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        borderRadius: '4px', border: '1px solid rgba(160, 190, 255, 0.35)',
        pointerEvents: 'none', zIndex: '2000',
      } as CSSStyleDeclaration);
      document.body.appendChild(el);
      this.indicator = el;
    }
    const plural = this.sequence === 1 ? 'capture' : 'captures';
    this.indicator.textContent = `session active - ${this.sequence} ${plural}`;
  }
}

/**
 * Default writer. Prefers the File System Access API (directory handle
 * cached after first grant); falls back to per-file anchor-download.
 */
export class DefaultCaptureWriter implements CaptureWriter {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  async write(artifact: CaptureArtifact): Promise<void> {
    if (supportsFileSystemAccess()) {
      try { await this.writeWithFileSystemApi(artifact); return; }
      catch (err) { Logger.warn('playtest-capture', 'FS Access write failed, falling back:', err); }
    }
    triggerDownload(artifact.pngBlob, basename(artifact.pngFilename));
    triggerDownload(new Blob([artifact.markdown], { type: 'text/markdown' }), basename(artifact.markdownFilename));
    triggerDownload(new Blob([artifact.tuningJson], { type: 'application/json' }), basename(artifact.tuningFilename));
  }

  private async writeWithFileSystemApi(artifact: CaptureArtifact): Promise<void> {
    if (!this.dirHandle) {
      const picker = (window as unknown as {
        showDirectoryPicker?: (opts?: { id?: string; mode?: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker;
      if (!picker) throw new Error('showDirectoryPicker unavailable');
      this.dirHandle = await picker({ id: 'playtest-captures', mode: 'readwrite' });
    }
    await writeFileIntoPath(this.dirHandle, artifact.pngFilename, artifact.pngBlob);
    await writeFileIntoPath(this.dirHandle, artifact.markdownFilename, new Blob([artifact.markdown], { type: 'text/markdown' }));
    await writeFileIntoPath(this.dirHandle, artifact.tuningFilename, new Blob([artifact.tuningJson], { type: 'application/json' }));
  }
}

// --- helpers ---

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') { resolve(null); return; }
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function supportsFileSystemAccess(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

async function writeFileIntoPath(root: FileSystemDirectoryHandle, path: string, data: Blob): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  const filename = parts.pop()!;
  let dir: FileSystemDirectoryHandle = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '').slice(0, 19);
}

function slugify(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return cleaned || 'capture';
}

function getCommitHash(): string | null {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return meta?.VITE_COMMIT_HASH ?? null;
}
