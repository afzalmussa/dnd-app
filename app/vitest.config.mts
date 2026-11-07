// Unit tests run in plain Node. They only test src/shared, which has no
// Electron or React code, so no browser or Electron is needed.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
})
