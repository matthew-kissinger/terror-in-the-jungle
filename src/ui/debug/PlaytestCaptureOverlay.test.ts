/**
 * @vitest-environment jsdom
 *
 * Behavior tests for the F9 playtest capture flow. Per docs/TESTING.md,
 * we assert observable caller-visible outcomes (writer invocation, cancel
 * semantics, session-scoped filenames), not DOM structure.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaytestCaptureOverlay } from './PlaytestCaptureOverlay';
import {
  PlaytestCaptureManager,
  type CaptureArtifact,
  type CaptureContext,
  type CaptureWriter,
} from './PlaytestCaptureManager';

class RecordingWriter implements CaptureWriter {
  writes: CaptureArtifact[] = [];
  async write(artifact: CaptureArtifact): Promise<void> {
    this.writes.push(artifact);
  }
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  // jsdom lacks a native toBlob, so we stub a trivial one. The
  // capture pipeline only cares that we get a Blob back.
  (canvas as HTMLCanvasElement & { toBlob: (cb: BlobCallback, type?: string) => void }).toBlob = (cb) => {
    cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  };
  return canvas;
}

function makeContext(overrides: Partial<CaptureContext> = {}): CaptureContext {
  return {
    canvas: makeCanvas(),
    getMode: () => 'zone-control',
    getPlayerPosition: () => ({ x: 1, y: 2, z: 3 }),
    getPlayerVehicle: () => null,
    getTuningState: () => null,
    ...overrides,
  };
}

async function submitOverlay(annotation: string): Promise<void> {
  // Give the manager a microtask to show the modal, then hit the submit button.
  await Promise.resolve();
  const textarea = document.querySelector('[data-ref="annotation-input"]') as HTMLTextAreaElement | null;
  const submitBtn = document.querySelector('[data-ref="submit-btn"]') as HTMLButtonElement | null;
  if (!textarea || !submitBtn) throw new Error('overlay not mounted');
  textarea.value = annotation;
  submitBtn.click();
}

async function cancelOverlay(): Promise<void> {
  await Promise.resolve();
  const cancelBtn = document.querySelector('[data-ref="cancel-btn"]') as HTMLButtonElement | null;
  if (!cancelBtn) throw new Error('overlay not mounted');
  cancelBtn.click();
}

let manager: PlaytestCaptureManager;
let writer: RecordingWriter;

beforeEach(() => {
  writer = new RecordingWriter();
  manager = new PlaytestCaptureManager(writer);
});

afterEach(() => {
  manager.dispose();
  document.body.innerHTML = '';
});

describe('PlaytestCaptureManager', () => {
  it('writes a PNG + MD + tuning triplet when the user submits', async () => {
    manager.setContext(makeContext());
    const done = manager.trigger();
    await submitOverlay('tank-flipping-on-ridgeline');
    await done;

    expect(writer.writes).toHaveLength(1);
    const artifact = writer.writes[0];
    expect(artifact.pngFilename.endsWith('.png')).toBe(true);
    expect(artifact.markdownFilename.endsWith('.md')).toBe(true);
    expect(artifact.tuningFilename.endsWith('-tuning.json')).toBe(true);
    expect(artifact.pngBlob.type).toBe('image/png');
    expect(artifact.markdown).toContain('tank-flipping-on-ridgeline');
    expect(artifact.markdown).toContain('zone-control');
  });

  it('discards everything when the user cancels', async () => {
    manager.setContext(makeContext());
    const done = manager.trigger();
    await cancelOverlay();
    await done;

    expect(writer.writes).toHaveLength(0);
    expect(manager.getSequence()).toBe(0);
  });

  it('groups captures under a stable session id with a monotonic sequence', async () => {
    manager.setContext(makeContext());
    await (async () => { const p = manager.trigger(); await submitOverlay('first'); await p; })();
    await (async () => { const p = manager.trigger(); await submitOverlay('second'); await p; })();

    expect(writer.writes).toHaveLength(2);
    const [a, b] = writer.writes;
    // Same session directory across captures.
    expect(a.pngFilename.split('/')[1]).toBe(b.pngFilename.split('/')[1]);
    // Sequence counter increments.
    expect(a.pngFilename).toContain('001-');
    expect(b.pngFilename).toContain('002-');
  });

  it('records a tuning_unavailable stub when LiveTuningPanel is absent', async () => {
    manager.setContext(makeContext({ getTuningState: () => null }));
    const done = manager.trigger();
    await submitOverlay('no-tuning');
    await done;

    const parsed = JSON.parse(writer.writes[0].tuningJson);
    expect(parsed.tuning_unavailable).toBe(true);
  });

  it('serializes the live tuning snapshot when the panel is loaded', async () => {
    manager.setContext(makeContext({ getTuningState: () => ({ 'flight.a1.gain': 0.75 }) }));
    const done = manager.trigger();
    await submitOverlay('with-tuning');
    await done;

    const parsed = JSON.parse(writer.writes[0].tuningJson);
    expect(parsed['flight.a1.gain']).toBe(0.75);
  });

  it('is safe to trigger with no context (no writer invocation)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await manager.trigger();
    expect(writer.writes).toHaveLength(0);
    warn.mockRestore();
  });
});

describe('PlaytestCaptureOverlay keyboard handling', () => {
  it('Escape cancels the prompt', async () => {
    const overlay = new PlaytestCaptureOverlay();
    const blob = new Blob([new Uint8Array([137])], { type: 'image/png' });
    const promise = overlay.prompt(blob);
    await Promise.resolve();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const result = await promise;
    expect(result).toBeNull();
  });

  it('Enter submits with the current annotation value', async () => {
    const overlay = new PlaytestCaptureOverlay();
    const blob = new Blob([new Uint8Array([137])], { type: 'image/png' });
    const promise = overlay.prompt(blob);
    await Promise.resolve();
    const textarea = document.querySelector('[data-ref="annotation-input"]') as HTMLTextAreaElement;
    textarea.value = 'enter-submits';
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const result = await promise;
    expect(result?.annotation).toBe('enter-submits');
  });
});
