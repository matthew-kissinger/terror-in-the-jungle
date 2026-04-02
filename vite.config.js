import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      deleteOriginFile: false
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      deleteOriginFile: false
    })
  ],
  optimizeDeps: {
    entries: ['index.html']
  },
  server: {
    watch: {
      ignored: ['**/artifacts/**']
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    reportCompressedSize: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three-mesh-bvh')) return 'bvh'
            if (id.includes('three')) return 'three'
          }

          if (id.includes('/src/ui/')) return 'ui'
        }
      }
    }
  },
  assetsInclude: ['**/*.glsl'],
  worker: {
    format: 'es'
  }
})
