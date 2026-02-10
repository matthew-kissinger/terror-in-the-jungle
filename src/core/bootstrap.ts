import { PixelArtSandbox } from './PixelArtSandbox';

export async function bootstrapGame(): Promise<void> {
  const sandbox = new PixelArtSandbox();
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
}
