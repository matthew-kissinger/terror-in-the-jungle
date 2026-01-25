import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/terror-in-the-jungle/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  assetsInclude: ['**/*.glsl'],
  worker: {
    format: 'es'
  }
})