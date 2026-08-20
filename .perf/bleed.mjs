import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { compare, decodePng } from './pixels.mjs'

/**
 * Asks whether ElementMirror2 can lay out at its source's layout box while
 * painting the source's transform, against /bleed-test, which exists for this
 * script.
 *
 * Three questions, in the order they matter:
 *
 * - DIFF%: does the mirror land on the source's pixels? Each case is shot twice
 *   from the same page, source frame and mirror frame, and the two are compared.
 *   Text is not involved, so unlike the gallery's specimens these should agree
 *   almost exactly; a placement error of even a pixel shows up here.
 * - PAINTED: does the canvas actually paint outside the box it lays out in? The
 *   whole premise fails silently if something clips it.
 * - FLOW: does the wrapper hold still while the source turns? Measured as the
 *   travel of the marker sitting next to it over a few seconds, against the same
 *   marker beside the real source.
 *
 *   node .perf/bleed.mjs                  measure every case
 *   node .perf/bleed.mjs --shot rotate    save that pair as PNGs
 *
 * Needs the dev server up: `pnpm dev`.
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/bleed-test'
const SHOT_DIR = '/tmp/bleed'
const DIFFERENT_ENOUGH = 32

/** The bounding box of everything that is not the page's white, in one shot. */
function inkBox(image) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * image.channels
      if (
        image.pixels[index] > 240 &&
        image.pixels[index + 1] > 240 &&
        image.pixels[index + 2] > 240
      ) {
        continue
      }
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return 'blank'
  return `${maxX - minX + 1}x${maxY - minY + 1}@${minX},${minY}`
}

const argv = process.argv.slice(2)
const shotIndex = argv.indexOf('--shot')
const wanted = shotIndex === -1 ? [] : argv.slice(shotIndex + 1)

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 900, height: 1400 },
  deviceScaleFactor: 2,
})
await page.goto(PAGE, { waitUntil: 'networkidle' })

// The dev overlay is fixed to the corner of the viewport, so it lands on top of
// whichever frame happens to be there — and an element screenshot includes
// whatever paints over the element, which reads as a difference between a
// source and its mirror.
await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' })

// Mirrors below the fold have not captured yet.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  window.scrollTo(0, 0)
})

/**
 * Waited for rather than slept through. Each mirror here is its own source, and
 * the loop spaces captures by what they cost, so the last of a pageful lands
 * well after the first — and a mirror with no frame yet differs from its source
 * by exactly the ink it has not drawn, which reads as a placement error.
 */
