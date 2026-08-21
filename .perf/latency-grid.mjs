import { chromium } from 'playwright'

/**
 * Measures change-to-capture latency on the latency-test page, whose mirror
 * runs at fps 5 (a 200ms grid). Grid-aligned capture puts a discrete change a
 * median of ~100ms from its capture; event-aligned capture puts it about one
 * frame away. Relies on the em:dirty / em:main performance marks.
 */

const PAGE = 'http://localhost:5173/latency-test'
const TRIALS = 8

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const results = []
for (let trial = 0; trial < TRIALS; trial++) {
  // Land at a random phase within the 200ms grid interval.
  await page.waitForTimeout(400 + Math.random() * 400)
  const ms = await page.evaluate(async (text) => {
    performance.clearMarks('em:dirty')
    performance.clearMeasures('em:main')
    window.__bump(text)
    return await new Promise((resolve) => {
      const started = performance.now()
      const check = () => {
        const dirty = performance
          .getEntriesByName('em:dirty')
          .find((entry) => entry.startTime >= started - 5)
        const main = performance
          .getEntriesByName('em:main')
          .find((entry) => dirty && entry.startTime >= dirty.startTime)
        if (dirty && main) {
          resolve(Math.round(main.startTime - dirty.startTime))
          return
        }
        if (performance.now() - started > 2000) {
          resolve(-1)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
  }, `t${trial}-${Date.now()}`)
  results.push(ms)
}

results.sort((a, b) => a - b)
console.log('change-to-capture, ms per trial:', results.join(', '))
console.log('median:', results[Math.floor(results.length / 2)], 'ms')
await browser.close()
