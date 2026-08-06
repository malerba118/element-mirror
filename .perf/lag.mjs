import puppeteer from 'puppeteer-core'

/**
 * Measures how far behind the source each delayed mirror actually runs.
 *
 * The source contains a bar whose horizontal position is a known function of
 * time, so the position drawn on a mirror names the moment it is showing. Each
 * mirror is sampled repeatedly and its lag is solved for by finding the shift
 * that best explains every sample, which is robust to the capture rate and to
 * any single bad read.
 *
 * Run twice: once against a source that changes every frame, and once against
 * one that changes rarely, so that skipped captures are covered too.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const TRACK = 320
const BAR = 16
const PERIOD = 4000
const SOURCE_WIDTH = 360
const SOURCE_HEIGHT = 120
const TRACK_TOP = 60

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 1000, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
const problems = []
page.on('pageerror', (error) => problems.push(`[pageerror] ${error.message}`))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

await page.evaluate(() => {
  Array.from(document.querySelectorAll('section'))
    .find((s) => s.querySelector('h2')?.textContent?.includes('run behind'))
    .scrollIntoView()
})
await wait(1200)

async function install({ stepMs }) {
  await page.evaluate(
    (config) => {
      if (window.__stop) window.__stop()

      const previous = document.querySelector('#delay-source')
      if (previous) {
        if (previous.dataset.probe) previous.remove()
        else {
          previous.removeAttribute('id')
          previous.style.display = 'none'
          window.__host = previous.parentElement
        }
      }

      const source = document.createElement('div')
      source.id = 'delay-source'
      source.dataset.probe = 'true'
      source.style.cssText = `width:${config.width}px;height:${config.height}px;background:#fff;position:relative;font:13px system-ui;color:#000`
      source.innerHTML = `
        <p style="margin:0;padding:12px">position encodes the time</p>
        <div style="position:absolute;top:${config.trackTop}px;left:0;width:${config.track}px;height:24px;background:#fff;overflow:hidden">
          <div id="probe-bar" style="width:${config.bar}px;height:24px;background:#ff0000"></div>
        </div>
      `
      window.__host.appendChild(source)

      const bar = source.querySelector('#probe-bar')
      window.__t0 = performance.now()
      window.__config = config

      // Position is a sawtooth in time, so a position names a moment.
      window.__positionAt = (time) => {
        const phase = (time - window.__t0) % config.period
        const raw = (phase / config.period) * (config.track - config.bar)
        return config.stepMs > 0
          ? Math.round(raw / ((config.track - config.bar) / (config.period / config.stepMs))) *
              ((config.track - config.bar) / (config.period / config.stepMs))
          : raw
      }

      let frame
      const tick = () => {
        bar.style.marginLeft = `${window.__positionAt(performance.now())}px`
        frame = requestAnimationFrame(tick)
      }
      tick()
      window.__stop = () => cancelAnimationFrame(frame)
    },
    {
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
      track: TRACK,
      bar: BAR,
      period: PERIOD,
      trackTop: TRACK_TOP,
      stepMs,
    }
  )
}

async function sample(samples, spacingMs) {
  return page.evaluate(
    async (config) => {
      const section = Array.from(document.querySelectorAll('section')).find(
        (s) => s.querySelector('h2')?.textContent?.includes('run behind')
      )
      const canvases = Array.from(
        section.querySelectorAll('canvas[data-screenshot-ignore]')
      )
      const readings = canvases.map(() => [])

      const centroid = (canvas) => {
        if (!canvas.width || !canvas.height) return null
        const scale = canvas.width / config.width
        const top = Math.round((config.trackTop + 6) * scale)
        const height = Math.max(1, Math.round(12 * scale))
        const { data } = canvas
          .getContext('2d')
          .getImageData(0, top, canvas.width, height)
        let sum = 0
        let count = 0
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] > 190 && data[index + 1] < 90 && data[index + 2] < 90) {
            const pixel = index / 4
            sum += pixel % canvas.width
            count += 1
          }
        }
        if (count < 8) return null
        // Left edge of the bar, in source CSS pixels.
        return sum / count / scale - config.bar / 2
      }

      for (let round = 0; round < config.samples; round += 1) {
        for (let index = 0; index < canvases.length; index += 1) {
          const at = performance.now()
          const x = centroid(canvases[index])
          if (x !== null) readings[index].push({ at, x })
        }
        await new Promise((resolve) => setTimeout(resolve, config.spacingMs))
      }
      return { readings, t0: window.__t0 }
    },
    {
      samples,
      spacingMs,
      width: SOURCE_WIDTH,
      trackTop: TRACK_TOP,
      bar: BAR,
    }
  )
}

/** The shift that best explains where the bar was drawn, in milliseconds. */
function solveLag(readings, t0, stepMs) {
  const span = TRACK - BAR
  const expected = (time) => {
    const phase = (((time - t0) % PERIOD) + PERIOD) % PERIOD
    const raw = (phase / PERIOD) * span
    if (stepMs <= 0) return raw
    const quantum = span / (PERIOD / stepMs)
    return Math.round(raw / quantum) * quantum
  }

  let best = { lag: 0, error: Infinity }
  for (let lag = -100; lag <= 1400; lag += 5) {
    let total = 0
    for (const reading of readings) {
      let error = Math.abs(reading.x - expected(reading.at - lag))
      // The sawtooth wraps, so a large error may be a small one across the seam.
      error = Math.min(error, span - error)
      total += error
    }
    const mean = total / readings.length
    if (mean < best.error) best = { lag, error: mean }
  }
  return best
}

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(50)} ${detail}`)
}

const EXPECTED = [0, 250, 500, 750]

for (const workload of [
  { name: 'a source that changes every frame', stepMs: 0 },
  { name: 'a source that changes every 800ms', stepMs: 800 },
]) {
  await install({ stepMs: workload.stepMs })
  // Long enough to fill the history the furthest mirror needs.
  await wait(2500)
  const { readings, t0 } = await sample(45, 70)

  console.log(`\n${workload.name}:`)
  const solved = readings.map((reading) => solveLag(reading, t0, workload.stepMs))
  solved.forEach((result, index) => {
    const expected = EXPECTED[index]
    // A mirror shows the newest frame at or before its target, so it runs
    // between delay and delay plus one capture interval behind.
    const drift = result.lag - expected
    check(
      `delay={${expected}} measured ${Math.round(result.lag)}ms`,
      drift >= -60 && drift <= 140 && result.error < 12,
      `drift ${drift > 0 ? '+' : ''}${Math.round(drift)}ms, fit ±${result.error.toFixed(1)}px`
    )
  })

  const steps = solved
    .slice(1)
    .map((result, index) => Math.round(result.lag - solved[index].lag))
  check(
    'spacing between mirrors holds',
    steps.every((step) => Math.abs(step - 250) <= 90),
    `${steps.join('ms, ')}ms apart`
  )
}

const failed = checks.filter((row) => !row.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
console.log('problems:', problems.length ? problems : 'none')
await browser.close()
process.exit(failed.length ? 1 : 0)
