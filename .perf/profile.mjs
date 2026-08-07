import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * Where the main thread goes while a source is captured over and over.
 *
 * `.perf/snapdom.mjs` says what a capture costs and which half it is spent in;
 * this says which functions, and how much of it is not JavaScript at all —
 * style recalc, layout and rasterization are charged to `(program)`, so a change
 * that trades reads for browser work shows up here and nowhere else.
 *
 *   node .perf/profile.mjs '#playground-source' 40
 *
 * Needs the dev server up (`npm run dev`).
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'
const TARGET = Number(process.argv[3] ?? 40)
const SECONDS = 2
const SCALE = 2

const dist = new URL('../vendor/snapdom/src/', import.meta.url).pathname

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: SCALE,
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
  for (const canvas of document.querySelectorAll(
    'canvas[data-screenshot-ignore]'
  )) {
    canvas.remove()
  }
})
await page.waitForTimeout(300)

const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Performance.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 100 })

const drive = async (options) => {
  await page.evaluate(
    async ({ selector, options, target, seconds }) => {
      const element = document.querySelector(selector)
      element.scrollIntoView()
      await window.__lib.snapdom.toCanvas(element, options)
      const interval = 1000 / target
      const until = performance.now() + seconds * 1000
      let due = performance.now()
      while (performance.now() < until) {
        const now = performance.now()
        if (now < due) {
          await new Promise((resolve) => setTimeout(resolve, due - now))
        } else {
          due = now
        }
        await window.__lib.snapdom.toCanvas(element, options)
        due += interval
      }
    },
    { selector: SELECTOR, options, target: TARGET, seconds: SECONDS }
  )
}

/** Self time per function, from the sample counts on each node. */
const selfTimes = (profile) => {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const total = new Map()
  const samples = profile.samples ?? []
  const deltas = profile.timeDeltas ?? []

  for (let index = 0; index < samples.length; index++) {
    const node = byId.get(samples[index])
    if (!node) continue
    const { functionName, url, lineNumber } = node.callFrame
    const where = url.includes('__snapdom')
      ? url.split('__snapdom/')[1]
      : url
        ? url.replace(/^https?:\/\/[^/]+/, '').slice(0, 40)
        : ''
    const name = functionName || '(anonymous)'
    const key = where ? `${name} — ${where}:${lineNumber + 1}` : name
    const micros = Math.max(0, deltas[index] ?? 0)
    total.set(key, (total.get(key) ?? 0) + micros / 1000)
  }

  return [...total].sort((a, b) => b[1] - a[1])
}

/**
 * Chrome's own counters, which is where the work `(program)` stands for can be
 * named: how many style recalculations and layouts happened, and how long they
 * took. A change that reads less but recalculates more is only visible here.
 */
const counters = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map(({ name, value }) => [name, value]))
}

const measure = async (label, options) => {
  const before = await counters()
  await cdp.send('Profiler.start')
  await drive(options)
  const { profile } = await cdp.send('Profiler.stop')
  const after = await counters()
  const rows = selfTimes(profile)
  const total = rows.reduce((sum, [, ms]) => sum + ms, 0)

  const delta = (name, scale = 1) =>
    ((after[name] ?? 0) - (before[name] ?? 0)) * scale
  const chrome = {
    'style recalcs': delta('RecalcStyleCount'),
    'style recalc ms': delta('RecalcStyleDuration', 1000),
    layouts: delta('LayoutCount'),
    'layout ms': delta('LayoutDuration', 1000),
    'script ms': delta('ScriptDuration', 1000),
    'task ms': delta('TaskDuration', 1000),
  }

  return { label, rows, total, chrome }
}

const base = { dpr: SCALE, scale: 1, embedFonts: true }
const runs = [await measure('as the mirror captures', base)]

await browser.close()

for (const { label, rows, total, chrome } of runs) {
  console.log(
    `\n${label}: ${total.toFixed(0)}ms of samples over ${SECONDS}s at ${TARGET}fps`
  )
  console.log(
    Object.entries(chrome)
      .map(([name, value]) => `${name} ${value.toFixed(0)}`)
      .join(', ')
  )
  console.log(['ms', 'share', 'function'].join('\t'))
  for (const [name, ms] of rows.slice(0, 12)) {
    console.log(
      [
        ms.toFixed(0).padStart(4),
        `${((ms / total) * 100).toFixed(0)}%`.padStart(5),
        name,
      ].join('\t')
    )
  }
}
