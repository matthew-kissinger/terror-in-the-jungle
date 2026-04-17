import { defineConfig } from 'vite';

// Standalone bench — isolated from the main app config so it doesn't pull
// in the main bundle, its plugins, or its manualChunks splitting.
export default defineConfig({
  root: '.',
  server: {
    port: 5180,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: 'dist-bench',
    target: 'es2020',
    emptyOutDir: true,
  },
});
