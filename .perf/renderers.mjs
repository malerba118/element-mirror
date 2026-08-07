import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compare, decodePng } from './pixels.mjs'

/**
 * Runs three DOM-to-canvas renderers over the same gallery and scores each
 * against the real thing.
 *
 * Every specimen at `/gallery` is captured three times inside the one page —
 * by the vendored fork, by SnapDOM and by modern-screenshot — and each capture
 * is composited onto the specimen's own background and compared against a
 * screenshot of the element taken by the browser. Same element, same moment,
 * same yardstick, so the columns can be read against each other.
 *
 * The two outside renderers work by cloning the subtree into an SVG
 * `foreignObject` and letting the browser paint it, so they answer a different
 * question from the fork, which walks the DOM and paints to a canvas itself.
 * Where they win it is because the browser did the work; where they lose it is
 * on the things a clone cannot carry.
 *
 *   node .perf/renderers.mjs               score every specimen
 *   node .perf/renderers.mjs --shot masks  write each renderer's PNG out
 *
 * Needs the dev server up (`npm run dev`) and the fork built
 * (`npm run screenshot:build`).
 */

const URL = process.env.GALLERY_URL ?? 'http://localhost:5173/gallery'
const SHOT_DIR = '/tmp/renderers'
const DIFFERENT_ENOUGH = 32
const SCALE = 2

const BUNDLES = {
  fork: {
    dir: new global.URL('../vendor/screenshot/dist/', import.meta.url).pathname,
    entry: 'index.js',
  },
  snapdom: {
    dir: new global.URL(
      '../node_modules/@zumer/snapdom/dist/',
      import.meta.url
    ).pathname,
    entry: 'snapdom.mjs',
  },
  modern: {
    dir: new global.URL(
      '../node_modules/modern-screenshot/dist/',
      import.meta.url
    ).pathname,
    entry: 'index.mjs',
  },
}
const RENDERERS = Object.keys(BUNDLES)

const argv = process.argv.slice(2)
const shotIndex = argv.indexOf('--shot')
const wanted = shotIndex === -1 ? [] : argv.slice(shotIndex + 1)

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: SCALE,
})

// The bundles are served to the page rather than inlined so that whatever they
// import of their own siblings resolves.
await page.route('**/__renderer/**', (route) => {
  const path = new global.URL(route.request().url()).pathname
  const [, , name, ...rest] = path.split('/')
  const bundle = BUNDLES[name]
  if (!bundle) return route.abort()
  try {
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: readFileSync(bundle.dir + rest.join('/')),
    })
  } catch {
    route.abort()
  }
})

await page.goto(URL, { waitUntil: 'networkidle' })

await page.addScriptTag({
  type: 'module',
  content: `
    import { screenshot } from '/__renderer/fork/${BUNDLES.fork.entry}'
    import { snapdom } from '/__renderer/snapdom/${BUNDLES.snapdom.entry}'
    import { domToCanvas } from '/__renderer/modern/${BUNDLES.modern.entry}'
    window.__renderers = {
      fork: (element, scale) =>
        screenshot.canvas(element, { scale, backgroundColor: null }),
      // SnapDOM is the odd one out: it works in device pixels already, so
      // asking for a scale on top of that squares it.
      snapdom: (element, scale) =>
        snapdom.toCanvas(element, { dpr: scale, scale: 1 }),
      modern: (element, scale) => domToCanvas(element, { scale }),
    }
  `,
})
await page.waitForFunction(() => Boolean(window.__renderers))

// Every specimen is captured on demand here, so the gallery's own mirrors are
// only competing for the CPU. Slowing them right down keeps the timings honest.
await page.evaluate(() => {
  const slowest = document.querySelector('button[data-fps="1"]')
  if (slowest instanceof HTMLElement) slowest.click()
})

// A mirror off screen stops capturing, so the page is walked once to let every
// specimen settle before anything is measured.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1000)

