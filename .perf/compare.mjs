import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

/**
 * The candidate screenshot layers, on the sources this demo actually mirrors.
 *
 * A mirror captures the same element over and over, so the number that matters
 * is the steady-state cost of a repeat capture, not the first one. Output size is
 * held equal across libraries, since some default to the device pixel ratio and
 * would otherwise be timed doing four times the work.
 *
 * These captures run back to back, which flatters any library that caches
 * between them: SnapDOM reports 5.8ms here and 37ms in `cadence.mjs`, which
 * drives it at 30fps and counts how many of the frames are actually new. Read
 * that one for the number that decides anything.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const MODULES = {
  // The vendored fork this demo actually captures with, built by
  // `npm run screenshot:build` from the repo root.
  renoun: '../vendor/screenshot/dist/index.js',
  snapdom: 'node_modules/@zumer/snapdom/dist/snapdom.mjs',
  modern: 'node_modules/modern-screenshot/dist/index.mjs',
}

const WARMUP = 3
const RUNS = 20

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const failures = []
page.on('pageerror', (error) => failures.push(String(error.message)))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })
await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .scrollIntoView()
})
await wait(1500)

// Imported as real modules, so each library's exports arrive under the names it
// publishes rather than whatever its bundler minified them to.
for (const [name, path] of Object.entries(MODULES)) {
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
await wait(500)

await page.evaluate(() => {
  const own = document.createElement('canvas')
  window.__capture = (library, element, scale) => {
    if (library === 'renoun') {
      return window.__renoun.screenshot
        .canvas(element, { canvas: own, scale, backgroundColor: null })
        .then(() => own)
    }
    if (library === 'snapdom') {
      // dpr defaults to the device's, which would quietly double the output.
      // embedFonts is needed or the capture falls back off the page's font,
      // and it costs about 1ms, so leaving it off would flatter the library.
      return window.__snapdom.snapdom.toCanvas(element, {
        scale,
        dpr: 1,
        embedFonts: true,
      })
    }
    return window.__modern.domToCanvas(element, { scale })
  }

  window.__fingerprint = (canvas) => {
    const { data } = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height)
    let hash = 0
    let ink = 0
    for (let index = 0; index < data.length; index += 4) {
      hash = (hash * 31 + data[index] + data[index + 3]) % 1000000007
      if (data[index + 3] > 10) ink += 1
    }
    return { hash, ink: ink / (data.length / 4) }
  }
})

const measure = (library, selector, scale) =>
  page.evaluate(
    async ({ library, selector, scale, warmup, runs }) => {
      const element = document.querySelector(selector)
      const capture = () => window.__capture(library, element, scale)

      let cold = 0
      try {
        const started = performance.now()
        await capture()
        cold = performance.now() - started
      } catch (error) {
        return { failed: String(error.message ?? error) }
      }

      for (let index = 0; index < warmup; index += 1) await capture()

      const times = []
      let last = null
      for (let index = 0; index < runs; index += 1) {
        const started = performance.now()
        last = await capture()
        times.push(performance.now() - started)
      }

      const shot = window.__fingerprint(last)
      const size = { width: last.width, height: last.height }
      const data = last.toDataURL()

      // Later, the source has moved on. An identical capture means the library
      // served something stale.
      await new Promise((resolve) => setTimeout(resolve, 700))
      const later = window.__fingerprint(await capture())

      times.sort((a, b) => a - b)
      return {
        cold,
        mean: times.reduce((total, value) => total + value, 0) / times.length,
        p50: times[Math.floor(times.length / 2)],
        p95: times[Math.floor(times.length * 0.95)],
        ink: shot.ink,
        live: shot.hash !== later.hash,
        size,
        data,
      }
    },
    { library, selector, scale, warmup: WARMUP, runs: RUNS }
  )

const CARD = '[class*="bg-neutral-950"]'

for (const scale of [1, 2]) {
  console.log(`\nthe player card at ${scale}x`)
  for (const library of Object.keys(MODULES)) {
    const result = await measure(library, CARD, scale)
    if (result.failed) {
      console.log(`  ${library.padEnd(9)} failed: ${result.failed}`)
      continue
    }
    if (scale === 2) {
      fs.writeFileSync(
        `compare-${library}.png`,
        Buffer.from(result.data.split(',')[1], 'base64')
      )
    }
    console.log(
      `  ${library.padEnd(9)} cold ${result.cold.toFixed(1).padStart(6)}ms   ` +
        `warm mean ${result.mean.toFixed(2).padStart(6)}ms  p50 ${result.p50.toFixed(2).padStart(6)}  p95 ${result.p95.toFixed(2).padStart(6)}   ` +
        `${String(result.size.width).padStart(4)}x${String(result.size.height).padEnd(4)} ${(result.ink * 100).toFixed(0).padStart(3)}% painted  ${result.live ? 'live' : 'STALE'}`
    )
    await wait(600)
  }
}

// A <video> is the case that separates the two approaches: its pixels live in
// the compositor and do not serialise into an <svg><foreignObject>.
console.log(`\na playing <video>, which this demo mirrors`)
await page.evaluate(async () => {
  const section = Array.from(document.querySelectorAll('section')).find((s) =>
    s.querySelector('h2')?.textContent?.toLowerCase().includes('video')
  )
  section.scrollIntoView()
  const video = document.getElementById('backdrop-video')
  video.currentTime = 2
  await video.play().catch(() => {})
})
await wait(2000)

for (const library of Object.keys(MODULES)) {
  const result = await measure(library, '#backdrop-video', 1)
  if (result.failed) {
    console.log(`  ${library.padEnd(9)} failed: ${result.failed}`)
    continue
  }
  fs.writeFileSync(
    `compare-video-${library}.png`,
    Buffer.from(result.data.split(',')[1], 'base64')
  )
  console.log(
    `  ${library.padEnd(9)} warm mean ${result.mean.toFixed(2).padStart(6)}ms   ` +
      `${String(result.size.width).padStart(4)}x${String(result.size.height).padEnd(4)} ${(result.ink * 100).toFixed(0).padStart(3)}% painted  ` +
      `${result.live ? 'frame advances' : 'NO MOVING PICTURE'}`
  )
  await wait(600)
}

console.log(`\nfailures: ${failures.length ? failures.slice(0, 3) : 'none'}`)
await browser.close()
