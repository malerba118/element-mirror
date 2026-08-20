import { chromium } from 'playwright'

/**
 * Asks what a capture does with a transform on the source itself, against
 * /transform-test, which exists for this script.
 *
 * A motion blur built from delayed mirrors reproduces the source's past
 * positions by stamping a transform on each sample, so it has to know which
 * parts of the live transform the capture already baked into the bitmap and
 * which are ours to re-apply. The engine strips translate from the clone root
 * and keeps scale/skew, so the expectation is: translation ours, scale and
 * rotation already in the pixels.
 *
 * Three columns decide whether the samples can be aligned at all:
 *
 * - BLEED: bitmap size over the source's transformed box, in source pixels. A
 *   bitmap wider than the box it depicts offsets the ink inside it.
 * - INSET: where the ink actually starts, which should equal the bleed.
 * - BOX ERR: the canvas's CSS box against the box it is depicting. A canvas
 *   declares an intrinsic size but its aspect ratio still comes from the
 *   bitmap, so a bled bitmap lays the mirror out the wrong shape.
 *
 *   node .perf/transform.mjs
 *
 * Needs the dev server up: `pnpm dev`.
 */

const PAGE = process.env.MIRROR_URL ?? 'http://localhost:5173/transform-test'

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1100, height: 900 },
  deviceScaleFactor: 1,
})
await page.goto(PAGE, { waitUntil: 'networkidle' })

// Mirrors below the fold have not captured yet.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1200)

const report = await page.evaluate(() => {
  const isRed = (r, g, b) => r > 150 && g < 110 && b < 110
  const round = (value) => Math.round(value * 10) / 10

  return Array.from(document.querySelectorAll('[data-case]')).map((row) => {
    const source = row.querySelector('[data-role="source"]')
    const canvas = row.querySelector('canvas')
    const dpr = Number(row.dataset.dpr)
    const rect = source.getBoundingClientRect()
    const box = canvas.getBoundingClientRect()

    const measurement = {
      name: row.dataset.case,
      dpr,
      // The transformed box on the page: what the mirror depicts and declares
      // as its intrinsic size.
      sourceRect: [round(rect.width), round(rect.height)],
      bitmap: [canvas.width, canvas.height],
      cssBox: [round(box.width), round(box.height)],
      bleed: [
        round(canvas.width / dpr - rect.width),
        round(canvas.height / dpr - rect.height),
      ],
      boxError: [round(box.width - rect.width), round(box.height - rect.height)],
      // Same instant, no reference to the live source: the box the mirror was
      // told the frame depicts (its declared intrinsic width) against the box
      // the bitmap actually depicts (its own size, less the bleed). These come
      // from two reads of the source inside one capture, so a source that moved
      // between them makes the mirror draw the frame into the wrong-sized box.
      sizeSkew: round(box.width - (canvas.width / dpr - 4)),
    }

    const { data } = canvas
      .getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height)

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let redX = 0
    let redY = 0
    let redCount = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] <= 16) continue
      const pixel = index / 4
      const x = pixel % canvas.width
      const y = Math.floor(pixel / canvas.width)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (isRed(data[index], data[index + 1], data[index + 2])) {
        redX += x
        redY += y
        redCount += 1
      }
    }

    const inked = minX !== Infinity
    // Everything below in source pixels, so cases are comparable across ratios.
    measurement.ink = inked
      ? [round((maxX - minX + 1) / dpr), round((maxY - minY + 1) / dpr)]
      : null
    measurement.inset = inked ? [round(minX / dpr), round(minY / dpr)] : null
    measurement.marker = redCount
      ? [round(redX / redCount / dpr), round(redY / redCount / dpr)]
      : null
    return measurement
  })
})

/**
 * The same question while the source is moving, which is the one a motion blur
 * depends on: a capture reads the source's box, then its styles, then hands an
 * SVG to the rasterizer, and an element that moves across those reads could
 * land inconsistent with the viewBox built to hold it.
 *
 * Checked without reading the source's rect, since nothing outside the loop can
 * read it at the moment the capture did. Two self-consistent invariants stand
 * in: the bled border must stay clear of ink (ink touching the bitmap's edge is
 * clipping), and the ink must fill the bitmap less the 2px bleed on each side.
 */
