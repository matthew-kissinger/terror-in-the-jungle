import { PixelArtSandbox } from './PixelArtSandbox';
import { injectSharedStyles } from '../ui/design/styles';
import { TouchControlLayout } from '../ui/controls/TouchControlLayout';

function showFatalError(message: string) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  overlay.style.color = '#fff';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.fontFamily = 'monospace';
  overlay.style.zIndex = '9999';

  const title = document.createElement('div');
  title.textContent = 'Failed to initialize. Please refresh the page.';
  title.style.fontSize = '24px';
  title.style.marginBottom = '12px';

  const err = document.createElement('div');
  err.textContent = String(message);
  err.style.fontSize = '14px';
  err.style.color = '#ff5555';
  err.style.marginBottom = '20px';

  const button = document.createElement('button');
  button.textContent = 'Retry';
  button.style.fontSize = '16px';
  button.style.padding = '8px 16px';
  button.style.cursor = 'pointer';
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); window.location.reload(); });

  overlay.appendChild(title);
  overlay.appendChild(err);
  overlay.appendChild(button);
  document.body.appendChild(overlay);
}

export async function bootstrapGame(): Promise<void> {
  // Inject shared design system CSS before any UI is created
  injectSharedStyles();

  // Init responsive touch control sizing (sets CSS custom properties)
  const touchLayout = new TouchControlLayout();
  touchLayout.init();

  const sandbox = new PixelArtSandbox();

  try {
    await sandbox.initialize();
    sandbox.start();

    // Expose sandbox root for perf harness scenario control.
    (window as any).__sandbox = sandbox;
    // Expose sandbox renderer for performance measurement scripts
    (window as any).__sandboxRenderer = sandbox.sandboxRenderer;

    window.addEventListener('beforeunload', () => {
      touchLayout.dispose();
      sandbox.dispose();
    });

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        touchLayout.dispose();
        sandbox.dispose();
      });
    }
  } catch (error) {
    console.error('Bootstrap failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    showFatalError(message);
  }
}
