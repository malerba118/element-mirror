import { chromium, firefox, webkit } from 'playwright'

/**
 * Who computes what for the wrapper's sizing declarations, engine by engine.
 *
 * The wrapper wants replaced-element sizing: unsized takes the source's own
 * size, one given dimension derives the other through the ratio, both are
 * obeyed. Each variant is a candidate way to declare that, measured against
 * a real <img> in the four sizing cases.
 *
 *   node .perf/sizing-probe.mjs
 */

const RATIO = '360/147.7'
const CIS = '360px 147.7px'

/** Candidate declarations for the wrapper. */
const VARIANTS = {
  img: null, // the reference: a real <img> with natural size 360x147.7
  current: `contain:size layout;aspect-ratio:${RATIO};contain-intrinsic-size:${CIS}`,
  'no cis': `contain:size layout;aspect-ratio:${RATIO}`,
  'cis width only': `contain:size layout;aspect-ratio:${RATIO};contain-intrinsic-width:360px`,
  'cis height only': `contain:size layout;aspect-ratio:${RATIO};contain-intrinsic-height:147.7px`,
}

const CASES = {
  unsized: '',
  'width 220': 'width:220px',
  'height 60': 'height:60px',
  'both 320x120': 'width:320px;height:120px',
}

const SRC = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='147.7'%3E%3C/svg%3E`

const body = []
for (const [variant, declaration] of Object.entries(VARIANTS)) {
  for (const [label, size] of Object.entries(CASES)) {
    const id = `${variant}|${label}`
    if (declaration === null) {
      body.push(
        `<div><img data-probe="${id}" style="display:inline-block;${size}" src="${SRC}"></div>`
      )
    } else {
      body.push(
        `<div><span data-probe="${id}" style="display:inline-block;${declaration};${size}"><i style="position:absolute;width:500px;height:500px"></i></span></div>`
      )
    }
  }
}

const HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0">${body.join('\n')}</body>`

const results = {}
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser
  try {
    browser = await engine.launch()
  } catch (error) {
    console.log(`${name}: could not launch — ${error.message.split('\n')[0]}`)
    continue
  }
  const page = await browser.newPage()
  await page.setContent(HTML)
  await page.waitForTimeout(100)
  results[name] = await page.evaluate(() => {
    const sizes = {}
    for (const element of document.querySelectorAll('[data-probe]')) {
      const box = element.getBoundingClientRect()
      sizes[element.dataset.probe] = `${box.width.toFixed(1)}x${box.height.toFixed(1)}`
    }
    return sizes
  })
  await browser.close()
}

const engines = Object.keys(results)
for (const variant of Object.keys(VARIANTS)) {
  console.log(`\n${variant}`)
  for (const label of Object.keys(CASES)) {
    const id = `${variant}|${label}`
    const row = engines
      .map((engine) => `${engine} ${results[engine][id].padEnd(12)}`)
      .join(' ')
    console.log(`  ${label.padEnd(14)} ${row}`)
  }
}
