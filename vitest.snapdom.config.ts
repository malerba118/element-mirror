import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

// Runs the vendored SnapDOM suites nearest the fork's own changes (PERF-5/6:
// per-node invalidation, logical-prop trimming, base CSS compression, the
// toCanvas `canvas` option) in real Chromium — this repo has no jsdom, and the
// full upstream suite was written for it. `npm run snapdom:test`.
export default defineConfig({
  test: {
    include: [
      'vendor/snapdom/__tests__/core.capture*.test.js',
      'vendor/snapdom/__tests__/core.clone*.test.js',
      'vendor/snapdom/__tests__/core.cache.test.js',
      'vendor/snapdom/__tests__/module.pseudo*.test.js',
      'vendor/snapdom/__tests__/module.styles*.test.js',
      'vendor/snapdom/__tests__/utils.css*.test.js',
      'vendor/snapdom/__tests__/cssTools.utils.test.js',
      'vendor/snapdom/__tests__/exporter.toCanvas*.test.js',
      'vendor/snapdom/__tests__/api.snapdom.test.js',
    ],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
})