const motion = await page.evaluate(async (bleed) => {
  const rows = Array.from(document.querySelectorAll('[data-animated]')).map(
    (row) => ({
      name: row.dataset.animated,
      canvas: row.querySelector('canvas'),
      samples: 0,
      distinct: 0,
      clipped: 0,
      shortfall: [0, 0],
      skew: 0,
      offCenter: 0,
      markerMissing: 0,
      sizes: new Set(),
      last: '',
    })
  )

  const deadline = performance.now() + 2400
  while (performance.now() < deadline) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    for (const row of rows) {
      const canvas = row.canvas
      if (!canvas.width || getComputedStyle(canvas).visibility === 'hidden') {
        continue
      }
      const { width, height } = canvas
      const { data } = canvas.getContext('2d').getImageData(0, 0, width, height)

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let red = 0
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] <= 16) continue
        const pixel = index / 4
        const x = pixel % width
        const y = Math.floor(pixel / width)
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        if (data[index] > 150 && data[index + 1] < 110 && data[index + 2] < 110) {
          red += 1
        }
      }
      if (minX === Infinity) continue

      row.samples += 1
      const signature = `${width}x${height}:${minX},${minY},${maxX},${maxY}`
      if (signature !== row.last) {
        row.distinct += 1
        row.last = signature
      }
      row.sizes.add(`${width}x${height}`)
      // Ink on the outermost row or column means the viewBox was too small for
      // what got painted into it.
      if (minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1) {
        row.clipped += 1
      }
      const expected = [width - bleed, height - bleed]
      const actual = [maxX - minX + 1, maxY - minY + 1]
      row.shortfall = [
        Math.max(row.shortfall[0], expected[0] - actual[0]),
        Math.max(row.shortfall[1], expected[1] - actual[1]),
      ]
      if (red === 0) row.markerMissing += 1

      // The box the mirror lays the frame out in, against the box the bitmap
      // depicts. Width only: the height is confounded by a canvas taking its
      // aspect ratio from the bitmap.
      const laidOut = canvas.getBoundingClientRect().width
      row.skew = Math.max(row.skew, Math.abs(laidOut - (width - bleed)))

      // Whether the ink sits centred in its bitmap: the pad the engine adds is
      // only cancellable by a caller who draws centre-on-centre if the gaps on
      // opposite sides stay equal. Independent of knowing what the pad is.
      row.offCenter = Math.max(
        row.offCenter,
        Math.abs(minX - (width - 1 - maxX)),
        Math.abs(minY - (height - 1 - maxY))
      )
    }
  }

  return rows.map((row) => {
    const reported = { ...row, distinctSizes: row.sizes.size }
    // The scratch canvas and the frames read through it stay in the page.
    delete reported.canvas
    delete reported.last
    delete reported.sizes
    return reported
  })
}, 4)

await browser.close()

const pair = (value) => (value ? value.join('x') : '-')
console.log(
  [
    'CASE'.padEnd(15),
    'DPR',
    'SRC BOX',
    'BITMAP',
    'INK',
    'BLEED',
    'INSET',
    'BOX ERR',
    'SKEW',
    'MARKER',
  ].join('\t')
)
for (const row of report) {
  console.log(
    [
      row.name.padEnd(15),
      row.dpr,
      pair(row.sourceRect),
      pair(row.bitmap),
      pair(row.ink),
      row.bleed.join(','),
      row.inset ? row.inset.join(',') : '-',
      row.boxError.join(','),
      row.sizeSkew,
      row.marker ? row.marker.join(',') : '-',
    ].join('\t')
  )
}

console.log()
const failures = []
for (const row of report) {
  const label = `${row.name}@${row.dpr}x`
  if (!row.ink) {
    failures.push(`${label}: no frame`)
    continue
  }
  // The ink is the transformed element, so it should fill the box the source
  // occupies on the page whatever the transform was.
  const [inkWidth, inkHeight] = row.ink
  const [boxWidth, boxHeight] = row.sourceRect
  const off = [
    Math.abs(inkWidth - boxWidth),
    Math.abs(inkHeight - boxHeight),
  ]
  const verdict = []
  if (off[0] > 2 || off[1] > 2) {
    verdict.push(`ink ${inkWidth}x${inkHeight} but source box ${boxWidth}x${boxHeight}`)
  }
  if (!row.marker) verdict.push('marker missing from the capture')
  if (Math.abs(row.boxError[0]) > 1 || Math.abs(row.boxError[1]) > 1) {
    verdict.push(`laid out ${row.boxError.join(',')} off the source's box`)
  }
  if (verdict.length > 0) failures.push(`${label}: ${verdict.join('; ')}`)
}

console.log()
console.log(
  [
    'MOVING'.padEnd(15),
    'FRAMES',
    'BITMAPS',
    'CLIPPED',
    'SHORT BY',
    'SKEW',
    'OFF CENTRE',
    'NO MARKER',
  ].join('\t')
)
for (const row of motion) {
  console.log(
    [
      row.name.padEnd(15),
      `${row.distinct}/${row.samples}`,
      row.distinctSizes,
      row.clipped,
      row.shortfall.join(','),
      Math.round(row.skew * 10) / 10,
      row.offCenter,
      row.markerMissing,
    ].join('\t')
  )
}

for (const row of motion) {
  if (row.samples === 0) {
    failures.push(`${row.name}: never captured while animating`)
    continue
  }
  if (row.clipped > 0) {
    failures.push(
      `${row.name}: ink reached the bitmap's edge on ${row.clipped}/${row.samples} frames`
    )
  }
  // A frame short of its viewBox by more than a pixel of antialiasing is a
  // capture whose contents and box disagree.
  if (row.shortfall[0] > 2 || row.shortfall[1] > 2) {
    failures.push(
      `${row.name}: ink fell short of its viewBox by ${row.shortfall.join(',')}`
    )
  }
  if (row.markerMissing > 0) {
    failures.push(
      `${row.name}: marker missing on ${row.markerMissing}/${row.samples} frames`
    )
  }
  // A caller placing frames centre-on-centre needs no knowledge of the pad,
  // but only while the pad stays even. Two device pixels of tolerance, since
  // the ink's edges are antialiased and its box is fractional.
  if (row.offCenter > 2) {
    failures.push(
      `${row.name}: ink sat up to ${row.offCenter}px off the bitmap's centre`
    )
  }
}

console.log()
if (failures.length === 0) {
  console.log('ok: every transform arrived, moving or still, and every mirror laid out as its source')
} else {
  for (const failure of failures) console.log(`FAIL ${failure}`)
}
