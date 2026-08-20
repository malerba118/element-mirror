import { chromium } from 'playwright'
import { decodePng } from './pixels.mjs'

/**
 * Whether a mirror paints the ink that sits just OUTSIDE its box.
 *
 * `.perf/fidelity.mjs` compares each box against its source's, which says
 * nothing about a ring or a shadow painted past the edge of one: both shots stop
 * at the box. This reads the band of page immediately outside each box instead,
 * on all four sides, and reports the darkest thing in it. A source with a ring
 * and a mirror without one differ here and nowhere else.
 *
 * Two kinds of row are not differences: a source whose content overflows its own
 * box paints into the band beside the mirror, and the mirror's copy of that
 * overflow leaves the figure altogether. `switches` and `transforms` are both
 * that — a side that reads dark on the source and dark on the mirror's opposite
 * side is the tell. Look at the pair before believing a row.
 *
 *   node .perf/edges.mjs                 every specimen, worst side first
 *   MIRROR_VERSION=1 node .perf/edges.mjs
 */

const BAND = 3
const URL = 'http://localhost:5173/gallery'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 2,
})
await page.goto(URL, { waitUntil: 'networkidle' })
await page.addStyleTag({
  content: 'nextjs-portal { display: none !important }',
})
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1500)

const boxes = await page.evaluate(() => {
  const out = []
  for (const figure of document.querySelectorAll('[data-specimen]')) {
    const source = figure.querySelector('[data-specimen-source]')
    const mirror =
      figure.querySelector('[data-element-mirror]') ??
      figure.querySelector('canvas[data-element-mirror-ignore]')
    if (!source || !mirror) continue
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return {
        x: box.x + window.scrollX,
        y: box.y + window.scrollY,
        width: box.width,
        height: box.height,
      }
    }
    out.push({
      name: figure.dataset.specimen,
      source: rect(source),
      mirror: rect(mirror),
    })
  }
  return out
})

const shot = decodePng(
  await page.screenshot({ scale: 'device', fullPage: true })
)
const RATIO = 2

/** The darkest pixel in the band just outside a box, per side. */
function edges(box) {
  const left = Math.round(box.x * RATIO)
  const top = Math.round(box.y * RATIO)
  const right = Math.round((box.x + box.width) * RATIO)
  const bottom = Math.round((box.y + box.height) * RATIO)
  const band = BAND * RATIO
  const darkest = (x0, y0, x1, y1) => {
    let found = 255
    for (let y = Math.max(0, y0); y < Math.min(shot.height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(shot.width, x1); x += 1) {
        const at = (y * shot.width + x) * shot.channels
        const value = Math.min(
          shot.pixels[at],
          shot.pixels[at + 1],
          shot.pixels[at + 2]
        )
        if (value < found) found = value
      }
    }
    return found
  }
  return {
    top: darkest(left, top - band, right, top),
    right: darkest(right, top, right + band, bottom),
    bottom: darkest(left, bottom, right, bottom + band),
    left: darkest(left - band, top, left, bottom),
  }
}

const rows = []
for (const { name, source, mirror } of boxes) {
  const a = edges(source)
  const b = edges(mirror)
  // A mirror that lost the ink outside its box reads lighter than its source.
  const missing = Math.max(
    b.top - a.top,
    b.right - a.right,
    b.bottom - a.bottom,
    b.left - a.left
  )
  rows.push({ name, source: a, mirror: b, missing })
}

rows.sort((a, b) => b.missing - a.missing)
console.log('LIGHTER\tSOURCE t,r,b,l\tMIRROR t,r,b,l\tSPECIMEN')
for (const row of rows) {
  const list = (side) => `${side.top},${side.right},${side.bottom},${side.left}`
  console.log(
    `${row.missing}`.padEnd(8),
    list(row.source).padEnd(20),
    list(row.mirror).padEnd(20),
    row.name
  )
}
const lost = rows.filter((row) => row.missing > 8).length
console.log(`\n${lost}/${rows.length} mirrors are lighter outside their box`)

await browser.close()
