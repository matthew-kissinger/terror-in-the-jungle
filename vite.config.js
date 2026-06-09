import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The 10 UI bake-off mockups live in `public/mockups/` so they stay in git as
// the canonical visual reference (see docs/FIELD_JOURNAL_UI.md) and remain
// viewable on the dev server at /mockups/. They are NOT product, though, so we
// strip the directory from `dist/` after the bundle is written — the prod
// deploy carries zero mockup bytes (Field Journal direction 03 won 2026-06-03).
function stripMockupsFromBuild() {
  let outDir = 'dist'
  return {
    name: 'strip-mockups-from-build',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      rmSync(resolve(import.meta.dirname, outDir, 'mockups'), {
        recursive: true,
        force: true
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [stripMockupsFromBuild()],
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
    assetsDir: 'build-assets',
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
