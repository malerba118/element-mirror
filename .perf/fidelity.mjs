import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { compare, decodePng } from './pixels.mjs'

/**
 * Ranks the fidelity gallery by how far each mirror is from its source.
 *
 * The gallery at `/gallery` pairs a piece of interface with a capture of it.
 * Reading sixty of those pairs by eye is how a difference gets missed, so this
 * shoots each pair separately — the source element and the mirror canvas, both
 * from the same page — and counts the pixels they disagree on.
 *
 * Text never lands identically twice, so a few percent is the floor rather than
 * a finding; the rows worth reading are the ones far above it, and any row
 * whose size differs at all, since a capture that is not the size of its source
 * is drawn scaled and everything in it is then wrong by a little.
 *
 * This measures the mirrors as the component actually draws them, engine and
 * sizing and blit included, which is what `.perf/renderers.mjs` deliberately
 * does not: that one calls each renderer directly to compare the renderers.
 *
 *   node .perf/fidelity.mjs                     rank every specimen
 *   node .perf/fidelity.mjs --engine snapdom    rank them on another engine
 *   node .perf/fidelity.mjs --shot masks tabs   save those pairs as PNGs
 *
 * Needs the dev server up: `npm run dev`.
 */

const URL = process.env.GALLERY_URL ?? 'http://localhost:5173/gallery'
const SHOT_DIR = '/tmp/fidelity'
const DIFFERENT_ENOUGH = 32

const argv = process.argv.slice(2)
const shotIndex = argv.indexOf('--shot')
const wanted = shotIndex === -1 ? [] : argv.slice(shotIndex + 1)
const engineIndex = argv.indexOf('--engine')
const engine = engineIndex === -1 ? null : argv[engineIndex + 1]

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
})
await page.goto(URL, { waitUntil: 'networkidle' })

if (engine) {
  await page.click(`button[data-engine="${engine}"]`)
}

// A mirror off screen stops capturing, so nothing below the fold has a frame
// until the page has been walked past it.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1500)

const names = await page.$$eval('[data-specimen]', (figures) =>
  figures.map((figure) => figure.dataset.specimen)
)
const subjects = wanted.length > 0 ? wanted : names

if (wanted.length > 0) mkdirSync(SHOT_DIR, { recursive: true })

const results = []
for (const name of subjects) {
  const figure = page.locator(`[data-specimen="${name}"]`)
  await figure.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)

  if (wanted.length > 0) {
    const file = `${SHOT_DIR}/${name.replace(/[^a-z0-9]+/gi, '-')}.png`
    await figure.screenshot({ path: file })
    console.log(file)
    continue
  }

  try {
    const source = decodePng(
      await figure.locator('[data-specimen-source]').screenshot()
    )
    const mirror = decodePng(
      await figure.locator('canvas[data-screenshot-ignore]').screenshot()
    )
    results.push({ name, ...compare(source, mirror, DIFFERENT_ENOUGH) })
  } catch (error) {
    results.push({ name, error: String(error).split('\n')[0].slice(0, 60) })
  }
}

await browser.close()

if (wanted.length > 0) process.exit(0)

results.sort((a, b) => (b.differingPercent ?? -1) - (a.differingPercent ?? -1))
console.log(`engine: ${engine ?? 'as the page starts up'}`)
console.log(['DIFF%', 'MEAN', 'WORST', 'SIZE', 'SPECIMEN'].join('\t'))
for (const result of results) {
  if (result.error) {
    console.log(`  err\t\t\t\t${result.name} (${result.error})`)
    continue
  }
  const [dx, dy] = result.sizeDelta
  const size = Math.abs(dx) > 2 || Math.abs(dy) > 2 ? `${dx},${dy}` : '-'
  console.log(
    [
      result.differingPercent.toFixed(2),
      result.mean.toFixed(1),
      result.worst,
      size,
      result.name,
    ].join('\t')
  )
}

const scored = results.filter((result) => !result.error)
const sorted = [...scored].sort(
  (a, b) => a.differingPercent - b.differingPercent
)
console.log(
  [
    `median ${(sorted[Math.floor(sorted.length / 2)]?.differingPercent ?? 0).toFixed(2)}%`,
    `over 5%: ${scored.filter((result) => result.differingPercent > 5).length}/${scored.length}`,
    `wrong size: ${scored.filter(({ sizeDelta: [dx, dy] }) => Math.abs(dx) > 2 || Math.abs(dy) > 2).length}`,
    `failed: ${results.length - scored.length}`,
  ].join('\t')
)
