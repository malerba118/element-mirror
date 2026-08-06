import puppeteer from 'puppeteer-core'

/**
 * Why an inline <svg> is expensive to capture.
 *
 * The screenshot library rasterizes each svg by cloning it, inlining every rule
 * of every stylesheet on the page into the clone, serialising that to a blob and
 * decoding it as an image. This prices each of those steps.
 */

const CHROME =
  '/Users/frostin/.cache/puppeteer/chrome/mac_arm-138.0.7204.157/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
})
const page = await browser.newPage()
await page.goto('http://localhost:5200/', { waitUntil: 'networkidle2' })

const result = await page.evaluate(async () => {
  const gather = () => {
    let cssText = ''
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          cssText += rule.cssText + '\n'
        }
      } catch {
        // cross-origin
      }
    }
    return cssText
  }

  let rules = 0
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      rules += sheet.cssRules.length
    } catch {
      // cross-origin
    }
  }

  // Cost of collecting the page's CSS, which happens once per svg.
  const gatherStart = performance.now()
  const cssText = gather()
  const gatherMs = performance.now() - gatherStart

  // Cost of rasterising one small svg carrying that CSS, versus carrying none.
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '32')
  icon.setAttribute('height', '32')
  icon.innerHTML =
    '<path d="M5 3l14 9-14 9z" fill="none" stroke="black" stroke-width="2"/>'

  const rasterise = async (withCss) => {
    const clone = icon.cloneNode(true)
    if (withCss) {
      const style = document.createElement('style')
      style.textContent = cssText
      clone.insertBefore(style, clone.firstChild)
    }
    const text = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([text], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    const started = performance.now()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = url
    })
    const elapsed = performance.now() - started
    URL.revokeObjectURL(url)
    return { ms: elapsed, bytes: text.length }
  }

  const runs = { withCss: [], without: [] }
  for (let index = 0; index < 6; index += 1) {
    runs.withCss.push(await rasterise(true))
    runs.without.push(await rasterise(false))
  }

  const mean = (list, key) =>
    list.reduce((total, row) => total + row[key], 0) / list.length

  return {
    rules,
    cssBytes: cssText.length,
    gatherMs,
    withCssMs: mean(runs.withCss, 'ms'),
    withCssBytes: runs.withCss[0].bytes,
    withoutMs: mean(runs.without, 'ms'),
    withoutBytes: runs.without[0].bytes,
  }
})

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`

console.log(`\npage CSS: ${result.rules} rules, ${kb(result.cssBytes)}`)
console.log(`\nper svg, per capture:`)
console.log(
  `  collecting the page's CSS        ${result.gatherMs.toFixed(2)}ms`
)
console.log(
  `  decoding it with that CSS inlined ${result.withCssMs.toFixed(2)}ms  (${kb(result.withCssBytes)} of svg)`
)
console.log(
  `  decoding it with no CSS inlined   ${result.withoutMs.toFixed(2)}ms  (${kb(result.withoutBytes)} of svg)`
)
console.log(
  `\n  so inlining the CSS costs about ${(result.gatherMs + result.withCssMs - result.withoutMs).toFixed(2)}ms of the ${(result.gatherMs + result.withCssMs).toFixed(2)}ms total`
)

await browser.close()
