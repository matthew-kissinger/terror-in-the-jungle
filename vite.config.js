import { defineConfig } from 'vite'
import compression from 'vite-plugin-compression'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/terror-in-the-jungle/',
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
  resolve: {
    alias: [
      { find: /^three$/, replacement: 'three/src/Three.js' }
    ]
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
            if (id.includes('three/examples/jsm')) return 'three-examples'
            // All three/src/* in one chunk to avoid circular-dep TDZ errors
            if (id.includes('three/src')) return 'three'
            if (id.includes('three-mesh-bvh')) return 'bvh'
            if (id.includes('postprocessing')) return 'postprocessing'
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
