// End-to-end tests: they start the built app (run `npm run build` first, or use `npm run test:e2e`).
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1, // one app window at a time
  reporter: 'list'
})