const ready = await page.evaluate(async () => {
  const canvases = Array.from(
    document.querySelectorAll('[data-mirror] canvas')
  )
  const inked = (canvas) => {
    if (!canvas.width) return false
    const { data } = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 3; index < data.length; index += 40) {
      if (data[index] > 16) return true
    }
    return false
  }

  const started = performance.now()
  while (performance.now() - started < 15000) {
    if (canvases.every(inked)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return {
    waitedMs: Math.round(performance.now() - started),
    painted: canvases.filter(inked).length,
    total: canvases.length,
  }
})
console.log(
  `first frames: ${ready.painted}/${ready.total} mirrors after ${ready.waitedMs}ms`
)
console.log()

const names = await page.$$eval('[data-case]', (rows) =>
  rows.map((row) => row.dataset.case)
)
const subjects = wanted.length > 0 ? wanted : names

if (wanted.length > 0) mkdirSync(SHOT_DIR, { recursive: true })

const results = []
for (const name of subjects) {
  const row = page.locator(`[data-case="${name}"]`)
  await row.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)

  const source = row.locator('[data-frame="source"]')
  const mirror = row.locator('[data-frame="mirror"]')

  if (wanted.length > 0) {
    await source.screenshot({ path: `${SHOT_DIR}/${name}-source.png` })
    await mirror.screenshot({ path: `${SHOT_DIR}/${name}-mirror.png` })
    console.log(`${SHOT_DIR}/${name}-{source,mirror}.png`)
    continue
  }

  // Shot back to back, so a moving case is compared against a near-neighbour in
  // time rather than across a scroll.
  const before = decodePng(await source.screenshot())
  const after = decodePng(await mirror.screenshot())

  const painted = await row.locator('[data-mirror]').evaluate((wrapper, id) => {
    const canvas = wrapper.querySelector('canvas')
    const box = wrapper.getBoundingClientRect()
    const paint = canvas.getBoundingClientRect()

    // Whether the drawing ran out of canvas. A bleed too small for how far the
    // source travels clips the overflow the canvas exists to carry, and looks
    // from the outside exactly like a frame placed wrong.
    let outgrown = false
    if (canvas.width) {
      const { data } = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height)
      const edge = (x, y) => data[(y * canvas.width + x) * 4 + 3] > 16
      for (let x = 0; x < canvas.width && !outgrown; x += 1) {
        if (edge(x, 0) || edge(x, canvas.height - 1)) outgrown = true
      }
      for (let y = 0; y < canvas.height && !outgrown; y += 1) {
        if (edge(0, y) || edge(canvas.width - 1, y)) outgrown = true
      }
    }

    return {
      // An untransformed source paints its layout box and nothing else, so it
      // is held to a different standard below: no reach to find, and ink at the
      // canvas edge because the box is the ink.
      transformed:
        getComputedStyle(document.querySelector(id)).transform !== 'none',
      layout: [Math.round(box.width), Math.round(box.height)],
      paint: [Math.round(paint.width), Math.round(paint.height)],
      reach: [
        Math.round(box.left - paint.left),
        Math.round(box.top - paint.top),
      ],
      outgrown,
    }
  }, `#bleed-${name}`)

  /**
   * A moving source is compared twice. Live, the mirror is showing a capture of
   * a moment older than the shot beside it, so a difference there is the loop's
   * latency and says nothing about placement. Frozen mid-animation, with time
   * for a capture at the transform it stopped on, any difference left is
   * geometry — which is the question this script is asking.
   */
  const animated = await page
    .locator(`#bleed-${name}`)
    .evaluate((element) => element.getAnimations().length > 0)

  let frozen = null
  if (animated) {
    // The declaration goes, not just the animation object: cancelling a
    // CSSAnimation leaves the `animation` property that owns it, and the style
    // engine is free to build a fresh one — from its first keyframe — at the
    // next recalc, which the very next line provokes. Writing the matrix it
    // stopped on also mutates the source, which marks it dirty, so the mirror
    // re-captures at once rather than waiting for the loop's verification pass.
    const held = await page.locator(`#bleed-${name}`).evaluate((element) => {
      const matrix = getComputedStyle(element).transform
      element.style.animation = 'none'
      element.style.transform = matrix
      return matrix
    })
    // Waited on the canvas rather than on the clock: eight sources at 2x share
    // one duty-cycled loop, so how long a fresh capture takes to land is a
    // property of the page, not a number worth hard-coding.
    await page.locator(`[data-case="${name}"] canvas`).evaluate(async (canvas) => {
      const read = () => canvas.toDataURL()
      let last = read()
      let stableFor = 0
      const started = performance.now()
      while (performance.now() - started < 4000 && stableFor < 3) {
        await new Promise((resolve) => setTimeout(resolve, 120))
        const now = read()
        stableFor = now === last ? stableFor + 1 : 0
        last = now
      }
    })
    frozen = {
      ...compare(
        decodePng(await source.screenshot()),
        decodePng(await mirror.screenshot()),
        DIFFERENT_ENOUGH
      ),
      held,
    }
  }

  results.push({
    name,
    ...compare(before, after, DIFFERENT_ENOUGH),
    frozen,
    painted,
    // Where the ink sits in each shot, so a difference says where it went
    // rather than only how much of it there is.
    ink: [inkBox(before), inkBox(after)],
  })
}

