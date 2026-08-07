import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * What frame rate a source can actually be mirrored at, and why not higher.
 *
 * A mirror's rate is not set by the fps it was asked for but by two things
 * multiplied: what one capture costs, and the share of wall-clock the loop will
 * spend capturing (`CAPTURE_DUTY_CYCLE` in `src/lib/mirror-capture.ts`, 35%).
 * Twelve milliseconds a capture at 35% is twenty-nine frames a second, whatever
 * the prop says, and the rest are dropped. This prices each candidate engine
 * and prints the rate each one implies.
 *
 * Two numbers per config rather than one, because a capture costs what the page
 * did since the last one: back to back, styles are still valid and a capture is
 * a few milliseconds, while one taken after the source has moved pays for the
 * style read again. A live source only ever gives you the second kind, so
 * `spaced` is the number that decides anything.
 *
 * `fresh` counts how many distinct frames came out of the captures, which is
 * how a config that quietly hands back a cached one is caught.
 *
 *   node .perf/ceiling.mjs
 *   node .perf/ceiling.mjs '#delay-source'
 *
 * Needs the dev server up (`npm run dev`) and the fork built
 * (`npm run screenshot:build`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#delay-source'
const DUTY = 0.35
const SCALE = 2

/** Rates to drive the candidates at, to see which of them a source can hold. */
const TARGETS = [24, 40, 60]
const TARGET_CONFIGS = ['snapdom', 'modern context', 'fork']

const dirs = {
  fork: new URL('../vendor/screenshot/dist/', import.meta.url).pathname,
  // Source rather than a bundle, so this measures the fork the app runs.
  snapdom: new URL('../vendor/snapdom/src/', import.meta.url).pathname,
  modern: new URL('../node_modules/modern-screenshot/dist/', import.meta.url)
    .pathname,
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: SCALE,
})
await serveModules(page, '/__renderer/', (engine) => dirs[engine])
await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.addScriptTag({
  type: 'module',
  content: `
    import { screenshot } from '/__renderer/fork/index.js'
    import { snapdom } from '/__renderer/snapdom/index.js'
    import { domToCanvas, createContext } from '/__renderer/modern/index.mjs'
    window.__lib = { screenshot, snapdom, domToCanvas, createContext }
  `,
})
await page.waitForFunction(() => Boolean(window.__lib))

// The page's own mirrors are measured elsewhere; here they would only compete
// for the thread the candidate is being timed on.
await page.evaluate(() => {
  for (const canvas of document.querySelectorAll(
    'canvas[data-screenshot-ignore]'
  )) {
    canvas.remove()
  }
})
await page.waitForTimeout(400)

