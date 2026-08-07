import { chromium } from 'playwright'

import { serveModules } from './serve.mjs'

/** What the per-frame SVG is made of, byte by byte, and what decoding costs. */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/'
const SELECTOR = process.argv[2] ?? '#playground-source'

const dist = new URL('../vendor/snapdom/src/', import.meta.url).pathname

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
await page.waitForTimeout(400)

const result = await page.evaluate(
  async ({ selector }) => {
    const element = document.querySelector(selector)
    element.scrollIntoView()
    const { snapdom } = window.__lib
    const options = { dpr: 2, scale: 1, embedFonts: true }
    const snapshot = await snapdom(element, options)
    const svg = decodeURIComponent(snapshot.url.slice(snapshot.url.indexOf(',') + 1))

    const styles = [...svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
    const styleText = styles.join('\n')
    const fontFaces = [...styleText.matchAll(/@font-face\s*\{[^}]*\}/gi)]
    const fontBytes = fontFaces.reduce((sum, m) => sum + m[0].length, 0)
    const classRules = [...styleText.matchAll(/\.c\d+\s*\{[^}]*\}/g)]
    const classBytes = classRules.reduce((sum, m) => sum + m[0].length, 0)
    const families = fontFaces.map((m) => {
      const fam = m[0].match(/font-family:\s*([^;]+);/i)?.[1] ?? '?'
      const kb = Math.round(m[0].length / 1024)
      return `${fam.trim()} ${kb}kb`
    })

    // Time decode alone, repeated, on this exact URL and on a unique variant
    // per iteration (cache-defeating comment), to split cached vs fresh decode.
    const timeDecode = async (unique) => {
      const times = []
      for (let i = 0; i < 8; i++) {
        const text = unique ? svg.replace('</svg>', `<!--${i}--></svg>`) : svg
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
        const img = new Image()
        img.decoding = 'sync'
        const started = performance.now()
        img.src = url
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = 720
        canvas.height = 330
        canvas.getContext('2d').drawImage(img, 0, 0)
        times.push(performance.now() - started)
      }
      return times.slice(2).sort((a, b) => a - b)[3] ?? times.at(-1)
    }

    // Attribution: decode time for the svg with parts removed. Rendering will
    // be wrong; only the decode cost matters here.
    const stripped = {
      'no fonts': svg.replace(/@font-face\s*\{[^}]*\}/gi, ''),
      'no classes': svg.replace(/\.c\d+\s*\{[^}]*\}/g, ''),
      'no style at all': svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ''),
    }
    const attributed = {}
    for (const [name, text] of Object.entries(stripped)) {
      const times = []
      for (let i = 0; i < 8; i++) {
        const t = text.replace('</svg>', `<!--${i}--></svg>`)
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`
        const img = new Image()
        img.decoding = 'sync'
        const started = performance.now()
        img.src = url
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = 720
        canvas.height = 330
        canvas.getContext('2d').drawImage(img, 0, 0)
        times.push(performance.now() - started)
      }
      attributed[name] = {
        kb: Math.round(text.length / 1024),
        ms: times.slice(2).sort((a, b) => a - b)[3] ?? times.at(-1),
      }
    }

    return {
      attributed,
      svgBytes: svg.length,
      urlBytes: snapshot.url.length,
      styleBytes: styleText.length,
      fontBytes,
      fontCount: fontFaces.length,
      families,
      classBytes,
      classCount: classRules.length,
      markupBytes: svg.length - styleText.length,
      decodeCached: await timeDecode(false),
      decodeFresh: await timeDecode(true),
    }
  },
  { selector: SELECTOR }
)

await browser.close()

console.log(`svg ${Math.round(result.svgBytes / 1024)}kb (url ${Math.round(result.urlBytes / 1024)}kb encoded)`)
console.log(`  style ${Math.round(result.styleBytes / 1024)}kb`)
console.log(`    @font-face ×${result.fontCount}: ${Math.round(result.fontBytes / 1024)}kb`)
for (const f of result.families) console.log(`      ${f}`)
console.log(`    .cN classes ×${result.classCount}: ${Math.round(result.classBytes / 1024)}kb`)
console.log(`    other css: ${Math.round((result.styleBytes - result.fontBytes - result.classBytes) / 1024)}kb`)
console.log(`  markup ${Math.round(result.markupBytes / 1024)}kb`)
console.log(`decode+draw same url: ${result.decodeCached.toFixed(1)}ms`)
console.log(`decode+draw fresh url: ${result.decodeFresh.toFixed(1)}ms`)
for (const [name, row] of Object.entries(result.attributed)) {
  console.log(`decode+draw fresh, ${name}: ${row.ms.toFixed(1)}ms (${row.kb}kb)`)
}
// appended: dump one class rule