// Layout stability: how far the markers beside each row travel while the source
// inside it turns. The source's own row is the control — its marker cannot move
// either, since a transform never disturbs layout.
const flow = await page.evaluate(async () => {
  const track = (role) => {
    const row = document.querySelector(`[data-flow="${role}"]`)
    const marker = row.querySelectorAll('[data-marker]')[1]
    return () => marker.getBoundingClientRect().left
  }
  const source = track('source')
  const mirror = track('mirror')
  const first = { source: source(), mirror: mirror() }
  const travel = { source: 0, mirror: 0 }

  const deadline = performance.now() + 2500
  while (performance.now() < deadline) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    travel.source = Math.max(travel.source, Math.abs(source() - first.source))
    travel.mirror = Math.max(travel.mirror, Math.abs(mirror() - first.mirror))
  }
  return travel
})

/**
 * Whether the capture loop is still running once the run is over.
 *
 * A mirror holds its last frame, so a loop that stopped halfway looks like a
 * page of correct still mirrors and a fast case that mysteriously will not
 * catch up. Recolouring a settled source and watching for the change tells the
 * two apart.
 */
const alive = await page.evaluate(async () => {
  const source = document.querySelector('#bleed-still')
  const canvas = document.querySelector('[data-case="still"] canvas')
  const read = () => canvas.toDataURL()
  const before = read()
  source.style.background = '#16a34a'

  const started = performance.now()
  while (performance.now() - started < 2500) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (read() !== before) {
      return { updated: true, afterMs: Math.round(performance.now() - started) }
    }
  }
  return { updated: false, afterMs: null }
})

await browser.close()

if (wanted.length > 0) process.exit(0)

console.log(
  [
    'CASE'.padEnd(10),
    'DIFF%',
    'FROZEN%',
    'MEAN',
    'WORST',
    'LAYOUT',
    'PAINTED',
    'REACH',
    'OUTGROWN',
    'SOURCE INK'.padEnd(18),
    'MIRROR INK',
  ].join('\t')
)
for (const result of results) {
  console.log(
    [
      result.name.padEnd(10),
      result.differingPercent.toFixed(2),
      result.frozen ? result.frozen.differingPercent.toFixed(2) : '-',
      result.mean.toFixed(1),
      result.worst,
      result.painted.layout.join('x'),
      result.painted.paint.join('x'),
      result.painted.reach.join(','),
      result.painted.outgrown ? 'yes' : 'no',
      result.ink[0].padEnd(18),
      result.ink[1],
    ].join('\t')
  )
}

console.log()
console.log(
  `marker travel while the source turns: beside the source ${flow.source.toFixed(
    1
  )}px, beside the mirror ${flow.mirror.toFixed(1)}px`
)
console.log(
  alive.updated
    ? `capture loop still running at the end of the run: a recoloured source reached its mirror in ${alive.afterMs}ms`
    : 'capture loop had stopped by the end of the run: a recoloured source never reached its mirror'
)

console.log()
const failures = []
for (const result of results) {
  // No text is involved, so the two frames should agree almost exactly. A
  // placement error shows up as two edges of difference around every shape.
  // A moving source is judged on its frozen shot: live, the difference is the
  // capture latency, which is what a motion blur is built out of.
  const judged = result.frozen ?? result
  if (judged.differingPercent > 2) {
    failures.push(
      `${result.name}: ${judged.differingPercent.toFixed(2)}% of pixels differ${
        result.frozen ? ' with the animation frozen' : ''
      }`
    )
  }
  // Room outside the box is judged against whether the source needs any. The
  // canvas is sized to hold each frame before drawing it, so what is being
  // checked is that it found the reach rather than that it was told: too little
  // clips the overflow it exists to carry, and looks from the outside exactly
  // like a frame placed wrong.
  const [reachX, reachY] = result.painted.reach
  if (result.painted.transformed && (reachX <= 0 || reachY <= 0)) {
    failures.push(`${result.name}: canvas is not painting outside its layout box`)
  }
  if (result.painted.transformed && result.painted.outgrown) {
    failures.push(`${result.name}: the paint ran out of canvas`)
  }
}
if (flow.mirror > 1) {
  failures.push(
    `flow: the mirror's neighbour moved ${flow.mirror.toFixed(1)}px while the source turned`
  )
}

if (failures.length === 0) {
  console.log(
    'ok: every mirror landed on its source, painted past its box, and moved nothing beside it'
  )
} else {
  for (const failure of failures) console.log(`FAIL ${failure}`)
}
