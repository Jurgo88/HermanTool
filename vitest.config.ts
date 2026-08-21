import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

// Two suites, one `vitest run` (UI-005, D-34, IR-03). Front-end tests are not
// a separate workflow: ci.yml already runs `pnpm test`, so a failing component
// test fails the build without touching the workflow file.
//
// The split is by what a test needs, not by where it lives. Only mounting a
// component needs a DOM and Nuxt's auto-imports; everything else — server
// domain logic, shared modules, and pure front-end functions like
// app/utils/format.ts — runs in plain node and stays fast.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'tests/server/**/*.test.ts',
            'tests/shared/**/*.test.ts',
            'tests/app/utils/**/*.test.ts',
          ],
          // Integration suites truncate shared tables in beforeEach (e.g. Asset
          // Registry's and Catalog's both touch assets/asset_types). Running
          // test files in parallel — vitest's default — causes concurrent
          // truncates on the same tables to deadlock in real Postgres. Pilot
          // scale (NFR-04) makes serial file execution cheap; it is not worth
          // a more surgical per-project split.
          fileParallelism: false,
        },
      },
      // Components reach for Nuxt auto-imports (`computed` in AppAlert.vue) and
      // the `~` alias (`~/i18n/sk`), so plain @vue/test-utils cannot mount them.
      // The nuxt environment supplies both, at the cost of building Nuxt once
      // per run — hence the hook timeout, which the 10s default does not cover
      // on a cold cache.
      await defineVitestProject({
        test: {
          name: 'component',
          environment: 'nuxt',
          include: ['tests/app/components/**/*.test.ts'],
          hookTimeout: 120_000,
        },
      }),
    ],
  },
})
