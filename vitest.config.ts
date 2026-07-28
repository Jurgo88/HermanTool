import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration suites truncate shared tables in beforeEach (e.g. Asset
    // Registry's and Catalog's both touch assets/asset_types). Running
    // test files in parallel — vitest's default — causes concurrent
    // truncates on the same tables to deadlock in real Postgres. Pilot
    // scale (NFR-04) makes serial file execution cheap; it is not worth
    // a more surgical per-project split.
    fileParallelism: false,
  },
})
