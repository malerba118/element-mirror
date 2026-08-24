import { chromium } from 'playwright'

/**
 * Measures focus-to-mirror latency on the glass-floor demo: how long after
 * `input.focus()` any mirror of the card shows different pixels. Runs several
 * trials from idle, which is the worst case for the capture scheduler.
 */

const PAGE = 'http://localhost:5173/glass-floor'
const TRIALS = 6

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'],
})
const page = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
})
await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const results = []
for (let trial = 0; trial < TRIALS; trial++) {
  const detail = await page.evaluate(async () => {
    const canvas = document.querySelector('[data-bloom="0"] canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const grab = () =>
      context.getImageData(0, 0, canvas.width, canvas.height).data
    const before = grab()
    const changed = () => {
      const data = grab()
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== before[i]) return true
      }
      return false
    }
    const input = document.getElementById('email')
    performance.clearMeasures('em:main')
    performance.clearMeasures('em:settled')
    performance.clearMarks('em:dirty')
    const started = performance.now()
    input.focus()
    const total = await new Promise((resolve) => {
      const check = () => {
        if (changed()) {
          resolve(Math.round(performance.now() - started))
          return
        }
        if (performance.now() - started > 3000) {
          resolve(-1)
          return
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    // The first capture that began after focus is the one carrying the ring.
    const main = performance
      .getEntriesByName('em:main')
      .find((entry) => entry.startTime >= started)
    const settled = performance
      .getEntriesByName('em:settled')
      .find((entry) => entry.startTime >= started)
    const dirty = performance
      .getEntriesByName('em:dirty')
      .find((entry) => entry.startTime >= started)
    return {
      total,
      dirtyToCapture:
        main && dirty ? Math.round(main.startTime - dirty.startTime) : -1,
      wait: main ? Math.round(main.startTime - started) : -1,
      main: main ? Math.round(main.duration) : -1,
      raster: settled ? Math.round(settled.duration - (main?.duration ?? 0)) : -1,
    }
  })
  console.log(
    `trial ${trial}: total ${detail.total}ms = wait ${detail.wait} (dirty→capture ${detail.dirtyToCapture}) + capture ${detail.main} + raster ${detail.raster}`
  )
  results.push(detail.total)
  await page.evaluate(() => document.activeElement?.blur())
  // Long enough for the blur to be captured and the scheduler to go idle.
  await page.waitForTimeout(1500)
}

results.sort((a, b) => a - b)
console.log('focus-to-mirror latency, ms per trial:', results.join(', '))
console.log(
  'median:',
  results[Math.floor(results.length / 2)],
  'ms · best:',
  results[0],
  'ms · worst:',
  results[results.length - 1],
  'ms'
)
await browser.close()
