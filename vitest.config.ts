import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
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