const measured = await page.evaluate(
  async ({ selector, scale, TARGETS, TARGET_CONFIGS }) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`nothing matches ${selector}`)
    element.scrollIntoView()

    const { screenshot, snapdom, domToCanvas, createContext } = window.__lib
    const own = document.createElement('canvas')
    let context = null

    const configs = {
      fork: () =>
        screenshot.canvas(element, {
          canvas: own,
          scale,
          backgroundColor: null,
        }),
      snapdom: () =>
        snapdom.toCanvas(element, { dpr: scale, scale: 1, embedFonts: true }),
      'snapdom no fonts': () =>
        snapdom.toCanvas(element, { dpr: scale, scale: 1 }),
      modern: () => domToCanvas(element, { scale }),
      'modern context': async () => {
        context ??= await createContext(element, { scale, autoDestruct: false })
        return domToCanvas(context)
      },
    }

    // A cheap signature of a frame, to tell a fresh capture from a cached one.
    const signature = (canvas) => {
      const { data } = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, Math.min(canvas.height, 40))
      let sum = 0
      for (let index = 0; index < data.length; index += 41) {
        sum = (sum + data[index] * (index % 251)) % 2147483647
      }
      return sum
    }

    const median = (times) => {
      const sorted = [...times].slice(2).sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length / 2)] ?? 0
    }

    const time = async (run, gap) => {
      const times = []
      const frames = new Set()
      for (let index = 0; index < 12; index++) {
        const started = performance.now()
        const produced = await run()
        times.push(performance.now() - started)
        frames.add(signature(produced))
        if (gap) await new Promise((resolve) => setTimeout(resolve, gap))
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      return { median: median(times), fresh: frames.size, of: times.length }
    }

    /**
     * Drives a config at a fixed rate, the way a mirror is driven, and reports
     * what it managed. `painted` is how many times the page itself got to paint
     * a second: a capture holds the main thread, so this is what the cost is
     * being paid out of.
     */
    const drive = async (run, fps, seconds) => {
      const interval = 1000 / fps
      const until = performance.now() + seconds * 1000
      let due = performance.now()
      let captures = 0
      let cost = 0
      let behind = 0
      let painted = 0
      let counting = true
      const count = () => {
        if (!counting) return
        painted += 1
        requestAnimationFrame(count)
      }
      requestAnimationFrame(count)

      while (performance.now() < until) {
        const now = performance.now()
        if (now < due) {
          await new Promise((resolve) => setTimeout(resolve, due - now))
        } else if (now > due + interval) {
          // A frame that came due while the last capture was still running is
          // given up rather than run late, which is what the loop itself does.
          behind += Math.floor((now - due) / interval)
          due = now
        }
        const started = performance.now()
        await run()
        cost += performance.now() - started
        captures += 1
        due += interval
      }
      counting = false

      return {
        asked: fps,
        achieved: captures / seconds,
        mean: cost / Math.max(1, captures),
        share: cost / (seconds * 1000),
        dropped: behind / seconds,
        painted: painted / seconds,
      }
    }

    const rows = []
    for (const [name, run] of Object.entries(configs)) {
      try {
        await run()
        const back = await time(run, 0)
        const spaced = await time(run, 60)
        rows.push({ name, back: back.median, ...spaced })
      } catch (error) {
        rows.push({ name, failed: String(error.message ?? error).slice(0, 60) })
      }
    }

    const cadences = []
    for (const name of TARGET_CONFIGS) {
      if (!configs[name]) continue
      for (const fps of TARGETS) {
        cadences.push({ name, ...(await drive(configs[name], fps, 3)) })
      }
    }

    return { nodes: element.querySelectorAll('*').length + 1, rows, cadences }
  },
  { selector: SELECTOR, scale: SCALE, TARGETS, TARGET_CONFIGS }
)

await browser.close()

console.log(`${SELECTOR} on ${PAGE}, ${measured.nodes} nodes at ${SCALE}x`)
console.log(
  ['back', 'spaced', `fps@${DUTY * 100}%`, 'fps@100%', 'fresh', 'config'].join(
    '\t'
  )
)
for (const row of measured.rows) {
  if (row.failed) {
    console.log(
      `   -\t     -\t      -\t       -\t    -\t${row.name} (${row.failed})`
    )
    continue
  }
  const cost = Math.max(0.01, row.median)
  console.log(
    [
      row.back.toFixed(1).padStart(5),
      cost.toFixed(1).padStart(6),
      ((DUTY * 1000) / cost).toFixed(1).padStart(6),
      (1000 / cost).toFixed(0).padStart(8),
      `${row.fresh}/${row.of}`.padStart(5),
      row.name,
    ].join('\t')
  )
}

console.log('\ndriven at a fixed rate for 3s, nothing else capturing')
console.log(
  ['asked', 'got', 'ms', 'thread', 'dropped', 'page fps', 'config'].join('\t')
)
for (const row of measured.cadences) {
  console.log(
    [
      String(row.asked).padStart(5),
      row.achieved.toFixed(1).padStart(4),
      row.mean.toFixed(1).padStart(5),
      `${(row.share * 100).toFixed(0)}%`.padStart(6),
      row.dropped.toFixed(1).padStart(7),
      row.painted.toFixed(0).padStart(8),
      row.name,
    ].join('\t')
  )
}
