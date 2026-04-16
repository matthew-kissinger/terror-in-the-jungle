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
  // Route @recast-navigation/wasm to its non-compat entry so the WASM binary
  // ships as one content-hashed asset shared across the main and navmesh
  // worker graphs. The compat variant inlined the binary as base64, which
  // produced a ~710kB loader chunk duplicated per Vite worker boundary
  // (~1.4MB raw / ~425KB gzip). With this alias the duplication collapses
  // to a ~275kB Emscripten loader JS per graph plus a single ~340kB .wasm
  // asset -- net savings ~540kB raw / ~210kB gzipped.
  resolve: {
    alias: {
      '@recast-navigation/wasm': '@recast-navigation/wasm/wasm'
    }
  },
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
