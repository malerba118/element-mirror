import { firefox } from 'playwright'

import { serveModules } from './serve.mjs'

/**
 * What the snapdom clone actually says for the glass-floor heading in
 * Firefox: captures the card, decodes the serialized SVG, and prints the
 * heading's inline style — the ground truth for whether the
 * background-clip:text fallback ran and what survived after it.
 *
 *   node .perf/bgclip-clone.mjs
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/glass-floor'
const dist = new URL('../packages/snapdom/src/', import.meta.url).pathname

const browser = await firefox.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
})
await serveModules(page, '/__snapdom/', dist)
await page.goto(PAGE, { waitUntil: 'load' })
await page.waitForSelector('h2', { timeout: 20000 })
await page.addScriptTag({
  type: 'module',
  content: `
    import { snapdom } from '/__snapdom/index.js'
    window.__lib = { snapdom }
  `,
})
await page.waitForFunction(() => Boolean(window.__lib))

const result = await page.evaluate(async () => {
  // Log every write of color/background-image onto any style declaration,
  // with the caller, so the inline overrides name their author.
  const writes = []
  const proto = Object.getPrototypeOf(document.createElement('div').style)
  const log = (prop, value) => {
    const stack = (new Error().stack || '')
      .split('\n')
      .slice(2, 5)
      .map((line) => line.trim().replace(/^.*\/__snapdom\//, ''))
      .join(' <- ')
    writes.push(`${prop} = ${value} @ ${stack}`)
  }
  const origSet = proto.setProperty
  proto.setProperty = function (prop, value, priority) {
    if (prop === 'color' || prop === 'background-image') log(prop, value)
    return origSet.call(this, prop, value, priority)
  }
  for (const key of ['color', 'backgroundImage']) {
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (desc?.set) {
      Object.defineProperty(proto, key, {
        get() {
          return desc.get.call(this)
        },
        set(value) {
          log(key, value)
          desc.set.call(this, value)
        },
      })
    }
  }

  const card = document
    .querySelector('h2')
    .closest('div[class*="backdrop-blur"]')
  const { snapdom } = window.__lib
  const captured = await snapdom(card, { dpr: 2 })
  const url = captured.url ?? captured.toRaw?.() ?? null
  if (!url) return { error: 'no url on result', keys: Object.keys(captured) }
  const svg = decodeURIComponent(url.replace(/^data:image\/svg\+xml[^,]*,/, ''))
  const match = svg.match(/<h2[^>]*>/)
  const h2Tag = match ? match[0] : ''
  // The generated class the heading carries, and that class's rule.
  const classes = (h2Tag.match(/class="([^"]*)"/) || [])[1] || ''
  const generated = classes.split(/\s+/).filter((c) => /^c\d+$/.test(c))
  const rules = {}
  for (const c of generated) {
    const rule = svg.match(new RegExp(`\\.${c}\\{[^}]*\\}`))
    rules[c] = rule ? rule[0] : '(not found)'
  }
  return {
    h2Tag: h2Tag || '(h2 tag not found)',
    rules,
    hasClipText:
      svg.includes('background-clip: text') || svg.includes('background-clip:text'),
    writes: writes.filter(
      (w) => w.includes('gradient') || w.includes('rgba(0, 0, 0, 0)'),
    ),
  }
})
console.log(JSON.stringify(result, null, 2))
await browser.close()
