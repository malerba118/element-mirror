import { chromium, firefox, webkit } from 'playwright'

/**
 * Whether the three declarations the mirror sizes itself with agree across
 * engines: `contain: size layout`, an `aspect-ratio`, and the source's size as
 * `contain-intrinsic-size` (see `sizing` in element-mirror.tsx).
 *
 * The contract is an <img>'s: left alone, the source's own size; given one
 * dimension, the other follows the ratio; given both, both are obeyed. This
 * asks each engine what it actually does, against a real <img> with the same
 * intrinsic size as the control.
 *
 *   node .perf/sizing-matrix.mjs
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

const html = `<!doctype html><html><head><style>
  body { margin: 0; font: 12px system-ui; }
  .mirror { display: inline-block; vertical-align: bottom;
            contain: size layout;
            aspect-ratio: ${WIDTH} / ${HEIGHT};
            contain-intrinsic-size: ${WIDTH}px ${HEIGHT}px; }
  .row { padding: 4px; }
</style></head><body>
  ${CASES.map(
    (unit, index) => `<div class="row">
      <span class="mirror" id="m${index}" style="${unit.style}"></span>
      <img id="i${index}" style="${unit.style}" alt="" />
    </div>`
  ).join('')}
</body></html>`

// A real image with the same intrinsic size, as the control the contract names.
const png = (w, h) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"></svg>`
  ).toString('base64')}`

const results = {}
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  await page.evaluate(
    ({ source, count }) => {
      for (let index = 0; index < count; index += 1) {
        document.getElementById(`i${index}`).src = source
      }
    },
    { source: png(WIDTH, Math.round(HEIGHT)), count: CASES.length }
  )
  await page.waitForTimeout(300)

  results[name] = await page.evaluate((count) => {
    const read = (id) => {
      const box = document.getElementById(id).getBoundingClientRect()
      return [+box.width.toFixed(1), +box.height.toFixed(1)]
    }
    const rows = []
    for (let index = 0; index < count; index += 1) {
      rows.push({ mirror: read(`m${index}`), image: read(`i${index}`) })
    }
    return rows
  }, CASES.length)

  await browser.close()
}

const near = (a, b) => Math.abs(a - b) < 1.5
const show = ([w, h]) => `${w}x${h}`

let failures = 0
for (const [index, unit] of CASES.entries()) {
  console.log(`\n${unit.name}  (contract says ${show(unit.expect.map((v) => +v.toFixed(1)))})`)
  for (const engine of Object.keys(results)) {
    const { mirror, image } = results[engine][index]
    const ok = near(mirror[0], unit.expect[0]) && near(mirror[1], unit.expect[1])
    const matchesImage = near(mirror[0], image[0]) && near(mirror[1], image[1])
    if (!ok) failures += 1
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${engine.padEnd(9)} ` +
        `mirror ${show(mirror).padEnd(14)} <img> ${show(image).padEnd(14)} ` +
        `${matchesImage ? 'agrees with the image' : 'DIFFERS from the image'}`
    )
  }
}

console.log(
  `\n${failures ? `${failures} engine/case combinations break the contract` : 'every engine keeps the contract'}`
)
