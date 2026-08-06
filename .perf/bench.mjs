import puppeteer from 'puppeteer-core'

/**
 * How evenly a mirror actually delivers frames at a given rate.
 *
 * Frame delivery is detected by downscaling the mirror into a small scratch
 * canvas each animation frame and noticing when the pixels change, which is
 * cheap enough not to distort what it measures. Stutter shows up as spread in
 * the intervals rather than in their mean.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const port = process.argv[2] ?? '5200'
const label = process.argv[3] ?? `port ${port}`
const targetFps = Number(process.argv[4] ?? 30)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const light = process.env.LIGHT === '1'
await page.goto(`http://localhost:${port}/${light ? '#light' : ''}`, {
  waitUntil: 'networkidle2',
})

// Optionally take a section off the page first, to price what it costs the
// rest of the page just by existing.
const strip = process.argv[5]
if (strip) {
  const removed = await page.evaluate((needle) => {
    const section = Array.from(document.querySelectorAll('section')).find((s) =>
      s.querySelector('h2')?.textContent?.includes(needle)
    )
    if (!section) return false
    section.remove()
    return true
  }, strip)
  console.log(`removed the "${strip}" section: ${removed}`)
  await wait(1000)
}

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('Playground'))
    .scrollIntoView()
})
await wait(1500)

// Drive the fps slider from its thumb with the keyboard, which is exact where
// dragging is not. Walk to the top of the range first, then back down.
const thumb = await page.$('#fps [role="slider"]')
await thumb.focus()
const readFps = () =>
  page.evaluate(() =>
    Number(
      document.querySelector('#fps [role="slider"]')?.getAttribute('aria-valuenow')
    )
  )
for (let index = 0; index < 60; index += 1) {
  await page.keyboard.press('ArrowRight')
}
const ceiling = await readFps()
while ((await readFps()) > targetFps) {
  await page.keyboard.press('ArrowLeft')
}
await wait(1200)

const settledFps = await readFps()
console.log(`slider ceiling is ${ceiling}fps`)

const result = await page.evaluate(async (seconds) => {
  const canvas = document.querySelector('section canvas[data-screenshot-ignore]')
  const scratch = document.createElement('canvas')
  scratch.width = 32
  scratch.height = 32
  const context = scratch.getContext('2d', { willReadFrequently: true })

  const frames = []
  const paints = []
  const counters = []
  let previous = -1
  let raf

  // The badge is a rolling half-second average, so sample it throughout rather
  // than reading it once at the end.
  const sampler = setInterval(() => {
    const text = document.querySelector('header .font-mono')?.textContent ?? ''
    const captures = text.match(/([\d.]+)\s*cap\/s/)
    const blits = text.match(/([\d.]+)\s*blit\/s/)
    const ms = text.match(/([\d.]+)\s*ms/)
    if (captures && blits && ms) {
      counters.push({
        captures: Number(captures[1]),
        blits: Number(blits[1]),
        ms: Number(ms[1]),
      })
    }
  }, 400)

  // Record the blits themselves rather than sampling the canvas for changes.
  // Reading pixels back each animation frame costs more than what it measures.
  const context2d = canvas.getContext('2d')
  const original = CanvasRenderingContext2D.prototype.drawImage
  CanvasRenderingContext2D.prototype.drawImage = function patched(...args) {
    if (this === context2d) frames.push(performance.now())
    return original.apply(this, args)
  }

  const probe = false

  const tick = () => {
    const at = performance.now()
    paints.push(at)
    if (probe && canvas.width && canvas.height) {
      context.drawImage(canvas, 0, 0, 32, 32)
      const { data } = context.getImageData(0, 0, 32, 32)
      let hash = 0
      for (let index = 0; index < data.length; index += 4) {
        hash = (hash * 31 + data[index] + data[index + 1] * 7) % 1000000007
      }
      if (hash !== previous) {
        frames.push(at)
        previous = hash
      }
    }
    raf = requestAnimationFrame(tick)
  }
  tick()

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
  cancelAnimationFrame(raf)
  clearInterval(sampler)
  CanvasRenderingContext2D.prototype.drawImage = original

  const gaps = frames.slice(1).map((time, index) => time - frames[index])
  const paintGaps = paints.slice(1).map((time, index) => time - paints[index])
  const mean = (key) =>
    counters.length
      ? counters.reduce((total, row) => total + row[key], 0) / counters.length
      : 0

  return {
    gaps,
    paintGaps,
    frames: frames.length,
    captures: mean('captures'),
    blits: mean('blits'),
    ms: mean('ms'),
  }
}, 6)

const stats = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length
  return {
    mean,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted[sorted.length - 1],
    jitter: Math.sqrt(variance),
  }
}

const delivery = stats(result.gaps)
const paint = stats(result.paintGaps)
const ideal = 1000 / targetFps

console.log(`\n${label} — fps slider at ${settledFps}, ideal gap ${ideal.toFixed(1)}ms`)
if (delivery) {
  console.log(
    `  frames delivered   ${result.frames} in 6s (${(result.frames / 6).toFixed(1)}/s)`
  )
  console.log(
    `  gap between frames mean ${delivery.mean.toFixed(1)}ms  p50 ${delivery.p50.toFixed(1)}  p95 ${delivery.p95.toFixed(1)}  max ${delivery.max.toFixed(1)}  jitter ±${delivery.jitter.toFixed(1)}`
  )
}
console.log(
  `  browser paints     mean ${paint.mean.toFixed(1)}ms  p95 ${paint.p95.toFixed(1)}  max ${paint.max.toFixed(1)}`
)
console.log(
  `  scheduler          ${result.captures.toFixed(1)} captures/s  ${result.blits.toFixed(1)} blits/s  ${result.ms.toFixed(2)} ms/capture`
)
console.log(`  problems           ${problems.length ? problems : 'none'}`)

await browser.close()
