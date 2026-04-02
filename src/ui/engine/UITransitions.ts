import { isPerfDiagnosticsEnabled } from '../../core/PerfDiagnostics';
import { isSandboxMode } from '../../core/SandboxModeDetector';

type UiTransitionIntent = 'menu' | 'live-entry';

type UiTransitionDebugState = {
  enabled: boolean;
  reason: 'live-entry' | 'query-disabled' | 'query-enabled' | 'automation' | 'unsupported' | 'default-enabled';
  supported: boolean;
};

type UiTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  uiTransitionState?: UiTransitionDebugState;
};

function readBooleanOverride(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return null;
}

function readUiTransitionOverride(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    return readBooleanOverride(new URLSearchParams(window.location.search).get('uiTransitions'));
  } catch {
    return null;
  }
}

function resolveUiTransitionDebugState(intent: UiTransitionIntent): UiTransitionDebugState {
  const doc = document as UiTransitionDocument;
  const supported = typeof doc.startViewTransition === 'function';

  if (intent === 'live-entry') {
    return { enabled: false, reason: 'live-entry', supported };
  }

  const override = readUiTransitionOverride();
  if (override === false) {
    return { enabled: false, reason: 'query-disabled', supported };
  }
  if (override === true) {
    return { enabled: supported, reason: 'query-enabled', supported };
  }

  if (isSandboxMode() || isPerfDiagnosticsEnabled()) {
    return { enabled: false, reason: 'automation', supported };
  }

  if (!supported) {
    return { enabled: false, reason: 'unsupported', supported };
  }

  return { enabled: true, reason: 'default-enabled', supported };
}

export function runUiTransition(intent: UiTransitionIntent, update: () => void): void {
  const doc = document as UiTransitionDocument;
  const state = resolveUiTransitionDebugState(intent);
  doc.uiTransitionState = state;

  if (!state.enabled || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }

  try {
    doc.startViewTransition(() => update());
  } catch {
    update();
  }
}
