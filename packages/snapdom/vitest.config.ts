import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

// Runs the upstream suites nearest this fork's own changes (PERF-5/6:
// per-node invalidation, logical-prop trimming, base CSS compression, the
// toCanvas `canvas` option) in real Chromium — this repo has no jsdom, and
// the rest of upstream's suite was written for it. `pnpm test` here, or
// `pnpm --filter @frostin/snapdom test` from the root.
export default defineConfig({
  test: {
    include: [
      '__tests__/core.capture*.test.js',
      '__tests__/core.clone*.test.js',
      '__tests__/core.cache.test.js',
      '__tests__/module.pseudo*.test.js',
      '__tests__/module.styles*.test.js',
      '__tests__/utils.css*.test.js',
      '__tests__/cssTools.utils.test.js',
      '__tests__/exporter.toCanvas*.test.js',
      '__tests__/api.snapdom.test.js',
    ],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
