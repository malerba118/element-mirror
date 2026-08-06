import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

/**
 * Cost at a mirror's cadence rather than in a tight loop.
 *
 * Captured back to back, SnapDOM's burst mode hands the same snapshot to every
 * call and reports 0.05ms, and every library benefits from caches still warm
 * from the previous line of the loop. A mirror captures on an interval and needs
 * a fresh frame each time, so this drives each candidate at 30fps for a few
 * seconds and prices the captures it actually performs.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const CONFIGS = [
  { label: 'renoun', library: 'renoun' },
  { label: 'snapdom embedFonts', library: 'snapdom', options: { embedFonts: true } },
  {
    label: 'snapdom +burst',
    library: 'snapdom',
    options: { embedFonts: true, burst: true },
  },
  {
    label: 'snapdom cache soft',
    library: 'snapdom',
    options: { embedFonts: true, cache: 'soft' },
  },
  {
    label: 'snapdom cache off',
    library: 'snapdom',
    options: { embedFonts: true, cache: 'disabled' },
  },
]

const INTERVAL_MS = 1000 / 30
const SECONDS = 3

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .scrollIntoView()
})
await wait(1500)

for (const [name, path] of Object.entries({
  snap: 'node_modules/@zumer/snapdom/dist/snapdom.mjs',
  renoun: '../vendor/screenshot/dist/index.js',
})) {
  await page.evaluate(
    async ({ name, source }) => {
      const blob = new Blob([source], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      window[`__${name}`] = await import(url)
      URL.revokeObjectURL(url)
    },
    { name, source: fs.readFileSync(path, 'utf8') }
  )
}

console.log(`driven at 30fps for ${SECONDS}s, capturing the player card at 2x\n`)

for (const config of CONFIGS) {
  const result = await page.evaluate(
    async ({ config, intervalMs, seconds }) => {
      const card = document.querySelector('[class*="bg-neutral-950"]')
      const own = document.createElement('canvas')
      const capture = async () => {
        if (config.library === 'renoun') {
          await window.__renoun.screenshot.canvas(card, {
            canvas: own,
            scale: 2,
            backgroundColor: null,
          })
          return own
        }
        return window.__snap.snapdom.toCanvas(card, {
          scale: 2,
          dpr: 1,
          ...config.options,
        })
      }

      const fingerprint = (canvas) => {
        const { data } = canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height)
        let hash = 0
        for (let index = 0; index < data.length; index += 4) {
          hash = (hash * 31 + data[index] + data[index + 3]) % 1000000007
        }
        return hash
      }

      await capture()

      const times = []
      const hashes = []
      const deadline = performance.now() + seconds * 1000
      while (performance.now() < deadline) {
        const dueAt = performance.now() + intervalMs
        const started = performance.now()
        const canvas = await capture()
        times.push(performance.now() - started)
        hashes.push(fingerprint(canvas))
        const remaining = dueAt - performance.now()
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining))
        }
      }

      const sorted = [...times].sort((a, b) => a - b)
      return {
        captures: times.length,
        mean: times.reduce((total, value) => total + value, 0) / times.length,
        p95: sorted[Math.floor(sorted.length * 0.95)],
        distinct: new Set(hashes).size,
      }
    },
    { config, intervalMs: INTERVAL_MS, seconds: SECONDS }
  )

  const fresh = result.distinct / result.captures
  console.log(
    `  ${config.label.padEnd(20)} ${String(result.captures).padStart(3)} captures  ` +
      `mean ${result.mean.toFixed(2).padStart(6)}ms  p95 ${result.p95.toFixed(2).padStart(6)}ms  ` +
      `${result.distinct} distinct frames (${(fresh * 100).toFixed(0)}% fresh)`
  )
  await wait(800)
}

await browser.close()
