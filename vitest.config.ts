import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// The merge engine under src/core is framework-agnostic (pure TS + sql.js + JSZip),
// so the whole suite runs in plain Node — no jsdom, no Vue plugins needed.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
