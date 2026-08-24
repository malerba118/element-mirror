import { chromium, firefox, webkit } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * Where a capture's main-thread time goes, phase by phase, in every engine.
 *
 * WebKit runs the same capture Chromium prices at ~11ms at ~68ms, which is
 * the difference between a 12fps mirror and a 4fps one once the duty cycle
 * spaces captures by their cost. `captureDOM` logs its phases when
 * `globalThis.__SNAPDOM_PHASES__` is set; this drives repeated captures of a
 * static copy of the player card and prints the phase averages per engine.
 *
 *   node .perf/capture-phases.mjs
 *
 * Needs the dev server up (`pnpm dev`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'
const ROUNDS = Number(process.argv[3] ?? 30)

const dist = new URL('../packages/snapdom/src/', import.meta.url).pathname

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch()
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  await serveModules(page, '/__snapdom/', dist)
  await page.goto(PAGE, { waitUntil: 'load' })
  await page.waitForSelector(SELECTOR, { timeout: 20000 })
  await page.addScriptTag({
    type: 'module',
    content: `
      import { snapdom } from '/__snapdom/index.js'
      window.__lib = { snapdom }
    `,
  })
  await page.waitForFunction(() => Boolean(window.__lib))

  const report = await page.evaluate(
    async ({ selector, rounds }) => {
      // A static copy of the card, alone in the document: the page's own
      // mirrors and React timers would otherwise compete for the thread
      // being measured.
      const card = document.querySelector(selector)
      const copy = card.cloneNode(true)
      document.body.replaceChildren(copy)
      await new Promise((resolve) => setTimeout(resolve, 300))

      const { snapdom } = window.__lib
      const options = {
        dpr: 2,
        scale: 1,
        embedFonts: true,
        outerShadows: 'subtree',
        captureSelection: true,
        exclude: ['[data-element-mirror-ignore]'],
      }
      await snapdom(copy, options) // warm every cache

      globalThis.__SNAPDOM_PHASES__ = []
      const wall = []
      for (let round = 0; round < rounds; round += 1) {
        const started = performance.now()
        await snapdom(copy, options)
        wall.push(performance.now() - started)
        await new Promise((resolve) => setTimeout(resolve, 40))
      }

      const phases = {}
      for (const { phase, ms } of globalThis.__SNAPDOM_PHASES__) {
        phases[phase] = (phases[phase] ?? 0) + ms
      }
      for (const key of Object.keys(phases)) {
        phases[key] = +(phases[key] / rounds).toFixed(2)
      }
      const average = wall.reduce((sum, ms) => sum + ms, 0) / wall.length
      return { phases, average: +average.toFixed(2) }
    },
    { selector: SELECTOR, rounds: ROUNDS }
  )

  console.log(`\n${name} — ${report.average}ms per capture`)
  for (const [phaseName, ms] of Object.entries(report.phases).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${phaseName.padEnd(14)} ${String(ms).padStart(7)}ms`)
  }
  await browser.close()
}
