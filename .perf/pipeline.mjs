import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * The mirror's pipelined pattern in isolation: serialize every 1/60s on the
 * main thread, let each frame's rasterization land whenever it lands, and
 * count frames that completed within their own frame slot vs late.
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'

const dist = new URL('../packages/snapdom/src/', import.meta.url).pathname
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
})
await serveModules(page, '/__snapdom/', dist)
await page.goto(PAGE, { waitUntil: 'networkidle' })
await page.addScriptTag({
  type: 'module',
  content: `
    import { snapdom } from '/__snapdom/index.js'
    window.__lib = { snapdom }
  `,
})
await page.waitForFunction(() => Boolean(window.__lib))
await page.evaluate(() => {
  for (const c of document.querySelectorAll('canvas[data-element-mirror-ignore]')) c.remove()
})
await page.waitForTimeout(400)

const result = await page.evaluate(
  async ({ selector }) => {
    const element = document.querySelector(selector)
    element.scrollIntoView()
    const { snapdom } = window.__lib
    const options = { dpr: 2, scale: 1, embedFonts: true }
    await snapdom.toCanvas(element, options) // warm

    const SECONDS = 4
    const interval = 1000 / 60
    const until = performance.now() + SECONDS * 1000
    let due = performance.now()
    let captures = 0
    let landed = 0
    let lateLandings = 0
    let serializeMs = 0
    let decodeMs = 0
    const pending = []
    const canvases = Array.from({ length: 4 }, () => document.createElement('canvas'))
    let next = 0

    while (performance.now() < until) {
      const now = performance.now()
      if (now < due) {
        await new Promise((resolve) => setTimeout(resolve, due - now))
      } else if (now > due + interval) {
        due = now
      }
      const started = performance.now()
      const snapshot = await snapdom(element, options)
      serializeMs += performance.now() - started
      captures += 1
      const canvas = canvases[next++ % canvases.length]
      const startedDecode = performance.now()
      const deadline = startedDecode + interval
      pending.push(
        snapshot.toCanvas({ canvas }).then(() => {
          landed += 1
          decodeMs += performance.now() - startedDecode
          if (performance.now() > deadline) lateLandings += 1
        })
      )
      due += interval
    }
    await Promise.all(pending)

    return {
      capturesPerSecond: captures / SECONDS,
      landedPerSecond: landed / SECONDS,
      serialize: serializeMs / captures,
      decode: decodeMs / captures,
      latePercent: (lateLandings / landed) * 100,
    }
  },
  { selector: SELECTOR }
)

await browser.close()

console.log(`captures/s ${result.capturesPerSecond.toFixed(1)}   landed/s ${result.landedPerSecond.toFixed(1)}`)
console.log(`serialize ${result.serialize.toFixed(1)}ms   decode wall ${result.decode.toFixed(1)}ms   late ${result.latePercent.toFixed(0)}%`)
