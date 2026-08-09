/**
 * Separate from vite.config.ts on purpose.
 *
 * The app's vite config registers an xlsx watcher plugin that regenerates the LSD dictionary
 * on save. That plugin is useful in `npm run dev` and pointless — and a source of spurious
 * file writes — inside a test run, so the test config declares only what tests need: the
 * React transform, for TSX.
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // `api/_lib/**` holds the server-surface tests. They live under an underscore-prefixed
    // directory because Vercel does not deploy those, so a test file cannot become an endpoint.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'api/_lib/**/*.test.ts'],
  },
})