const capture = async (name, renderer) =>
  page.evaluate(
    async ({ name, renderer, scale }) => {
      const source = document
        .querySelector(`[data-specimen="${name}"]`)
        .querySelector('[data-specimen-source]')
      const rect = source.getBoundingClientRect()

      const started = performance.now()
      const produced = await window.__renderers[renderer](source, scale)
      const elapsed = performance.now() - started

      // Captures come back transparent, and a screenshot of the element comes
      // back over the card it sits on. Laying one on the other is what makes
      // the two comparable.
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(rect.width * scale)
      canvas.height = Math.round(rect.height * scale)
      const context = canvas.getContext('2d')
      context.fillStyle = getComputedStyle(
        source.closest('[data-specimen]')
      ).backgroundColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(produced, 0, 0)

      return {
        dataUrl: canvas.toDataURL('image/png'),
        elapsed,
        produced: [produced.width, produced.height],
        expected: [canvas.width, canvas.height],
      }
    },
    { name, renderer, scale: SCALE }
  )

const names = await page.$$eval('[data-specimen]', (figures) =>
  figures.map((figure) => figure.dataset.specimen)
)
const subjects = wanted.length > 0 ? wanted : names
if (wanted.length > 0) mkdirSync(SHOT_DIR, { recursive: true })

const results = []
for (const name of subjects) {
  const figure = page.locator(`[data-specimen="${name}"]`)
  await figure.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)

  const stem = `${SHOT_DIR}/${name.replace(/[^a-z0-9]+/gi, '-')}`
  const shot = await figure.locator('[data-specimen-source]').screenshot()
  if (wanted.length > 0) writeFileSync(`${stem}-source.png`, shot)
  const source = decodePng(shot)

  const row = { name, renderers: {} }
  for (const renderer of RENDERERS) {
    try {
      const { dataUrl, elapsed, produced, expected } = await capture(
        name,
        renderer
      )
      const png = Buffer.from(dataUrl.split(',')[1], 'base64')
      if (wanted.length > 0) writeFileSync(`${stem}-${renderer}.png`, png)
      row.renderers[renderer] = {
        ...compare(source, decodePng(png), DIFFERENT_ENOUGH),
        elapsed,
        overflow: [produced[0] - expected[0], produced[1] - expected[1]],
      }
    } catch (error) {
      row.renderers[renderer] = { error: String(error).split('\n')[0] }
    }
  }
  results.push(row)
}

await browser.close()

if (wanted.length > 0) {
  console.log(SHOT_DIR)
  process.exit(0)
}

const cell = (result) => {
  if (!result) return '   -  '
  if (result.error) return '  err '
  const overflow =
    Math.abs(result.overflow[0]) > 2 || Math.abs(result.overflow[1]) > 2
      ? '*'
      : ' '
  return `${result.differingPercent.toFixed(1).padStart(5)}${overflow}`
}

results.sort(
  (a, b) =>
    (b.renderers.fork?.differingPercent ?? -1) -
    (a.renderers.fork?.differingPercent ?? -1)
)

console.log('diff%, lower is better. * means the capture was not the box size')
console.log(['  FORK', ' SNAPD', ' MODRN', 'SPECIMEN'].join('\t'))
for (const row of results) {
  console.log(
    [
      ...RENDERERS.map((renderer) => cell(row.renderers[renderer])),
      row.name,
    ].join('\t')
  )
}

const summarise = (renderer) => {
  const scored = results
    .map((row) => row.renderers[renderer])
    .filter((result) => result && !result.error)
  const failed = results.length - scored.length
  const sorted = [...scored].sort(
    (a, b) => a.differingPercent - b.differingPercent
  )
  const median = sorted[Math.floor(sorted.length / 2)]?.differingPercent ?? 0
  const bad = scored.filter((result) => result.differingPercent > 5).length
  const slow = scored.reduce((total, result) => total + result.elapsed, 0)
  return [
    renderer.padEnd(8),
    `median ${median.toFixed(2)}%`,
    `over 5%: ${bad}/${scored.length}`,
    `threw: ${failed}`,
    `${(slow / Math.max(1, scored.length)).toFixed(1)}ms each`,
  ].join('\t')
}

console.log('')
for (const renderer of RENDERERS) console.log(summarise(renderer))
