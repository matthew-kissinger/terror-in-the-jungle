import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.ts',
      'packages/*/src/**/*.{test,spec}.ts',
      'scripts/*.{test,spec}.ts',
      'scripts/perf-harness/**/*.{test,spec}.{js,ts}',
      'docs/**/*.{test,spec}.ts',
    ],
    passWithNoTests: true,
    typecheck: {
      enabled: true,
    },
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
});
