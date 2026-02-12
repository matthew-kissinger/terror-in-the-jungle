import { PixelArtSandbox } from './PixelArtSandbox';

export async function bootstrapGame(): Promise<void> {
  const sandbox = new PixelArtSandbox();

  try {
    await sandbox.initialize();
    sandbox.start();

    // Expose sandbox renderer for performance measurement scripts
    (window as any).__sandboxRenderer = sandbox.sandboxRenderer;

    window.addEventListener('beforeunload', () => {
      sandbox.dispose();
    });

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        sandbox.dispose();
      });
    }
  } catch (error) {
    // Error already shown by initializeSystems, just log it
    console.error('Bootstrap failed:', error);
  }
}
