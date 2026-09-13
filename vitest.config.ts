import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsConfigPaths()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
