import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/** Per-capture snapshot-cache hit/miss classification on the playground card. */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'
const CAPTURES = Number(process.argv[3] ?? 80)

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

const rows = await page.evaluate(
  async ({ selector, captures }) => {
    const element = document.querySelector(selector)
    element.scrollIntoView()
    const { snapdom } = window.__lib
    const options = { dpr: 2, scale: 1, embedFonts: true, outerShadows: 'subtree', exclude: ['[data-element-mirror-ignore]'] }

    let reads = 0
    const proto = CSSStyleDeclaration.prototype
    const orig = proto.getPropertyValue
    proto.getPropertyValue = function (...args) {
      reads += 1
      return orig.apply(this, args)
    }

    const rows = []
    const interval = 1000 / 40
    for (let i = 0; i < captures; i++) {
      const stats = {}
      globalThis.__snapStats = stats
      reads = 0
      const t0 = performance.now()
      const snap = await snapdom(element, options)
      const ms = performance.now() - t0
      rows.push({ i, ms: Math.round(ms * 10) / 10, reads, ...stats })
      const rest = interval - (performance.now() - t0)
      if (rest > 0) await new Promise((r) => setTimeout(r, rest))
    }
    proto.getPropertyValue = orig
    globalThis.__snapStats = undefined
    return rows
  },
  { selector: SELECTOR, captures: CAPTURES }
)

const fmt = (r) =>
  `#${String(r.i).padStart(3)} ms=${String(r.ms).padStart(5)} reads=${String(r.reads).padStart(6)} ` +
  `hit=${r.hit || 0} cold=${r.cold || 0} epoch=${r.epoch || 0} stamp=${r.stamp || 0} age=${r.age || 0} opts=${r.options || 0} bumps=${r.bumps || 0}`

for (const r of rows.slice(0, 5)) console.log(fmt(r))
console.log('...')
for (const r of rows.slice(-10)) console.log(fmt(r))

const warm = rows.slice(10)
const sum = (k) => warm.reduce((a, r) => a + (r[k] || 0), 0)
console.log(
  `\nwarm totals over ${warm.length} captures: reads/capture=${Math.round(sum('reads') / warm.length)} ` +
  `hit=${sum('hit')} cold=${sum('cold')} epoch=${sum('epoch')} stamp=${sum('stamp')} age=${sum('age')} opts=${sum('options')} bumps=${sum('bumps')}`
)
await browser.close()
