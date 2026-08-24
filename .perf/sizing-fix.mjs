import { chromium, firefox, webkit } from 'playwright'

/**
 * A candidate fix for the single-definite-axis sizing cases, tested against the
 * same contract `.perf/sizing-matrix.mjs` measures.
 *
 * `contain: size` plus `aspect-ratio` plus `contain-intrinsic-size` asks the
 * engine to infer replaced-element sizing from three separate declarations, and
 * the engines disagree about whether the ratio or the intrinsic size wins on a
 * free axis. A replaced element does not need inferring: it has an intrinsic
 * size and ratio and every engine already implements the algorithm for it. So
 * put one in flow, sized to the source, and let it hold the box open — the
 * painting canvas stays out of flow, which is what the overflow paint needs.
 *
 * `canvas` and `img` are both tried as the in-flow anchor: a canvas carries its
 * intrinsic size in attributes and needs no resource at all.
 *
 *   node .perf/sizing-fix.mjs
 */

const WIDTH = 360
const HEIGHT = 147.717

const CASES = [
  { name: 'no size given', style: '', expect: [WIDTH, HEIGHT] },
  {
    name: 'width only',
    style: 'width: 220px; height: auto;',
    expect: [220, (220 * HEIGHT) / WIDTH],
  },
  {
    name: 'height only',
    style: 'height: 100px; width: auto;',
    expect: [(100 * WIDTH) / HEIGHT, 100],
  },
  {
    name: 'both given',
    style: 'width: 320px; height: 120px;',
    expect: [320, 120],
  },
]

const svg = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${Math.round(HEIGHT)}"></svg>`
).toString('base64')}`

const html = `<!doctype html><html><head><style>
  body { margin: 0; font: 12px system-ui; }

  /* What ships today. */
  .contained { display: inline-block; vertical-align: bottom;
               contain: size layout;
               aspect-ratio: ${WIDTH} / ${HEIGHT};
               contain-intrinsic-size: ${WIDTH}px ${HEIGHT}px; }

  /* The candidate: layout containment only, box held open by a replaced
     element in flow that the page's own width/height constrain. */
  .anchored { display: inline-block; vertical-align: bottom; contain: layout; }
  .anchor { display: block; max-width: 100%; max-height: 100%;
            width: auto; height: auto; visibility: hidden; }
  .paint { position: absolute; pointer-events: none; }
  .row { padding: 3px; }
</style></head><body>
  ${CASES.map(
    (unit, index) => `<div class="row">
      <span class="contained" id="today${index}" style="${unit.style}"></span>
      <span class="anchored" id="canvas${index}" style="${unit.style}"
        ><canvas class="anchor" width="${WIDTH}" height="${Math.round(HEIGHT)}"></canvas
        ><canvas class="paint"></canvas></span>
      <span class="anchored" id="image${index}" style="${unit.style}"
        ><img class="anchor" src="${svg}" alt=""
        ><canvas class="paint"></canvas></span>
      <span class="anchored" id="svg${index}" style="${unit.style}"
        ><svg class="anchor" width="${WIDTH}" height="${HEIGHT}"></svg
        ><canvas class="paint"></canvas></span>
      <img id="control${index}" src="${svg}" style="${unit.style}" alt="" />
    </div>`
  ).join('')}
</body></html>`

const VARIANTS = ['today', 'canvas', 'image', 'svg', 'control']

const results = {}
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  await page.waitForTimeout(400)
  results[name] = await page.evaluate(
    ({ count, variants }) => {
      const read = (id) => {
        const box = document.getElementById(id).getBoundingClientRect()
        return [+box.width.toFixed(1), +box.height.toFixed(1)]
      }
      const rows = []
      for (let index = 0; index < count; index += 1) {
        const row = {}
        for (const variant of variants) row[variant] = read(`${variant}${index}`)
        rows.push(row)
      }
      return rows
    },
    { count: CASES.length, variants: VARIANTS }
  )
  await browser.close()
}

const near = (a, b) => Math.abs(a - b) < 1.5
const show = ([w, h]) => `${w}x${h}`
const tally = Object.fromEntries(VARIANTS.map((name) => [name, 0]))

for (const [index, unit] of CASES.entries()) {
  console.log(
    `\n${unit.name} — contract says ${show(unit.expect.map((v) => +v.toFixed(1)))}`
  )
  for (const engine of Object.keys(results)) {
    const row = results[engine][index]
    const cells = VARIANTS.map((variant) => {
      const value = row[variant]
      const ok = near(value[0], unit.expect[0]) && near(value[1], unit.expect[1])
      if (!ok) tally[variant] += 1
      return `${variant} ${ok ? ' ' : '!'}${show(value).padEnd(13)}`
    })
    console.log(`  ${engine.padEnd(9)} ${cells.join(' ')}`)
  }
}

console.log('\nbroken cases out of 12 (4 cases x 3 engines):')
for (const variant of VARIANTS) {
  console.log(`  ${variant.padEnd(9)} ${tally[variant]}`)
}
